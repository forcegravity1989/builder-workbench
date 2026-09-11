use crate::isoweek;
use crate::model::Project;
use std::path::Path;

/// None 表示缺数据，图表不得补零。
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WeekPoint {
    /// ISO 周或日历日标签。
    pub week: String,
    pub commits: Option<u32>,
    /// 远端已合入 PR/MR 数，无法查询时为 None。
    pub merged_prs: Option<u32>,
    /// 时间窗结束时仍开放的 issue 存量，不是该窗口内新增数量。
    pub open_issues: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Trend {
    /// 旧的在前,最后一个是本周。
    pub points: Vec<WeekPoint>,
    pub git_note: String,
    pub remote_note: String,
}

/// 按时间窗返回历史统计；失败保留原因，对应读数为 None。
pub async fn recent_weeks(ws: &Path, project: &Project, weeks: u32) -> Trend {
    let remote = bw_engine::remote::Remote::for_project(
        &project.provider,
        &project.remote_host,
        &project.remote_path,
    )
    .ok();
    let mut list = week_labels(weeks);
    list.reverse();
    recent_inner(ws, remote, project.has_remote(), list).await
}

pub async fn recent_days(ws: &Path, project: &Project, days: u32) -> Trend {
    let remote = bw_engine::remote::Remote::for_project(
        &project.provider,
        &project.remote_host,
        &project.remote_path,
    )
    .ok();
    recent_inner(ws, remote, project.has_remote(), isoweek::recent_days(days)).await
}

pub async fn recent_weeks_git_only(ws: &Path, weeks: u32) -> Trend {
    let mut list = week_labels(weeks);
    list.reverse();
    recent_inner(ws, None, false, list).await
}

pub async fn recent_days_git_only(ws: &Path, days: u32) -> Trend {
    recent_inner(ws, None, false, isoweek::recent_days(days)).await
}

async fn recent_inner(
    ws: &Path,
    remote: Option<bw_engine::remote::Remote>,
    has_remote: bool,
    list: Vec<String>,
) -> Trend {
    let mut trend = Trend::default();
    let counts = match crate::git::stamp_counts_many(ws, &list).await {
        Ok(m) => Some(m),
        Err(e) => {
            trend.git_note = format!("本机提交数没读成:{e}");
            None
        }
    };

    if remote.is_none() && has_remote {
        trend.remote_note =
            "这个项目的远端 provider Workbench 不认识,合入的 PR 与未处理 issue 走势没查 —— 只画提交那一条".into();
    }

    let (merged, open_issues) = match &remote {
        None => (None, None),
        Some(r) => {
            let (a, b) = tokio::join!(merged_mrs_by_week(r, &list), open_issues_by_week(r, &list));
            (
                note_or(&mut trend.remote_note, a),
                note_or(&mut trend.remote_note, b),
            )
        }
    };

    for (i, week) in list.iter().enumerate() {
        let c = counts.as_ref().and_then(|m| m.get(week));
        trend.points.push(WeekPoint {
            week: week.clone(),
            commits: c.map(|c| c.commits),
            merged_prs: merged.as_ref().and_then(|v| v.get(i).copied()),
            open_issues: open_issues.as_ref().and_then(|v| v.get(i).copied()),
        });
    }
    trend
}

fn note_or<T>(note: &mut String, r: Result<T, String>) -> Option<T> {
    match r {
        Ok(v) => Some(v),
        Err(e) => {
            if note.is_empty() {
                *note = e;
            }
            None
        }
    }
}

/// 时间窗按本机时区计算，左闭右开，与 Git 计数一致。
fn window_of(label: &str) -> Result<(i64, i64), String> {
    if isoweek::is_week(label) {
        crate::git::week_window(label).map_err(|e| e.to_string())
    } else {
        crate::git::day_window(label).map_err(|e| e.to_string())
    }
}

async fn merged_mrs_by_week(
    remote: &bw_engine::remote::Remote,
    weeks: &[String],
) -> Result<Vec<u32>, String> {
    let got = remote
        .merged_mr_times()
        .await
        .map_err(|e| format!("远端合入的 PR 没查成:{e}"))?;
    // 达到 CLI 数量上限时可能截断，不能将不完整计数作为真实结果。
    if got.truncated {
        return Err("这个仓的已合并 PR 一趟拉不全 —— 这条线不画,免得给你一个少算的数".into());
    }
    let stamps: Vec<i64> = got.rows.iter().filter_map(|s| epoch_of(s)).collect();
    let mut out = Vec::with_capacity(weeks.len());
    for w in weeks {
        let (s, u) = window_of(w)?;
        out.push(stamps.iter().filter(|t| (s..u).contains(t)).count() as u32);
    }
    Ok(out)
}

/// 窗口结束前已创建且尚未关闭的 issue 数量。
async fn open_issues_by_week(
    remote: &bw_engine::remote::Remote,
    weeks: &[String],
) -> Result<Vec<u32>, String> {
    let got = remote
        .issue_times()
        .await
        .map_err(|e| format!("远端未处理 issue 数没查成:{e}"))?;
    if got.truncated {
        return Err("这个仓的 issue 一趟拉不全 —— 这条线不画,免得给你一个少算的数".into());
    }
    let born: Vec<i64> = got.rows.iter().filter_map(|(c, _)| epoch_of(c)).collect();
    let closed: Vec<i64> = got
        .rows
        .iter()
        .filter_map(|(_, k)| epoch_of(k.as_deref()?))
        .collect();
    let mut out = Vec::with_capacity(weeks.len());
    for w in weeks {
        // 周末那一刻 = 下周一 00:00 的前一瞬,用左闭右开的右边界即可。
        let (_, end) = window_of(w)?;
        let opened = born.iter().filter(|t| **t < end).count();
        let shut = closed.iter().filter(|t| **t < end).count();
        out.push(opened.saturating_sub(shut) as u32);
    }
    Ok(out)
}

fn epoch_of(s: &str) -> Option<i64> {
    time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
        .ok()
        .map(|t| t.unix_timestamp())
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
    out
}
