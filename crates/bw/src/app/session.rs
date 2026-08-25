//! 会话:内嵌终端的 PTY 生命周期。
//!
//! 分工看清楚了就不会乱:
//!
//! - **`claude_conversation` 表**存的是会话的**身份**——buddy 自己的
//!   `ConversationId`、claude CLI 回传的 `--resume` id、固定的 worktree 路径、
//!   分支名。进程死了它还在,重启后拿它把会话接回来。
//! - **`TerminalManager`(纯内存)**存的是**进程**——子进程句柄、字节流、当前
//!   终端尺寸。进程死了就没了,重启后不存在,也不该存在。
//!
//! PTY 只在桌面壳里开([`App::with_pty`]);指挥器和别的 headless 场景一律走
//! 阻塞的 `run_skill`——没有界面去渲染字节流,起个 PTY 只会留下一个没人读的
//! 子进程。

use super::worktree;
use super::{issue_store, App, AppError, Result};
use crate::command::Event;
use crate::model::{ConversationId, IssueId, IssueStatus};
use bw_engine::interactive_cli::PtyInput;
use bw_engine::{build_resume_plan, build_startup_plan, ConversationMeta, RunCtx};

impl App {
    /// 桌面壳开 PTY。开了之后 ▶跑 不再阻塞等执行器返回,而是把子进程挂进
    /// [`bw_engine::TerminalManager`],字节流交给会话屏渲染。
    pub fn with_pty(mut self) -> Self {
        self.pty_enabled = true;
        self
    }

    /// 内嵌终端这一跳:把各会话缓冲里的字节取出来,交给界面按会话 id 路由。
    pub fn drain_pty_events(&mut self) -> Vec<(ConversationId, Vec<u8>)> {
        // 底座按裸 UUID 路由,出了这一层就包回语义类型 —— 转换只发生在这儿,
        // 上面的用例代码永远只见 `ConversationId`。
        let out = self
            .terminal
            .drain_events()
            .into_iter()
            .map(|(id, bytes)| (ConversationId::from_uuid(id), bytes))
            .collect();
        self.reap_ended_ptys();
        out
    }

    /// 进程退了就把 live 清掉,缓冲留下给挂件回放。没订户时也要收,
    /// 否则开工会一直灰着。
    pub fn reap_ended_ptys(&mut self) {
        let ended = self
            .pty_ended
            .lock()
            .map(|mut v| std::mem::take(&mut *v))
            .unwrap_or_default();
        for id in ended {
            self.terminal.mark_ended(id);
        }
    }

    /// 挂件订上之后要第一屏:drain 过的字节还在 replay 里。
    pub fn pty_snapshot(&self, id: ConversationId) -> Vec<u8> {
        self.terminal.snapshot(id.uuid())
    }

    /// 回放整段第一屏,并清掉待发批次(已经含在 snapshot 里,再 drain 会双写)。
    pub fn pty_ack_replay(&self, id: ConversationId) -> Vec<u8> {
        let snap = self.pty_snapshot(id);
        self.terminal.drain_one(id.uuid());
        snap
    }

    /// 这个会话的 PTY 还活着没有。左列「运行中 / 空闲」两态里的那一半靠它。
    pub fn pty_live(&self, id: ConversationId) -> bool {
        self.terminal.is_live(id.uuid())
    }

    pub(super) async fn terminal_input(
        &mut self,
        conversation_id: ConversationId,
        bytes: Vec<u8>,
    ) -> Result<Vec<Event>> {
        self.terminal
            .input(conversation_id.uuid(), PtyInput::Bytes(bytes));
        Ok(vec![])
    }

    pub(super) async fn terminal_resize(
        &mut self,
        conversation_id: ConversationId,
        cols: u16,
        rows: u16,
    ) -> Result<Vec<Event>> {
        self.terminal.note_fit_size(cols, rows);
        self.terminal.resize(conversation_id.uuid(), cols, rows);
        Ok(vec![])
    }

    /// ■停止:关掉这件活的 PTY。
    ///
    /// **状态原地不动**。停下来不是失败也不是完成,这张活还在「进行中」,人
    /// 随时能再点▶跑接回去(有 `--resume` id 就精确接回那次对话)。
    pub(super) async fn cancel_run(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let Some(conv) = self.conversation_for_issue(id).await? else {
            return Ok(vec![Event::RunCancelled {
                id,
                was_live: false,
            }]);
        };
        let was_live = self.terminal.is_live(conv.id.uuid());
        self.terminal.close(conv.id.uuid());
        Ok(vec![Event::RunCancelled { id, was_live }])
    }

    /// 人确认后删本机会话:停 PTY、收 worktree(脏的也收)、删 jsonl。
    /// 远端 issue 不动。
    pub(super) async fn delete_session(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let Some(conv) = self.conversation_for_issue(id).await? else {
            return Err(AppError::Refused("这张活没有本机会话可删".into()));
        };
        self.terminal.close(conv.id.uuid());
        let mut note = String::from("本机会话行删了");
        let ws = self.workspace_of(id.project_id()).await?;
        let tree = std::path::PathBuf::from(&conv.workspace_path);
        if tree.is_dir() && tree != ws {
            if let Some(s) = tree.to_str() {
                match crate::git::worktree_remove_force(&ws, s).await {
                    Ok(()) => note.push_str(",工作树收了"),
                    Err(e) => note.push_str(&format!(",工作树没收掉:{e}")),
                }
            }
        }
        if !conv.branch_name.is_empty() && crate::git::branch_exists(&ws, &conv.branch_name).await {
            let _ = crate::git::delete_merged_branch(&ws, &conv.branch_name).await;
        }
        let slug = self.slug_of(id.project_id()).await?;
        crate::local::SessionStore::remove_issue(&self.asset_root, &slug, id.iid())?;
        Ok(vec![Event::SessionDeleted { id, note }])
    }

    /// 把上次那场会话接回来看看。**不改活的状态,不发任何 prompt。**
    ///
    /// 为什么要单独一条命令、不复用 ▶开工:▶开工 会把活推到「进行中」。而人从
    /// 通知点进来看一张**已经在评审中**的活时,要的是「让我看看 agent 都干了
    /// 什么」,不是把这张活拽回上一格。`claude --resume <id>` 本身也确实什么都
    /// 不做 —— 它不带 prompt、不带 `--append-system-prompt`,只是重新进入那场
    /// 对话等人说话,既不花钱也不会动手。
    ///
    /// 这条是**从 V3 掉下来的行为**:V3 里「选中一张活」就等于接回它的会话,
    /// V4 的 `SelectSession` 退化成了纯切视图,于是点进去是一片空白。
    pub(super) async fn reopen_session(&mut self, id: IssueId) -> Result<Vec<Event>> {
        if !self.pty_enabled {
            return Err(AppError::Refused("这个进程没开内嵌终端,接不回会话".into()));
        }
        let Some(mut conv) = self.conversation_for_issue(id).await? else {
            return Err(AppError::Refused(
                "这张活还没有过会话 —— 点「▶开工」起一场".into(),
            ));
        };
        // 已经开着就什么都不做。再 attach 一次会先把旧的整个进程组 kill 掉,
        // 人跟 agent 谈到一半的上下文就没了。
        if self.terminal.is_live(conv.id.uuid()) {
            return Ok(vec![Event::SessionReopened {
                issue_id: id,
                live: true,
            }]);
        }
        // 先收一次 hook 落盘的 id。没有 `--resume` id 就不要 `claude --continue`:
        // 工作区里没有可接的对话时,Claude 会先刷欢迎再红字
        // 「No conversation found to continue」,人还没点开工却像坏了一场。
        // 空 id 的接回是空终端,等人点▶开工(那条会灌系统提示词重开)。
        self.harvest_claude_session_ids().await;
        if let Ok(Some(fresh)) = self.conversation_for_issue(id).await {
            conv = fresh;
        }
        if conv.claude_session_id.is_empty() {
            return Ok(vec![Event::SessionReopened {
                issue_id: id,
                live: false,
            }]);
        }
        let issue = self.issue_or_err(id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        if !ws.is_dir() {
            return Err(AppError::NoWorkspace(issue.project_id.uuid().to_string()));
        }
        let tree = worktree::provision(&ws, issue.number).await?;
        // 照活上记的工具走 —— 不许悄悄换(见 `tools::agent_for`)。
        let agent = super::tools::agent_for(&issue.tool)?;
        let mut plan = build_resume_plan(agent, Some(conv.claude_session_id.as_str()), &tree.path)
            .map_err(|e| AppError::Exec(e.to_string()))?;
        super::bootstrap::allow_skills_dir(&mut plan, &self.asset_root);
        super::bootstrap::attach_session_hook(
            &mut plan,
            &self.asset_root,
            issue.project_id,
            issue.number,
        );

        let meta = ConversationMeta {
            conversation_id: conv.id.uuid(),
            issue_id: id.uuid(),
            claude_session_id: conv.claude_session_id.clone(),
            workspace_path: tree.path.clone(),
            branch_name: tree.branch,
        };
        let (bytes_tx, input_rx) = self.terminal.attach(conv.id.uuid(), meta, None);
        let ctx = RunCtx {
            project: issue.project_id.uuid(),
            workflow: uuid::Uuid::nil(),
        };
        self.spawn_pty_run(conv.id, plan, bytes_tx, input_rx, ctx);
        Ok(vec![Event::SessionReopened {
            issue_id: id,
            live: false,
        }])
    }

    /// ▶跑 的 PTY 分支。返回 `Ok(true)` 表示已经挂起来了,调用方到此为止。
    ///
    /// 和阻塞那条路最大的区别:**这里不等执行器返回**。子进程在后台跑,状态
    /// 停在「进行中」,推「评审中」是会话收尾那一下的事——所以这条路径下
    /// ▶跑 更不可能把活推到「完成」。
    pub(super) async fn run_issue_pty(&mut self, id: IssueId) -> Result<bool> {
        if !self.pty_enabled {
            return Ok(false);
        }
        let issue = self.issue_or_err(id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        // 工作区目录压根不在,就别起终端 —— 在一个不存在的目录里 spawn
        // claude,人看到的是一屏报错。退回阻塞那条路,那边会用自我标注的替身
        // 跑一遍,产出带【mock】字样,谁都不会误以为它真干了活。
        if !ws.is_dir() {
            return Ok(false);
        }

        // 这张活的终端还开着就别重开。`attach` 第一件事是 close 掉同 id 的旧
        // 会话(整个进程组被 kill)—— 人跟 agent 谈到一半的上下文就这么没了,
        // 还没有任何提示。顶栏「▶开工」和「■停止」是挨着放的,误点很容易。
        // (光接回上次那场对话不必走这条路,那是 `reopen_session`。)
        if let Some(existing) = self.conversation_for_issue(id).await? {
            if self.terminal.is_live(existing.id.uuid()) {
                return Err(AppError::Refused(
                    "这张活的终端还开着。要重开先点「■ 停止」——重开是从头一次新对话,不是接着刚才那段聊。"
                        .into(),
                ));
            }
        }

        // agent 不在人的主检出里干活,在**这张活自己的一棵 worktree** 里干,
        // 分支是 `bw/issue-<号>`。两张活同时开工也就互不干扰了。分支名不是拼
        // 出来的:worktree 真的在这个分支上,`git rev-parse --abbrev-ref HEAD`
        // 一对就对得上。
        let tree = worktree::provision(&ws, issue.number).await?;
        if issue.workflow == super::OPS1_WORKFLOW {
            crate::standard::bootstrap::write_missing_on_first_use(&tree.path)
                .map_err(|e| AppError::Exec(format!("给这张活铺指标空壳没成:{e}")))?;
        }

        let conv = self
            .upsert_conversation(&crate::model::Conversation {
                id: ConversationId::new(),
                project_id: issue.project_id,
                issue_id: id,
                claude_session_id: String::new(),
                workspace_path: tree.path.display().to_string(),
                branch_name: tree.branch.clone(),
                created_at: 0,
                last_opened_at: 0,
            })
            .await?;
        // 界面上这张活的分支从这里来。刀3:branch 不再写库(没有 issue 表),
        // 由 issue 号决定 (bw/issue-<号>),worktree::provision 保证它对得上。

        let prompt = format!("#{} {}\n\n{}", issue.number, issue.title, issue.body);
        // 剧本在 buddy 自己的技能目录里,不在用户的仓里。系统提示词只拿到
        // 名字 + 一句话 + 路径,正文让 agent 自己按需读。
        let skills_dir = self.ensure_skill_assets();
        // 摊 vendor 业界 workflow 库(workflow 入口 body 指向这)。
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
        // 有 `--resume` id 就精确接回那一次对话,不是模糊地接「最近一次」。
        let agent = super::tools::agent_for(&issue.tool)?;
        let mut plan = if conv.claude_session_id.is_empty() {
            build_startup_plan(agent, &prompt, &system_prompt, &tree.path)
        } else {
            build_resume_plan(agent, Some(&conv.claude_session_id), &tree.path)
        }
        .map_err(|e| AppError::Exec(e.to_string()))?;
        // 挂整个 asset_root 给 agent 读:技能 + references + vendor 库都在下面。
        super::bootstrap::allow_skills_dir(&mut plan, &self.asset_root);
        super::bootstrap::attach_session_hook(
            &mut plan,
            &self.asset_root,
            issue.project_id,
            issue.number,
        );

        let meta = ConversationMeta {
            conversation_id: conv.id.uuid(),
            issue_id: id.uuid(),
            claude_session_id: conv.claude_session_id.clone(),
            workspace_path: tree.path.clone(),
            branch_name: tree.branch,
        };
        let (bytes_tx, input_rx) = self.terminal.attach(conv.id.uuid(), meta, None);

        let ctx = RunCtx {
            project: issue.project_id.uuid(),
            workflow: uuid::Uuid::nil(),
        };
        self.spawn_pty_run(conv.id, plan, bytes_tx, input_rx, ctx);

        if issue.status != IssueStatus::InProgress {
            let project = self.project_of(issue.project_id).await?;
            issue_store::set_status(self, &project, id.iid(), IssueStatus::InProgress).await?;
        }
        Ok(true)
    }

    fn spawn_pty_run(
        &self,
        conversation_id: ConversationId,
        plan: bw_engine::LaunchPlan,
        bytes_tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
        input_rx: tokio::sync::mpsc::UnboundedReceiver<PtyInput>,
        ctx: RunCtx,
    ) {
        let executor = self.executor.clone();
        let ended = self.pty_ended.clone();
        let err_tx = bytes_tx.clone();
        let cid = conversation_id.uuid();
        tokio::spawn(async move {
            let r = executor
                .run_skill_pty(&plan, &ctx, bytes_tx, input_rx)
                .await;
            if let Err(e) = r {
                let _ = err_tx.send(format!("\r\n[BW] 开工失败:{e}\r\n").into_bytes());
                tokio::time::sleep(std::time::Duration::from_millis(80)).await;
            }
            if let Ok(mut v) = ended.lock() {
                v.push(cid);
            }
        });
    }

    /// SessionStart hook 把 claude 的 `--resume` id 写进 runs 目录;这里收上来
    /// 追加进 jsonl。没写出就跳过,不编一个 id。
    pub async fn harvest_claude_session_ids(&self) {
        let root = self.asset_root.join("claude").join("runs");
        let Ok(entries) = std::fs::read_dir(&root) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                continue;
            };
            let Some((pid_s, iid_s)) = name.rsplit_once('_') else {
                continue;
            };
            let Ok(pid) = uuid::Uuid::parse_str(pid_s) else {
                continue;
            };
            let Ok(iid) = iid_s.parse::<u32>() else {
                continue;
            };
            let sid_path = path.join("session_id.txt");
            let Ok(raw) = std::fs::read_to_string(&sid_path) else {
                continue;
            };
            let sid = raw.trim();
            if sid.is_empty() {
                continue;
            }
            let issue_id = IssueId::from_remote(crate::model::ProjectId::from_uuid(pid), iid);
            let Ok(Some(mut conv)) = self.conversation_for_issue(issue_id).await else {
                continue;
            };
            if conv.claude_session_id == sid {
                continue;
            }
            conv.claude_session_id = sid.to_string();
            let _ = self.append_conversation(&conv).await;
        }
    }
}
