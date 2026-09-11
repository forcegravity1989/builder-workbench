use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! id_newtype {
    ($(#[$doc:meta])* $name:ident) => {
        $(#[$doc])*
        #[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            pub const fn from_uuid(u: Uuid) -> Self {
                Self(u)
            }

            pub const fn nil() -> Self {
                Self(Uuid::nil())
            }

            pub const fn uuid(self) -> Uuid {
                self.0
            }

            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }
    };
}

id_newtype!(ProjectId);
id_newtype!(ConversationId);

/// 项目 ID 与远端项目内 issue 号共同组成身份。
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub struct IssueId {
    project_id: ProjectId,
    iid: u32,
}

impl IssueId {
    pub const fn from_remote(project_id: ProjectId, iid: u32) -> Self {
        Self { project_id, iid }
    }

    pub const fn nil() -> Self {
        Self {
            project_id: ProjectId::nil(),
            iid: 0,
        }
    }

    pub const fn iid(self) -> u32 {
        self.iid
    }

    pub const fn project_id(self) -> ProjectId {
        self.project_id
    }

    /// 返回项目 UUID，不是 issue 的独立 UUID。
    pub const fn uuid(self) -> Uuid {
        self.project_id.uuid()
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Signal {
    Green,
    Amber,
    Red,
    Unknown,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageKind {
    Prototype,
    Build,
    Optimize,
    Growth,
    Ops,
}

impl StageKind {
    pub const ALL: [StageKind; 5] = [
        StageKind::Prototype,
        StageKind::Build,
        StageKind::Optimize,
        StageKind::Growth,
        StageKind::Ops,
    ];

    pub fn label(self) -> &'static str {
        match self {
            StageKind::Prototype => "原型",
            StageKind::Build => "构建",
            StageKind::Optimize => "优化",
            StageKind::Growth => "运营推广",
            StageKind::Ops => "运维",
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueStatus {
    Backlog,
    Todo,
    InProgress,
    InReview,
    Done,
    Blocked,
    Cancelled,
}

impl IssueStatus {
    pub fn label(self) -> &'static str {
        match self {
            IssueStatus::Backlog => "未排期",
            IssueStatus::Todo => "待办",
            IssueStatus::InProgress => "进行中",
            IssueStatus::InReview => "待评审",
            IssueStatus::Done => "已完成",
            IssueStatus::Blocked => "阻塞",
            IssueStatus::Cancelled => "已取消",
        }
    }

    /// 所有状态转移共用此规则；完成操作仍须由用户显式发起。
    pub fn can_transition_to(self, to: IssueStatus) -> bool {
        use IssueStatus::*;
        matches!(
            (self, to),
            (Backlog, Todo)
                | (Backlog, InProgress)
                | (Backlog, Cancelled)
                | (Backlog, Done)
                | (Todo, InProgress)
                | (Todo, Backlog)
                | (Todo, Blocked)
                | (Todo, Cancelled)
                | (Todo, Done)
                | (InProgress, InReview)
                | (InProgress, Todo)
                | (InProgress, Blocked)
                | (InProgress, Cancelled)
                | (InProgress, Done)
                | (InReview, Done)
                | (InReview, InProgress)
                | (InReview, Blocked)
                | (InReview, Cancelled)
                | (Blocked, Todo)
                | (Blocked, InProgress)
                | (Blocked, Cancelled)
                | (Blocked, Done)
                | (Done, Todo)
                | (Done, InProgress)
        )
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueKind {
    Business,
    Ops,
    Light,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueOrigin {
    Human,
    Auto,
    AgentSplit,
    Backfill,
}

impl IssueOrigin {
    pub fn label(self) -> &'static str {
        match self {
            IssueOrigin::Human => "人建",
            IssueOrigin::Auto => "定时自动建",
            IssueOrigin::AgentSplit => "agent 拆出",
            IssueOrigin::Backfill => "回填",
        }
    }
}

pub type Category = StageKind;

pub fn category_from_key(key: &str) -> Option<Category> {
    match key {
        "prototype" => Some(StageKind::Prototype),
        "build" => Some(StageKind::Build),
        "optimize" => Some(StageKind::Optimize),
        "growth" => Some(StageKind::Growth),
        "ops" => Some(StageKind::Ops),
        _ => None,
    }
}

pub fn category_key(c: Category) -> &'static str {
    match c {
        StageKind::Prototype => "prototype",
        StageKind::Build => "build",
        StageKind::Optimize => "optimize",
        StageKind::Growth => "growth",
        StageKind::Ops => "ops",
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Project {
    pub id: ProjectId,
    pub slug: String,
    pub name: String,
    pub workspace_path: String,
    pub provider: String,
    pub remote_host: String,
    pub remote_path: String,
    /// 健康灯显示缓存。`None` = 没数据 = Unknown 灰,不是绿。
    pub signal: Option<Signal>,
    pub weekly_signal: Option<Signal>,
    pub signal_derived_at: Option<i64>,
    pub sort_order: f64,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Project {
    pub fn has_remote(&self) -> bool {
        !self.remote_path.is_empty()
    }

    /// 网页域名由平台配置解析；SSH origin 的主机和端口不能直接用作网页地址。
    pub fn browse_base(&self) -> String {
        if !self.has_remote() {
            return String::new();
        }
        let path = self.remote_path.trim().trim_matches('/');
        match self.provider.trim() {
            // 空 provider = 存量行,底座也当 github(`Remote::for_project`)。
            "github" | "" => format!("https://github.com/{path}"),
            "codehub" => format!(
                "https://{}/{path}",
                codehub_alias_to_domain(&self.remote_host)
            ),
            _ => String::new(),
        }
    }

    pub fn mr_url_prefix(&self) -> String {
        match self.browse_base() {
            b if b.is_empty() => b,
            b if self.provider.trim() == "codehub" => format!("{b}/-/merge_requests/"),
            b => format!("{b}/pull/"),
        }
    }

    pub fn remote_brand(&self) -> &'static str {
        if !self.has_remote() {
            return "";
        }
        match self.provider.trim() {
            // 空 provider = 存量行,底座也当 github(`Remote::for_project`)。
            "github" | "" => "GitHub",
            "codehub" => "CodeHub",
            _ => "",
        }
    }

    pub fn issue_url_prefix(&self) -> String {
        match self.browse_base() {
            b if b.is_empty() => b,
            b if self.provider.trim() == "codehub" => format!("{b}/-/issues/"),
            b => format!("{b}/issues/"),
        }
    }
}

/// CodeHub 区别名与网页域名的双向映射。
const CODEHUB_DOMAINS: &[(&str, &str)] = &[
    ("green", "codehub-g.huawei.com"),
    ("open", "open.codehub.huawei.com"),
    ("yellow", "codehub-y.huawei.com"),
];

pub fn codehub_alias_to_domain(alias: &str) -> &str {
    let alias = alias.trim();
    CODEHUB_DOMAINS
        .iter()
        .find_map(|(known, domain)| (*known == alias).then_some(*domain))
        .unwrap_or(alias)
}

pub fn codehub_aliases() -> impl Iterator<Item = &'static str> {
    CODEHUB_DOMAINS.iter().map(|(alias, _)| *alias)
}

/// CodeHub API / SSH 主机名 → `codehub-cli -H` 收的区别名。
///
/// 反查从 [`codehub_alias_to_domain`] 的正表推导；SSH 主机可能在网页域名前加
/// 机房前缀(`szv-open…`)或在短区标前加机房段(`codehub-dg-g…`)。
pub fn codehub_alias_for_host(host: &str) -> Option<&'static str> {
    let host = host.trim().to_ascii_lowercase();
    CODEHUB_DOMAINS.iter().find_map(|(alias, domain)| {
        let domain = *domain;
        if host == domain || host.ends_with(domain) {
            return Some(*alias);
        }
        let matched = domain
            .strip_prefix("codehub-")
            .is_some_and(|tail| host.ends_with(tail) && host.contains("codehub"));
        matched.then_some(*alias)
    })
}

#[derive(Clone, Debug, PartialEq)]
pub struct Issue {
    pub id: IssueId,
    pub project_id: ProjectId,
    /// 远端仓库内的 issue 编号。
    pub number: u32,
    /// 远端 issue 号;`0` = 未映射,绝不编造。
    pub remote_number: u32,
    pub title: String,
    pub body: String,
    pub status: IssueStatus,
    pub branch: String,
    /// MR 号;`0` = 没有 MR。壳现查填上,开着的或已合入的都算,给详情展示。
    pub pr_number: u32,
    pub has_open_mr: bool,
    pub week_of: String,
    pub version: String,
    pub tool: String,
    pub kind: IssueKind,
    pub origin: IssueOrigin,
    pub workflow: String,
    pub category: Option<Category>,
    pub sort_order: f64,
    pub metric_key: String,
    pub created_at: i64,
    pub updated_at: i64,
    /// 远端 issue 的 closed_at，未关闭时为 None。
    pub settled_at: Option<i64>,
    pub assignee: String,
    pub author: String,
    /// 排进哪些版本(`bw:plan:<里程碑名>`)。旧版本回看依赖保留历史计划标签。
    pub plan_versions: Vec<String>,
}

impl Issue {
    pub fn is_scheduled(&self) -> bool {
        !self.plan_versions.is_empty()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Conversation {
    pub id: ConversationId,
    pub project_id: ProjectId,
    pub issue_id: IssueId,
    pub claude_session_id: String,
    pub workspace_path: String,
    pub branch_name: String,
    pub created_at: i64,
    pub last_opened_at: i64,
}
