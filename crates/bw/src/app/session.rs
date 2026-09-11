use super::{App, AppError, Result};
use crate::command::Event;
use crate::model::IssueId;

impl App {
    /// 桌面执行入口使用 Orca；无界面调用使用 run_skill。
    pub fn with_pty(mut self) -> Self {
        self.pty_enabled = true;
        self
    }

    /// 尚未接入 Orca 停止接口；仅确认本机会话，不改变 issue 状态。
    pub(super) async fn cancel_run(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let _ = self.conversation_for_issue(id).await.ok().flatten();
        Ok(vec![Event::RunCancelled {
            id,
            was_live: false,
        }])
    }

    /// 显式删除本机会话及 worktree（含未提交改动）；远端 issue 保留。
    pub(super) async fn delete_session(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let Some(conv) = self.conversation_for_issue(id).await? else {
            return Err(AppError::Refused("此 Issue 没有本机会话".into()));
        };
        let mut note = String::from("已删除本机会话");
        let ws = self.workspace_of(id.project_id()).await?;
        let tree = std::path::PathBuf::from(&conv.workspace_path);
        if tree.is_dir() && tree != ws {
            if let Some(s) = tree.to_str() {
                match crate::git::worktree_remove_force(&ws, s).await {
                    Ok(()) => note.push_str("，已删除工作树"),
                    Err(e) => note.push_str(&format!("，删除工作树失败：{e}")),
                }
            }
        }
        if !conv.branch_name.is_empty() && crate::git::branch_exists(&ws, &conv.branch_name).await {
            let _ = crate::git::delete_merged_branch(&ws, &conv.branch_name).await;
        }
        let slug = self.slug_of(id.project_id()).await?;
        crate::local::SessionStore::remove_issue(&self.asset_root, &slug, id.iid())?;
        Ok(vec![Event::SessionDeleted { id, note }])
    }

    /// 仅切换已有会话的 worktree，不发送提示词、不改变 issue 状态。
    pub(super) async fn reopen_session(&mut self, id: IssueId) -> Result<Vec<Event>> {
        if !self.pty_enabled {
            return Err(AppError::Refused(
                "这个进程没开桌面 run 路径,接不回会话".into(),
            ));
        }
        let Some(conv) = self.conversation_for_issue(id).await? else {
            return Err(AppError::Refused(
                "此 Issue 尚无会话，请点击「▶开工」".into(),
            ));
        };
        let issue = self.issue_or_err(id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        if !ws.is_dir() {
            return Err(AppError::NoWorkspace(issue.project_id.uuid().to_string()));
        }
        let recorded = if conv.workspace_path.is_empty() {
            None
        } else {
            Some(std::path::PathBuf::from(&conv.workspace_path))
        };
        let Some(path) =
            bw_engine::workspace::resolve_issue_worktree(&ws, issue.number, recorded.as_deref())
        else {
            return Err(AppError::Refused(
                "找不到此 Issue 的工作树，请点击「▶开工」重新创建".into(),
            ));
        };
        let mut sid = conv.claude_session_id.clone();
        if sid.is_empty() {
            if let Some(found) = bw_engine::orca::session_id_for_worktree(&path) {
                sid = found;
            }
        }
        let rt = bw_engine::orca::connect()
            .map_err(|e| AppError::Exec(format!("连 Orca 没成,接不回会话:{e}")))?;
        if let Err(e) = bw_engine::orca::reveal_tree(&rt, &path).await {
            bw_engine::dlog!(
                err,
                "session",
                "reveal fail:{e} · {} · worktree={}",
                rt.log_tag(),
                path.display()
            );
            return Err(AppError::Exec(format!("在 Orca 里切到这棵树没成:{e}")));
        }
        if sid != conv.claude_session_id {
            self.remember_session_id(&conv, &sid).await?;
        }
        Ok(vec![Event::SessionReopened {
            issue_id: id,
            live: false,
        }])
    }

    pub(super) async fn remember_session_id(
        &self,
        conv: &crate::model::Conversation,
        sid: &str,
    ) -> Result<()> {
        if sid.is_empty() || conv.claude_session_id == sid {
            return Ok(());
        }
        let mut next = conv.clone();
        next.claude_session_id = sid.to_string();
        let slug = self.slug_of(conv.project_id).await?;
        crate::local::SessionStore::append(&self.asset_root, &slug, &next)?;
        Ok(())
    }
}
