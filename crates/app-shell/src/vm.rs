use bw::model::{ConversationId, IssueId, IssueKind, IssueStatus, ProjectId, Signal};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Vm {
    pub ready: bool,
    pub fatal: Option<String>,
    pub projects: Vec<ProjectCardVm>,
    pub env: Vec<ToolProbeVm>,
    /// 打开了哪个项目。`None` = 还在项目墙。
    pub open: Option<ProjectVm>,
    pub settings: SettingsVm,
    pub note: Option<String>,
    /// 每条通知独立编号，相同内容再次出现时仍可显示。
    pub note_seq: u64,
    pub busy: Option<String>,
    pub repos: RepoPickerVm,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RepoPickerVm {
    /// 正在问平台。界面上是「列着…」,不是空列表 —— 空列表会被读成「你没有仓」。
    pub loading: bool,
    /// 问过一次了没有。没问过 = 界面上是一个「列出我的仓」按钮,不是「一个都没有」。
    pub asked: bool,
    pub error: Option<String>,
    pub rows: Vec<RepoRowVm>,
    pub picked: Option<String>,
    pub prefill: Option<RepoPrefillVm>,
    /// 文件不存在与查询失败分别展示；失败不能触发空表单。
    pub probe: RepoProbe,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub enum RepoProbe {
    #[default]
    NotAsked,
    Loading,
    Adopted,
    /// 已确认仓库存在，但没有项目约定文件。
    Absent,
    /// 仓库不存在或无访问权限。
    NoRepo(String),
    /// 查询失败，保留错误原因。
    Failed(String),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RepoRowVm {
    /// `owner/repo`,直接就是要填进「远端地址」的那个值。
    pub path: String,
    pub private: bool,
    pub description: String,
    pub default_branch: String,
    /// 平台给的最近推送时间原文(可能是空的)。
    pub pushed_at: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RepoPrefillVm {
    pub name: String,
    pub brief: String,
    pub benchmark: String,
    pub north_star: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SettingsVm {
    pub workspaces_root: String,
    /// 界面配色:`claude` / `apple`。空 = 默认(claude)。
    pub theme: String,
    /// Orca 网页配对 URL(带 token,只在本地)。设置屏可改;会话屏 iframe 打开它。
    pub orca_web_url: String,
    /// Workbench 本机数据目录(注册表 / 设置 / 会话都在这下面)。刀6 起不再有 SQLite
    /// 库文件,这格显示的是 asset_root 目录名,不是 DB 路径。
    pub data_dir: String,
    pub claude_binary: Option<String>,
    /// 「能力」一节的五张表,见 `docs/05-features/capability-panel/spec.md`。
    pub connectors: Vec<ConnectorVm>,
    pub skills: Vec<SkillVm>,
    pub stage: Vec<StageRowVm>,
    pub plugins: Vec<PluginVm>,
    pub assets: Vec<AssetRowVm>,
    /// `assets` 的「现在哪几张活在用」是扫哪个项目算出来的。空 = 当时没打开
    /// 任何项目,那一列全空**不代表**「没有活在用」,是没数据可扫。
    pub assets_open_project: String,
    /// 从活详情点 workflow 跳过来时,Skills 列表要亮哪一行(slug)。空 = 没指定。
    pub focus_skill: String,
    /// 桌面宠物探活(Connector 页「Clawd on Desk」详情用)。
    pub clawd: ClawdProbeVm,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProjectCardVm {
    pub id: ProjectId,
    pub slug: String,
    pub name: String,
    pub brief: String,
    pub signal: Option<Signal>,
    pub workspace_path: String,
    pub remote: String,
    /// `remote` 的机读版:`"github"` / `"codehub"` / `""`(没挂远端)。
    /// 设置屏 Connector 页靠它统计「谁用到 gh / codehub」,不解析 `remote`
    /// 那句人话。
    pub remote_provider: String,
    /// 项目群提供方机读键(`"welink"` / `""`)。**只在项目墙整墙采集时读得到**
    /// (`.bw/project.toml` 现读一次);打开了某个项目时其余卡片沿用上次结果,
    /// 这一格就留空 —— 空不等于「没配群」,是「这一轮没重读」。
    pub chat_provider: String,
    pub week_total: u32,
    pub week_done: u32,
    pub version: String,
    /// 当前 ISO 周,卡片上那个周 chip 显示它。
    pub week: String,
    pub unread: u32,
    pub week_goal: String,
    pub last_delivery: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ToolProbeVm {
    pub name: String,
    pub label: String,
    /// `Some(true)` 探到、`Some(false)` 没装、`None` 还没接实现(灰,不是红)。
    pub ok: Option<bool>,
    pub detail: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ProjectVm {
    pub id: ProjectId,
    pub slug: String,
    pub name: String,
    pub card: CardVm,
    pub health: HealthVm,
    pub metrics: MetricsVm,
    pub current_week: String,
    /// 总览可选的在研版本，来自版本计划 Issue；不是里程碑日期范围。
    pub covering_versions: Vec<String>,
    pub last_released: String,
    pub unreleased: Vec<String>,
    pub suggested_next: String,
    /// 空表示没有在研版本。
    pub confirmed_version: String,
    pub bootstrap_pending: Option<CardMrVm>,
    pub weeks: Vec<WeekVm>,
    /// 正在看哪一周(节律用,不再当排期名)。
    pub viewing_week: String,
    /// 看哪个版本。空 = 「全部」。
    pub viewing_plan: String,
    pub view_all: bool,
    pub board: BoardVm,
    pub plan_versions: Vec<PlanVersionVm>,
    /// 当前登录用户名(给列表「我的」筛选用)。空 = 认不出。
    pub current_user: String,
    pub week_counts: WeekCountsVm,
    /// 计划屏所选版本的计数，与总览所选版本相互独立。
    pub board_counts: WeekCountsVm,
    pub ops: Vec<OpsChipVm>,
    /// 计划屏所选周的例行工作状态。
    pub board_ops: Vec<OpsChipVm>,
    pub repo_stats: Option<RepoStatsVm>,
    /// 待确认的 issue 标题，尚未创建远端 issue。
    pub pending_drafts: Vec<String>,
    pub releases: Vec<ReleaseVm>,
    pub sessions: Vec<SessionVm>,
    pub session_open: Option<IssueId>,
    /// MR 网页地址前缀；SSH origin 不能直接用作网页地址。
    pub mr_url_prefix: String,
    pub issue_url_prefix: String,
    /// 为空表示未配置远端或平台无法识别。
    pub remote_brand: String,
    pub workbench: WorkbenchVm,
    pub notify: NotifyVm,
    pub config: ConfigVm,
    pub kb: KbVm,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CardVm {
    pub brief: String,
    pub benchmark: String,
    pub north_star: String,
    pub remote: String,
    /// 在研版本,**显示用**:空的时候是「(空)」。
    pub current_version: String,
    /// 在研版本,**机读用**:空就是空。
    pub current_version_raw: String,
    pub standard_version: String,
    pub chat: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct HealthVm {
    pub signal: Option<Signal>,
    pub reasons: Vec<(bool, String)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct MetricsVm {
    pub north_star: Option<MetricCardVm>,
    pub lagging: Vec<MetricCardVm>,
    pub leading: Vec<MetricCardVm>,
    pub collected: bool,
    pub note: Option<String>,
    /// 文件存在但读取或解析失败；与文件尚未创建区分。
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MetricCardVm {
    pub id: String,
    pub name: String,
    /// 本周读数。`None` = 没读数,显示「无数据」而不是 0。
    pub reading: Option<String>,
    /// `.bw/metrics.toml` 里写的目标。空 = 还没定目标,显示「目标未设」。
    pub target: String,
    pub def: String,
    pub manual: bool,
    pub source: String,
    pub collected_at: String,
    pub driving: Vec<String>,
    /// 这条属于哪一类:可回溯 / 不可回溯 / 手填。**空 = 还没读到定义。**
    pub class: String,
    /// None 表示未采集到当前值，不能以 0 或历史值替代。
    pub collected: Option<String>,
    /// 近几周走势,旧的在前。采不到的点是 `None`,画的时候断开,不补前值。
    pub trend: Vec<(String, Option<f64>)>,
    /// 近 14 个日历日走势。没日行的格是 `None`,断开,不补 0。
    pub day_trend: Vec<(String, Option<f64>)>,
    /// `.bw/metrics.toml` 的 `feature`。空 = 总览「主要」页签。
    pub feature: String,
    /// 引领盯的滞后 `name`。空 = 同页签第一条滞后。滞后 / 北极星上无意义。
    pub leads: String,
    /// 这次为什么没采到。空 = 采到了,或者压根不该采。**不吞错误。**
    pub collect_error: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WeekVm {
    pub week: String,
    pub goal: Option<String>,
    pub activity_count: u32,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WeekCountsVm {
    pub todo: usize,
    pub doing: usize,
    pub review: usize,
    pub done: usize,
    pub blocked: usize,
}

impl WeekCountsVm {
    pub fn total(&self) -> usize {
        self.todo + self.doing + self.review + self.done + self.blocked
    }

    pub fn pct(&self, n: usize) -> u32 {
        if self.total() == 0 {
            0
        } else {
            (n * 100 / self.total()) as u32
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct OpsChipVm {
    pub title: String,
    pub status: String,
    pub note: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RepoStatsVm {
    /// `(数值, 这个数是什么, 从哪采的)`。压成一行小字,不再是一格格的卡片。
    pub items: Vec<(String, String, String)>,
    pub trend: Vec<TrendPointVm>,
    /// 近 14 个日历日走势,旧的在前。没采到的点是 `None`。
    pub day_trend: Vec<TrendPointVm>,
    pub git_note: String,
    pub trend_note: String,
    pub error: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TrendPointVm {
    pub week: String,
    /// None 表示未采集到，图上断开，不补零。
    pub commits: Option<u32>,
    pub merged_prs: Option<u32>,
    /// 这一周周末那一刻还没关闭的 issue 数。**存量,不是流量。**
    pub open_issues: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CardMrVm {
    pub issue_id: Option<IssueId>,
    pub number: u32,
    pub status: String,
    pub pr_number: u32,
    /// 是否显示“合入并完成”操作。
    pub mergeable: bool,
    pub has_open_mr: bool,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct BoardVm {
    pub columns: Vec<ColumnVm>,
    pub pool_label: String,
    pub todo_label: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ColumnVm {
    pub status: IssueStatus,
    pub title: String,
    pub cards: Vec<CardItemVm>,
    pub segments: Vec<ColumnSegVm>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ColumnSegVm {
    pub key: String,
    pub label: String,
    pub statuses: Vec<IssueStatus>,
    pub count: u32,
    pub cards: Vec<CardItemVm>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CardItemVm {
    pub id: IssueId,
    pub number: u32,
    pub title: String,
    pub category: String,
    pub tool: String,
    pub workflow: String,
    pub kind: IssueKind,
    pub origin: String,
    pub week_of: String,
    pub version: String,
    pub metric_key: String,
    pub settled: bool,
    pub status: IssueStatus,
    /// 远端 MR 号。0 = 没有 MR。开着的或已合入的都算,详情链接用它。
    pub pr_number: u32,
    pub has_open_mr: bool,
    /// 远端 issue 号。0 = 此 Issue只在本机,没有对应的远端 issue。
    pub remote_number: u32,
    pub branch: String,
    pub body: String,
    pub assignee: String,
    pub author: String,
    /// 排进人起名的版本(`bw:plan:*`)。可同时属于历史版本和当前版本。
    pub plan_versions: Vec<String>,
    /// 交付在哪个版本(`bw:released:*`)。空 = 尚未随版本交付。
    pub released_version: String,
    /// 最近更新时间(unix 秒)。0 = 认不出。卡片「已更新」用它现算相对时间。
    pub updated_at: i64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PlanVersionVm {
    pub name: String,
    pub start: String,
    pub end: String,
    pub created_at: String,
    pub issue_count: u32,
    pub released: bool,
    pub goal: String,
    pub week_progress: String,
    pub counts: WeekCountsVm,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReleaseVm {
    pub version: String,
    pub released_at: String,
    pub note: String,
    pub included: String,
    pub origin: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SessionVm {
    pub issue_id: IssueId,
    pub conversation_id: ConversationId,
    pub issue_number: u32,
    pub issue_title: String,
    pub issue_status: String,
    pub branch: String,
    pub workspace_path: String,
    /// claude 的 resume id。空 = 还没捕获到,如实留空。
    pub session_id: String,
    /// 尚未接入 Orca 的运行状态，当前为 false。
    pub live: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SessionTab {
    #[default]
    Orca,
    OpenDesign,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct WorkbenchVm {
    pub tab: SessionTab,
    /// 当前打开的会话对应 Issue的开工工具(`claude_cli`/`cursor`/`open_design`)。
    /// 默认页签按它选:open_design → OpenDesign,其余 → Orca。空 = 没选中会话。
    pub tool: String,
    /// Open Design iframe。空 = 组件自己探首页。
    pub od_src: String,
    pub od_gen: u64,
    /// Orca 网页配对 URL(本机设置读出来,带 token)。会话屏 iframe 打开它;
    /// `BW_ORCA_WEB_URL` 在 `web_embed_url` 里覆盖。空 = 没配,会话屏空着。
    pub orca_web_url: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct NotifyVm {
    /// 待评审 issue 数量，不记录是否已读。
    pub unread: u32,
}

/// 项目内配置屏。**能力**(开工工具映射 / 技能与 workflow)已经搬去设置屏
/// (它们本来就是全局的,`Settings.tools` 没有项目维度)。这里只留真正跟
/// 项目走的三样:远端、项目群、节律。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ConfigVm {
    pub remote: String,
    /// 定时节律:残留 issue-policy 或产品默认。
    pub cadence: String,
    /// 节律拆成表格行:哪张运作活、怎么触发、判据是什么。
    pub crons: Vec<CronVm>,
    /// 项目群三件:提供方 / 群号 / 同步哪些事件。仓是正本,这里只显示。
    pub chat_provider: String,
    pub chat_group: String,
    pub chat_events: Vec<(String, bool)>,
    /// `.bw/project.toml` 的 `[chat]` 段:项目群。**仓是正本**,这里只显示;
    /// 改它走总览「项目约定」那张轻量活 + MR。
    pub chat: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SkillVm {
    pub slug: String,
    pub title: String,
    pub uses: u32,
    pub origin: String,
    /// SKILL.md 头里的 `description:`。读不到就空着,不替它写一句。
    pub desc: String,
    /// Claude 那样的归属行:`by Builders' Workbench` / `by Matt Pocock`(业界
    /// 引入)/ `Created by you`(项目自己仓里写的)。空 = 不知道挂谁的名。
    pub byline: String,
    /// 项目自有技能来自哪个项目(项目名)。内置 / vendor 的是空。
    pub project: String,
    /// **能不能真被注入**——`skill_pointer` 三道门(硬编码 `skill_slug` 匹配、
    /// 只找编进二进制的 5 份、路径只拼 Workbench 自己的资产目录)今天只放行
    /// 三个名字。`uses` 是按名字匹配现算的,和这个字段**不是一回事**——
    /// `uses > 0` 不代表注入过,`injectable` 才是「今天开工真会读到它」的
    /// 实话。见 `docs/05-features/capability-panel/intent.md` ⑪。
    pub injectable: bool,
    /// 文件个数(入口 SKILL.md + sidecar)。给「文件 · N」页签用。
    pub file_count: usize,
}

/// 定时那张表的一行。**没有定时表** —— 判据是「本周有没有这张活」,
/// 所以这里没有「下次触发时间」那一列,有的是「判据」。
#[derive(Clone, Debug, PartialEq)]
pub struct CronVm {
    pub name: String,
    /// `manual` / `scheduled`,翻成人话。
    pub trigger: String,
    /// 形如 `fri 20:00`;手动触发的就是「—」。
    pub schedule: String,
    /// 到底看什么才算「该跑了」。
    pub rule: String,
}

// ── 设置屏 · Connector / Skills / Stage / Plugins / AI Assets ──────────
//
// 见 `docs/05-features/capability-panel/spec.md`。都是全局的(不挂哪个
// 项目),壳的 VM 层现拼,不进内核 —— 「谁用到」这类判据是纯展示口径。

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectorKind {
    /// 开工执行器:claude / cursor-agent / Open Design。
    Executor,
    /// 远端臂:gh / codehub-cli。
    Remote,
    /// 群通知:welink-cli。
    Chat,
    /// 会话宿主:Orca。
    Host,
    /// 桌面宠物:Clawd on Desk(Workbench 只往它推状态)。
    Companion,
}

impl ConnectorKind {
    pub fn label(self) -> &'static str {
        match self {
            ConnectorKind::Executor => "执行器",
            ConnectorKind::Remote => "仓库平台",
            ConnectorKind::Chat => "群通知",
            ConnectorKind::Host => "会话宿主",
            ConnectorKind::Companion => "桌面宠物",
        }
    }

    pub const ALL: [ConnectorKind; 5] = [
        ConnectorKind::Executor,
        ConnectorKind::Remote,
        ConnectorKind::Chat,
        ConnectorKind::Host,
        ConnectorKind::Companion,
    ];
}

/// 着色口径见 spec.md §2.2:只有「有活会用到、却不在」才是红色。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectorStatus {
    Found,
    /// 有活会用到它,却探不到 —— 现在就会挡住开工。
    Blocked,
    /// 没人用到它,也没探到。
    Idle,
    /// 要填配置才能用,还没填(今天只有 Orca)。
    Unconfigured,
    /// 填了配置,但没有探活实现,不能说「通了」(今天只有 Orca)。
    ConfiguredNoProbe,
    /// 这项探活还没接实现。
    NotProbed,
}

impl ConnectorStatus {
    pub fn label(self) -> &'static str {
        match self {
            ConnectorStatus::Found => "已找到",
            ConnectorStatus::Blocked => "开不了工",
            ConnectorStatus::Idle => "还没用上",
            ConnectorStatus::Unconfigured => "还没配",
            ConnectorStatus::ConfiguredNoProbe => "配了",
            ConnectorStatus::NotProbed => "尚不支持检测",
        }
    }

    /// 汇总条 + 图例用的色点类(`c-done`/`c-blocked`/`c-unset`/`c-idle`)。
    pub fn dot_class(self) -> &'static str {
        match self {
            ConnectorStatus::Found => "c-done",
            ConnectorStatus::Blocked => "c-blocked",
            ConnectorStatus::Unconfigured | ConnectorStatus::ConfiguredNoProbe => "c-unset",
            ConnectorStatus::Idle | ConnectorStatus::NotProbed => "c-idle",
        }
    }
}

/// 桌面宠物(Clawd on Desk)探活三样,分开取、分开显示,不合成一个「好坏」——
/// 卡在哪一步一眼看得出。见 `docs/05-features/desktop-pet/spec.md`。
#[derive(Clone, Debug, PartialEq)]
pub struct ClawdProbeVm {
    /// Workbench 自己这个可执行文件;人在 Clawd 里加发现路径要指向它所在目录。
    pub exe: String,
    /// Workbench 按 Clawd 同款算法自算的 id,注册后它卡片上显示的应与此一致。
    pub agent_id: String,
    /// `Some(路径 · 版本)` 认出装在哪;`None` = 没认出来(不等于没装)。
    pub installed: Option<String>,
    /// `Ok(端口)` 在跑;`Err(原话)` 没在跑或运行时文件不对。
    pub running: Result<u16, String>,
    /// `Some(true / false)` 它的 prefs 里有没有登记这个 id;`None` = prefs 读不到。
    pub registered: Option<bool>,
    pub prefs_path: String,
}

impl Default for ClawdProbeVm {
    fn default() -> Self {
        Self {
            exe: String::new(),
            agent_id: String::new(),
            installed: None,
            running: Err("还没探".into()),
            registered: None,
            prefs_path: String::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConnectorVm {
    /// 机读键,和探活 / 工具映射的 key 同名(`claude_cli` / `orca` 等)。
    pub key: String,
    pub name: String,
    pub kind: ConnectorKind,
    pub status: ConnectorStatus,
    /// 找到就是路径,没找到就是原话(和 `ToolProbeVm.detail` 同一份)。
    pub detail: String,
    /// 哪几类活 / 哪些项目用到它。空 = 没人用到。
    pub used_by: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StageWorkflowOption {
    pub value: String,
    pub label: String,
    /// `false` = 选了也接不上(`skill_pointer` 认不出这个名字)。
    pub wired: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct StageRowVm {
    pub category_key: String,
    pub category_label: String,
    pub executor_tool: String,
    pub executor_label: String,
    pub executor_ok: Option<bool>,
    pub workflow: String,
    pub workflow_options: Vec<StageWorkflowOption>,
    /// 这个阶段现在能不能开工 —— 取决于它的执行器探到没探到。
    pub can_work: bool,
    /// 会注入哪几份 AI Assets(reference 名字)。
    pub injects: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PluginSkillGroup {
    pub name: String,
    pub skills: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PluginVm {
    pub slug: String,
    pub name: String,
    pub upstream: String,
    pub version: String,
    pub license: String,
    pub skill_count: usize,
    /// 哪几个阶段的默认 workflow 来自它。空 = 没有 workflow 用它
    /// (`mohit-pm-claude-skills` 今天就是这样:vendor 了但没接上)。
    pub used_by: Vec<String>,
    pub groups: Vec<PluginSkillGroup>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AssetRowVm {
    pub slug: String,
    /// 文件名(`AGENTS.md` / `build.md`)。
    pub name: String,
    /// frontmatter 那句 description,单独一列。
    pub desc: String,
    /// 「Workbench」/「项目」。
    pub source: String,
    /// 当前打开的项目里,哪几张活现在会读到它(`#123` 这样的活号)。**没有
    /// 打开项目 = 空**,不是「没有活在用」—— 两件事分开,不编一个假的空列表当答案。
    pub used_by_issues: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum KbTab {
    #[default]
    Docs,
    CodeGraph,
    Assets,
}

impl KbTab {
    pub fn label(self) -> &'static str {
        match self {
            KbTab::Docs => "知识",
            KbTab::CodeGraph => "代码图",
            KbTab::Assets => "资产",
        }
    }

    pub const ALL: [KbTab; 3] = [KbTab::Docs, KbTab::CodeGraph, KbTab::Assets];
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct KbVm {
    pub tab: KbTab,
    pub managed_count: usize,
    /// 知识页签:按规范八大类分组的文件清单。**只列存在的文件**,不列位置。
    pub groups: Vec<KbGroupVm>,
    /// 打开的那份文档:路径 + 原文。懒加载 —— 点了才现读。
    pub open_doc: Option<(String, String)>,
    /// 代码图页签。`None` = 还没跑过(没点过这个页签)。
    pub codegraph: Option<CodeGraphVm>,
    pub assets: Option<AssetsVm>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct KbGroupVm {
    pub title: String,
    pub files: Vec<KbFileVm>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct KbFileVm {
    pub rel: String,
    pub label: String,
    pub badge: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CodeGraphVm {
    /// `ready` / `running` / `not_installed` / `not_indexed` / `error`。
    pub state: String,
    pub hint: String,
    pub rows: Vec<CodeFileVm>,
    pub error: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CodeFileVm {
    pub path: String,
    pub language: String,
    pub nodes: u64,
    pub size: u64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AssetsVm {
    /// 技能提炼尚未实现，当前为空。
    pub distilled: Vec<SkillVm>,
    pub artifacts: Vec<ArtifactVm>,
    pub releases: Vec<ReleaseVm>,
    pub repo_stats: Vec<(String, String)>,
    pub error: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ArtifactVm {
    pub path: String,
    pub commit: String,
    pub subject: String,
    pub issue: String,
}
