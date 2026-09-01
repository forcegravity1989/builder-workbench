//! 会话:在 Orca 里开工 / 接回 / 停 / 删。
//!
//! PTY 已封存到 `bw-engine` 的 `legacy_pty/`,开工不再起内嵌终端。桌面 ▶跑 改打
//! Orca 本地 pipe(`orca::create_session` / `reveal_tree`),过程在会话屏的
//! Orca iframe 里看;headless 指挥器仍走阻塞 `run_skill`(自我标注替身)。
//!
//! 会话的**身份**仍落在 `asset_root/sessions/` 的 jsonl(`Conversation` 行:
//! worktree 路径、分支、Claude session id)。Orca create 不回 Claude session id,
//! 开工后从本机 `~/.claude/projects/…/<id>.jsonl` 收最新一条记进会话行。
//! 去会话 / 再开工只切树,不 `ensure`。收不到 id 就不编。

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

    /// 去会话:把 Orca 切到这张活的树。**不改活的状态,不发任何 prompt。**
    ///
    /// 为什么要单独一条、不复用 ▶开工:▶开工 会把活推到「进行中」。人从通知点
    /// 进来看一张**已经在评审中**的活时,要的是「让我看看那棵树」,不是把活拽回
    /// 上一格。切树成功就算成功;树上有没有 issue 那条窗口是其次。
    ///
    /// - 没会话行 → 拒绝,让人点▶开工。
    /// - 先认会话记下的树(旧平级兄弟也算),没有再看新目录,再没有才看旧兄弟。
    ///   **不新建**第二棵 —— 去会话不是开工。
    /// - 一律 `worktree.activate`。不 ensure、不 resume。树上已有的 TUI
    ///   切过去就能看见。
    /// - 不跟当前类别映射走。
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
        let issue = self.issue_or_err(id).await?;
        let ws = self.workspace_of(issue.project_id).await?;
        if !ws.is_dir() {
            return Err(AppError::NoWorkspace(issue.project_id.uuid().to_string()));
        }
        let recorded = if conv.workspace_path.is_empty() {
            None
        } else {
            Some(std::path::PathBuf::from(&conv.workspace_path))
        };
        let Some(path) =
            bw_engine::workspace::resolve_issue_worktree(&ws, issue.number, recorded.as_deref())
        else {
            return Err(AppError::Refused(
                "这张活的工作树找不到了 —— 点「▶开工」再开一棵".into(),
            ));
        };
        let mut sid = conv.claude_session_id.clone();
        if sid.is_empty() {
            if let Some(found) = bw_engine::orca::session_id_for_worktree(&path) {
                sid = found;
            }
        }
        let rt = bw_engine::orca::connect()
            .map_err(|e| AppError::Exec(format!("连 Orca 没成,接不回会话:{e}")))?;
        if let Err(e) = bw_engine::orca::reveal_tree(&rt, &path).await {
            eprintln!(
                "[BW_ORCA] {e} · {} · worktree={}",
                rt.log_tag(),
                path.display()
            );
            return Err(AppError::Exec(format!("在 Orca 里切到这棵树没成:{e}")));
        }
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
