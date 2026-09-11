use super::{ChatError, ChatGroup, ChatMessage};
use std::process::Stdio;
use time::OffsetDateTime;

pub struct WelinkChatGroup {
    group_id: String,
}

impl WelinkChatGroup {
    pub fn new(group_id: &str) -> Self {
        Self {
            group_id: group_id.to_string(),
        }
    }

    /// Windows 上 welink-cli 是 `.cmd` shim(无 .exe),传 `welink-cli.cmd`
    /// 让 `tokio_cmd` 走 `cmd.exe /c`;非 Windows 传裸 `welink-cli`。
    fn bin() -> &'static str {
        if cfg!(windows) {
            "welink-cli.cmd"
        } else {
            "welink-cli"
        }
    }

    fn render_text(msg: &ChatMessage) -> String {
        let mut s = msg.text.clone();
        if let Some((title, url)) = &msg.link {
            if !s.is_empty() {
                s.push('\n');
            }
            s.push_str(&format!("{title}: {url}"));
        }
        s
    }

    async fn run_send(&self, text: &str) -> Result<(), ChatError> {
        let out = bw_engine::tokio_cmd(Self::bin())
            .args([
                "im",
                "send-to-group",
                "--group-id",
                &self.group_id,
                "--text",
                text,
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| ChatError::Network(format!("起 welink-cli 失败:{e}")))?;
        if out.status.success() {
            return Ok(());
        }
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string()
            + "\n"
            + &String::from_utf8_lossy(&out.stdout);
        Err(classify(&err))
    }
}

fn classify(err: &str) -> ChatError {
    let l = err.to_lowercase();
    if l.contains("401")
        || l.contains("403")
        || l.contains("unauthorized")
        || l.contains("forbidden")
        || l.contains("auth")
        || l.contains("token")
        || l.contains("permission")
    {
        ChatError::Auth(err.trim().to_string())
    } else {
        ChatError::Network(err.trim().to_string())
    }
}

#[async_trait::async_trait]
impl ChatGroup for WelinkChatGroup {
    async fn send(&self, msg: &ChatMessage) -> Result<(), ChatError> {
        let text = Self::render_text(msg);
        if text.trim().is_empty() {
            return Err(ChatError::Network("消息正文是空的,没发".into()));
        }
        self.run_send(&text).await
    }

    async fn fetch_history(
        &self,
        _since: OffsetDateTime,
        _until: OffsetDateTime,
    ) -> Result<Vec<ChatMessage>, ChatError> {
        Err(ChatError::HistoryUnsupported)
    }

    /// 检测群号会实际发送一条消息；仅由用户显式触发。
    async fn probe(&self) -> Result<String, ChatError> {
        self.run_send("【Workbench 探活】这是「测一下」发出的一条测试消息,群连通正常。")
            .await?;
        Ok(format!(
            "已往群 {} 发一条探活消息,welink-cli 退出 0 = 发送即完成",
            self.group_id
        ))
    }
}
