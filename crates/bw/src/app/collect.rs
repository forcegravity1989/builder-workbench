//! 指标采集 —— 起脚本、传时间窗、读标准输出的 JSON。
//!
//! 这个模块只做那三件事,**一件业务判断都不做**:
//!
//! 1. **采集方式只有两种** —— 脚本、手填。没有第三种,尤其**没有「Workbench 内建的
//!    git 算子」**:那等于把算法藏进二进制,项目看不见、改不了、也说不清这个数
//!    怎么来的。git 类统计一样走脚本,只不过脚本由 Workbench 铺一份现成的。
//! 2. **窗口由 Workbench 给,不是脚本自己决定**。面板要四周就传四周,要八周就传
//!    八周 —— 采多少和画多少永远一致。V3 把这个决定权留在脚本里(自带脚本硬编码
//!    30 天)而面板按 8 周画,于是前三四周永远是空的,长期对不上还没人发现。
//! 3. **只认标准输出的一个 JSON 对象**,不是 JSON 就算这次采集失败。V3 只读脚本
//!    写出的文件、不看标准输出,结果**每次采集都报「成功」而指标永远没数**。
//!
//! **失败一律如实,绝不写 0。** 0 是一个真实的数值,「没采到」不是。

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

/// 单个脚本最多跑多久。超时按「没采到」算,不是按 0 算。
const TIMEOUT: Duration = Duration::from_secs(90);

/// 一周一个点。`value` **原样保留脚本给的东西** —— 数也好、`"87%"` 这种给人看的
/// 字符串也好,要画走势时才解析,解析不出来的点跳过、不画、不猜。
///
/// **`None` = 这一周没采到,不是 0**。脚本少给几周时那几格留 `None`,走势图上
/// 断开;**绝不把这几格从序列里删掉** —— 删掉会让图把剩下的点均匀铺开,看起来
/// 像是连续的四周,读的人根本发现不了中间断过。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetricPoint {
    pub week: String,
    pub value: Option<String>,
}

/// 一条指标采完之后的样子。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MetricReadout {
    /// 指标名 —— `.bw/config/metrics.toml` 里没有单独的 id,名字就是键。
    pub name: String,
    pub class: MetricClass,
    /// 近 N 周,旧的在前,**每一周都有一格**(没采到的那格是 `None`)。
    /// 手填与整条采集失败时是空的。
    pub points: Vec<MetricPoint>,
    /// 现值 = **最后那一周**的值。最后一周没采到就是 `None` —— 绝不拿上一周的
    /// 数顶上当现值,那会把一个过期的数字标成「现在是多少」。
    pub current: Option<String>,
    /// 这次为什么没采到。空 = 采到了,或者压根不该采(手填)。**不吞错误。**
    pub error: String,
}

/// 采一遍这个项目的全部指标。
///
/// 三类各走各的路:可回溯的现算(传窗口跑脚本);不可回溯的跑脚本拿当下值,
/// 记进账本 worktree 的 `.bw/state/metrics-readings.jsonl`(当天一行,再采覆盖),
/// 走势从流水里铺;手填不跑脚本,走势从流水铺,数由 [`App::record_manual_metric`] 写入。
pub async fn collect_all(ws: &Path, weeks: u32) -> Result<Vec<MetricReadout>, String> {
    let file = metrics_file::read(ws)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "这个项目还没有 .bw/config/metrics.toml".to_string())?;
    let labels = week_labels(weeks);
    let ledger = write_ledger(ws).await;
    let mut out = Vec::new();
    for def in file.all() {
        out.push(collect_one(ws, ledger.as_deref(), def, &labels).await);
    }
    Ok(out)
}

/// 只采 B 类(不可回溯、当下值进流水)。记账键是日历日,自动采每天一轮,展示按周。
pub async fn collect_b_class(ws: &Path, weeks: u32) -> Result<Vec<MetricReadout>, String> {
    let file = metrics_file::read(ws)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "这个项目还没有 .bw/config/metrics.toml".to_string())?;
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
            // 一个值也画:落在窗口最后一周,前面几周断开。不编前几周的数,
            // 也不把整张卡打成失败 —— 规范仍要求 A 类吐按周 points。
            r.points = snapshot_as_last_week(labels, &value);
            r.current = Some(value);
        }
        Err(e) => r.error = e,
    }
    r
}

/// B 类:跑脚本拿当下一个值,覆盖进账本当天那一行,走势从流水铺。失败不写 0,旧行仍画。
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

/// 读数账本:固定 worktree,写不进主检出。开不出树就退到同路径普通目录。
async fn write_ledger(main: &Path) -> Option<PathBuf> {
    match bw_engine::workspace::provision_ledger_worktree(main).await {
        Ok(p) => {
            seed_ledger(main, &p);
            Some(p)
        }
        Err(_) => {
            let dir = bw_engine::workspace::ledger_worktree_path(main)?;
            let _ = std::fs::create_dir_all(&dir);
            seed_ledger(main, &dir);
            Some(dir)
        }
    }
}

fn seed_ledger(main: &Path, ledger: &Path) {
    let src = main.join(".bw/state/metrics-readings.jsonl");
    let dst = ledger.join(".bw/state/metrics-readings.jsonl");
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

/// 本机「今日已试过 B 类日采」的戳。写在 Workbench 资产目录,不进被管仓。
fn collect_stamp_path(asset_root: &Path, slug: &str) -> PathBuf {
    asset_root.join("collect-stamp").join(slug)
}

fn stamp_is_today(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .is_some_and(|s| s.trim() == isoweek::today_ymd())
}

fn write_today_stamp(path: &Path) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(path, isoweek::today_ymd());
}

impl App {
    /// 人在总览手填卡记下今天这个数。只收 C 类,覆盖进账本当天那一行。
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
        let file = metrics_file::read(&ws)?.ok_or_else(|| {
            super::AppError::Refused("这个项目还没有 .bw/config/metrics.toml".into())
        })?;
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

    /// Workbench 开着、过了本机 20:00、今天还没试过,就采一轮 B 类。
    /// 不建活。失败也落今日戳,避免每 60 秒重打失败脚本。
    pub(super) async fn maybe_auto_collect_b(&self, project_id: ProjectId) -> Vec<Event> {
        if !isoweek::local_hm_reached(20, 0) {
            return vec![];
        }
        let Ok(slug) = self.slug_of(project_id).await else {
            return vec![];
        };
        if slug.is_empty() {
            return vec![];
        }
        let stamp = collect_stamp_path(&self.asset_root, &slug);
        if stamp_is_today(&stamp) {
            return vec![];
        }
        let Ok(ws) = self.workspace_of(project_id).await else {
            return vec![];
        };
        if !has_b_class(&ws) {
            return vec![];
        }
        write_today_stamp(&stamp);
        let Ok(rows) = collect_b_class(&ws, 4).await else {
            return vec![];
        };
        let count = rows
            .iter()
            .filter(|r| r.error.is_empty() && r.current.is_some())
            .count() as u32;
        if count == 0 {
            return vec![];
        }
        vec![Event::MetricsAutoCollected {
            project_id,
            week: isoweek::current_week(),
            count,
        }]
    }
}

/// 脚本跑完的两种诚实结果。
enum ScriptOutcome {
    /// 按周对齐过的序列,每一周都有一格。
    Series(Vec<MetricPoint>),
    /// 只给了当下一个值。采集层会把它落在窗口最后一周,前几周断开。
    Snapshot(String),
}

/// 单点快照对齐到近 N 周:只有最后一格有值。
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

/// 脚本吐回来的 JSON。可回溯的给序列;不可回溯的给一个当下的值,Workbench 记进流水。
#[derive(Deserialize)]
struct ScriptOut {
    #[serde(default)]
    points: Vec<ScriptPoint>,
    #[serde(default)]
    value: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct ScriptPoint {
    week: String,
    value: serde_json::Value,
}

/// 把 JSON 值变成给人看的字符串。**数不带小数点尾巴,字符串原样。**
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
        .arg("week")
        .current_dir(ws)
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
        // 把原始输出的头一段带出来 —— 「不是 JSON」这句话本身帮不上人,
        // 看见它到底打了什么才帮得上。
        let head: String = text.trim().chars().take(120).collect();
        format!("采集脚本的输出不是 JSON({e});它打的是:{head}")
    })?;
    align_script_out(parsed, labels)
}

/// 把脚本吐的 JSON 对齐到 Workbench 要的周。抽出来是为了单测「只给 value」和
/// 「周号对不上」这两条,不靠起真脚本。
fn align_script_out(parsed: ScriptOut, labels: &[String]) -> Result<ScriptOutcome, String> {
    if parsed.points.is_empty() {
        if let Some(v) = parsed.value.as_ref().and_then(as_text) {
            return Ok(ScriptOutcome::Snapshot(v));
        }
        return Err("采集脚本没给出任何数据点".into());
    }
    // 按 Workbench 要的周对齐:脚本多给的周丢掉,少给的周留 `None`(断开,不补前值)。
    // **每一周都占一格** —— 缺的周如果直接不放进序列,走势图会把剩下的点均匀
    // 铺开,四周看起来还是连续的四周,读的人发现不了中间断过。
    let mut points = Vec::with_capacity(labels.len());
    for w in labels {
        let value = parsed
            .points
            .iter()
            .find(|p| p.week.trim() == w.as_str())
            .and_then(|p| as_text(&p.value));
        points.push(MetricPoint {
            week: w.clone(),
            value,
        });
    }
    if points.iter().all(|p| p.value.is_none()) {
        return Err(
            "采集脚本给的周号和 Workbench 要的对不上(要的是 `2026-W34` 这种 ISO 周)".into(),
        );
    }
    Ok(ScriptOutcome::Series(points))
}

/// 近 `weeks` 周的 ISO 周号,**旧的在前**。
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

/// 这一串周对应的 `[since, until)`,都是本机时区的日期。**左闭右开** ——
/// `until` 是最后一周的下周一,不是那一周的周日,免得少算一天。
fn window_of(labels: &[String]) -> Result<(String, String), String> {
    let first = labels.first().ok_or("没有要采的周")?;
    let last = labels.last().ok_or("没有要采的周")?;
    let (since, _) = isoweek::week_bounds(first).ok_or(format!("认不出周号 {first}"))?;
    let (_, until) = isoweek::week_bounds(last).ok_or(format!("认不出周号 {last}"))?;
    let fmt = |d: time::Date| format!("{:04}-{:02}-{:02}", d.year(), u8::from(d.month()), d.day());
    Ok((fmt(since), fmt(until)))
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
}
