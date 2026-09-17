use super::{App, Result};
use crate::derive::{derive_project_health, DerivedHealth, HealthInputs};
use crate::isoweek;
use crate::model::{Issue, Project, ProjectId};
use crate::repo::metrics_file;
use crate::repo::readings_file;
use std::path::Path;

pub use readings_file::{read_metric_readings, MetricReading};

pub async fn collect_health_inputs(
    _project: &Project,
    workspace: &Path,
    week: &str,
    issues: &[Issue],
    week_goal: Option<&str>,
) -> HealthInputs {
    let last_week = isoweek::previous_week(week).unwrap_or_default();

    let ops1_open = issues.iter().any(|i| {
        crate::app::is_ops1_issue(i)
            && i.status != crate::model::IssueStatus::Done
            && i.status != crate::model::IssueStatus::Cancelled
            && (crate::isoweek::unix_in_week(i.created_at, week) || i.plan_versions.is_empty())
    });
    let has_week_goal = week_goal.is_some_and(|s| !s.trim().is_empty());

    // 读取 Git 失败不等于零提交，不能据此判定项目停滞。
    let is_git = crate::git::is_repo(workspace).await;
    let mut wanted = vec![week.to_string()];
    if !last_week.is_empty() {
        wanted.push(last_week.clone());
    }
    let counts_result = crate::git::week_counts_many(workspace, &wanted).await;
    // 计数失败时标记不可读，避免将空结果判成连续两周零提交。
    let git_readable = is_git && counts_result.is_ok();
    let counts = counts_result.unwrap_or_default();
    let committed_this_week = counts.get(week).is_some_and(|c| c.commits > 0);
    let committed_last_week = counts.get(&last_week).is_some_and(|c| c.commits > 0);
    let merged_last_week = counts.get(&last_week).is_some_and(|c| c.merges > 0);

    let readings = read_metric_readings(workspace, week);
    let last_readings = if last_week.is_empty() {
        Vec::new()
    } else {
        read_metric_readings(workspace, &last_week)
    };
    let has_metric_reading = !readings.is_empty() || !last_readings.is_empty();
    let red_metrics = breached_metrics(workspace, &readings);

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

/// 目标或读数无法解析时不判为超出目标。
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

async fn git_tag_in_week(workspace: &Path, week: &str) -> bool {
    if week.is_empty() {
        return false;
    }
    crate::git::tags_with_dates(workspace)
        .await
        .iter()
        .any(|(_tag, date)| week_of_date(date).as_deref() == Some(week))
}

fn week_of_date(s: &str) -> Option<String> {
    let d = time::Date::parse(
        s.trim(),
        &time::format_description::well_known::Iso8601::DATE,
    )
    .ok()?;
    Some(isoweek::iso_week_of(d))
}

impl App {
    pub async fn recompute_health(&self, project_id: ProjectId) -> Result<DerivedHealth> {
        let project = self.project_of(project_id).await?;
        let ws = self.workspace_of(project_id).await?;
        let week = isoweek::current_week();
        let issues = self.issues(project_id).await?;
        let notes = self.version_plan_notes(&project).await;
        let mut released = issues
            .iter()
            .filter(|i| !i.version.is_empty())
            .map(|i| i.version.clone())
            .collect::<Vec<_>>();
        if let Ok(remote) = self.remote_for(&project) {
            if let Ok(tags) = remote.list_releases().await {
                released.extend(tags);
            }
        }
        let version = crate::app::current_week_version(&issues, &released);
        let inputs = collect_health_inputs(
            &project,
            &ws,
            &week,
            &issues,
            notes.goal_for(&version, &week),
        )
        .await;
        let health = derive_project_health(&inputs);
        self.cache_project_health(project_id, &health).await?;
        Ok(health)
    }
}
