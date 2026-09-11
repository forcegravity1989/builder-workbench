use super::App;
use crate::command::Event;
use crate::isoweek;
use crate::model::ProjectId;
use crate::repo::metrics_file::{self, MetricClass, MetricDef};
use crate::repo::readings_file::{self, MetricReading};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(900);

/// None 表示缺数据，不能补零。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetricPoint {
    pub week: String,
    pub value: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetricReadout {
    pub name: String,
    pub class: MetricClass,
    /// 近 N 周,旧的在前,**每一周都有一格**(没采到的那格是 `None`)。
    /// 手填与整条采集失败时是空的。
    pub points: Vec<MetricPoint>,
    /// 近 14 个日历日。A 类按天再跑一趟脚本;跑不动就空着,不挡周走势。
    pub day_points: Vec<MetricPoint>,
    /// 仅使用最后一周的值；该周缺数时不能用前一周替代。
    pub current: Option<String>,
    /// 这次为什么没采到。空 = 采到了,或者压根不该采(手填)。**不吞错误。**
    pub error: String,
}

/// 可回溯指标按时间窗运行脚本；其他指标从读数文件生成历史。
pub async fn collect_all(ws: &Path, weeks: u32) -> Result<Vec<MetricReadout>, String> {
    let file = metrics_file::read(ws)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "这个项目还没有 .bw/metrics.toml".to_string())?;
    let labels = week_labels(weeks);
    let ledger = write_ledger(ws).await;
    let mut out = Vec::new();
    for def in file.all() {
        out.push(collect_one(ws, ledger.as_deref(), def, &labels).await);
    }
    Ok(out)
}

pub async fn collect_b_class(ws: &Path, weeks: u32) -> Result<Vec<MetricReadout>, String> {
    let file = metrics_file::read(ws)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "这个项目还没有 .bw/metrics.toml".to_string())?;
    let labels = week_labels(weeks);
    let ledger = write_ledger(ws).await;
    let mut out = Vec::new();
    for def in file.all() {
        if def.collect.class() != MetricClass::PointInTime {
            continue;
        }
        out.push(collect_one(ws, ledger.as_deref(), def, &labels).await);
    }
    Ok(out)
}

pub fn has_b_class(ws: &Path) -> bool {
    metrics_file::read(ws)
        .ok()
        .flatten()
        .map(|f| {
            f.all()
                .iter()
                .any(|d| d.collect.class() == MetricClass::PointInTime)
        })
        .unwrap_or(false)
}

async fn collect_one(
    ws: &Path,
    ledger: Option<&Path>,
    def: &MetricDef,
    labels: &[String],
) -> MetricReadout {
    let class = def.collect.class();
    let mut r = MetricReadout {
        name: def.name.clone(),
        class,
        points: Vec::new(),
        day_points: Vec::new(),
        current: None,
        error: String::new(),
    };
    match class {
        MetricClass::Manual => {
            fill_from_readings(ws, &def.name, labels, &mut r);
            return r;
        }
        MetricClass::PointInTime => {
            return collect_point_in_time(ws, ledger, def, labels, r).await;
        }
        MetricClass::Retro => {}
    }
    if def.collect.run.is_empty() {
        r.error = "这条写的是脚本采集,但 run 是空的 —— 那是一条写了一半的定义,没法采".into();
        return r;
    }
    match run_script(ws, &def.collect.run, labels).await {
        Ok(ScriptOutcome::Series(points)) => {
            r.current = points.last().and_then(|p| p.value.clone());
            r.points = points;
        }
        Ok(ScriptOutcome::Snapshot(value)) => {
            r.points = snapshot_as_last_week(labels, &value);
            r.current = Some(value);
        }
        Err(e) => r.error = e,
    }
    let days = isoweek::recent_days(14);
    match run_script(ws, &def.collect.run, &days).await {
        Ok(ScriptOutcome::Series(pts)) => r.day_points = pts,
        Ok(ScriptOutcome::Snapshot(_)) => {
            if r.error.is_empty() {
                r.error = "按天只吐了一个当下值,画不出日走势".into();
            }
        }
        Err(e) => {
            if r.error.is_empty() {
                r.error = format!("按周有数,按天没有:{e}");
            }
        }
    }
    r
}

/// 当前值采集失败时不写零，历史仍使用已保存的读数。
async fn collect_point_in_time(
    ws: &Path,
    ledger: Option<&Path>,
    def: &MetricDef,
    labels: &[String],
    mut r: MetricReadout,
) -> MetricReadout {
    if def.collect.run.is_empty() {
        r.error = "这条写的是脚本采集,但 run 是空的 —— 那是一条写了一半的定义,没法采".into();
        fill_from_readings(ws, &def.name, labels, &mut r);
        return r;
    }
    match run_script(ws, &def.collect.run, labels).await {
        Ok(out) => match current_value(&out) {
            Some(value) => {
                if let Some(dest) = ledger {
                    if let Err(e) = upsert_current(dest, &def.name, &value) {
                        r.error = format!("采到了 {value},但没写成读数流水:{e}");
                    }
                } else {
                    r.error = format!("采到了 {value},但开不出账本,没写下主检出");
                }
                fill_from_readings(ws, &def.name, labels, &mut r);
            }
            None => {
                r.error = "采集脚本没给出当下这个值".into();
                fill_from_readings(ws, &def.name, labels, &mut r);
            }
        },
        Err(e) => {
            r.error = e;
            fill_from_readings(ws, &def.name, labels, &mut r);
        }
    }
    r
}

fn current_value(out: &ScriptOutcome) -> Option<String> {
    match out {
        ScriptOutcome::Snapshot(v) => Some(v.clone()),
        ScriptOutcome::Series(pts) => pts.iter().rev().find_map(|p| p.value.clone()),
    }
}

fn upsert_current(ledger: &Path, name: &str, value: &str) -> Result<(), String> {
    let collected_at = time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default();
    readings_file::upsert_metric_reading(
        ledger,
        &MetricReading {
            day: isoweek::today_ymd(),
            name: name.to_string(),
            value: value.to_string(),
            source: "script".into(),
            collected_at,
        },
    )
    .map_err(|e| e.to_string())
}

/// 读数只写入专用工作树；无法创建时不改写主检出，也不占用预定路径。
async fn write_ledger(main: &Path) -> Option<PathBuf> {
    match bw_engine::workspace::provision_ledger_worktree(main).await {
        Ok(p) => {
            seed_ledger(main, &p);
            Some(p)
        }
        Err(_) => None,
    }
}

fn seed_ledger(main: &Path, ledger: &Path) {
    let src = main.join(".bw/metrics/readings.jsonl");
    let dst = ledger.join(".bw/metrics/readings.jsonl");
    if dst.is_file() || !src.is_file() {
        return;
    }
    if let Some(parent) = dst.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::copy(&src, &dst);
}

fn fill_from_readings(ws: &Path, name: &str, labels: &[String], r: &mut MetricReadout) {
    let values = readings_file::latest_values_for(ws, name, labels);
    r.points = labels
        .iter()
        .zip(values)
        .map(|(week, value)| MetricPoint {
            week: week.clone(),
            value,
        })
        .collect();
    r.current = r.points.last().and_then(|p| p.value.clone());
}

impl App {
    pub(super) async fn record_manual_metric(
        &mut self,
        project_id: ProjectId,
        name: String,
        value: String,
    ) -> super::Result<Vec<Event>> {
        let value = value.trim().to_string();
        if value.is_empty() {
            return Err(super::AppError::Refused("手填的数不能空".into()));
        }
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(super::AppError::Refused("指标名不能空".into()));
        }
        let ws = self.workspace_of(project_id).await?;
        let ledger = write_ledger(&ws)
            .await
            .ok_or_else(|| super::AppError::Refused("开不出读数账本,手填不能写进主检出".into()))?;
        let file = metrics_file::read(&ws)?
            .ok_or_else(|| super::AppError::Refused("这个项目还没有 .bw/metrics.toml".into()))?;
        let def = file
            .all()
            .into_iter()
            .find(|d| d.name == name)
            .ok_or_else(|| super::AppError::Refused(format!("没有叫 {name} 的指标")))?;
        if def.collect.class() != MetricClass::Manual {
            return Err(super::AppError::Refused(format!(
                "「{name}」不是手填指标,点采集让脚本跑"
            )));
        }
        let day = isoweek::today_ymd();
        let collected_at = time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();
        readings_file::upsert_metric_reading(
            &ledger,
            &MetricReading {
                day: day.clone(),
                name: name.clone(),
                value: value.clone(),
                source: "manual".into(),
                collected_at,
            },
        )?;
        Ok(vec![Event::MetricRecorded {
            project_id,
            name,
            day,
            value,
        }])
    }
}

enum ScriptOutcome {
    Series(Vec<MetricPoint>),
    Snapshot(String),
}

fn snapshot_as_last_week(labels: &[String], value: &str) -> Vec<MetricPoint> {
    labels
        .iter()
        .enumerate()
        .map(|(i, w)| MetricPoint {
            week: w.clone(),
            value: (i + 1 == labels.len()).then(|| value.to_string()),
        })
        .collect()
}

#[derive(Deserialize)]
struct ScriptOut {
    #[serde(default)]
    points: Vec<ScriptPoint>,
    #[serde(default)]
    value: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct ScriptPoint {
    #[serde(default)]
    week: String,
    #[serde(default)]
    day: String,
    value: serde_json::Value,
}

fn point_key(p: &ScriptPoint) -> &str {
    if !p.day.is_empty() {
        p.day.trim()
    } else {
        p.week.trim()
    }
}

fn as_text(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::Number(n) => Some(n.to_string()),
        serde_json::Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

async fn run_script(ws: &Path, run: &[String], labels: &[String]) -> Result<ScriptOutcome, String> {
    let (since, until) = window_of(labels)?;
    let mut cmd = bw_engine::tokio_cmd(&run[0]);
    cmd.args(&run[1..])
        .arg("--since")
        .arg(&since)
        .arg("--until")
        .arg(&until)
        .arg("--granularity")
        .arg(grain_of(labels))
        .current_dir(ws)
        .env("PYTHONUTF8", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let out = match tokio::time::timeout(TIMEOUT, cmd.output()).await {
        Err(_) => return Err(format!("采集脚本超过 {} 秒还没跑完", TIMEOUT.as_secs())),
        Ok(Err(e)) => return Err(format!("起不动采集脚本 `{}`:{e}", run.join(" "))),
        Ok(Ok(o)) => o,
    };
    if !out.status.success() {
        let why = String::from_utf8_lossy(&out.stderr).trim().to_string();
        let why = if why.is_empty() {
            format!("退出码 {}", out.status)
        } else {
            why
        };
        return Err(format!("采集脚本失败:{why}"));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let parsed: ScriptOut = serde_json::from_str(text.trim()).map_err(|e| {
        let head: String = text.trim().chars().take(120).collect();
        format!("采集脚本的输出不是 JSON({e});它打的是:{head}")
    })?;
    align_script_out(parsed, labels)
}

fn align_script_out(parsed: ScriptOut, labels: &[String]) -> Result<ScriptOutcome, String> {
    if parsed.points.is_empty() {
        if let Some(v) = parsed.value.as_ref().and_then(as_text) {
            return Ok(ScriptOutcome::Snapshot(v));
        }
        return Err("采集脚本没给出任何数据点".into());
    }
    // 缺少的时间点保留为 None，避免图表掩盖时间断档。
    let mut points = Vec::with_capacity(labels.len());
    for w in labels {
        let value = parsed
            .points
            .iter()
            .find(|p| point_key(p) == w.as_str())
            .and_then(|p| as_text(&p.value));
        points.push(MetricPoint {
            week: w.clone(),
            value,
        });
    }
    if points.iter().all(|p| p.value.is_none()) {
        return Err(
            "采集脚本给的点号和 Workbench 要的对不上(周是 `2026-W34`,天是 `2026-09-01`)".into(),
        );
    }
    Ok(ScriptOutcome::Series(points))
}

fn week_labels(weeks: u32) -> Vec<String> {
    let mut out = Vec::new();
    let mut w = isoweek::current_week();
    for _ in 0..weeks.max(1) {
        out.push(w.clone());
        let Some(prev) = isoweek::previous_week(&w) else {
            break;
        };
        w = prev;
    }
    out.reverse();
    out
}

fn grain_of(labels: &[String]) -> &'static str {
    if labels
        .first()
        .is_some_and(|s| isoweek::parse_ymd(s).is_some())
    {
        "day"
    } else {
        "week"
    }
}

/// `[since, until)`,本机时区,左闭右开。周窗的 until 是最后一周的下周一;
/// 天窗的 until 是最后一天的下一天。
fn window_of(labels: &[String]) -> Result<(String, String), String> {
    let first = labels.first().ok_or("没有要采的窗")?;
    let last = labels.last().ok_or("没有要采的窗")?;
    if let (Some(since), Some(last_day)) = (isoweek::parse_ymd(first), isoweek::parse_ymd(last)) {
        return Ok((
            isoweek::format_ymd(since),
            isoweek::format_ymd(last_day + time::Duration::days(1)),
        ));
    }
    let (since, _) = isoweek::week_bounds(first).ok_or(format!("认不出周号 {first}"))?;
    let (_, until) = isoweek::week_bounds(last).ok_or(format!("认不出周号 {last}"))?;
    Ok((isoweek::format_ymd(since), isoweek::format_ymd(until)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(s: &str) -> ScriptOut {
        serde_json::from_str(s).expect("fixture json")
    }

    #[test]
    fn value_only_is_snapshot_not_failure() {
        let out = align_script_out(
            parse(r#"{"value": 8}"#),
            &["2026-W32".into(), "2026-W33".into()],
        )
        .unwrap();
        match out {
            ScriptOutcome::Snapshot(v) => assert_eq!(v, "8"),
            ScriptOutcome::Series(_) => panic!("must not invent a weekly series"),
        }
    }

    #[test]
    fn daily_points_align_by_day_field() {
        let out = align_script_out(
            parse(r#"{"points":[{"day":"2026-09-01","value":2},{"day":"2026-09-03","value":4}]}"#),
            &[
                "2026-09-01".into(),
                "2026-09-02".into(),
                "2026-09-03".into(),
            ],
        )
        .unwrap();
        let ScriptOutcome::Series(points) = out else {
            panic!("expected series");
        };
        assert_eq!(
            points
                .iter()
                .map(|p| (p.week.as_str(), p.value.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("2026-09-01", Some("2")),
                ("2026-09-02", None),
                ("2026-09-03", Some("4")),
            ]
        );
    }

    #[test]
    fn weekly_points_align_and_keep_gaps() {
        let out = align_script_out(
            parse(r#"{"points":[{"week":"2026-W32","value":3},{"week":"2026-W34","value":5}]}"#),
            &["2026-W32".into(), "2026-W33".into(), "2026-W34".into()],
        )
        .unwrap();
        let ScriptOutcome::Series(points) = out else {
            panic!("expected series");
        };
        assert_eq!(
            points
                .iter()
                .map(|p| (p.week.as_str(), p.value.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("2026-W32", Some("3")),
                ("2026-W33", None),
                ("2026-W34", Some("5")),
            ]
        );
    }

    #[test]
    fn snapshot_lands_on_last_week_only() {
        let points = snapshot_as_last_week(
            &["2026-W32".into(), "2026-W33".into(), "2026-W34".into()],
            "8",
        );
        assert_eq!(
            points
                .iter()
                .map(|p| (p.week.as_str(), p.value.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("2026-W32", None),
                ("2026-W33", None),
                ("2026-W34", Some("8")),
            ]
        );
    }

    #[tokio::test]
    async fn ledger_failure_never_creates_a_plain_directory_at_the_worktree_path() {
        let root =
            std::env::temp_dir().join(format!("bw-ledger-fallback-{}", uuid::Uuid::new_v4()));
        let main = root.join("repo");
        let legacy = root.join("repo-bw-ledger");
        std::fs::create_dir_all(&main).unwrap();
        std::fs::create_dir_all(&legacy).unwrap();

        assert_eq!(write_ledger(&main).await, None);
        let target = bw_engine::workspace::ledger_worktree_path(&main).unwrap();
        assert!(!target.exists());

        std::fs::remove_dir_all(&root).unwrap();
    }
}
