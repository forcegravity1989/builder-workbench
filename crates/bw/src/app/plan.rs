//! 开始本周、排期、发版本。
//!
//! 刀3 起,issue 的正本在远端 codehub/GitHub issue + 标签,本地不建 issue 表,
//! 不写周计划文件。排期 = 给 issue 打 `bw:week:*` 标签;发版 = 给活打
//! `bw:released:*` 标签 + 在远端建 Release。

use super::{issue_store, App, AppError, Result};
use crate::command::Event;
use crate::model::{IssueId, IssueStatus, ProjectId};
use crate::repo::readings_file;
use crate::{IssueKind, IssueOrigin};

impl App {
    /// 总览「开始本周」。判据是**本周的运作活① issue 在不在**——查远端 issue,
    /// 不查任何索引表。已经有了且还没完成就平静挡住,不重复建、也不去动那场
    /// 可能正开着的会话。
    pub(super) async fn start_week_planning(
        &mut self,
        project_id: ProjectId,
        week: String,
    ) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let title = super::ops1_title(&week);

        // 按标题查本周的运作活①(含已关闭)。关过再点「开始本周」会再建一张
        // 同名活 —— 合入 #8 之后总览横幅又出来,就是这条漏了。
        let existing = self
            .issues(project_id)
            .await?
            .into_iter()
            .find(|i| i.title == title);
        if let Some(found) = existing {
            if found.status != IssueStatus::Done {
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
        let (issue_id, _, mut events) = self
            .create_ops_issue(
                project_id,
                title,
                "复盘上周、补齐 .bw/metrics.toml、和人交流出本周目标与业务活草稿。\n\n草稿没经人确认之前不许建活、不许落文件。"
                    .into(),
                super::OPS1_WORKFLOW,
                IssueOrigin::Human,
                week.clone(),
            )
            .await?;
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

    /// 「↻ 拉到最新」:把主检出快进到远端。
    ///
    /// 主检出若只被读数流水弄脏,先把那份挪进账本再拉——否则 `--ff-only`
    /// 会停住,人点刷新也看不到同事已经合进去的 `metrics.toml`。
    pub(super) async fn pull_workspace(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        if !ws.is_dir() {
            return Err(AppError::NoWorkspace(project_id.uuid().to_string()));
        }
        let salvaged = salvage_readings_dirt(&ws).await;
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
        if salvaged {
            note = format!("主检出上的读数已挪进账本。{note}");
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
        if version.is_empty() || version.contains('(') {
            return Err(AppError::Refused(format!(
                "「{version}」不像一个版本号。不要空、不要带括号。"
            )));
        }
        let project = self.project_of(project_id).await?;

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
        let text = crate::chat::notify_text("release", 0, &format!("发版 {version}"), "", "");
        if let Some(e) = self.chat_send(project_id, "release", 0, text).await {
            events.push(e);
        }
        Ok(events)
    }
}

/// 主检出若只脏了读数流水,把内容并进账本,再把主检出那份恢复成 HEAD。
async fn salvage_readings_dirt(ws: &std::path::Path) -> bool {
    let Ok(paths) = crate::git::dirty_paths(ws).await else {
        return false;
    };
    if !crate::git::is_readings_dirt(&paths) {
        return false;
    }
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
