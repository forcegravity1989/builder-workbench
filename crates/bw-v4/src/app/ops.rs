//! 运作活:buddy 自己发起的三张标准动作。
//!
//! 三张活的 `workflow` 字段取值是它们的身份证——定时判据、注入哪份剧本、配置
//! 屏「用过几次」全靠它:
//!
//! | 活 | `kind` | `origin` | `workflow` |
//! |---|---|---|---|
//! | ①更新指标 + 制定本周计划 | `ops` | `human` | `更新指标与周计划` |
//! | ②资产盘点 | `ops` | `auto` | `资产盘点` |
//! | ③规范铺底 | `ops` | `auto` | `规范铺底`([`super::bootstrap`] 那边建) |
//!
//! **没有定时任务表**。「这周该不该建②」这个问题的答案不存在任何一张状态表
//! 里,它是现查出来的:本周有没有一张标题以「资产盘点 」开头的活。这条查询
//! 本身就是幂等锁,也是补建逻辑——错过一次 tick(那会儿 buddy 没开着)下次
//! 启动的第一次 tick 天然成立,自动补上。

use super::{issue_store, App, AppError, Result};
use crate::command::Event;
use crate::isoweek;
use crate::model::{IssueId, IssueKind, IssueOrigin, IssueStatus, ProjectId};
use crate::repo::issue_policy_file;

/// 运作活①的 `workflow` 字段值,对应剧本 `week-planning`。两者的对应关系在
/// `standard/skills/README.md` 那张表里。
pub const OPS1_WORKFLOW: &str = "更新指标与周计划";
pub const OPS2_WORKFLOW: &str = "资产盘点";
pub const OPS3_WORKFLOW: &str = "规范铺底";

/// 剧本名。开工时按这个 slug 在 **buddy 自己的技能目录**里找到那份
/// `SKILL.md`,把**名字 + 一句话 + 路径**给 agent(正文它自己按需读,见
/// [`crate::standard::skills`])。
/// 运作活①这一周那张活的标题。**它同时是建活的幂等键和「本周开没开过工」
/// 的判据** —— 两者必须是同一个东西:按 `week_of` 查的话,人把这张卡从本周拖
/// 回待办池,判据就落空了,而建活按标题去重又拿回同一张活,于是「开始本周」
/// 会对一张已经在评审中的活重新开工,弹一句「不是能开工的状态」。定时那条路
/// 早踩过同一个坑(见 [`App::tick_scheduler`]),这里不重踩。
pub fn ops1_title(week: &str) -> String {
    format!("更新指标 + 制定本周计划 {week}")
}

pub fn skill_slug(workflow: &str) -> Option<&'static str> {
    match workflow {
        OPS1_WORKFLOW => Some("week-planning"),
        OPS2_WORKFLOW => Some("asset-audit"),
        // 规范铺底**没有 agent 步骤**(2026-08-20:只铺 `.bw/`,仓根一个字不写),
        // 所以它没有剧本可挂。给这个项目写开发手册的那份剧本已经挪进资产盘点,
        // 见 `standard/skills/project-handbook/`。
        _ => None,
    }
}

impl App {
    /// 建一张运作活。标题幂等(同一周重跑拿回同一张),建完立刻回 id。
    pub(super) async fn create_ops_issue(
        &mut self,
        project_id: ProjectId,
        title: String,
        body: String,
        workflow: &str,
        origin: IssueOrigin,
        week_of: String,
    ) -> Result<(IssueId, bool, Vec<Event>)> {
        let project = self.project_of(project_id).await?;
        // 建活是按标题幂等的。调用方**必须知道这一张是不是新建的** —— 定时那
        // 条路会在建完之后立刻开工,拿到一张老活还去开工,就会把上一次正跑着
        // 的会话掐掉重开。
        let created = issue_store::find_open_by_title(&project, &title)
            .await?
            .is_none();
        let events = self
            .create_issue(
                project_id,
                title,
                body,
                None,
                IssueKind::Ops,
                origin,
                week_of,
            )
            .await?;
        let id = events
            .iter()
            .find_map(|e| match e {
                Event::IssueCreated { id, .. } => Some(*id),
                _ => None,
            })
            .ok_or_else(|| AppError::Refused("运作活没建出来".into()))?;
        // workflow 从标题推断(issue_store),不需要再单独设。
        // 但如果推断出来的和预期不一样,记一句——不阻断流程。
        let issue = self.issue_or_err(id).await?;
        if issue.workflow != workflow {
            // 不会发生(标题前缀与 workflow 映射是固定的),但如实记着。
        }
        Ok((id, created, events))
    }

    /// 定时:到点就自己建运作活②并自己开工。
    ///
    /// 三张运作活里唯一不需要人点一下才开工的一张——所以它也是唯一一处
    /// buddy 自动**建**活的地方。**自动建不等于自动完成**:这张活和别的活
    /// 走同一条状态机,最远只到「评审中」。
    pub(super) async fn tick_scheduler(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let Some(policy) = issue_policy_file::read(&ws).ok().flatten() else {
            return Ok(vec![]);
        };
        let Some(cadence) = policy.cadence else {
            return Ok(vec![]);
        };
        let spec = cadence.ops2_schedule.trim().to_string();
        if spec.is_empty() || !isoweek::schedule_passed_this_week(&spec) {
            return Ok(vec![]);
        }

        let week = isoweek::current_week();
        let title = format!("资产盘点 {week}");
        let project = self.project_of(project_id).await?;
        // **判据必须和建活的幂等键是同一个东西**(都是标题)。
        if issue_store::find_open_by_title(&project, &title)
            .await?
            .is_some()
        {
            return Ok(vec![]);
        }

        let (id, created, mut events) = self
            .create_ops_issue(
                project_id,
                title,
                "mode: weekly\n\n盘点这一周仓内的全部资产,微重构只写建议不动手。".into(),
                OPS2_WORKFLOW,
                IssueOrigin::Auto,
                week.clone(),
            )
            .await?;
        if !created {
            return Ok(events);
        }
        events.push(Event::OpsAutoFired {
            id,
            workflow: OPS2_WORKFLOW.into(),
            week,
        });
        events.extend(self.run_issue(id).await?);
        Ok(events)
    }
}

impl App {
    /// 「合入并完成」:先真的把 MR 合了,再由 buddy 主动把 issue 关掉(= Done)。
    ///
    /// 顺序不能反。先推完成再合入的话,合入失败就留下一张「已完成」但改动还
    /// 挂在分支上的活 —— 账目和仓对不上。
    ///
    /// **合入失败就整条失败**,活留在「评审中」原地,人看得见原话、可以重试。
    /// 没挂远端或者这张活确实没有 MR,就只走「完成」那一步。
    ///
    /// 合入之后还会做两件本机收尾:把主检出快进到远端最新,把那条活分支收掉。
    /// 两件都是尽力而为,做不成不回滚这次合入,但下落写进事件的 `local_note`。
    pub(super) async fn merge_and_settle(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let project = self.project_of(issue.project_id).await?;

        // 已经完成的活直接短路。
        if issue.status == IssueStatus::Done {
            return Ok(vec![Event::IssueMerged {
                id,
                pr_number: issue.pr_number,
                merged: false,
                local_note: String::new(),
            }]);
        }
        if !issue.status.can_transition_to(IssueStatus::Done) {
            return Err(AppError::IllegalTransition {
                from: issue.status.label().to_string(),
                to: IssueStatus::Done.label().to_string(),
            });
        }

        let remote = if project.has_remote() {
            Some(
                v4_engine::remote::Remote::for_project(
                    &project.provider,
                    &project.remote_host,
                    &project.remote_path,
                )
                .map_err(|e| AppError::Exec(format!("认不出远端类型:{e}")))?,
            )
        } else {
            None
        };

        // 去远端问一次有没有开着的 MR(队友自己开的 buddy 可能没记过)。
        let mut pr_number = issue.pr_number;
        if pr_number == 0 && !issue.branch.is_empty() {
            if let Some(r) = &remote {
                if let Ok(Some(n)) = r.open_mr_for_branch(&issue.branch).await {
                    pr_number = n;
                }
            }
        }

        let merged = match (&remote, pr_number) {
            (Some(r), n) if n > 0 => {
                r.merge_mr(n)
                    .await
                    .map_err(|e| AppError::Exec(format!("合入 MR #{n} 没成:{e}")))?;
                true
            }
            _ => false,
        };

        // 合入之后的本机收尾。
        let mut notes: Vec<String> = Vec::new();
        let mut main_has_it = false;
        if merged {
            let (ok, note) = self.pull_main_after_merge(issue.project_id).await;
            main_has_it = ok;
            notes.push(note);
        }

        // 合入由人点;buddy 这一下把 issue 关掉 = Done。不指望 MR 描述里的
        // `Closes #N` 那条魔法(codehub 不一定认)——合没合 MR 都由 buddy 主动关。
        issue_store::set_status(&project, id.iid(), IssueStatus::Done).await?;
        // 收掉 worktree(结清=Done 之后)。
        if merged && main_has_it {
            notes.push(self.drop_issue_branch(&issue).await);
        } else if merged {
            notes.push(format!(
                "本机分支 {} 先留着:主检出没拉动,它是本机唯一还够得着这次合入的地方",
                v4_engine::github::issue_branch(issue.number)
            ));
        }

        let mut events = vec![Event::IssueMerged {
            id,
            pr_number,
            merged,
            local_note: notes.join("；"),
        }];
        events.push(Event::IssueTransitioned {
            id,
            to: IssueStatus::Done,
            settled: true,
        });
        if let Some(e) = self.chat_notify_issue(id, "merged").await {
            events.push(e);
        }
        Ok(events)
    }

    async fn pull_main_after_merge(&self, project_id: ProjectId) -> (bool, String) {
        let Ok(ws) = self.workspace_of(project_id).await else {
            return (false, "主检出没拉:算不出这个项目的工作区路径".into());
        };
        match crate::git::pull_ff(&ws).await {
            Ok(true) => (true, "主检出已拉到最新".into()),
            Ok(false) => (true, "主检出本来就是最新的".into()),
            Err(e) => (
                false,
                format!(
                    "主检出没拉动(合入与结清本身已经生效,可以自己去仓里 git pull):{}",
                    one_line(&e.to_string())
                ),
            ),
        }
    }

    async fn drop_issue_branch(&self, issue: &crate::model::Issue) -> String {
        let branch = v4_engine::github::issue_branch(issue.number);
        if issue.branch != branch {
            return "没有单独的活分支要收(这张活的改动不在 bw/issue- 分支上)".into();
        }
        let Ok(ws) = self.workspace_of(issue.project_id).await else {
            return format!("本机分支 {branch} 没收:算不出这个项目的工作区路径");
        };
        if !crate::git::branch_exists(&ws, &branch).await {
            return format!("本机已经没有 {branch} 这条分支了");
        }
        match crate::git::delete_merged_branch(&ws, &branch).await {
            Ok(()) => format!("本机分支 {branch} 已收掉"),
            Err(e) => format!(
                "本机分支 {branch} 没收掉(不影响合入与结清):{}",
                one_line(&e.to_string())
            ),
        }
    }
}

/// 把 git 的多行原话压成一行。**压行不是删字** —— 一个字都不省,只是让它能塞
/// 进界面上那一条回执。
pub(super) fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
