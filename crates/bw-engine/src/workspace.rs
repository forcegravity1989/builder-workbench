//! Workspace provisioner — the all-in-one-codebase default's mechanical arm:
//! every project gets exactly one real git repo, and this module mints it
//! (directory + `git init` + one real first commit). The only *writing*
//! subprocess module in the engine; everything it creates is immediately
//! verifiable on disk (`.git/`, `README.md`, `git log`), nothing is staged
//! for later or simulated.

use std::path::{Path, PathBuf};
use std::process::Stdio;

#[derive(Debug, thiserror::Error)]
pub enum ProvisionError {
    #[error("创建目录失败:{0}")]
    CreateDir(String),
    #[error("git 命令失败:{0}")]
    Git(String),
    #[error("写初始文件失败:{0}")]
    Write(String),
}

pub(crate) async fn git_in(dir: &Path, args: &[&str]) -> Result<(), ProvisionError> {
    let output = crate::win_cmd::tokio_cmd("git")
        .current_dir(dir)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| ProvisionError::Git(e.to_string()))?;
    if !output.status.success() {
        return Err(ProvisionError::Git(format!(
            "git {} → {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }
    Ok(())
}

/// 一张活的 worktree 落哪。**唯一书写处**:新树落 `<仓根>/.bw/worktrees/issue-<n>`
/// (仓根 = `main_workspace` 被管仓检出,不是它的 parent)。分支仍 `bw/issue-<n>`
/// (见 [`crate::github::issue_branch`])。目录忽略提交靠项目约定树上的
/// `.bw/.gitignore`(写 `worktrees/`),不补主检出 `.gitignore`。
///
/// **旧平级兄弟不迁、不删**:V4 早期把树落在 `<parent>/<stem>-issue-<n>`,那些
/// 老树还在磁盘上、会话行里记的也是那条路径。接回/收尾时不能只看新路径 ——
/// 走 [`resolve_issue_worktree`]:会话记下的路径 → 新目录 → 旧兄弟,依次找。
pub fn issue_worktree_path(main_workspace: &Path, issue_number: u32) -> Option<PathBuf> {
    Some(
        main_workspace
            .join(".bw")
            .join("worktrees")
            .join(format!("issue-{issue_number}")),
    )
}

/// 旧平级兄弟路径 `<parent>/<stem>-issue-<n>`。**不写新树**,只供
/// [`resolve_issue_worktree`] 查找已存在的旧树(新活不会落到这里)。`None` =
/// 主工作区没有上级或名字不是 UTF-8。
pub fn legacy_issue_worktree_path(main_workspace: &Path, issue_number: u32) -> Option<PathBuf> {
    let parent = main_workspace.parent()?;
    let stem = main_workspace.file_name().and_then(|n| n.to_str())?;
    Some(parent.join(format!("{stem}-issue-{issue_number}")))
}

/// 找这张活的 worktree —— 先看会话记下的路径,再看新目录,再看旧平级兄弟。
/// **只查找,不新建**(新建走 [`provision_issue_worktree`])。三处都没有 → `None`。
///
/// `recorded` = 会话行里记的 `workspace_path`(旧活可能记的是平级兄弟)。判活树看
/// 目录在且有 `.git`(worktree 的 `.git` 是个文件不是目录,`exists()` 两者都认)。
pub fn resolve_issue_worktree(
    main_workspace: &Path,
    issue_number: u32,
    recorded: Option<&Path>,
) -> Option<PathBuf> {
    if let Some(p) = recorded {
        if p.is_dir() && p.join(".git").exists() {
            return Some(p.to_path_buf());
        }
    }
    if let Some(p) = issue_worktree_path(main_workspace, issue_number) {
        if p.join(".git").exists() {
            return Some(p);
        }
    }
    legacy_issue_worktree_path(main_workspace, issue_number).filter(|p| p.join(".git").exists())
}

/// 给一张活开(或接着用)一棵 git worktree。新树落 `<仓根>/.bw/worktrees/issue-<n>`,
/// 分支 `bw/issue-<n>`(已存在则 `worktree add <path> <branch>`)。**旧平级兄弟
/// 不迁、不删**:先 [`resolve_issue_worktree`] 找已有活树(含旧兄弟),有就原样
/// 返回,不建第二棵;没有才在新路径建。主工作区留在 master 上,只有活树带 issue 分支。
/// **不写主检出** —— `.bw/worktrees/` 的忽略靠项目约定树上的 `.bw/.gitignore`。
pub async fn provision_issue_worktree(
    main_workspace: &Path,
    issue_number: u32,
) -> Result<PathBuf, ProvisionError> {
    let branch = issue_branch(issue_number);
    // 先找:新目录或旧平级兄弟里已经有一棵活树就原样接着用,不迁、不建第二棵。
    if let Some(existing) = resolve_issue_worktree(main_workspace, issue_number, None) {
        return Ok(existing);
    }
    let tree_path = issue_worktree_path(main_workspace, issue_number).ok_or_else(|| {
        ProvisionError::CreateDir(format!("算不出 worktree 路径:{}", main_workspace.display()))
    })?;
    let tree_str = tree_path.to_str().ok_or_else(|| {
        ProvisionError::CreateDir(format!("worktree 路径非 UTF-8:{}", tree_path.display()))
    })?;
    // 新树落 <仓根>/.bw/worktrees/。先建好这个目录。
    let parent = tree_path.parent().unwrap_or(Path::new(""));
    std::fs::create_dir_all(parent)
        .map_err(|e| ProvisionError::CreateDir(format!("建 .bw/worktrees 目录没成:{e}")))?;
    // 上一次崩在 guard 的 Drop 前留下的空壳目录(没 .git)清掉,免得 add 顶回来。
    if tree_path.exists() && !tree_path.join(".git").exists() {
        let _ = std::fs::remove_dir_all(&tree_path);
    }
    let _ = crate::win_cmd::tokio_cmd("git")
        .current_dir(main_workspace)
        .args(["worktree", "prune"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    // 首次:worktree add -b <branch> <path>(从 main HEAD)。重试(分支已存在):
    // worktree add <path> <branch>。
    if git_in(
        main_workspace,
        &["worktree", "add", "-b", &branch, tree_str],
    )
    .await
    .is_err()
    {
        git_in(main_workspace, &["worktree", "add", tree_str, &branch]).await?;
    }
    Ok(tree_path)
}

/// 账本分支。B/C 读数写这里,不写人的主检出。
pub const LEDGER_BRANCH: &str = "bw/ledger";
/// 项目约定常驻分支。名片走这一条,合入后分支留着。
pub const PROJECT_BRANCH: &str = "bw/project";
/// 运作活①常驻分支。定版本计划的仓文件改动走这里。
pub const WEEK_PLAN_BRANCH: &str = "bw/week-plan";
/// 运作活②常驻分支。资产盘点的仓文件改动走这里。
pub const OPS_AUDIT_BRANCH: &str = "bw/ops-audit";

/// 常驻车:合入后树和分支都留着,结清活时不收。
pub fn is_standing_branch(branch: &str) -> bool {
    matches!(
        branch,
        PROJECT_BRANCH | LEDGER_BRANCH | WEEK_PLAN_BRANCH | OPS_AUDIT_BRANCH
    )
}

fn sibling_worktree_path(main_workspace: &Path, suffix: &str) -> Option<PathBuf> {
    let parent = main_workspace.parent()?;
    let stem = main_workspace.file_name().and_then(|n| n.to_str())?;
    Some(parent.join(format!("{stem}-{suffix}")))
}

/// 读数账本:`<主仓名>-bw-ledger`。
pub fn ledger_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    sibling_worktree_path(main_workspace, "bw-ledger")
}

/// 项目约定:`<主仓名>-bw-project`。
pub fn project_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    sibling_worktree_path(main_workspace, "bw-project")
}

/// 定版本计划:`<主仓名>-bw-week-plan`。
pub fn week_plan_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    sibling_worktree_path(main_workspace, "bw-week-plan")
}

/// 资产盘点:`<主仓名>-bw-ops-audit`。
pub fn ops_audit_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    sibling_worktree_path(main_workspace, "bw-ops-audit")
}

async fn provision_sibling_worktree(
    main_workspace: &Path,
    sibling: PathBuf,
    branch: &str,
    what: &str,
) -> Result<PathBuf, ProvisionError> {
    if sibling.join(".git").exists() {
        return Ok(sibling);
    }
    let sibling_str = sibling
        .to_str()
        .ok_or_else(|| {
            ProvisionError::CreateDir(format!(
                "{what} worktree 路径非 UTF-8:{}",
                sibling.display()
            ))
        })?
        .to_string();
    let _ = crate::win_cmd::tokio_cmd("git")
        .current_dir(main_workspace)
        .args(["worktree", "prune"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    if sibling.exists() && !sibling.join(".git").exists() {
        let _ = std::fs::remove_dir_all(&sibling);
    }
    if git_in(
        main_workspace,
        &["worktree", "add", "-b", branch, &sibling_str],
    )
    .await
    .is_err()
    {
        git_in(main_workspace, &["worktree", "add", &sibling_str, branch]).await?;
    }
    Ok(sibling)
}

fn sibling_or_err(
    main_workspace: &Path,
    path: Option<PathBuf>,
    what: &str,
) -> Result<PathBuf, ProvisionError> {
    path.ok_or_else(|| {
        ProvisionError::CreateDir(format!(
            "算不出{what} worktree 路径(主工作区没有上级目录,或者目录名不是 UTF-8):{}",
            main_workspace.display()
        ))
    })
}

/// 给这个项目开(或接着用)项目约定 worktree。已经在就原样返回,不开第二次。
pub async fn provision_project_worktree(main_workspace: &Path) -> Result<PathBuf, ProvisionError> {
    let sibling = sibling_or_err(
        main_workspace,
        project_worktree_path(main_workspace),
        "项目约定",
    )?;
    provision_sibling_worktree(main_workspace, sibling, PROJECT_BRANCH, "项目约定").await
}

/// 给这个项目开(或接着用)读数账本 worktree。已经在就原样返回,不开第二次。
pub async fn provision_ledger_worktree(main_workspace: &Path) -> Result<PathBuf, ProvisionError> {
    let sibling = sibling_or_err(main_workspace, ledger_worktree_path(main_workspace), "账本")?;
    provision_sibling_worktree(main_workspace, sibling, LEDGER_BRANCH, "账本").await
}

/// 运作活①常驻树。已经在就原样返回。
pub async fn provision_week_plan_worktree(
    main_workspace: &Path,
) -> Result<PathBuf, ProvisionError> {
    let sibling = sibling_or_err(
        main_workspace,
        week_plan_worktree_path(main_workspace),
        "定版本计划",
    )?;
    provision_sibling_worktree(main_workspace, sibling, WEEK_PLAN_BRANCH, "定版本计划").await
}

/// 运作活②常驻树。已经在就原样返回。
pub async fn provision_ops_audit_worktree(
    main_workspace: &Path,
) -> Result<PathBuf, ProvisionError> {
    let sibling = sibling_or_err(
        main_workspace,
        ops_audit_worktree_path(main_workspace),
        "资产盘点",
    )?;
    provision_sibling_worktree(main_workspace, sibling, OPS_AUDIT_BRANCH, "资产盘点").await
}

/// One file's real change stat between two commits (`git diff --numstat`).
/// Binary files (numstat prints `-`) record 0/0 — present, size unknown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub added: u32,
    pub deleted: u32,
}

// ─────────────── 分支命名与 git 远端地址(provider 中立) ───────────────
//
// 这三件跟「远端是 GitHub 还是 codehub」没关系:分支名是 Workbench 自己的约定,
// 两个远端地址函数问的是本机 git。放在 remote/ 里的任何一臂都会让另一臂(和
// 半个仓)为了拿一个分支名而 `use ...::github`,那正是两条线缠在一起的起点。

/// The work branch a run's changes live on for a given GitHub issue —
/// `bw/issue-<github_number>`. One deterministic branch per Issue so a retry
/// re-uses the same branch (and the same PR), never fans out.
pub fn issue_branch(github_number: u32) -> String {
    format!("bw/issue-{github_number}")
}

/// 读一个工作区的 `origin` 远端 URL。`Ok(None)` = 没配 `origin`(绑定本地
/// 目录建的项目的常态——`git remote get-url origin` 以非零退出,这不是
/// bug);其余 git 失败照实报错,这是一次真读,不吞错误。
pub async fn origin_remote_url(workspace: &Path) -> Result<Option<String>, ProvisionError> {
    let output = crate::win_cmd::tokio_cmd("git")
        .current_dir(workspace)
        .args(["remote", "get-url", "origin"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| ProvisionError::Git(e.to_string()))?;
    if !output.status.success() {
        // "fatal: No such remote 'origin'" — 没配远端,不是错误。
        return Ok(None);
    }
    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(if url.is_empty() { None } else { Some(url) })
}

/// 从 `git remote` URL 拆出 host 和 `owner/repo`。认 https / ssh / `git@host:path`。
///
/// 认不出返回 `None`,不猜。`.git` 后缀和末尾 `/` 会剥掉。
pub fn parse_git_remote_url(url: &str) -> Option<(String, String)> {
    let url = url.trim();
    if url.is_empty() {
        return None;
    }
    if let Some(rest) = url.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        let host = host.trim();
        if host.is_empty() {
            return None;
        }
        return Some((host.to_string(), strip_git_suffix(path)));
    }
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .or_else(|| url.strip_prefix("ssh://git@"))
        .or_else(|| url.strip_prefix("ssh://"))?;
    let rest = rest.strip_prefix("git@").unwrap_or(rest);
    let (hostport, path) = rest.split_once('/')?;
    let host = hostport.split(':').next()?.trim();
    if host.is_empty() || path.trim().is_empty() {
        return None;
    }
    Some((host.to_string(), strip_git_suffix(path)))
}

fn strip_git_suffix(path: &str) -> String {
    path.trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::parse_git_remote_url;

    #[test]
    fn parse_https_codehub_origin() {
        let (host, path) =
            parse_git_remote_url("https://codehub-dg-g.huawei.com/z30026659/workbench.git")
                .expect("https origin");
        assert_eq!(host, "codehub-dg-g.huawei.com");
        assert_eq!(path, "z30026659/workbench");
    }

    #[test]
    fn parse_ssh_and_git_at() {
        let a =
            parse_git_remote_url("git@codehub-dg-g.huawei.com:z30026659/workbench.git").unwrap();
        let b =
            parse_git_remote_url("ssh://git@codehub-dg-g.huawei.com:2222/z30026659/workbench.git")
                .unwrap();
        assert_eq!(
            a,
            (
                "codehub-dg-g.huawei.com".into(),
                "z30026659/workbench".into()
            )
        );
        assert_eq!(b, a);
    }
}
