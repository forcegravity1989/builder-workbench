use super::{
    Capped, IssueFilter, IssueState, IssueStateEvent, Milestone, PrOpened, RemoteError,
    RemoteIssue, RemoteProvider, RepoSummary, PROJECT_FILE_REL_PATH,
};
use crate::win_cmd::stderr_text;
use std::{
    ffi::{OsStr, OsString},
    path::Path,
    process::Stdio,
    time::Instant,
};

#[derive(Debug, thiserror::Error)]
pub enum CodehubError {
    #[error("codehub-cli 未安装或不在 PATH")]
    NotInstalled,
    #[error("codehub-cli 失败:{0}")]
    Command(String),
    #[error("解析 codehub-cli 输出失败:{0}")]
    Parse(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CodehubRepoSummary {
    pub path: String,
    pub visibility: String,
    pub default_branch: String,
    pub pushed_at: String,
    pub description: String,
}

fn spawn_err(e: std::io::Error) -> CodehubError {
    if e.kind() == std::io::ErrorKind::NotFound {
        CodehubError::NotInstalled
    } else {
        CodehubError::Command(e.to_string())
    }
}

/// 命令日志不能包含正文、描述或 jq 参数中的内容。
async fn run_cli(
    args: impl IntoIterator<Item = impl AsRef<OsStr>>,
) -> Result<std::process::Output, CodehubError> {
    let args: Vec<OsString> = args
        .into_iter()
        .map(|a| a.as_ref().to_os_string())
        .collect();
    let label = cli_label(&args);
    let t0 = Instant::now();
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    let ok = out.status.success();
    crate::dlog!(
        ok,
        "codehub",
        "cli {label} elapsed_ms={} ok={ok}",
        t0.elapsed().as_millis()
    );
    Ok(out)
}

fn cli_label(args: &[OsString]) -> String {
    let mut out = Vec::new();
    let mut skip = false;
    for a in args {
        if skip {
            skip = false;
            continue;
        }
        let s = a.to_string_lossy();
        if matches!(s.as_ref(), "--jq" | "--body" | "--description") {
            skip = true;
            continue;
        }
        if s.len() > 80 {
            continue;
        }
        out.push(s.into_owned());
    }
    out.join(" ")
}

pub async fn probe(host: &str, path: &str) -> Result<String, CodehubError> {
    let out = run_cli(["project", "view", "-p", path, "-H", host]).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project view JSON:{e}")))?;
    let pns = v["path_with_namespace"].as_str().unwrap_or(path);
    let vis = v["visibility"].as_str().unwrap_or("未知");
    let archived = v["archived"].as_bool().unwrap_or(false);
    let last = v["last_activity_at"].as_str().unwrap_or("未知");
    let arch = if archived { " · 已归档" } else { "" };
    Ok(format!("{pns} · {vis}{arch} · 最近活跃 {last}"))
}

/// 创建 Release 必须提供默认分支，否则 CodeHub 可能返回 422。
async fn project_default_branch(host: &str, path: &str) -> Result<String, CodehubError> {
    let out = run_cli(["project", "view", "-p", path, "-H", host]).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project view JSON:{e}")))?;
    let b = v["default_branch"].as_str().unwrap_or("").trim();
    if b.is_empty() {
        Ok("master".to_string())
    } else {
        Ok(b.to_string())
    }
}

pub async fn create_mr_on_branch(
    host: &str,
    path: &str,
    workspace: &Path,
    branch: &str,
    title: &str,
    body: &str,
) -> Result<PrOpened, CodehubError> {
    let tgt = crate::win_cmd::tokio_cmd("git")
        .current_dir(workspace)
        .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    let target = String::from_utf8_lossy(&tgt.stdout)
        .trim()
        .strip_prefix("refs/remotes/origin/")
        .unwrap_or("master")
        .to_string();
    if let Ok(Some(iid)) = open_mr_for_branch(host, path, branch).await {
        return Ok(PrOpened::Adopted(iid));
    }
    let mut args: Vec<&str> = vec![
        "mr",
        "create",
        "-p",
        path,
        "-H",
        host,
        "--source-branch",
        branch,
        "--target-branch",
        &target,
        "--title",
        title,
        "--description",
        body,
    ];
    args.push("--jq");
    args.push(".iid");
    let out = run_cli(&args).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let iid = text
        .parse::<u32>()
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub MR iid:{text:?}")))?;
    Ok(PrOpened::Created(iid))
}

pub async fn open_mr_for_branch(
    host: &str,
    path: &str,
    branch: &str,
) -> Result<Option<u32>, CodehubError> {
    let out = run_cli([
        "mr",
        "list",
        "-p",
        path,
        "-H",
        host,
        "--source-branch",
        branch,
        "--state",
        "opened",
        "--jq",
        ".[0].iid",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(None);
    }
    text.parse::<u32>()
        .map(Some)
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub MR iid:{text:?}")))
}

pub async fn mr_for_branch(
    host: &str,
    path: &str,
    branch: &str,
) -> Result<Option<u32>, CodehubError> {
    let out = run_cli([
        "mr",
        "list",
        "-p",
        path,
        "-H",
        host,
        "--source-branch",
        branch,
        "--state",
        "all",
        "--jq",
        ".[0].iid",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(None);
    }
    text.parse::<u32>()
        .map(Some)
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub MR iid:{text:?}")))
}
pub async fn merge_mr(host: &str, path: &str, mr_iid: u32) -> Result<(), CodehubError> {
    let out = run_cli([
        "mr",
        "merge",
        &mr_iid.to_string(),
        "-p",
        path,
        "-H",
        host,
        "--squash",
        "-y",
    ])
    .await?;
    let merge_stderr = stderr_text(&out);
    if !out.status.success() {
        return Err(CodehubError::Command(merge_stderr));
    }
    // CLI 可能在合入失败时返回成功退出码，需再查询 MR 状态确认。
    let verify = run_cli([
        "mr",
        "view",
        &mr_iid.to_string(),
        "-p",
        path,
        "-H",
        host,
        "--jq",
        ".state",
    ])
    .await?;
    if !verify.status.success() {
        return Err(CodehubError::Command(format!(
            "merge 后读回 MR 状态失败:{} | merge stderr: {merge_stderr}",
            stderr_text(&verify)
        )));
    }
    let state = String::from_utf8_lossy(&verify.stdout)
        .trim()
        .trim_matches('"')
        .to_string();
    if state == "merged" {
        Ok(())
    } else {
        Err(CodehubError::Command(format!(
            "merge 未生效(MR state={state},应 merged):{merge_stderr}"
        )))
    }
}

/// CodeHub 使用 SSH 克隆，沿用本机 SSH 认证。
pub async fn clone_repo(host: &str, path: &str, dest: &Path) -> Result<(), CodehubError> {
    let out = run_cli([
        "project",
        "view",
        "-p",
        path,
        "-H",
        host,
        "--template",
        "{{.ssh_url_to_repo}}",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(format!(
            "取 ssh_url 失败(project view):{}",
            stderr_text(&out)
        )));
    }
    let ssh_url = String::from_utf8_lossy(&out.stdout).trim().to_string();
    // --template 对 null 字段输出 "<no value>";空/非 ssh:// 不喂给 git
    // (老仓/无 SSH 配置的仓 ssh_url_to_repo 会是空)。
    if !ssh_url.starts_with("ssh://") {
        return Err(CodehubError::Command(format!(
            "codehub 仓无 SSH clone 地址(ssh_url_to_repo 为空或老仓?):{ssh_url:?}"
        )));
    }
    let out = crate::win_cmd::tokio_cmd("git")
        .args(["clone", &ssh_url, &dest.to_string_lossy()])
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

pub async fn fetch_project_toml(
    host: &str,
    path: &str,
    git_ref: &str,
) -> Result<Option<String>, CodehubError> {
    let git_ref = if git_ref.trim().is_empty() {
        "main"
    } else {
        git_ref.trim()
    };
    let out = run_cli([
        "-H",
        host,
        "repo",
        "file",
        "raw",
        "-p",
        path,
        "--file-path",
        PROJECT_FILE_REL_PATH,
        "--ref",
        git_ref,
        "--no-cache",
    ])
    .await?;
    if !out.status.success() {
        let err = stderr_text(&out);
        let lower = err.to_lowercase();
        // 分支和文件不存在都可能返回 404，需区分查询失败和文件缺失。
        if lower.contains("branch not found") || lower.contains("ref not found") {
            return Err(CodehubError::Command(err));
        }
        if lower.contains("404") || lower.contains("not found") || lower.contains("does not exist")
        {
            return Ok(None);
        }
        return Err(CodehubError::Command(err));
    }
    Ok(Some(
        String::from_utf8_lossy(&out.stdout).trim().to_string(),
    ))
}

pub async fn list_repos(host: &str, limit: u32) -> Result<Vec<CodehubRepoSummary>, CodehubError> {
    let out = run_cli([
        "-H",
        host,
        "project",
        "list",
        "--mine",
        "--limit",
        &limit.to_string(),
        "--json",
        "path_with_namespace,visibility,default_branch,last_activity_at,description",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let rows: Vec<CodehubRepoJson> = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project list JSON:{e}")))?;
    Ok(rows
        .into_iter()
        .map(|r| CodehubRepoSummary {
            path: r.path_with_namespace,
            visibility: r.visibility,
            default_branch: r.default_branch,
            pushed_at: r.last_activity_at,
            description: r.description.unwrap_or_default(),
        })
        .collect())
}

#[derive(serde::Deserialize)]
struct CodehubRepoJson {
    path_with_namespace: String,
    visibility: String,
    #[serde(default)]
    default_branch: String,
    #[serde(default)]
    last_activity_at: String,
    #[serde(default)]
    description: Option<String>,
}

pub async fn create_issue(
    host: &str,
    path: &str,
    title: &str,
    body: &str,
    labels: &[&str],
    attachment: Option<&Path>,
) -> Result<u32, CodehubError> {
    let labels_csv = labels.join(",");
    let attach = attachment
        .filter(|p| p.is_file())
        .map(|p| p.to_string_lossy().into_owned());
    let mut args: Vec<&str> = vec![
        "issue",
        "create",
        "-p",
        path,
        "-H",
        host,
        "--title",
        title,
        "--description",
        body,
    ];
    if !labels_csv.is_empty() {
        args.push("--labels");
        args.push(&labels_csv);
    }
    if let Some(ref p) = attach {
        args.push("--attachment");
        args.push(p);
    }
    args.push("--jq");
    args.push(".iid");
    let out = run_cli(&args).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    text.parse::<u32>()
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub issue iid:{text:?}")))
}

pub async fn update_issue(
    host: &str,
    path: &str,
    iid: u32,
    labels: Option<&[&str]>,
    state_event: Option<&str>,
) -> Result<(), CodehubError> {
    let iid_s = iid.to_string();
    let labels_csv: Option<String> = if let Some(lbls) = labels {
        if lbls.is_empty() {
            None
        } else {
            let view = run_cli([
                "issue",
                "view",
                &iid_s,
                "-p",
                path,
                "-H",
                host,
                "--jq",
                "(.labels // []) | [.[] | (.name? // .)]",
            ])
            .await?;
            if !view.status.success() {
                return Err(CodehubError::Command(stderr_text(&view)));
            }
            let text = String::from_utf8_lossy(&view.stdout).trim().to_string();
            let current: Vec<String> = if text.is_empty() || text == "null" {
                Vec::new()
            } else {
                serde_json::from_str(&text).map_err(|e| {
                    CodehubError::Parse(format!("无法解析 codehub issue view labels JSON:{e}"))
                })?
            };
            let input_prefixes: std::collections::HashSet<&str> = lbls
                .iter()
                .filter_map(|&l| crate::remote::label_prefix(l))
                .collect();
            let mut final_set: Vec<String> = current
                .iter()
                .filter(|c| match crate::remote::label_prefix(c) {
                    Some(p) => !input_prefixes.contains(p),
                    None => true,
                })
                .cloned()
                .collect();
            for l in crate::remote::filter_persistent_labels(lbls) {
                if !final_set.iter().any(|s| s == l) {
                    final_set.push(l.to_string());
                }
            }
            Some(final_set.join(","))
        }
    } else {
        None
    };
    let mut args: Vec<&str> = vec!["issue", "update", &iid_s, "-p", path, "-H", host];
    if let Some(csv) = labels_csv.as_deref() {
        if !csv.is_empty() {
            args.push("--labels");
            args.push(csv);
        }
    }
    if let Some(ev) = state_event {
        args.push("--state-event");
        args.push(ev);
    }
    let out = run_cli(&args).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

pub async fn list_issues(
    host: &str,
    path: &str,
    state: Option<&str>,
    labels: &[String],
) -> Result<Vec<crate::remote::RemoteIssue>, CodehubError> {
    let labels_csv = labels.join(",");
    let mut args: Vec<&str> = vec!["issue", "list", "-p", path, "-H", host];
    if let Some(s) = state {
        args.push("--state");
        args.push(s);
    }
    if !labels_csv.is_empty() {
        args.push("--labels");
        args.push(&labels_csv);
    }
    args.push("-l");
    args.push("0");
    args.push("--jq");
    args.push(r#"(. // []) | [.[] | {iid: .iid, number: (.id // .iid), title: (.title // ""), state: (.state // ""), labels: ((.labels // []) | map(.name? // .)), created_at: (.created_at // null), closed_at: (.closed_at // null), assignee: .assignee, author: .author}]"#);
    let out = run_cli(&args).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let rows = parse_issue_list_json(&out.stdout)?;
    crate::dlog!(
        ok,
        "codehub",
        "issue list -H {host} -p {path} n={}",
        rows.len()
    );
    Ok(rows
        .into_iter()
        .map(|r| crate::remote::RemoteIssue {
            iid: r.iid,
            number: r.number,
            title: r.title,
            state: r.state,
            labels: r.labels,
            body: String::new(),
            created_at: r.created_at,
            closed_at: r.closed_at,
            assignee: person_name(r.assignee.as_ref()),
            author: person_name(r.author.as_ref()),
        })
        .collect())
}

pub async fn view_issue(
    host: &str,
    path: &str,
    iid: u32,
) -> Result<crate::remote::RemoteIssue, CodehubError> {
    let iid_s = iid.to_string();
    let out = run_cli([
        "issue", "view", &iid_s, "-p", path, "-H", host, "--format", "json",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    parse_issue_view_json(&out.stdout)
}

pub(crate) fn parse_issue_view_json(
    stdout: &[u8],
) -> Result<crate::remote::RemoteIssue, CodehubError> {
    let r: CodehubIssueViewJson = serde_json::from_slice(stdout)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub issue view JSON:{e}")))?;
    Ok(crate::remote::RemoteIssue {
        iid: r.iid,
        number: r.number,
        title: r.title,
        state: r.state,
        labels: r.labels.iter().map(label_name).collect(),
        body: r.body.unwrap_or_default(),
        created_at: r.created_at,
        closed_at: r.closed_at,
        assignee: person_name(r.assignee.as_ref()),
        author: person_name(r.author.as_ref()),
    })
}

fn label_name(v: &serde_json::Value) -> String {
    v.get("name")
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
        .or_else(|| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default()
}

fn person_name(v: Option<&serde_json::Value>) -> Option<String> {
    let v = v?;
    if v.is_null() {
        return None;
    }
    ["user_name", "username", "name"]
        .iter()
        .find_map(|k| v.get(k).and_then(|x| x.as_str()).filter(|s| !s.is_empty()))
        .map(|s| s.to_string())
}

#[derive(serde::Deserialize)]
struct CodehubIssueViewJson {
    iid: u32,
    #[serde(default)]
    number: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    labels: Vec<serde_json::Value>,
    /// GitLab 正文字段为 description，映射到统一的 body 字段。
    #[serde(default, rename = "description")]
    body: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    assignee: Option<serde_json::Value>,
    #[serde(default)]
    author: Option<serde_json::Value>,
}

fn parse_issue_list_json(stdout: &[u8]) -> Result<Vec<CodehubIssueJson>, CodehubError> {
    let text = String::from_utf8_lossy(stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub issue list JSON:{e}")))
}

#[derive(serde::Deserialize)]
struct CodehubIssueJson {
    iid: u32,
    #[serde(default)]
    number: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    assignee: Option<serde_json::Value>,
    #[serde(default)]
    author: Option<serde_json::Value>,
}

pub async fn comment_issue(
    host: &str,
    path: &str,
    iid: u32,
    body: &str,
) -> Result<(), CodehubError> {
    let iid_s = iid.to_string();
    let out = run_cli([
        "issue", "comment", "create", &iid_s, "-p", path, "-H", host, "--body", body,
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

pub async fn list_issue_comments(
    host: &str,
    path: &str,
    iid: u32,
) -> Result<Vec<String>, CodehubError> {
    let iid_s = iid.to_string();
    let out = run_cli([
        "issue",
        "comment",
        "list",
        &iid_s,
        "-p",
        path,
        "-H",
        host,
        "-l",
        "0",
        "--sort",
        "asc",
        "--jq",
        r#"(. // []) | [.[] | select((.system // false) | not) | .body // ""]"#,
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let text = text.trim();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 issue 评论列表 JSON:{e}")))
}

pub async fn create_release(
    host: &str,
    path: &str,
    tag: &str,
    title: &str,
    body: &str,
) -> Result<(), CodehubError> {
    let git_ref = project_default_branch(host, path).await?;
    let out = run_cli([
        "release",
        "create",
        "-p",
        path,
        "-H",
        host,
        "--tag-name",
        tag,
        "--name",
        title,
        "--description",
        body,
        "--ref",
        &git_ref,
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

pub async fn list_releases(host: &str, path: &str) -> Result<Vec<String>, CodehubError> {
    let out = run_cli([
        "release",
        "list",
        "-p",
        path,
        "-H",
        host,
        "--jq",
        "(. // []) | [.[] | .tag_name]",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub release list JSON:{e}")))
}

pub async fn merged_mr_times(host: &str, path: &str) -> Result<Vec<String>, CodehubError> {
    let out = run_cli([
        "mr",
        "list",
        "-p",
        path,
        "-H",
        host,
        "--state",
        "merged",
        "-l",
        "0",
        "--jq",
        // 空仓可能返回 null，先转为空数组再执行 jq 迭代。
        "(. // []) | [.[] | .merged_at]",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    let v: Vec<Option<String>> = serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub mr merged_at JSON:{e}")))?;
    Ok(v.into_iter().flatten().collect())
}

pub async fn issue_times(
    host: &str,
    path: &str,
) -> Result<Vec<(String, Option<String>)>, CodehubError> {
    let out = run_cli([
        "issue",
        "list",
        "-p",
        path,
        "-H",
        host,
        "--state",
        "all",
        "-l",
        "0",
        "--jq",
        "(. // []) | [.[] | {created_at: .created_at, closed_at: .closed_at}]",
    ])
    .await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    let v: Vec<CodehubIssueTimeJson> = serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub issue times JSON:{e}")))?;
    Ok(v.into_iter()
        .map(|r| (r.created_at.unwrap_or_default(), r.closed_at))
        .collect())
}

pub async fn ensure_plan_milestone(
    host: &str,
    path: &str,
    name: &str,
    start: &str,
    due: &str,
) -> Result<u64, CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str()), ("per_page", "100")],
        &[],
    )
    .await?;
    for m in milestone_rows(&listed) {
        if m["title"].as_str() == Some(name) {
            if let Some(id) = m["id"].as_u64() {
                return Ok(id);
            }
        }
    }
    let desc = format!("Workbench 投影 · 正本是 bw:plan:{name}");
    let fields = milestone_create_fields(&pid, name, start, due);
    let created = api_json(
        host,
        "POST",
        "/api/v4/projects/:id/milestones",
        &fields,
        &[("description", desc.as_str())],
    )
    .await?;
    created["id"]
        .as_u64()
        .ok_or_else(|| CodehubError::Parse(format!("新建版本里程碑没有 id:{created}")))
}

/// 只关联已存在的同名里程碑，不创建或修改日期。
pub async fn project_plan(
    host: &str,
    path: &str,
    iid: u32,
    name: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    for m in milestone_rows(&listed) {
        if m["title"].as_str() == Some(name) {
            if let Some(id) = m["id"].as_u64() {
                return set_issue_milestone(host, &pid, iid, id).await;
            }
        }
    }
    Ok(())
}

pub async fn list_milestones(
    host: &str,
    path: &str,
) -> Result<Vec<(String, String, String, String)>, CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    Ok(milestone_rows(&listed)
        .iter()
        .filter_map(|m| {
            let title = m["title"].as_str()?.to_string();
            if title.trim().is_empty() {
                return None;
            }
            let start = m["start_date"].as_str().unwrap_or("").to_string();
            let due = m["due_date"].as_str().unwrap_or("").to_string();
            let created = m["created_at"].as_str().unwrap_or("").to_string();
            Some((title, start, due, created))
        })
        .collect())
}

pub async fn delete_plan_milestone(host: &str, path: &str, name: &str) -> Result<(), CodehubError> {
    if name.trim().is_empty() {
        return Ok(());
    }
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    let Some(mid) = milestone_rows(&listed).iter().find_map(|m| {
        if m["title"].as_str() == Some(name) {
            m["id"].as_u64()
        } else {
            None
        }
    }) else {
        return Ok(());
    };
    let mid_s = mid.to_string();
    api_json(
        host,
        "DELETE",
        "/api/v4/projects/:id/milestones/:milestone_id",
        &[("id", pid.as_str()), ("milestone_id", mid_s.as_str())],
        &[],
    )
    .await?;
    Ok(())
}

pub async fn rename_plan_milestone(
    host: &str,
    path: &str,
    from: &str,
    to: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    let Some(mid) = milestone_rows(&listed).iter().find_map(|m| {
        if m["title"].as_str() == Some(from) {
            m["id"].as_u64()
        } else {
            None
        }
    }) else {
        return Err(CodehubError::Command(format!(
            "找不到里程碑 {from},改不成 {to}"
        )));
    };
    let mid_s = mid.to_string();
    api_json(
        host,
        "PUT",
        "/api/v4/projects/:id/milestones/:milestone_id",
        &[
            ("id", pid.as_str()),
            ("milestone_id", mid_s.as_str()),
            ("title", to),
        ],
        &[],
    )
    .await?;
    Ok(())
}

pub async fn rename_plan_label(
    host: &str,
    path: &str,
    from_label: &str,
    to_label: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    api_json(
        host,
        "PUT",
        "/api/v4/projects/:id/labels",
        &[
            ("id", pid.as_str()),
            ("name", from_label),
            ("new_name", to_label),
        ],
        &[],
    )
    .await?;
    Ok(())
}

pub async fn clear_issue_milestone(host: &str, path: &str, iid: u32) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    set_issue_milestone(host, &project_id.to_string(), iid, 0).await
}

pub async fn set_issue_assignee(
    host: &str,
    path: &str,
    iid: u32,
    assignee: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let iid_s = iid.to_string();
    let endpoint = format!("/api/v4/projects/:id/issues/{iid_s}");
    if assignee.is_empty() {
        api_json(
            host,
            "PUT",
            &endpoint,
            &[("id", pid.as_str()), ("assignee_id", "")],
            &[],
        )
        .await?;
        return Ok(());
    }
    let uid = user_id_by_username(host, assignee).await?.to_string();
    // 单人指派使用 assignee_id；assignee_ids 需要数组而非字符串。
    api_json(
        host,
        "PUT",
        &endpoint,
        &[("id", pid.as_str()), ("assignee_id", uid.as_str())],
        &[],
    )
    .await?;
    Ok(())
}

pub async fn current_user(host: &str) -> Option<String> {
    let v = api_json(host, "GET", "/api/v4/user", &[], &[]).await.ok()?;
    person_name(Some(&v)).or_else(|| {
        v.get("user_name")
            .and_then(|x| x.as_str())
            .or_else(|| v.get("username").and_then(|x| x.as_str()))
            .map(|s| s.to_string())
    })
}

async fn user_id_by_username(host: &str, username: &str) -> Result<u64, CodehubError> {
    let listed = api_json(host, "GET", "/api/v4/users", &[("username", username)], &[]).await?;
    let arr = listed
        .as_array()
        .ok_or_else(|| CodehubError::Parse(format!("users 查询不是数组:{listed}")))?;
    for u in arr {
        if let Some(id) = u["id"].as_u64() {
            return Ok(id);
        }
    }
    Err(CodehubError::Command(format!(
        "codehub 查不到用户名 {username}"
    )))
}

pub async fn edit_issue(
    host: &str,
    path: &str,
    iid: u32,
    title: &str,
    body: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let iid_s = iid.to_string();
    let endpoint = format!("/api/v4/projects/:id/issues/{iid_s}");
    api_json(
        host,
        "PUT",
        &endpoint,
        &[
            ("id", pid.as_str()),
            ("title", title),
            ("description", body),
        ],
        &[],
    )
    .await?;
    Ok(())
}

async fn project_numeric_id(host: &str, path: &str) -> Result<u64, CodehubError> {
    let out = run_cli(["project", "view", "-p", path, "-H", host]).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project view JSON:{e}")))?;
    v["id"]
        .as_u64()
        .ok_or_else(|| CodehubError::Parse("project view 没有数字 id".into()))
}

async fn set_issue_milestone(
    host: &str,
    project_id: &str,
    iid: u32,
    milestone_id: u64,
) -> Result<(), CodehubError> {
    let iid_s = iid.to_string();
    let mid_s = milestone_id.to_string();
    api_json(
        host,
        "PUT",
        "/api/v4/projects/:id/issues/:issue_iid",
        &[
            ("id", project_id),
            ("issue_iid", iid_s.as_str()),
            ("milestone_id", mid_s.as_str()),
        ],
        &[],
    )
    .await?;
    Ok(())
}

async fn api_json(
    host: &str,
    method: &str,
    endpoint: &str,
    fields: &[(&str, &str)],
    raw_fields: &[(&str, &str)],
) -> Result<serde_json::Value, CodehubError> {
    let field_args: Vec<String> = fields.iter().map(|(k, v)| format!("{k}={v}")).collect();
    let raw_args: Vec<String> = raw_fields.iter().map(|(k, v)| format!("{k}={v}")).collect();
    let mut args = vec!["api", method, endpoint, "-H", host, "-f", "json"];
    for a in &field_args {
        args.push("--field");
        args.push(a);
    }
    for a in &raw_args {
        args.push("--raw-field");
        args.push(a);
    }
    let out = run_cli(&args).await?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    unwrap_api_body(&out.stdout)
}

fn unwrap_api_body(stdout: &[u8]) -> Result<serde_json::Value, CodehubError> {
    let v: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| CodehubError::Parse(format!("api JSON:{e}")))?;
    if let Some(code) = v.get("statusCode").and_then(|c| c.as_u64()) {
        if !(200..300).contains(&code) {
            return Err(CodehubError::Command(format!(
                "api {}: {}",
                v.get("status").and_then(|s| s.as_str()).unwrap_or("?"),
                v.get("body").map(|b| b.to_string()).unwrap_or_default()
            )));
        }
        return Ok(v.get("body").cloned().unwrap_or(serde_json::Value::Null));
    }
    Ok(v)
}

/// 未填写的日期参数应省略，CodeHub 不接受空日期字符串。
fn milestone_create_fields<'a>(
    id: &'a str,
    title: &'a str,
    start: &'a str,
    due: &'a str,
) -> Vec<(&'a str, &'a str)> {
    let mut fields = vec![("id", id), ("title", title)];
    if !start.trim().is_empty() {
        fields.push(("start_date", start));
    }
    if !due.trim().is_empty() {
        fields.push(("due_date", due));
    }
    fields
}

fn milestone_rows(body: &serde_json::Value) -> Vec<&serde_json::Value> {
    if let Some(arr) = body.get("milestones").and_then(|v| v.as_array()) {
        return arr.iter().collect();
    }
    if let Some(arr) = body.as_array() {
        return arr.iter().collect();
    }
    Vec::new()
}

#[derive(serde::Deserialize)]
struct CodehubIssueTimeJson {
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
}

#[cfg(test)]
mod parse_issue_list_json_tests {
    use super::parse_issue_list_json;

    #[test]
    fn empty_and_null_are_no_issues() {
        assert!(parse_issue_list_json(b"").unwrap().is_empty());
        assert!(parse_issue_list_json(b"null").unwrap().is_empty());
        assert!(parse_issue_list_json(b"[]").unwrap().is_empty());
    }

    #[test]
    fn one_row() {
        let rows = parse_issue_list_json(
            r#"[{"iid":5,"number":5,"title":"bootstrap v5.0","state":"closed","labels":[]}]"#
                .as_bytes(),
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].iid, 5);
        assert_eq!(rows[0].title, "bootstrap v5.0");
    }
}

#[cfg(test)]
mod api_body_tests {
    use super::{milestone_create_fields, milestone_rows, parse_issue_view_json, unwrap_api_body};

    #[test]
    fn omits_empty_milestone_dates() {
        let f = milestone_create_fields("9", "MVP收尾", "", "");
        assert_eq!(f, vec![("id", "9"), ("title", "MVP收尾")]);
        let f = milestone_create_fields("9", "MVP收尾", "2026-08-01", "");
        assert_eq!(
            f,
            vec![
                ("id", "9"),
                ("title", "MVP收尾"),
                ("start_date", "2026-08-01")
            ]
        );
    }

    #[test]
    fn unwraps_status_wrapper() {
        let v = unwrap_api_body(
            br#"{"body":{"id":50659,"title":"2026-W35"},"status":"201 Created","statusCode":201}"#,
        )
        .unwrap();
        assert_eq!(v["id"], 50659);
    }

    #[test]
    fn reads_wrapped_milestone_list() {
        let body = unwrap_api_body(
            br#"{"body":{"all":1,"milestones":[{"id":1,"title":"2026-W35"}]},"status":"200 OK","statusCode":200}"#,
        )
        .unwrap();
        let rows = milestone_rows(&body);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["title"], "2026-W35");
    }

    #[test]
    fn issue_view_description_maps_to_body() {
        let r = parse_issue_view_json(
            r##"{"iid":72,"id":4011099,"title":"#72 正文同步codehub但计划页签不显示","state":"opened","description":"计划页签中各issue点开能看到真实的正文，并支持编辑","labels":[{"name":"bw:status:inprogress"},{"name":"bw:category:build"}],"created_at":"2026-09-09T16:17:20.366+08:00","closed_at":null,"assignee":null,"author":{"username":"a30030291"}}"##
                .as_bytes(),
        )
        .unwrap();
        assert_eq!(r.iid, 72);
        assert_eq!(
            r.body.as_str(),
            "计划页签中各issue点开能看到真实的正文，并支持编辑"
        );
        assert_eq!(r.title, "#72 正文同步codehub但计划页签不显示");
        assert_eq!(r.state, "opened");
        assert_eq!(
            r.labels,
            vec![
                "bw:status:inprogress".to_string(),
                "bw:category:build".to_string()
            ]
        );
        assert!(r.assignee.is_none());
        assert_eq!(r.author.as_deref(), Some("a30030291"));
    }

    #[test]
    fn issue_view_missing_description_is_empty_body() {
        let r = parse_issue_view_json(br#"{"iid":1,"title":"x","state":"opened","labels":[]}"#)
            .unwrap();
        assert!(r.body.is_empty());
    }
}

impl From<CodehubError> for RemoteError {
    fn from(e: CodehubError) -> Self {
        match e {
            CodehubError::NotInstalled => RemoteError::NotInstalled { cli: "codehub-cli" },
            other => RemoteError::Cli(other.to_string()),
        }
    }
}

#[derive(Debug)]
pub(super) struct CodehubRemote {
    host: String,
    path: String,
}

impl CodehubRemote {
    pub(super) fn new(host: &str, path: &str) -> Self {
        Self {
            host: host.to_string(),
            path: path.to_string(),
        }
    }

    fn need_host(&self) -> Result<&str, RemoteError> {
        let h = self.host.trim();
        if h.is_empty() {
            return Err(RemoteError::Cli(
                "没选区 —— codehub 要 -H green/open/yellow 之一".into(),
            ));
        }
        Ok(h)
    }
}

#[async_trait::async_trait]
impl RemoteProvider for CodehubRemote {
    fn kind(&self) -> &'static str {
        "codehub"
    }

    async fn create_mr_on_branch(
        &self,
        workspace: &Path,
        branch: &str,
        title: &str,
        body: &str,
    ) -> Result<PrOpened, RemoteError> {
        Ok(create_mr_on_branch(&self.host, &self.path, workspace, branch, title, body).await?)
    }

    async fn merge_mr(&self, mr_number: u32) -> Result<(), RemoteError> {
        Ok(merge_mr(&self.host, &self.path, mr_number).await?)
    }

    async fn open_mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(open_mr_for_branch(&self.host, &self.path, branch).await?)
    }

    async fn mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(mr_for_branch(&self.host, &self.path, branch).await?)
    }

    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<u32, RemoteError> {
        Ok(create_issue(&self.host, &self.path, title, body, labels, None).await?)
    }

    async fn create_issue_with_attachment(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
        attachment: Option<&Path>,
    ) -> Result<u32, RemoteError> {
        Ok(create_issue(&self.host, &self.path, title, body, labels, attachment).await?)
    }

    async fn update_issue(
        &self,
        iid: u32,
        labels: Option<&[&str]>,
        state_event: Option<IssueStateEvent>,
    ) -> Result<(), RemoteError> {
        let ev = state_event.map(|e| match e {
            IssueStateEvent::Close => "close",
            IssueStateEvent::Reopen => "reopen",
        });
        Ok(update_issue(&self.host, &self.path, iid, labels, ev).await?)
    }

    async fn list_issues(&self, filter: &IssueFilter) -> Result<Vec<RemoteIssue>, RemoteError> {
        let state = filter.state.map(|s| match s {
            IssueState::Open => "opened",
            IssueState::Closed => "closed",
        });
        Ok(list_issues(&self.host, &self.path, state, &filter.labels).await?)
    }

    async fn view_issue(&self, iid: u32) -> Result<RemoteIssue, RemoteError> {
        Ok(view_issue(&self.host, &self.path, iid).await?)
    }

    async fn comment_issue(&self, iid: u32, body: &str) -> Result<(), RemoteError> {
        Ok(comment_issue(&self.host, &self.path, iid, body).await?)
    }

    async fn list_issue_comments(&self, iid: u32) -> Result<Vec<String>, RemoteError> {
        Ok(list_issue_comments(&self.host, &self.path, iid).await?)
    }

    async fn set_issue_assignee(&self, iid: u32, assignee: &str) -> Result<(), RemoteError> {
        Ok(set_issue_assignee(&self.host, &self.path, iid, assignee).await?)
    }

    async fn edit_issue(&self, iid: u32, title: &str, body: &str) -> Result<(), RemoteError> {
        Ok(edit_issue(&self.host, &self.path, iid, title, body).await?)
    }

    async fn create_release(&self, tag: &str, title: &str, body: &str) -> Result<(), RemoteError> {
        Ok(create_release(&self.host, &self.path, tag, title, body).await?)
    }

    async fn list_releases(&self) -> Result<Vec<String>, RemoteError> {
        Ok(list_releases(&self.host, &self.path).await?)
    }

    async fn current_user(&self) -> Option<String> {
        current_user(&self.host).await
    }

    async fn list_milestones(&self) -> Result<Vec<Milestone>, RemoteError> {
        Ok(list_milestones(&self.host, &self.path).await?)
    }

    async fn ensure_plan_milestone(
        &self,
        name: &str,
        start: &str,
        due: &str,
    ) -> Result<u64, RemoteError> {
        Ok(ensure_plan_milestone(&self.host, &self.path, name, start, due).await?)
    }

    async fn project_plan(&self, iid: u32, name: &str) -> Result<(), RemoteError> {
        Ok(project_plan(&self.host, &self.path, iid, name).await?)
    }

    async fn clear_issue_milestone(&self, iid: u32) -> Result<(), RemoteError> {
        Ok(clear_issue_milestone(&self.host, &self.path, iid).await?)
    }

    async fn delete_plan_milestone(&self, name: &str) -> Result<(), RemoteError> {
        Ok(delete_plan_milestone(&self.host, &self.path, name).await?)
    }

    async fn rename_plan_milestone(&self, from: &str, to: &str) -> Result<(), RemoteError> {
        Ok(rename_plan_milestone(&self.host, &self.path, from, to).await?)
    }

    async fn rename_plan_label(&self, from_label: &str, to_label: &str) -> Result<(), RemoteError> {
        Ok(rename_plan_label(&self.host, &self.path, from_label, to_label).await?)
    }

    async fn merged_mr_times(&self) -> Result<Capped<String>, RemoteError> {
        Ok(Capped {
            rows: merged_mr_times(&self.host, &self.path).await?,
            truncated: false,
        })
    }

    async fn issue_times(&self) -> Result<Capped<(String, Option<String>)>, RemoteError> {
        Ok(Capped {
            rows: issue_times(&self.host, &self.path).await?,
            truncated: false,
        })
    }

    async fn list_repos(&self, limit: u32) -> Result<Vec<RepoSummary>, RemoteError> {
        Ok(list_repos(self.need_host()?, limit)
            .await?
            .into_iter()
            .map(|r| RepoSummary {
                path: r.path,
                private: r.visibility.eq_ignore_ascii_case("private"),
                description: r.description,
                default_branch: r.default_branch,
                pushed_at: r.pushed_at,
            })
            .collect())
    }

    async fn probe_repo(&self, path: &str) -> Result<String, RemoteError> {
        Ok(probe(self.need_host()?, path).await?)
    }

    async fn fetch_project_toml(
        &self,
        path: &str,
        git_ref: &str,
    ) -> Result<Option<String>, RemoteError> {
        Ok(fetch_project_toml(self.need_host()?, path, git_ref).await?)
    }

    async fn clone_repo(&self, path: &str, dest: &Path) -> Result<(), RemoteError> {
        Ok(clone_repo(self.need_host()?, path, dest).await?)
    }
}
