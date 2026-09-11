use std::sync::OnceLock;
use time::{Date, Duration, OffsetDateTime, UtcOffset, Weekday};

/// 本机时区偏移。**必须在起任何线程之前调一次**(`main` / 指挥器的第一行):
/// Unix 上「当前时区」这个系统调用在多线程进程里不保证安全,`time` crate 因此
/// 只在单线程阶段才肯给准确答案。取不到就退回 UTC,并如实说一声。
///
/// 为什么值得费这个事:周是 V4 的时间单位,而中国用户在 UTC+8。周一早上
/// 八点前按 UTC 算还是上一周 —— 而周一早上正是人开周计划的时候。
static LOCAL_OFFSET: OnceLock<UtcOffset> = OnceLock::new();

pub fn init_local_offset() {
    let offset = match UtcOffset::current_local_offset() {
        Ok(o) => o,
        Err(_) => {
            bw_engine::dlog!(warn, "time", "[BW_TIME] 取不到本机时区,周按 UTC 算");
            UtcOffset::UTC
        }
    };
    let _ = LOCAL_OFFSET.set(offset);
}

/// 启动那一刻探到的本机时区偏移。**要格式化时间就用它**,不要再调一次
/// `UtcOffset::current_local_offset()` —— 那个调用在多线程进程里必然失败,
/// 静默退回 UTC,于是同一屏上时间戳按 UTC、周号按本机时区,差 8 小时。
pub fn local_offset() -> UtcOffset {
    *LOCAL_OFFSET.get().unwrap_or(&UtcOffset::UTC)
}

fn now_local() -> OffsetDateTime {
    OffsetDateTime::now_utc().to_offset(local_offset())
}

pub fn iso_week_of(date: Date) -> String {
    let (year, week, _) = date.to_iso_week_date();
    format!("{year}-W{week:02}")
}

/// 使用本机时区的日历日期。
pub fn today_local() -> Date {
    now_local().date()
}

pub fn format_ymd(d: Date) -> String {
    format!("{:04}-{:02}-{:02}", d.year(), u8::from(d.month()), d.day())
}

pub fn today_ymd() -> String {
    format_ymd(today_local())
}

pub fn recent_days(n: u32) -> Vec<String> {
    let today = today_local();
    let n = n.max(1) as i64;
    (0..n)
        .rev()
        .map(|i| format_ymd(today - Duration::days(i)))
        .collect()
}

pub fn week_monday_ymd(week: &str) -> Option<String> {
    week_start(week).map(format_ymd)
}

pub fn week_friday_ymd(week: &str) -> Option<String> {
    week_start(week).map(|d| format_ymd(d + Duration::days(4)))
}

pub fn week_sunday_ymd(week: &str) -> Option<String> {
    week_start(week).map(|d| format_ymd(d + Duration::days(6)))
}

pub fn parse_ymd(s: &str) -> Option<Date> {
    let mut it = s.split('-');
    let y: i32 = it.next()?.parse().ok()?;
    let m: u8 = it.next()?.parse().ok()?;
    let d: u8 = it.next()?.parse().ok()?;
    if it.next().is_some() {
        return None;
    }
    let month = time::Month::try_from(m).ok()?;
    Date::from_calendar_date(y, month, d).ok()
}

pub fn week_of_ymd(s: &str) -> Option<String> {
    parse_ymd(s).map(iso_week_of)
}

pub fn local_hm_reached(hour: u8, minute: u8) -> bool {
    let now = now_local();
    (now.hour(), now.minute()) >= (hour, minute)
}

pub fn current_week() -> String {
    iso_week_of(now_local().date())
}

pub fn is_week(s: &str) -> bool {
    week_start(s).is_some()
}

pub fn week_start(week: &str) -> Option<Date> {
    let (year, rest) = week.split_once("-W")?;
    let year: i32 = year.parse().ok()?;
    let week: u8 = rest.parse().ok()?;
    if !(1..=53).contains(&week) {
        return None;
    }
    // 从 1 月 4 日出发——ISO 规定它一定落在第 1 周。
    let jan4 = Date::from_calendar_date(year, time::Month::January, 4).ok()?;
    let monday_of_week1 = jan4 - Duration::days(jan4.weekday().number_days_from_monday() as i64);
    let candidate = monday_of_week1 + Duration::weeks(week as i64 - 1);
    // 第 53 周在多数年份不存在,换算回去对不上就说明这个周号是假的。
    (iso_week_of(candidate) == format!("{year}-W{week:02}")).then_some(candidate)
}

/// 那一周的周一 00:00 与下周一 00:00(左闭右开),给 git 按周窗口取数用。
pub fn week_bounds(week: &str) -> Option<(Date, Date)> {
    let start = week_start(week)?;
    Some((start, start + Duration::weeks(1)))
}

pub fn previous_week(week: &str) -> Option<String> {
    week_start(week).map(|d| iso_week_of(d - Duration::weeks(1)))
}

pub fn next_week(week: &str) -> Option<String> {
    week_start(week).map(|d| iso_week_of(d + Duration::weeks(1)))
}

pub fn starts_on_monday(week: &str) -> bool {
    week_start(week).is_some_and(|d| d.weekday() == Weekday::Monday)
}

/// 只接受“星期缩写 时:分”，例如 fri 20:00；不支持 cron 表达式。
pub fn parse_schedule(spec: &str) -> Option<(u8, u8, u8)> {
    let spec = spec.trim().to_ascii_lowercase();
    let (day, time) = spec.split_once(char::is_whitespace)?;
    // 按字符取值，避免非 ASCII 输入在字节切片处 panic。
    let head: String = day.chars().take(3).collect();
    let dow = match head.as_str() {
        "mon" => 1,
        "tue" => 2,
        "wed" => 3,
        "thu" => 4,
        "fri" => 5,
        "sat" => 6,
        "sun" => 7,
        _ => return None,
    };
    let (h, m) = time.trim().split_once(':')?;
    let h: u8 = h.parse().ok()?;
    let m: u8 = m.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some((dow, h, m))
}

pub fn unix_in_week(ts: i64, week: &str) -> bool {
    week_of_unix(ts).as_deref() == Some(week)
}

/// Unix 秒对应的本机 ISO 周。`ts <= 0` 或解析不出 → `None`。
pub fn week_of_unix(ts: i64) -> Option<String> {
    if ts <= 0 {
        return None;
    }
    let dt = OffsetDateTime::from_unix_timestamp(ts).ok()?;
    Some(iso_week_of(dt.to_offset(local_offset()).date()))
}

pub fn schedule_passed_this_week(spec: &str) -> bool {
    let Some((dow, h, m)) = parse_schedule(spec) else {
        return false;
    };
    let now = now_local();
    let today = now.weekday().number_from_monday();
    (today, now.hour(), now.minute()) >= (dow, h, m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_week_accepts_iso_and_rejects_plan_names() {
        assert!(is_week("2026-W35"));
        assert!(!is_week("v0.3"));
        assert!(!is_week("MVP收尾"));
    }

    #[test]
    fn unix_in_week_rejects_zero() {
        assert!(!unix_in_week(0, "2026-W36"));
        assert!(!unix_in_week(-1, "2026-W36"));
    }

    #[test]
    fn unix_in_week_matches_iso_week_of_that_instant() {
        let ts = time::OffsetDateTime::from_unix_timestamp(1_725_000_000)
            .expect("fixed ts")
            .unix_timestamp();
        let week = iso_week_of(
            time::OffsetDateTime::from_unix_timestamp(ts)
                .expect("roundtrip")
                .to_offset(local_offset())
                .date(),
        );
        assert!(unix_in_week(ts, &week));
        assert!(!unix_in_week(ts, "1999-W01"));
    }
}
