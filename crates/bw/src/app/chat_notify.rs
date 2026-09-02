//! 把三件事同步进项目群:活进评审、活合入、发了版。
//!
//! **发出去就算完**:不写库、不记「发过没发过」、不做去重、没有失败重试队列。
//! 极小概率下同一件事会被重推一条进群(比如进程恰好在发送前后重启),这是
//! 已经接受的代价——重发一条能忍,为它建一张表不值。
//!
//! **失败不回滚主干**:合入、结清、发版的账在这条链路之前就记完了,发群只是
//! 末尾一个锦上添花的旁支。发不出去就在当次界面上如实说一句,不假装有一套
//! 可靠的恢复机制,也不会在下一次 tick 时偷偷重发。

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
            // 没配群这一条走不到这里(上面已经短路),真走到就当没配处理。
            Err(ChatError::NotConfigured) => return None,
            Err(e) => Event::ChatNotifySent {
                number,
                event_type: event.to_string(),
                ok: false,
                note: e.to_string(),
            },
        })
    }

    /// 一张活的三类事件走这条:文案按模板拼,`who` 与 MR 状态能拿到就带上。
    ///
    /// `known_mr` = 调用方已经知道的 MR 号(>0 就直接用,不再查远端)。合入路径
    /// 传合完的那个号——合完 MR 已关,现查「开着的 MR」查不到,必须靠调用方传。
    /// 评审 / 手动同步路径传 0,这里现查分支上开着的 MR(评审时 MR 还开着,查得到)。
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

    /// 现查这张活分支上开着的 MR 号(正本在远端,现查)。没挂远端 / 没开着 /
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

    /// 界面显式触发的那条命令。项目没配群 / 这件事没勾选时如实回一条「跳过了」,
    /// 不静默——人是主动点的,得到的回音不能是沉默。
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
