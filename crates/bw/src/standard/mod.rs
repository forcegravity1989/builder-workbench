//! `standard/` —— 规范件正本,编译期打进二进制。
//!
//! 仓根 `standard/` 与 `crates/`、`docs/` 平级,`include_str!` 在编译期读进
//! 常量(零 IO)。**改 `standard/` 就是改产品行为**,不要搬。
//!
//! 两个版本号别混:
//! - `standard/VERSION`(这里的 [`version`]):**buddy 侧** —— 当前二进制自带
//!   哪一版规范,随发布走。
//! - 项目仓 `.bw/standard.toml` 的 `version`:**项目侧** —— 这个项目铺的是哪
//!   一版,随项目走。
//!
//! 两个值常常相等,含义不同,不合并成一个字段。

pub mod bootstrap;
pub mod skills;
pub mod system_prompt;

/// 一个规范件模板:属于哪个大类、渲染到项目仓的哪个路径、模板正文。
pub struct Template {
    /// `.bw/standard.toml` 的 `enabled` 里那个键。
    pub category: &'static str,
    /// 项目仓内的相对路径。
    pub target: &'static str,
    pub body: &'static str,
    /// 哪一站铺它。见 [`LayAt`]。
    pub lay_at: LayAt,
    /// 一句话:这份件是干什么的。**开工时进 agent 的规范索引** —— agent 拿到
    /// 的是「这句话 + 路径」,正文自己按需去读,不整篇塞进系统提示词。
    pub note: &'static str,
}

const VERSION_RAW: &str = include_str!("../../../../standard/VERSION");

/// buddy 二进制自带的规范版本,如 `5.0`。
pub fn version() -> &'static str {
    VERSION_RAW.trim()
}

/// 章程落在哪。**在 `.bw/` 里,不在仓根** —— buddy 铺进用户仓的东西全部收进
/// `.bw/`,仓根一个字不写。这样人一眼就知道「哪些是 bw 的资产」,也不会和
/// 项目自己的 README / CLAUDE.md / docs 打架。
pub const CHARTER_REL_PATH: &str = ".bw/PROJECT.md";

pub const CHARTER_TMPL: &str = include_str!("../../../../standard/templates/PROJECT.md.tmpl");
pub const ISSUE_POLICY_TMPL: &str =
    include_str!("../../../../standard/templates/issue-policy.toml.tmpl");
pub const STANDARD_TMPL: &str = include_str!("../../../../standard/templates/standard.toml.tmpl");

/// 指标空壳的格式正本。运作活①跟人定北极星/滞后/引领时照着写,
/// **不在接入铺底里落一份假的**。
#[allow(dead_code)]
pub const METRICS_TMPL: &str = include_str!("../../../../standard/templates/metrics.toml.tmpl");

/// 一份规范件**在哪一站落地**。
///
/// buddy 自己写得对的(名片、映射、版本清单)接入一次铺完。
/// 要跟人聊才写得对的(指标正文、业务脚本)不预铺空壳,跟会话走。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LayAt {
    /// 接入就铺:名片、规范版本、开工映射与节律。
    Adopt,
    /// 留给以后真有「第一次用到再铺」的件。今天铺底清单里没有这类。
    OnFirstUse,
}

/// 铺底要落的核心件,按落盘顺序。`.bw/managed.toml` 不在表里——它记的是
/// 「这些件的指纹」,所以必须**最后**写,保证记的是刚落盘那一刻的真实内容。
///
/// **落点分两类,别混**:
///
/// - **`.bw/` 下的是 buddy 的资产** —— 名片、映射、规范清单。收在一个目录里,
///   「bw 到底往我仓里放了什么」一眼可数,也不会因为项目把
///   `docs/` 或 `.claude/` 写进 .gitignore 就有件悄悄进不了版本控制。
/// - **仓根的 `AGENTS.md` 与 `CLAUDE.md` 是项目自己的** —— 它们是整个生态约定
///   俗成的位置(Claude Code / Cursor / Codex 都在仓根找),塞进 `.bw/` 谁都
///   读不到。铺底不写仓根;手册归资产盘点首次模式,问过人才写。
pub const CORE_TEMPLATES: &[Template] = &[
    Template {
        category: "charter",
        target: CHARTER_REL_PATH,
        body: CHARTER_TMPL,
        lay_at: LayAt::Adopt,
        note: "项目名片:这个项目是什么、对标谁、北极星是什么",
    },
    Template {
        category: "meta",
        target: ".bw/standard.toml",
        body: STANDARD_TMPL,
        lay_at: LayAt::Adopt,
        note: "这个项目铺的是哪一版规范、开了哪几类件",
    },
    Template {
        category: "issue-policy",
        target: ".bw/issue-policy.toml",
        body: ISSUE_POLICY_TMPL,
        lay_at: LayAt::Adopt,
        note: "活的分类 → 用什么工具开工、挂哪份剧本;定时节律也在这里",
    },
];

/// 把 `{{key}}` 换成值。没给到的占位符**原样留着**,而不是替换成空串——
/// 留着能在文件里一眼看出「这里本来该填什么但没填到」,替成空串就查不出来了。
pub fn render(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{k}}}}}"), v);
    }
    out
}
