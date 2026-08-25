//! buddy 的系统提示词主文件 + 阶段规范 references —— 编进二进制,
//! **不硬编码在 Rust `format!` 里**。
//!
//! 改身份/铁律 = 改这里的 `SYSTEM.md.tmpl` + 抬 `standard/VERSION` + 规范
//! 对账能测出落后(以前塞在 `app/bootstrap.rs` 的 `format!` 里,改=改代码=
//! 重编译,人审得读 Rust,不可对账)。`{{...}}` 占位由 `app/bootstrap.rs`
//! 的 `agent_system_prompt` 渲染。
//!
//! `references/` 下每个 md 是「干某类活需要额外知道的 buddy 规范」,开工时
//! 摊到 buddy 自己的资产目录(`assets/system-prompt/references/`),提示词
//! 里只给路径,agent 按需读 —— 和 `skills/` 同一套渐进加载规矩。

/// 一份阶段规范 md:文件名、一句话、相对 `<asset_root>/system-prompt/references/`
/// 的落点、正文。
pub struct ReferencePack {
    pub slug: &'static str,
    /// 一句话(提示词里给 agent 看的那句,正文自己按需读)。
    pub desc: &'static str,
    pub rel: String,
    pub raw: &'static str,
}

pub const SYSTEM_PROMPT_TMPL: &str =
    include_str!("../../../../standard/system-prompt/SYSTEM.md.tmpl");
pub const REF_METRICS: &str =
    include_str!("../../../../standard/system-prompt/references/metrics.md");
pub const REF_BUILD: &str = include_str!("../../../../standard/system-prompt/references/build.md");
pub const REF_WEEK_PLAN_COMMENT: &str =
    include_str!("../../../../standard/system-prompt/references/week-plan-comment.md");

/// buddy 自带的阶段规范 md —— **起手只放已定型的两份**(指标铁律、改仓规则),
/// 其余按实践长,不预置一堆没用的。
pub fn references() -> Vec<ReferencePack> {
    // (slug, 一句话, 正文)
    const REFS: [(&str, &str, &str); 3] = [
        (
            "metrics",
            "干指标活的 buddy 规范(可回溯/不许写0/窗口由 buddy 给)",
            REF_METRICS,
        ),
        (
            "week-plan-comment",
            "运作活①评论格式(周目标/本周纳入/读数快照,挂前要过校验脚本)",
            REF_WEEK_PLAN_COMMENT,
        ),
        (
            "build",
            "干改仓活的 buddy 规范(活自己的分支/提 MR/合并是人/不自动 Done)",
            REF_BUILD,
        ),
    ];
    REFS.iter()
        .map(|(slug, desc, raw)| ReferencePack {
            slug,
            desc,
            rel: format!("{slug}.md"),
            raw,
        })
        .collect()
}
