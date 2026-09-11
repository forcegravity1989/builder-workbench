use std::process::Stdio;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WorkspaceEvidence {
    /// `git rev-list --count HEAD` — total commits. `0` on a repo with no
    /// commits yet (git errors there; treated as honest zero).
    pub commit_count: u32,
    pub tracked_files: u32,
    pub dirty_paths: u32,
    pub recent_subjects: Vec<String>,
    pub docs_files: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum EvidenceError {
    #[error("工作目录未配置")]
    NotConfigured,
    #[error("无法运行 git:{0}")]
    Spawn(String),
}

async fn git_stdout(workspace: &str, args: &[&str]) -> Result<Option<String>, EvidenceError> {
    let output = crate::win_cmd::tokio_cmd("git")
        .current_dir(workspace)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| EvidenceError::Spawn(e.to_string()))?;
    if !output.status.success() {
        return Ok(None);
    }
    Ok(Some(String::from_utf8_lossy(&output.stdout).into_owned()))
}

fn count_lines(s: &str) -> u32 {
    s.lines().filter(|l| !l.trim().is_empty()).count() as u32
}

pub async fn collect(workspace: &str) -> Result<WorkspaceEvidence, EvidenceError> {
    if workspace.trim().is_empty() {
        return Err(EvidenceError::NotConfigured);
    }

    let commit_count = git_stdout(workspace, &["rev-list", "--count", "HEAD"])
        .await?
        .and_then(|s| s.trim().parse::<u32>().ok())
        .unwrap_or(0);

    let ls_files = git_stdout(workspace, &["ls-files"])
        .await?
        .unwrap_or_default();
    let tracked_files = count_lines(&ls_files);
    let docs_files = ls_files
        .lines()
        .filter(|l| {
            let l = l.trim();
            l.starts_with("docs/") && l.ends_with(".md")
        })
        .count() as u32;

    let dirty_paths = git_stdout(workspace, &["status", "--porcelain"])
        .await?
        .map(|s| count_lines(&s))
        .unwrap_or(0);

    let recent_subjects = git_stdout(workspace, &["log", "--max-count=10", "--pretty=format:%s"])
        .await?
        .map(|s| {
            s.lines()
                .filter(|l| !l.trim().is_empty())
                .map(|l| l.to_string())
                .collect()
        })
        .unwrap_or_default();

    Ok(WorkspaceEvidence {
        commit_count,
        tracked_files,
        dirty_paths,
        recent_subjects,
        docs_files,
    })
}
