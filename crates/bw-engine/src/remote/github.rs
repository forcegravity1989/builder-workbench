//! GitHub shell-out — mints or adopts a GitHub repo via the `gh` CLI, same
//! subprocess pattern `workspace.rs` uses for local git. Relies entirely on
//! the user's own `gh auth login` on this machine; no token handling here.

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
pub struct GithubRepoRef {
    pub owner: String,
    pub repo: String,
    pub html_url: String,
    pub private: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GithubRepoSummary {
    pub owner: String,
    pub repo: String,
    pub private: bool,
    /// C16: 仓描述 —— `gh repo list --json description` 的
    /// 原文;空串 = 仓本身没填描述(真实状态),不是"没取到"。
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

/// github-repo 连接器的真探针——`gh repo view` 一次,回
/// 可见性与最近推送时间。探不通就如实报错,绝不伪造"已同步"。
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

// ─────────────── P1 · 存量项目接仓 ───────────────
//
// `Command::AttachRepo` 给「绑定本地目录」建的项目补上 GitHub 远端。这里只管
// 本地 `origin` 这一侧的真实读写;探活(`probe_repo`)、写 `remote_path`、
// 补 connector 都是 app-shell 的编排职责,不下沉到这层。

/// Clone an already-existing GitHub repo the user picked into `dest`.
pub async fn clone_repo(
    owner: &str,
    repo: &str,
    dest: &Path,
) -> Result<GithubRepoRef, GithubError> {
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
    let view = crate::win_cmd::tokio_cmd("gh")
        .args(["repo", "view", &owner_repo, "--json", "isPrivate"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    let private = if view.status.success() {
        serde_json::from_slice::<serde_json::Value>(&view.stdout)
            .ok()
            .and_then(|v| v.get("isPrivate").and_then(|b| b.as_bool()))
            .unwrap_or(false)
    } else {
        false
    };
    Ok(GithubRepoRef {
        owner: owner.to_string(),
        repo: repo.to_string(),
        html_url: format!("https://github.com/{owner_repo}"),
        private,
    })
}

// ─────────────────────── C5 · PR 验收环 ───────────────────────
//
// 三件套 + 收尾:提 PR / 查 PR 状态 / merge PR,外加 merge 后的 issue 补关。
// 关键纪律:**执行器只提 PR、永不 merge**——`open_pr` 在执行器路径里被调用,
// `merge_pr` 只从 app-shell 的人手命令(MergeIssuePr)里调用,两者物理隔离。
// 验收=人 merge;issue 关闭是 merge 的后果(PR body 的 `Closes #<n>` 关键字让
// GitHub 自动关单,`merge_pr` 后再幂等核对补关)。BW 绝不反向改写 GitHub:检测
// 到的漂移(PR 已被网页 merge 等)只反映、不 reopen、不改写远端。

/// 在**已经推上去的分支**上开一个 PR —— `gh pr create` 就这一处实现。
///
/// 唯一调用方是规范铺底:它在自己的 worktree 里只提交点名的那几个文件、推
/// 分支,再调这里开 PR。
///
/// `body` 由调用方给:带不带 `Closes #<n>` 是调用方的决定 —— **不能默认带**。
/// Workbench 的活是本机号,和远端 issue 号没有对应关系,拼一句 `Closes #3` 会
/// 去关掉那个仓里毫不相干的第 3 号 issue。
///
/// gh 从 `workspace` 的 origin 远端推断目标仓与默认基线分支。
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
        // 只认领这一种失败形状:gh 的措辞在 2.x 上稳定为
        // `a pull request for branch "<head>" into branch "<base>" already
        // exists:`(gh 不做本地化,英文文案是唯一形态)。命中就说明 PR 真的
        // 已经存在——多半是执行器自己在 run 里跑了 `gh pr create`(允许:
        // 禁的只有 `gh pr merge`)。任何其它失败(无权限/网络/分支没推……)
        // 原样 `Err`,绝不吞掉当"提 PR 幂等"处理。
        if stderr.contains("already exists") {
            match adopt_existing_pr(workspace, branch).await {
                Ok(pr) => return Ok(PrOpened::Adopted(pr)),
                // 读回也失败(罕见的竞态/权限边缘情况)——如实把原始
                // create 失败信息交回,不假装认领成功。
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

/// merge PR: the **human** verification action — merges the PR,
/// which (via `Closes #<n>`) closes the Issue. Called only from app-shell's
/// `MergeIssuePr` command, never from any executor/run path. Squash-merge keeps
/// the base branch history one-commit-per-Issue.
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
    // 读回为证:与 codehub 臂同构——`gh pr merge` 的退出码靠不住(保护分支 /
    // 权限不足 / 网络边缘),退出 0 但 PR 实际没合的情况与 codehub-cli 同形。只信
    // 「PR state 真变 MERGED」才算成功,绝不假 Done。复跑 `pr view` 读 state
    // (gh 的 state 大写:`MERGED` / `OPEN` / `CLOSED`)。
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

/// P7-7B: read-only probe for whether an Issue's
/// deterministic work branch (`issue_branch`) currently has an OPEN PR
/// against it. **现役调用方**(2026-08-17 起唯一一个):`Remote::open_mr_for_branch`
/// ← app-shell `poll_interactive_inreview`(调度器每次 tick 轮询「评审中」候选,
/// 队友自己 `gh pr create` 的 PR 就靠这条探针发现;最初为它而写的
/// `RefreshIssues` 漂移采集器已随 2026-08-17 减负重构删除——别因为 grep 不到
/// `RefreshIssues` 就把本函数当死码)。Executors are allowed `gh pr create`;
/// only `gh pr merge` is disallowed. Addressed purely via `--repo`, unlike `open_pr`/`adopt_existing_pr`
/// which run from inside a checked-out workspace — this never touches the
/// local git state, so it's safe to call for an issue whose branch the
/// caller hasn't (and may never) check out. `Ok(None)` = no open PR for that
/// branch — the honest "nothing to review yet" answer, not an error.
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
            // `// empty` (jq idiom) prints nothing at all when there's no
            // open PR, instead of the literal text "null" — collapses
            // cleanly to `Ok(None)` below without a separate null check.
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

/// 同 `open_pr_for_branch` 但 `--state all`(开着或已合入)。给详情展示用。
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
    // C16: `description` is nullable in the underlying GraphQL schema (no
    // description set ⇒ JSON `null`, not `""`) — `Option` here, flattened to
    // `""` at the call site (empty-string 是"没填",不是"没读到").
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    default_branch_ref: Option<DefaultBranchRefJson>,
    #[serde(default)]
    pushed_at: Option<String>,
}

/// List repos owned by the authenticated user — the "接入已有仓" picker's
/// data source. Read-only, no local filesystem side effects.
///
/// C16: `--json` 字段集从 `nameWithOwner,isPrivate,updatedAt`
/// 扩到 `nameWithOwner,isPrivate,description,defaultBranchRef,pushedAt` ——
/// 字段名核实自 `gh repo list --help`(`gh` 2.95.0)的 JSON FIELDS 清单,均在
/// 表中:`description`、`defaultBranchRef`、`isPrivate`、`pushedAt`、
/// `nameWithOwner`。回显真实 metadata(描述/可见性/默认分支/最近推送),不再
/// 只是干巴巴一个仓名。
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

/// V2-② Intent UX: fetch `.bw/project.toml` via `gh api` raw contents
/// without cloning. Same contract as [`crate::codehub::fetch_project_toml`]:
/// `Ok(None)` = absent → first-comer; `Err` = soft-fail (stay editable).
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
        // **分支不存在也是 404**,但它和「这个仓里没有这份文件」是两件事:
        // 前者是「没查成」(多半是默认分支不叫 main),后者才是「没接管过」。
        // 一起当成 Ok(None) 的话,一个默认分支叫 master 的仓会被报成
        // 「还没被 Workbench 接管过」,人照着填一遍就会盖掉仓里真正的名片。
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

// ── 走势图要的两份远端流水 ──────────────────────────────
//
// 都是**一趟拉全、把原始时刻交给上层**,不在这里按周查、也不在这里算数。
// 原先那条按周发搜索查询的路已经删掉,两个理由:
//
// 1. 画四周就要发四次、画八周就八次,而搜索接口本身不稳 —— 真机上撞到过
//    `Get https://api.github.com/search/issues…: EOF`,四条线里断一条。
// 2. 「issue 未处理数」这种存量值,本来就得拿全量流水才算得出「某周末还开着
//    几张」,按周查根本查不出来。
//
// 一趟拉全之后,要几周就在上层分几个桶,采多少和画多少永远一致。

/// 一趟能拉回来的最大条数。够不够由调用方自己判:**拿回来的条数正好等于它,
/// 就说明可能被截断了**,那时候该如实说「没查全」,不是端出一个少算的数。
pub const LIST_CAP: u32 = 1000;

/// 已合并 PR 的合并时刻,新的在前。RFC3339 原文,**不在这一层解析时间** ——
/// 底座只负责起进程、读 JSON,按周分桶是上层的事。
///
/// 复算:`gh pr list -R <仓> --state merged --json mergedAt --limit 1000`
pub async fn merged_pr_times(owner_repo: &str) -> Result<Vec<String>, GithubError> {
    let rows: Vec<GhMergedPrJson> =
        gh_list_json(owner_repo, &["pr", "list", "--state", "merged"], "mergedAt").await?;
    Ok(rows.into_iter().filter_map(|r| r.merged_at).collect())
}

/// 每一张 issue 的建立时刻与关闭时刻(没关就是 `None`),新的在前。
/// **不含 PR** —— `gh issue list` 本身就把 PR 排除在外。
///
/// 复算:`gh issue list -R <仓> --state all --json createdAt,closedAt --limit 1000`
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

/// `gh <子命令…> --repo <仓> --limit <上限> --json <字段>` 的公共壳。
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

// ───────────────────────── issue + release ─────────────────────────
//
// V4 数据层:issue 状态/排期/版本正本搬到 github issue + 标签。下面五个
// 函数都是 `gh issue/release` 子命令的无状态 shell-out,和本模块其余函数
// 同形(`--repo <owner/repo>` + `--json` 选字段)。不碰 SQLite,不碰调用方
// (加性)。gh 的 issue 号即 `number`,无 `iid` 概念,故 `RemoteIssue.iid =
// number`。

/// `gh issue create --repo <r> --title <t> --body <b> [--label l1 --label l2 …]`
/// → 新 issue 的 `number`(URL 末段,对标 codehub 的 `iid`)。成功时 gh 把
/// 新 issue 的 URL 打到 stdout(如 `https://github.com/owner/repo/issues/42`),
/// 号即 URL 末段——与 [`create_pr_on_branch`] 同形解析。调它真开 issue,
/// 只在创建流调,绝不自动。
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

/// 改一张 issue 的标签和/或状态。`labels` 走 **namespace-replace** 语义:
/// 对每个入参 label 算前缀([`crate::remote::label_prefix`]),把 issue 现有
/// labels 里前缀命中的摘掉,再把入参全加上(裸 label 无前缀,只加不摘)。
/// 这样调 `update_issue(n, Some(&["bw:status:inprogress"]), None)` 只把
/// `bw:status:*` 换成 `inprogress`,`bw:plan:*`/`bw:released:*` 不动。
///
/// gh 没有 set-absolute 标签旗标,`--add-label` 是追加、`--remove-label` 是
/// 摘除——为了凑出 namespace-replace,得多 list 一次现有 labels 再算 diff,
/// 一次 `gh issue edit` 同时带 `--remove-label`/`--add-label` 发出去(gh
/// 支持同一次调用里重复这两个旗标)。`state_event` 走 `gh issue close`/
/// `gh issue reopen`(子命令,不是旗标)。`labels=None` 且 `state_event=None`
/// 是 no-op(直接 `Ok(())`,不发调用)。幂等: 关一张已关的 issue 是 no-op 成功。
pub async fn update_issue(
    owner_repo: &str,
    number: u32,
    labels: Option<&[&str]>,
    state_event: Option<crate::remote::IssueStateEvent>,
) -> Result<(), GithubError> {
    let num_s = number.to_string();
    // 1. 标签:namespace-replace(gh 无 set-absolute,得现读再算 diff)
    if let Some(lbls) = labels {
        if !lbls.is_empty() {
            // 1a. list 现有 labels(gh --jq 对字符串输出是不带引号一行一个)
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
            // 1b. 算 remove / add
            let input_prefixes: std::collections::HashSet<&str> = lbls
                .iter()
                .filter_map(|&l| crate::remote::label_prefix(l))
                .collect();
            let current_set: std::collections::HashSet<&str> =
                current.iter().map(|s| s.as_str()).collect();
            let input_set: std::collections::HashSet<&str> = lbls.iter().copied().collect();
            // 摘:现有 label 前缀命中入参前缀集合,且它本身不在入参里(值相同
            // 的留着不摘,免得摘了又加同一条——gh 对已摘的再 --add-label 合法,
            // 对已存在的再 --add-label 会报错,这样算最干净)。
            let mut remove: Vec<&str> = Vec::new();
            for c in &current {
                if let Some(p) = crate::remote::label_prefix(c) {
                    if input_prefixes.contains(p) && !input_set.contains(c.as_str()) {
                        remove.push(c.as_str());
                    }
                }
            }
            // 加:入参里现有已经有的不加(gh 对已存在 label 报错)
            let mut add: Vec<&str> = Vec::new();
            for l in crate::remote::filter_persistent_labels(lbls) {
                if !current_set.contains(l) {
                    add.push(l);
                }
            }
            // 1c. 一次 gh issue edit 同时 --remove-label/--add-label
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
    // 2. 状态(有就发 close/reopen 子命令)
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

/// `gh issue list --repo <r> [--state open|closed|all] [--label l1 --label l2 …]
/// --limit 200 --json number,title,state,labels` → 只读 issue 列表。
/// `state=None` = `all`(两态都要)。`labels` 取交集。gh 的 `state` 回大写
/// (`"OPEN"`/`"CLOSED"`),**不归一化**——归一化是上层的事。github 无 `iid`,
/// 故 `RemoteIssue.iid = number`。`labels` 在 gh payload 里是 `{name}` 对象
/// 数组,这里拍平成 `Vec<String>`;责任人字段名是复数 `assignees`(数组),
/// 取第一个 login 当单责任人。
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
    // tokio_cmd 要 &[&str]/Vec<String> 转 OsString;这里先把 Vec<String> 拼成
    // Vec<&str> 不行(生命周期),故用 args(&[String]) 的重载。
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

/// `gh issue view <n> --repo <r> --json number,title,state,labels,body`
/// → 单条 issue 带正文。list_issues 不带正文,要正文走这条。
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

/// 改责任人:先 `gh issue view <n> --json assignees` 读当前指派,再一条
/// `gh issue edit <n> --repo <r> [--remove-assignee 旧…] [--add-assignee 新]`。
/// 空串 = 摘掉全部指派。
///
/// gh 没有「替换指派」的开关,`--add-assignee` 只叠加;不先摘旧的,产品这边
/// 的单责任人会变成两个人,而读回取数组第一个,看起来就是「改了没生效」。
/// `--remove-assignee` 只认真实 login(只有 `@me`/`@copilot` 是特殊值),
/// 所以摘人必须先读回当前 login 列表,不能拿通配符糊弄。
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

/// `gh issue view <n> --repo <r> --json assignees` → 当前指派的 login 列表。
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

/// `gh api user --jq .login` → 当前登录用户。认不出返错。
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

/// `gh issue edit <n> --repo <r> --title <t> --body <b>`。
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
    /// gh 只给 `assignees` 数组(2.98 起没有单数 `assignee` 了)。BW 的活是单人
    /// 负责制,取第一个。
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

/// gh 的 issue 只有复数 `assignees`(数组),没有单数 `assignee` 字段——写单数
/// 会被 gh 直接拒掉。产品模型是单责任人,故取数组第一个 login。
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

/// `gh release create <tag> --repo <r> --title <t> --notes <body>` → 打 tag +
/// 发版本。只在发版流调,绝不自动。tag 已存在时 gh 如实报错,不假装成功。
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

/// `gh issue comment <n> --repo <r> --body <text>` → 在 issue 上写一条评论。
/// 结构化产出挂评论,不动正文。
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

/// `gh api repos/{r}/issues/{n}/comments` → 旧的在前,只要正文。
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

/// `gh release list --repo <r> --json tagName --limit 200` → 所有版本的 tag
/// 串(只回 tag,正文/资源数留给上层另查)。`tagName` 是 gh release list 的
/// JSON 字段名(camelCase),这里 serde 重命名对齐。
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

// ─────────────── 派生一:GitHub ───────────────

impl From<GithubError> for RemoteError {
    fn from(e: GithubError) -> Self {
        match e {
            GithubError::NotInstalled => RemoteError::NotInstalled { cli: "gh" },
            GithubError::Command(m) => RemoteError::Cli(m),
        }
    }
}

/// 绑一个 GitHub 仓的远端实现。
///
/// `owner_repo` 是 `"owner/repo"`。**`github.com` 是隐含的** —— `gh` 是
/// github.com 全局的,从不收 host 参数,所以项目里存的 `remote_host="github.com"`
/// 只为对称/将来的 Enterprise 留着,这一臂每个调用都用不到它。
///
/// 接入流(还没选定仓)拿到的是一个 `owner_repo` 为空的实例:主机级那几个方法
/// 把仓路径当参数收,不看这个字段。
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

    /// 把 `"owner/repo"` 拆开 —— GitHub 的几个接口收的是拆开的两段。拆不开就
    /// **如实说这个地址不对**,不猜一个 owner。
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

    /// `gh` 没有对等的附件旗标 —— **附件忽略**,正文里应写清文件在哪。
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

    // 里程碑:GitHub 这一臂**不投**(基类默认实现就是不投,不用在这儿写空壳)。

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
