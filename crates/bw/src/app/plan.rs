//! 开始本版本、排期、发版本、改未发版本名。
//!
//! 刀3 起,issue 的正本在远端 codehub/GitHub issue + 标签,本地不建 issue 表。
//! 排期 = 给 issue 打 `bw:plan:v0.x`;发版 = 给活打 `bw:released:v0.x` +
//! 在远端建同名 Release。不再写 `bw:week:*`。

use super::{issue_store, App, AppError, Result};
use crate::command::Event;
use crate::model::{IssueId, IssueStatus, ProjectId};
use crate::repo::readings_file;
use crate::{IssueKind, IssueOrigin};

impl App {
    /// 总览「开始本版本」。判据是标题 + 本 ISO 周创建的 `v0.x` 标签——查远端
    /// issue,不查任何索引表。已经有了且还没完成就平静挡住。
    pub(super) async fn start_week_planning(
        &mut self,
        project_id: ProjectId,
        week: String,
    ) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let title = super::ops1_title();
        let listed = self.issues(project_id).await?;
        if super::week_started(&listed, &week) {
            if let Some(found) = listed.iter().find(|i| {
                super::is_ops1_issue(i)
                    && i.status != IssueStatus::Done
                    && i.status != IssueStatus::Cancelled
            }) {
                return Ok(vec![Event::WeekPlanInProgress {
                    project_id,
                    week,
                    issue_id: found.id,
                    status: found.status.label().to_string(),
                }]);
            }
            return Ok(vec![Event::WeekPlanAlreadyExists { project_id, week }]);
        }

        // 真跑与替身是两条路。真跑(桌面壳开着内嵌终端 + 项目有真实工作区):
        // 文件由 agent 会话产出、走 MR,这里一个文件都不写。替身(headless):
        // 没有真会话可以产文件,草稿活标就是这条路的全部产出。
        let real_session = self.pty_enabled && ws.is_dir();
        let draft_titles = if real_session {
            Vec::new()
        } else {
            // 替身路径:草稿活标给人确认(【mock】字样自我标注)。
            vec![
                format!("【mock】{week} 第一件业务活(草稿,等人确认)"),
                format!("【mock】{week} 第二件业务活(草稿,等人确认)"),
            ]
        };

        // 建运作活①并立刻开工。
        let (issue_id, created, mut events) = self
            .create_ops_issue(
                project_id,
                title,
                "复盘上周、补齐 .bw/metrics.toml、和人确认本周版本,再交流出版本目标与业务活草稿。\n\n草稿没经人确认之前不许建活、不许落文件。"
                    .into(),
                super::OPS1_WORKFLOW,
                IssueOrigin::Human,
                String::new(),
            )
            .await?;
        // 本周版本计划创建完成 → 发群(仅在新建那一下,不是重复点开始本周)。
        if created {
            let number = events
                .iter()
                .find_map(|e| match e {
                    Event::IssueCreated { number, .. } => Some(*number),
                    _ => None,
                })
                .unwrap_or(0);
            let ev = crate::chat::NotifyEvent::WeekPlan;
            let text = crate::chat::notify_text(ev.key(), number, &week, "", "");
            if let Some(e) = self.chat_send(project_id, ev.key(), number, text).await {
                events.push(e);
            }
        }
        events.extend(self.run_issue(issue_id).await?);
        events.push(Event::WeekPlanStarted {
            project_id,
            week,
            issue_id,
            draft_titles,
        });
        Ok(events)
    }

    /// 人确认草稿之后真的建活。
    pub(super) async fn confirm_week_draft(
        &mut self,
        project_id: ProjectId,
        _week: String,
        titles: Vec<String>,
    ) -> Result<Vec<Event>> {
        let mut events = Vec::new();
        for title in titles {
            let created = self
                .create_issue(
                    project_id,
                    title,
                    String::new(),
                    Some(crate::model::StageKind::Build),
                    IssueKind::Business,
                    IssueOrigin::AgentSplit,
                    String::new(),
                    String::new(),
                )
                .await?;
            events.extend(created);
        }
        Ok(events)
    }

    pub(super) async fn schedule_issue(
        &mut self,
        id: IssueId,
        week_of: Option<String>,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let target = week_of.unwrap_or_default();
        if !target.is_empty() {
            return Err(AppError::Refused("排期请用版本,不再写周标签".into()));
        }
        let project = self.project_of(issue.project_id).await?;
        issue_store::set_week(self, &project, id.iid(), &target).await?;

        // 排进某一周 = 进「待办」;移回待办池 = 回 Backlog。只在状态机允许时动,
        // 不合法就只改排期不动状态。
        let want = if target.is_empty() {
            IssueStatus::Backlog
        } else {
            IssueStatus::Todo
        };
        if issue.status != want && issue.status.can_transition_to(want) {
            issue_store::set_status(self, &project, id.iid(), want).await?;
        }

        Ok(vec![Event::IssueScheduled {
            id,
            week_of: target,
        }])
    }

    /// 排进人起名的版本(`bw:plan:<name>`)。同一槽位:先摘 `bw:week:` 标签,
    /// 再打 `bw:plan:<name>`,并把 issue 挂到版本里程碑。状态进「待办」(已排期)。
    pub(super) async fn schedule_to_plan(
        &mut self,
        id: IssueId,
        plan: String,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let project = self.project_of(issue.project_id).await?;
        issue_store::assign_to_plan(self, &project, id.iid(), &plan).await?;
        // 排进版本 = 进「待办」(已排期),状态机允许才动。
        if issue.status != IssueStatus::Todo && issue.status.can_transition_to(IssueStatus::Todo) {
            issue_store::set_status(self, &project, id.iid(), IssueStatus::Todo).await?;
        }
        Ok(vec![Event::IssueScheduledToPlan { id, plan }])
    }

    /// 建一个 `v0.x` 版本:建 codehub milestone(title=name,start,due),
    /// 并给 `included` 每张打 `bw:plan:<name>` 标签、挂到这个里程碑。
    pub(super) async fn create_plan_version(
        &mut self,
        project_id: ProjectId,
        name: String,
        start: String,
        due: String,
        _note: String,
        included: Vec<IssueId>,
    ) -> Result<Vec<Event>> {
        let name = name.trim().to_string();
        if !crate::version::is_v0x(&name) {
            return Err(AppError::Refused("版本名必须是 v0.1 这种".into()));
        }
        let start = start.trim().to_string();
        let due = due.trim().to_string();
        if start.is_empty() || due.is_empty() {
            return Err(AppError::Refused("开始和结束都要填".into()));
        }
        if !looks_like_ymd(&start) {
            return Err(AppError::Refused("开始日期认不出,请用日期框选".into()));
        }
        if !looks_like_ymd(&due) {
            return Err(AppError::Refused("结束日期认不出,请用日期框选".into()));
        }
        if start > due {
            return Err(AppError::Refused("开始不能晚于结束".into()));
        }
        let project = self.project_of(project_id).await?;
        let (plans, released) = self.collect_version_names(&project).await?;
        if plans.iter().any(|s| s == &name) || released.iter().any(|s| s == &name) {
            return Err(AppError::Refused(format!("{name} 已经有了")));
        }
        let mid = issue_store::create_plan_version(self, &project, &name, &start, &due).await?;
        for id in &included {
            issue_store::assign_to_plan(self, &project, id.iid(), &name).await?;
        }
        Ok(vec![Event::PlanVersionCreated {
            project_id,
            name,
            milestone_id: mid,
        }])
    }

    /// 删未发的 `v0.x` 版本:给挂着 `bw:plan:<name>` 的活摘标签,再删同名里程碑。
    pub(super) async fn delete_plan_version(
        &mut self,
        project_id: ProjectId,
        name: String,
    ) -> Result<Vec<Event>> {
        let name = name.trim().to_string();
        if !crate::version::is_v0x(&name) {
            return Err(AppError::Refused("版本名必须是 v0.1 这种".into()));
        }
        let project = self.project_of(project_id).await?;
        let (_plans, released) = self.collect_version_names(&project).await?;
        if released.iter().any(|s| s == &name) {
            return Err(AppError::Refused("已发过,不能删".into()));
        }
        let issues = self.issues(project_id).await?;
        let mut issues_cleared = 0u32;
        for issue in issues {
            if issue.plan_version == name {
                issue_store::clear_plan(self, &project, issue.number).await?;
                issues_cleared += 1;
            }
        }
        issue_store::delete_plan_version(self, &project, &name).await?;
        Ok(vec![Event::PlanVersionDeleted {
            project_id,
            name,
            issues_cleared,
        }])
    }

    /// 「↻ 拉到最新」:把主检出快进到远端。
    ///
    /// 主检出若只被读数流水弄脏,先把那份挪进账本再拉——否则 `--ff-only`
    /// 会停住,人点刷新也看不到同事已经合进去的 `metrics.toml`。
    pub(super) async fn pull_workspace(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        if !ws.is_dir() {
            return Err(AppError::NoWorkspace(project_id.uuid().to_string()));
        }
        let cleared = salvage_main_checkout_dirt(&ws).await;
        let (moved, mut note) = match crate::git::pull_ff(&ws).await {
            Ok(true) => (true, "工作区已拉到最新".to_string()),
            Ok(false) => (false, "工作区本来就是最新的".to_string()),
            Err(e) => (
                false,
                format!(
                    "没拉动(自己去仓里 git pull 看看):{}",
                    super::ops::one_line(&e.to_string())
                ),
            ),
        };
        if !cleared.is_empty() {
            note = format!("{cleared}{note}");
        }
        Ok(vec![Event::WorkspacePulled { moved, note }])
    }

    /// 发版本:在远端建 Release(打 tag + notes),成功后再给选中的活打
    /// `bw:released:*` 标签。按 version 标签幂等——同一版本不重复打。
    ///
    /// 高优7:先建 Release、后打标签。反过来若 Release 建失败,标签已打、
    /// 远端没 Release → 不一致;现在顺序反了,Release 没建成就整条失败,
    /// 标签一个没打,活还停在原地可以重试。
    pub(super) async fn cut_release(
        &mut self,
        project_id: ProjectId,
        version: String,
        note: String,
        included: Vec<IssueId>,
    ) -> Result<Vec<Event>> {
        let version = version.trim().to_string();
        if !crate::version::is_v0x(&version) {
            return Err(AppError::Refused("版本名必须是 v0.1 这种".into()));
        }
        let project = self.project_of(project_id).await?;
        let (plans, released) = self.collect_version_names(&project).await?;
        if released.iter().any(|s| s == &version) {
            return Err(AppError::Refused(format!("{version} 已经发过")));
        }
        if !plans.iter().any(|s| s == &version) {
            return Err(AppError::Refused(format!("先有计划版本 {version} 再发")));
        }

        // 1. 先在远端建 Release(tag + title + notes)—— 成功才往下。
        if project.has_remote() {
            let remote = self.remote_for(&project)?;
            remote
                .create_release(&version, &version, &note)
                .await
                .map_err(|e| AppError::Exec(format!("远端建 Release 没成:{e}")))?;
        }

        // 2. Release 建成了,再给选中的活打 released 标签。
        for id in &included {
            issue_store::set_released(self, &project, id.iid(), &version).await?;
        }

        let rows_written = true;
        let mut events = vec![Event::ReleaseCut {
            version: version.clone(),
            rows_written,
        }];
        let release_ev = crate::chat::NotifyEvent::Release;
        let text =
            crate::chat::notify_text(release_ev.key(), 0, &format!("发版 {version}"), "", "");
        if let Some(e) = self.chat_send(project_id, release_ev.key(), 0, text).await {
            events.push(e);
        }
        Ok(events)
    }

    /// 未发版本改名:标签定义 → issue 上的标 → 里程碑标题。已发拒改,新名撞名拒。
    pub(super) async fn rename_plan_version(
        &mut self,
        project_id: ProjectId,
        from: String,
        to: String,
    ) -> Result<Vec<Event>> {
        let from = from.trim().to_string();
        let to = to.trim().to_string();
        if !crate::version::is_v0x(&from) || !crate::version::is_v0x(&to) {
            return Err(AppError::Refused("版本名必须是 v0.1 这种".into()));
        }
        if from == to {
            return Ok(vec![]);
        }
        let project = self.project_of(project_id).await?;
        let (plans, released) = self.collect_version_names(&project).await?;
        if released.iter().any(|s| s == &from) {
            return Err(AppError::Refused("已发过,不能改名".into()));
        }
        if plans.iter().any(|s| s == &to) || released.iter().any(|s| s == &to) {
            return Err(AppError::Refused(format!("{to} 已经有了")));
        }
        let remote = self.remote_for(&project)?;
        remote
            .rename_plan_label(
                &project.remote_path,
                &format!("bw:plan:{from}"),
                &format!("bw:plan:{to}"),
            )
            .await
            .map_err(|e| AppError::Exec(format!("改标签名没成:{e}")))?;
        let issues = self.issues(project_id).await?;
        let mut issues_moved = 0u32;
        for issue in issues {
            if issue.plan_version == from {
                issue_store::assign_to_plan(self, &project, issue.number, &to).await?;
                issues_moved += 1;
            }
        }
        remote
            .rename_plan_milestone(&project.remote_path, &from, &to)
            .await
            .map_err(|e| AppError::Exec(format!("改里程碑标题没成:{e}")))?;
        Ok(vec![Event::PlanVersionRenamed {
            project_id,
            from,
            to,
            issues_moved,
        }])
    }

    pub(super) async fn collect_version_names(
        &self,
        project: &crate::model::Project,
    ) -> Result<(Vec<String>, Vec<String>)> {
        let issues = self.issues(project.id).await.unwrap_or_default();
        let mut plan_names: Vec<String> = issues
            .iter()
            .filter(|i| crate::version::is_v0x(&i.plan_version))
            .map(|i| i.plan_version.clone())
            .collect();
        let mut released_names: Vec<String> = issues
            .iter()
            .filter(|i| crate::version::is_v0x(&i.version))
            .map(|i| i.version.clone())
            .collect();
        if let Ok(remote) = self.remote_for(project) {
            if let Ok(rows) = remote.list_milestones(&project.remote_path).await {
                for (title, _, _) in rows {
                    if crate::version::is_v0x(&title) {
                        plan_names.push(title);
                    }
                }
            }
            if let Ok(tags) = remote.list_releases().await {
                for t in tags {
                    if crate::version::is_v0x(&t) {
                        released_names.push(t);
                    }
                }
            }
        }
        Ok((plan_names, released_names))
    }
}

/// 拉主干之前清掉 Workbench 自己留在主检出上的预览:
/// 读数挪进账本;接入写下的名片恢复成 HEAD(正本在已合入的 MR 里)。
/// 人自己的源码脏文件不动。
pub(super) async fn salvage_main_checkout_dirt(ws: &std::path::Path) -> String {
    let Ok(paths) = crate::git::dirty_paths(ws).await else {
        return String::new();
    };
    let mut bits = Vec::new();
    if paths
        .iter()
        .any(|p| crate::git::is_readings_dirt(std::slice::from_ref(p)))
        && salvage_readings_into_ledger(ws).await
    {
        bits.push("主检出上的读数已挪进账本。");
    }
    let mut restored = false;
    for rel in [".bw/project.toml", ".bw/PROJECT.md"] {
        if !paths
            .iter()
            .any(|p| p == rel && crate::git::is_card_preview_path(p))
        {
            continue;
        }
        if crate::git::restore_path(ws, rel).await.is_ok() {
            restored = true;
            continue;
        }
        // 未跟踪:restore 无效。接入写下、还没合进主干的那份,删掉才能拉。
        let _ = std::fs::remove_file(ws.join(rel));
        restored = true;
    }
    if restored {
        bits.push("主检出上未提交的名片已让开,改以主干为准。");
    }
    bits.concat()
}

/// 主检出若脏了读数流水,把内容并进账本,再把主检出那份恢复成 HEAD。
async fn salvage_readings_into_ledger(ws: &std::path::Path) -> bool {
    let ledger = match bw_engine::workspace::provision_ledger_worktree(ws).await {
        Ok(p) => p,
        Err(_) => {
            let Some(dir) = bw_engine::workspace::ledger_worktree_path(ws) else {
                return false;
            };
            let _ = std::fs::create_dir_all(&dir);
            dir
        }
    };
    if readings_file::absorb_main_readings(&ledger, ws).is_err() {
        return false;
    }
    let _ = crate::git::restore_path(ws, ".bw/metrics/readings.jsonl").await;
    true
}

fn looks_like_ymd(s: &str) -> bool {
    s.len() == 10
        && s.as_bytes().get(4) == Some(&b'-')
        && s.as_bytes().get(7) == Some(&b'-')
        && s.bytes().enumerate().all(|(i, c)| {
            if i == 4 || i == 7 {
                c == b'-'
            } else {
                c.is_ascii_digit()
            }
        })
}
