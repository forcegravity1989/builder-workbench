//! 建活、▶跑、状态转移。
//!
//! 两条铁律的落点都在这个文件里:
//!
//! - **▶跑最远只到「评审中」**。执行器返回成功也只推到 InReview,不会自己
//!   推到「已完成」。
//! - **「完成」永远由人点**。`TransitionIssue { to: Done }` 是唯一入口,而且
//!   状态机只允许从「评审中」进 Done。
//!
//! 刀3 起,issue 的正本在远端 codehub/GitHub issue + 标签,本地不建 issue 表。
//! 所有 issue 读写经 [`super::issue_store`] 走远端。

use super::worktree;
use super::{issue_store, App, AppError, Result};
use crate::command::Event;
use crate::model::{Category, Issue, IssueId, IssueKind, IssueOrigin, IssueStatus, ProjectId};
use v4_engine::{build_startup_plan, InteractiveExecutor, RunCtx, TuiAgentConfig};

impl App {
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn create_issue(
        &mut self,
        project_id: ProjectId,
        title: String,
        body: String,
        _category: Option<Category>,
        kind: IssueKind,
        _origin: IssueOrigin,
        week_of: String,
    ) -> Result<Vec<Event>> {
        let project = self.project_of(project_id).await?;
        // 幂等:同一个项目里标题一样的、开着的活不建第二张(指挥器重跑靠它)。
        if let Some(existing) = issue_store::find_open_by_title(self, &project, &title).await? {
            return Ok(vec![Event::IssueCreated {
                id: existing.id,
                number: existing.number,
            }]);
        }
        let issue = issue_store::create(self, &project, &title, &body, kind, &week_of, &[]).await?;
        Ok(vec![Event::IssueCreated {
            id: issue.id,
            number: issue.number,
        }])
    }

    /// 唯一的干活入口。
    ///
    /// 干成了推「评审中」;干砸了如实停在原地(状态不动),可以重试,不假装
    /// 前进。**任何情况下都不会走到「已完成」**。
    pub(super) async fn run_issue(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if !matches!(
            issue.status,
            IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::InProgress
        ) {
            return Err(AppError::Refused(format!(
                "这张活现在是「{}」,不是能开工的状态",
                issue.status.label()
            )));
        }

        // 桌面壳里开工 = 起一个内嵌终端,人看着 agent 干活。这条路不等执行器
        // 返回,所以下面阻塞那一段不再走。
        if self.run_issue_pty(id).await? {
            return Ok(vec![Event::IssueRan {
                id,
                ok: true,
                summary: "已在内嵌终端里开工,过程看会话屏".into(),
            }]);
        }

        let ws = self.workspace_of(issue.project_id).await?;
        // 有真实工作区就在**这张活自己的 worktree** 里干,和 PTY 那条路一样;
        // 没有工作区就没什么可隔离的,下面走自我标注的替身。
        let tree = if ws.is_dir() {
            let t = worktree::provision(&ws, issue.number).await?;
            Some(t)
        } else {
            None
        };
        let run_dir = tree
            .as_ref()
            .map(|t| t.path.clone())
            .unwrap_or_else(|| ws.clone());
        // 先推进行中 —— 界面上立刻看得出它开工了。
        if issue.status != IssueStatus::InProgress {
            let project = self.project_of(issue.project_id).await?;
            issue_store::set_status(self, &project, id.iid(), IssueStatus::InProgress).await?;
        }

        // 照活上记的工具走 —— 不许悄悄换(见 `tools::agent_for`)。
        let agent: &TuiAgentConfig = super::tools::agent_for(&issue.tool)?;
        let prompt = format!("#{} {}\n\n{}", issue.number, issue.title, issue.body);
        // 剧本在 buddy 自己的技能目录里,不在用户的仓里(见
        // `standard::skills`)。提示词只带路径,正文按需读。
        let skills_dir = self.ensure_skill_assets();
        let skill = skills_dir
            .as_deref()
            .and_then(|d| super::bootstrap::skill_pointer(d, &issue.workflow));
        let system_prompt = super::bootstrap::agent_system_prompt(&issue, &run_dir, skill.as_ref());
        let mut plan = build_startup_plan(agent, &prompt, &system_prompt, &run_dir)
            .map_err(|e| AppError::Exec(e.to_string()))?;
        if let Some(d) = &skills_dir {
            super::bootstrap::allow_skills_dir(&mut plan, d);
        }
        let ctx = RunCtx {
            project: issue.project_id.uuid(),
            workflow: uuid::Uuid::nil(),
        };

        // 没有真实工作区的项目走自我标注的替身:产出带【mock】字样,不冒充
        // 真的干过活。有工作区但没开 PTY(指挥器、headless)时也走这条。
        let out = if tree.is_some() {
            self.executor.run_skill(&plan, &ctx).await
        } else {
            v4_engine::MockInteractiveExecutor::new()
                .run_skill(&plan, &ctx)
                .await
        };
        match out {
            Ok(o) if o.completed => {
                // 最远到「评审中」。这一步不是人点的,所以到此为止。
                let project = self.project_of(issue.project_id).await?;
                issue_store::set_status(self, &project, id.iid(), IssueStatus::InReview).await?;
                let mut events = vec![Event::IssueRan {
                    id,
                    ok: true,
                    summary: o.summary,
                }];
                if let Some(e) = self.chat_notify_issue(id, "review").await {
                    events.push(e);
                }
                Ok(events)
            }
            Ok(o) => Ok(vec![Event::IssueRan {
                id,
                ok: false,
                summary: o.summary,
            }]),
            Err(e) => Ok(vec![Event::IssueRan {
                id,
                ok: false,
                summary: format!("开工失败:{e}"),
            }]),
        }
    }

    /// 「提交并开 MR」——第 4 站到第 5 站之间那一下。
    ///
    /// agent 在这张活的 worktree 里把文件改完了,这一下把它变成**可评审的东西**:
    /// 提交(agent 自己已经提交过的就跳过)→ 推分支 → 开 MR → 活进「评审中」。
    ///
    /// **由人点,而且最远只到「评审中」**。agent 什么时候算干完只有人知道;
    /// 「完成」还是得评审完之后再点一次。
    pub(super) async fn submit_issue_work(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if !matches!(
            issue.status,
            IssueStatus::InProgress | IssueStatus::InReview | IssueStatus::Blocked
        ) {
            return Err(AppError::Refused(format!(
                "这张活现在是「{}」,还没开过工,没有可提交的改动",
                issue.status.label()
            )));
        }
        let project = self.project_of(issue.project_id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        // 幂等:这张活开过工就已经有一棵树,这里拿到的是同一棵。
        let tree = worktree::provision(&ws, issue.number).await?;
        if !tree.isolated {
            return Err(AppError::Refused(
                "这个工作区不是 git 仓,没有分支可提,也就没有可开的 MR".into(),
            ));
        }

        // 基线取主检出**当下**的 HEAD。
        let base = crate::git::head_sha(&ws).await.unwrap_or_default();
        // agent 常常自己就提交了;没提交的这一下替它提交掉。
        crate::git::commit_all(&tree.path, &format!("#{} {}", issue.number, issue.title)).await?;
        let commits = if base.is_empty() {
            0
        } else {
            crate::git::commits_ahead_of(&tree.path, &base)
                .await
                .unwrap_or(0)
        };
        if commits == 0 {
            return Err(AppError::Refused(format!(
                "`{}` 这棵树上没有比主检出多出来的提交 —— 这张活还没干出东西,没有可评审的改动",
                tree.path.display()
            )));
        }

        let mut body = format!(
            "buddy 管理的第 {} 号活「{}」干出来的改动,等人评审。\n\n",
            issue.number, issue.title
        );
        body.push_str(&format!(
            "这条分支上有 {commits} 个提交。合入之后回 buddy 点「合入并完成」结清这张活。"
        ));
        let mr = worktree::push_and_open_mr(
            &project,
            &tree,
            true,
            &format!("#{} {}", issue.number, issue.title),
            &body,
        )
        .await;

        let mut events = vec![Event::IssueSubmitted {
            id,
            branch: tree.branch.clone(),
            commits,
            pr_number: mr.number,
            note: mr.note,
        }];
        // 推「评审中」。阻塞态要先回「进行中」——状态机不许从阻塞直接进评审。
        if issue.status != IssueStatus::InReview {
            if issue.status.can_transition_to(IssueStatus::InProgress) {
                events.extend(self.transition_issue(id, IssueStatus::InProgress).await?);
            }
            events.extend(self.transition_issue(id, IssueStatus::InReview).await?);
        }
        Ok(events)
    }

    /// 状态转移。合法性由 `crate::model::IssueStatus::can_transition_to` 那张转移表守。
    pub(super) async fn transition_issue(
        &mut self,
        id: IssueId,
        to: IssueStatus,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if issue.status == to {
            return Ok(vec![Event::IssueTransitioned {
                id,
                to,
                settled: false,
            }]);
        }
        if !issue.status.can_transition_to(to) {
            return Err(AppError::IllegalTransition {
                from: issue.status.label().to_string(),
                to: to.label().to_string(),
            });
        }
        let project = self.project_of(issue.project_id).await?;
        issue_store::set_status(self, &project, id.iid(), to).await?;
        // Done = 远端 issue closed。settled 只在走进 Done 时才算。
        let settled = to == IssueStatus::Done;
        // 结清了就把这张活那棵 worktree 收掉。
        if settled {
            self.cleanup_issue_worktree(&issue).await;
        }
        let mut events = vec![Event::IssueTransitioned { id, to, settled }];
        if to == IssueStatus::InReview {
            if let Some(e) = self.chat_notify_issue(id, "review").await {
                events.push(e);
            }
        }
        Ok(events)
    }

    pub(super) async fn block_issue(&mut self, id: IssueId, reason: String) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if !issue.status.can_transition_to(IssueStatus::Blocked) {
            return Err(AppError::IllegalTransition {
                from: issue.status.label().to_string(),
                to: IssueStatus::Blocked.label().to_string(),
            });
        }
        let project = self.project_of(issue.project_id).await?;
        issue_store::set_status(self, &project, id.iid(), IssueStatus::Blocked).await?;
        // 阻塞原因写进 issue 评论 —— 不动正文,结构化产出挂评论。
        issue_store::comment(self, &project, id.iid(), &format!("阻塞原因:{reason}")).await?;
        Ok(vec![Event::IssueBlocked { id }])
    }

    /// 收掉这张活的 worktree(+ 分支)。结清(Done)后**无条件**调 —— 只要
    /// worktree 干净就删分支;脏的(有未提交的劳动成果)原样留着。刀3-fix:
    /// `merge_and_settle` 和 `transition_issue` 两条结清路都走这同一个收尾,
    /// 不再各自判 `merged&&main_has_it`(那条靠 lossy 的 `issue.branch`,恒空)。
    pub(super) async fn cleanup_issue_worktree(&self, issue: &Issue) {
        let Ok(ws) = self.workspace_of(issue.project_id).await else {
            return;
        };
        let Some(tree) = v4_engine::workspace::issue_worktree_path(&ws, issue.number) else {
            return;
        };
        // worktree 干净才收(脏的有未提交的劳动成果,不删)。
        if worktree::remove_if_clean(&ws, &tree).await {
            // worktree 收掉了,顺手删分支(只删 merged 的;未合的 `git -d` 会
            // 拒绝,不强删 —— 留着也不影响)。分支名从 issue.number 现算,
            // 不靠 lossy 的 `issue.branch`。
            let branch = v4_engine::github::issue_branch(issue.number);
            if crate::git::branch_exists(&ws, &branch).await {
                let _ = crate::git::delete_merged_branch(&ws, &branch).await;
            }
        }
    }

    pub async fn issue_or_err(&self, id: IssueId) -> Result<Issue> {
        let project = self.project_of(id.project_id()).await?;
        issue_store::fetch(self, &project, id.iid()).await
    }

    // ── App 暴露给 app-shell 的查询方法(替代旧的 store.issue* 系列)──────

    /// 列出项目的全部活(从远端现读)。没挂远端 → 空。**失败不吞**(刀3-fix:
    /// 以前 `unwrap_or_default()` 把 codehub 抖一下整屏蒸发成空、健康灯被写灰);
    /// 现在返 `Err`,调用方挂到 warnings 让 UI 显式横幅,并保留上一份已知好的 VM。
    pub async fn issues(&self, project_id: ProjectId) -> Result<Vec<Issue>> {
        let Some(project) = self.project(project_id).await? else {
            return Ok(Vec::new());
        };
        if !project.has_remote() {
            return Ok(Vec::new());
        }
        issue_store::list(
            self,
            &project,
            v4_engine::remote::IssueFilter {
                state: None,
                labels: vec![],
            },
        )
        .await
    }
}

// ── 纯内存过滤:调用方先 `App::issues(project_id).await` 拿一次,再借进来 ──────
// 这三个函数不再各自起 codehub-cli 子进程——以前每屏重建 N 项目会 spawn
// 2N+ 次,UI 卡 2-6 秒。现在只 spawn 一次(取 issues 列表),过滤在内存里做。
// 不引入持久缓存(MVP 不要):单次 build 内去重 spawn。

/// 某一周的活。`week` 传空串就是待办池那一列(没挂 bw:week 标签的)。
pub fn issues_in_week<'a>(issues: &'a [Issue], week: &str) -> Vec<&'a Issue> {
    issues.iter().filter(|i| i.week_of == week).collect()
}

/// 该人看一眼、且还没看的活有几张:评审中(MVP 不再按 MR/seen_at 过滤,
/// 因为 pr_number/updated_at 是 lossy)。
pub fn count_unseen(issues: &[Issue]) -> u32 {
    issues
        .iter()
        .filter(|i| i.status == IssueStatus::InReview)
        .count() as u32
}

/// 配置屏「用过几次」——现算,从 issue 列表按 workflow 聚合。
pub fn workflow_usage(issues: &[Issue]) -> Vec<(String, u32)> {
    use std::collections::HashMap;
    let mut counts: HashMap<String, u32> = HashMap::new();
    for i in issues {
        if i.kind == IssueKind::Business && !i.workflow.is_empty() {
            *counts.entry(i.workflow.clone()).or_default() += 1;
        }
    }
    let mut v: Vec<(String, u32)> = counts.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    v
}
