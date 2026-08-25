//! 健康三判据的现算:从仓文件与 git 现场取输入,交给密封的推导函数。
//!
//! 这一层只负责**收集输入**——判什么颜色是 [`crate::derive`] 的事,收集与判断
//! 分开,才能保证「灯只可能是算出来的」。

use super::{App, Result};
use crate::derive::{derive_project_health, DerivedHealth, HealthInputs};
use crate::isoweek;
use crate::model::ProjectId;
use crate::repo::week_plan_file;
use std::path::Path;

/// 从一个仓现场取三条判据的输入。git 读不到(不是仓、没提交)一律当「没有」,
/// 不报错——没数据本来就是合法状态,结果是灰灯而不是崩溃。
pub async fn collect_health_inputs(workspace: &Path, week: &str) -> HealthInputs {
    let last_week = isoweek::previous_week(week).unwrap_or_default();

    let this_plan = week_plan_file::read(workspace, week).ok().flatten();
    let last_plan = if last_week.is_empty() {
        None
    } else {
        week_plan_file::read(workspace, &last_week).ok().flatten()
    };

    // 「这个仓 git 读得动吗」单独问一次:读不动的时候「零提交」说明不了任何
    // 事,不能拿去判红(新接入的项目第一眼看到红灯,是在编)。
    let git_readable = crate::git::is_repo(workspace).await;
    // 本周 + 上周的计数**一趟遍历出齐**。这一段在每次重拼界面数据的路上,
    // 第一版逐周各查一遍(每查还带一次没人用的 numstat),10 个 git 子进程
    // 把内核单线程按住约 2 秒 —— 评审抓的,现在是 1 个子进程约 25 毫秒。
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
    // 上周发过版也算交付。发版记录的正本是仓文件,不查库。
    let released = crate::repo::release_file::read(workspace)
        .ok()
        .flatten()
        .is_some_and(|rows| {
            rows.iter()
                .any(|r| week_of_date(&r.released_at).as_deref() == Some(last_week.as_str()))
        });

    // 「指标见红」的读数来源是**周计划快照**(本周的,本周没有就上周的)——
    // 健康是现算的,不起脚本、不碰网络;快照是运作活①抄进仓的文件,目标定义
    // 也在仓里,两台机器对同一个仓算出同一个结果。指标文件解析失败按「没有」
    // 对待:那种情况总览的指标区已经整体灰 + 原话了,健康这边判不了就不参与,
    // 不拿坏文件凑一个颜色。
    let metrics = crate::repo::metrics_file::read(workspace).ok().flatten();
    let snapshot = this_plan
        .as_ref()
        .filter(|p| p.has_reading())
        .or(last_plan.as_ref().filter(|p| p.has_reading()));
    let red_metrics = match (&metrics, snapshot) {
        (Some(file), Some(plan)) => breached_metrics(file, &plan.readings),
        _ => Vec::new(),
    };

    HealthInputs {
        has_week_goal: this_plan.as_ref().is_some_and(|p| p.has_goal()),
        committed_this_week,
        committed_last_week,
        git_readable,
        has_metric_reading: this_plan.as_ref().is_some_and(|p| p.has_reading())
            || last_plan.as_ref().is_some_and(|p| p.has_reading()),
        red_metrics,
        delivered_last_week: merged_last_week || released,
    }
}

/// 拿快照里的读数对每条**设了目标**的指标判一次越线。判读全在
/// [`crate::derive::target::breach`] 那个纯函数里:目标未设、格式认不出、快照
/// 里没有这条的读数,都是「判不了」——不参与,绝不当成越线。
fn breached_metrics(
    file: &crate::repo::metrics_file::MetricsFile,
    readings: &[crate::repo::week_plan_file::MetricReading],
) -> Vec<String> {
    let mut out = Vec::new();
    for def in file.all() {
        if def.target.trim().is_empty() {
            continue;
        }
        let Some(reading) = readings.iter().find(|r| r.name.trim() == def.name.trim()) else {
            continue;
        };
        if crate::derive::target::breach(&def.target, &reading.value) == Some(true) {
            out.push(format!(
                "「{}」现值 {},目标 {}",
                def.name,
                reading.value.trim(),
                def.target.trim()
            ));
        }
    }
    out
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
    /// 现算一次健康,并把结果写回项目墙的显示缓存。
    ///
    /// 总览屏自己从不读那两个缓存列当输入——它每次都调这个函数重算。缓存只
    /// 服务「不打开任何项目也要看见灯」的项目墙。
    pub async fn recompute_health(&self, project_id: ProjectId) -> Result<DerivedHealth> {
        let ws = self.workspace_of(project_id).await?;
        let week = isoweek::current_week();
        let inputs = collect_health_inputs(&ws, &week).await;
        let health = derive_project_health(&inputs);
        self.store.cache_project_health(project_id, &health).await?;
        Ok(health)
    }
}
