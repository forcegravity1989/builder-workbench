//! 健康四判据的现算:从 issue、仓文件、git、远端取输入,交给密封的推导函数。
//!
//! 这一层只负责**收集输入**——判什么颜色是 [`crate::derive`] 的事,收集与判断
//! 分开,才能保证「灯只可能是算出来的」。
//!
//! 刀5(2026-08-22)迁完:判据不再读 `week_plan_file` / `release_file`(这两个
//! 模块已删)。`has_week_goal` 读 ops① 评论里解析出的版本目标一句话;
//! `ops1_open` 只说明这张活还开着;`has_metric_reading` 和 `any_metric_red` 改读
//! 仓 `.bw/metrics/readings.jsonl`;`released` 改读 git 标签日期。

use super::{App, Result};
use crate::derive::{derive_project_health, DerivedHealth, HealthInputs};
use crate::isoweek;
use crate::model::{Issue, Project, ProjectId};
use crate::repo::metrics_file;
use crate::repo::readings_file;
use std::path::Path;

pub use readings_file::{read_metric_readings, MetricReading};

/// 从 issue 列表 + 仓现场取四条判据的输入。git 读不到(不是仓、没提交)一律当
/// 「没有」,不报错——没数据本来就是合法状态,结果是灰灯而不是崩溃。
pub async fn collect_health_inputs(
    _project: &Project,
    workspace: &Path,
    week: &str,
    issues: &[Issue],
    week_goal: Option<&str>,
) -> HealthInputs {
    let last_week = isoweek::previous_week(week).unwrap_or_default();

    // (a) 运作活①开着 ≠ 版本目标已定。目标正文从 ops① 评论解析,没读到就不打勾。
    // 认本周那张:未完成,或创建时间落在本 ISO 周。
    let ops1_open = issues.iter().any(|i| {
        crate::app::is_ops1_issue(i)
            && i.status != crate::model::IssueStatus::Done
            && i.status != crate::model::IssueStatus::Cancelled
            && (crate::isoweek::unix_in_week(i.created_at, week) || i.plan_version.is_empty())
    });
    let has_week_goal = week_goal.is_some_and(|s| !s.trim().is_empty());

    // 「这个仓 git 读得动吗」单独问一次:读不动的时候「零提交」说明不了任何
    // 事,不能拿去判红(新接入的项目第一眼看到红灯,是在编)。
    let is_git = crate::git::is_repo(workspace).await;
    // 本周 + 上周的计数**一趟遍历出齐**。
    let mut wanted = vec![week.to_string()];
    if !last_week.is_empty() {
        wanted.push(last_week.clone());
    }
    let counts_result = crate::git::week_counts_many(workspace, &wanted).await;
    // 读数失败(磁盘 IO 等罕见情况)时 `git_readable` 也要落下 —— 否则 counts 空
    // → committed 全 false + git_readable=true → 推导判 stalled=红,而其实是
    // 「读不出来」,该是灰(铁律②:没数据不是红)。
    let git_readable = is_git && counts_result.is_ok();
    let counts = counts_result.unwrap_or_default();
    let committed_this_week = counts.get(week).is_some_and(|c| c.commits > 0);
    let committed_last_week = counts.get(&last_week).is_some_and(|c| c.commits > 0);
    let merged_last_week = counts.get(&last_week).is_some_and(|c| c.merges > 0);

    // (b) has_metric_reading + red_metrics:读仓 `.bw/metrics/readings.jsonl`。
    let readings = read_metric_readings(workspace, week);
    let last_readings = if last_week.is_empty() {
        Vec::new()
    } else {
        read_metric_readings(workspace, &last_week)
    };
    let has_metric_reading = !readings.is_empty() || !last_readings.is_empty();
    let red_metrics = breached_metrics(workspace, &readings);

    // (c) delivered_last_week:上周有合入 或 上周有发版(git 标签日期)。
    let released = git_tag_in_week(workspace, &last_week).await;

    HealthInputs {
        has_week_goal,
        ops1_open,
        committed_this_week,
        committed_last_week,
        git_readable,
        has_metric_reading,
        red_metrics,
        delivered_last_week: merged_last_week || released,
    }
}

/// 拿本周读数对每条**设了目标**的指标判一次越线,越线的一条一句人话
/// (「名」现值 X,目标 Y)——红灯的理由行要能第一眼说清是哪条,不给一个
/// 孤零零的颜色。判读全在 [`crate::derive::target::breach`] 那个纯函数里:
/// 目标未设、格式认不出、读数解析不出,都是「判不了」——不参与,绝不当成
/// 越线(此前的实现解析失败时会拿 ±INFINITY 顶上,`≥ 5` 带个空格就误红)。
fn breached_metrics(workspace: &Path, readings: &[MetricReading]) -> Vec<String> {
    if readings.is_empty() {
        return Vec::new();
    }
    let Ok(Some(metrics)) = metrics_file::read(workspace) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for def in metrics.all() {
        let Some(r) = readings.iter().find(|r| r.name.trim() == def.name.trim()) else {
            continue;
        };
        if crate::derive::target::breach(&def.target, &r.value) == Some(true) {
            out.push(format!(
                "「{}」现值 {},目标 {}",
                def.name,
                r.value.trim(),
                def.target.trim()
            ));
        }
    }
    out
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
        let goals = self.week_goals_from_ops1(&project, &issues).await;
        let inputs = collect_health_inputs(
            &project,
            &ws,
            &week,
            &issues,
            goals.get(&week).map(String::as_str),
        )
        .await;
        let health = derive_project_health(&inputs);
        self.cache_project_health(project_id, &health).await?;
        Ok(health)
    }
}
