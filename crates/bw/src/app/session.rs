//! 会话:在 Orca 里开工 / 接回 / 停 / 删。
//!
//! PTY 已封存到 `bw-engine` 的 `legacy_pty/`,开工不再起内嵌终端。桌面 ▶跑 改打
//! Orca 本地 pipe(`orca::create_session` / `ensure_session`),过程在会话屏的
//! Orca iframe 里看;headless 指挥器仍走阻塞 `run_skill`(自我标注替身)。
//!
//! 会话的**身份**仍落在 `asset_root/sessions/` 的 jsonl(`Conversation` 行:
//! worktree 路径、分支、Claude session id)。Orca create 不回 Claude session id,
//! 开工后从本机 `~/.claude/projects/…/<id>.jsonl` 收最新一条记进会话行;再开工
//! 走 `ensure`。收不到就不编 id,下次再收。

use super::worktree;
use super::{App, AppError, Result};
use crate::command::Event;
use crate::model::IssueId;

impl App {
    /// 桌面壳标记:这个进程跑在桌面里,▶跑 走 Orca 本地 pipe(不是 PTY,PTY 已
    /// 封存)。headless 指挥器不开,▶跑 走阻塞 `run_skill`。字段名沿用 `pty_*`
    /// 是为了不大面积改调用方(底座里 PTY 那套已整包封存,这个名字现在只是个门闩)。
    pub fn with_pty(mut self) -> Self {
        self.pty_enabled = true;
        self
    }

    /// ■停止:停本机记账。PTY 已封存,没有真进程可关 —— `was_live` 如实是 false
    /// (没真实进程信号就当空闲,不假 live)。**状态原地不动**,人随时能再点▶跑接回。
    pub(super) async fn cancel_run(&mut self, id: IssueId) -> Result<Vec<Event>> {
        // 确认有会话行(没有也无所谓,was_live 照样 false)。不 terminal.close —— 没那东西了。
        let _ = self.conversation_for_issue(id).await.ok().flatten();
        Ok(vec![Event::RunCancelled {
            id,
            was_live: false,
        }])
    }

    /// 人确认后删本机会话:停本机记账、force 收 worktree(用会话记下的路径)、
    /// 删 jsonl。远端 issue 不动。PTY 已封存,不 terminal.close。
    pub(super) async fn delete_session(&mut self, id: IssueId) -> Result<Vec<Event>> {
        let Some(conv) = self.conversation_for_issue(id).await? else {
            return Err(AppError::Refused("这张活没有本机会话可删".into()));
        };
        let mut note = String::from("本机会话行删了");
        let ws = self.workspace_of(id.project_id()).await?;
        // 会话行记的路径(旧活可能是平级兄弟)—— force 收,脏的也收(人确认删了)。
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

    /// 把上次那场会话在 Orca 桌面里点出来。**不改活的状态,不发任何 prompt。**
    ///
    /// 为什么要单独一条、不复用 ▶开工:▶开工 会把活推到「进行中」。而人从通知点
    /// 进来看一张**已经在评审中**的活时,要的是「让我看看 agent 都干了什么」,
    /// 不是把这张活拽回上一格。Orca 的 `ensureAgentSession` 也只是把焦点落到那条
    /// agent tab,不带 prompt、不花钱、不动手。
    ///
    /// - 没会话行 → 拒绝,让人点▶开工。
    /// - 没 `session_id` → 先从这棵 worktree 的本机 Claude jsonl 收最新一条;
    ///   收到就 ensure 并记回会话行。收不到不编 id,返回没 live,空着等人开工。
    /// - 有 id → connect + ensure_session(worktree=resolve 后的真实路径, agent, id)。
    ///   worktree::provision 会复用已有活树(含旧平级兄弟),不建第二棵新树。
    pub(super) async fn reopen_session(&mut self, id: IssueId) -> Result<Vec<Event>> {
        if !self.pty_enabled {
            return Err(AppError::Refused(
                "这个进程没开桌面 run 路径,接不回会话".into(),
            ));
        }
        let Some(conv) = self.conversation_for_issue(id).await? else {
            return Err(AppError::Refused(
                "这张活还没有过会话 —— 点「▶开工」起一场".into(),
            ));
        };
        // 没有 Claude session id 就别 ensure —— Orca 要显式指定 id,不会按 worktree
        // 自己找;编一个 id 出去只会 ensure 到一个不存在的会话。空着等人开工。
        let issue = self.issue_or_err(id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        if !ws.is_dir() {
            return Err(AppError::NoWorkspace(issue.project_id.uuid().to_string()));
        }
        let tree = worktree::provision(&ws, issue.number).await?;
        let mut sid = conv.claude_session_id.clone();
        if sid.is_empty() {
            if let Some(found) = bw_engine::orca::session_id_for_worktree(&tree.path) {
                sid = found;
            }
        }
        if sid.is_empty() {
            return Ok(vec![Event::SessionReopened {
                issue_id: id,
                live: false,
            }]);
        }
        let agent = super::tools::orca_agent(&issue.tool)?;
        let rt = bw_engine::orca::connect()
            .map_err(|e| AppError::Exec(format!("连 Orca 没成,接不回会话:{e}")))?;
        bw_engine::orca::ensure_session(&rt, &tree.path, agent, &sid)
            .await
            .map_err(|e| AppError::Exec(format!("在 Orca 里点回会话没成:{e}")))?;
        if sid != conv.claude_session_id {
            self.remember_session_id(&conv, &sid).await?;
        }
        Ok(vec![Event::SessionReopened {
            issue_id: id,
            live: false,
        }])
    }

    /// 把 Claude session id 追加进会话行。不编 id,只记已经在盘上 / Orca 里的。
    pub(super) async fn remember_session_id(
        &self,
        conv: &crate::model::Conversation,
        sid: &str,
    ) -> Result<()> {
        if sid.is_empty() || conv.claude_session_id == sid {
            return Ok(());
        }
        let mut next = conv.clone();
        next.claude_session_id = sid.to_string();
        let slug = self.slug_of(conv.project_id).await?;
        crate::local::SessionStore::append(&self.asset_root, &slug, &next)?;
        Ok(())
    }
}
