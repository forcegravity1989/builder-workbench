//! 运作活:Workbench 自己发起的三张标准动作。
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
//! 本身就是幂等锁,也是补建逻辑——错过一次 tick(那会儿 Workbench 没开着)下次
//! 启动的第一次 tick 天然成立,自动补上。

use super::{issue_store, App, AppError, ProgressLine, Result};
use crate::command::Event;
use crate::isoweek;
use crate::local::ProjectRegistry;
use crate::model::{IssueId, IssueKind, IssueOrigin, IssueStatus, ProjectId};
use crate::repo::issue_policy_file;

/// 运作活①的 `workflow` 字段值,对应剧本 `week-planning`。两者的对应关系在
/// `standard/skills/README.md` 那张表里。
pub const OPS1_WORKFLOW: &str = "更新指标与周计划";
pub const OPS2_WORKFLOW: &str = "资产盘点";
pub const OPS3_WORKFLOW: &str = "规范铺底";

/// 剧本名。开工时按这个 slug 在 **Workbench 自己的技能目录**里找到那份
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

pub fn ops2_title(week: &str) -> String {
    format!("资产盘点 {week}")
}

/// 剧本目录名 → 活上挂的 workflow 人话名。配置表「名称」用这个,slug 另写一行。
pub fn workflow_label(slug: &str) -> Option<&'static str> {
    match slug {
        "week-planning" => Some(OPS1_WORKFLOW),
        "asset-audit" => Some(OPS2_WORKFLOW),
        "mattpocock-skills" => Some("mattpocock-skills"),
        _ => None,
    }
}

pub fn skill_slug(workflow: &str) -> Option<&'static str> {
    match workflow {
        OPS1_WORKFLOW => Some("week-planning"),
        OPS2_WORKFLOW => Some("asset-audit"),
        // build 阶段默认 workflow 入口(mattpocock grill→implement→review SOP)。
        // proto-design(原型)源还没 vendor,待补。
        "mattpocock-skills" => Some("mattpocock-skills"),
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
        let created = issue_store::find_open_by_title(self, &project, &title)
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
                String::new(),
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
    /// Workbench 自动**建**活的地方。**自动建不等于自动完成**:这张活和别的活
    /// 走同一条状态机,最远只到「评审中」。
    pub(super) async fn tick_scheduler(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        // 高优1:读本机设置,这个项目关了定时就不建活(缺省 true)。开关在
        // `projects.toml` 的 `cron_enabled` 字段,配置屏能改;false 就直接返空。
        let cron_on = ProjectRegistry::find_by_id(&self.asset_root, project_id)
            .ok()
            .flatten()
            .map(|e| e.cron_enabled)
            .unwrap_or(true);
        if !cron_on {
            return Ok(vec![]);
        }
        let mut events = self.maybe_auto_collect_b(project_id).await;

        let Ok(ws) = self.workspace_of(project_id).await else {
            return Ok(events);
        };
        let Some(policy) = issue_policy_file::read(&ws).ok().flatten() else {
            return Ok(events);
        };
        let Some(cadence) = policy.cadence else {
            return Ok(events);
        };
        let spec = cadence.ops2_schedule.trim().to_string();
        if spec.is_empty() || !isoweek::schedule_passed_this_week(&spec) {
            return Ok(events);
        }

        let week = isoweek::current_week();
        let title = format!("资产盘点 {week}");
        let project = self.project_of(project_id).await?;
        // **判据必须和建活的幂等键是同一个东西**(都是标题)。
        if issue_store::find_open_by_title(self, &project, &title)
            .await?
            .is_some()
        {
            return Ok(events);
        }

        let (id, created, mut ops_events) = self
            .create_ops_issue(
                project_id,
                title,
                "mode: weekly\n\n盘点这一周仓内的全部资产,微重构只写建议不动手。".into(),
                OPS2_WORKFLOW,
                IssueOrigin::Auto,
                week.clone(),
            )
            .await?;
        events.append(&mut ops_events);
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
    /// 「合入并完成」:先真的把 MR 合了,再由 Workbench 主动把 issue 关掉(= Done)。
    ///
    /// 顺序不能反。先推完成再合入的话,合入失败就留下一张「已完成」但改动还
    /// 挂在分支上的活 —— 账目和仓对不上。
    ///
    /// **合入失败就整条失败**,活留在「评审中」原地,人看得见原话、可以重试。
    /// 没挂远端的本地项目确实没有 MR 可合 —— 那种只走「完成」那一步,合理。
    /// **挂了远端但查不到这张活的 MR** —— 不关 issue,报错「没找到这活的 MR,
    /// 活留评审中」(MR 正本在远端,现查,不靠 lossy 的 `issue.branch`/`pr_number`,
    /// 那俩在 `issue_from_remote` 里恒空,旧逻辑因此永远 `merged=false` 却照常
    /// `set_status(Done)`,活关了显示完成、MR 没合、主检出没拉、worktree 没清)。
    ///
    /// 合入之后还会做两件本机收尾:把主检出快进到远端最新,把 worktree + 分支收掉。
    /// 两件都是尽力而为,做不成不回滚这次合入,但下落写进事件的 `local_note`。
    pub(super) async fn merge_and_settle(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let project = self.project_of(issue.project_id).await?;

        self.step(ProgressLine::doing(1, "合入:查这张活的 MR…"));

        // 已经完成的活直接短路。
        if issue.status == IssueStatus::Done {
            self.step(ProgressLine::ok(3, "合入:这张活已经完成"));
            return Ok(vec![Event::IssueMerged {
                id,
                pr_number: 0,
                merged: false,
                local_note: String::new(),
            }]);
        }
        if !issue.status.can_transition_to(IssueStatus::Done) {
            self.step(ProgressLine::fail(
                1,
                format!("合入:不能从「{}」直接完成", issue.status.label()),
            ));
            return Err(AppError::IllegalTransition {
                from: issue.status.label().to_string(),
                to: IssueStatus::Done.label().to_string(),
            });
        }

        // 分支名从 issue.number(=iid)现算 —— 确定性 `bw/issue-<iid>`,不靠
        // lossy 的 `issue.branch`(刀3-fix:旧逻辑拿它查 MR,恒空永远查不到)。
        let branch = bw_engine::github::issue_branch(issue.number);

        let remote = if project.has_remote() {
            Some(self.remote_for(&project).map_err(|e| {
                self.step(ProgressLine::fail(1, format!("合入:认不出远端类型:{e}")));
                AppError::Exec(format!("认不出远端类型:{e}"))
            })?)
        } else {
            None
        };

        // 去远端现查 MR 号(正本在远端,现查)。
        let mut pr_number = 0u32;
        let mut merged = false;
        if let Some(r) = &remote {
            match r.open_mr_for_branch(&branch).await {
                Ok(Some(n)) => {
                    self.step(ProgressLine::doing(1, format!("合入:正在合 MR #{n}…")));
                    if let Err(e) = r.merge_mr(n).await {
                        self.step(ProgressLine::fail(1, format!("合入:MR #{n} 没成:{e}")));
                        return Err(AppError::Exec(format!("合入 MR #{n} 没成:{e}")));
                    }
                    pr_number = n;
                    merged = true;
                    self.step(ProgressLine::ok(1, format!("合入:MR #{n} 已合")));
                }
                Ok(None) => {
                    // 挂了远端但分支上没有开着的 MR —— 不关 issue,活留评审中。
                    let why = format!("没找到这活的 MR(分支 {branch} 上没有开着的 MR),活留评审中");
                    self.step(ProgressLine::fail(1, format!("合入:{why}")));
                    return Err(AppError::Refused(why));
                }
                Err(e) => {
                    // 查 MR 本身失败(网络/权限)—— 不关 issue,活留评审中。
                    self.step(ProgressLine::fail(1, format!("合入:查 MR 没成:{e}")));
                    return Err(AppError::Exec(format!("查 MR 没成:{e}")));
                }
            }
        } else {
            self.step(ProgressLine::ok(1, "合入:没挂远端,没有 MR 可合"));
        }
        // !has_remote 的本地项目:没有 MR 可合,merged=false,下面直接走「完成」。

        // 合入之后的本机收尾。
        let mut notes: Vec<String> = Vec::new();
        if merged {
            self.step(ProgressLine::doing(2, "合入:把本机仓快进到刚合进去的提交…"));
            let (_, note) = self.pull_main_after_merge(issue.project_id).await;
            notes.push(note.clone());
            self.step(ProgressLine::ok(2, format!("合入:{note}")));
        } else {
            self.step(ProgressLine::ok(2, "合入:不用拉主检出"));
        }

        // 合入由人点;Workbench 这一下把 issue 关掉 = Done。本地无远端项目(没 MR
        // 可合)也走这一步 —— 合理。
        self.step(ProgressLine::doing(3, "合入:结清这张活…"));
        if let Err(e) = issue_store::set_status(self, &project, id.iid(), IssueStatus::Done).await {
            self.step(ProgressLine::fail(3, format!("合入:结清没成:{e}")));
            return Err(e);
        }
        // 收掉 worktree + 分支 —— set_status(Done) 后无条件收(只要 worktree 干净)。
        // 不再以 `merged && main_has_it` 为条件:本地项目(merged=false)的活分支
        // 也是 `bw/issue-<iid>`,结清了也该收。
        if let Some(n) = self.cleanup_issue_branch_note(&issue).await {
            notes.push(n);
        }
        self.step(ProgressLine::ok(3, "合入:活已完成"));

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
        if let Some(e) = self
            .chat_notify_issue(id, crate::chat::NotifyEvent::Merged.key(), pr_number)
            .await
        {
            events.push(e);
        }
        Ok(events)
    }

    async fn pull_main_after_merge(&self, project_id: ProjectId) -> (bool, String) {
        let Ok(ws) = self.workspace_of(project_id).await else {
            return (false, "主检出没拉:算不出这个项目的工作区路径".into());
        };
        let cleared = super::plan::salvage_main_checkout_dirt(&ws).await;
        let (ok, note) = match crate::git::pull_ff(&ws).await {
            Ok(true) => (true, "主检出已拉到最新".into()),
            Ok(false) => (true, "主检出本来就是最新的".into()),
            Err(e) => (
                false,
                format!(
                    "主检出没拉动(合入与结清本身已经生效,可以自己去仓里 git pull):{}",
                    one_line(&e.to_string())
                ),
            ),
        };
        if cleared.is_empty() {
            (ok, note)
        } else {
            (ok, format!("{cleared}{note}"))
        }
    }

    /// 收 worktree + 删分支的回执一句(给 `local_note`)。**不靠 lossy 的
    /// `issue.branch`** —— 分支名从 `issue.number` 现算。worktree 脏的(有未提交
    /// 改动)原样留着,如实说一声。旧活记的是平级兄弟路径,这里走
    /// `resolve_issue_worktree`(会话记下的路径 → 新目录 → 旧兄弟)才能收掉。
    async fn cleanup_issue_branch_note(&self, issue: &crate::model::Issue) -> Option<String> {
        let Ok(ws) = self.workspace_of(issue.project_id).await else {
            return None;
        };
        let recorded = self
            .conversation_for_issue(issue.id)
            .await
            .ok()
            .flatten()
            .filter(|c| !c.workspace_path.is_empty())
            .map(|c| std::path::PathBuf::from(&c.workspace_path));
        let tree =
            bw_engine::workspace::resolve_issue_worktree(&ws, issue.number, recorded.as_deref())?;
        let branch = bw_engine::github::issue_branch(issue.number);
        match crate::git::is_dirty(&tree).await {
            Ok(false) => {}
            Ok(true) => {
                return Some(format!(
                    "本机分支 {branch} 先留着:worktree 有未提交的改动(真实劳动成果,不删)"
                ));
            }
            Err(e) => {
                return Some(format!(
                    "本机分支 {branch} 没收:读 worktree 状态没成({})",
                    one_line(&e.to_string())
                ));
            }
        }
        let s = match tree.to_str() {
            Some(s) => s,
            None => return None,
        };
        if crate::git::worktree_remove(&ws, s).await.is_err() {
            return Some(format!(
                "本机分支 {branch} 没收:worktree 收不掉(不影响合入与结清)"
            ));
        }
        if crate::git::branch_exists(&ws, &branch).await {
            match crate::git::delete_merged_branch(&ws, &branch).await {
                Ok(()) => Some(format!("本机分支 {branch} 已收掉")),
                Err(e) => Some(format!(
                    "本机分支 {branch} 没收掉(可能是未合分支,git -d 拒绝;不影响合入与结清):{}",
                    one_line(&e.to_string())
                )),
            }
        } else {
            Some(format!("本机已经没有 {branch} 这条分支了(worktree 已收)"))
        }
    }
}

/// 把 git 的多行原话压成一行。**压行不是删字** —— 一个字都不省,只是让它能塞
/// 进界面上那一条回执。
pub(super) fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
