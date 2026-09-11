use crate::isoweek;
use std::path::Path;
use std::process::Stdio;

#[derive(Debug, thiserror::Error)]
pub enum GitError {
    #[error("工作区未配置")]
    NotConfigured,
    #[error("无法运行 git:{0}")]
    Spawn(String),
    #[error("git 失败:{0}")]
    Failed(String),
    #[error("认不出的 ISO 周:{0}")]
    BadWeek(String),
}

/// 仅统计当前分支可达的提交，不包含 --all。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct WeekCounts {
    pub commits: u32,
    pub merges: u32,
}

async fn git(workspace: &Path, args: &[&str]) -> Result<String, GitError> {
    if workspace.as_os_str().is_empty() {
        return Err(GitError::NotConfigured);
    }
    let out = bw_engine::tokio_cmd("git")
        .arg("-C")
        .arg(workspace)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| GitError::Spawn(e.to_string()))?;
    if !out.status.success() {
        return Err(GitError::Failed(
            String::from_utf8_lossy(&out.stderr).trim().to_string(),
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

pub async fn is_repo(workspace: &Path) -> bool {
    git(workspace, &["rev-parse", "--git-dir"]).await.is_ok()
}

pub async fn has_head(workspace: &Path) -> bool {
    git(workspace, &["rev-parse", "--verify", "HEAD"])
        .await
        .is_ok()
}

/// 只检查 HEAD 中的文件，未提交的同名文件不算。
pub async fn path_in_head(workspace: &Path, rel: &str) -> bool {
    match git(
        workspace,
        &["ls-tree", "-r", "--name-only", "HEAD", "--", rel],
    )
    .await
    {
        Ok(s) => s.lines().any(|l| l.trim() == rel),
        Err(_) => false,
    }
}

/// 一周的窗口,换算成本机时区的 unix 秒:`[周一 00:00, 下周一 00:00)`。
pub fn week_window(week: &str) -> Result<(i64, i64), GitError> {
    let (start, end) = isoweek::week_bounds(week).ok_or_else(|| GitError::BadWeek(week.into()))?;
    let at = |d: time::Date| {
        d.with_hms(0, 0, 0)
            .expect("00:00:00 一定合法")
            .assume_offset(isoweek::local_offset())
            .unix_timestamp()
    };
    Ok((at(start), at(end)))
}

/// 一天的窗口,换算成本机时区的 unix 秒:`[当天 00:00, 次日 00:00)`。
pub fn day_window(day: &str) -> Result<(i64, i64), GitError> {
    let start = isoweek::parse_ymd(day).ok_or_else(|| GitError::BadWeek(day.into()))?;
    let at = |d: time::Date| {
        d.with_hms(0, 0, 0)
            .expect("00:00:00 一定合法")
            .assume_offset(isoweek::local_offset())
            .unix_timestamp()
    };
    Ok((at(start), at(start + time::Duration::days(1))))
}

/// 遍历全部提交后按时间戳过滤；Git 日期过滤的边界和遍历剪枝会漏计。
pub async fn week_counts_many(
    workspace: &Path,
    weeks: &[String],
) -> Result<std::collections::HashMap<String, WeekCounts>, GitError> {
    stamp_counts_many(workspace, weeks).await
}

pub async fn stamp_counts_many(
    workspace: &Path,
    labels: &[String],
) -> Result<std::collections::HashMap<String, WeekCounts>, GitError> {
    let mut windows = Vec::with_capacity(labels.len());
    for label in labels {
        let win = if isoweek::is_week(label) {
            week_window(label)?
        } else {
            day_window(label)?
        };
        windows.push((label.clone(), win));
    }
    // 每行:`<unix 秒> <父提交…>`。父提交 ≥ 2 = 合入。
    let out = git(workspace, &["log", "--pretty=format:%ct %P"]).await?;
    let mut map: std::collections::HashMap<String, WeekCounts> = labels
        .iter()
        .map(|w| (w.clone(), WeekCounts::default()))
        .collect();
    for line in out.lines() {
        let mut fields = line.split_whitespace();
        let Some(ts) = fields.next().and_then(|t| t.parse::<i64>().ok()) else {
            continue;
        };
        let parents = fields.count();
        for (w, (since, until)) in &windows {
            if ts >= *since && ts < *until {
                let c = map.get_mut(w).expect("map 由同一份 labels 建出");
                c.commits += 1;
                if parents >= 2 {
                    c.merges += 1;
                }
                break;
            }
        }
    }
    Ok(map)
}

pub async fn commit_count(workspace: &Path) -> Result<u32, GitError> {
    let out = git(workspace, &["rev-list", "--all", "--count"]).await?;
    Ok(out.trim().parse().unwrap_or(0))
}

pub async fn tags(workspace: &Path) -> Result<Vec<String>, GitError> {
    let out = git(workspace, &["tag", "-l", "--sort=creatordate"]).await?;
    Ok(out
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}

pub async fn current_branch(workspace: &Path) -> Result<String, GitError> {
    // 空仓没有 HEAD，但仍可通过 symbolic-ref 获取分支名。
    match git(workspace, &["rev-parse", "--abbrev-ref", "HEAD"]).await {
        Ok(s) => Ok(s.trim().to_string()),
        Err(e) => match git(workspace, &["symbolic-ref", "--short", "HEAD"]).await {
            Ok(s) => Ok(s.trim().to_string()),
            Err(_) => Err(e),
        },
    }
}

pub async fn push_branch(workspace: &Path, branch: &str) -> Result<(), GitError> {
    git(workspace, &["push", "-u", "origin", branch]).await?;
    Ok(())
}

/// 只快进，不产生合并提交；分支分叉或更新失败时返回错误。
pub async fn pull_ff(workspace: &Path) -> Result<bool, GitError> {
    let before = head_sha(workspace).await?;
    let branch = current_branch(workspace).await?;
    // 显式 fetch 必定更新 FETCH_HEAD，远端跟踪引用则取决于 refspec。
    git(workspace, &["fetch", "origin", &branch]).await?;
    git(workspace, &["merge", "--ff-only", "FETCH_HEAD"]).await?;
    let after = head_sha(workspace).await?;
    Ok(before != after)
}

/// `pull_ff` 之后:本机比刚 fetch 的尖多几份提交。大于 0 = 本机比远端新。
pub async fn commits_ahead_of_fetch(workspace: &Path) -> Result<u32, GitError> {
    let out = git(workspace, &["rev-list", "--count", "FETCH_HEAD..HEAD"]).await?;
    Ok(out.trim().parse().unwrap_or(0))
}

pub async fn branch_exists(workspace: &Path, branch: &str) -> bool {
    git(
        workspace,
        &["rev-parse", "--verify", &format!("refs/heads/{branch}")],
    )
    .await
    .is_ok()
}

/// 调用方必须先确认远端已合入；squash 合并无法通过祖先关系判断，因此允许强制删除本地分支。
pub async fn delete_merged_branch(workspace: &Path, branch: &str) -> Result<(), GitError> {
    if git(workspace, &["branch", "-d", branch]).await.is_ok() {
        return Ok(());
    }
    git(workspace, &["branch", "-D", branch]).await?;
    Ok(())
}

/// 不使用 --force，防止检查后新出现的未提交改动被删除。
pub async fn worktree_remove(main_workspace: &Path, tree: &str) -> Result<(), GitError> {
    git(main_workspace, &["worktree", "remove", tree]).await?;
    let _ = git(main_workspace, &["worktree", "prune"]).await;
    Ok(())
}

/// 仅用于用户明确删除会话：会删除未提交的改动，完成后的自动清理不能调用。
pub async fn worktree_remove_force(main_workspace: &Path, tree: &str) -> Result<(), GitError> {
    git(main_workspace, &["worktree", "remove", "--force", tree]).await?;
    let _ = git(main_workspace, &["worktree", "prune"]).await;
    Ok(())
}

pub async fn is_dirty(workspace: &Path) -> Result<bool, GitError> {
    Ok(!git(workspace, &["status", "--porcelain"])
        .await?
        .trim()
        .is_empty())
}

pub async fn dirty_paths(workspace: &Path) -> Result<Vec<String>, GitError> {
    let raw = git(workspace, &["status", "--porcelain"]).await?;
    Ok(raw
        .lines()
        .filter_map(|l| {
            // porcelain: 两列状态 + 一个空格 + 路径。不能 trim 整行,否则
            // ` M path` 会变成 `M path`,切掉的就不是路径了。
            if l.len() < 4 {
                return None;
            }
            let path = l[3..].trim().trim_matches('"').replace('\\', "/");
            (!path.is_empty()).then_some(path)
        })
        .collect())
}

pub fn is_readings_dirt(paths: &[String]) -> bool {
    !paths.is_empty() && paths.iter().all(|p| is_readings_path(p))
}

fn is_readings_path(p: &str) -> bool {
    p == ".bw/metrics/readings.jsonl" || p == ".bw/metrics" || p.starts_with(".bw/metrics/")
}

/// 把一个路径恢复成 HEAD。未跟踪的文件这条会失败,调用方自己删。
pub async fn restore_path(workspace: &Path, rel: &str) -> Result<(), GitError> {
    git(workspace, &["restore", "--worktree", "--staged", "--", rel]).await?;
    Ok(())
}

/// 只暂存指定路径；没有暂存改动时 committed 为 false。
pub async fn commit_paths(
    workspace: &Path,
    paths: &[String],
    message: &str,
) -> Result<CommitOutcome, GitError> {
    let mut out = CommitOutcome::default();
    if paths.is_empty() {
        return Ok(out);
    }
    for p in paths {
        // 遵守项目的忽略规则，不强制添加被拒绝的文件。
        if git(workspace, &["add", "--", p]).await.is_err() {
            out.refused.push(p.clone());
        }
    }
    // 只检查暂存区，工作区中其他改动不属于本次提交。
    let staged = git(workspace, &["diff", "--cached", "--name-only"]).await?;
    if staged.trim().is_empty() {
        return Ok(out);
    }
    git(workspace, &["commit", "-m", message]).await?;
    out.committed = true;
    Ok(out)
}

/// 提交全部改动，仅用于属于当前工作的独立 worktree。
pub async fn commit_all(workspace: &Path, message: &str) -> Result<bool, GitError> {
    git(workspace, &["add", "-A"]).await?;
    let staged = git(workspace, &["diff", "--cached", "--name-only"]).await?;
    if staged.trim().is_empty() {
        return Ok(false);
    }
    // 保留以 # 开头的提交标题，不受用户的 commit.cleanup 配置影响。
    git(
        workspace,
        &["commit", "--cleanup=whitespace", "-m", message],
    )
    .await?;
    Ok(true)
}

pub async fn head_sha(workspace: &Path) -> Result<String, GitError> {
    Ok(git(workspace, &["rev-parse", "HEAD"])
        .await?
        .trim()
        .to_string())
}

/// base 传确定的提交 SHA，避免在不同 worktree 中解析分支名产生歧义。
pub async fn commits_ahead_of(workspace: &Path, base: &str) -> Result<u32, GitError> {
    let out = git(
        workspace,
        &["rev-list", "--count", &format!("{base}..HEAD")],
    )
    .await?;
    Ok(out.trim().parse().unwrap_or(0))
}

/// refused 为未能暂存的路径，调用方须展示。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CommitOutcome {
    pub committed: bool,
    pub refused: Vec<String>,
}

pub async fn root_commit_author(workspace: &Path) -> Result<String, GitError> {
    let roots = git(workspace, &["rev-list", "--max-parents=0", "HEAD"]).await?;
    let Some(first) = roots.lines().last().map(str::trim) else {
        return Ok(String::new());
    };
    Ok(git(workspace, &["log", "-1", "--pretty=format:%an", first])
        .await?
        .trim()
        .to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangedFile {
    /// 两个字母的状态码,如 `" M"`、`"??"`、`"A "`。
    pub code: String,
    pub path: String,
}

impl ChangedFile {
    pub fn label(&self) -> String {
        match self.code.trim() {
            "M" => "改过".into(),
            "A" => "新加".into(),
            "D" => "删了".into(),
            "R" => "改名".into(),
            "??" => "没跟踪".into(),
            other => other.to_string(),
        }
    }
}

pub async fn changed_files(workspace: &Path) -> Result<Vec<ChangedFile>, GitError> {
    // -z 保留空格和非 ASCII 路径，避免 Git 引号转义影响后续 pathspec。
    let out = git(workspace, &["status", "--porcelain", "-z"]).await?;
    let mut fields = out.split('\0').filter(|f| !f.is_empty());
    let mut rows = Vec::new();
    while let Some(entry) = fields.next() {
        if entry.len() < 4 {
            continue;
        }
        let code = entry[..2].to_string();
        let path = entry[3..].to_string();
        // 重命名和复制记录多一个原路径字段，需消费后再读取下一条。
        if code.starts_with('R') || code.starts_with('C') {
            let _ = fields.next();
        }
        rows.push(ChangedFile { code, path });
    }
    Ok(rows)
}

/// 单个文件的 diff 正文。没跟踪的文件 `git diff` 是空的——这时退回整份文件
/// 内容并在头部标一行,而不是给人看一片空白。
pub async fn file_diff(workspace: &Path, rel: &str) -> Result<String, GitError> {
    let tracked = git(workspace, &["ls-files", "--error-unmatch", rel])
        .await
        .is_ok();
    if !tracked {
        let body = std::fs::read_to_string(workspace.join(rel)).unwrap_or_default();
        return Ok(format!("(这个文件还没进版本控制,下面是它的全文)\n\n{body}"));
    }
    let staged = git(workspace, &["diff", "--cached", "--", rel])
        .await
        .unwrap_or_default();
    let unstaged = git(workspace, &["diff", "--", rel])
        .await
        .unwrap_or_default();
    let both = format!("{staged}{unstaged}");
    if both.trim().is_empty() {
        return Ok("(相对上次提交没有改动)".into());
    }
    Ok(both)
}

/// 分支与主干的领先/落后。拿不到就是拿不到(没有上游、没有主干),返回
/// `None`,界面显示「—」,不显示 0。
pub async fn ahead_behind(workspace: &Path, base: &str) -> Option<(u32, u32)> {
    let out = git(
        workspace,
        &[
            "rev-list",
            "--left-right",
            "--count",
            &format!("{base}...HEAD"),
        ],
    )
    .await
    .ok()?;
    let mut it = out.split_whitespace();
    let behind: u32 = it.next()?.parse().ok()?;
    let ahead: u32 = it.next()?.parse().ok()?;
    Some((ahead, behind))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub rel: String,
    pub name: String,
    pub is_dir: bool,
}

pub fn list_dir(workspace: &Path, rel: &str) -> Vec<TreeEntry> {
    const SKIP: &[&str] = &[".git", "target", "node_modules"];
    let dir = if rel.is_empty() {
        workspace.to_path_buf()
    } else {
        workspace.join(rel)
    };
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out: Vec<TreeEntry> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if SKIP.contains(&name.as_str()) {
                return None;
            }
            let is_dir = e.file_type().ok()?.is_dir();
            let rel = if rel.is_empty() {
                name.clone()
            } else {
                format!("{rel}/{name}")
            };
            Some(TreeEntry { rel, name, is_dir })
        })
        .collect();
    out.sort_by(|a, b| (!a.is_dir, &a.name).cmp(&(!b.is_dir, &b.name)));
    out
}

pub async fn first_commit_date(workspace: &Path) -> Option<String> {
    let out = git(
        workspace,
        &["log", "--reverse", "--date=short", "--pretty=format:%ad"],
    )
    .await
    .ok()?;
    out.lines().next().map(|s| s.trim().to_string())
}

pub async fn tags_with_dates(workspace: &Path) -> Vec<(String, String)> {
    let Ok(out) = git(
        workspace,
        &[
            "for-each-ref",
            "--sort=creatordate",
            "--format=%(refname:short)\t%(committerdate:short)",
            "refs/tags",
        ],
    )
    .await
    else {
        return Vec::new();
    };
    out.lines()
        .filter_map(|l| {
            let (tag, date) = l.split_once('\t')?;
            Some((tag.trim().to_string(), date.trim().to_string()))
        })
        .collect()
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Artifact {
    pub path: String,
    pub commit: String,
    pub subject: String,
    pub issue_number: Option<u32>,
}

/// 最多读取 max_commits 个提交，每个文件保留最近一次变更。
pub async fn artifacts(workspace: &Path, max_commits: usize) -> Result<Vec<Artifact>, GitError> {
    let out = git(
        workspace,
        &[
            "log",
            &format!("-n{max_commits}"),
            "--name-only",
            "--no-merges",
            "--pretty=format:\x1e%h\x1f%s",
        ],
    )
    .await?;

    let mut seen: Vec<Artifact> = Vec::new();
    for chunk in out.split('\x1e') {
        let chunk = chunk.trim_start_matches('\n');
        if chunk.is_empty() {
            continue;
        }
        let mut lines = chunk.lines();
        let Some(head) = lines.next() else { continue };
        let (commit, subject) = head.split_once('\x1f').unwrap_or((head, ""));
        let issue_number = parse_issue_number(subject);
        for path in lines.filter(|l| !l.trim().is_empty()) {
            if seen.iter().any(|a| a.path == path) {
                continue;
            }
            seen.push(Artifact {
                path: path.to_string(),
                commit: commit.to_string(),
                subject: subject.to_string(),
                issue_number,
            });
        }
    }
    Ok(seen)
}

/// 从提交消息里找 `#<号>`。找不到就 `None`,**不猜**。
fn parse_issue_number(subject: &str) -> Option<u32> {
    let rest = subject.split_once('#')?.1;
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// 这个路径被 git 跟踪着没有。
///
/// 用 `ls-files`(跟踪着就打印路径,没跟踪就打印空)而不是 `--error-unmatch`:
/// 后者「没跟踪」和「git 根本没跑起来」都是非零退出,分不开。**分不开的时候
/// 返回 `Some(true)`** —— 这个判断的下游是删文件,拿不准就别删。
pub async fn is_tracked(workspace: &Path, rel: &str) -> bool {
    match git(workspace, &["ls-files", "--", rel]).await {
        Ok(out) => !out.trim().is_empty(),
        Err(_) => true,
    }
}
