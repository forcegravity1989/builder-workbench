//! Workbench 的系统提示词主文件 + 阶段规范 references —— 编进二进制,
//! **不硬编码在 Rust `format!` 里**。
//!
//! 改身份/纪律 = 改这里的 `SYSTEM.md.tmpl`(以前塞在 `app/bootstrap.rs` 的
//! `format!` 里,改=改代码=重编译,人审得读 Rust)。`{{...}}` 占位由
//! `app/bootstrap.rs` 的 `agent_system_prompt` 渲染。
//!
//! `references/` 下每个 md 是「干某类活需要额外知道的 Workbench 规范」,开工时
//! 摊到 Workbench 自己的资产目录(`assets/system-prompt/references/`),提示词
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
pub const REF_BW_ASSETS: &str =
    include_str!("../../../../standard/system-prompt/references/bw-assets.md");

/// Workbench 自带的阶段规范 md —— 已派发四份(指标铁律、运作活①评论格式、
/// 改仓规则、`.bw` 现行契约),其余按实践长。哪类活注入哪份见
/// `app/bootstrap.rs` 的 `want_ref`;分工对照表在 architecture 模块 4。
pub fn references() -> Vec<ReferencePack> {
    // (slug, 一句话, 正文)
    const REFS: [(&str, &str, &str); 4] = [
        (
            "metrics",
            "怎么写 .bw/metrics.toml、脚本怎么吐数",
            REF_METRICS,
        ),
        (
            "week-plan-comment",
            "运作活①评论三标题、标签、里程碑;周五每周进展怎么写",
            REF_WEEK_PLAN_COMMENT,
        ),
        ("build", "活的树在哪;评论和标签不是改仓", REF_BUILD),
        (
            "bw-assets",
            "运作活②对照的 .bw 现行契约(该有/整份可删/现行格式/和①的分工)",
            REF_BW_ASSETS,
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
