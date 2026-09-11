mod nav;
mod vm_build;
mod vm_derive;
mod vm_kb;
mod vm_panels;
mod vm_settings;

pub use nav::{
    ChromeBusy, GuideNav, HelpNav, HelpTab, Panel, PanelNav, TopView, REPORTING, REPORTING_LOG,
    STARTING_SESSION, SWITCHING_STATUS,
};

use crate::vm::Vm;
use bw::{
    app::App,
    command::{Command, Event},
    local::Settings,
    model::{IssueId, IssueStatus, ProjectId},
};
use std::{
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::{broadcast, mpsc, watch};

/// iframe onload 之后再给配对 WS 的时间。短于这个,嵌页还没订上 `notifyClients`。
const ORCA_PAIRING_SETTLE: Duration = Duration::from_millis(400);
/// 嵌页一直不 onload(没 URL / WebView 吞了事件)也要切树 —— 桌面还能跟。
const ORCA_EMBED_FALLBACK: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, Default)]
pub struct DeepLink {
    pub open: Option<String>,
    pub panel: Panel,
    pub view: Option<TopView>,
    pub help: Option<HelpTab>,
}

pub fn read_deep_link() -> DeepLink {
    let mut dl = DeepLink {
        open: std::env::var("BW_OPEN").ok().filter(|s| !s.is_empty()),
        ..Default::default()
    };
    if let Ok(p) = std::env::var("BW_PANEL") {
        match Panel::parse(&p) {
            Some(panel) => dl.panel = panel,
            None => bw_engine::dlog!(warn, "bridge", "[BW_OPEN] 未知 BW_PANEL={p:?},忽略"),
        }
    }
    if let Ok(v) = std::env::var("BW_VIEW") {
        match TopView::parse(&v) {
            Some(view) => {
                let label = match view {
                    TopView::Settings => "settings",
                    TopView::Onboard => "onboard",
                };
                bw_engine::dlog!(ok, "bridge", "[BW_VIEW] {label}");
                dl.view = Some(view);
            }
            None => bw_engine::dlog!(warn, "bridge", "[BW_OPEN] 未知 BW_VIEW={v:?},忽略"),
        }
    }
    if let Ok(h) = std::env::var("BW_HELP") {
        match HelpTab::parse(&h) {
            Some(tab) => {
                bw_engine::dlog!(ok, "bridge", "[BW_HELP] {h}");
                dl.help = Some(tab);
            }
            None => bw_engine::dlog!(warn, "bridge", "[BW_OPEN] 未知 BW_HELP={h:?},忽略"),
        }
    }
    dl
}

pub enum Req {
    Cmd(Command),
    Open(Option<ProjectId>),
    ViewPlan(String),
    SelectOverviewVersion(String),
    ViewAll(bool),
    Note(String),
    OpenDoc(Option<String>),
    DropDrafts,
    /// 先挂载 iframe，收到 OrcaEmbedReady 后再切换 worktree，避免嵌页漏收通知。
    SelectSession(Option<bw::model::IssueId>),
    OrcaEmbedReady,
    /// 忽略过期的 seq，避免快速切换时激活上一次选择的 worktree。
    FlushOrcaReveal {
        seq: u64,
    },
    SessionTab(crate::vm::SessionTab),
    KbTab(crate::vm::KbTab),
    KbComputed {
        tab: crate::vm::KbTab,
        codegraph: Option<crate::vm::CodeGraphVm>,
        assets: Option<crate::vm::AssetsVm>,
    },
    CollectRepoStats,
    CollectMetrics,
    MetricsCollected {
        project: ProjectId,
        readouts: Vec<bw::app::collect::MetricReadout>,
        error: Option<String>,
    },
    /// 携带采集时的项目 ID，避免异步结果显示在其他项目中。
    RepoStatsComputed {
        project: ProjectId,
        stats: crate::vm::RepoStatsVm,
    },
    ListRepos {
        github: bool,
        host: String,
    },
    ReposListed {
        rows: Vec<crate::vm::RepoRowVm>,
        error: Option<String>,
    },
    PickRepo {
        github: bool,
        host: String,
        path: String,
        /// 列表携带远端默认分支；手输地址时留空，由引擎查询，不能假定为 main。
        git_ref: String,
    },
    PickLocalRepo {
        path: String,
    },
    RepoPicked {
        path: String,
        prefill: Option<crate::vm::RepoPrefillVm>,
        probe: crate::vm::RepoProbe,
    },
    Refresh,
    /// 配置屏亮某一行技能(从Issue 上的 workflow 跳过来)。
    #[allow(dead_code)]
    FocusSkill(String),
    /// 结果的项目和 gen 必须与当前视图一致。
    PrNumbersFilled {
        project: ProjectId,
        gen: u64,
        entries: Vec<(bw::model::IssueId, u32, bool)>,
    },
}

/// Bridge 的副本共用内核通道；PartialEq 比较通道身份，不承载业务状态。
#[derive(Clone)]
pub struct Bridge {
    tx: mpsc::UnboundedSender<Req>,
    pub vm: watch::Receiver<Vm>,
    /// dispatch 尚未返回时也要显示进度，因此使用独立的广播通道。
    pub progress: broadcast::Sender<bw::app::ProgressLine>,
    /// 出包中途停。不走命令队列（队列正被 PackRelease 占着）。
    pub pack_ctl: Arc<bw::app::PackCtl>,
}

impl PartialEq for Bridge {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

impl Bridge {
    pub fn send(&self, req: Req) {
        let _ = self.tx.send(req);
    }

    pub fn cmd(&self, c: Command) {
        self.send(Req::Cmd(c));
    }

    pub fn abort_pack(&self) {
        self.pack_ctl.abort();
    }
}

/// 本机数据目录。BW_DB 仅取父目录；Windows 优先 D 盘，否则使用 APPDATA。
pub fn data_dir() -> PathBuf {
    let base = if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(|h| format!("{h}/Library/Application Support/BuildersWorkbench"))
            .ok()
    } else if cfg!(target_os = "windows") {
        if PathBuf::from("D:\\").exists() {
            Some("D:\\builders-workbench\\data".into())
        } else {
            std::env::var("APPDATA")
                .map(|a| format!("{a}\\BuildersWorkbench"))
                .ok()
        }
    } else {
        std::env::var("HOME")
            .map(|h| format!("{h}/.local/share/builders-workbench"))
            .ok()
    };
    let dir = match base {
        Some(d) => PathBuf::from(d),
        None => dirs_home().join(".builders-workbench"),
    };
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(p) = std::env::var("BW_DB") {
        let path = PathBuf::from(&p);
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
                return parent.to_path_buf();
            }
        }
    }
    dir
}

pub fn workspaces_root() -> PathBuf {
    std::env::var("BW_WORKSPACES")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            if cfg!(target_os = "windows") && PathBuf::from("D:\\").exists() {
                PathBuf::from("D:\\builders-workbench\\workspaces")
            } else {
                dirs_home().join(".builders-workbench").join("workspaces")
            }
        })
}

/// 应用数据和技能不随用户的工作区根目录迁移。
pub fn asset_root() -> PathBuf {
    data_dir().join("assets")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn refresh_note(vm: &Vm) -> String {
    let tools = vm.env.iter().filter(|t| t.ok == Some(true)).count();
    match &vm.open {
        Some(p) => {
            let w = &p.week_counts;
            format!(
                "刷新完:{} · 本周 待办{} 进行中{} 待评审{} 完成{} 阻塞{} · 本机工具 {}/{} 可用",
                p.name,
                w.todo,
                w.doing,
                w.review,
                w.done,
                w.blocked,
                tools,
                vm.env.len()
            )
        }
        None => format!(
            "刷新完:{} 个项目 · 本机工具 {}/{} 可用",
            vm.projects.len(),
            tools,
            vm.env.len()
        ),
    }
}

fn provider_of(github: bool) -> &'static str {
    if github {
        "github"
    } else {
        "codehub"
    }
}

async fn list_repos(github: bool, host: &str) -> (Vec<crate::vm::RepoRowVm>, Option<String>) {
    // 本地搜索需要完整候选集；CLI 列表上限与 UI 显示行数分别控制。
    const LIMIT: u32 = 999;
    let remote = match bw_engine::remote::Remote::for_host(provider_of(github), host.trim()) {
        Ok(r) => r,
        Err(e) => return (Vec::new(), Some(format!("{e}"))),
    };
    match remote.list_repos(LIMIT).await {
        Ok(rows) => (
            rows.into_iter()
                .map(|r| crate::vm::RepoRowVm {
                    path: r.path,
                    private: r.private,
                    description: r.description,
                    default_branch: r.default_branch,
                    pushed_at: r.pushed_at,
                })
                .collect(),
            None,
        ),
        Err(e) => (Vec::new(), Some(format!("{e}"))),
    }
}

async fn fetch_prefill(
    github: bool,
    host: &str,
    path: &str,
    git_ref: &str,
) -> (Option<crate::vm::RepoPrefillVm>, crate::vm::RepoProbe) {
    use crate::vm::RepoProbe;
    let remote = match bw_engine::remote::Remote::for_host(provider_of(github), host.trim()) {
        Ok(r) => r,
        Err(e) => return (None, RepoProbe::NoRepo(e.to_string())),
    };
    let got = remote
        .fetch_project_toml(path, git_ref)
        .await
        .map_err(|e| e.to_string());
    match got {
        // 仓库和文件不存在都可能返回 404；确认仓库存在后才能展示空表单。
        Ok(None) => {
            let exists = remote.probe_repo(path).await.map_err(|e| e.to_string());
            match exists {
                Ok(_) => (None, RepoProbe::Absent),
                Err(e) => (None, RepoProbe::NoRepo(e)),
            }
        }
        Ok(Some(raw)) => match bw::repo::project_file::parse(&raw) {
            Ok(file) => (
                Some(crate::vm::RepoPrefillVm {
                    name: file.name,
                    brief: file.brief,
                    benchmark: file.benchmark,
                    north_star: file.opportunity,
                }),
                RepoProbe::Adopted,
            ),
            Err(e) => (None, RepoProbe::Failed(e.to_string())),
        },
        Err(e) => (None, RepoProbe::Failed(e)),
    }
}

/// 区分文件不存在、目录不是 Git 仓和解析失败，避免错误触发空表单。
async fn fetch_local_prefill(
    path: &str,
) -> (Option<crate::vm::RepoPrefillVm>, crate::vm::RepoProbe) {
    use crate::vm::RepoProbe;
    let workspace = PathBuf::from(path.trim());
    if !workspace.is_absolute() || !workspace.is_dir() || !bw::git::is_repo(&workspace).await {
        return (
            None,
            RepoProbe::NoRepo(format!("{} 不是可用的本地 Git 仓", workspace.display())),
        );
    }
    match bw::repo::project_file::read(&workspace) {
        Ok(Some(file)) => (
            Some(crate::vm::RepoPrefillVm {
                name: file.name,
                brief: file.brief,
                benchmark: file.benchmark,
                north_star: file.opportunity,
            }),
            RepoProbe::Adopted,
        ),
        Ok(None) => (None, RepoProbe::Absent),
        Err(e) => (None, RepoProbe::Failed(e.to_string())),
    }
}

pub fn spawn(deep_link: DeepLink) -> Bridge {
    let (tx, mut rx) = mpsc::unbounded_channel::<Req>();
    let (vm_tx, vm_rx) = watch::channel(Vm::default());
    let (prog_tx, _) = broadcast::channel(64);

    let prog_tx_handle = prog_tx.clone();
    let pack_ctl = Arc::new(bw::app::PackCtl::new());
    let pack_ctl_app = pack_ctl.clone();
    let tx_back = tx.clone();

    std::thread::Builder::new()
        .name("bw-kernel".into())
        .spawn(move || {
            // 捕获后台线程 panic 并通知界面，否则界面会永久停在最后一份数据。
            let vm_tx_panic = vm_tx.clone();
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("内核 runtime 起不来");
            rt.block_on(async move {
                let assets = asset_root();
                let _ = std::fs::create_dir_all(&assets);
                // 工作区根目录三级取值:**人在设置屏改过的最大**(存在本地
                // 设置文件 `settings.toml` 里),其次是 `BW_WORKSPACES`(开发期
                // 覆盖),最后才是默认值。人改过就该一直算数,不然设置屏那个
                // 输入框是假的。
                let root = match Settings::get_workspaces_root(&assets) {
                    Some(saved) if !saved.trim().is_empty() => PathBuf::from(saved.trim()),
                    _ => workspaces_root(),
                };
                let _ = std::fs::create_dir_all(&root);
                // Orca 网页配对 URL 也是本机设置(带 token,只在本地)。读一次进
                // ui,会话屏 iframe 打开它;设置屏改了走 OrcaWebUrlChanged 刷新。
                let orca_web_url = Settings::get_orca_web_url(&assets).unwrap_or_default();
                let theme = Settings::get_theme(&assets).unwrap_or_default();
                let mut app = App::new(
                    root.clone(),
                    Arc::new(bw_engine::InteractiveCliExecutor::new()),
                )
                .with_pty()
                .with_asset_root(assets.clone())
                .with_progress(prog_tx.clone())
                .with_pack_ctl(pack_ctl_app);

                let mut ui = vm_build::UiState {
                    open: None,
                    session_open: None,
                    session_tab: crate::vm::SessionTab::default(),
                    kb_tab: crate::vm::KbTab::default(),
                    kb_codegraph: None,
                    kb_assets: None,
                    repo_stats: None,
                    metrics: Vec::new(),
                    focus_skill: String::new(),
                    viewing_week: bw::isoweek::current_week(),
                    viewing_plan: String::new(),
                    overview_version: String::new(),
                    view_all: true,
                    open_doc: None,
                    note: None,
                    note_seq: 0,
                    pending_drafts: None,
                    data_dir: assets.display().to_string(),
                    workspaces_root: root.display().to_string(),
                    orca_web_url,
                    theme,
                    repos: crate::vm::RepoPickerVm::default(),
                    mr_cache: std::collections::HashMap::new(),
                    od_src: String::new(),
                    od_gen: 0,
                    gather_gen: 0,
                    workbench_cache: None,
                    busy: None,
                    orca_repos_ready: std::collections::HashSet::new(),
                };

                let mut refresh_receipt = false;
                // 去会话要等嵌页在才切树。seq 对不上的 Flush 丢掉。
                let mut pending_orca_reveal: Option<bw::model::IssueId> = None;
                let mut orca_reveal_seq: u64 = 0;

                if let Some(want) = &deep_link.open {
                    match vm_build::find_project(&app, want).await {
                        Some(p) => {
                            ui.open = Some(p.id);
                            bw_engine::dlog!(
                                ok,
                                "bridge",
                                "[BW_OPEN] {want:?} -> project={} panel={:?}",
                                p.slug,
                                deep_link.panel
                            );
                        }
                        None => bw_engine::dlog!(err, "bridge", "[BW_OPEN] 找不到项目 {want:?}"),
                    }
                }

                let mut last_gather = vm_build::gather(&app, &mut ui, &[]).await;
                let mut vm = vm_build::assemble(&app, &mut ui, &last_gather).await;
                let mut open_t0: Option<Instant> = None;
                let mut open_slug = String::new();
                bw_engine::dlog!(
                    ok,
                    "bridge",
                    "[BW_BOOT] projects={} assets={}",
                    vm.projects.len(),
                    assets.display()
                );
                for t in &vm.env {
                    let state = match t.ok {
                        Some(true) => "有",
                        Some(false) => "没有",
                        None => "没探",
                    };
                    bw_engine::dlog!(
                        ok,
                        "bridge",
                        "[BW_ENV] {} = {} · {}",
                        t.label,
                        state,
                        t.detail
                    );
                }
                if let Some(o) = &vm.open {
                    bw_engine::dlog!(
                        ok,
                        "bridge",
                        "[BW_VM] project={} Issue={} 会话={} 周={} 技能(全局)={}",
                        o.slug,
                        o.board.columns.iter().map(|c| c.cards.len()).sum::<usize>(),
                        o.sessions.len(),
                        o.weeks.len(),
                        vm.settings.skills.len(),
                    );
                    let c = &o.week_counts;
                    bw_engine::dlog!(
                        ok,
                        "bridge",
                        "[BW_VM] 本周{} 待办={} 进行中={} 待评审={} 完成={} 阻塞={}",
                        o.current_week,
                        c.todo,
                        c.doing,
                        c.review,
                        c.done,
                        c.blocked,
                    );
                    bw_engine::dlog!(
                        ok,
                        "bridge",
                        "[BW_VM] 工作类别(全局)={} 定时={} 群={} 指标={} 未读={}",
                        vm.settings.stage.len(),
                        o.config.crons.len(),
                        o.config.chat_provider,
                        o.metrics.lagging.len()
                            + o.metrics.leading.len()
                            + usize::from(o.metrics.north_star.is_some()),
                        o.notify.unread,
                    );
                    // 本会话第一次打开这个项目:自动采一轮指标 + 仓统计。
                    // 不在每次重拼 VM 时跑,只在进项目这一下。
                    kick_project_collect(&app, o.id, &tx_back).await;
                    ui.set_note(Some("正在采本项目指标与仓统计…".into()));
                }
                kick_pr_fill(&last_gather, &ui, &tx_back);
                if std::env::var("BW_KB_DUMP").is_ok_and(|v| v != "0") {
                    if let Some(pid) = ui.open {
                        if let Ok(ws) = app.workspace_of(pid).await {
                            let kb = vm_kb::build_kb(&ws, crate::vm::KbTab::Docs, None);
                            for g in &kb.groups {
                                bw_engine::dlog!(
                                    ok,
                                    "bridge",
                                    "[BW_KB] 组「{}」{} 个文件",
                                    g.title,
                                    g.files.len()
                                );
                            }
                            let cg = vm_kb::build_codegraph(&ws).await;
                            bw_engine::dlog!(
                                ok,
                                "bridge",
                                "[BW_KB] 代码图 state={} 榜上 {} 行 头一名={} 头一名体积={} err={:?}",
                                cg.state,
                                cg.rows.len(),
                                cg.rows.first().map(|r| r.path.as_str()).unwrap_or("—"),
                                cg.rows.first().map(|r| r.size).unwrap_or(0),
                                cg.error
                            );
                            let releases = match app.project(pid).await {
                                Ok(Some(p)) => vm_build::load_releases(&app, &p, &ws).await,
                                _ => vec![],
                            };
                            let a = vm_kb::build_assets(&ws, releases).await;
                            bw_engine::dlog!(
                                ok,
                                "bridge",
                                "[BW_KB] 资产:蒸馏 {} · 产物 {} · 发版 {} · 仓统计 {:?}",
                                a.distilled.len(),
                                a.artifacts.len(),
                                a.releases.len(),
                                a.repo_stats
                            );
                        }
                    }
                }
                let _ = vm_tx.send(vm.clone());

                loop {
                    let Some(req) = rx.recv().await else {
                        break;
                    };
                    // 导航复用已采集数据；状态写入成功后只更新对应条目，避免重复远端查询。
                    let status_patch = matches!(
                        &req,
                        Req::Cmd(
                            Command::TransitionIssue { .. }
                                | Command::BlockIssue { .. }
                                | Command::CancelIssue { .. }
                        )
                    );
                    let reporting_log = matches!(
                        &req,
                        Req::Cmd(Command::ReportWorkbenchIssue {
                            attach_log: true,
                            ..
                        })
                    );
                    let reporting = matches!(
                        &req,
                        Req::Cmd(Command::ReportWorkbenchIssue { .. })
                    );
                    // 列表不带正文，完整重拉会覆盖单查结果，因此只更新对应正文。
                    let fetching_body = matches!(&req, Req::Cmd(Command::FetchIssue { .. }));
                    let needs_gather = matches!(
                        &req,
                        Req::Cmd(_)
                            | Req::Open(_)
                            | Req::Refresh
                            | Req::FlushOrcaReveal { .. }
                    ) && !status_patch
                        && !reporting
                        && !fetching_body;
                    match req {
                        Req::Cmd(c) => {
                            let confirming = matches!(c, Command::ConfirmWeekDraft { .. });
                            let running_issue = matches!(c, Command::RunIssue { .. });
                            // 遮罩撤了再切:开工里那次 activate 嵌页听不见。
                            let mut reveal_after_busy: Option<bw::model::IssueId> = None;
                            if running_issue {
                                ui.busy = Some(STARTING_SESSION.into());
                                let snap =
                                    vm_build::assemble(&app, &mut ui, &last_gather).await;
                                let _ = vm_tx.send(snap);
                            } else if status_patch {
                                ui.busy = Some(SWITCHING_STATUS.into());
                                let snap =
                                    vm_build::assemble(&app, &mut ui, &last_gather).await;
                                let _ = vm_tx.send(snap);
                            } else if reporting {
                                ui.busy = Some(if reporting_log {
                                    REPORTING_LOG.into()
                                } else {
                                    REPORTING.into()
                                });
                                let snap =
                                    vm_build::assemble(&app, &mut ui, &last_gather).await;
                                let _ = vm_tx.send(snap);
                            }
                            match app.dispatch(c).await {
                                Ok(events) => {
                                    ui.set_note(vm_build::note_of(&events));
                                    if let Some((_, to)) = events.iter().find_map(|e| match e {
                                        bw::command::Event::PlanVersionRenamed { from, to, .. } => {
                                            Some((from.clone(), to.clone()))
                                        }
                                        _ => None,
                                    }) {
                                        ui.viewing_plan = to;
                                    }
                                    if status_patch {
                                        if let Some((id, to, settled)) = status_patch_of(&events)
                                        {
                                            last_gather.apply_issue_status(id, to, settled);
                                        }
                                    }
                                    if fetching_body {
                                        if let Some((id, body)) = body_fetched_of(&events) {
                                            last_gather.apply_issue_body(id, body);
                                        }
                                    }
                                    if let Some((issue_id, tool)) = events.iter().find_map(|e| match e {
                                        bw::command::Event::IssueRan { id, tool, .. } => {
                                            Some((*id, tool.clone()))
                                        }
                                        _ => None,
                                    }) {
                                        ui.session_open = Some(issue_id);
                                        ui.session_tab = if tool == "open_design" {
                                            crate::vm::SessionTab::OpenDesign
                                        } else {
                                            crate::vm::SessionTab::default()
                                        };
                                        // 遮罩期间不挂 iframe。开工成功且不是 OD:
                                        // 记下树,撤遮罩挂页后再 activate(和 Open 同一条)。
                                        let started_ok = events.iter().any(|e| {
                                            matches!(
                                                e,
                                                bw::command::Event::IssueRan {
                                                    id,
                                                    ok: true,
                                                    ..
                                                } if *id == issue_id
                                            )
                                        });
                                        if running_issue
                                            && started_ok
                                            && tool != "open_design"
                                            && app
                                                .conversation_for_issue(issue_id)
                                                .await
                                                .ok()
                                                .flatten()
                                                .is_some()
                                        {
                                            reveal_after_busy = Some(issue_id);
                                        }
                                    }
                                    if let Some(id) = events.iter().find_map(|e| match e {
                                        bw::command::Event::SessionDeleted { id, .. } => Some(*id),
                                        _ => None,
                                    }) {
                                        if ui.session_open == Some(id) {
                                            ui.session_open = None;
                                        }
                                    }
                                    if confirming {
                                        ui.pending_drafts = None;
                                    }
                                    // 主检出更新后重新读取指标定义。
                                    if events.iter().any(|e| {
                                        matches!(e, bw::command::Event::WorkspacePulled { .. })
                                    }) {
                                        if let Some(pid) = ui.open {
                                            ui.metrics = Vec::new();
                                            kick_project_collect(&app, pid, &tx_back).await;
                                        }
                                    }
                                    if let Some(bw::command::Event::ProjectCreated {
                                        id,
                                        ..
                                    }) = events.first()
                                    {
                                        ui.open = Some(*id);
                                        ui.open_doc = None;
                                        ui.viewing_week = bw::isoweek::current_week();
                                        ui.viewing_plan = String::new();
                                        ui.view_all = true;
                                        ui.kb_tab = crate::vm::KbTab::default();
                                        ui.kb_codegraph = None;
                                        ui.kb_assets = None;
                                        ui.repo_stats = None;
                                        // 指标按名称匹配，切换项目必须清空，避免同名指标串数据。
                                        ui.metrics = Vec::new();
                                        ui.repos = crate::vm::RepoPickerVm::default();
                                        kick_project_collect(&app, *id, &tx_back).await;
                                        ui.set_note(Some("正在采本项目指标与仓统计…".into()));
                                        // 接入后直接进项目,不走 Req::Open。
                                        // 纳入时 Orca 没开或注入失败,这里再试一次。
                                        register_orca_repo(&app, &mut ui, *id).await;
                                    }
                                    if events.iter().any(|e| {
                                        matches!(e, bw::command::Event::ProjectRemoved { .. })
                                    }) {
                                        ui.open = None;
                                        ui.open_doc = None;
                                        ui.kb_codegraph = None;
                                        ui.kb_assets = None;
                                        ui.repo_stats = None;
                                        // 清空上一项目的指标，避免同名匹配到旧读数。
                                        ui.metrics = Vec::new();
                                    }
                                    // 改了工作区根目录:设置屏那一行要立刻显示
                                    // 新值,不能等下次重启。
                                    for e in &events {
                                        if let bw::command::Event::WorkspacesRootChanged {
                                            path,
                                            ..
                                        } = e
                                        {
                                            ui.workspaces_root = path.clone();
                                        }
                                        // Orca 网页地址改了:重读本机 settings.toml 刷新
                                        // (事件不带 URL 原文 —— 配对 URL 带 token)。
                                        if matches!(
                                            e,
                                            bw::command::Event::OrcaWebUrlChanged
                                        ) {
                                            ui.orca_web_url =
                                                Settings::get_orca_web_url(&assets)
                                                    .unwrap_or_default();
                                        }
                                        if matches!(
                                            e,
                                            bw::command::Event::ThemeChanged { .. }
                                        ) {
                                            ui.theme = Settings::get_theme(&assets)
                                                .unwrap_or_default();
                                        }
                                    }
                                }
                                Err(e) => ui.set_note(Some(format!("没做成:{e}"))),
                            }
                            if status_patch {
                                ui.busy = None;
                            }
                            if reporting {
                                ui.busy = None;
                            }
                            if running_issue {
                                ui.busy = None;
                                if let Some(iid) = reveal_after_busy {
                                    orca_reveal_seq = orca_reveal_seq.wrapping_add(1);
                                    pending_orca_reveal = Some(iid);
                                    let seq = orca_reveal_seq;
                                    if bw_engine::orca::web_embed_url(Some(&ui.orca_web_url))
                                        .is_some()
                                    {
                                        schedule_orca_flush(
                                            &tx_back,
                                            seq,
                                            ORCA_EMBED_FALLBACK,
                                        );
                                    } else {
                                        let _ = tx_back.send(Req::FlushOrcaReveal { seq });
                                    }
                                }
                                let snap =
                                    vm_build::assemble(&app, &mut ui, &last_gather).await;
                                let _ = vm_tx.send(snap);
                            }
                        }
                        Req::Open(id) => {
                            open_t0 = Some(Instant::now());
                            open_slug = match id {
                                Some(pid) => app
                                    .project(pid)
                                    .await
                                    .ok()
                                    .flatten()
                                    .map(|p| p.slug)
                                    .unwrap_or_else(|| "-".into()),
                                None => "wall".into(),
                            };
                            bw_engine::dlog!(
                                ok,
                                "bridge",
                                "open start slug={open_slug} project={id:?}"
                            );
                            if let Some(pid) = id {
                                if ui.orca_repos_ready.contains(&pid) {
                                    bw_engine::dlog!(
                                        ok,
                                        "bridge",
                                        "open peek cached slug={open_slug}"
                                    );
                                } else {
                                    let t_peek = Instant::now();
                                    match peek_orca_repo(&app, pid).await {
                                        // repo.show 只能证明仓库已登记，不能证明自动化已创建。
                                        peek @ (OrcaPeek::Present | OrcaPeek::Missing) => {
                                            bw_engine::dlog!(
                                                ok,
                                                "bridge",
                                                "open peek {:?} elapsed_ms={} slug={open_slug}",
                                                peek,
                                                t_peek.elapsed().as_millis()
                                            );
                                            ui.busy = Some(
                                                if matches!(peek, OrcaPeek::Missing) {
                                                    "正在让 Orca 认得这个仓…"
                                                } else {
                                                    "正在补打运作自动化…"
                                                }
                                                .into(),
                                            );
                                            let snap = vm_build::assemble(
                                                &app,
                                                &mut ui,
                                                &last_gather,
                                            )
                                            .await;
                                            let _ = vm_tx.send(snap);
                                            let t_reg = Instant::now();
                                            register_orca_repo(&app, &mut ui, pid).await;
                                            bw_engine::dlog!(
                                                ok,
                                                "bridge",
                                                "open register elapsed_ms={} slug={open_slug}",
                                                t_reg.elapsed().as_millis()
                                            );
                                            ui.busy = None;
                                        }
                                        OrcaPeek::Skip => {
                                            bw_engine::dlog!(
                                                ok,
                                                "bridge",
                                                "open peek skip elapsed_ms={} slug={open_slug}",
                                                t_peek.elapsed().as_millis()
                                            );
                                        }
                                    }
                                }
                            }
                            ui.open = id;
                            ui.open_doc = None;
                            ui.viewing_week = bw::isoweek::current_week();
                            ui.viewing_plan = String::new();
                            ui.overview_version = String::new();
                            ui.view_all = true;
                            ui.kb_tab = crate::vm::KbTab::default();
                            ui.kb_codegraph = None;
                            ui.kb_assets = None;
                            ui.repo_stats = None;
                            ui.metrics = Vec::new();
                            if let Some(pid) = id {
                                bw_engine::dlog!(
                                    ok,
                                    "bridge",
                                    "open collect kick slug={open_slug} (spawn, not first-screen)"
                                );
                                kick_project_collect(&app, pid, &tx_back).await;
                                ui.set_note(Some("正在采本项目指标与仓统计…".into()));
                            }
                        }
                        Req::ViewPlan(p) => {
                            ui.viewing_plan = p;
                            ui.viewing_week = String::new();
                            ui.view_all = false;
                        }
                        Req::SelectOverviewVersion(v) => {
                            ui.overview_version = v;
                        }
                        Req::ViewAll(v) => {
                            if v {
                                ui.viewing_plan = String::new();
                                ui.view_all = true;
                            }
                        }
                        Req::Note(n) => ui.set_note(Some(n)),
                        Req::OpenDoc(p) => ui.open_doc = p,
                        Req::DropDrafts => ui.pending_drafts = None,
                        Req::SelectSession(id) => {
                            // 点一张有会话行的活 = 去会话:先记下要切的树,等嵌页
                            // onload(+配对 WS)再 activate。没会话行不发(让人点▶开工)。
                            orca_reveal_seq = orca_reveal_seq.wrapping_add(1);
                            pending_orca_reveal = None;
                            if let Some(iid) = id {
                                let has_conv = app
                                    .conversation_for_issue(iid)
                                    .await
                                    .ok()
                                    .flatten()
                                    .is_some();
                                if has_conv {
                                    pending_orca_reveal = Some(iid);
                                    let seq = orca_reveal_seq;
                                    if bw_engine::orca::web_embed_url(Some(&ui.orca_web_url))
                                        .is_some()
                                    {
                                        schedule_orca_flush(&tx_back, seq, ORCA_EMBED_FALLBACK);
                                    } else {
                                        let _ = tx_back.send(Req::FlushOrcaReveal { seq });
                                    }
                                }
                            }
                            ui.session_open = id;
                            ui.session_tab = match id {
                                Some(iid) => match app.issue_or_err(iid).await {
                                    Ok(i) if i.tool == "open_design" => {
                                        crate::vm::SessionTab::OpenDesign
                                    }
                                    _ => crate::vm::SessionTab::default(),
                                },
                                None => crate::vm::SessionTab::default(),
                            };
                        }
                        Req::OrcaEmbedReady => {
                            if pending_orca_reveal.is_some() {
                                schedule_orca_flush(
                                    &tx_back,
                                    orca_reveal_seq,
                                    ORCA_PAIRING_SETTLE,
                                );
                            }
                        }
                        Req::FlushOrcaReveal { seq } => {
                            if seq == orca_reveal_seq {
                                if let Some(iid) = pending_orca_reveal.take() {
                                    if let Err(e) = app
                                        .dispatch(Command::ReopenSession { issue_id: iid })
                                        .await
                                    {
                                        ui.set_note(Some(format!("去会话没成:{e}")));
                                    }
                                }
                            }
                        }
                        Req::SessionTab(t) => ui.session_tab = t,
                        Req::KbTab(t) => {
                            ui.kb_tab = t;
                            ui.kb_codegraph = None;
                            ui.kb_assets = None;
                            // 子进程放到后台运行，避免阻塞内核命令循环。
                            let want = matches!(
                                t,
                                crate::vm::KbTab::CodeGraph | crate::vm::KbTab::Assets
                            );
                            if let (true, Some(pid)) = (want, ui.open) {
                                match app.workspace_of(pid).await {
                                    Ok(ws) => {
                                        if t == crate::vm::KbTab::CodeGraph {
                                            ui.kb_codegraph = Some(crate::vm::CodeGraphVm {
                                                state: "running".into(),
                                                hint: "正在跑 codegraph…".into(),
                                                ..crate::vm::CodeGraphVm::default()
                                            });
                                        }
                                        let back = tx_back.clone();
                                        let releases = match app.project(pid).await {
                                            Ok(Some(p)) => {
                                                vm_build::load_releases(&app, &p, &ws).await
                                            }
                                            _ => vec![],
                                        };
                                        tokio::spawn(async move {
                                            let (codegraph, assets) =
                                                if t == crate::vm::KbTab::CodeGraph {
                                                    (Some(vm_kb::build_codegraph(&ws).await), None)
                                                } else {
                                                    (
                                                        None,
                                                        Some(vm_kb::build_assets(&ws, releases).await),
                                                    )
                                                };
                                            let _ = back.send(Req::KbComputed {
                                                tab: t,
                                                codegraph,
                                                assets,
                                            });
                                        });
                                    }
                                    Err(e) => {
                                        let msg = format!("找不到这个项目的工作区:{e}");
                                        ui.set_note(Some(msg.clone()));
                                        if t == crate::vm::KbTab::CodeGraph {
                                            ui.kb_codegraph = Some(crate::vm::CodeGraphVm {
                                                state: "error".into(),
                                                error: msg,
                                                ..crate::vm::CodeGraphVm::default()
                                            });
                                        }
                                    }
                                }
                            }
                        }
                        Req::KbComputed {
                            tab,
                            codegraph,
                            assets,
                        } => {
                            if ui.kb_tab == tab {
                                ui.kb_codegraph = codegraph;
                                ui.kb_assets = assets;
                            }
                        }
                        Req::CollectRepoStats => {
                            // 在后台采集，避免子进程阻塞内核命令循环。
                            if let Some(pid) = ui.open {
                                let proj = app.project(pid).await.ok().flatten();
                                match app.workspace_of(pid).await {
                                    Ok(ws) => {
                                        let back = tx_back.clone();
                                        tokio::spawn(async move {
                                            let _ = back.send(Req::RepoStatsComputed {
                                                project: pid,
                                                stats: vm_derive::collect_repo_stats(&ws, proj.as_ref()).await,
                                            });
                                        });
                                    }
                                    Err(e) => ui.set_note(Some(format!("采不了:{e}"))),
                                }
                            }
                        }
                        // 采的时候是哪个项目,回来时还得是哪个项目 —— 不是就
                        // 整份丢掉,宁可让人再点一次,也不摆错项目的数。
                        Req::RepoStatsComputed { project, stats } => {
                            if ui.open == Some(project) {
                                ui.repo_stats = Some(stats);
                            }
                        }
                        Req::CollectMetrics => {
                            // 在后台执行采集脚本，避免阻塞内核命令循环。
                            if let Some(pid) = ui.open {
                                match app.workspace_of(pid).await {
                                    Ok(ws) => {
                                        let back = tx_back.clone();
                                        tokio::spawn(async move {
                                            let (readouts, error) =
                                                match bw::app::collect::collect_all(&ws, 5).await
                                                {
                                                    Ok(r) => (r, None),
                                                    Err(e) => (Vec::new(), Some(e)),
                                                };
                                            let _ = back.send(Req::MetricsCollected {
                                                project: pid,
                                                readouts,
                                                error,
                                            });
                                        });
                                    }
                                    Err(e) => ui.set_note(Some(format!("采不了指标:{e}"))),
                                }
                            }
                        }
                        // 采的时候是哪个项目,回来时还得是哪个项目 —— 不是就
                        // 整份丢掉,宁可让人再点一次,也不摆错项目的数。
                        Req::MetricsCollected {
                            project,
                            readouts,
                            error,
                        } => {
                            if ui.open == Some(project) {
                                ui.metrics = readouts;
                                if let Some(e) = error {
                                    ui.set_note(Some(format!("采不了指标:{e}")));
                                } else if ui.note.as_deref() == Some("正在采本项目指标与仓统计…") {
                                    ui.set_note(None);
                                }
                            }
                        }
                        Req::ListRepos { github, host } => {
                            ui.repos = crate::vm::RepoPickerVm {
                                loading: true,
                                asked: true,
                                ..Default::default()
                            };
                            let back = tx_back.clone();
                            tokio::spawn(async move {
                                let (rows, error) = list_repos(github, &host).await;
                                let _ = back.send(Req::ReposListed { rows, error });
                            });
                        }
                        Req::ReposListed { rows, error } => {
                            ui.repos.loading = false;
                            ui.repos.rows = rows;
                            ui.repos.error = error;
                        }
                        Req::PickRepo {
                            github,
                            host,
                            path,
                            git_ref,
                        } => {
                            ui.repos.picked = Some(path.clone());
                            ui.repos.prefill = None;
                            ui.repos.probe = crate::vm::RepoProbe::Loading;
                            let back = tx_back.clone();
                            tokio::spawn(async move {
                                let (prefill, probe) =
                                    fetch_prefill(github, &host, &path, &git_ref).await;
                                let _ = back.send(Req::RepoPicked {
                                    path,
                                    prefill,
                                    probe,
                                });
                            });
                        }
                        Req::PickLocalRepo { path } => {
                            ui.repos.picked = Some(path.clone());
                            ui.repos.prefill = None;
                            ui.repos.probe = crate::vm::RepoProbe::Loading;
                            let back = tx_back.clone();
                            tokio::spawn(async move {
                                let (prefill, probe) = fetch_local_prefill(&path).await;
                                let _ = back.send(Req::RepoPicked {
                                    path,
                                    prefill,
                                    probe,
                                });
                            });
                        }
                        Req::RepoPicked {
                            path,
                            prefill,
                            probe,
                        } => {
                            // 人可能在读的过程中又点了别的仓 —— 认准是不是当前
                            // 这一个,不然回来的名片会盖到另一个仓上。
                            if ui.repos.picked.as_deref() == Some(path.as_str()) {
                                ui.repos.prefill = prefill;
                                ui.repos.probe = probe;
                            }
                        }
                        Req::FocusSkill(slug) => ui.focus_skill = slug,
                        Req::PrNumbersFilled {
                            project,
                            gen,
                            entries,
                        } => {
                            // 采的时候是哪个项目、第几代 gather,回来还得对上。
                            if ui.open == Some(project) && last_gather.gen == gen {
                                for &(id, pr, open) in &entries {
                                    ui.mr_cache.insert(id, (pr, open));
                                }
                                last_gather.apply_pr_numbers(&entries);
                            }
                        }
                        Req::Refresh => {
                            if let Some(pid) = ui.open {
                                match app
                                    .dispatch(Command::PullWorkspace { project_id: pid })
                                    .await
                                {
                                    Ok(events) => {
                                        ui.set_note(vm_build::note_of(&events));
                                        ui.metrics = Vec::new();
                                        kick_project_collect(&app, pid, &tx_back).await;
                                    }
                                    Err(e) => {
                                        ui.set_note(Some(format!("没拉到最新:{e}")));
                                    }
                                }
                            }
                            refresh_receipt = true;
                        }
                    }
                    if needs_gather {
                        let keep = last_gather.projects.clone();
                        last_gather = vm_build::gather(&app, &mut ui, &keep).await;
                    }
                    let t_asm = Instant::now();
                    vm = vm_build::assemble(&app, &mut ui, &last_gather).await;
                    if needs_gather {
                        bw_engine::dlog!(
                            ok,
                            "bridge",
                            "assemble elapsed_ms={}",
                            t_asm.elapsed().as_millis()
                        );
                    }
                    if refresh_receipt {
                        refresh_receipt = false;
                        ui.set_note(Some(refresh_note(&vm)));
                        vm.note = ui.note.clone();
                        vm.note_seq = ui.note_seq;
                    }
                    let _ = vm_tx.send(vm.clone());
                    if let Some(t0) = open_t0.take() {
                        bw_engine::dlog!(
                            ok,
                            "bridge",
                            "open first-screen elapsed_ms={} slug={open_slug} gen={}",
                            t0.elapsed().as_millis(),
                            last_gather.gen
                        );
                    }
                    if needs_gather {
                        kick_pr_fill(&last_gather, &ui, &tx_back);
                    }
                }
            });
            }));
            if let Err(e) = result {
                let why = e
                    .downcast_ref::<&str>()
                    .map(|s| (*s).to_string())
                    .or_else(|| e.downcast_ref::<String>().cloned())
                    .unwrap_or_else(|| "(panic 没带可读的原因)".into());
                bw_engine::dlog!(err, "bridge", "内核线程崩了 死因:{why}");
                let _ = vm_tx_panic.send(Vm {
                    fatal: Some(format!(
                        "内核线程崩了,已经没人处理命令了 —— 请重启 Workbench。\n死因:{why}"
                    )),
                    ..Default::default()
                });
            }
        })
        .expect("内核线程起不来");

    Bridge {
        tx,
        vm: vm_rx,
        progress: prog_tx_handle,
        pack_ctl,
    }
}

fn schedule_orca_flush(tx: &mpsc::UnboundedSender<Req>, seq: u64, delay: Duration) {
    let back = tx.clone();
    tokio::spawn(async move {
        tokio::time::sleep(delay).await;
        let _ = back.send(Req::FlushOrcaReveal { seq });
    });
}

#[derive(Debug)]
enum OrcaPeek {
    Present,
    Missing,
    Skip,
}

async fn peek_orca_repo(app: &App, pid: ProjectId) -> OrcaPeek {
    let Ok(ws) = app.workspace_of(pid).await else {
        return OrcaPeek::Skip;
    };
    if !ws.is_dir() {
        return OrcaPeek::Skip;
    }
    let Ok(rt) = bw_engine::orca::connect() else {
        return OrcaPeek::Skip;
    };
    match bw_engine::orca::repo_present(&rt, &ws).await {
        Ok(true) => OrcaPeek::Present,
        Ok(false) => OrcaPeek::Missing,
        Err(e) => {
            bw_engine::dlog!(err, "bridge", "open peek fail:{e}");
            OrcaPeek::Skip
        }
    }
}

/// 仅在仓库登记和自动化创建都成功后缓存；失败时下次打开仍可重试。
async fn register_orca_repo(app: &App, ui: &mut vm_build::UiState, pid: ProjectId) {
    if ui.orca_repos_ready.contains(&pid) {
        return;
    }
    let Ok(ws) = app.workspace_of(pid).await else {
        return;
    };
    if !ws.is_dir() {
        return;
    }
    let Ok(rt) = bw_engine::orca::connect() else {
        bw_engine::dlog!(warn, "bridge", "register_orca_repo skip: Orca 没开");
        return;
    };
    match bw_engine::orca::ensure_repo(&rt, &ws).await {
        Ok(()) => match app.ensure_orca_automations(&rt, &ws).await {
            Ok(()) => {
                ui.orca_repos_ready.insert(pid);
                bw_engine::dlog!(
                    ok,
                    "bridge",
                    "register_orca_repo ok worktree={}",
                    ws.display()
                );
            }
            Err(e) => {
                bw_engine::dlog!(
                    err,
                    "bridge",
                    "register_orca_repo inject fail:{e} worktree={}",
                    ws.display()
                );
                ui.set_note(Some(format!(
                    "Orca 默认自动化未全部就绪：{e}。处理上述原因后重新打开项目可重试"
                )));
            }
        },
        Err(e) => {
            bw_engine::dlog!(
                err,
                "bridge",
                "register_orca_repo fail:{e} worktree={}",
                ws.display()
            );
            ui.set_note(Some(format!(
                "Orca 还没记下这个仓:{e} —— 退回项目墙再点进来会再打"
            )));
        }
    }
}

fn status_patch_of(events: &[Event]) -> Option<(IssueId, IssueStatus, bool)> {
    events.iter().find_map(|e| match e {
        Event::IssueTransitioned { id, to, settled } => Some((*id, *to, *settled)),
        Event::IssueBlocked { id } => Some((*id, IssueStatus::Blocked, false)),
        Event::IssueCancelled { id } => Some((*id, IssueStatus::Cancelled, false)),
        _ => None,
    })
}

fn body_fetched_of(events: &[Event]) -> Option<(IssueId, String)> {
    events.iter().find_map(|e| match e {
        Event::IssueBodyFetched { id, body } => Some((*id, body.clone())),
        _ => None,
    })
}

/// 第一屏推完再查 MR。不 await —— 占着内核线程又把切页堵回去。
fn kick_pr_fill(
    g: &vm_build::Gathered,
    ui: &vm_build::UiState,
    tx_back: &mpsc::UnboundedSender<Req>,
) {
    let Some(spec) = g.pr_fill_spec(&ui.mr_cache) else {
        return;
    };
    let pending = spec.pending.len();
    bw_engine::dlog!(
        ok,
        "bridge",
        "pr fill start pending={pending} gen={}",
        spec.gen
    );
    let back = tx_back.clone();
    tokio::spawn(async move {
        let project = spec.project_id;
        let gen = spec.gen;
        let t0 = Instant::now();
        let entries = vm_build::fill_pr_numbers_parallel(spec).await;
        bw_engine::dlog!(
            ok,
            "bridge",
            "pr fill done elapsed_ms={} n={} pending={pending} gen={gen}",
            t0.elapsed().as_millis(),
            entries.len()
        );
        let _ = back.send(Req::PrNumbersFilled {
            project,
            gen,
            entries,
        });
    });
}

/// 进项目时后台采一轮。不 await 脚本 —— 占着内核线程会卡住终端节拍。
async fn kick_project_collect(app: &App, pid: ProjectId, tx_back: &mpsc::UnboundedSender<Req>) {
    let Ok(ws) = app.workspace_of(pid).await else {
        return;
    };
    let proj = app.project(pid).await.ok().flatten();
    let back_m = tx_back.clone();
    let back_r = tx_back.clone();
    let ws_m = ws.clone();
    tokio::spawn(async move {
        let (readouts, error) = match bw::app::collect::collect_all(&ws_m, 5).await {
            Ok(r) => (r, None),
            Err(e) => (Vec::new(), Some(e)),
        };
        let _ = back_m.send(Req::MetricsCollected {
            project: pid,
            readouts,
            error,
        });
    });
    tokio::spawn(async move {
        let _ = back_r.send(Req::RepoStatsComputed {
            project: pid,
            stats: vm_derive::collect_repo_stats(&ws, proj.as_ref()).await,
        });
    });
}

#[cfg(test)]
mod onboard_tests {
    use super::fetch_local_prefill;
    use crate::vm::RepoProbe;
    use bw::repo::project_file::{self, ProjectFile};

    #[tokio::test]
    async fn local_repo_prefill_reads_the_same_project_card_as_remote_pick() {
        let root = std::env::temp_dir().join(format!("bw-local-prefill-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let status = std::process::Command::new("git")
            .args(["init", "-q"])
            .current_dir(&root)
            .status()
            .unwrap();
        assert!(status.success());
        project_file::write(
            &root,
            &ProjectFile {
                name: "Workbench".into(),
                brief: "一张工作台".into(),
                benchmark: "Orca".into(),
                opportunity: "更多项目纳入".into(),
                ..Default::default()
            },
        )
        .unwrap();

        let (prefill, probe) = fetch_local_prefill(root.to_str().unwrap()).await;
        assert!(matches!(probe, RepoProbe::Adopted));
        let prefill = prefill.unwrap();
        assert_eq!(prefill.name, "Workbench");
        assert_eq!(prefill.north_star, "更多项目纳入");

        std::fs::remove_dir_all(&root).unwrap();
    }
}
