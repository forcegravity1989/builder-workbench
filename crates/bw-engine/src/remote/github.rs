use super::{
    Capped, IssueFilter, IssueState, IssueStateEvent, PrOpened, RemoteError, RemoteIssue,
    RemoteProvider, RepoSummary, PROJECT_FILE_REL_PATH,
};
use crate::win_cmd::stderr_text;
use std::{path::Path, process::Stdio};

#[derive(Debug, thiserror::Error)]
pub enum GithubError {
    #[error("gh 未安装或不在 PATH")]
    NotInstalled,
    #[error("gh 命令失败:{0}")]
    Command(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GithubRepoSummary {
    pub owner: String,
    pub repo: String,
    pub private: bool,
    /// 远端仓库描述；空串表示未填写。
    pub description: String,
    /// 默认分支名(如 `main`)—— `defaultBranchRef.name`;空 = 空仓无提交这类
    /// 边缘情况下 gh 拿不到,如实留白。
    pub default_branch: String,
    /// 最近一次 push 的 ISO8601 时间戳(`pushedAt`);空 = gh 未回(同上边缘
    /// 情况),不臆造一个时间。
    pub pushed_at: String,
}

fn spawn_err(e: std::io::Error) -> GithubError {
    if e.kind() == std::io::ErrorKind::NotFound {
        GithubError::NotInstalled
    } else {
        GithubError::Command(e.to_string())
    }
}

pub async fn probe_repo(owner_repo: &str) -> Result<String, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "repo",
            "view",
            owner_repo,
            "--json",
            "nameWithOwner,isPrivate,pushedAt",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let v: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("解析 gh repo view 输出失败:{e}")))?;
    let name = v["nameWithOwner"].as_str().unwrap_or(owner_repo);
    let vis = if v["isPrivate"].as_bool().unwrap_or(true) {
        "private"
    } else {
        "public"
    };
    let pushed = v["pushedAt"].as_str().unwrap_or("未知");
    Ok(format!("{name} · {vis} · 最近推送 {pushed}"))
}

pub async fn clone_repo(owner: &str, repo: &str, dest: &Path) -> Result<(), GithubError> {
    let owner_repo = format!("{owner}/{repo}");
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(["repo", "clone", &owner_repo, &dest.to_string_lossy()])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    Ok(())
}

pub async fn create_pr_on_branch(
    workspace: &Path,
    branch: &str,
    title: &str,
    body: &str,
) -> Result<PrOpened, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .current_dir(workspace)
        .args([
            "pr", "create", "--head", branch, "--title", title, "--body", body,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        let stderr = stderr_text(&output);
        if stderr.contains("already exists") {
            match adopt_existing_pr(workspace, branch).await {
                Ok(pr) => return Ok(PrOpened::Adopted(pr)),
                Err(_) => return Err(GithubError::Command(stderr)),
            }
        }
        return Err(GithubError::Command(stderr));
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    url.rsplit('/')
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .map(PrOpened::Created)
        .ok_or_else(|| GithubError::Command(format!("无法从 gh 输出解析 PR 号:{url:?}")))
}

/// P7-7A helper: read back the **real** PR number already open on `branch` —
/// called only from `open_pr`'s "already exists" adoption path. `gh pr view
/// <branch>` resolves the repo from `workspace`'s origin remote, same as the
/// `gh pr create` call that just failed, so this asks the same repo the same
/// question `gh` itself just answered in its error message — but by an
/// independent read, not by parsing that error text.
async fn adopt_existing_pr(workspace: &Path, branch: &str) -> Result<u32, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .current_dir(workspace)
        .args(["pr", "view", branch, "--json", "number", "--jq", ".number"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .map_err(|_| GithubError::Command("认领已存在 PR 时读回号码失败".to_string()))
}

pub async fn merge_pr(owner_repo: &str, pr_number: u32) -> Result<(), GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "pr",
            "merge",
            &pr_number.to_string(),
            "--repo",
            owner_repo,
            "--squash",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    let merge_stderr = stderr_text(&output);
    if !output.status.success() {
        return Err(GithubError::Command(merge_stderr));
    }
    let verify = crate::win_cmd::tokio_cmd("gh")
        .args([
            "pr",
            "view",
            &pr_number.to_string(),
            "--repo",
            owner_repo,
            "--json",
            "state",
            "--jq",
            ".state",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !verify.status.success() {
        return Err(GithubError::Command(format!(
            "merge 后读回 PR 状态失败:{} | merge stderr: {merge_stderr}",
            stderr_text(&verify)
        )));
    }
    let state = String::from_utf8_lossy(&verify.stdout).trim().to_string();
    if state.eq_ignore_ascii_case("MERGED") {
        Ok(())
    } else {
        Err(GithubError::Command(format!(
            "merge 未生效(PR state={state},应 MERGED):{merge_stderr}"
        )))
    }
}

pub async fn open_pr_for_branch(
    owner_repo: &str,
    head_branch: &str,
) -> Result<Option<u32>, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "pr",
            "list",
            "--repo",
            owner_repo,
            "--head",
            head_branch,
            "--state",
            "open",
            "--json",
            "number",
            "--jq",
            ".[0].number // empty",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    text.parse::<u32>()
        .map(Some)
        .map_err(|_| GithubError::Command(format!("无法解析 PR 号:{text:?}")))
}

pub async fn pr_for_branch(
    owner_repo: &str,
    head_branch: &str,
) -> Result<Option<u32>, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "pr",
            "list",
            "--repo",
            owner_repo,
            "--head",
            head_branch,
            "--state",
            "all",
            "--json",
            "number",
            "--jq",
            ".[0].number // empty",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Ok(None);
    }
    text.parse::<u32>()
        .map(Some)
        .map_err(|_| GithubError::Command(format!("无法解析 PR 号:{text:?}")))
}

/// C16: `defaultBranchRef` comes back as a nested object (`{"name":"main"}`),
/// not a bare string — `gh repo list --json defaultBranchRef` shape per its
/// own JSON FIELDS reference (`gh repo list --help`). An empty repo with no
/// commits has no default branch ref at all, hence `Option`.
#[derive(serde::Deserialize)]
struct DefaultBranchRefJson {
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepoJson {
    name_with_owner: String,
    is_private: bool,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    default_branch_ref: Option<DefaultBranchRefJson>,
    #[serde(default)]
    pushed_at: Option<String>,
}

pub async fn list_repos(limit: u32) -> Result<Vec<GithubRepoSummary>, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "repo",
            "list",
            "--json",
            "nameWithOwner,isPrivate,description,defaultBranchRef,pushedAt",
            "--limit",
            &limit.to_string(),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let rows: Vec<RepoJson> = serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("解析 gh repo list 输出失败:{e}")))?;
    Ok(rows
        .into_iter()
        .filter_map(|r| {
            let (owner, repo) = r.name_with_owner.split_once('/')?;
            Some(GithubRepoSummary {
                owner: owner.to_string(),
                repo: repo.to_string(),
                private: r.is_private,
                description: r.description.unwrap_or_default(),
                default_branch: r.default_branch_ref.map(|b| b.name).unwrap_or_default(),
                pushed_at: r.pushed_at.unwrap_or_default(),
            })
        })
        .collect())
}

pub async fn fetch_project_toml(
    owner: &str,
    repo: &str,
    git_ref: &str,
) -> Result<Option<String>, GithubError> {
    let git_ref = if git_ref.trim().is_empty() {
        "main"
    } else {
        git_ref.trim()
    };
    let endpoint = format!(
        "repos/{owner}/{repo}/contents/{}?ref={git_ref}",
        PROJECT_FILE_REL_PATH
    );
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(["api", "-H", "Accept: application/vnd.github.raw", &endpoint])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        let err = stderr_text(&output);
        let lower = err.to_lowercase();
        if lower.contains("no commit found for the ref") {
            return Err(GithubError::Command(err));
        }
        if lower.contains("404") || lower.contains("not found") {
            return Ok(None);
        }
        return Err(GithubError::Command(err));
    }
    Ok(Some(
        String::from_utf8_lossy(&output.stdout).trim().to_string(),
    ))
}

// 一次读取时间记录，由上层按时间窗计算；期末未关闭数需要完整的创建与关闭时间。

pub const LIST_CAP: u32 = 1000;

pub async fn merged_pr_times(owner_repo: &str) -> Result<Vec<String>, GithubError> {
    let rows: Vec<GhMergedPrJson> =
        gh_list_json(owner_repo, &["pr", "list", "--state", "merged"], "mergedAt").await?;
    Ok(rows.into_iter().filter_map(|r| r.merged_at).collect())
}

pub async fn issue_times(owner_repo: &str) -> Result<Vec<(String, Option<String>)>, GithubError> {
    let rows: Vec<GhIssueTimeJson> = gh_list_json(
        owner_repo,
        &["issue", "list", "--state", "all"],
        "createdAt,closedAt",
    )
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| (r.created_at, r.closed_at))
        .collect())
}

#[derive(serde::Deserialize)]
struct GhMergedPrJson {
    #[serde(rename = "mergedAt")]
    merged_at: Option<String>,
}

#[derive(serde::Deserialize)]
struct GhIssueTimeJson {
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "closedAt")]
    closed_at: Option<String>,
}

async fn gh_list_json<T: serde::de::DeserializeOwned>(
    owner_repo: &str,
    subcommand: &[&str],
    fields: &str,
) -> Result<Vec<T>, GithubError> {
    let cap = LIST_CAP.to_string();
    let mut args: Vec<&str> = subcommand.to_vec();
    args.extend_from_slice(&["--repo", owner_repo, "--limit", &cap, "--json", fields]);
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("无法解析 gh {} JSON:{e}", subcommand.join(" "))))
}

pub async fn create_issue(
    owner_repo: &str,
    title: &str,
    body: &str,
    labels: &[&str],
) -> Result<u32, GithubError> {
    let mut args: Vec<&str> = vec![
        "issue", "create", "--repo", owner_repo, "--title", title, "--body", body,
    ];
    for l in labels {
        args.push("--label");
        args.push(l);
    }
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    url.rsplit('/')
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .ok_or_else(|| GithubError::Command(format!("无法从 gh 输出解析 issue 号:{url:?}")))
}

/// 按标签命名空间替换，仅修改命中前缀的标签。
pub async fn update_issue(
    owner_repo: &str,
    number: u32,
    labels: Option<&[&str]>,
    state_event: Option<crate::remote::IssueStateEvent>,
) -> Result<(), GithubError> {
    let num_s = number.to_string();
    if let Some(lbls) = labels {
        if !lbls.is_empty() {
            let view = crate::win_cmd::tokio_cmd("gh")
                .args([
                    "issue",
                    "view",
                    &num_s,
                    "--repo",
                    owner_repo,
                    "--json",
                    "labels",
                    "--jq",
                    ".labels[].name",
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(spawn_err)?;
            if !view.status.success() {
                return Err(GithubError::Command(stderr_text(&view)));
            }
            let current: Vec<String> = String::from_utf8_lossy(&view.stdout)
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            let input_prefixes: std::collections::HashSet<&str> = lbls
                .iter()
                .filter_map(|&l| crate::remote::label_prefix(l))
                .collect();
            let current_set: std::collections::HashSet<&str> =
                current.iter().map(|s| s.as_str()).collect();
            let input_set: std::collections::HashSet<&str> = lbls.iter().copied().collect();
            // 相同标签保留，避免先删除再添加。
            let mut remove: Vec<&str> = Vec::new();
            for c in &current {
                if let Some(p) = crate::remote::label_prefix(c) {
                    if input_prefixes.contains(p) && !input_set.contains(c.as_str()) {
                        remove.push(c.as_str());
                    }
                }
            }
            // 已存在的标签不重复添加，gh 可能拒绝。
            let mut add: Vec<&str> = Vec::new();
            for l in crate::remote::filter_persistent_labels(lbls) {
                if !current_set.contains(l) {
                    add.push(l);
                }
            }
            if !remove.is_empty() || !add.is_empty() {
                let mut args: Vec<&str> = vec!["issue", "edit", &num_s, "--repo", owner_repo];
                for r in &remove {
                    args.push("--remove-label");
                    args.push(r);
                }
                for a in &add {
                    args.push("--add-label");
                    args.push(a);
                }
                let output = crate::win_cmd::tokio_cmd("gh")
                    .args(&args)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output()
                    .await
                    .map_err(spawn_err)?;
                if !output.status.success() {
                    return Err(GithubError::Command(stderr_text(&output)));
                }
            }
        }
    }
    if let Some(ev) = state_event {
        let sub = match ev {
            crate::remote::IssueStateEvent::Close => "close",
            crate::remote::IssueStateEvent::Reopen => "reopen",
        };
        let output = crate::win_cmd::tokio_cmd("gh")
            .args(["issue", sub, &num_s, "--repo", owner_repo])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(spawn_err)?;
        if !output.status.success() {
            return Err(GithubError::Command(stderr_text(&output)));
        }
    }
    Ok(())
}

pub async fn list_issues(
    owner_repo: &str,
    state: Option<&str>,
    labels: &[String],
) -> Result<Vec<crate::remote::RemoteIssue>, GithubError> {
    let mut args: Vec<String> = vec![
        "issue".into(),
        "list".into(),
        "--repo".into(),
        owner_repo.into(),
    ];
    let state_val = state.unwrap_or("all").to_string();
    args.push("--state".into());
    args.push(state_val);
    for l in labels {
        args.push("--label".into());
        args.push(l.clone());
    }
    args.push("--limit".into());
    args.push("200".into());
    args.push("--json".into());
    args.push("number,title,state,labels,createdAt,closedAt,assignees,author".into());
    let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(&arg_refs)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let rows: Vec<GhIssueFullJson> = serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("无法解析 gh issue list JSON:{e}")))?;
    Ok(rows
        .into_iter()
        .map(|r| crate::remote::RemoteIssue {
            iid: r.number,
            number: r.number,
            title: r.title,
            state: r.state,
            labels: r.labels.into_iter().map(|l| l.name).collect(),
            body: String::new(),
            created_at: r.created_at,
            closed_at: r.closed_at,
            assignee: first_login(&r.assignees),
            author: r.author.map(|p| p.login).filter(|s| !s.is_empty()),
        })
        .collect())
}

pub async fn view_issue(
    owner_repo: &str,
    number: u32,
) -> Result<crate::remote::RemoteIssue, GithubError> {
    let num_s = number.to_string();
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "issue",
            "view",
            &num_s,
            "--repo",
            owner_repo,
            "--json",
            "number,title,state,labels,body,createdAt,closedAt,assignees,author",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let r: GhIssueViewJson = serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("无法解析 gh issue view JSON:{e}")))?;
    Ok(crate::remote::RemoteIssue {
        iid: r.number,
        number: r.number,
        title: r.title,
        state: r.state,
        labels: r.labels.into_iter().map(|l| l.name).collect(),
        body: r.body.unwrap_or_default(),
        created_at: r.created_at,
        closed_at: r.closed_at,
        assignee: first_login(&r.assignees),
        author: r.author.map(|p| p.login).filter(|s| !s.is_empty()),
    })
}

pub async fn set_issue_assignee(
    owner_repo: &str,
    number: u32,
    assignee: &str,
) -> Result<(), GithubError> {
    let current = list_issue_assignees(owner_repo, number).await?;
    let keep = |a: &String| assignee.eq_ignore_ascii_case(a);
    let to_remove: Vec<&String> = current.iter().filter(|a| !keep(a)).collect();
    let need_add = !assignee.is_empty() && !current.iter().any(keep);
    if to_remove.is_empty() && !need_add {
        return Ok(());
    }

    let num_s = number.to_string();
    let mut args: Vec<&str> = vec!["issue", "edit", &num_s, "--repo", owner_repo];
    for old in &to_remove {
        args.push("--remove-assignee");
        args.push(old.as_str());
    }
    if need_add {
        args.push("--add-assignee");
        args.push(assignee);
    }
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    Ok(())
}

async fn list_issue_assignees(owner_repo: &str, number: u32) -> Result<Vec<String>, GithubError> {
    let num_s = number.to_string();
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "issue",
            "view",
            &num_s,
            "--repo",
            owner_repo,
            "--json",
            "assignees",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    #[derive(serde::Deserialize)]
    struct Assignees {
        #[serde(default)]
        assignees: Vec<GhPersonJson>,
    }
    let r: Assignees = serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("无法解析 gh issue view JSON:{e}")))?;
    Ok(r.assignees
        .into_iter()
        .map(|p| p.login)
        .filter(|s| !s.is_empty())
        .collect())
}

pub async fn current_user(owner_repo: &str) -> Result<String, GithubError> {
    let _ = owner_repo;
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(["api", "user", "--jq", ".login"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub async fn edit_issue(
    owner_repo: &str,
    number: u32,
    title: &str,
    body: &str,
) -> Result<(), GithubError> {
    let num_s = number.to_string();
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "issue", "edit", &num_s, "--repo", owner_repo, "--title", title, "--body", body,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhIssueViewJson {
    number: u32,
    title: String,
    state: String,
    #[serde(default)]
    labels: Vec<GhLabelJson>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    /// GitHub 返回 assignees 数组；产品使用单负责人，取第一项。
    #[serde(default)]
    assignees: Vec<GhPersonJson>,
    #[serde(default)]
    author: Option<GhPersonJson>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhIssueFullJson {
    number: u32,
    title: String,
    state: String,
    #[serde(default)]
    labels: Vec<GhLabelJson>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    assignees: Vec<GhPersonJson>,
    #[serde(default)]
    author: Option<GhPersonJson>,
}

#[derive(serde::Deserialize)]
struct GhPersonJson {
    #[serde(default)]
    login: String,
}

/// gh 仅支持复数 assignees 字段，取第一位负责人。
fn first_login(people: &[GhPersonJson]) -> Option<String> {
    people
        .iter()
        .map(|p| p.login.clone())
        .find(|s| !s.is_empty())
}

#[derive(serde::Deserialize)]
struct GhLabelJson {
    name: String,
}

pub async fn create_release(
    owner_repo: &str,
    tag: &str,
    title: &str,
    body: &str,
) -> Result<(), GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "release", "create", tag, "--repo", owner_repo, "--title", title, "--notes", body,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    Ok(())
}

pub async fn comment_issue(owner_repo: &str, number: u32, body: &str) -> Result<(), GithubError> {
    let num_s = number.to_string();
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "issue", "comment", &num_s, "--repo", owner_repo, "--body", body,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    Ok(())
}

pub async fn list_issue_comments(
    owner_repo: &str,
    number: u32,
) -> Result<Vec<String>, GithubError> {
    let path = format!("repos/{owner_repo}/issues/{number}/comments");
    let output = crate::win_cmd::tokio_cmd("gh")
        .args(["api", &path, "--jq", "[.[].body]"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let text = text.trim();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(text).map_err(|e| GithubError::Command(format!("解析 issue 评论失败:{e}")))
}

pub async fn list_releases(owner_repo: &str) -> Result<Vec<String>, GithubError> {
    let output = crate::win_cmd::tokio_cmd("gh")
        .args([
            "release", "list", "--repo", owner_repo, "--json", "tagName", "--limit", "200",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !output.status.success() {
        return Err(GithubError::Command(stderr_text(&output)));
    }
    let rows: Vec<GhReleaseJson> = serde_json::from_slice(&output.stdout)
        .map_err(|e| GithubError::Command(format!("无法解析 gh release list JSON:{e}")))?;
    Ok(rows.into_iter().map(|r| r.tag_name).collect())
}

#[derive(serde::Deserialize)]
struct GhReleaseJson {
    #[serde(rename = "tagName")]
    tag_name: String,
}

impl From<GithubError> for RemoteError {
    fn from(e: GithubError) -> Self {
        match e {
            GithubError::NotInstalled => RemoteError::NotInstalled { cli: "gh" },
            GithubError::Command(m) => RemoteError::Cli(m),
        }
    }
}

#[derive(Debug)]
pub(super) struct GithubRemote {
    owner_repo: String,
}

impl GithubRemote {
    pub(super) fn new(owner_repo: &str) -> Self {
        Self {
            owner_repo: owner_repo.to_string(),
        }
    }

    fn split(path: &str) -> Result<(&str, &str), RemoteError> {
        path.split_once('/')
            .filter(|(o, r)| !o.trim().is_empty() && !r.trim().is_empty())
            .ok_or_else(|| RemoteError::Cli(format!("「{path}」不是 owner/repo 的样子")))
    }
}

#[async_trait::async_trait]
impl RemoteProvider for GithubRemote {
    fn kind(&self) -> &'static str {
        "github"
    }

    async fn create_mr_on_branch(
        &self,
        workspace: &Path,
        branch: &str,
        title: &str,
        body: &str,
    ) -> Result<PrOpened, RemoteError> {
        Ok(create_pr_on_branch(workspace, branch, title, body).await?)
    }

    async fn merge_mr(&self, mr_number: u32) -> Result<(), RemoteError> {
        Ok(merge_pr(&self.owner_repo, mr_number).await?)
    }

    async fn open_mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(open_pr_for_branch(&self.owner_repo, branch).await?)
    }

    async fn mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(pr_for_branch(&self.owner_repo, branch).await?)
    }

    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<u32, RemoteError> {
        Ok(create_issue(&self.owner_repo, title, body, labels).await?)
    }

    /// gh 无对应附件参数，此实现忽略附件。
    async fn create_issue_with_attachment(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
        _attachment: Option<&Path>,
    ) -> Result<u32, RemoteError> {
        self.create_issue(title, body, labels).await
    }

    async fn update_issue(
        &self,
        iid: u32,
        labels: Option<&[&str]>,
        state_event: Option<IssueStateEvent>,
    ) -> Result<(), RemoteError> {
        Ok(update_issue(&self.owner_repo, iid, labels, state_event).await?)
    }

    async fn list_issues(&self, filter: &IssueFilter) -> Result<Vec<RemoteIssue>, RemoteError> {
        let state = filter.state.map(|s| match s {
            IssueState::Open => "open",
            IssueState::Closed => "closed",
        });
        Ok(list_issues(&self.owner_repo, state, &filter.labels).await?)
    }

    async fn view_issue(&self, iid: u32) -> Result<RemoteIssue, RemoteError> {
        Ok(view_issue(&self.owner_repo, iid).await?)
    }

    async fn comment_issue(&self, iid: u32, body: &str) -> Result<(), RemoteError> {
        Ok(comment_issue(&self.owner_repo, iid, body).await?)
    }

    async fn list_issue_comments(&self, iid: u32) -> Result<Vec<String>, RemoteError> {
        Ok(list_issue_comments(&self.owner_repo, iid).await?)
    }

    async fn set_issue_assignee(&self, iid: u32, assignee: &str) -> Result<(), RemoteError> {
        Ok(set_issue_assignee(&self.owner_repo, iid, assignee).await?)
    }

    async fn edit_issue(&self, iid: u32, title: &str, body: &str) -> Result<(), RemoteError> {
        Ok(edit_issue(&self.owner_repo, iid, title, body).await?)
    }

    async fn create_release(&self, tag: &str, title: &str, body: &str) -> Result<(), RemoteError> {
        Ok(create_release(&self.owner_repo, tag, title, body).await?)
    }

    async fn list_releases(&self) -> Result<Vec<String>, RemoteError> {
        Ok(list_releases(&self.owner_repo).await?)
    }

    async fn current_user(&self) -> Option<String> {
        current_user(&self.owner_repo).await.ok()
    }

    async fn merged_mr_times(&self) -> Result<Capped<String>, RemoteError> {
        let rows = merged_pr_times(&self.owner_repo).await?;
        Ok(Capped {
            truncated: rows.len() as u32 >= LIST_CAP,
            rows,
        })
    }

    async fn issue_times(&self) -> Result<Capped<(String, Option<String>)>, RemoteError> {
        let rows = issue_times(&self.owner_repo).await?;
        Ok(Capped {
            truncated: rows.len() as u32 >= LIST_CAP,
            rows,
        })
    }

    async fn list_repos(&self, limit: u32) -> Result<Vec<RepoSummary>, RemoteError> {
        Ok(list_repos(limit)
            .await?
            .into_iter()
            .map(|r| RepoSummary {
                path: format!("{}/{}", r.owner, r.repo),
                private: r.private,
                description: r.description,
                default_branch: r.default_branch,
                pushed_at: r.pushed_at,
            })
            .collect())
    }

    async fn probe_repo(&self, path: &str) -> Result<String, RemoteError> {
        Ok(probe_repo(path).await?)
    }

    async fn fetch_project_toml(
        &self,
        path: &str,
        git_ref: &str,
    ) -> Result<Option<String>, RemoteError> {
        let (owner, repo) = Self::split(path)?;
        Ok(fetch_project_toml(owner, repo, git_ref).await?)
    }

    async fn clone_repo(&self, path: &str, dest: &Path) -> Result<(), RemoteError> {
        let (owner, repo) = Self::split(path)?;
        clone_repo(owner, repo, dest).await?;
        Ok(())
    }
}
