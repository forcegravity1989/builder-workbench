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

pub fn issue_worktree_path(main_workspace: &Path, issue_number: u32) -> Option<PathBuf> {
    Some(
        main_workspace
            .join(".bw")
            .join("worktrees")
            .join(format!("issue-{issue_number}")),
    )
}

pub fn legacy_issue_worktree_path(main_workspace: &Path, issue_number: u32) -> Option<PathBuf> {
    let parent = main_workspace.parent()?;
    let stem = main_workspace.file_name().and_then(|n| n.to_str())?;
    Some(parent.join(format!("{stem}-issue-{issue_number}")))
}

/// 按会话记录、新目录、旧目录依次查找已有工作树，不创建目录。
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

/// 创建独立 issue 工作树；已有分支或工作树时复用。
pub async fn provision_issue_worktree(
    main_workspace: &Path,
    issue_number: u32,
) -> Result<PathBuf, ProvisionError> {
    let branch = issue_branch(issue_number);
    if let Some(existing) = resolve_issue_worktree(main_workspace, issue_number, None) {
        return Ok(existing);
    }
    let tree_path = issue_worktree_path(main_workspace, issue_number).ok_or_else(|| {
        ProvisionError::CreateDir(format!("算不出 worktree 路径:{}", main_workspace.display()))
    })?;
    let tree_str = tree_path.to_str().ok_or_else(|| {
        ProvisionError::CreateDir(format!("worktree 路径非 UTF-8:{}", tree_path.display()))
    })?;
    // 在项目约定合入前，也需通过本机 Git 忽略工作树目录。
    ensure_local_worktree_exclude(main_workspace).await?;
    let parent = tree_path.parent().unwrap_or(Path::new(""));
    std::fs::create_dir_all(parent)
        .map_err(|e| ProvisionError::CreateDir(format!("建 .bw/worktrees 目录没成:{e}")))?;
    // 只可清理空目录；存在文件时拒绝，避免删除未提交改动。
    if tree_path.exists() && !tree_path.join(".git").exists() {
        let empty = std::fs::read_dir(&tree_path)
            .map(|mut rows| rows.next().is_none())
            .unwrap_or(false);
        if !empty {
            return Err(ProvisionError::CreateDir(format!(
                "worktree 目录已经存在且不是 Git worktree,为保护文件不会覆盖或删除:{}",
                tree_path.display()
            )));
        }
        std::fs::remove_dir(&tree_path)
            .map_err(|e| ProvisionError::CreateDir(format!("清理空 worktree 目录失败:{e}")))?;
    }
    let _ = crate::win_cmd::tokio_cmd("git")
        .current_dir(main_workspace)
        .args(["worktree", "prune"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
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

pub fn pack_worktree_path(main_workspace: &Path, version: &str) -> PathBuf {
    main_workspace
        .join(".bw")
        .join("worktrees")
        .join(format!("pack-{version}"))
}

/// 检出同名 tag 到独立 worktree。已有这棵树就拨回 tag;拨不回去就拆掉再建。
/// **不写主检出**。`version` 调用方已拒过路径分隔符。
pub async fn provision_pack_worktree(
    main_workspace: &Path,
    version: &str,
) -> Result<PathBuf, ProvisionError> {
    let _ = git_in(main_workspace, &["fetch", "origin", "--tags"]).await;
    let tag_ref = format!("refs/tags/{version}");
    git_in(main_workspace, &["rev-parse", "--verify", &tag_ref])
        .await
        .map_err(|_| ProvisionError::Git(format!("本地没有 tag {version},先 fetch 或先发版本")))?;
    let tree_path = pack_worktree_path(main_workspace, version);
    let tree_str = tree_path.to_str().ok_or_else(|| {
        ProvisionError::CreateDir(format!("worktree 路径非 UTF-8:{}", tree_path.display()))
    })?;
    let parent = tree_path.parent().unwrap_or(Path::new(""));
    std::fs::create_dir_all(parent)
        .map_err(|e| ProvisionError::CreateDir(format!("建 .bw/worktrees 目录没成:{e}")))?;
    let _ = crate::win_cmd::tokio_cmd("git")
        .current_dir(main_workspace)
        .args(["worktree", "prune"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    if tree_path.join(".git").exists() {
        if git_in(&tree_path, &["checkout", "--detach", version])
            .await
            .is_ok()
        {
            return Ok(tree_path);
        }
        let _ = git_in(main_workspace, &["worktree", "remove", "--force", tree_str]).await;
        let _ = std::fs::remove_dir_all(&tree_path);
    } else if tree_path.exists() {
        let _ = std::fs::remove_dir_all(&tree_path);
    }
    git_in(
        main_workspace,
        &["worktree", "add", "--detach", tree_str, version],
    )
    .await?;
    Ok(tree_path)
}

pub const LEDGER_BRANCH: &str = "bw/ledger";
pub const PROJECT_BRANCH: &str = "bw/project";
pub const WEEK_PLAN_BRANCH: &str = "bw/week-plan";
pub const OPS_AUDIT_BRANCH: &str = "bw/ops-audit";

/// 常驻分支及其工作树在工作完成后保留。
pub fn is_standing_branch(branch: &str) -> bool {
    matches!(
        branch,
        PROJECT_BRANCH | LEDGER_BRANCH | WEEK_PLAN_BRANCH | OPS_AUDIT_BRANCH
    )
}

fn standing_worktree_path(main_workspace: &Path, name: &str) -> Option<PathBuf> {
    Some(main_workspace.join(".bw").join("worktrees").join(name))
}

fn legacy_sibling_worktree_path(main_workspace: &Path, suffix: &str) -> Option<PathBuf> {
    let parent = main_workspace.parent()?;
    let stem = main_workspace.file_name().and_then(|n| n.to_str())?;
    Some(parent.join(format!("{stem}-{suffix}")))
}

pub fn ledger_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    standing_worktree_path(main_workspace, "ledger")
}

pub fn project_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    standing_worktree_path(main_workspace, "project")
}

pub fn week_plan_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    standing_worktree_path(main_workspace, "week-plan")
}

pub fn ops_audit_worktree_path(main_workspace: &Path) -> Option<PathBuf> {
    standing_worktree_path(main_workspace, "ops-audit")
}

async fn git_text(dir: &Path, args: &[&str]) -> Result<String, ProvisionError> {
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
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn ensure_local_worktree_exclude(main_workspace: &Path) -> Result<(), ProvisionError> {
    let raw = git_text(main_workspace, &["rev-parse", "--git-path", "info/exclude"]).await?;
    let path = {
        let p = PathBuf::from(raw);
        if p.is_absolute() {
            p
        } else {
            main_workspace.join(p)
        }
    };
    let mut body = std::fs::read_to_string(&path).unwrap_or_default();
    if body.lines().any(|line| line.trim() == "/.bw/worktrees/") {
        return Ok(());
    }
    if !body.is_empty() && !body.ends_with('\n') {
        body.push('\n');
    }
    body.push_str("/.bw/worktrees/\n");
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| ProvisionError::Write(format!("建 git info 目录失败:{e}")))?;
    }
    std::fs::write(&path, body)
        .map_err(|e| ProvisionError::Write(format!("写本机 worktree ignore 失败:{e}")))
}

async fn registered_worktree_branch(
    main_workspace: &Path,
    target: &Path,
) -> Result<Option<String>, ProvisionError> {
    let target = std::fs::canonicalize(target)
        .map_err(|e| ProvisionError::Git(format!("读 worktree 真路径失败:{e}")))?;
    let raw = git_text(main_workspace, &["worktree", "list", "--porcelain"]).await?;
    let mut path: Option<PathBuf> = None;
    for line in raw.lines().chain(std::iter::once("")) {
        if let Some(v) = line.strip_prefix("worktree ") {
            path = std::fs::canonicalize(v).ok();
        } else if let Some(v) = line.strip_prefix("branch refs/heads/") {
            if path.as_deref() == Some(target.as_path()) {
                return Ok(Some(v.to_string()));
            }
        } else if line.is_empty() && path.as_deref() == Some(target.as_path()) {
            return Ok(None);
        }
    }
    Ok(None)
}

async fn provision_standing_worktree(
    main_workspace: &Path,
    target: PathBuf,
    legacy: Option<PathBuf>,
    branch: &str,
    what: &str,
) -> Result<PathBuf, ProvisionError> {
    if let Some(old) = legacy.filter(|p| p.exists()) {
        return Err(ProvisionError::CreateDir(format!(
            "发现旧的{what} worktree:{}。Workbench 不迁、不删现有劳动成果;请先在 Git 中收尾并移除旧 worktree,再重试",
            old.display()
        )));
    }
    if target.join(".git").exists() {
        return match registered_worktree_branch(main_workspace, &target).await? {
            Some(found) if found == branch => Ok(target),
            Some(found) => Err(ProvisionError::Git(format!(
                "{what}目录已经是分支 {found} 的 worktree,预期是 {branch}:{}",
                target.display()
            ))),
            None => Err(ProvisionError::Git(format!(
                "{what}目录里有 Git 仓,但不是当前项目登记的 {branch} worktree:{}",
                target.display()
            ))),
        };
    }
    if target.exists() {
        let empty = std::fs::read_dir(&target)
            .map(|mut rows| rows.next().is_none())
            .unwrap_or(false);
        if !empty {
            return Err(ProvisionError::CreateDir(format!(
                "{what}目录已经存在且不是 worktree,为保护文件不会覆盖或删除:{}",
                target.display()
            )));
        }
        std::fs::remove_dir(&target)
            .map_err(|e| ProvisionError::CreateDir(format!("清理空的{what}目录失败:{e}")))?;
    }
    ensure_local_worktree_exclude(main_workspace).await?;
    let parent = target.parent().ok_or_else(|| {
        ProvisionError::CreateDir(format!("算不出{what}目录的上级:{}", target.display()))
    })?;
    std::fs::create_dir_all(parent)
        .map_err(|e| ProvisionError::CreateDir(format!("建 .bw/worktrees 目录没成:{e}")))?;
    let target_str = target
        .to_str()
        .ok_or_else(|| {
            ProvisionError::CreateDir(format!("{what} worktree 路径非 UTF-8:{}", target.display()))
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
    if git_in(
        main_workspace,
        &["worktree", "add", "-b", branch, &target_str],
    )
    .await
    .is_err()
    {
        git_in(main_workspace, &["worktree", "add", &target_str, branch]).await?;
    }
    Ok(target)
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

pub async fn provision_project_worktree(main_workspace: &Path) -> Result<PathBuf, ProvisionError> {
    let target = sibling_or_err(
        main_workspace,
        project_worktree_path(main_workspace),
        "项目约定",
    )?;
    provision_standing_worktree(
        main_workspace,
        target,
        legacy_sibling_worktree_path(main_workspace, "bw-project"),
        PROJECT_BRANCH,
        "项目约定",
    )
    .await
}

pub async fn provision_ledger_worktree(main_workspace: &Path) -> Result<PathBuf, ProvisionError> {
    let target = sibling_or_err(main_workspace, ledger_worktree_path(main_workspace), "账本")?;
    provision_standing_worktree(
        main_workspace,
        target,
        legacy_sibling_worktree_path(main_workspace, "bw-ledger"),
        LEDGER_BRANCH,
        "账本",
    )
    .await
}

pub async fn provision_week_plan_worktree(
    main_workspace: &Path,
) -> Result<PathBuf, ProvisionError> {
    let target = sibling_or_err(
        main_workspace,
        week_plan_worktree_path(main_workspace),
        "定版本计划",
    )?;
    provision_standing_worktree(
        main_workspace,
        target,
        legacy_sibling_worktree_path(main_workspace, "bw-week-plan"),
        WEEK_PLAN_BRANCH,
        "定版本计划",
    )
    .await
}

pub async fn provision_ops_audit_worktree(
    main_workspace: &Path,
) -> Result<PathBuf, ProvisionError> {
    let target = sibling_or_err(
        main_workspace,
        ops_audit_worktree_path(main_workspace),
        "资产盘点",
    )?;
    provision_standing_worktree(
        main_workspace,
        target,
        legacy_sibling_worktree_path(main_workspace, "bw-ops-audit"),
        OPS_AUDIT_BRANCH,
        "资产盘点",
    )
    .await
}

/// One file's real change stat between two commits (`git diff --numstat`).
/// Binary files (numstat prints `-`) record 0/0 — present, size unknown.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FileChange {
    pub path: String,
    pub added: u32,
    pub deleted: u32,
}

/// 按远端项目内 issue 编号生成工作分支名。
pub fn issue_branch(github_number: u32) -> String {
    format!("bw/issue-{github_number}")
}

/// 未配置 origin 时返回 None。
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
    use super::{
        ledger_worktree_path, ops_audit_worktree_path, parse_git_remote_url, project_worktree_path,
        provision_project_worktree, provision_week_plan_worktree, week_plan_worktree_path,
    };
    use std::path::Path;

    #[test]
    fn standing_worktrees_stay_under_the_project() {
        let repo = Path::new("D:/code/project-a");
        assert_eq!(
            project_worktree_path(repo).unwrap(),
            repo.join(".bw/worktrees/project")
        );
        assert_eq!(
            ledger_worktree_path(repo).unwrap(),
            repo.join(".bw/worktrees/ledger")
        );
        assert_eq!(
            week_plan_worktree_path(repo).unwrap(),
            repo.join(".bw/worktrees/week-plan")
        );
        assert_eq!(
            ops_audit_worktree_path(repo).unwrap(),
            repo.join(".bw/worktrees/ops-audit")
        );
    }

    #[tokio::test]
    async fn provisions_inside_repo_and_preserves_legacy_collision() {
        let root = std::env::temp_dir().join(format!("bw-standing-{}", uuid::Uuid::new_v4()));
        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        let git = |dir: &Path, args: &[&str]| {
            std::process::Command::new("git")
                .current_dir(dir)
                .args(args)
                .output()
                .unwrap()
        };
        assert!(git(&repo, &["init", "-q"]).status.success());
        std::fs::write(repo.join("README.md"), "seed\n").unwrap();
        assert!(git(&repo, &["add", "README.md"]).status.success());
        assert!(git(
            &repo,
            &[
                "-c",
                "user.name=Workbench Test",
                "-c",
                "user.email=workbench@example.invalid",
                "commit",
                "-q",
                "-m",
                "seed",
            ],
        )
        .status
        .success());

        let project_tree = provision_project_worktree(&repo).await.unwrap();
        assert_eq!(project_tree, repo.join(".bw/worktrees/project"));
        assert!(project_tree.join(".git").is_file());

        let legacy = root.join("repo-bw-week-plan");
        std::fs::create_dir_all(&legacy).unwrap();
        let sentinel = legacy.join("人的改动.txt");
        std::fs::write(&sentinel, "keep me").unwrap();
        let refused = provision_week_plan_worktree(&repo).await.unwrap_err();
        assert!(refused.to_string().contains("不迁、不删"));
        assert_eq!(std::fs::read_to_string(&sentinel).unwrap(), "keep me");

        let tree_arg = project_tree.display().to_string();
        let _ = git(&repo, &["worktree", "remove", "--force", &tree_arg]);
        std::fs::remove_dir_all(&root).unwrap();
    }

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
