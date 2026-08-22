//! `asset_root/sessions/<slug>/<iid>.jsonl` —— append-only 会话记录。
//!
//! 替代旧的 `claude_conversation` 表。每行一条 JSON 记录,按 `<slug>/<iid>.jsonl`
//! 路由。读按 iid 读文件、取最后一条(最新的状态);写追加一行。
//!
//! **append-only**:每次状态变化(建会话、拿到 `--resume` id)都追加一行,
//! 不改旧行。这样进程死了也能从文件里接回最后一次状态。同一张活的所有记录
//! 在同一个文件里,扫一遍就能看到完整历史。

use crate::model::{Conversation, ConversationId, IssueId, ProjectId};
use crate::repo::RepoFileError;
use std::path::{Path, PathBuf};

/// 一条会话记录(文件里的一行)。
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct Record {
    id: ConversationId,
    project_id: ProjectId,
    /// 远端 issue 号(数字)。存成 u32,不是字符串。
    iid: u32,
    claude_session_id: String,
    workspace_path: String,
    branch_name: String,
    created_at: i64,
    last_opened_at: i64,
}

impl Record {
    fn from_conversation(c: &Conversation) -> Self {
        Self {
            id: c.id,
            project_id: c.project_id,
            iid: c.issue_id.iid(),
            claude_session_id: c.claude_session_id.clone(),
            workspace_path: c.workspace_path.clone(),
            branch_name: c.branch_name.clone(),
            created_at: c.created_at,
            last_opened_at: c.last_opened_at,
        }
    }

    fn to_conversation(&self) -> Conversation {
        Conversation {
            id: self.id,
            project_id: self.project_id,
            issue_id: IssueId::from_remote(self.project_id, self.iid),
            claude_session_id: self.claude_session_id.clone(),
            workspace_path: self.workspace_path.clone(),
            branch_name: self.branch_name.clone(),
            created_at: self.created_at,
            last_opened_at: self.last_opened_at,
        }
    }
}

/// 会话文件的读写。无状态。
pub struct SessionStore;

impl SessionStore {
    /// 会话文件路径:`<asset_root>/sessions/<slug>/<iid>.jsonl`。
    fn path(asset_root: &Path, slug: &str, iid: u32) -> PathBuf {
        asset_root
            .join("sessions")
            .join(slug)
            .join(format!("{iid}.jsonl"))
    }

    /// 读一张活的会话(取文件里最后一条记录 = 最新状态)。
    /// 文件不存在 = 没有会话(`Ok(None)`)。
    pub fn read(
        asset_root: &Path,
        slug: &str,
        iid: u32,
    ) -> Result<Option<Conversation>, RepoFileError> {
        let path = Self::path(asset_root, slug, iid);
        let raw = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => {
                return Err(RepoFileError::Io {
                    path: path.display().to_string(),
                    source: e,
                });
            }
        };
        // 最后一条非空行 = 最新状态。
        let last = raw.lines().rfind(|l| !l.trim().is_empty());
        match last {
            None => Ok(None),
            Some(line) => {
                let rec: Record = serde_json::from_str(line).map_err(|e| RepoFileError::Shape {
                    path: path.display().to_string(),
                    why: format!("会话记录解析失败:{e}"),
                })?;
                Ok(Some(rec.to_conversation()))
            }
        }
    }

    /// 追加一条会话记录。父目录不存在就建。
    pub fn append(asset_root: &Path, slug: &str, c: &Conversation) -> Result<(), RepoFileError> {
        let path = Self::path(asset_root, slug, c.issue_id.iid());
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| RepoFileError::Io {
                path: path.display().to_string(),
                source: e,
            })?;
        }
        let rec = Record::from_conversation(c);
        let line = serde_json::to_string(&rec).map_err(|e| RepoFileError::Shape {
            path: path.display().to_string(),
            why: format!("会话记录序列化失败:{e}"),
        })?;
        // append:追加一行,不覆盖旧行。
        let mut content = line;
        content.push('\n');
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| RepoFileError::Io {
                path: path.display().to_string(),
                source: e,
            })?;
        file.write_all(content.as_bytes())
            .map_err(|e| RepoFileError::Io {
                path: path.display().to_string(),
                source: e,
            })?;
        Ok(())
    }

    /// 列出一个项目的全部会话(按 last_opened_at 降序)。
    /// 扫 `<asset_root>/sessions/<slug>/` 目录下所有 .jsonl 文件。
    pub fn list(asset_root: &Path, slug: &str) -> Result<Vec<Conversation>, RepoFileError> {
        let dir = asset_root.join("sessions").join(slug);
        let mut convs = Vec::new();
        let entries = match std::fs::read_dir(&dir) {
            Ok(d) => d,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => {
                return Err(RepoFileError::Io {
                    path: dir.display().to_string(),
                    source: e,
                });
            }
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "jsonl") {
                continue;
            }
            if let Ok(raw) = std::fs::read_to_string(&path) {
                if let Some(last) = raw.lines().rfind(|l| !l.trim().is_empty()) {
                    if let Ok(rec) = serde_json::from_str::<Record>(last) {
                        convs.push(rec.to_conversation());
                    }
                }
            }
        }
        convs.sort_by_key(|b| std::cmp::Reverse(b.last_opened_at));
        Ok(convs)
    }

    /// 删一个项目的全部会话文件(删项目时调)。
    pub fn remove_project(asset_root: &Path, slug: &str) {
        let dir = asset_root.join("sessions").join(slug);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
