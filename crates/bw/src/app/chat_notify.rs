use super::{App, Result};
use crate::chat::{self, ChatError, ChatMessage};
use crate::command::Event;
use crate::model::{Issue, IssueId, ProjectId};

impl App {
    /// 界面/别的用例都走这一个入口。
    ///
    /// 返回 `None` 有两种情况,都**不是失败**:这个项目没配群,或者这件事不在
    /// `[chat] notify` 勾选的名单里。两种情况都安静跳过,不产生任何记录。
    pub(super) async fn chat_send(
        &self,
        project_id: ProjectId,
        event: &str,
        number: u32,
        text: String,
    ) -> Option<Event> {
        let ws = self.workspace_of(project_id).await.ok()?;
        let file = crate::repo::project_file::read(&ws).ok().flatten()?;
        let cfg = file.chat?;
        let provider = cfg.provider.trim();
        if provider.is_empty() || provider == "none" {
            return None;
        }
        // 整行没写 = 用默认那三件事;写了就以写的为准 —— 写了空数组就是静音,
        // 一件都不发。
        let wanted: Vec<String> = match &cfg.notify {
            None => chat::DEFAULT_NOTIFY
                .iter()
                .map(|e| e.key().to_string())
                .collect(),
            Some(list) => list.clone(),
        };
        if !wanted.iter().any(|w| w == event) {
            return None;
        }

        let group = chat::for_project(provider, &cfg.group_id);
        let msg = ChatMessage {
            text,
            ..ChatMessage::default()
        };
        Some(match group.send(&msg).await {
            Ok(()) => Event::ChatNotifySent {
                number,
                event_type: event.to_string(),
                ok: true,
                note: String::new(),
            },
            Err(ChatError::NotConfigured) => return None,
            Err(e) => Event::ChatNotifySent {
                number,
                event_type: event.to_string(),
                ok: false,
                note: e.to_string(),
            },
        })
    }

    /// 合入后无法再按开放状态查 MR，调用方须传入已知号码。
    pub(super) async fn chat_notify_issue(
        &self,
        id: IssueId,
        event: &str,
        known_mr: u32,
    ) -> Option<Event> {
        let issue = self.issue_or_err(id).await.ok()?;
        let mr = if known_mr > 0 {
            format!("MR !{known_mr}")
        } else {
            let n = self.mr_number_for(&issue).await;
            if n > 0 {
                format!("MR !{n}")
            } else {
                String::new()
            }
        };
        let text = chat::notify_text(event, issue.number, &issue.title, &mr, "");
        self.chat_send(issue.project_id, event, issue.number, text)
            .await
    }

    /// 现查此 Issue分支上开着的 MR 号(正本在远端,现查)。没挂远端 / 没开着 /
    /// 查失败 → 0。不靠 `issue.pr_number`(那是 `issue_from_remote` 的 lossy 字段,恒 0)。
    async fn mr_number_for(&self, issue: &Issue) -> u32 {
        let Ok(project) = self.project_of(issue.project_id).await else {
            return 0;
        };
        if !project.has_remote() {
            return 0;
        }
        let Ok(remote) = self.remote_for(&project) else {
            return 0;
        };
        let branch = super::issue_store::work_branch(issue);
        match remote.open_mr_for_branch(&branch).await {
            Ok(Some(n)) => n,
            _ => 0,
        }
    }

    pub(super) async fn sync_notify_to_chat(
        &mut self,
        issue_id: IssueId,
        event_type: String,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(issue_id).await?;
        Ok(vec![self
            .chat_notify_issue(issue_id, &event_type, 0)
            .await
            .unwrap_or(Event::ChatNotifySent {
                number: issue.number,
                event_type,
                ok: false,
                note: "这个项目没配项目群,或者这件事没勾选同步 —— 没发,也没记账".into(),
            })])
    }
}
