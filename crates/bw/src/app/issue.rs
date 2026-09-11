use super::{issue_store, worktree, App, AppError, Result};
use crate::{
    command::Event,
    model::{
        codehub_alias_to_domain, Category, Issue, IssueId, IssueKind, IssueOrigin, IssueStatus,
        ProjectId,
    },
};
use bw_engine::{build_startup_plan, remote::Remote, InteractiveExecutor, RunCtx, TuiAgentConfig};

/// 安装目录没有源码仓；问题上报使用固定目标仓库。
const WORKBENCH_REPORT_HOST: &str = "green";
const WORKBENCH_REPORT_PATH: &str = "z30026659/workbench";

impl App {
    #[allow(clippy::too_many_arguments)]
    pub(super) async fn create_issue(
        &mut self,
        project_id: ProjectId,
        title: String,
        body: String,
        category: Option<Category>,
        kind: IssueKind,
        _origin: IssueOrigin,
        week_of: String,
        plan: String,
    ) -> Result<Vec<Event>> {
        let project = self.project_of(project_id).await?;
        if let Some(existing) = issue_store::find_open_by_title(self, &project, &title).await? {
            return Ok(vec![Event::IssueCreated {
                id: existing.id,
                number: existing.number,
            }]);
        }
        let mut extra: Vec<String> = match (kind, category) {
            (IssueKind::Ops, _) | (_, None) => Vec::new(),
            (_, Some(c)) => vec![format!("bw:category:{}", crate::model::category_key(c))],
        };
        let (week_of, plan) = if !plan.is_empty() {
            (String::new(), plan)
        } else {
            (week_of, String::new())
        };
        if !plan.is_empty() {
            extra.push(format!("bw:plan:{plan}"));
        }
        let extra_refs: Vec<&str> = extra.iter().map(String::as_str).collect();
        let issue =
            issue_store::create(self, &project, &title, &body, kind, &week_of, &extra_refs).await?;
        let mut events = vec![Event::IssueCreated {
            id: issue.id,
            number: issue.number,
        }];
        if !week_of.is_empty() && kind != IssueKind::Ops {
            let ev = crate::chat::NotifyEvent::IssueCreated;
            let text = crate::chat::notify_text(
                ev.key(),
                issue.number,
                &title,
                "",
                &format!("纳入本周 {week_of}"),
            );
            if let Some(e) = self
                .chat_send(project_id, ev.key(), issue.number, text)
                .await
            {
                events.push(e);
            }
        }
        Ok(events)
    }

    pub(super) async fn run_issue(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if !matches!(
            issue.status,
            IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::InProgress
        ) {
            return Err(AppError::Refused(format!(
                "此 Issue 当前为「{}」，不能开工",
                issue.status.label()
            )));
        }

        // Open Design = 本机网页内嵌类工具,**不起 CLI**:开工 = 在会话屏的
        // 「Open Design」标签里用内嵌的本机 Open Design 干。
        // 仍给此 Issue开一棵 worktree + 一条会话(原型产物从 OD 导出后落这棵
        // 树、走「提交并开 MR」),但不 spawn agent、不起 PTY。最远还是
        // 评审中 / 人点完成——和别的工具同一条状态机,没特殊待遇。
        if issue.tool == "open_design" {
            let already = self.conversation_for_issue(id).await?.is_some();
            if !already {
                let ws = self.workspace_of(issue.project_id).await?;
                let tree = worktree::provision_for(&ws, &issue).await?;
                let _conv = self
                    .upsert_conversation(&crate::model::Conversation {
                        id: crate::model::ConversationId::new(),
                        project_id: issue.project_id,
                        issue_id: id,
                        claude_session_id: String::new(),
                        workspace_path: tree.path.display().to_string(),
                        branch_name: tree.branch.clone(),
                        created_at: 0,
                        last_opened_at: 0,
                    })
                    .await?;
            }
            if issue.status != IssueStatus::InProgress {
                let project = self.project_of(issue.project_id).await?;
                issue_store::set_status(self, &project, id.iid(), IssueStatus::InProgress).await?;
            }
            // Open Design 不加载 Workbench 的技能目录；仅传系统提示词和文件引用。
            let prompt = format!("#{} {}\n\n{}", issue.number, issue.title, issue.body);
            let skills_dir = self.ensure_skill_assets();
            self.ensure_vendor_assets();
            let skill = skills_dir
                .as_deref()
                .and_then(|d| super::bootstrap::skill_pointer(d, &issue.workflow));
            let references = self
                .ensure_prompt_assets()
                .map(|d| super::bootstrap::references_for(&issue, &d))
                .unwrap_or_default();
            let version_context = self.version_context_for(&issue).await;
            let system_prompt = super::bootstrap::agent_system_prompt(
                &issue,
                skill.as_ref(),
                &references,
                &version_context,
            );
            let injected = match bw_engine::open_design::discover_web_url().await {
                Some(url) => bw_engine::open_design::start_run(&url, &prompt, &system_prompt)
                    .await
                    .is_some(),
                None => false,
            };
            return Ok(vec![Event::IssueRan {
                id,
                ok: true,
                summary: format!(
                    "Open Design 已内嵌——到会话屏「Open Design」标签里干;原型导出落这棵\
                     工作树,再「提交并开 MR」{}",
                    if injected {
                        "（已加载项目上下文）"
                    } else {
                        ""
                    }
                ),
                tool: issue.tool.clone(),
                embed_url: String::new(),
            }]);
        }

        let ws = self.workspace_of(issue.project_id).await?;
        // 桌面通过 Orca 执行；无工作区的演示路径使用明确标注的 mock。
        if self.pty_enabled && ws.is_dir() {
            return self.run_issue_orca(id, &issue, &ws).await;
        }
        let tree = if ws.is_dir() {
            Some(worktree::provision_for(&ws, &issue).await?)
        } else {
            None
        };
        let run_dir = tree
            .as_ref()
            .map(|t| t.path.clone())
            .unwrap_or_else(|| ws.clone());
        if issue.status != IssueStatus::InProgress {
            let project = self.project_of(issue.project_id).await?;
            issue_store::set_status(self, &project, id.iid(), IssueStatus::InProgress).await?;
        }

        let agent: &TuiAgentConfig = super::tools::agent_for(&issue.tool)?;
        let prompt = format!("#{} {}\n\n{}", issue.number, issue.title, issue.body);
        let skills_dir = self.ensure_skill_assets();
        self.ensure_vendor_assets();
        let skill = skills_dir
            .as_deref()
            .and_then(|d| super::bootstrap::skill_pointer(d, &issue.workflow));
        let references = self
            .ensure_prompt_assets()
            .map(|d| super::bootstrap::references_for(&issue, &d))
            .unwrap_or_default();
        let version_context = self.version_context_for(&issue).await;
        let system_prompt = super::bootstrap::agent_system_prompt(
            &issue,
            skill.as_ref(),
            &references,
            &version_context,
        );
        let mut plan = build_startup_plan(agent, &prompt, &system_prompt, &run_dir)
            .map_err(|e| AppError::Exec(e.to_string()))?;
        super::bootstrap::allow_skills_dir(&mut plan, &self.asset_root);
        let ctx = RunCtx {
            project: issue.project_id.uuid(),
            workflow: uuid::Uuid::nil(),
        };

        let out = if tree.is_some() {
            self.executor.run_skill(&plan, &ctx).await
        } else {
            bw_engine::MockInteractiveExecutor::new()
                .run_skill(&plan, &ctx)
                .await
        };
        match out {
            Ok(o) if o.completed => {
                let project = self.project_of(issue.project_id).await?;
                issue_store::set_status(self, &project, id.iid(), IssueStatus::InReview).await?;
                let events = vec![Event::IssueRan {
                    id,
                    ok: true,
                    summary: o.summary,
                    tool: issue.tool.clone(),
                    embed_url: String::new(),
                }];
                Ok(events)
            }
            Ok(o) => Ok(vec![Event::IssueRan {
                id,
                ok: false,
                summary: o.summary,
                tool: issue.tool.clone(),
                embed_url: String::new(),
            }]),
            Err(e) => Ok(vec![Event::IssueRan {
                id,
                ok: false,
                summary: format!("开工失败:{e}"),
                tool: issue.tool.clone(),
                embed_url: String::new(),
            }]),
        }
    }

    /// 先创建 worktree 和会话记录；已有会话只激活，不重复创建。
    async fn run_issue_orca(
        &mut self,
        id: IssueId,
        issue: &Issue,
        ws: &std::path::Path,
    ) -> Result<Vec<Event>> {
        let tree = worktree::provision_for(ws, issue).await?;
        let conv = self
            .upsert_conversation(&crate::model::Conversation {
                id: crate::model::ConversationId::new(),
                project_id: issue.project_id,
                issue_id: id,
                claude_session_id: String::new(),
                workspace_path: tree.path.display().to_string(),
                branch_name: tree.branch.clone(),
                created_at: 0,
                last_opened_at: 0,
            })
            .await?;
        if issue.status != IssueStatus::InProgress {
            let project = self.project_of(issue.project_id).await?;
            issue_store::set_status(self, &project, id.iid(), IssueStatus::InProgress).await?;
        }
        let prompt = format!("#{} {}\n\n{}", issue.number, issue.title, issue.body);
        let skills_dir = self.ensure_skill_assets();
        self.ensure_vendor_assets();
        let skill = skills_dir
            .as_deref()
            .and_then(|d| super::bootstrap::skill_pointer(d, &issue.workflow));
        let references = self
            .ensure_prompt_assets()
            .map(|d| super::bootstrap::references_for(issue, &d))
            .unwrap_or_default();
        let version_context = self.version_context_for(issue).await;
        let system_prompt = super::bootstrap::agent_system_prompt(
            issue,
            skill.as_ref(),
            &references,
            &version_context,
        );

        let agent = super::tools::orca_agent(&issue.tool)?;
        let mut sid = conv.claude_session_id.clone();
        let mut sid_source = if sid.is_empty() { "empty" } else { "conv" };
        if sid.is_empty() {
            if let Some(found) = bw_engine::orca::session_id_for_worktree(&tree.path) {
                sid = found;
                sid_source = "jsonl";
            }
        }
        bw_engine::dlog!(
            ok,
            "issue",
            "start issue=#{} tool={} agent={agent} isolated={} \
             worktree={} sid_source={sid_source} sid_prefix={} \
             prompt_chars={} system_chars={} skill={} refs={} log={}",
            issue.number,
            issue.tool,
            tree.isolated,
            tree.path.display(),
            sid.chars().take(8).collect::<String>(),
            prompt.chars().count(),
            system_prompt.chars().count(),
            skill.as_ref().map(|s| s.name.as_str()).unwrap_or("-"),
            references.len(),
            bw_engine::dlog::log_path().display()
        );
        let outcome = match bw_engine::orca::connect() {
            Ok(rt) => {
                // 树刚 provision 完;Orca 打开项目时扫的那份还没有这棵。
                // 刷扫描,不 repo.add。
                if let Err(e) = bw_engine::orca::refresh_worktrees(&rt, ws).await {
                    bw_engine::dlog!(
                        err,
                        "issue",
                        "refresh fail:{e} · {} · repo={}",
                        rt.log_tag(),
                        ws.display()
                    );
                    return Ok(vec![Event::IssueRan {
                        id,
                        ok: false,
                        summary: format!("开工失败:Orca 还没刷到这棵树:{e}"),
                        tool: issue.tool.clone(),
                        embed_url: String::new(),
                    }]);
                }
                bw_engine::dlog!(ok, "issue", "refresh ok repo={}", ws.display());
                let r = if sid.is_empty() {
                    match bw_engine::orca::create_session(
                        &rt,
                        &tree.path,
                        agent,
                        &prompt,
                        &system_prompt,
                    )
                    .await
                    {
                        Ok(verdict) => {
                            if verdict == bw_engine::orca::CreateSessionOutcome::HandleTimeout {
                                let jsonl_before =
                                    bw_engine::orca::session_id_for_worktree(&tree.path).is_some();
                                let settle = bw_engine::orca::HANDLE_TIMEOUT_SETTLE;
                                bw_engine::dlog!(
                                    warn,
                                    "issue",
                                    "handle_timeout: wait {}s before wait_session_id/reveal \
                                     jsonl_before={jsonl_before} worktree={}",
                                    settle.as_secs(),
                                    tree.path.display()
                                );
                                tokio::time::sleep(settle).await;
                                let jsonl_after =
                                    bw_engine::orca::session_id_for_worktree(&tree.path).is_some();
                                bw_engine::dlog!(
                                    ok,
                                    "issue",
                                    "handle_timeout: settle done jsonl_after={jsonl_after} \
                                     next=wait_session_id/reveal"
                                );
                            } else {
                                bw_engine::dlog!(
                                    ok,
                                    "issue",
                                    "create ready, next=wait_session_id/reveal"
                                );
                            }
                            // Claude 的会话文件可能延迟写入；Cursor 不写此文件，不等待。
                            if bw_engine::orca::agent_supports_ensure(agent) {
                                if let Some(found) =
                                    bw_engine::orca::wait_session_id_for_worktree(&tree.path).await
                                {
                                    sid = found;
                                    bw_engine::dlog!(
                                        ok,
                                        "issue",
                                        "wait_session_id found prefix={}",
                                        sid.chars().take(8).collect::<String>()
                                    );
                                } else {
                                    bw_engine::dlog!(
                                        warn,
                                        "issue",
                                        "wait_session_id miss (jsonl 8s 内没落下)"
                                    );
                                }
                            }
                            Ok(())
                        }
                        Err(e) => Err(e),
                    }
                } else {
                    bw_engine::dlog!(
                        ok,
                        "issue",
                        "skip create sid_source={sid_source} (activate existing worktree)"
                    );
                    Ok(())
                };
                if r.is_ok() {
                    if let Err(e) = bw_engine::orca::reveal_tree(&rt, &tree.path).await {
                        bw_engine::dlog!(
                            warn,
                            "issue",
                            "reveal fail:{e} · {} · worktree={}",
                            rt.log_tag(),
                            tree.path.display()
                        );
                    } else {
                        bw_engine::dlog!(ok, "issue", "reveal ok worktree={}", tree.path.display());
                    }
                } else if let Err(e) = &r {
                    bw_engine::dlog!(
                        err,
                        "issue",
                        "{e} · {} · worktree={}",
                        rt.log_tag(),
                        tree.path.display()
                    );
                }
                r
            }
            Err(e) => {
                bw_engine::dlog!(err, "issue", "connect fail:{e}");
                Err(e)
            }
        };
        if !sid.is_empty() {
            let _ = self.remember_session_id(&conv, &sid).await;
        }
        let ok = outcome.is_ok();
        let log = bw_engine::dlog::log_path();
        let summary = match outcome {
            Ok(()) => format!("已在 Orca 里开工,过程看会话屏(对照日志 {})", log.display()),
            Err(e) => format!("开工失败:{e}(对照日志 {})", log.display()),
        };
        Ok(vec![Event::IssueRan {
            id,
            ok,
            summary,
            tool: issue.tool.clone(),
            embed_url: String::new(),
        }])
    }

    pub(super) async fn submit_issue_work(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if !matches!(
            issue.status,
            IssueStatus::InProgress | IssueStatus::InReview | IssueStatus::Blocked
        ) {
            return Err(AppError::Refused(format!(
                "此 Issue 当前为「{}」，尚未开工，没有可提交的改动",
                issue.status.label()
            )));
        }
        let project = self.project_of(issue.project_id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        let tree = worktree::provision_for(&ws, &issue).await?;
        if !tree.isolated {
            return Err(AppError::Refused(
                "这个工作区不是 git 仓,没有分支可提,也就没有可开的 MR".into(),
            ));
        }

        let base = crate::git::head_sha(&ws).await.unwrap_or_default();
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
                "工作树 `{}` 没有相对主检出的新增提交，无可评审的改动",
                tree.path.display()
            )));
        }

        let mut body = format!(
            "Issue #{}「{}」的改动，等待评审。\n\n",
            issue.number, issue.title
        );
        body.push_str(&format!(
            "此分支包含 {commits} 个提交。请在 Workbench 点击「合入并完成」确认完成。"
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
        // 阻塞状态不能直接进入待评审，需先恢复为进行中。
        if issue.status != IssueStatus::InReview {
            if issue.status.can_transition_to(IssueStatus::InProgress) {
                events.extend(self.transition_issue(id, IssueStatus::InProgress).await?);
            }
            events.extend(self.transition_issue(id, IssueStatus::InReview).await?);
        }
        Ok(events)
    }

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
        let settled = to == IssueStatus::Done;
        if settled {
            self.cleanup_issue_worktree(&issue).await;
        }
        let events = vec![Event::IssueTransitioned { id, to, settled }];
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
        issue_store::comment(self, &project, id.iid(), &format!("阻塞原因:{reason}")).await?;
        Ok(vec![Event::IssueBlocked { id }])
    }

    pub(super) async fn set_issue_category(
        &mut self,
        id: IssueId,
        category: Category,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        if issue.kind == IssueKind::Ops {
            return Err(AppError::Refused("周期工作不使用开发类别".into()));
        }
        let project = self.project_of(issue.project_id).await?;
        issue_store::set_category(self, &project, id.iid(), category).await?;
        Ok(vec![Event::IssueCategorySet {
            id,
            category: category.label().to_string(),
        }])
    }

    pub(super) async fn set_issue_assignee(
        &mut self,
        id: IssueId,
        assignee: String,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let project = self.project_of(issue.project_id).await?;
        issue_store::set_assignee(self, &project, id.iid(), &assignee).await?;
        Ok(vec![Event::IssueAssigneeSet { id, assignee }])
    }

    pub(super) async fn edit_issue(
        &mut self,
        id: IssueId,
        title: String,
        body: String,
    ) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        let project = self.project_of(issue.project_id).await?;
        issue_store::edit_issue(self, &project, id.iid(), &title, &body).await?;
        Ok(vec![Event::IssueEdited { id }])
    }

    pub(super) async fn fetch_issue_body(&self, id: IssueId) -> Result<Vec<Event>> {
        let issue = self.issue_or_err(id).await?;
        Ok(vec![Event::IssueBodyFetched {
            id,
            body: issue.body,
        }])
    }

    pub(super) async fn cancel_issue(&mut self, id: IssueId, reason: String) -> Result<Vec<Event>> {
        let why = reason.trim().to_string();
        if why.is_empty() {
            return Err(AppError::Refused("取消 Issue 必须填写原因".into()));
        }
        let issue = self.issue_or_err(id).await?;
        if issue.status == IssueStatus::Cancelled {
            return Ok(vec![Event::IssueCancelled { id }]);
        }
        if !issue.status.can_transition_to(IssueStatus::Cancelled) {
            return Err(AppError::IllegalTransition {
                from: issue.status.label().to_string(),
                to: IssueStatus::Cancelled.label().to_string(),
            });
        }
        let project = self.project_of(issue.project_id).await?;
        issue_store::comment(self, &project, id.iid(), &format!("取消原因:{why}")).await?;
        issue_store::set_status(self, &project, id.iid(), IssueStatus::Cancelled).await?;
        Ok(vec![Event::IssueCancelled { id }])
    }

    /// 跳过常驻分支；工作树不干净时保留。调用方负责确认是否允许清理。
    pub(super) async fn cleanup_issue_worktree(&self, issue: &Issue) {
        let branch = issue_store::work_branch(issue);
        if bw_engine::workspace::is_standing_branch(&branch) {
            return;
        }
        let Ok(ws) = self.workspace_of(issue.project_id).await else {
            return;
        };
        let recorded = self
            .conversation_for_issue(issue.id)
            .await
            .ok()
            .flatten()
            .filter(|c| !c.workspace_path.is_empty())
            .map(|c| std::path::PathBuf::from(&c.workspace_path));
        let Some(tree) =
            bw_engine::workspace::resolve_issue_worktree(&ws, issue.number, recorded.as_deref())
        else {
            return;
        };
        if worktree::remove_if_clean(&ws, &tree).await {
            let branch = issue_store::work_branch(issue);
            if crate::git::branch_exists(&ws, &branch).await {
                let _ = crate::git::delete_merged_branch(&ws, &branch).await;
            }
        }
    }

    async fn version_context_for(&self, issue: &Issue) -> String {
        if issue.workflow != super::OPS1_WORKFLOW {
            return String::new();
        }
        let Ok(project) = self.project_of(issue.project_id).await else {
            return String::new();
        };
        let Ok((plans, released)) = self.collect_version_names(&project).await else {
            return String::new();
        };
        crate::version::context_block(&crate::version::inventory(&plans, &released))
    }

    pub async fn issue_or_err(&self, id: IssueId) -> Result<Issue> {
        let project = self.project_of(id.project_id()).await?;
        issue_store::fetch(self, &project, id.iid()).await
    }

    /// 远端查询失败返回错误，不能将失败转为空列表。
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
            bw_engine::remote::IssueFilter {
                state: None,
                labels: vec![],
            },
        )
        .await
    }

    /// 报到绿区 workbench 仓：`codehub-cli issue create -H green -p z30026659/workbench`。
    /// 人勾了附加且对照日志有文件才 `--attachment` 附上。不碰打开着的被管项目，也不读本机 git origin。
    pub(super) async fn report_workbench_issue(
        &mut self,
        title: String,
        attach_log: bool,
    ) -> Result<Vec<Event>> {
        let title = title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::Refused("问题标题不能空".into()));
        }
        let host = WORKBENCH_REPORT_HOST;
        let path = WORKBENCH_REPORT_PATH;
        bw_engine::dlog!(
            ok,
            "report",
            "workbench report host={host} path={path} attach_log={attach_log}"
        );
        let log = bw_engine::dlog::log_path();
        let attach = attach_log && log.is_file();
        let body = if attach {
            format!("对照日志已附上。本机路径:{}", log.display())
        } else if attach_log {
            format!(
                "人勾了附加日志,但本机对照日志还不存在({}),只建了 issue。",
                log.display()
            )
        } else {
            "人未勾选附加对照日志,只建了 issue。".into()
        };
        let remote = Remote::for_project("codehub", host, path)
            .map_err(|e| AppError::Exec(e.to_string()))?;
        let attachment = if attach { Some(log.as_path()) } else { None };
        let iid = remote
            .create_issue_with_attachment(&title, &body, &[], attachment)
            .await
            .map_err(|e| AppError::Exec(format!("上报 issue 没成:{e}")))?;
        let url = format!(
            "https://{}/{path}/-/issues/{iid}",
            codehub_alias_to_domain(host)
        );
        bw_engine::dlog!(ok, "report", "ok iid={iid} url={url} attached={attach}");
        Ok(vec![Event::WorkbenchIssueReported { iid, url }])
    }
}

pub fn issues_in_week<'a>(issues: &'a [Issue], week: &str) -> Vec<&'a Issue> {
    issues.iter().filter(|i| i.week_of == week).collect()
}

/// 统计待评审 issue，不记录已读状态。
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
        if !i.workflow.is_empty() {
            *counts.entry(i.workflow.clone()).or_default() += 1;
        }
    }
    let mut v: Vec<(String, u32)> = counts.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    v
}
