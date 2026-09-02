//! `standard/` —— 规范件正本,编译期打进二进制。
//!
//! 仓根 `standard/` 与 `crates/`、`docs/` 平级,`include_str!` 在编译期读进
//! 常量(零 IO)。**改 `standard/` 就是改产品行为**,不要搬。
//!
//! `standard/VERSION` 是 Workbench 二进制自带哪一版规范。项目仓不再铺
//! `.bw/standard.toml`(版本账对使用没有用);旧仓里那份由每周资产盘点删掉,
//! 接入时不碰。

pub mod bootstrap;
pub mod skills;
pub mod system_prompt;

/// 一个规范件模板:渲染到项目仓的哪个路径、模板正文。
pub struct Template {
    /// 项目仓内的相对路径。
    pub target: &'static str,
    pub body: &'static str,
    /// 一句话:这份件是干什么的。**开工时进 agent 的规范索引** —— agent 拿到
    /// 的是「这句话 + 路径」,正文自己按需去读,不整篇塞进系统提示词。
    pub note: &'static str,
}

const VERSION_RAW: &str = include_str!("../../../../standard/VERSION");

/// Workbench 二进制自带的规范版本,如 `5.0`。
pub fn version() -> &'static str {
    VERSION_RAW.trim()
}

pub const ISSUE_POLICY_TMPL: &str =
    include_str!("../../../../standard/templates/issue-policy.toml.tmpl");

/// 指标空壳的格式正本。运作活①跟人定北极星/滞后/引领时照着写,
/// **不在接入铺底里落一份假的**。
#[allow(dead_code)]
pub const METRICS_TMPL: &str = include_str!("../../../../standard/templates/metrics.toml.tmpl");

/// 铺底要落的核心件。名片是接入时写的 `.bw/project.toml`,不在这张表里。
/// 仓根 `AGENTS.md` / `CLAUDE.md` 是项目自己的,铺底不写。
pub const CORE_TEMPLATES: &[Template] = &[Template {
    target: ".bw/issue-policy.toml",
    body: ISSUE_POLICY_TMPL,
    note: "活的分类 → 用什么工具开工、挂哪份剧本;周五资产盘点节律",
}];

/// 把 `{{key}}` 换成值。没给到的占位符**原样留着**,而不是替换成空串——
/// 留着能在文件里一眼看出「这里本来该填什么但没填到」,替成空串就查不出来了。
pub fn render(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{k}}}}}"), v);
    }
    out
}
