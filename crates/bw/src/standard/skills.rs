//! buddy 自带的技能库 —— **放在 buddy 自己的目录里,不复制进用户的仓**。
//!
//! 开工前把这些文件展开到 buddy 自己的资产目录(`<asset_root>/skills/…`,
//! 见 `App::skills_dir`),系统提示词里只给 agent **名字 + 一句话 + 完整路径**,
//! 正文让它自己按需去读。这就是渐进式加载 —— 和 buddy 自己的系统提示词
//! (`standard/system-prompt/` 的 `SYSTEM.md.tmpl`,见 `app/bootstrap.rs` 的
//! `agent_system_prompt`)是同一套规矩:提示词里放索引,正文按需读。
//!
//! 用户仓怎么写 `.gitignore` 不该由 buddy 决定,所以技能不进用户的仓。

/// 一份技能包:名字、一句话、正文,以及它在技能目录下的相对落点。
pub struct SkillPack {
    /// 技能名(= 目录名 = frontmatter 的 `name`)。agent 在提示词里看到的就是它。
    pub slug: &'static str,
    /// 相对 `<asset_root>/skills/` 的落点。子技能挂在入口包目录下面,
    /// 不是平级的第二个技能。
    pub rel: String,
    /// frontmatter 那句 `description`,原样取自文件。
    pub desc: &'static str,
    pub raw: &'static str,
}

pub const WEEK_PLANNING_SKILL: &str =
    include_str!("../../../../standard/skills/week-planning/SKILL.md");
pub const METRICS_REFRESH_SKILL: &str =
    include_str!("../../../../standard/skills/metrics-refresh/SKILL.md");
pub const ASSET_AUDIT_SKILL: &str =
    include_str!("../../../../standard/skills/asset-audit/SKILL.md");
pub const PROJECT_HANDBOOK_SKILL: &str =
    include_str!("../../../../standard/skills/project-handbook/SKILL.md");
/// build 阶段默认 workflow 的**入口**(body 是 grill→implement→review SOP,指向
/// `vendor/mattpocock-skills/` 库内子技能路径)。归一:workflow 注入和运作剧本
/// 走同一个 `skill_pointer`→`SkillPack` 机制——运作剧本 body 自足,workflow 入口
/// body 指向 vendor 库(库由 `ensure_vendor_assets` 摊到 `<asset>/vendor/`)。
pub const BUILD_DEFAULT_SKILL: &str =
    include_str!("../../../../standard/skills/mattpocock-skills/SKILL.md");

/// frontmatter 里那句 `description`。取不到就返回空串 —— 不编一句假的。
///
/// 这几份技能的 desc 都走这里:正本是 `standard/` 下的真实文件,`desc_of`
/// 解析 frontmatter 取那句 description(取不到返空串,不编假的)。手抄一份
/// 常量迟早和文件漂移,所以一律现解析。
fn desc_of(raw: &'static str) -> &'static str {
    let mut lines = raw.lines();
    if lines.next().map(str::trim) != Some("---") {
        return "";
    }
    for line in lines {
        if line.trim() == "---" {
            return "";
        }
        if let Some(rest) = line.strip_prefix("description:") {
            return rest.trim();
        }
    }
    ""
}

/// buddy 自带的全部技能 —— **一个正本目录,全部平级**:`standard/skills/<名字>/SKILL.md`。
/// 两类,但走**同一个**注入机制(`skill_pointer`→`SkillPack`):
/// - **四份运作剧本**(buddy 自己发起的标准动作,body 自足);
/// - **workflow 入口**(body 是 SOP 链 + 指向 `vendor/` 库子技能路径,库由
///   `ensure_vendor_assets` 摊到 `<asset>/vendor/`)。今天一份:`mattpocock-skills`
///   (build 阶段默认);proto-design(原型)源还没 vendor,待补。
///
/// **不预建方法论技能**。原来还预置了六份「阶段方法论」(原型/构建/优化/
/// 运营推广/运维/竞品),但默认 workflow 没打包、`skill_slug` 也不识别它们,
/// 一份都没被真正派发过——属于「预先搞的一堆没用的」。2026-08-24 删光:
/// 阶段方法论该由业界 workflow 提供,buddy 只在每个环节挑一个最好的默认;
/// 真要从实践里长出 buddy 自己的方法论,到时候再单独建,不预置。
///
/// 留下的四份运作剧本是 buddy 独有的——业界不会有,且已被 `skill_slug`
/// 硬编码映射、真派发(运作活①②)。`north-star-discovery` / `metrics-binding`
/// 两份的内容已并入 `metrics-refresh`;`metrics-render` 早前整份删过(踩在 V4
/// 不存在的东西上)。这几份原文件随 V3 已删。
pub fn all() -> Vec<SkillPack> {
    const PACKS: [(&str, &str); 5] = [
        ("week-planning", WEEK_PLANNING_SKILL),
        ("metrics-refresh", METRICS_REFRESH_SKILL),
        ("asset-audit", ASSET_AUDIT_SKILL),
        ("project-handbook", PROJECT_HANDBOOK_SKILL),
        ("mattpocock-skills", BUILD_DEFAULT_SKILL),
    ];
    PACKS
        .iter()
        .map(|(slug, raw)| SkillPack {
            slug,
            rel: format!("{slug}/SKILL.md"),
            desc: desc_of(raw),
            raw,
        })
        .collect()
}
