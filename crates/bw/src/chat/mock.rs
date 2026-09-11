use super::{ChatError, ChatGroup, ChatMessage};
use std::sync::Mutex;
use time::OffsetDateTime;

pub struct MockChatGroup {
    group_id: String,
    sent: Mutex<Vec<ChatMessage>>,
    /// None 表示没有预置历史，区别于已查询但没有消息。
    history: Option<Vec<ChatMessage>>,
}

impl MockChatGroup {
    pub fn new(group_id: &str) -> Self {
        Self {
            group_id: group_id.to_string(),
            sent: Mutex::new(Vec::new()),
            history: None,
        }
    }

    pub fn with_history(group_id: &str, history: Vec<ChatMessage>) -> Self {
        Self {
            group_id: group_id.to_string(),
            sent: Mutex::new(Vec::new()),
            history: Some(history),
        }
    }

    pub fn sent(&self) -> Vec<ChatMessage> {
        self.sent.lock().map(|v| v.clone()).unwrap_or_default()
    }
}

#[async_trait::async_trait]
impl ChatGroup for MockChatGroup {
    async fn send(&self, msg: &ChatMessage) -> Result<(), ChatError> {
        bw_engine::dlog!(
            ok,
            "chat",
            "[BW_CHAT_SENT] group={} text={:?}",
            self.group_id,
            msg.text
        );
        if let Ok(mut v) = self.sent.lock() {
            v.push(msg.clone());
        }
        Ok(())
    }

    async fn fetch_history(
        &self,
        since: OffsetDateTime,
        until: OffsetDateTime,
    ) -> Result<Vec<ChatMessage>, ChatError> {
        let Some(history) = self.history.as_ref() else {
            return Err(ChatError::HistoryUnsupported);
        };
        Ok(history
            .iter()
            .filter(|m| match m.time {
                None => true,
                Some(t) => t >= since && t < until,
            })
            .cloned()
            .collect())
    }

    async fn probe(&self) -> Result<String, ChatError> {
        Ok(format!(
            "假群 {} 可达(本机自测,没有真的连过网)",
            self.group_id
        ))
    }
}
