//! 编排:所有用例与守卫都在这一层。
//!
//! 界面发一条 [`Command`],这里执行它,回一串 [`Event`]。守卫也在这里——
//! 状态能不能转、活能不能结第二次、周计划文件在不在,都在动库/动仓之前问清楚。
//!
//! 一屏一屏地看,这层的分工是:
//!
//! - [`project`] —— 接入、改名片、配项目群
//! - [`plan`] —— 开始本周、排期、发版本、缓存对账
//! - [`issue`] —— 建活、▶跑、状态转移
//! - [`bootstrap`] —— 规范铺底与对账
//! - [`chat_notify`] —— 三件事同步进项目群(发出去就算完,不记账)
//! - [`backfill`] —— 老项目历史回填(资产盘点的首次模式)
//! - [`ops`] —— 三张运作活:周计划、资产盘点、规范铺底
//! - [`session`] —— 内嵌终端的 PTY 生命周期
//! - [`tools`] —— 开工工具映射与探活
//! - [`worktree`] —— 每张活一棵自己的 worktree 与分支
//! - [`health`] —— 三条判据的现算

mod backfill;
mod bootstrap;
mod chat_notify;
/// 指标采集:起脚本、传时间窗、读标准输出的 JSON。壳那边「立即采集」直接调它。
pub mod collect;
mod health;
mod issue;
/// codehub issue 持久化映射层(数据层迁移刀2)。纯加性,未接线 app 层调用方,
/// 等刀3 切远端正本时再用——在那之前靠模块级 `#[allow(dead_code)]` 压住警告。
mod issue_store;
mod ops;
mod plan;
mod progress;
mod project;
mod session;
mod tools;
mod worktree;

pub use bootstrap::{
    agent_system_prompt, references_for, skill_pointer, ReferencePointer, SkillPointer,
};
pub use health::{collect_health_inputs, read_metric_readings, MetricReading};
pub use issue::{count_unseen, issues_in_week, workflow_usage};
pub use ops::{
    ops1_title, skill_slug, workflow_label, OPS1_WORKFLOW, OPS2_WORKFLOW, OPS3_WORKFLOW,
};
pub use progress::{ProgressLine, StepState};

use crate::command::{Command, Event};
use crate::local::{ProjectRegistry, SessionStore, Settings};
use crate::model::{Conversation, ProjectId};
use crate::repo::RepoFileError;
use bw_engine::remote::{Remote, RemoteError};
use bw_engine::{InteractiveExecutor, TerminalManager};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// 远端工厂:从项目行造一个 `Remote`。默认走 `Remote::for_project`(真
/// codehub/gh);`real_demo_v4` / 测试注入一份返回**共享的** `Remote::Mock`
/// (同一个 `Arc<Mutex<MockState>>`),让「建活 → 列活 → 改状态 → 关」一整圈
/// 共享同一份内存状态,和真远端一次会话连续操作的行为一致。桌面壳不调这个
/// 口子,走默认的真 codehub/gh。
pub(crate) type RemoteFactory =
    Box<dyn Fn(&crate::model::Project) -> std::result::Result<Remote, RemoteError> + Send + Sync>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    RepoFile(#[from] RepoFileError),
    #[error("git:{0}")]
    Git(#[from] crate::git::GitError),
    #[error("执行器:{0}")]
    Exec(String),
    #[error("找不到项目 {0}")]
    NoSuchProject(String),
    #[error("找不到这张活")]
    NoSuchIssue,
    #[error("{0} 还没有配工作区,这一步需要一个真实的仓")]
    NoWorkspace(String),
    /// 状态机不许这么转。如实弹回,不悄悄改成一个合法的转移。
    #[error("不能从「{from}」转到「{to}」")]
    IllegalTransition { from: String, to: String },
    #[error("{0}")]
    Refused(String),
}

pub type Result<T> = std::result::Result<T, AppError>;

/// V4 的编排大脑。
pub struct App {
    /// 工作区根目录。项目没单独配路径时,仓就在 `<root>/<slug>`。
    pub(crate) workspaces_root: PathBuf,
    /// 干活入口的后端。没配真实工作区的项目用自我标注的替身
    /// ([`bw_engine::MockInteractiveExecutor`]),产出带【mock】字样。
    pub(crate) executor: Arc<dyn InteractiveExecutor>,
    /// 活着的 PTY 会话。纯内存,进程死了就没了 —— 会话的**身份**在
    /// `asset_root/sessions/` 里的 jsonl 文件中,那才是重启后接得回来的东西。
    pub(crate) terminal: TerminalManager,
    /// 桌面壳开、headless 不开。见 [`App::with_pty`]。
    pub(crate) pty_enabled: bool,
    /// 长命令边做边报的口子。桌面壳接上,headless 不接。见
    /// [`progress`](crate::app::progress) —— 只为让人看得见,不承担账目。
    pub(crate) progress: Option<tokio::sync::broadcast::Sender<ProgressLine>>,
    /// buddy 自己的资产目录 —— 技能库摊在这儿(`<asset_root>/skills/`),
    /// 项目注册表(`<asset_root>/projects.toml`)、全局设置
    /// (`<asset_root>/settings.toml`)、会话记录
    /// (`<asset_root>/sessions/<slug>/<iid>.jsonl`)也都在这儿。
    /// **不在任何一个用户项目的仓里**:用户的 `.gitignore` 怎么写不该由 buddy
    /// 决定,而 buddy 自带的剧本每个项目都一样,没有复制 N 份的道理。
    pub(crate) asset_root: PathBuf,
    /// 远端工厂。issue_store 等内部模块经 [`App::remote_for`] 拿远端,统一经
    /// 这里派发 —— 这也是 mock 注入的唯一口子。
    pub(crate) remote_factory: RemoteFactory,
    /// PTY 子进程退出后由后台任务塞进来,内核节拍里收掉 live 标记。
    pub(crate) pty_ended: Arc<Mutex<Vec<uuid::Uuid>>>,
}

impl App {
    pub fn new(
        workspaces_root: impl Into<PathBuf>,
        executor: Arc<dyn InteractiveExecutor>,
    ) -> Self {
        let workspaces_root = workspaces_root.into();
        Self {
            // 默认落在工作区根目录旁边的 `.bw-assets/`。桌面壳会用
            // [`App::with_asset_root`] 换成库文件旁边那份;headless 例子就用
            // 这个默认值,跑完随临时目录一起没。
            asset_root: workspaces_root.join(".bw-assets"),
            workspaces_root,
            executor,
            terminal: TerminalManager::new(),
            pty_enabled: false,
            progress: None,
            // 默认远端工厂 = 真 `Remote::for_project`(codehub/gh)。`real_demo_v4`
            // 与测试用 [`App::with_remote_factory`] 注入共享的 `Remote::Mock`。
            remote_factory: Box::new(|p| {
                Remote::for_project(&p.provider, &p.remote_host, &p.remote_path)
            }),
            pty_ended: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// buddy 自己的资产放哪。**改工作区根目录不会跟着搬** —— 这里放的是
    /// buddy 自带的东西,和用户把仓放在哪没关系。
    pub fn with_asset_root(mut self, root: impl Into<PathBuf>) -> Self {
        self.asset_root = root.into();
        self
    }

    /// buddy 本机数据目录(注册表/设置/会话/技能都在这下面)。
    pub fn asset_root(&self) -> &std::path::Path {
        &self.asset_root
    }

    /// 注入远端工厂。**测试/指挥器专用** —— 注一份返回共享 `Arc<Mutex<MockState>>`
    /// 的工厂,让一次完整生命周期(建活 → 列活 → 改状态 → 发版本 → 关)全在
    /// 同一份内存状态上跑。桌面壳不调,走默认的真 `Remote::for_project`。
    pub fn with_remote_factory(mut self, f: RemoteFactory) -> Self {
        self.remote_factory = f;
        self
    }

    /// 给 issue_store 等内部模块拿远端用的统一口子:经 `remote_factory` 派发。
    /// `RemoteError`(配置错)→ `AppError::Exec`,与原 `issue_store::remote_for`
    /// 的转法一致。
    pub(crate) fn remote_for(&self, project: &crate::model::Project) -> Result<Remote> {
        (self.remote_factory)(project).map_err(|e| AppError::Exec(format!("认不出远端类型:{e}")))
    }

    /// buddy 技能库摊在哪。开工前 [`App::ensure_skill_assets`] 保证它是齐的。
    pub fn skills_dir(&self) -> PathBuf {
        self.asset_root.join("skills")
    }

    /// 把 buddy 自带的技能摊到 [`App::skills_dir`],返回那个目录。
    ///
    /// 幂等:内容一致就不写。**写不下去不算开工失败** —— 调用方拿到 `None`
    /// 就不给 agent 指技能这条路,如实少一段,不编一个路径出来。
    pub fn ensure_skill_assets(&self) -> Option<PathBuf> {
        let dir = self.skills_dir();
        for pack in crate::standard::skills::all() {
            let path = dir.join(&pack.rel);
            if std::fs::read_to_string(&path).is_ok_and(|on_disk| on_disk == pack.raw) {
                continue;
            }
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).ok()?;
            }
            std::fs::write(&path, pack.raw).ok()?;
        }
        Some(dir)
    }

    /// 阶段规范 references 摊在哪(`<asset_root>/system-prompt/references/`)。
    pub fn prompt_dir(&self) -> PathBuf {
        self.asset_root.join("system-prompt").join("references")
    }

    /// 把 buddy 自带的阶段规范 references 摊到 [`App::prompt_dir`],返回那个目录。
    /// 和 [`App::ensure_skill_assets`] 同一套规矩:幂等、写不下去返回 `None`
    /// 如实少一段。
    pub fn ensure_prompt_assets(&self) -> Option<PathBuf> {
        let dir = self.prompt_dir();
        for pack in crate::standard::system_prompt::references() {
            let path = dir.join(&pack.rel);
            if std::fs::read_to_string(&path).is_ok_and(|on_disk| on_disk == pack.raw) {
                continue;
            }
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).ok()?;
            }
            std::fs::write(&path, pack.raw).ok()?;
        }
        Some(dir)
    }

    /// vendor 业界 workflow 库摊在哪(`<asset_root>/vendor/`)。
    pub fn vendor_dir(&self) -> PathBuf {
        self.asset_root.join("vendor")
    }

    /// 把 `standard/vendor/` 下的业界 workflow 库(mattpocock-skills / mohit)整树
    /// 摊到 [`App::vendor_dir`]。workflow 入口(如 `mattpocock-skills`)的 body 指向
    /// 这里的子技能路径,agent 按入口 SOP 自己读。
    ///
    /// **dev 期从源码树跑**:源在 `CARGO_MANIFEST_DIR/../../standard/vendor/`
    /// (编译期烘焙的绝对路径,运行时该路径还在=源码树在)。**分发态无源码树时
    /// walk 失败返 `None`**:workflow 入口仍注入(skill_pointer 只查入口本身),
    /// 但入口 body 指向的 vendor 子技能读不到——如实降级,不崩。幂等:文件一致不重写。
    pub fn ensure_vendor_assets(&self) -> Option<PathBuf> {
        let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../standard/vendor");
        let dst = self.vendor_dir();
        copy_tree(&src, &dst).ok()?;
        Some(dst)
    }

    /// 把「一步一句」的回执接出去。不接的话长命令照跑,只是没人看得见中间过程。
    pub fn with_progress(mut self, tx: tokio::sync::broadcast::Sender<ProgressLine>) -> Self {
        self.progress = Some(tx);
        self
    }

    /// 报一步。**没人订就丢掉** —— 报不出去绝不影响命令本身。
    pub(crate) fn step(&self, line: ProgressLine) {
        if let Some(tx) = &self.progress {
            let _ = tx.send(line);
        }
    }

    /// 这张活开工时会喂给 agent 的那份系统提示词。**只读、纯算**,不起进程、
    /// 不改任何状态 —— 和真开工走的是同一个函数,所以它显示什么,agent 收到的
    /// 就是什么。
    ///
    /// 为什么要有这个口子:提示词是经 `--append-system-prompt` 送进去的,
    /// **终端里一个字都看不见**。试点第一天用户就问「我看没有技能路径」——
    /// 路径其实一直在,只是没有任何地方能看到它。agent 跑偏时,第一步就该是
    /// 看它到底被告知了什么。
    pub async fn agent_briefing(&self, id: crate::model::IssueId) -> Result<String> {
        let issue = self.issue_or_err(id).await?;
        let skill = self
            .ensure_skill_assets()
            .and_then(|d| bootstrap::skill_pointer(&d, &issue.workflow));
        let references = self
            .ensure_prompt_assets()
            .map(|d| bootstrap::references_for(&issue, &d))
            .unwrap_or_default();
        Ok(bootstrap::agent_system_prompt(
            &issue,
            skill.as_ref(),
            &references,
        ))
    }

    pub fn workspaces_root(&self) -> &std::path::Path {
        &self.workspaces_root
    }

    // ── 项目注册表(替代 store.project_*)─────────────────────────────

    /// 读一个项目的完整行。`None` = 注册表里没有。
    pub async fn project(&self, id: ProjectId) -> Result<Option<crate::model::Project>> {
        Ok(ProjectRegistry::find_by_id(&self.asset_root, id)?.map(|e| e.to_project()))
    }

    /// 按 slug 找项目。
    pub async fn project_by_slug(&self, slug: &str) -> Result<Option<crate::model::Project>> {
        Ok(ProjectRegistry::find_by_slug(&self.asset_root, slug)?.map(|e| e.to_project()))
    }

    /// 项目墙的整屏 —— 按注册表顺序。
    pub async fn projects(&self) -> Result<Vec<crate::model::Project>> {
        let entries = ProjectRegistry::load(&self.asset_root)?;
        Ok(entries.iter().map(|e| e.to_project()).collect())
    }

    /// 取一个项目的完整行。内部辅助,给 issue_store 调用方用的。
    pub(crate) async fn project_of(&self, project_id: ProjectId) -> Result<crate::model::Project> {
        self.project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))
    }

    pub(crate) async fn upsert_project(
        &self,
        p: &crate::model::Project,
    ) -> Result<crate::model::Project> {
        Ok(ProjectRegistry::upsert(&self.asset_root, p)?)
    }

    pub(crate) async fn remove_project_entry(&self, id: ProjectId) -> Result<u64> {
        let slug = self.project(id).await?.map(|p| p.slug).unwrap_or_default();
        let n = ProjectRegistry::remove(&self.asset_root, id)?;
        // 会话文件跟着清。
        if !slug.is_empty() {
            SessionStore::remove_project(&self.asset_root, &slug);
        }
        Ok(n)
    }

    pub(crate) async fn update_project_location(
        &self,
        id: ProjectId,
        name: &str,
        workspace_path: &str,
        provider: &str,
        remote_host: &str,
        remote_path: &str,
    ) -> Result<()> {
        Ok(ProjectRegistry::update_location(
            &self.asset_root,
            id,
            name,
            workspace_path,
            provider,
            remote_host,
            remote_path,
        )?)
    }

    pub(crate) async fn set_project_workspace_path(&self, id: ProjectId, path: &str) -> Result<()> {
        Ok(ProjectRegistry::set_workspace_path(
            &self.asset_root,
            id,
            path,
        )?)
    }

    /// 把现算出来的健康灯写进显示缓存(密封类型,无法手工点绿)。
    pub async fn cache_project_health(
        &self,
        id: ProjectId,
        health: &crate::derive::DerivedHealth,
    ) -> Result<()> {
        Ok(ProjectRegistry::cache_health(&self.asset_root, id, health)?)
    }

    // ── 全局设置(替代 store.meta workspaces_root)─────────────────────

    pub async fn workspaces_root_setting(&self) -> Option<String> {
        Settings::get_workspaces_root(&self.asset_root)
    }

    pub(crate) async fn set_workspaces_root_setting(&self, path: &str) -> Result<()> {
        Ok(Settings::set_workspaces_root(&self.asset_root, path)?)
    }

    // ── 通知屏已读(替代 store.meta notify_seen:*)────────────────────

    pub async fn notify_seen(&self, id: ProjectId) -> Option<i64> {
        ProjectRegistry::get_notify_seen(&self.asset_root, id)
    }

    pub(crate) async fn set_notify_seen(&self, id: ProjectId, at: i64) -> Result<()> {
        Ok(ProjectRegistry::set_notify_seen(&self.asset_root, id, at)?)
    }

    // ── 会话(替代 store.conversation_*)────────────────────────────────

    pub async fn conversation_for_issue(
        &self,
        id: crate::model::IssueId,
    ) -> Result<Option<Conversation>> {
        let project = self.project(id.project_id()).await?;
        let Some(p) = project else {
            return Ok(None);
        };
        Ok(SessionStore::read(&self.asset_root, &p.slug, id.iid())?)
    }

    pub async fn conversations(&self, project_id: ProjectId) -> Result<Vec<Conversation>> {
        let project = self.project(project_id).await?;
        let Some(p) = project else {
            return Ok(Vec::new());
        };
        Ok(SessionStore::list(&self.asset_root, &p.slug)?)
    }

    pub(crate) async fn upsert_conversation(&self, c: &Conversation) -> Result<Conversation> {
        // 已经有会话就返回既有行(幂等)。
        if let Some(existing) = self.conversation_for_issue(c.issue_id).await? {
            return Ok(existing);
        }
        let slug = self.slug_of(c.project_id).await?;
        SessionStore::append(&self.asset_root, &slug, c)?;
        Ok(c.clone())
    }

    /// 追加一条会话记录(更新 `--resume` id)。不走 upsert 的「已有就原样返回」。
    pub(crate) async fn append_conversation(&self, c: &Conversation) -> Result<()> {
        let slug = self.slug_of(c.project_id).await?;
        SessionStore::append(&self.asset_root, &slug, c)?;
        Ok(())
    }

    /// 某个项目的仓在哪。项目行里配了路径就用它,没配就是 `<工作区根目录>/<slug>`。
    pub async fn workspace_of(&self, id: ProjectId) -> Result<PathBuf> {
        let p = self
            .project(id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(id.uuid().to_string()))?;
        Ok(self.workspace_at(&p.slug, &p.workspace_path))
    }

    /// 按 project id 查 slug。内部辅助。
    async fn slug_of(&self, id: ProjectId) -> Result<String> {
        self.project(id)
            .await?
            .map(|p| p.slug)
            .ok_or_else(|| AppError::NoSuchProject(id.uuid().to_string()))
    }

    /// 仓该落在哪:项目行里配了路径就用它,没配就是 `<工作区根目录>/<slug>`。
    /// **接入的时候项目行还不存在**(要先把仓取下来才建行),所以这条规矩单
    /// 独提出来一份,两处共用 —— 两边各写一遍就会走散。
    pub(crate) fn workspace_at(&self, slug: &str, workspace_path: &str) -> PathBuf {
        if workspace_path.trim().is_empty() {
            self.workspaces_root.join(slug)
        } else {
            PathBuf::from(workspace_path.trim())
        }
    }

    /// 唯一的入口。
    pub async fn dispatch(&mut self, cmd: Command) -> Result<Vec<Event>> {
        match cmd {
            Command::CreateProject {
                slug,
                intent,
                remote,
                workspace_path,
            } => {
                self.create_project(slug, intent, remote, workspace_path)
                    .await
            }
            Command::RemoveProject { project_id } => self.remove_project(project_id).await,
            Command::ReopenSession { issue_id } => self.reopen_session(issue_id).await,
            Command::EditProjectCard { project_id, intent } => {
                self.edit_project_card(project_id, intent).await
            }
            Command::SetProjectChat {
                project_id,
                provider,
                group_id,
                notify,
            } => {
                self.set_project_chat(project_id, provider, group_id, notify)
                    .await
            }
            Command::RunStandardBootstrap { project_id } => {
                self.run_standard_bootstrap(project_id, true).await
            }
            Command::ReconcileStandard { project_id } => self.reconcile_standard(project_id).await,
            Command::StartWeekPlanning { project_id, week } => {
                self.start_week_planning(project_id, week).await
            }
            Command::ConfirmWeekDraft {
                project_id,
                week,
                titles,
            } => self.confirm_week_draft(project_id, week, titles).await,
            Command::CreateIssue {
                project_id,
                title,
                body,
                category,
                kind,
                origin,
                week_of,
            } => {
                self.create_issue(project_id, title, body, category, kind, origin, week_of)
                    .await
            }
            Command::ScheduleIssue { id, week_of } => self.schedule_issue(id, week_of).await,
            Command::SetCurrentVersion {
                project_id,
                version,
            } => self.set_current_version(project_id, version).await,
            Command::CutRelease {
                project_id,
                version,
                note,
                included,
            } => self.cut_release(project_id, version, note, included).await,
            Command::RunIssue { id } => self.run_issue(id).await,
            Command::SubmitIssueWork { id } => self.submit_issue_work(id).await,
            Command::SetWorkspacesRoot { path } => self.set_workspaces_root(path).await,
            Command::TransitionIssue { id, to } => self.transition_issue(id, to).await,
            Command::BlockIssue { id, reason } => self.block_issue(id, reason).await,
            Command::SaveToolMapping {
                project_id,
                category,
                tool,
                workflow,
            } => {
                self.save_tool_mapping(project_id, category, tool, workflow)
                    .await
            }
            Command::ProbeTool { name } => self.probe_tool(name).await,
            Command::MarkNotifySeen { project_id, at } => {
                self.mark_notify_seen(project_id, at).await
            }
            Command::PullWorkspace { project_id } => self.pull_workspace(project_id).await,
            Command::TickScheduler { project_id } => self.tick_scheduler(project_id).await,
            Command::MergeAndSettle { id } => self.merge_and_settle(id).await,
            Command::SyncNotifyToChat {
                issue_id,
                event_type,
            } => self.sync_notify_to_chat(issue_id, event_type).await,
            Command::BackfillHistory { project_id } => self.backfill_history(project_id).await,
            Command::CancelRun { id } => self.cancel_run(id).await,
            Command::TerminalInput {
                conversation_id,
                bytes,
            } => self.terminal_input(conversation_id, bytes).await,
            Command::TerminalResize {
                conversation_id,
                cols,
                rows,
            } => self.terminal_resize(conversation_id, cols, rows).await,
        }
    }
}

/// 递归复制 `src` 树到 `dst`,文件一致就跳过(幂等)。给 `ensure_vendor_assets`
/// 用——vendor 库太大不能 `include_str!` 逐份编进二进制,运行时从源码树整树摊。
fn copy_tree(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !src.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "vendor 源不在 {}(分发态无源码树,vendor 不摊)",
                src.display()
            ),
        ));
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        let ft = entry.file_type()?;
        if ft.is_dir() {
            copy_tree(&from, &to)?;
        } else if ft.is_file() {
            let same = std::fs::read_to_string(&from)
                .is_ok_and(|s| std::fs::read_to_string(&to).is_ok_and(|d| d == s));
            if same {
                continue;
            }
            std::fs::copy(&from, &to)?;
        }
    }
    Ok(())
}
