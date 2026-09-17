pub struct SkillPack {
    pub slug: &'static str,
    pub rel: String,
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
pub const WEEK_PLANNING_COMMENT_CHECK: &str =
    include_str!("../../../../standard/skills/week-planning/check-week-comment.py");
pub const BUILD_DEFAULT_SKILL: &str =
    include_str!("../../../../standard/skills/mattpocock-skills/SKILL.md");

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

/// 技能附件随包安装，但不单独出现在技能列表。
pub fn sidecars() -> Vec<SkillPack> {
    let resources = [
        ("check-week-comment.py", WEEK_PLANNING_COMMENT_CHECK),
        (
            "assets/version-plan.html",
            include_str!("../../../../standard/skills/week-planning/assets/version-plan.html"),
        ),
        (
            "assets/data-template.json",
            include_str!("../../../../standard/skills/week-planning/assets/data-template.json"),
        ),
        (
            "scripts/planning.py",
            include_str!("../../../../standard/skills/week-planning/scripts/planning.py"),
        ),
        (
            "references/data-and-runtime.md",
            include_str!(
                "../../../../standard/skills/week-planning/references/data-and-runtime.md"
            ),
        ),
        (
            "references/meeting.md",
            include_str!("../../../../standard/skills/week-planning/references/meeting.md"),
        ),
    ];
    resources
        .into_iter()
        .map(|(path, raw)| SkillPack {
            slug: "week-planning",
            rel: format!("week-planning/{path}"),
            desc: "版本计划运行资源",
            raw,
        })
        .collect()
}
