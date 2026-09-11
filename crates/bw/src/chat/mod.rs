pub mod mock;
pub mod none;
pub mod welink;

use time::OffsetDateTime;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChatMessage {
    pub time: Option<OffsetDateTime>,
    pub sender: Option<String>,
    /// 所有提供方共同的兜底。能发富文本的额外填 [`Self::link`] / [`Self::markdown`]。
    pub text: String,
    /// (标题, URL)。
    pub link: Option<(String, String)>,
    pub markdown: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum ChatError {
    #[error("这个项目没配项目群")]
    NotConfigured,
    #[error("这个提供方拉不了群历史")]
    HistoryUnsupported,
    #[error("群鉴权失败:{0}")]
    Auth(String),
    #[error("发群网络失败:{0}")]
    Network(String),
}

#[async_trait::async_trait]
pub trait ChatGroup: Send + Sync {
    async fn send(&self, msg: &ChatMessage) -> Result<(), ChatError>;

    /// 尽力实现。做不到就稳定返回 [`ChatError::HistoryUnsupported`],
    /// 不 panic、不抛别的错。
    async fn fetch_history(
        &self,
        since: OffsetDateTime,
        until: OffsetDateTime,
    ) -> Result<Vec<ChatMessage>, ChatError>;

    async fn probe(&self) -> Result<String, ChatError> {
        Err(ChatError::NotConfigured)
    }
}

/// 认提供方**只在这一处**。调用点一律只拿 `Box<dyn ChatGroup>` 调方法。
///
/// 认不出的名字一律落到 [`none`] —— 不猜、不报错,就是「没配群」。
pub fn for_project(provider: &str, group_id: &str) -> Box<dyn ChatGroup> {
    match provider.trim() {
        "welink" => Box::new(welink::WelinkChatGroup::new(group_id)),
        "mock" => Box::new(mock::MockChatGroup::new(group_id)),
        _ => Box::new(none::NoneChatGroup),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NotifyEvent {
    WeekPlan,
    IssueCreated,
    Merged,
    Release,
    /// 周报发送尚未接入触发和生成逻辑。
    Weekly,
}

impl NotifyEvent {
    /// 全部事件,稳定顺序。配置屏按它渲染勾选项;默认集也按它。
    pub const ALL: [Self; 5] = [
        Self::WeekPlan,
        Self::IssueCreated,
        Self::Merged,
        Self::Release,
        Self::Weekly,
    ];

    /// 配置正本(`.bw/project.toml [chat] notify`)里匹配用的字符串 key。
    pub fn key(self) -> &'static str {
        match self {
            Self::WeekPlan => "week_plan",
            Self::IssueCreated => "issue_created",
            Self::Merged => "merged",
            Self::Release => "release",
            Self::Weekly => "weekly",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::WeekPlan => "本周版本计划",
            Self::IssueCreated => "新建活",
            Self::Merged => "已合入",
            Self::Release => "发版",
            Self::Weekly => "周报",
        }
    }

    /// 配置 key → 事件。认不出返回 `None`(旧值如 `review` 升级后即如此,
    /// 它不会再匹配任何事件,等于该项静音——不为旧值留兼容路径)。
    pub fn from_key(key: &str) -> Option<Self> {
        Some(match key {
            "week_plan" => Self::WeekPlan,
            "issue_created" => Self::IssueCreated,
            "merged" => Self::Merged,
            "release" => Self::Release,
            "weekly" => Self::Weekly,
            _ => return None,
        })
    }
}

pub const DEFAULT_NOTIFY: [NotifyEvent; 5] = NotifyEvent::ALL;

pub fn event_label(event: &str) -> &str {
    match NotifyEvent::from_key(event) {
        Some(e) => e.label(),
        None => event,
    }
}

/// 一行文案:`【<事件>】#<活号> <标题> · <MR 状态> · <谁该动> → <深链>`。
///
/// **不 @ 人**:Workbench 不建成员,没有身份映射可 @。
/// `number == 0` 表示这条不挂在某个 Issue上(发版就是这样),此时不写活号、也不
/// 写深链——写一个 `#0` 和一条点不开的链接比不写更糟。
pub fn notify_text(event: &str, number: u32, title: &str, mr: &str, who: &str) -> String {
    let mut s = if number == 0 {
        format!("【{}】{title}", event_label(event))
    } else {
        format!("【{}】#{number} {title}", event_label(event))
    };
    if !mr.is_empty() {
        s.push_str(&format!(" · {mr}"));
    }
    if !who.is_empty() {
        s.push_str(&format!(" · {who}"));
    }
    if number > 0 {
        s.push_str(&format!(" → bw://open?issue={number}"));
    }
    s
}
