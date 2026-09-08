//! 排期、发版本、改未发版本名。
//!
//! 刀3 起,issue 的正本在远端 codehub/GitHub issue + 标签,本地不建 issue 表。
//! 排期 = 给 issue 打 `bw:plan:<版本名>`;发版 = 给活打 `bw:released:<版本名>` +
//! 在远端建同名 Release。不再写 `bw:week:*`。

use super::{issue_store, App, AppError, Result};
use crate::{
    command::Event,
    model::{IssueId, IssueStatus, ProjectId},
    repo::readings_file,
    IssueKind, IssueOrigin,
};

impl App {
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
        issue_store::clear_plan(self, &project, id.iid()).await?;

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

    /// 排进版本(`bw:plan:<name>`)。一张活只挂一个 plan,换号就是换这张标签。
    /// 顺手摘旧 `bw:week:`。状态进「待办」(已排期)。
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

    /// 建一个版本:先落一张运作活①并打 `bw:plan:<name>`,纳入的活也打标。
    /// 同名里程碑只补充,失败不回滚标签。
    pub(super) async fn create_plan_version(
        &mut self,
        project_id: ProjectId,
        name: String,
        start: String,
        due: String,
        included: Vec<IssueId>,
    ) -> Result<Vec<Event>> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::Refused("版本名不能空".into()));
        }
        let start = start.trim().to_string();
        let due = due.trim().to_string();
        if !start.is_empty() && !looks_like_ymd(&start) {
            return Err(AppError::Refused("开始日期认不出,请用日期框选".into()));
        }
        if !due.is_empty() && !looks_like_ymd(&due) {
            return Err(AppError::Refused("结束日期认不出,请用日期框选".into()));
        }
        if !start.is_empty() && !due.is_empty() && start > due {
            return Err(AppError::Refused("开始不能晚于结束".into()));
        }
        let project = self.project_of(project_id).await?;
        let (plans, released) = self.collect_version_names(&project).await?;
        if plans.iter().any(|s| s == &name) || released.iter().any(|s| s == &name) {
            return Err(AppError::Refused(format!("{name} 已经有了")));
        }
        let issues = self.issues(project_id).await.unwrap_or_default();
        let mut prior: Vec<(u32, String)> = Vec::new();
        for id in &included {
            let old = issues
                .iter()
                .find(|i| i.id == *id)
                .map(|i| i.plan_version.clone())
                .unwrap_or_default();
            let old = if old == name { String::new() } else { old };
            prior.push((id.iid(), old));
        }
        let ops1_id = self.ensure_ops1_for_version(project_id, &name).await?;
        let comment = super::week_comment::render_week_plan_comment(&prior);
        issue_store::comment(self, &project, ops1_id.iid(), &comment).await?;
        for id in &included {
            issue_store::assign_to_plan(self, &project, id.iid(), &name).await?;
        }
        let mid = issue_store::try_ensure_plan_milestone(self, &project, &name, &start, &due).await;
        if mid > 0 {
            if let Ok(remote) = self.remote_for(&project) {
                issue_store::project_plan_best_effort(
                    &remote,
                    &project.remote_path,
                    ops1_id.iid(),
                    &name,
                )
                .await;
                for id in &included {
                    issue_store::project_plan_best_effort(
                        &remote,
                        &project.remote_path,
                        id.iid(),
                        &name,
                    )
                    .await;
                }
            }
        }
        Ok(vec![Event::PlanVersionCreated {
            project_id,
            name,
            milestone_id: mid,
        }])
    }

    /// 有开着的光杆①就改标题/打标复用;有同标题开着的就复用;否则新建。
    async fn ensure_ops1_for_version(
        &mut self,
        project_id: ProjectId,
        name: &str,
    ) -> Result<IssueId> {
        let project = self.project_of(project_id).await?;
        let title = crate::version::ops1_title_for(name);
        let issues = self.issues(project_id).await.unwrap_or_default();
        if let Some(bare) = super::find_open_bare_ops1(&issues) {
            let id = bare.id;
            let iid = bare.number;
            let body = bare.body.clone();
            issue_store::edit_issue(self, &project, iid, &title, &body).await?;
            issue_store::assign_to_plan(self, &project, iid, name).await?;
            return Ok(id);
        }
        if let Some(existing) = issue_store::find_open_by_title(self, &project, &title).await? {
            issue_store::assign_to_plan(self, &project, existing.number, name).await?;
            return Ok(existing.id);
        }
        let created = self
            .create_issue(
                project_id,
                title,
                String::new(),
                None,
                IssueKind::Ops,
                IssueOrigin::Human,
                String::new(),
                name.to_string(),
            )
            .await?;
        created
            .iter()
            .find_map(|e| match e {
                Event::IssueCreated { id, .. } => Some(*id),
                _ => None,
            })
            .ok_or_else(|| AppError::Refused("运作活①没建出来".into()))
    }

    /// 删未发版本:给挂着 `bw:plan:<name>` 的活摘标签,再尽力删同名里程碑。
    pub(super) async fn delete_plan_version(
        &mut self,
        project_id: ProjectId,
        name: String,
    ) -> Result<Vec<Event>> {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::Refused("版本名不能空".into()));
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
                if crate::version::ops1_version_from_title(&issue.title).as_deref()
                    == Some(name.as_str())
                {
                    let _ = issue_store::edit_issue(
                        self,
                        &project,
                        issue.number,
                        crate::version::OPS1_TITLE,
                        &issue.body,
                    )
                    .await;
                }
                issues_cleared += 1;
            }
        }
        issue_store::try_delete_plan_milestone(self, &project, &name).await;
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
        let cleared = salvage_readings_dirt(&ws).await;
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

    /// 发版本:只有在研且还没有同名 tag 的号能发。工作区先快进到远端,
    /// 脏或本机比远端新就拒。然后建 Release(打 tag),再给勾上的活打
    /// `bw:released:*`(可以一张不打)。已发过的号拒,要再发先开下一号。
    pub(super) async fn cut_release(
        &mut self,
        project_id: ProjectId,
        version: String,
        note: String,
        included: Vec<IssueId>,
    ) -> Result<Vec<Event>> {
        let version = version.trim().to_string();
        if version.is_empty() {
            return Err(AppError::Refused("版本名不能空".into()));
        }
        let project = self.project_of(project_id).await?;
        let issues = self.issues(project_id).await.unwrap_or_default();
        let (plans, released) = self.collect_version_names(&project).await?;
        if !plans.iter().any(|s| s == &version) {
            return Err(AppError::Refused(format!("先有计划版本 {version} 再发")));
        }
        let already = released.iter().any(|s| s == &version);
        let current = super::current_week_version(&issues, &released);
        if !crate::version::can_cut_release(&version, &current, already) {
            if already {
                return Err(AppError::Refused(format!(
                    "{version} 已经发过,要再发就先开下一号"
                )));
            }
            if current.is_empty() {
                return Err(AppError::Refused("还没有在研版本,不能发".into()));
            }
            return Err(AppError::Refused(format!(
                "只有在研版本能发,现在在研是 {current}"
            )));
        }

        let ws = self.workspace_of(project_id).await?;
        align_workspace_to_remote(&ws).await?;

        if project.has_remote() {
            let remote = self.remote_for(&project)?;
            remote
                .create_release(&version, &version, &note)
                .await
                .map_err(|e| AppError::Exec(format!("远端建 Release 没成:{e}")))?;
        }

        for id in &included {
            issue_store::set_released(self, &project, id.iid(), &version).await?;
        }

        let mut events = vec![Event::ReleaseCut {
            version: version.clone(),
            rows_written: true,
        }];
        let release_ev = crate::chat::NotifyEvent::Release;
        let note = note.trim();
        let text = if note.is_empty() {
            format!("【发版 {version}】")
        } else {
            format!("【发版 {version}】{note}")
        };
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
        if from.is_empty() || to.is_empty() {
            return Err(AppError::Refused("版本名不能空".into()));
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
                if crate::version::ops1_version_from_title(&issue.title).as_deref()
                    == Some(from.as_str())
                {
                    let _ = issue_store::edit_issue(
                        self,
                        &project,
                        issue.number,
                        &crate::version::ops1_title_for(&to),
                        &issue.body,
                    )
                    .await;
                }
                issues_moved += 1;
            }
        }
        if let Err(e) = remote
            .rename_plan_milestone(&project.remote_path, &from, &to)
            .await
        {
            bw_engine::dlog!(
                err,
                "milestone",
                "[BW_MILESTONE] 改里程碑标题 {from}→{to} 没成:{e}"
            );
        }
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
        let plan_names: Vec<String> = issues
            .iter()
            .filter(|i| crate::version::is_plan_name(&i.plan_version))
            .map(|i| i.plan_version.clone())
            .collect();
        let mut released_names: Vec<String> = issues
            .iter()
            .filter(|i| !i.version.is_empty())
            .map(|i| i.version.clone())
            .collect();
        if let Ok(remote) = self.remote_for(project) {
            if let Ok(tags) = remote.list_releases().await {
                for t in tags {
                    if !t.is_empty() {
                        released_names.push(t);
                    }
                }
            }
        }
        Ok((plan_names, released_names))
    }
}

/// 发版本 / 在研出包共用:读数脏先挪开,再快进。源码脏或本机比远端新就拒。
pub(super) async fn align_workspace_to_remote(ws: &std::path::Path) -> Result<()> {
    let _ = salvage_readings_dirt(ws).await;
    if crate::git::is_dirty(ws).await.unwrap_or(true) {
        return Err(AppError::Refused(
            "工作区有未提交的改动,先自己处理再发版本 / 出包".into(),
        ));
    }
    crate::git::pull_ff(ws)
        .await
        .map_err(|e| AppError::Exec(format!("没拉到远端最新:{e}")))?;
    let ahead = crate::git::commits_ahead_of_fetch(ws).await.unwrap_or(0);
    if ahead > 0 {
        return Err(AppError::Refused(
            "本机比远端新,先推上去或自己处理,避免包和 tag 不是同一份提交".into(),
        ));
    }
    Ok(())
}

/// 拉主干之前:主检出若只脏了读数流水,挪进账本再拉。不碰名片、不碰人的源码。
pub(super) async fn salvage_readings_dirt(ws: &std::path::Path) -> String {
    let Ok(paths) = crate::git::dirty_paths(ws).await else {
        return String::new();
    };
    if paths
        .iter()
        .any(|p| crate::git::is_readings_dirt(std::slice::from_ref(p)))
        && salvage_readings_into_ledger(ws).await
    {
        "主检出上的读数已挪进账本。".into()
    } else {
        String::new()
    }
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
