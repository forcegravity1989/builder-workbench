use super::{ChatError, ChatGroup, ChatMessage};
use time::OffsetDateTime;

pub struct NoneChatGroup;

#[async_trait::async_trait]
impl ChatGroup for NoneChatGroup {
    async fn send(&self, _msg: &ChatMessage) -> Result<(), ChatError> {
        Err(ChatError::NotConfigured)
    }

    async fn fetch_history(
        &self,
        _since: OffsetDateTime,
        _until: OffsetDateTime,
    ) -> Result<Vec<ChatMessage>, ChatError> {
        Err(ChatError::NotConfigured)
    }
}
