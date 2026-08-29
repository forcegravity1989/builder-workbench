//! 总览与通知那几块的现算派生 —— 周进度、运作活、名片改动、仓统计、事件流。
//!
//! 从 `vm_panels.rs` 拆出来的:那个文件已经过 600 行的软目标了
//! (`scripts/guard-file-lines.sh` 会提醒)。这里放的都是「库和仓里没有这张
//! 表,每次现算出来」的东西。

use crate::vm::*;
use bw::model::IssueStatus;
use std::path::Path;

/// 某一周的五段计数。`week` 传 `None` = 不按周过滤(计划屏的「全部活」视图)。
///
/// **直接数活,不数看板列**:看板的范围跟着计划屏左栏走,总览那块「本周计划
/// 进度」要的是本周,两者不能共用一份数——共用的后果是人在计划屏点了历史周,
/// 总览的「本周」标题下摆着那一周的数。
///
/// 待办池不算进去,它按定义就是「没排进任何一周」;**阻塞单独一段**,不能像
/// 早先那样整列漏掉——红的那张活正是最该被看见的。
pub(super) fn build_week_counts(issues: &[bw::Issue], week: Option<&str>) -> WeekCountsVm {
    let in_scope = |i: &&bw::Issue| match week {
        None => true,
        Some(w) => i.week_of == w,
    };
    let n = |st: IssueStatus| {
        issues
            .iter()
            .filter(in_scope)
            .filter(|i| i.status == st)
            .count()
    };
    WeekCountsVm {
        todo: n(IssueStatus::Todo),
        doing: n(IssueStatus::InProgress),
        review: n(IssueStatus::InReview),
        done: n(IssueStatus::Done),
        blocked: n(IssueStatus::Blocked),
    }
}

/// 运作活①②③三个状态点。开着的优先;本周已关的①②写「已完成」。
/// ③关过但默认分支没有 `.bw/standard.toml` 仍算未建(旧铺底关掉、MR 没合
/// 不能冒充铺过)。
///
/// `ops3_landed` 从外部传:它只跟仓走、不跟周走,在 `gather` 里采一次,
/// 不再每重切都跑一遍 `git::path_in_head`(原来一次重拼跑两遍)。
pub(super) fn build_ops(
    issues: &[bw::Issue],
    current_week: &str,
    ops3_landed: bool,
) -> Vec<OpsChipVm> {
    use bw::app::{OPS1_WORKFLOW, OPS2_WORKFLOW, OPS3_WORKFLOW};
    let pick = |wf: &str, done: bool| {
        issues
            .iter()
            .filter(|i| i.kind == bw::model::IssueKind::Ops && i.workflow == wf)
            .filter(|i| {
                // ①②认本周:标签优先,标题里的周号兜底(关卡时标签偶发掉了,
                // 计划屏仍能从标题读出周目标,这里不能因此退回「未建」)。
                wf == OPS3_WORKFLOW
                    || i.week_of == current_week
                    || i.title.ends_with(&format!(" {current_week}"))
            })
            .filter(|i| done == (i.status == IssueStatus::Done))
            .max_by_key(|i| i.number)
    };
    let chip = |label: &str, wf: &str, when: &str| {
        let (status, note) = ops_chip_display(
            pick(wf, false),
            pick(wf, true),
            wf == OPS3_WORKFLOW,
            ops3_landed,
            when,
        );
        OpsChipVm {
            title: label.to_string(),
            status,
            note,
        }
    };
    vec![
        chip(
            "运作活① 更新指标与周计划",
            OPS1_WORKFLOW,
            "点总览的「开始本周」触发",
        ),
        chip(
            "运作活② 资产盘点",
            OPS2_WORKFLOW,
            "到点自动建(节律配在 .bw/issue-policy.toml)",
        ),
        chip("运作活③ 规范铺底", OPS3_WORKFLOW, "接入项目时铺"),
    ]
}

/// 开着的活 → 它的状态;本周已关的①② → 已完成;③看件在不在 HEAD;再否则未建。
fn ops_chip_display(
    open: Option<&bw::Issue>,
    done: Option<&bw::Issue>,
    is_ops3: bool,
    ops3_landed: bool,
    idle_note: &str,
) -> (String, String) {
    if let Some(i) = open {
        return (
            i.status.label().to_string(),
            format!("#{} {}", i.number, i.title),
        );
    }
    if let Some(i) = done.filter(|_| !is_ops3) {
        return ("已完成".into(), format!("#{} {}", i.number, i.title));
    }
    if is_ops3 && ops3_landed {
        return ("已完成".into(), "件已在默认分支".into());
    }
    ("未建".into(), idle_note.to_string())
}

/// 名片改动那张在途的轻量活。名片是仓文件,改它走分支 + MR,所以总览要能
/// 看见「改了、还没合」。只认最新的一张。
pub(super) fn build_card_mr(issues: &[bw::Issue]) -> Option<CardMrVm> {
    let i = issues
        .iter()
        .filter(|i| i.title.starts_with("编辑项目名片"))
        .filter(|i| {
            matches!(
                i.status,
                IssueStatus::InReview
                    | IssueStatus::InProgress
                    | IssueStatus::Todo
                    | IssueStatus::Backlog
            )
        })
        .max_by_key(|i| i.number)?;
    Some(CardMrVm {
        issue_id: Some(i.id),
        number: i.number,
        status: i.status.label().to_string(),
        pr_number: i.pr_number,
        mergeable: i.status == IssueStatus::InReview,
        has_open_mr: i.has_open_mr,
    })
}

/// 代码仓级指标。**每一项都注明从哪采的**;采不到就整块给出原话,不填 0。
///
/// 高保真那张网格上还有几项是远端来的(合入的 PR、远端 issue、开放 PR),
/// 那要走 GitHub / codehub 的接口,今天还没接 —— 与其编几个数,不如只列采得
/// 到的,并在界面上说清楚少了哪几项。
pub(super) async fn collect_repo_stats(
    ws: &Path,
    project: Option<&bw::model::Project>,
) -> RepoStatsVm {
    let e = match bw_engine::evidence::collect(&ws.display().to_string()).await {
        Ok(e) => e,
        Err(err) => {
            return RepoStatsVm {
                error: format!("读不到仓统计:{err}"),
                ..RepoStatsVm::default()
            }
        }
    };
    let mut items = vec![
        (e.commit_count.to_string(), "累计提交".into(), "git".into()),
        (
            e.tracked_files.to_string(),
            "跟踪的文件".into(),
            "git".into(),
        ),
        (
            e.dirty_paths.to_string(),
            "没提交的改动".into(),
            "git".into(),
        ),
        (
            e.docs_files.to_string(),
            "docs/ 下的 .md".into(),
            "git".into(),
        ),
    ];
    if let Some(d) = bw::git::first_commit_date(ws).await {
        items.push((d, "首次提交".into(), "git".into()));
    }
    if let Ok(tags) = bw::git::tags(ws).await {
        items.push((tags.len().to_string(), "打过的标签".into(), "git".into()));
    }
    // 近四周走势。**现算** —— git 那两条一趟遍历出齐,远端那条各周并发。
    // 项目行读不出来时只算 git 那两条,远端如实留空,不整块不采。
    let trend = match project {
        Some(p) => bw::trend::recent_weeks(ws, p, 4).await,
        None => {
            let mut t = bw::trend::recent_weeks_git_only(ws, 4).await;
            t.remote_note = "这个项目的库内记录读不出来,远端那条线这次没采".into();
            t
        }
    };
    RepoStatsVm {
        items,
        trend: trend
            .points
            .iter()
            .map(|p| crate::vm::TrendPointVm {
                week: p.week.clone(),
                commits: p.commits,
                merged_prs: p.merged_prs,
                open_issues: p.open_issues,
            })
            .collect(),
        git_note: trend.git_note,
        trend_note: trend.remote_note,
        error: String::new(),
    }
}

#[cfg(test)]
mod ops_chip_display_tests {
    use super::ops_chip_display;

    #[test]
    fn closed_leftover_is_not_done() {
        let (st, note) = ops_chip_display(None, None, true, false, "接入项目时铺");
        assert_eq!(st, "未建");
        assert_eq!(note, "接入项目时铺");
    }

    #[test]
    fn ops3_landed_on_head() {
        let (st, note) = ops_chip_display(None, None, true, true, "接入项目时铺");
        assert_eq!(st, "已完成");
        assert_eq!(note, "件已在默认分支");
    }

    #[test]
    fn ops1_closed_this_week_is_done() {
        let done = dummy_ops("#8 更新指标 + 制定本周计划");
        let (st, note) =
            ops_chip_display(None, Some(&done), false, false, "点总览的「开始本周」触发");
        assert_eq!(st, "已完成");
        assert_eq!(note, format!("#{} {}", done.number, done.title));
    }

    fn dummy_ops(title: &str) -> bw::Issue {
        bw::Issue {
            id: bw::model::IssueId::from_remote(bw::model::ProjectId::nil(), 8),
            project_id: bw::model::ProjectId::nil(),
            number: 8,
            remote_number: 8,
            title: title.to_string(),
            body: String::new(),
            status: bw::model::IssueStatus::Done,
            branch: String::new(),
            pr_number: 0,
            has_open_mr: false,
            week_of: "2026-W35".into(),
            version: String::new(),
            tool: String::new(),
            kind: bw::model::IssueKind::Ops,
            origin: bw::model::IssueOrigin::Human,
            workflow: bw::app::OPS1_WORKFLOW.into(),
            category: None,
            sort_order: 8.0,
            metric_key: String::new(),
            created_at: 0,
            updated_at: 0,
            settled_at: None,
            assignee: String::new(),
            author: String::new(),
            plan_version: String::new(),
        }
    }
}
