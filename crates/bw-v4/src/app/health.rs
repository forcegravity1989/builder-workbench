//! 健康四判据的现算:从 issue、仓文件、git、远端取输入,交给密封的推导函数。
//!
//! 这一层只负责**收集输入**——判什么颜色是 [`crate::derive`] 的事,收集与判断
//! 分开,才能保证「灯只可能是算出来的」。
//!
//! 刀5(2026-08-22)迁完:判据不再读 `week_plan_file` / `release_file`(这两个
//! 模块已删)。`has_week_goal` 改查 ops① issue 在不在;`has_metric_reading` 和
//! `any_metric_red` 改读仓 `.bw/metrics/readings.jsonl`;`released` 改读 git
//! 标签日期(比 `Remote::list_releases` 只回 tag 名更有日期,且不依赖网关)。

use super::{App, Result};
use crate::derive::{derive_project_health, DerivedHealth, HealthInputs};
use crate::isoweek;
use crate::model::{Issue, IssueStatus, Project, ProjectId};
use crate::repo::metrics_file;
use std::path::Path;

/// 从 issue 列表 + 仓现场取四条判据的输入。git 读不到(不是仓、没提交)一律当
/// 「没有」,不报错——没数据本来就是合法状态,结果是灰灯而不是崩溃。
pub async fn collect_health_inputs(
    _project: &Project,
    workspace: &Path,
    week: &str,
    issues: &[Issue],
) -> HealthInputs {
    let last_week = isoweek::previous_week(week).unwrap_or_default();

    // (a) has_week_goal:本周的运作活① issue 在不在(标题 = ops1_title(week))。
    let ops1_title = crate::app::ops1_title(week);
    let has_week_goal = issues
        .iter()
        .any(|i| i.title == ops1_title && i.status != IssueStatus::Done);

    // 「这个仓 git 读得动吗」单独问一次:读不动的时候「零提交」说明不了任何
    // 事,不能拿去判红(新接入的项目第一眼看到红灯,是在编)。
    let git_readable = crate::git::is_repo(workspace).await;
    // 本周 + 上周的计数**一趟遍历出齐**。
    let mut wanted = vec![week.to_string()];
    if !last_week.is_empty() {
        wanted.push(last_week.clone());
    }
    let counts = crate::git::week_counts_many(workspace, &wanted)
        .await
        .unwrap_or_default();
    let committed_this_week = counts.get(week).is_some_and(|c| c.commits > 0);
    let committed_last_week = counts.get(&last_week).is_some_and(|c| c.commits > 0);
    let merged_last_week = counts.get(&last_week).is_some_and(|c| c.merges > 0);

    // (b) has_metric_reading + any_metric_red:读仓 `.bw/metrics/readings.jsonl`。
    let readings = read_metric_readings(workspace, week);
    let last_readings = if last_week.is_empty() {
        Vec::new()
    } else {
        read_metric_readings(workspace, &last_week)
    };
    let has_metric_reading = !readings.is_empty() || !last_readings.is_empty();
    let any_metric_red = check_metric_red(workspace, &readings).await;

    // (c) delivered_last_week:上周有合入 或 上周有发版(git 标签日期)。
    let released = git_tag_in_week(workspace, &last_week).await;

    HealthInputs {
        has_week_goal,
        committed_this_week,
        committed_last_week,
        git_readable,
        has_metric_reading,
        any_metric_red,
        delivered_last_week: merged_last_week || released,
    }
}

// ── readings.jsonl 读数 ──────────────────────────────────────────────

/// `.bw/metrics/readings.jsonl` 的一行读数。`pub` 是为了让 app-shell 的指标卡
/// 复用同一条读法(刀6:周计划文件不再写「本周指标读数」段,读数只从这份
/// jsonl 来)。`source` / `collected_at` 今天 jsonl 里还没写,留 `#[serde(default)]`
/// —— 以后加字段不破坏存量行。
#[derive(serde::Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct MetricReading {
    #[serde(default)]
    pub week: String,
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub collected_at: String,
}

/// 读指定周的读数行。文件不存在 / 格式坏 = 空(不报错,没数据是合法状态)。
/// 健康判据与 app-shell 指标卡都走这一条 —— jsonl 的格式只有这一处定义。
pub fn read_metric_readings(workspace: &Path, week: &str) -> Vec<MetricReading> {
    let path = workspace.join(".bw/metrics/readings.jsonl");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<MetricReading>(l).ok())
        .filter(|r| r.week == week)
        .collect()
}

/// 比对读数与 `.bw/metrics.toml` 的 target。无读数 / 无定义 / 解析不出 → false
/// (不假装红)。
async fn check_metric_red(workspace: &Path, readings: &[MetricReading]) -> bool {
    if readings.is_empty() {
        return false;
    }
    let Ok(Some(metrics)) = metrics_file::read(workspace) else {
        return false;
    };
    for r in readings {
        let Some(def) = metrics.all().into_iter().find(|d| d.name == r.name) else {
            continue;
        };
        if target_violated(&def.target, &r.value) {
            return true;
        }
    }
    false
}

/// 简单比对 target(如 `≥5` `≤24h`)与读数值。解析不出就当没越线(false)。
fn target_violated(target: &str, value: &str) -> bool {
    let target = target.trim();
    if target.is_empty() {
        return false;
    }
    // 拆运算符和数值。
    let (op, num_str) = if let Some(s) = target.strip_prefix("≥") {
        (">=", s)
    } else if let Some(s) = target.strip_prefix("≤") {
        ("<=", s)
    } else if let Some(s) = target.strip_prefix(">") {
        (">", s)
    } else if let Some(s) = target.strip_prefix("<") {
        ("<", s)
    } else if let Some(s) = target.strip_prefix("=") {
        ("==", s)
    } else {
        return false;
    };
    // 去掉单位后缀(h、d、% 等),只比数值。
    let target_num: f64 = num_str
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect::<String>()
        .parse()
        .ok()
        .unwrap_or(f64::INFINITY);
    let value_num: f64 = value
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect::<String>()
        .parse()
        .ok()
        .unwrap_or(f64::NEG_INFINITY);
    match op {
        ">=" => value_num < target_num,
        "<=" => value_num > target_num,
        ">" => value_num <= target_num,
        "<" => value_num >= target_num,
        "==" => (value_num - target_num).abs() > f64::EPSILON,
        _ => false,
    }
}

/// git 标签日期落在指定周 → true。读不动 = false(不假装发过版)。
async fn git_tag_in_week(workspace: &Path, week: &str) -> bool {
    if week.is_empty() {
        return false;
    }
    crate::git::tags_with_dates(workspace)
        .await
        .iter()
        .any(|(_tag, date)| week_of_date(date).as_deref() == Some(week))
}

/// `2026-08-20` → `2026-W34`。认不出格式就返回 `None`,不猜。
fn week_of_date(s: &str) -> Option<String> {
    let d = time::Date::parse(
        s.trim(),
        &time::format_description::well_known::Iso8601::DATE,
    )
    .ok()?;
    Some(isoweek::iso_week_of(d))
}

impl App {
    /// 现算一次健康,并把结果写回项目注册表的显示缓存。
    ///
    /// 项目墙的灯读注册表缓存;打开项目时 `build_project` 会调
    /// `collect_health_inputs` 重算并顺手写回缓存。
    pub async fn recompute_health(&self, project_id: ProjectId) -> Result<DerivedHealth> {
        let project = self.project_of(project_id).await?;
        let ws = self.workspace_of(project_id).await?;
        let week = isoweek::current_week();
        let issues = self.issues(project_id).await?;
        let inputs = collect_health_inputs(&project, &ws, &week, &issues).await;
        let health = derive_project_health(&inputs);
        self.cache_project_health(project_id, &health).await?;
        Ok(health)
    }
}
