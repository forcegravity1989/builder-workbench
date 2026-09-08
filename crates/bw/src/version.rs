//! 版本名、运作活①标题、里程碑覆盖时间。
//!
//! 号就是里程碑标题,标签 `bw:plan:<名>`。`vX.X` 只推荐,不设限。
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
/// 非空都进清单;`suggested_next` 仍从已有 `v0.x` bump,没有就 `v0.1`。
pub fn inventory(plan_names: &[String], released_names: &[String]) -> VersionInventory {
    let released: Vec<String> = released_names
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let last_released =
        max_v0x(released.iter().map(String::as_str)).or_else(|| released.last().cloned());
    let mut unreleased: Vec<String> = plan_names
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| is_plan_name(s) && !released.iter().any(|r| r == s))
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

/// 光杆标题,或光杆 + 空格 + 任意非空后缀。版本以 label 为准,不认标题后缀形状。
pub fn is_ops1_title(title: &str) -> bool {
    let t = title.trim();
    if t == OPS1_TITLE {
        return true;
    }
    t.strip_prefix(OPS1_TITLE)
        .and_then(|rest| rest.strip_prefix(' '))
        .is_some_and(|s| !s.is_empty())
}

/// 带号运作活①标题里的版本名。光杆 → `None`。
pub fn ops1_version_from_title(title: &str) -> Option<String> {
    title
        .trim()
        .strip_prefix(OPS1_TITLE)?
        .strip_prefix(' ')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

pub fn ops1_title_for(version: &str) -> String {
    format!("{OPS1_TITLE} {version}")
}

/// 在研现算用的一行运作活①。`version` 必须来自 `bw:plan:`。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ops1VersionRow {
    pub version: String,
    pub created_at: i64,
    pub number: u32,
    pub open: bool,
    pub released: bool,
}

/// 本周在研:开着的带号①取最后创建;都关了则取未发版的已关①里最后创建。
/// 标题还是光杆、或没打 `bw:plan:` 的不算。
pub fn current_from_ops1(rows: &[Ops1VersionRow]) -> Option<String> {
    let pick = |open: bool, released_ok: bool| {
        rows.iter()
            .filter(|r| !r.version.is_empty() && r.open == open && (released_ok || !r.released))
            .max_by_key(|r| (r.created_at, r.number))
            .map(|r| r.version.clone())
    };
    pick(true, true).or_else(|| pick(false, false))
}

/// 出包用哪份代码。有同名 tag 就从 tag 出;在研且还没 tag 才用工作区。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackSource {
    Tag,
    Workspace,
}

/// `viewing` 空 = 全部 issue,不出包。
pub fn pack_source(viewing: &str, current: &str, has_tag: bool) -> Option<PackSource> {
    if viewing.trim().is_empty() {
        return None;
    }
    if has_tag {
        Some(PackSource::Tag)
    } else if viewing == current && !current.is_empty() {
        Some(PackSource::Workspace)
    } else {
        None
    }
}

/// 发版本只给在研且还没有同名 tag 的号。没有已完成的活也能发。
pub fn can_cut_release(viewing: &str, current: &str, has_tag: bool) -> bool {
    !viewing.trim().is_empty() && viewing == current && !current.is_empty() && !has_tag
}

/// 有未完成的运作活①,或本 ISO 周已有打了版本标签的运作活①(含已完成)。
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
        "本周版本（人确认之前不要打标）：\n- 上一发：{last}\n- 未发：{unreleased}\n- 推荐下一号：{}（推荐 vX.X，例如 v0.3 / v1.0，人要用别的名字也行）\n确认后怎么改标题、打标、挂里程碑,见 week-plan-comment.md。",
        inv.suggested_next
    )
}

/// 排期名。非空即可;名字不设限。ISO 周只做节律,产品不新建周号版本,但不在这里滤。
pub fn is_plan_name(s: &str) -> bool {
    !s.trim().is_empty()
}

/// 里程碑起止都是 `YYYY-MM-DD`。缺一边就不覆盖,不猜。
pub fn covers_ymd(start: &str, due: &str, day: &str) -> bool {
    !start.is_empty() && !due.is_empty() && start <= day && day <= due
}

/// `[start, due]` 和这一 ISO 周(周一到周日)有没有重叠。
pub fn overlaps_week(start: &str, due: &str, week: &str) -> bool {
    let Some(mon) = crate::isoweek::week_monday_ymd(week) else {
        return false;
    };
    let Some(sun) = crate::isoweek::week_sunday_ymd(week) else {
        return false;
    };
    !start.is_empty() && !due.is_empty() && start <= sun.as_str() && due >= mon.as_str()
}

/// `(title, start, due, created_at)`。覆盖 `day` 的,按创建时间新的在前。
pub fn covering_on<'a>(rows: &'a [(String, String, String, String)], day: &str) -> Vec<&'a str> {
    let mut v: Vec<_> = rows
        .iter()
        .filter(|r| is_plan_name(&r.0) && covers_ymd(&r.1, &r.2, day))
        .collect();
    v.sort_by(|a, b| b.3.cmp(&a.3));
    v.into_iter().map(|r| r.0.as_str()).collect()
}

/// 覆盖当天的最后一个(创建时间最晚)。没有就 `None`。
pub fn current_from_milestones(
    rows: &[(String, String, String, String)],
    day: &str,
) -> Option<String> {
    covering_on(rows, day).first().map(|s| (*s).to_string())
}

/// 有没有里程碑覆盖到这一 ISO 周。
pub fn week_has_covering(rows: &[(String, String, String, String)], week: &str) -> bool {
    rows.iter()
        .any(|r| is_plan_name(&r.0) && overlaps_week(&r.1, &r.2, week))
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
    fn pack_source_and_cut_release_gates() {
        assert_eq!(pack_source("", "v0.3", false), None);
        assert_eq!(pack_source("v0.2", "v0.3", true), Some(PackSource::Tag));
        assert_eq!(pack_source("v0.3", "v0.3", true), Some(PackSource::Tag));
        assert_eq!(
            pack_source("v0.3", "v0.3", false),
            Some(PackSource::Workspace)
        );
        assert_eq!(pack_source("v0.4", "v0.3", false), None);
        assert!(can_cut_release("v0.3", "v0.3", false));
        assert!(!can_cut_release("v0.3", "v0.3", true));
        assert!(!can_cut_release("v0.2", "v0.3", false));
        assert!(!can_cut_release("v0.3", "", false));
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
        assert!(is_ops1_title("更新指标 + 制定版本计划 MVP收尾"));
        assert!(!is_ops1_title("更新指标 + 制定本周计划 2026-W36"));
        assert_eq!(ops1_title_for("v0.3"), "更新指标 + 制定版本计划 v0.3");
    }

    #[test]
    fn covers_and_picks_last_created() {
        assert!(covers_ymd("2026-09-01", "2026-09-05", "2026-09-02"));
        assert!(!covers_ymd("2026-09-01", "2026-09-05", "2026-09-08"));
        assert!(!covers_ymd("", "2026-09-05", "2026-09-02"));
        let rows = [
            (
                "v0.2".into(),
                "2026-09-01".into(),
                "2026-09-05".into(),
                "2026-09-01T10:00:00Z".into(),
            ),
            (
                "v0.3".into(),
                "2026-09-01".into(),
                "2026-09-05".into(),
                "2026-09-01T12:00:00Z".into(),
            ),
        ];
        assert_eq!(
            current_from_milestones(&rows, "2026-09-02").as_deref(),
            Some("v0.3")
        );
        let with_week = [
            (
                "2026-W36".into(),
                "2026-08-31".into(),
                "2026-09-04".into(),
                "2026-09-03T18:00:00Z".into(),
            ),
            (
                "v0.3".into(),
                "2026-09-01".into(),
                "2026-09-05".into(),
                "2026-09-01T12:00:00Z".into(),
            ),
        ];
        assert_eq!(
            current_from_milestones(&with_week, "2026-09-03").as_deref(),
            Some("2026-W36")
        );
        assert!(covering_on(&with_week, "2026-09-03").contains(&"2026-W36"));
        assert!(is_plan_name("v0.3"));
        assert!(is_plan_name("MVP收尾"));
        assert!(is_plan_name("2026-W36"));
        assert!(!is_plan_name(""));
        assert!(current_from_milestones(&rows, "2026-09-08").is_none());
        assert!(week_has_covering(&rows, "2026-W36"));
        assert!(!week_has_covering(&rows, "2026-W37"));
        assert!(week_has_covering(&with_week[..1], "2026-W36"));
    }

    #[test]
    fn already_started_or() {
        assert!(!ops1_already_started(false, false));
        assert!(ops1_already_started(true, false));
        assert!(ops1_already_started(false, true));
    }

    fn row(
        version: &str,
        created_at: i64,
        number: u32,
        open: bool,
        released: bool,
    ) -> Ops1VersionRow {
        Ops1VersionRow {
            version: version.into(),
            created_at,
            number,
            open,
            released,
        }
    }

    #[test]
    fn ops1_title_yields_version() {
        assert_eq!(ops1_version_from_title(OPS1_TITLE), None);
        assert_eq!(
            ops1_version_from_title("更新指标 + 制定版本计划 v0.3").as_deref(),
            Some("v0.3")
        );
        assert_eq!(
            ops1_version_from_title("更新指标 + 制定版本计划 MVP收尾").as_deref(),
            Some("MVP收尾")
        );
    }

    #[test]
    fn current_ops1_prefers_last_created_open() {
        let rows = [
            row("v0.2", 10, 1, true, false),
            row("v0.3", 20, 2, true, false),
            row("v0.1", 30, 3, false, true),
        ];
        assert_eq!(current_from_ops1(&rows).as_deref(), Some("v0.3"));
    }

    #[test]
    fn current_ops1_falls_back_to_closed_unreleased() {
        let rows = [
            row("v0.2", 10, 1, false, true),
            row("v0.3", 20, 2, false, false),
        ];
        assert_eq!(current_from_ops1(&rows).as_deref(), Some("v0.3"));
        let all_tagged = [row("v0.2", 10, 1, false, true)];
        assert!(current_from_ops1(&all_tagged).is_none());
    }
}
