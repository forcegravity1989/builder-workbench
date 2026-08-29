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
use bw_engine::{build_startup_plan, InteractiveExecutor, RunCtx, TuiAgentConfig};

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
        // 幂等:同一个项目里标题一样的、开着的活不建第二张(指挥器重跑靠它)。
        if let Some(existing) = issue_store::find_open_by_title(self, &project, &title).await? {
            return Ok(vec![Event::IssueCreated {
                id: existing.id,
                number: existing.number,
            }]);
        }
        // 业务活打五阶段类别;运作活不打。
        let mut extra: Vec<String> = match (kind, category) {
            (IssueKind::Ops, _) | (_, None) => Vec::new(),
            (_, Some(c)) => vec![format!("bw:category:{}", crate::model::category_key(c))],
        };
        // 排进版本 → 加 bw:plan 标签(issue_store 据此把状态设为 Todo=已排期)。
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
        // 新建活并临时纳入本周 → 发群通知(版本计划那件由 start_week_planning 单独
        // 发,不在这里重复;运作活是 buddy 内部,不发)。
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

        // Open Design = 本机网页内嵌类工具,**不起 CLI**:开工 = 在会话屏的
        // 「Open Design」标签里用内嵌的本机 Open Design 干。
        // 仍给这张活开一棵 worktree + 一条会话(原型产物从 OD 导出后落这棵
        // 树、走「提交并开 MR」),但不 spawn agent、不起 PTY。最远还是
        // 评审中 / 人点完成——和别的工具同一条状态机,没特殊待遇。
        if issue.tool == "open_design" {
            // 已有会话就别建第二条(幂等:重按 ▶开工 不复制会话行)。
            let already = self.conversation_for_issue(id).await?.is_some();
            if !already {
                let ws = self.workspace_of(issue.project_id).await?;
                let tree = worktree::provision(&ws, issue.number).await?;
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
            // 灌系统提示词:让 OD 内部 spawn 的 AI 知道在 buddy 管理下(身份+铁律+
            // 本活挂的技能/references 指针)。OD 独立——它有自己的 skill 体系(skillId),
            // 灌不进 buddy 技能文件,只灌 systemPrompt(技能指针在文本里,OD 的 AI
            // best-effort 读)。探不到 OD / POST 失败不阻断(OD 仍内嵌),如实降级。
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
            let system_prompt =
                super::bootstrap::agent_system_prompt(&issue, skill.as_ref(), &references);
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
                        "(已灌系统提示词,OD 内 AI 知道在 buddy 管理下)"
                    } else {
                        ""
                    }
                ),
                tool: issue.tool.clone(),
                embed_url: String::new(),
            }]);
        }

        let ws = self.workspace_of(issue.project_id).await?;
        // 桌面壳里 ▶跑 走 Orca 本地 pipe(PTY 已封存)。有真实工作区才打;没有
        // 工作区不硬打 Orca —— 退到下面的阻塞替身路(headless 同款,自我标注)。
        // 桌面有工作区但 Orca 没开:人话报错,不静默 mock 成功(见 `run_issue_orca`)。
        if self.pty_enabled && ws.is_dir() {
            return self.run_issue_orca(id, &issue, &ws).await;
        }
        // 有真实工作区就在**这张活自己的 worktree** 里干,和 Orca 那条路一样;
        // 没有工作区就没什么可隔离的,下面走自我标注的替身。
        let tree = if ws.is_dir() {
            let t = worktree::provision(&ws, issue.number).await?;
            if issue.workflow == super::OPS1_WORKFLOW {
                crate::standard::bootstrap::write_missing_on_first_use(&t.path)
                    .map_err(|e| AppError::Exec(format!("给这张活铺指标空壳没成:{e}")))?;
            }
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
        // 摊 vendor 业界 workflow 库(workflow 入口 body 指向这,如 mattpocock-skills)。
        self.ensure_vendor_assets();
        let skill = skills_dir
            .as_deref()
            .and_then(|d| super::bootstrap::skill_pointer(d, &issue.workflow));
        let references = self
            .ensure_prompt_assets()
            .map(|d| super::bootstrap::references_for(&issue, &d))
            .unwrap_or_default();
        let system_prompt =
            super::bootstrap::agent_system_prompt(&issue, skill.as_ref(), &references);
        let mut plan = build_startup_plan(agent, &prompt, &system_prompt, &run_dir)
            .map_err(|e| AppError::Exec(e.to_string()))?;
        // 挂整个 asset_root 给 agent 读:技能 + references + vendor 库都在下面。
        super::bootstrap::allow_skills_dir(&mut plan, &self.asset_root);
        let ctx = RunCtx {
            project: issue.project_id.uuid(),
            workflow: uuid::Uuid::nil(),
        };

        // 没有真实工作区的项目走自我标注的替身:产出带【mock】字样,不冒充
        // 真的干过活。有工作区但没开 PTY(指挥器、headless)时也走这条。
        let out = if tree.is_some() {
            self.executor.run_skill(&plan, &ctx).await
        } else {
            bw_engine::MockInteractiveExecutor::new()
                .run_skill(&plan, &ctx)
                .await
        };
        match out {
            Ok(o) if o.completed => {
                // 最远到「评审中」。这一步不是人点的,所以到此为止。
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

    /// 桌面 ▶跑 的 Orca 分支。开/复用 worktree(走 resolve,旧平级兄弟接着用)→
    /// upsert 会话行(workspace_path 写实际用的路径)→ 推进行中 → connect Orca →
    /// 刷扫描(刚 add 的树才能被 `path:` 选到,不 `repo.add`)→ 没 id 才 create;
    /// 有 id / create 完了只切树,不 ensure。
    /// 成功回执「已在 Orca 里开工」。**Orca 没开 / 连不上:人话报错,不静默 mock
    /// 成功**;桌面有工作区才进这条。
    /// 系统提示词仍走 `bootstrap::agent_system_prompt`(身份+铁律+技能指针),不新模板。
    /// Orca 不吃 LaunchPlan,不 attach_session_hook(那是给 PTY 收割 `--resume` id 的,
    /// Orca 自己认 Claude session id)—— 技能靠提示词里的绝对路径让 agent 自己读。
    async fn run_issue_orca(
        &mut self,
        id: IssueId,
        issue: &Issue,
        ws: &std::path::Path,
    ) -> Result<Vec<Event>> {
        // 开/复用 worktree:resolve 会接住旧平级兄弟,不建第二棵新树。
        let tree = worktree::provision(ws, issue.number).await?;
        if issue.workflow == super::OPS1_WORKFLOW {
            crate::standard::bootstrap::write_missing_on_first_use(&tree.path)
                .map_err(|e| AppError::Exec(format!("给这张活铺指标空壳没成:{e}")))?;
        }
        // upsert 会话行:workspace_path 写实际用的路径(可能是旧兄弟)。幂等:已有就返回既有行。
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
        // 先推进行中 —— 界面上立刻看得出它开工了。
        if issue.status != IssueStatus::InProgress {
            let project = self.project_of(issue.project_id).await?;
            issue_store::set_status(self, &project, id.iid(), IssueStatus::InProgress).await?;
        }
        // 系统提示词:身份+四铁律+技能/references 指针(和 OD 分支、阻塞路同一个函数)。
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
        let system_prompt =
            super::bootstrap::agent_system_prompt(issue, skill.as_ref(), &references);

        let agent = super::tools::orca_agent(&issue.tool)?;
        let mut sid = conv.claude_session_id.clone();
        if sid.is_empty() {
            if let Some(found) = bw_engine::orca::session_id_for_worktree(&tree.path) {
                sid = found;
            }
        }
        let outcome = match bw_engine::orca::connect() {
            Ok(rt) => {
                // 树刚 provision 完;Orca 打开项目时扫的那份还没有这棵。
                // 刷扫描,不 repo.add。
                if let Err(e) = bw_engine::orca::refresh_worktrees(&rt, ws).await {
                    eprintln!(
                        "[BW_ORCA] 刷扫描没成:{e} · {} · repo={}",
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
                        Ok(()) => {
                            // Claude 的 jsonl 可能晚几拍落到盘,短等再收 id。
                            // Cursor 不写这份文件,空等满 8 秒才回「开工成功」。
                            if bw_engine::orca::agent_supports_ensure(agent) {
                                if let Some(found) =
                                    bw_engine::orca::wait_session_id_for_worktree(&tree.path).await
                                {
                                    sid = found;
                                }
                            }
                            Ok(())
                        }
                        Err(e) => Err(e),
                    }
                } else {
                    Ok(())
                };
                // 开成了(含句柄超时当成功)或树上已有会话:切树,网页才跟得上。
                // 切树失败只打日志,不把已经起来的窗打成开工失败。
                if r.is_ok() {
                    if let Err(e) = bw_engine::orca::reveal_tree(&rt, &tree.path).await {
                        eprintln!(
                            "[BW_ORCA] 窗已在,切树没跟上:{e} · {} · worktree={}",
                            rt.log_tag(),
                            tree.path.display()
                        );
                    }
                } else if let Err(e) = &r {
                    eprintln!(
                        "[BW_ORCA] {e} · {} · worktree={}",
                        rt.log_tag(),
                        tree.path.display()
                    );
                }
                r
            }
            Err(e) => Err(e),
        };
        if !sid.is_empty() {
            let _ = self.remember_session_id(&conv, &sid).await;
        }
        let ok = outcome.is_ok();
        let summary = match outcome {
            Ok(()) => "已在 Orca 里开工,过程看会话屏".to_string(),
            Err(e) => format!("开工失败:{e}"),
        };
        Ok(vec![Event::IssueRan {
            id,
            ok,
            summary,
            tool: issue.tool.clone(),
            embed_url: String::new(),
        }])
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
        // 阻塞原因写进 issue 评论 —— 不动正文,结构化产出挂评论。
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
            return Err(AppError::Refused("运作活没有五阶段类别".into()));
        }
        let project = self.project_of(issue.project_id).await?;
        issue_store::set_category(self, &project, id.iid(), category).await?;
        Ok(vec![Event::IssueCategorySet {
            id,
            category: category.label().to_string(),
        }])
    }

    /// 改责任人(codehub assignee)。空串 = 取消指派。走 codehub API,
    /// 不在本地另存一套 —— 重启读回一致(四铁律一)。
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

    /// 改 issue 标题与正文(codehub issue update)。详情弹窗双击编辑后发这条。
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

    /// 作废:原因进评论,打取消标签并关掉远端 issue。不是完成。
    pub(super) async fn cancel_issue(&mut self, id: IssueId, reason: String) -> Result<Vec<Event>> {
        let why = reason.trim().to_string();
        if why.is_empty() {
            return Err(AppError::Refused("作废必须写原因".into()));
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

    /// 收掉这张活的 worktree(+ 分支)。结清(Done)后**无条件**调 —— 只要
    /// worktree 干净就删分支;脏的(有未提交的劳动成果)原样留着。刀3-fix:
    /// `merge_and_settle` 和 `transition_issue` 两条结清路都走这同一个收尾,
    /// 不再各自判 `merged&&main_has_it`(那条靠 lossy 的 `issue.branch`,恒空)。
    ///
    /// 不能只看新路径 `.bw/worktrees/issue-<n>`:旧活记的是平级兄弟,结清时要
    /// 能收掉那棵。先看会话行记下的路径,再看新目录,再看旧兄弟(走底座的
    /// `resolve_issue_worktree`)。
    pub(super) async fn cleanup_issue_worktree(&self, issue: &Issue) {
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
        // worktree 干净才收(脏的有未提交的劳动成果,不删)。
        if worktree::remove_if_clean(&ws, &tree).await {
            // worktree 收掉了,顺手删分支(只删 merged 的;未合的 `git -d` 会
            // 拒绝,不强删 —— 留着也不影响)。分支名从 issue.number 现算,
            // 不靠 lossy 的 `issue.branch`。
            let branch = bw_engine::github::issue_branch(issue.number);
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
            bw_engine::remote::IssueFilter {
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
        if !i.workflow.is_empty() {
            *counts.entry(i.workflow.clone()).or_default() += 1;
        }
    }
    let mut v: Vec<(String, u32)> = counts.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    v
}
