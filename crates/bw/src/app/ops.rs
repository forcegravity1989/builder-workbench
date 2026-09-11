use super::{issue_store, App, AppError, ProgressLine, Result};
use crate::{
    command::Event,
    model::{Issue, IssueId, IssueKind, IssueOrigin, IssueStatus, ProjectId},
};

pub const OPS1_WORKFLOW: &str = "更新指标与版本计划";
pub const OPS2_WORKFLOW: &str = "资产盘点";
pub const OPS3_WORKFLOW: &str = "规范铺底";

pub fn ops1_title() -> String {
    crate::version::OPS1_TITLE.to_string()
}

pub fn is_ops1_issue(i: &Issue) -> bool {
    i.kind == IssueKind::Ops
        && (i.workflow == OPS1_WORKFLOW || crate::version::is_ops1_title(&i.title))
}

fn is_open_status(status: IssueStatus) -> bool {
    !matches!(status, IssueStatus::Done | IssueStatus::Cancelled)
}

pub fn find_open_bare_ops1(issues: &[Issue]) -> Option<&Issue> {
    issues.iter().find(|i| {
        is_ops1_issue(i)
            && is_open_status(i.status)
            && crate::version::ops1_version_from_title(&i.title).is_none()
    })
}

/// 版本计划 issue 须在标题和标签中指定版本；优先取最新未关闭项，其次取未发布的已关闭项。
pub fn current_week_version(issues: &[Issue], released_names: &[String]) -> String {
    let rows: Vec<crate::version::Ops1VersionRow> = issues
        .iter()
        .filter_map(|i| {
            let version = crate::version::ops1_version_from_title(&i.title)?;
            (is_ops1_issue(i) && i.plan_versions.contains(&version)).then_some((i, version))
        })
        .map(|(i, version)| crate::version::Ops1VersionRow {
            released: released_names.contains(&version),
            version,
            created_at: i.created_at,
            number: i.number,
            open: is_open_status(i.status),
        })
        .collect();
    crate::version::current_from_ops1(&rows).unwrap_or_default()
}

/// 已有未结束的版本计划，或本周创建过已排期的版本计划时，不重复创建。
pub fn week_started(issues: &[Issue], current_week: &str) -> bool {
    let mut open = false;
    let mut tagged_this_week = false;
    for i in issues {
        if !is_ops1_issue(i) {
            continue;
        }
        if i.status != IssueStatus::Done && i.status != IssueStatus::Cancelled {
            open = true;
        }
        if !i.plan_versions.is_empty() && crate::isoweek::unix_in_week(i.created_at, current_week) {
            tagged_this_week = true;
        }
    }
    crate::version::ops1_already_started(open, tagged_this_week)
}

pub fn ops2_title(week: &str) -> String {
    format!("资产盘点 {week}")
}

/// 剧本目录名 → Issue 上挂的 workflow 人话名。配置表「名称」用这个,slug 另写一行。
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
        "mattpocock-skills" => Some("mattpocock-skills"),
        _ => None,
    }
}

impl App {
    #[allow(dead_code)]
    pub(super) async fn create_ops_issue(
        &mut self,
        project_id: ProjectId,
        title: String,
        body: String,
        origin: IssueOrigin,
        week_of: String,
    ) -> Result<(IssueId, bool, Vec<Event>)> {
        let project = self.project_of(project_id).await?;
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
            .ok_or_else(|| AppError::Refused("未能创建 Issue".into()))?;
        self.issue_or_err(id).await?;
        Ok((id, created, events))
    }
}

impl App {
    /// 先合入 MR，成功后再关闭 issue；合入失败必须保留原状态。
    pub(super) async fn merge_and_settle(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let project = self.project_of(issue.project_id).await?;

        self.step(ProgressLine::doing(1, "正在查询 Issue 关联的 MR…"));

        if issue.status == IssueStatus::Done {
            self.step(ProgressLine::ok(3, "Issue 已完成"));
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

        let branch = issue_store::work_branch(&issue);

        let remote = if project.has_remote() {
            Some(self.remote_for(&project).map_err(|e| {
                self.step(ProgressLine::fail(1, format!("合入:认不出远端类型:{e}")));
                AppError::Exec(format!("认不出远端类型:{e}"))
            })?)
        } else {
            None
        };

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
                    let why = format!("分支 {branch} 没有开放的 MR，Issue 状态未变");
                    self.step(ProgressLine::fail(1, format!("合入:{why}")));
                    return Err(AppError::Refused(why));
                }
                Err(e) => {
                    self.step(ProgressLine::fail(1, format!("合入:查 MR 没成:{e}")));
                    return Err(AppError::Exec(format!("查 MR 没成:{e}")));
                }
            }
        } else {
            self.step(ProgressLine::ok(1, "合入:没挂远端,没有 MR 可合"));
        }

        let mut notes: Vec<String> = Vec::new();
        if merged {
            self.step(ProgressLine::doing(2, "合入:把本机仓快进到刚合进去的提交…"));
            let (_, note) = self.pull_main_after_merge(issue.project_id).await;
            notes.push(note.clone());
            self.step(ProgressLine::ok(2, format!("合入:{note}")));
        } else {
            self.step(ProgressLine::ok(2, "合入:不用拉主检出"));
        }

        self.step(ProgressLine::doing(3, "正在标记完成…"));
        if let Err(e) = issue_store::set_status(self, &project, id.iid(), IssueStatus::Done).await {
            self.step(ProgressLine::fail(3, format!("标记完成失败：{e}")));
            return Err(e);
        }
        if let Some(n) = self.cleanup_issue_branch_note(&issue).await {
            notes.push(n);
        }
        self.step(ProgressLine::ok(3, "Issue 已完成"));

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
        let cleared = super::plan::salvage_readings_dirt(&ws).await;
        let (ok, note) = match crate::git::pull_ff(&ws).await {
            Ok(true) => (true, "主检出已拉到最新".into()),
            Ok(false) => (true, "主检出本来就是最新的".into()),
            Err(e) => (
                false,
                format!(
                    "本地仓库更新失败（远端 MR 已合入）：{}",
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

    async fn cleanup_issue_branch_note(&self, issue: &crate::model::Issue) -> Option<String> {
        let branch = issue_store::work_branch(issue);
        if bw_engine::workspace::is_standing_branch(&branch) {
            return Some(format!("保留常驻分支 {branch} 及其工作树"));
        }
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
        let branch = bw_engine::workspace::issue_branch(issue.number);
        match crate::git::is_dirty(&tree).await {
            Ok(false) => {}
            Ok(true) => {
                return Some(format!("保留本地分支 {branch}：工作树有未提交的改动"));
            }
            Err(e) => {
                return Some(format!(
                    "保留本地分支 {branch}：无法读取工作树状态（{}）",
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
                "本地工作树删除失败，保留分支 {branch}；Issue 已完成"
            ));
        }
        if crate::git::branch_exists(&ws, &branch).await {
            match crate::git::delete_merged_branch(&ws, &branch).await {
                Ok(()) => Some(format!("本地分支 {branch} 已删除")),
                Err(e) => Some(format!(
                    "本地分支 {branch} 删除失败（Issue 已完成）：{}",
                    one_line(&e.to_string())
                )),
            }
        } else {
            Some(format!("工作树已删除，本地分支 {branch} 不存在"))
        }
    }
}

pub(super) fn one_line(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}
