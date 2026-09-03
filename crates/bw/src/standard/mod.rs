//! `standard/` —— 规范件正本,编译期打进二进制。
//!
//! 仓根 `standard/` 与 `crates/`、`docs/` 平级,`include_str!` 在编译期读进
//! 常量(零 IO)。**改 `standard/` 就是改产品行为**,不要搬。
//!
//! 现行结构见仓根 `standard/README.md`。项目仓不再铺 `.bw/standard.toml`;
//! 旧仓里那份由每周资产盘点删掉,接入时不碰。

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

pub const ISSUE_POLICY_TMPL: &str =
    include_str!("../../../../standard/templates/issue-policy.toml.tmpl");

/// 指标空壳的格式正本。运作活①跟人定北极星/滞后/引领时照着写,
/// **不在接入铺底里落一份假的**。
#[allow(dead_code)]
pub const METRICS_TMPL: &str = include_str!("../../../../standard/templates/metrics.toml.tmpl");

/// 第一次接入不再往仓里摊模板。开工工具跟人走本机,节律是产品默认。
/// `ISSUE_POLICY_TMPL` 只给残留文件解析 / 测试用。
pub const CORE_TEMPLATES: &[Template] = &[];

/// 把 `{{key}}` 换成值。没给到的占位符**原样留着**,而不是替换成空串——
/// 留着能在文件里一眼看出「这里本来该填什么但没填到」,替成空串就查不出来了。
pub fn render(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{k}}}}}"), v);
    }
    out
}
