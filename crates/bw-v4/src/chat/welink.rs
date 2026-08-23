//! WeLink 群 —— 经 `welink-cli im send-to-group` shell-out 发消息。
//!
//! # 已实现 / 未实现
//!
//! - **`send` 已实现**:`welink-cli im send-to-group --group-id <gid> --text <text>`。
//!   群号从 `.bw/project.toml` 的 `[chat] group_id` 取(经 [`super::for_project`] 工厂
//!   注入)。只发 `text`——welink-cli 的 send-to-group 只收纯文本,不收富文本,
//!   [`ChatMessage::link`] 拼成 `{title}: {url}` 追加在正文后;`markdown` 不发
//!   (welink-cli 不渲染 markdown,发了也是乱码正文)。
//! - **`fetch_history` 永远返 [`ChatError::HistoryUnsupported`]**:`welink-cli im`
//!   只有 send-to-user / send-to-group,**没有读群历史**的子命令。这是提供方
//!   天生拉不了历史(和钉钉/企微/Ts 群机器人一个性质),按设计 §9.4 是正常
//!   返回值、不是错。**群摘要(LEFTOVERS ⑧)因此 defer**——它要 fetch_history。
//! - **`probe` 已实现**:往该群发一条 `【buddy 探活】` 测试消息。welink-cli 没有
//!   按群号只读校验的命令(`search group` 按关键字搜,验不了具体 group_id),
//!   只有真发一条才答得出「这个群号能不能收到」。人点「测一下」才发,不是
//!   静默 spam。
//!
//! # 登录态不归 buddy 管
//!
//! 用户在本机用官方渠道自己登好 welink-cli(`welink-cli auth login`),buddy 不碰、
//! 不存这份凭证,设置屏也没有「聊天工具登录」按钮。welink-cli 老是提示 token
//! 过期——用户实测**不影响实际发送**(那是刷新提示,非失败);本实现认退出码,
//! 退出 0 = 发送即完成(设计 §9.5「发送即完成」,不追踪投递)。
//!
//! # Windows 上的 `.cmd` shim
//!
//! welink-cli 是 npm 全局装出来的,Windows 上是 `welink-cli.cmd`(DOS batch),
//! **没有 `.exe`**。Rust 的 `Command::new("welink-cli")` 不做 PATHEXT 解析、只
//! 找 `.exe`,直接起会「program not found」(同 `BW_CLAUDE_BIN` 那个坑)。所以
//! Windows 上传 `welink-cli.cmd` 给 [`v4_engine::tokio_cmd`],它检测到 `.cmd`
//! 后改走 `cmd.exe /c welink-cli.cmd …`;非 Windows 传裸 `welink-cli`。
//!
//! # 错误怎么带
//!
//! welink-cli 的原始 stderr 原样塞进 [`ChatError::Auth`] / [`ChatError::Network`],
//! **绝不吞错伪装成功**——全仓「读回为证」在这一层的落点。退出 0 但 stderr
//! 有 token 提示,算成功(那是刷新提示,不是失败)。

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

    /// 把 ChatMessage 摊成 welink-cli 能发的纯文本。link 拼成 `{title}: {url}`
    /// 追加在 text 后;markdown 不发(welink-cli 不渲染)。
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

    /// 起一条 `welink-cli im send-to-group`。退出 0 = 发送即完成(设计 §9.5);
    /// 非零按 stderr 文本分流 Auth / Network。群号空是配置错,不该走到这——
    /// 调用方 `for_project` 在群号为空时本就路由到 `none`,不到 welink。
    async fn run_send(&self, text: &str) -> Result<(), ChatError> {
        let out = v4_engine::tokio_cmd(Self::bin())
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

/// welink-cli 非零退出 → 按文本分流 Auth(鉴权/token/permission)vs Network(其余)。
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
        // welink-cli im 只有 send、无读群历史子命令(见模块文档)。提供方天生
        // 拉不了——这是正常返回值,调用方安静跳过,不重试不报错(设计 §9.4)。
        Err(ChatError::HistoryUnsupported)
    }

    /// 往该群发一条探活消息。welink-cli 没有按群号只读校验的命令,只有真发
    /// 一条才答得出「这个群号能不能收到」;人点「测一下」才发,不是静默 spam。
    async fn probe(&self) -> Result<String, ChatError> {
        self.run_send("【buddy 探活】这是「测一下」发出的一条测试消息,群连通正常。")
            .await?;
        Ok(format!(
            "已往群 {} 发一条探活消息,welink-cli 退出 0 = 发送即完成",
            self.group_id
        ))
    }
}
