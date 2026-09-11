mod bootstrap;
mod chat_notify;
pub mod collect;
mod health;
mod issue;
mod issue_store;
mod ops;
mod orca_inject;
mod pack_ctl;
mod plan;
mod progress;
mod project;
mod release_ship;
mod session;
mod tools;
mod week_comment;
mod worktree;

pub use bootstrap::{
    agent_system_prompt, ref_wanted_for, references_for, skill_pointer, ReferencePointer,
    SkillPointer,
};
pub use health::{collect_health_inputs, read_metric_readings, MetricReading};
pub use issue::{count_unseen, issues_in_week, workflow_usage};
pub use issue_store::{
    is_charter_title, is_open_charter, overlay_project_file, work_branch, CHARTER_TITLE,
    LIGHT_TITLE,
};
pub use ops::{
    current_week_version, find_open_bare_ops1, is_ops1_issue, ops1_title, ops2_title, skill_slug,
    week_started, workflow_label, OPS1_WORKFLOW, OPS2_WORKFLOW, OPS3_WORKFLOW,
};
pub use pack_ctl::{cleanup_pack_intermediates, PackCtl};
pub use progress::{ProgressCase, ProgressLine, StepState};
pub use week_comment::{
    parse_comments, render_week_plan_comment, validate_comment, WeekComment, HEADING_GOAL,
    HEADING_READINGS, HEADING_SCOPE,
};

use crate::{
    command::{Command, Event},
    local::{ProjectRegistry, SessionStore, Settings},
    model::{Conversation, ProjectId},
    repo::RepoFileError,
};
use bw_engine::{
    remote::{Remote, RemoteError},
    InteractiveExecutor,
};
use std::{path::PathBuf, sync::Arc};

/// 测试注入的工厂须共享 MockState，使多次远端调用看到同一份数据。
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
    #[error("找不到此 Issue")]
    NoSuchIssue,
    #[error("{0} 还没有配工作区,这一步需要一个真实的仓")]
    NoWorkspace(String),
    #[error("不能从「{from}」转到「{to}」")]
    IllegalTransition { from: String, to: String },
    #[error("{0}")]
    Refused(String),
}

pub type Result<T> = std::result::Result<T, AppError>;

pub struct App {
    pub(crate) workspaces_root: PathBuf,
    pub(crate) executor: Arc<dyn InteractiveExecutor>,
    /// 桌面启用 Orca 执行；关闭时使用无界面执行器。
    pub(crate) pty_enabled: bool,
    pub(crate) progress: Option<tokio::sync::broadcast::Sender<ProgressLine>>,
    /// 出包中途停。壳不走命令队列,直接 [`PackCtl::abort`]。
    pub pack_ctl: Arc<PackCtl>,
    /// Workbench 自己的资产目录 —— 技能库摊在这儿(`<asset_root>/skills/`),
    /// 项目注册表(`<asset_root>/projects.toml`)、全局设置
    /// (`<asset_root>/settings.toml`)、会话记录
    /// (`<asset_root>/sessions/<slug>/<iid>.jsonl`)也都在这儿。
    /// **不在任何一个用户项目的仓里**:用户的 `.gitignore` 怎么写不该由 Workbench
    /// 决定,而 Workbench 自带的剧本每个项目都一样,没有复制 N 份的道理。
    pub(crate) asset_root: PathBuf,
    pub(crate) remote_factory: RemoteFactory,
}

impl App {
    pub fn new(
        workspaces_root: impl Into<PathBuf>,
        executor: Arc<dyn InteractiveExecutor>,
    ) -> Self {
        let workspaces_root = workspaces_root.into();
        Self {
            // 无界面调用默认使用工作区根目录下的 .bw-assets；桌面单独指定数据目录。
            asset_root: workspaces_root.join(".bw-assets"),
            workspaces_root,
            executor,
            pty_enabled: false,
            progress: None,
            pack_ctl: Arc::new(PackCtl::new()),
            remote_factory: Box::new(|p| {
                Remote::for_project(&p.provider, &p.remote_host, &p.remote_path)
            }),
        }
    }

    /// Workbench 自己的资产放哪。**改工作区根目录不会跟着搬** —— 这里放的是
    /// Workbench 自带的东西,和用户把仓放在哪没关系。
    pub fn with_asset_root(mut self, root: impl Into<PathBuf>) -> Self {
        self.asset_root = root.into();
        self
    }

    pub fn asset_root(&self) -> &std::path::Path {
        &self.asset_root
    }

    /// 注入远端工厂。**测试/指挥器专用** —— 注一份返回共享 `Arc<Mutex<MockState>>`
    /// 的工厂,让一次完整生命周期(创建 Issue → 列出 Issue → 改状态 → 发版本 → 关)全在
    /// 同一份内存状态上跑。桌面壳不调,走默认的真 `Remote::for_project`。
    pub fn with_remote_factory(mut self, f: RemoteFactory) -> Self {
        self.remote_factory = f;
        self
    }

    pub fn remote_for(&self, project: &crate::model::Project) -> Result<Remote> {
        (self.remote_factory)(project).map_err(|e| AppError::Exec(format!("认不出远端类型:{e}")))
    }

    pub fn skills_dir(&self) -> PathBuf {
        self.asset_root.join("skills")
    }

    /// 把 Workbench 自带的技能摊到 [`App::skills_dir`],返回那个目录。
    ///
    /// 幂等:内容一致就不写。**写不下去不算开工失败** —— 调用方拿到 `None`
    /// 就不给 agent 指技能这条路,如实少一段,不编一个路径出来。
    pub fn ensure_skill_assets(&self) -> Option<PathBuf> {
        let dir = self.skills_dir();
        for pack in crate::standard::skills::all()
            .into_iter()
            .chain(crate::standard::skills::sidecars())
        {
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

    pub fn prompt_dir(&self) -> PathBuf {
        self.asset_root.join("system-prompt").join("references")
    }

    /// 把 Workbench 自带的阶段规范 references 摊到 [`App::prompt_dir`],返回那个目录。
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

    pub fn with_progress(mut self, tx: tokio::sync::broadcast::Sender<ProgressLine>) -> Self {
        self.progress = Some(tx);
        self
    }

    pub fn with_pack_ctl(mut self, ctl: Arc<PackCtl>) -> Self {
        self.pack_ctl = ctl;
        self
    }

    /// 报一步。**没人订就丢掉** —— 报不出去绝不影响命令本身。
    pub(crate) fn step(&self, line: ProgressLine) {
        if let Some(tx) = &self.progress {
            let _ = tx.send(line);
        }
    }

    pub fn workspaces_root(&self) -> &std::path::Path {
        &self.workspaces_root
    }

    pub async fn project(&self, id: ProjectId) -> Result<Option<crate::model::Project>> {
        Ok(ProjectRegistry::find_by_id(&self.asset_root, id)?.map(|e| e.to_project()))
    }

    pub async fn project_by_slug(&self, slug: &str) -> Result<Option<crate::model::Project>> {
        Ok(ProjectRegistry::find_by_slug(&self.asset_root, slug)?.map(|e| e.to_project()))
    }

    pub async fn projects(&self) -> Result<Vec<crate::model::Project>> {
        let entries = ProjectRegistry::load(&self.asset_root)?;
        Ok(entries.iter().map(|e| e.to_project()).collect())
    }

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

    pub(crate) async fn set_orca_web_url_setting(&self, url: &str) -> Result<()> {
        Ok(Settings::set_orca_web_url(&self.asset_root, url)?)
    }

    pub(crate) async fn set_theme_setting(&self, theme: &str) -> Result<()> {
        Ok(Settings::set_theme(&self.asset_root, theme)?)
    }

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
        if let Some(existing) = self.conversation_for_issue(c.issue_id).await? {
            return Ok(existing);
        }
        let slug = self.slug_of(c.project_id).await?;
        SessionStore::append(&self.asset_root, &slug, c)?;
        Ok(c.clone())
    }

    pub async fn workspace_of(&self, id: ProjectId) -> Result<PathBuf> {
        let p = self
            .project(id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(id.uuid().to_string()))?;
        Ok(self.workspace_at(&p.slug, &p.workspace_path))
    }

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

    pub async fn dispatch(&mut self, cmd: Command) -> Result<Vec<Event>> {
        let label = cmd_log_label(&cmd);
        let started = std::time::Instant::now();
        bw_engine::dlog!(ok, "dispatch", "begin {label}");
        let out = match cmd {
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
            Command::ReconcileStandard { project_id } => self.reconcile_standard(project_id).await,
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
                plan,
            } => {
                self.create_issue(
                    project_id, title, body, category, kind, origin, week_of, plan,
                )
                .await
            }
            Command::ScheduleIssue { id, week_of } => self.schedule_issue(id, week_of).await,
            Command::ScheduleToPlan { id, plan } => self.schedule_to_plan(id, plan).await,
            Command::CreatePlanVersion {
                project_id,
                name,
                start,
                due,
                included,
            } => {
                self.create_plan_version(project_id, name, start, due, included)
                    .await
            }
            Command::DeletePlanVersion { project_id, name } => {
                self.delete_plan_version(project_id, name).await
            }
            Command::RenamePlanVersion {
                project_id,
                from,
                to,
            } => self.rename_plan_version(project_id, from, to).await,
            Command::CutRelease {
                project_id,
                version,
                note,
                included,
            } => self.cut_release(project_id, version, note, included).await,
            Command::PackRelease {
                project_id,
                version,
            } => self.pack_release(project_id, version).await,
            Command::RunIssue { id } => self.run_issue(id).await,
            Command::SubmitIssueWork { id } => self.submit_issue_work(id).await,
            Command::SetWorkspacesRoot { path } => self.set_workspaces_root(path).await,
            Command::SetOrcaWebUrl { url } => self.set_orca_web_url(url).await,
            Command::SetTheme { theme } => self.set_theme(theme).await,
            Command::TransitionIssue { id, to } => self.transition_issue(id, to).await,
            Command::SetIssueCategory { id, category } => {
                self.set_issue_category(id, category).await
            }
            Command::SetIssueAssignee { id, assignee } => {
                self.set_issue_assignee(id, assignee).await
            }
            Command::EditIssue { id, title, body } => self.edit_issue(id, title, body).await,
            Command::FetchIssue { id } => self.fetch_issue_body(id).await,
            Command::CancelIssue { id, reason } => self.cancel_issue(id, reason).await,
            Command::DeleteSession { id } => self.delete_session(id).await,
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
            Command::PullWorkspace { project_id } => self.pull_workspace(project_id).await,
            Command::MergeAndSettle { id } => self.merge_and_settle(id).await,
            Command::SyncNotifyToChat {
                issue_id,
                event_type,
            } => self.sync_notify_to_chat(issue_id, event_type).await,
            Command::CancelRun { id } => self.cancel_run(id).await,
            Command::RecordManualMetric {
                project_id,
                name,
                value,
            } => self.record_manual_metric(project_id, name, value).await,
            Command::ReportWorkbenchIssue { title, attach_log } => {
                self.report_workbench_issue(title, attach_log).await
            }
        };
        let elapsed_ms = started.elapsed().as_millis();
        match &out {
            Ok(evs) => bw_engine::dlog!(
                ok,
                "dispatch",
                "ok {label} events={} elapsed_ms={elapsed_ms}",
                evs.len()
            ),
            Err(e) => bw_engine::dlog!(
                err,
                "dispatch",
                "fail {label} elapsed_ms={elapsed_ms} err={e}"
            ),
        }
        out
    }
}

/// 日志只记录命令名和对象标识，不能写配对 URL、提示词或 token。
fn cmd_log_label(cmd: &Command) -> String {
    match cmd {
        Command::CreateProject { slug, .. } => format!("CreateProject slug={slug}"),
        Command::RemoveProject { project_id } => {
            format!("RemoveProject project={}", project_id.uuid())
        }
        Command::ReopenSession { issue_id } => format!("ReopenSession #{}", issue_id.iid()),
        Command::EditProjectCard { project_id, .. } => {
            format!("EditProjectCard project={}", project_id.uuid())
        }
        Command::ReconcileStandard { project_id } => {
            format!("ReconcileStandard project={}", project_id.uuid())
        }
        Command::ConfirmWeekDraft {
            project_id,
            week,
            titles,
        } => format!(
            "ConfirmWeekDraft project={} week={week} titles={}",
            project_id.uuid(),
            titles.len()
        ),
        Command::CreateIssue {
            project_id,
            title,
            category,
            week_of,
            plan,
            ..
        } => format!(
            "CreateIssue project={} title={title:?} category={category:?} week={week_of} plan={plan}",
            project_id.uuid()
        ),
        Command::ScheduleIssue { id, week_of } => {
            format!("ScheduleIssue #{} week={week_of:?}", id.iid())
        }
        Command::ScheduleToPlan { id, plan } => format!("ScheduleToPlan #{} plan={plan}", id.iid()),
        Command::CreatePlanVersion {
            project_id,
            name,
            included,
            ..
        } => format!(
            "CreatePlanVersion project={} name={name} included={}",
            project_id.uuid(),
            included.len()
        ),
        Command::DeletePlanVersion { project_id, name } => {
            format!("DeletePlanVersion project={} name={name}", project_id.uuid())
        }
        Command::RenamePlanVersion {
            project_id,
            from,
            to,
        } => format!(
            "RenamePlanVersion project={} from={from} to={to}",
            project_id.uuid()
        ),
        Command::CutRelease {
            project_id,
            version,
            included,
            ..
        } => format!(
            "CutRelease project={} version={version} included={}",
            project_id.uuid(),
            included.len()
        ),
        Command::PackRelease {
            project_id,
            version,
        } => format!(
            "PackRelease project={} version={version}",
            project_id.uuid()
        ),
        Command::RunIssue { id } => format!("RunIssue #{}", id.iid()),
        Command::SubmitIssueWork { id } => format!("SubmitIssueWork #{}", id.iid()),
        Command::SetWorkspacesRoot { .. } => "SetWorkspacesRoot".into(),
        Command::SetOrcaWebUrl { .. } => "SetOrcaWebUrl".into(),
        Command::SetTheme { theme } => format!("SetTheme {theme}"),
        Command::TransitionIssue { id, to } => {
            format!("TransitionIssue #{} to={}", id.iid(), to.label())
        }
        Command::SetIssueCategory { id, category } => {
            format!("SetIssueCategory #{} category={}", id.iid(), category.label())
        }
        Command::SetIssueAssignee { id, assignee } => {
            format!("SetIssueAssignee #{} assignee={assignee}", id.iid())
        }
        Command::EditIssue { id, title, .. } => {
            format!("EditIssue #{} title={title:?}", id.iid())
        }
        Command::FetchIssue { id } => format!("FetchIssue #{}", id.iid()),
        Command::CancelIssue { id, .. } => format!("CancelIssue #{}", id.iid()),
        Command::DeleteSession { id } => format!("DeleteSession #{}", id.iid()),
        Command::BlockIssue { id, .. } => format!("BlockIssue #{}", id.iid()),
        Command::SaveToolMapping {
            project_id,
            category,
            tool,
            workflow,
        } => format!(
            "SaveToolMapping project={} category={} tool={tool} workflow={workflow}",
            project_id.uuid(),
            category.label()
        ),
        Command::ProbeTool { name } => format!("ProbeTool name={name}"),
        Command::PullWorkspace { project_id } => {
            format!("PullWorkspace project={}", project_id.uuid())
        }
        Command::MergeAndSettle { id } => format!("MergeAndSettle #{}", id.iid()),
        Command::SyncNotifyToChat {
            issue_id,
            event_type,
        } => format!("SyncNotifyToChat #{} event={event_type}", issue_id.iid()),
        Command::CancelRun { id } => format!("CancelRun #{}", id.iid()),
        Command::RecordManualMetric {
            project_id, name, ..
        } => format!(
            "RecordManualMetric project={} name={name}",
            project_id.uuid()
        ),
        Command::ReportWorkbenchIssue { title, attach_log } => {
            format!("ReportWorkbenchIssue title={title:?} attach_log={attach_log}")
        }
    }
}

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
