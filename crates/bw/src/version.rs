//! 计划版本 / 发版号共用的 `v0.x` 格式与集合算法。
//!
//! 三处同一串:`bw:plan:v0.3`、里程碑标题 `v0.3`、Release / `bw:released:v0.3`。
//! 这里只做纯函数,不碰远端。

/// 运作活①刚建、还没确认版本时的标题。确认后在后面加空格和 `v0.x`。
pub const OPS1_TITLE: &str = "更新指标 + 制定版本计划";

/// `v` + 一段数字 + `.` + 一段数字。不认 `v0.1.0`、`W35`、`2026-W35`。
pub fn is_v0x(s: &str) -> bool {
    let s = s.trim();
    let Some(rest) = s.strip_prefix('v') else {
        return false;
    };
    let Some((a, b)) = rest.split_once('.') else {
        return false;
    };
    !a.is_empty()
        && !b.is_empty()
        && a.chars().all(|c| c.is_ascii_digit())
        && b.chars().all(|c| c.is_ascii_digit())
}

/// `v0.2` → `Some("v0.3")`。非法 → `None`。
pub fn bump_patch(s: &str) -> Option<String> {
    let s = s.trim();
    if !is_v0x(s) {
        return None;
    }
    let rest = s.strip_prefix('v')?;
    let (head, tail) = rest.split_once('.')?;
    let n: u32 = tail.parse().ok()?;
    Some(format!("v{head}.{}", n + 1))
}

fn parse_pair(s: &str) -> Option<(u32, u32)> {
    let rest = s.trim().strip_prefix('v')?;
    let (a, b) = rest.split_once('.')?;
    Some((a.parse().ok()?, b.parse().ok()?))
}

/// 按主.次数字比,不是字符串比(`v0.9` < `v0.10`)。
pub fn max_v0x<'a>(names: impl IntoIterator<Item = &'a str>) -> Option<String> {
    names
        .into_iter()
        .filter_map(|s| parse_pair(s).map(|p| (s.trim().to_string(), p)))
        .max_by_key(|(_, p)| *p)
        .map(|(s, _)| s)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VersionInventory {
    pub last_released: Option<String>,
    pub unreleased: Vec<String>,
    pub suggested_next: String,
}

/// `plan_names` = 里程碑或 `bw:plan:` 上的名;`released_names` = 已发号。
/// 对不上 `v0.x` 的丢掉。
pub fn inventory(plan_names: &[String], released_names: &[String]) -> VersionInventory {
    let released: Vec<String> = released_names
        .iter()
        .filter(|s| is_v0x(s))
        .cloned()
        .collect();
    let last_released = max_v0x(released.iter().map(String::as_str));
    let mut unreleased: Vec<String> = plan_names
        .iter()
        .filter(|s| is_v0x(s) && !released.iter().any(|r| r == *s))
        .cloned()
        .collect();
    unreleased.sort_by_key(|s| parse_pair(s).unwrap_or((0, 0)));
    unreleased.dedup();
    let suggested_next = max_v0x(
        last_released
            .iter()
            .map(String::as_str)
            .chain(unreleased.iter().map(String::as_str)),
    )
    .and_then(|m| bump_patch(&m))
    .unwrap_or_else(|| "v0.1".into());
    VersionInventory {
        last_released,
        unreleased,
        suggested_next,
    }
}

/// 光杆标题,或光杆 + 空格 + 合法 `v0.x`。带周号的不算。
pub fn is_ops1_title(title: &str) -> bool {
    let t = title.trim();
    if t == OPS1_TITLE {
        return true;
    }
    t.strip_prefix(OPS1_TITLE)
        .and_then(|rest| rest.strip_prefix(' '))
        .is_some_and(is_v0x)
}

pub fn ops1_title_for(version: &str) -> String {
    format!("{OPS1_TITLE} {version}")
}

/// 有未完成的运作活①,或本 ISO 周已有打了 `v0.x` 的运作活①(含已完成)。
pub fn ops1_already_started(open_ops1: bool, tagged_ops1_created_this_week: bool) -> bool {
    open_ops1 || tagged_ops1_created_this_week
}

/// 灌进运作活①系统提示词的三行。空集合写「没有」。
pub fn context_block(inv: &VersionInventory) -> String {
    let last = inv.last_released.as_deref().unwrap_or("没有");
    let unreleased = if inv.unreleased.is_empty() {
        "没有".to_string()
    } else {
        inv.unreleased.join("、")
    };
    format!(
        "本周版本（人确认之前不要打标）：\n- 上一发：{last}\n- 未发：{unreleased}\n- 推荐下一号：{}\n确认后：标题改成「更新指标 + 制定版本计划 v0.x」，打 bw:plan:v0.x，里程碑同名。不要打 bw:week，不要起 W35。",
        inv.suggested_next
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v0x_accepts_two_part() {
        assert!(is_v0x("v0.1"));
        assert!(is_v0x("v1.0"));
        assert!(is_v0x(" v0.12 "));
    }

    #[test]
    fn v0x_rejects_other_shapes() {
        assert!(!is_v0x("v0.1.0"));
        assert!(!is_v0x("W35"));
        assert!(!is_v0x("2026-W35"));
        assert!(!is_v0x("MVP收尾"));
        assert!(!is_v0x("bw:plan:v0.1"));
        assert!(!is_v0x("v"));
        assert!(!is_v0x("v0."));
        assert!(!is_v0x("0.1"));
    }

    #[test]
    fn inventory_recommends_after_last_and_unreleased() {
        let inv = inventory(&["v0.2".into()], &["v0.1".into()]);
        assert_eq!(inv.last_released.as_deref(), Some("v0.1"));
        assert_eq!(inv.unreleased, vec!["v0.2".to_string()]);
        assert_eq!(inv.suggested_next, "v0.3");
    }

    #[test]
    fn inventory_empty_starts_at_v01() {
        let inv = inventory(&[], &[]);
        assert_eq!(inv.last_released, None);
        assert!(inv.unreleased.is_empty());
        assert_eq!(inv.suggested_next, "v0.1");
    }

    #[test]
    fn max_v0x_is_numeric() {
        assert_eq!(max_v0x(["v0.9", "v0.10", "v0.2"]), Some("v0.10".into()));
    }

    #[test]
    fn ops1_title_shapes() {
        assert!(is_ops1_title(OPS1_TITLE));
        assert!(is_ops1_title("更新指标 + 制定版本计划 v0.3"));
        assert!(!is_ops1_title("更新指标 + 制定版本计划 2026-W36"));
        assert!(!is_ops1_title("更新指标 + 制定本周计划 2026-W36"));
        assert_eq!(ops1_title_for("v0.3"), "更新指标 + 制定版本计划 v0.3");
    }

    #[test]
    fn already_started_or() {
        assert!(!ops1_already_started(false, false));
        assert!(ops1_already_started(true, false));
        assert!(ops1_already_started(false, true));
    }
}
