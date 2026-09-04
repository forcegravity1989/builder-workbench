//! 内核桥:一条独立 tokio 线程拿着 `bw::App`,壳这边只发命令、收 ViewModel。
//!
//! 壳里没有一行业务判断。界面点一下 → 发一条 `Command` 过桥 → 内核执行 → 重建
//! 一份 [`Vm`] → 经 watch 通道推回来 → 界面重画。**壳自己绝不伪造成功事件**:
//! 命令失败就把失败的原话放进 `Vm::note`,不假装做成了。

mod nav;
mod vm_build;
mod vm_derive;
mod vm_kb;
mod vm_panels;

pub use nav::{
    ChromeBusy, GuideNav, Panel, PanelNav, TopView, REPORTING, REPORTING_LOG, STARTING_SESSION,
    SWITCHING_STATUS,
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

/// 启动时从环境变量读到的深链意图。
#[derive(Clone, Debug, Default)]
pub struct DeepLink {
    pub open: Option<String>,
    pub panel: Panel,
    pub view: Option<TopView>,
}

pub fn read_deep_link() -> DeepLink {
    let mut dl = DeepLink {
        open: std::env::var("BW_OPEN").ok().filter(|s| !s.is_empty()),
        ..Default::default()
    };
    if let Ok(p) = std::env::var("BW_PANEL") {
        match Panel::parse(&p) {
            Some(panel) => dl.panel = panel,
            // 认不出的值如实打出来,不静默 fallback 到某个默认屏。
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
    dl
}

/// 壳发给内核的一条请求。
pub enum Req {
    /// 一条真命令。
    Cmd(Command),
    /// 打开某个项目(纯本机导航,不改任何数据)。
    Open(Option<ProjectId>),
    /// 计划屏切到看某个计划版本。
    ViewPlan(String),
    /// 总览在研下拉选中某个覆盖当天的版本。
    SelectOverviewVersion(String),
    /// 计划屏回到全部 issue。
    ViewAll(bool),
    /// 壳侧预判失败(改名撞名等),走同一条 toast。
    Note(String),
    /// 知识库屏打开某份文档。
    OpenDoc(Option<String>),
    /// 「先不建」——把还没确认的草稿丢掉。草稿本来就没进库,丢掉不留痕。
    DropDrafts,
    /// 会话屏:选中哪个会话 / 切页签。全是纯导航,一律不进库。
    /// 有会话行时**先**记下要切的树,等嵌页 `OrcaEmbedReady` 再 `worktree.activate`;
    /// 先切树再挂 iframe,配对网页听不见跟随。
    SelectSession(Option<bw::model::IssueId>),
    /// 会话屏 Orca iframe 已经 load。配对 WS 可能还要一拍,见
    /// [`FlushOrcaReveal`]。
    OrcaEmbedReady,
    /// 嵌页已挂(或兜底超时):把挂着的那张活 `worktree.activate`。
    /// `seq` 对不上就丢掉 —— 人又点了另一张。
    FlushOrcaReveal {
        seq: u64,
    },
    SessionTab(crate::vm::SessionTab),
    /// 知识库屏切页签。代码图与资产两个页签**切过去那一刻现跑一次**
    /// (起 codegraph 子进程、走 `git log`、采仓统计),结果留到下次再点。
    KbTab(crate::vm::KbTab),
    /// 上面那一跑的结果回来了。**不是界面发的** —— 是内核自己派出去的那个任务
    /// 算完之后发回来的,见 `Req::KbTab` 的处理。
    KbComputed {
        tab: crate::vm::KbTab,
        codegraph: Option<crate::vm::CodeGraphVm>,
        assets: Option<crate::vm::AssetsVm>,
    },
    /// 总览那块「项目指标 · 代码仓级」:现采一次。
    CollectRepoStats,
    /// 总览:点「采一次指标」。把 `.bw/metrics.toml` 里可回溯的那几条真的跑
    /// 一遍(起脚本、传时间窗、读标准输出的 JSON)。**不在打开总览时自动跑**
    /// —— 一次要起好几个子进程,不该在每次进项目、每次重绘时发生。
    CollectMetrics,
    /// 上面那一采的结果。**不是界面发的**,是派出去的任务算完发回来的。
    MetricsCollected {
        project: ProjectId,
        readouts: Vec<bw::app::collect::MetricReadout>,
        error: Option<String>,
    },
    /// 上面那一采的结果。**不是界面发的**,是派出去的那个任务算完发回来的。
    /// 带着「这是给哪个项目采的」——采一次要几百毫秒,人完全来得及在这期间
    /// 切走,不认项目就会把上一个项目的提交数摆在新项目的总览上。
    RepoStatsComputed {
        project: ProjectId,
        stats: crate::vm::RepoStatsVm,
    },
    /// 接入屏:去平台列一遍「我账号下的仓」。真调 `gh repo list` /
    /// `codehub-cli`,列不出来就把原话摆出来,绝不造一份假列表。
    ListRepos {
        github: bool,
        host: String,
    },
    /// 上面那一问的结果。**不是界面发的**,是派出去的任务问完发回来的。
    ReposListed {
        rows: Vec<crate::vm::RepoRowVm>,
        error: Option<String>,
    },
    /// 接入屏:点了某一行仓 —— 去读那个仓远端的 `.bw/project.toml`,
    /// 读得到就说明这个项目已经被 Workbench 接管过,名片直接回显。
    PickRepo {
        github: bool,
        host: String,
        path: String,
        /// 去哪个分支上找 `.bw/project.toml`。列表里那一行给的默认分支;人手打
        /// 地址时是空的,那就交给引擎兜底(它会用 `main`)。**这一格要是错了,
        /// 表现就是把一个接管过的仓报成「没接管过」** —— 默认分支不叫 main 的
        /// 仓很常见。
        git_ref: String,
    },
    /// 上面那一读的结果。`prefill = None` = 那个仓还没被接管过,四个字段要人填。
    RepoPicked {
        path: String,
        prefill: Option<crate::vm::RepoPrefillVm>,
        probe: crate::vm::RepoProbe,
    },
    /// 重新算一遍并推一份新的 ViewModel。
    Refresh,
    /// 配置屏亮某一行技能(从活上的 workflow 跳过来)。
    #[allow(dead_code)]
    FocusSkill(String),
    /// 后台查完打开项目的 MR 号。**不是界面发的**。`gen` 对不上或已经换项目
    /// 就丢掉,不把上一屏的号写到这一屏。
    PrNumbersFilled {
        project: ProjectId,
        gen: u64,
        entries: Vec<(bw::model::IssueId, u32, bool)>,
    },
}

/// 桥是整个进程共用的**一个**句柄,clone 出来的都指向同一个内核线程,
/// 因此永远相等 —— 这样它才能当 Dioxus 组件的 props(props 要求 `PartialEq`,
/// Dioxus 用它判断要不要重渲染;桥本身不携带会变的状态,变的是它推过来的
/// ViewModel)。
#[derive(Clone)]
pub struct Bridge {
    tx: mpsc::UnboundedSender<Req>,
    pub vm: watch::Receiver<Vm>,
    /// 长命令的「一步一句」回执(接入项目就是靠它才不像死了)。**走 broadcast、
    /// 不走 ViewModel**:命令还没做完,ViewModel 根本没重拼的机会 —— 内核那条
    /// 队列此刻正卡在 `dispatch` 里,进度得从旁边这条道出来。
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

/// Workbench 本机数据(注册表、设置、会话)落在哪个目录。和旧壳同一个位置,
/// 但不再有 `.db` 文件 —— 全是 TOML/JSONL。`BW_DB` 仍可覆盖目录(取 parent)。
///
/// **Windows 默认落 `D:\builders-workbench\data`**(D 盘在时;与
/// [`workspaces_root`] 同根、两份平级:`data` + `workspaces`)。D 盘不在的
/// 机器退回 `%APPDATA%\BuildersWorkbench`。数据目录是进程地基,**不在设置屏
/// 热改**——要换用 `BW_DB` env(启动前设),理由见 settings 屏那条只读行。
pub fn data_dir() -> PathBuf {
    let base = if cfg!(target_os = "macos") {
        std::env::var("HOME")
            .map(|h| format!("{h}/Library/Application Support/BuildersWorkbench"))
            .ok()
    } else if cfg!(target_os = "windows") {
        // D 盘在:一个根两份(data 与 workspaces 平级,见 workspaces_root);
        // D 盘不在的机器退回 APPDATA,不硬撑一个用不了的盘符。
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
    // BW_DB 仍可覆盖(取它的 parent 当目录,向后兼容)。
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
            // Windows + D 盘在:与 data_dir 同根,`D:\builders-workbench\workspaces`。
            if cfg!(target_os = "windows") && PathBuf::from("D:\\").exists() {
                PathBuf::from("D:\\builders-workbench\\workspaces")
            } else {
                dirs_home().join(".builders-workbench").join("workspaces")
            }
        })
}

/// Workbench 自己的资产放哪(技能库摊在 `<这里>/skills/`,注册表/设置/会话也在
/// 这儿)。**跟着本机数据目录走,不跟工作区走** —— 它是 Workbench 自带的东西,
/// 和用户把仓放在哪没关系;工作区根目录是可以随时改的,资产不该跟着搬家。
pub fn asset_root() -> PathBuf {
    data_dir().join("assets")
}

fn dirs_home() -> PathBuf {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// 刷新的回执。**报刚读出来的数**,不报「读过了」—— 这样人一眼能看出刷没刷到
/// 东西:数变了就是仓里真有新东西,数没变就是确实没变化,而不是按钮坏了。
fn refresh_note(vm: &Vm) -> String {
    let tools = vm.env.iter().filter(|t| t.ok == Some(true)).count();
    match &vm.open {
        Some(p) => {
            let w = &p.week_counts;
            format!(
                "刷新完:{} · 本周 待办{} 进行中{} 评审中{} 完成{} 阻塞{} · 本机工具 {}/{} 可用",
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

/// 去平台列「我账号下的仓」。**两个平台各自的 CLI 都已经有这个能力**
/// (`github::list_repos` / `codehub::list_repos`,V3 就在用),这里只是把它接到
/// 界面上。列不出来就把 CLI 的原话端回去 —— 多半是没装、没登录、或者 codehub
/// 域名填错,这三件事人一看原话就知道该干嘛。
async fn list_repos(github: bool, host: &str) -> (Vec<crate::vm::RepoRowVm>, Option<String>) {
    // 拉满用户的仓:搜索是客户端过滤已拉到的列表(走缓存,不重新拉),
    // 所以 fetch 要一次拿全——codehub-cli 无硬上限(实测 limit 9999 拉全 158 个)、
    // gh repo list 跨页拉到 limit。下拉框另有 DROPDOWN_CAP=30 封顶,不会铺满 999。
    const LIMIT: u32 = 999;
    if github {
        match bw_engine::github::list_repos(LIMIT).await {
            Ok(rows) => (
                rows.into_iter()
                    .map(|r| crate::vm::RepoRowVm {
                        path: format!("{}/{}", r.owner, r.repo),
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
    } else if host.trim().is_empty() {
        (
            Vec::new(),
            Some("没选区 —— codehub 要 -H green/open/yellow 之一".into()),
        )
    } else {
        match bw_engine::codehub::list_repos(host.trim(), LIMIT).await {
            Ok(rows) => (
                rows.into_iter()
                    .map(|r| crate::vm::RepoRowVm {
                        path: r.path,
                        // codehub 给的是 `visibility` 字符串,不是布尔;
                        // 只有明写 private 才算私有,拿不准就不画那个锁。
                        private: r.visibility.eq_ignore_ascii_case("private"),
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
}

/// 读某个仓远端的 `.bw/project.toml`。读得到 = 这个项目已经被 Workbench 接管过
/// (你自己接过、或者同事先接的),名片四个字段直接回显,人不用再填一遍。
/// 读不到就是 `None` —— **不猜、不拿仓描述冒充名片**。
async fn fetch_prefill(
    github: bool,
    host: &str,
    path: &str,
    git_ref: &str,
) -> (Option<crate::vm::RepoPrefillVm>, crate::vm::RepoProbe) {
    use crate::vm::RepoProbe;
    let got = if github {
        match path.split_once('/') {
            Some((owner, repo)) => bw_engine::github::fetch_project_toml(owner, repo, git_ref)
                .await
                .map_err(|e| e.to_string()),
            None => Err(format!("「{path}」不是 owner/repo 的样子,没法查")),
        }
    } else if host.trim().is_empty() {
        Err("codehub 域名还没填,查不了".into())
    } else {
        bw_engine::codehub::fetch_project_toml(host.trim(), path, git_ref)
            .await
            .map_err(|e| e.to_string())
    };
    match got {
        // 平台说「没有这份文件」。但**仓根本不存在也是同一个 404** —— 地址
        // 敲错一个字母就会得到「还没接管过,请填」,人填完才发现接的是个
        // 不存在的仓。所以这一支要再问一次「这个仓在不在」,只有仓在、文件
        // 不在,才是真的没接管过。走到这支的只有没接管过的仓,多一次调用
        // 不落在常路上。
        Ok(None) => {
            let exists = if github {
                bw_engine::github::probe_repo(path)
                    .await
                    .map_err(|e| e.to_string())
            } else {
                bw_engine::codehub::probe(host.trim(), path)
                    .await
                    .map_err(|e| e.to_string())
            };
            match exists {
                Ok(_) => (None, RepoProbe::Absent),
                Err(e) => (None, RepoProbe::NoRepo(e)),
            }
        }
        // 底座只负责把远端那份文件的**原文**取回来,解析是这一层的事 ——
        // 它不认识业务文件格式。解析不了说明那份文件坏了或不是名片,
        // 那是「没查成」,**不是**「没被接管过」。
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
        // 没登录、网断了、分支名不对、文件写坏了 —— 都是「没查成」,
        // **不能**说成「没被接管过」。
        Err(e) => (None, RepoProbe::Failed(e)),
    }
}

/// 从一批事件里挑出「开始本版本」产出的草稿活标。真跑路径没有草稿(版本计划由
/// agent 会话产出、走 MR),那时候不该弹「等你确认草稿」的卡。
fn drafts_of(events: &[bw::command::Event]) -> Option<(String, Vec<String>)> {
    events.iter().find_map(|e| match e {
        bw::command::Event::WeekPlanStarted {
            week, draft_titles, ..
        } if !draft_titles.is_empty() => Some((week.clone(), draft_titles.clone())),
        _ => None,
    })
}

/// 起内核线程。返回的桥可以被界面各处 clone。
pub fn spawn(deep_link: DeepLink) -> Bridge {
    let (tx, mut rx) = mpsc::unbounded_channel::<Req>();
    let (vm_tx, vm_rx) = watch::channel(Vm::default());
    // 一条长命令十来行顶天了,64 够用;没人订的时候 send 直接丢,不阻塞。
    let (prog_tx, _) = broadcast::channel(64);

    let prog_tx_handle = prog_tx.clone();
    let pack_ctl = Arc::new(bw::app::PackCtl::new());
    let pack_ctl_app = pack_ctl.clone();
    // 内核往自己这条队列里回发用的口子(知识库那两个页签算完之后发回来)。
    let tx_back = tx.clone();

    std::thread::Builder::new()
        .name("bw-kernel".into())
        .spawn(move || {
            // 内核这条线程一处 panic 就整条死掉,而界面那头只会停在最后一份
            // ViewModel 上 —— 之后发出去的命令石沉大海,**没有任何提示**。
            // 人以为 Workbench 还在正常跑,其实早就没人接活了。裹一层,把死因送进
            // 「起不来」那块红字:**宁可显眼地坏掉,也不要安静地坏掉。**
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
                // 桌面壳里 ▶跑 打 Orca 本地 pipe,过程看会话屏 iframe。指挥器
                // 那条路仍然走自我标注的替身 —— 它没有界面渲染字节流。
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
                    repos: crate::vm::RepoPickerVm::default(),
                    mr_cache: std::collections::HashMap::new(),
                    od_src: String::new(),
                    od_gen: 0,
                    gather_gen: 0,
                    workbench_cache: None,
                    busy: None,
                    orca_repos_ready: std::collections::HashSet::new(),
                };

                // 「刷新」按下了没有。回执要等 ViewModel 拼完才写得出来。
                let mut refresh_receipt = false;
                // 去会话要等嵌页在才切树。seq 对不上的 Flush 丢掉。
                let mut pending_orca_reveal: Option<bw::model::IssueId> = None;
                let mut orca_reveal_seq: u64 = 0;

                // 深链:BW_OPEN=<slug 或项目名> 打开某个项目。
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
                // 环境条的探活结果也打出来 —— 它说「找不到 claude」的时候,人
                // 得能在终端里拿 `which claude` 当场对。2026-08-20 就栽在这上面:
                // 探活在 macOS 上恒返回「找不到」,而界面上没有任何办法核。
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
                // 打开了项目就把这一份 ViewModel 的关键计数打出来 —— 这些数
                // 都能用 codehub-cli/gh/git/cat 当场对(活 = codehub issue、
                // 会话 = session.jsonl、周 = issue 的 bw:week 标签),比截图硬。
                if let Some(o) = &vm.open {
                    bw_engine::dlog!(
                        ok,
                        "bridge",
                        "[BW_VM] project={} 活={} 会话={} 周={} 技能={}",
                        o.slug,
                        o.board.columns.iter().map(|c| c.cards.len()).sum::<usize>(),
                        o.sessions.len(),
                        o.weeks.len(),
                        o.config.skills.len(),
                    );
                    // 总览「版本计划与进展」的五段。**只认在研版本**,与计划屏
                    // 左栏看的是哪一周无关 —— 这一行就是那条纪律的读回。
                    let c = &o.week_counts;
                    bw_engine::dlog!(
                        ok,
                        "bridge",
                        "[BW_VM] 本周{} 待办={} 进行中={} 评审中={} 完成={} 阻塞={}",
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
                        "[BW_VM] 映射={} 定时={} 群={} 指标={} 未读={}",
                        o.config.mappings.len(),
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
                // BW_KB_DUMP=1:把知识库三个页签的数字打进 stderr,好让人拿
                // `git ls-files` / `codegraph files -j` / `cat .bw/releases.md`
                // 当场对。截图对不了数,这个能。
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
                            let issues = app.issues(pid).await.unwrap_or_default();
                            let usage = bw::app::workflow_usage(&issues);
                            let releases = match app.project(pid).await {
                                Ok(Some(p)) => vm_build::load_releases(&app, &p, &ws).await,
                                _ => vec![],
                            };
                            let a = vm_kb::build_assets(&usage, &ws, releases).await;
                            bw_engine::dlog!(
                                ok,
                                "bridge",
                                "[BW_KB] 资产:技能 {} · 蒸馏 {} · 产物 {} · 发版 {} · 仓统计 {:?}",
                                a.skills.len(),
                                a.distilled.len(),
                                a.artifacts.len(),
                                a.releases.len(),
                                a.repo_stats
                            );
                        }
                    }
                }
                // gather 已经把 warnings 打进对照日志,这里不再打第二遍。
                let _ = vm_tx.send(vm.clone());

                // 定时判据 60s 一次 —— 它查的是「本周有没有那张活」,快一点慢一点都
                // 不影响结论。(终端字节 60ms 节拍已随 PTY 封存删掉 —— 桌面 ▶跑 走
                // Orca 本地 pipe,字节在 Orca 那个 tab 里,不经过 Workbench。)
                let mut sched_tick = tokio::time::interval(Duration::from_secs(60));
                loop {
                    let req = tokio::select! {
                        r = rx.recv() => match r {
                            Some(r) => r,
                            None => break,
                        },
                        _ = sched_tick.tick() => {
                            // 特性9:fanout —— 遍历所有纳管项目逐个查
                            // cron_enabled + 到点建活,不再只对打开着的项目跑
                            // (已拍板)。tick_scheduler 本身单项目
                            // 幂等,到点没到点、本周有没有那张活都原地返空;
                            // cron_enabled=false 也自己挡掉(高优1)。
                            let mut note: Option<String> = None;
                            if let Ok(projects) = app.projects().await {
                                for p in &projects {
                                    match app
                                        .dispatch(Command::TickScheduler { project_id: p.id })
                                        .await
                                    {
                                        Ok(events) if events.is_empty() => {}
                                        Ok(events) => {
                                            note = vm_build::note_of(&events);
                                        }
                                        Err(e) => {
                                            note = Some(format!("定时没跑成:{e}"))
                                        }
                                    }
                                }
                            }
                            if let Some(n) = note {
                                ui.set_note(Some(n));
                            }
                            // 到点可能建活。打开着某个仓只重采那一个;在墙上才拉全墙。
                            let keep = last_gather.projects.clone();
                            last_gather = vm_build::gather(&app, &mut ui, &keep).await;
                            vm = vm_build::assemble(&app, &mut ui, &last_gather).await;
                            let _ = vm_tx.send(vm.clone());
                            kick_pr_fill(&last_gather, &ui, &tx_back);
                            continue;
                        }
                    };
                    // 纯导航(切周 / 点总览 / 选卡片看详情 / 切页签 / 展开
                    // 目录 / 后台采回发 / MR 回填)不重跑 gather —— 复用上次
                    // 采的那份,只重切依赖视图字段的片段。真命令、换项目、刷新、
                    // FlushOrcaReveal 可能改了底层数据,才重 gather。
                    // 只改一张活状态标签(拖拽 / 详情下拉)写成功后补丁
                    // last_gather,不重拉 issue list。SelectSession 只记账等
                    // 嵌页,走快路径。设计见 ADR 0002。
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
                    let needs_gather = matches!(
                        &req,
                        Req::Cmd(_)
                            | Req::Open(_)
                            | Req::Refresh
                            | Req::FlushOrcaReveal { .. }
                    ) && !status_patch
                        && !reporting;
                    match req {
                        Req::Cmd(c) => {
                            let confirming = matches!(c, Command::ConfirmWeekDraft { .. });
                            // 计划屏 Start 和总览「开始本周」都会 create 会话,
                            // 同一块遮罩挡住嵌页。
                            let running_issue = matches!(
                                c,
                                Command::RunIssue { .. }
                                    | Command::StartWeekPlanning { .. }
                            );
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
                                    // 「开始本周」产出的草稿活标先接住,等人在计划屏
                                    // 点确认才真的建活。
                                    if let Some((week, titles)) = drafts_of(&events) {
                                        ui.pending_drafts = Some((week, titles));
                                    }
                                    // 「开始本周」起了一场会话,就把它选中 ——
                                    // 总览那颗按钮会把人带到会话屏,落地时该正
                                    // 好停在这场会话上,而不是让人自己在左列里
                                    // 找哪一条是刚才那下点出来的。
                                    if let Some((issue_id, tool)) = events.iter().find_map(|e| match e {
                                        bw::command::Event::WeekPlanStarted { issue_id, .. } => {
                                            Some((*issue_id, String::new()))
                                        }
                                        bw::command::Event::IssueRan { id, tool, .. } => {
                                            Some((*id, tool.clone()))
                                        }
                                        _ => None,
                                    }) {
                                        ui.session_open = Some(issue_id);
                                        // 原型活停 Open Design,构建类停 Orca(终端
                                        // 页签随 PTY 封存删了)。两个 iframe 都自己探
                                        // 本机,这里不灌 src。
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
                                    // 拉完主检出必须重采:同事合进去的 metrics.toml
                                    // 不重读,界面会继续显示「旧格式」那句拒收。
                                    if events.iter().any(|e| {
                                        matches!(e, bw::command::Event::WorkspacePulled { .. })
                                    }) {
                                        if let Some(pid) = ui.open {
                                            ui.metrics = Vec::new();
                                            kick_project_collect(&app, pid, &tx_back).await;
                                        }
                                    }
                                    // 接完一个项目就把它打开 —— 人点「完成接入」
                                    // 要的是进这个项目,不是停在接入屏上自己再点
                                    // 一遍项目墙。
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
                                        // 指标按名字对上去,两个项目撞名就会
                                        // 把上一个项目的数摆在这个项目的卡片上。
                                        ui.metrics = Vec::new();
                                        ui.repos = crate::vm::RepoPickerVm::default();
                                        kick_project_collect(&app, *id, &tx_back).await;
                                        ui.set_note(Some("正在采本项目指标与仓统计…".into()));
                                    }
                                    // 项目被移走了:它要是正开着,得回项目墙 ——
                                    // 留在一个已经不存在的项目上,整屏都是空的。
                                    if events.iter().any(|e| {
                                        matches!(e, bw::command::Event::ProjectRemoved { .. })
                                    }) {
                                        ui.open = None;
                                        ui.open_doc = None;
                                        ui.kb_codegraph = None;
                                        ui.kb_assets = None;
                                        ui.repo_stats = None;
                                        // 指标读数同理:留着就是把上一个项目的数
                                        // 摆在这个项目的卡片上——而且指标是**按名字**
                                        // 对上去的,两个项目撞名就真会显示错的那个数。
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
                                    }
                                }
                                // 失败就把失败的原话摆出来。壳不替内核圆场。
                                Err(e) => ui.set_note(Some(format!("没做成:{e}"))),
                            }
                            if status_patch {
                                ui.busy = None;
                            }
                            if reporting {
                                ui.busy = None;
                            }
                            if running_issue {
                                // create / run_issue 已经回来。先撤遮罩把嵌页挂上,
                                // 别等后面 gather(issue list / mr list)再撤 ——
                                // 「开始本周」那一刀比计划屏 Start 多建一张活,
                                // gather 又更慢,遮罩会和 Start 差一截。
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
                                        OrcaPeek::Present => {
                                            ui.orca_repos_ready.insert(pid);
                                            bw_engine::dlog!(
                                                ok,
                                                "bridge",
                                                "open peek present elapsed_ms={} slug={open_slug}",
                                                t_peek.elapsed().as_millis()
                                            );
                                        }
                                        OrcaPeek::Missing => {
                                            bw_engine::dlog!(
                                                ok,
                                                "bridge",
                                                "open peek missing elapsed_ms={} slug={open_slug}",
                                                t_peek.elapsed().as_millis()
                                            );
                                            ui.busy = Some("正在让 Orca 认得这个仓…".into());
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
                            // 知识库那两个页签的结果是**上一个项目**的:它的技能
                            // 清单、它的 git 产物、它的发版记录、它的仓统计。留着
                            // 的话换个项目点进去,一屏数字没有一个是这个项目的,
                            // 而且什么提示都没有。一律清空,让它显示「点一下就现扫」。
                            ui.kb_tab = crate::vm::KbTab::default();
                            ui.kb_codegraph = None;
                            ui.kb_assets = None;
                            // 仓统计同理:留着就是把上一个项目的提交数摆在这个
                            // 项目的总览上。
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
                            // 每次点页签就是一次全新的现跑 —— 不缓存,和「对账
                            // 是纯读操作不需要缓存」同一个取舍。
                            ui.kb_codegraph = None;
                            ui.kb_assets = None;
                            // **派出去算,不在这条循环里等**。这两样各要起好几个
                            // 子进程(codegraph、git log、仓统计),在这里 await
                            // 就等于把内核这条单线程连同 60ms 的终端节拍一起按住
                            // —— 人正看着 agent 刷屏时点一下「代码图」,终端就卡住
                            // 了。算完经 KbComputed 发回来。
                            let want = matches!(
                                t,
                                crate::vm::KbTab::CodeGraph | crate::vm::KbTab::Assets
                            );
                            if let (true, Some(pid)) = (want, ui.open) {
                                match app.workspace_of(pid).await {
                                    Ok(ws) => {
                                        // 先摆「正在跑」,不然点「重新跑一次」会先闪
                                        // 成「点一下页签就现跑」,算得快时整页像没动。
                                        if t == crate::vm::KbTab::CodeGraph {
                                            ui.kb_codegraph = Some(crate::vm::CodeGraphVm {
                                                state: "running".into(),
                                                hint: "正在跑 codegraph…".into(),
                                                ..crate::vm::CodeGraphVm::default()
                                            });
                                        }
                                        let back = tx_back.clone();
                                        let issues = app.issues(pid).await.unwrap_or_default();
                                        let usage = bw::app::workflow_usage(&issues);
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
                                                        Some(
                                                            vm_kb::build_assets(
                                                                &usage, &ws, releases,
                                                            )
                                                            .await,
                                                        ),
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
                                        // 工作区找不到**不能静默什么都不做** —— 人
                                        // 点了按钮却毫无反应,只会以为按钮坏了。
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
                            // 算的时候人可能已经切走了。结果就丢掉 —— 把上一个
                            // 页签的数字贴到当前页签上比不显示更糟。
                            if ui.kb_tab == tab {
                                ui.kb_codegraph = codegraph;
                                ui.kb_assets = assets;
                            }
                        }
                        Req::CollectRepoStats => {
                            // 和知识库那两个页签同一个做法:派出去算,不在这条
                            // 循环里 await —— 它要起好几个 git 子进程,在这里等
                            // 就把内核这条单线程连同终端的 60ms 节拍一起按住。
                            if let Some(pid) = ui.open {
                                // 走势那条要问远端「这一周合入了几个 PR」,所以
                                // 得把项目一起带上(远端地址在它身上)。取不到
                                // 项目就只能不采 —— 不拿一个空壳项目去问远端。
                                // 项目行读不出来**不能静默什么都不做** —— 人点了
                                // 按钮却毫无反应,只会以为按钮坏了(评审抓的)。
                                // git 那几项本来就不需要项目行,照采;只有远端那条
                                // 线缺了地址,如实说一句。
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
                            // 和上面那一采同一个做法:派出去跑,不在这条循环里
                            // await —— 它要起好几个采集脚本(每个还可能连远端),
                            // 在这里等就把内核这条单线程连同终端的节拍一起按住。
                            if let Some(pid) = ui.open {
                                // 没有工作区就采不了 —— **如实说一句,别让人以为
                                // 按钮坏了**(和上面那一采同一条教训)。
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
                            // 起子进程要几百毫秒到几秒,不能占着内核这条单线程
                            // ——派出去,回来再发一条 Req。
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
                            // 顶栏「刷新」以前只重拼 ViewModel、不拉仓。同事把
                            // v2 指标合进远端之后,本机仍停在旧提交,点刷新还是
                            // 「旧格式拒收」。打开着的项目先快进主检出,再重采。
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
                    // 纯导航 / 状态标签补丁复用上次 gather,不重跑;换项目 /
                    // 刷新 / 开工合入建活 / FlushOrcaReveal 在 match 前判过
                    // needs_gather,这里重 gather。
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
                    // 刷新的回执在这里补:此刻的 vm 才是「刚读出来的那一份」。
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
                // panic 的负载通常是 &str 或 String,取不出来就如实说取不出来,
                // 不编一个原因。
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

/// 打开项目先问 Orca 这仓在不在。正本是 `repo.show`,内存表只加速连点。
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

/// 打开项目时把被管仓登记进 Orca。先 `repo.show`,没有才 `repo.add`。
/// 已问过且在的项目这个进程里不再打。Orca 没开不挡进项目。
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
                "register_orca_repo fail:{e} worktree={}",
                ws.display()
            );
        }
    }
}

/// 写远端成功后,从回执里取出「哪张活到了哪一态」。没有这类回执 = 不是状态补丁。
fn status_patch_of(events: &[Event]) -> Option<(IssueId, IssueStatus, bool)> {
    events.iter().find_map(|e| match e {
        Event::IssueTransitioned { id, to, settled } => Some((*id, *to, *settled)),
        Event::IssueBlocked { id } => Some((*id, IssueStatus::Blocked, false)),
        Event::IssueCancelled { id } => Some((*id, IssueStatus::Cancelled, false)),
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
