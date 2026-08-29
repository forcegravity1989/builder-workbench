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
/// (见 [`crate::github::issue_branch`])。目录忽略提交(被管仓开工时由
/// [`provision_issue_worktree`] 补 `.bw/worktrees/` 这一行进 `.gitignore`)。
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

/// 被管仓的 `.gitignore` 没有 `.bw/worktrees/` 这一行就补一行(只补这一行,
/// 不改人别的 ignore;文件不在就新建一份只含这一行)。本仓已有则不动。
/// **不要忽略整个 `.bw/`** —— `.bw/` 里还有正本(指标定义、名片、issue-policy)。
fn ensure_worktree_ignored(main_workspace: &Path) {
    let gitignore = main_workspace.join(".gitignore");
    let line = ".bw/worktrees/";
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == line) {
        return;
    }
    let mut text = existing;
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(line);
    text.push('\n');
    let _ = std::fs::write(&gitignore, text);
}

/// 给一张活开(或接着用)一棵 git worktree。新树落 `<仓根>/.bw/worktrees/issue-<n>`,
/// 分支 `bw/issue-<n>`(已存在则 `worktree add <path> <branch>`)。**旧平级兄弟
/// 不迁、不删**:先 [`resolve_issue_worktree`] 找已有活树(含旧兄弟),有就原样
/// 返回,不建第二棵;没有才在新路径建。主工作区留在 master 上,只有活树带 issue 分支。
pub async fn provision_issue_worktree(
    main_workspace: &Path,
    issue_number: u32,
) -> Result<PathBuf, ProvisionError> {
    let branch = crate::github::issue_branch(issue_number);
    // 不管复用旧树还是建新树,被管仓都该忽略 .bw/worktrees/ —— 补一行(幂等)。
    ensure_worktree_ignored(main_workspace);
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

/// 读数账本 worktree 的兄弟目录:`<主仓名>-bw-ledger`。B/C 采和手填写这里,
/// 不写人的主检出。`None` = 主工作区没有上级或名字不是 UTF-8。
pub fn ledger_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    let parent = main_workspace.parent()?;
    let stem = main_workspace.file_name().and_then(|n| n.to_str())?;
    Some(parent.join(format!("{stem}-bw-ledger")))
}

/// 账本分支名。固定一条,所有项目各自一棵树,互不撞。
pub const LEDGER_BRANCH: &str = "bw/ledger";

/// 给这个项目开(或接着用)读数账本 worktree。已经在就原样返回,不开第二次。
///
/// 不是 git 仓 / 没有 HEAD 时返回 `Err`,调用方退到同路径的普通目录(仍不写主检出)。
pub async fn provision_ledger_worktree(main_workspace: &Path) -> Result<PathBuf, ProvisionError> {
    let sibling = ledger_worktree_path(main_workspace).ok_or_else(|| {
        ProvisionError::CreateDir(format!(
            "算不出账本 worktree 路径(主工作区没有上级目录,或者目录名不是 UTF-8):{}",
            main_workspace.display()
        ))
    })?;
    if sibling.join(".git").exists() {
        return Ok(sibling);
    }
    let sibling_str = sibling
        .to_str()
        .ok_or_else(|| {
            ProvisionError::CreateDir(format!("账本 worktree 路径非 UTF-8:{}", sibling.display()))
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
        &["worktree", "add", "-b", LEDGER_BRANCH, &sibling_str],
    )
    .await
    .is_err()
    {
        git_in(
            main_workspace,
            &["worktree", "add", &sibling_str, LEDGER_BRANCH],
        )
        .await?;
    }
    Ok(sibling)
}

/// One file's real change stat between two commits (`git diff --numstat`).
/// Binary files (numstat prints `-`) record 0/0 — present, size unknown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub added: u32,
    pub deleted: u32,
}
