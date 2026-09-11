pub struct ReferencePack {
    pub slug: &'static str,
    pub desc: &'static str,
    pub rel: String,
    pub raw: &'static str,
}

pub const SYSTEM_PROMPT_TMPL: &str =
    include_str!("../../../../standard/system-prompt/SYSTEM.md.tmpl");
pub const REF_ISSUE_STATE: &str =
    include_str!("../../../../standard/system-prompt/references/issue-state.md");
pub const REF_METRICS: &str =
    include_str!("../../../../standard/system-prompt/references/metrics.md");
pub const REF_BUILD: &str = include_str!("../../../../standard/system-prompt/references/build.md");
pub const REF_WEEK_PLAN_COMMENT: &str =
    include_str!("../../../../standard/system-prompt/references/week-plan-comment.md");
pub const REF_BW_ASSETS: &str =
    include_str!("../../../../standard/system-prompt/references/bw-assets.md");

pub fn references() -> Vec<ReferencePack> {
    const REFS: [(&str, &str, &str); 5] = [
        (
            "issue-state",
            "issue 状态机、版本标签、程序与模型各能改到哪",
            REF_ISSUE_STATE,
        ),
        (
            "metrics",
            "怎么写 .bw/metrics.toml、脚本怎么吐数",
            REF_METRICS,
        ),
        (
            "week-plan-comment",
            "版本计划评论格式、标签、里程碑与每周进展",
            REF_WEEK_PLAN_COMMENT,
        ),
        ("build", "活的树在哪;评论和标签不是改仓", REF_BUILD),
        (
            "bw-assets",
            "资产盘点使用的 .bw 文件规范、格式及与版本计划的分工",
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
