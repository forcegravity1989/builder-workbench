//! ViewModel:内核算好的、可直接渲染的数据。
//!
//! 屏与屏之间**只经这里**共享数据结构——`screens/plan/` 永远不许
//! `use crate::screens::overview::…`(`guard-no-cross-screen-import.sh` 守着)。
//!
//! 这一层不算任何东西:每个字段都是内核那边现算好塞进来的。壳只渲染和转发意图。

use bw::model::{ConversationId, IssueId, IssueStatus, ProjectId, Signal};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Vm {
    pub ready: bool,
    /// 起不来就如实说起不来,不给一个空界面假装正常。
    pub fatal: Option<String>,
    pub projects: Vec<ProjectCardVm>,
    /// 本机环境条:各个开工工具探到没探到。
    pub env: Vec<ToolProbeVm>,
    /// 打开了哪个项目。`None` = 还在项目墙。
    pub open: Option<ProjectVm>,
    pub settings: SettingsVm,
    /// 最近一条后台动作的回执(建活、铺底、发版这类)。
    pub note: Option<String>,
    /// 这是第几条回执。**同一句话第二次发生时序号也会变**,toast 才不会把它
    /// 当成「已经关过的那条」而静默吞掉。
    pub note_seq: u64,
    /// 长操作进行中(开工起 TUI / 第一次给 Orca 登记仓)。盖一层挡住嵌页,
    /// 免得人在那几秒里乱点。空 = 没有。
    pub busy: Option<String>,
    /// 接入屏那份「我账号下的仓」列表 —— 现去平台问的,不是库里的。
    pub repos: RepoPickerVm,
    /// 仓文件读不动或者解析炸了的实话。**不退回默认值假装文件不存在** ——
    /// `.bw/*.toml` 是 deny-unknown-fields 的,一个手误的键就让整份文件读不出
    /// 来,退回默认值的表现是「名片全是(待填)、配置屏说你还没铺过规范件」,
    /// 而真相是文件在、只是有一行写错了。
    pub warnings: Vec<String>,
}

/// 接入屏的仓选择器。**列不出来就说为什么**,不摆一张假列表 —— 高保真上那份
/// `REPO_LIST` 是工厂造的,真壳里这些行必须来自 `gh repo list` / `codehub-cli`。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RepoPickerVm {
    /// 正在问平台。界面上是「列着…」,不是空列表 —— 空列表会被读成「你没有仓」。
    pub loading: bool,
    /// 问过一次了没有。没问过 = 界面上是一个「列出我的仓」按钮,不是「一个都没有」。
    pub asked: bool,
    /// 问失败的原话(没装 gh、没登录、域名填错)。
    pub error: Option<String>,
    pub rows: Vec<RepoRowVm>,
    /// 现在盯着哪个仓(点中的那一行,或者人手打进去的地址)。
    pub picked: Option<String>,
    /// 从那个仓的远端 `.bw/project.toml` 读回来的名片。
    pub prefill: Option<RepoPrefillVm>,
    /// 那一读的结局。**「没读到」和「没读成」必须分开** —— 网络断了、没登录、
    /// 默认分支不叫 main,这些都会读不到,但它们**不等于**「这个仓没被接管过」。
    /// 混成一句「还没被接管过」就是在瞎说,人照着填一遍反而会覆盖仓里的真名片。
    pub probe: RepoProbe,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub enum RepoProbe {
    /// 还没查过(人还没选仓,或者选完还没轮到)。
    #[default]
    NotAsked,
    Loading,
    /// 读到了 `.bw/project.toml` —— 这个仓被 Workbench 接管过。
    Adopted,
    /// 平台明确回「没有这个文件」,而且**这个仓确实在**(另问了一次)——
    /// 这个仓没被接管过。
    Absent,
    /// 这个地址根本找不到仓(敲错了、私有仓没权限、没登录)。仓都不在,
    /// 「接管过没有」就无从谈起,更不能放人往下走去接一个不存在的仓。
    NoRepo(String),
    /// 压根没查成,原话在里面。**不是**「没被接管过」。
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

/// 已经被 Workbench 接管过的仓,名片直接回显,不用人再填一遍。
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
    /// Orca 网页配对 URL(带 token,只在本地)。设置屏可改;会话屏 iframe 打开它。
    pub orca_web_url: String,
    /// Workbench 本机数据目录(注册表 / 设置 / 会话都在这下面)。刀6 起不再有 SQLite
    /// 库文件,这格显示的是 asset_root 目录名,不是 DB 路径。
    pub data_dir: String,
    pub claude_binary: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProjectCardVm {
    pub id: ProjectId,
    pub slug: String,
    pub name: String,
    /// 「想做什么」一句话,来自 `.bw/project.toml`。
    pub brief: String,
    pub signal: Option<Signal>,
    pub workspace_path: String,
    pub remote: String,
    /// 本周排了几张活、完成了几张。
    pub week_total: u32,
    pub week_done: u32,
    /// 在研版本(仓里 `.bw/project.toml` 写的)。没写就是空,不猜一个。
    pub version: String,
    /// 当前 ISO 周,卡片上那个周 chip 显示它。
    pub week: String,
    /// 还没看过的动静:评审中 + 阻塞里,更新时间晚于「读到这里」那一下的。
    /// 通知屏点过之后这个数会掉下去。
    pub unread: u32,
    /// 本周版本目标这一段,来自运作活①评论。没有或解析不到 = 空。
    pub week_goal: String,
    /// 上次交付:发版记录最后一行的日期与版本。仓里没有发版记录 = 空。
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
    /// 本周是否已经有过运作活①(含已完成)。总览「开始本版本」只在还没有时出现。
    pub week_started: bool,
    /// 上一发 / 未发 / 推荐下一号,给创建版本弹窗。
    pub last_released: String,
    pub unreleased: Vec<String>,
    pub suggested_next: String,
    /// 本周运作活①已确认的 `v0.x`。空 = 还没确认,总览进度空态。
    pub confirmed_version: String,
    /// 本周运作活①若还开着,走到哪了。`None` = 还没建,或已经完成。
    pub ops1_status: Option<String>,
    /// 规范铺底还开着、默认分支还没有名片。总览常驻横幅。`None` = 已合入或没建。
    pub bootstrap_pending: Option<CardMrVm>,
    /// 计划屏左栏:节律周列表(新的在前,本周置顶)。排期名走 `v0.x`,不在这里。
    pub weeks: Vec<WeekVm>,
    /// 正在看哪一周(节律用,不再当排期名)。
    pub viewing_week: String,
    /// 看哪个 `v0.x`。空 = 「全部」。
    pub viewing_plan: String,
    /// 左栏点的是「全部」——看板不按周过滤。
    pub view_all: bool,
    pub board: BoardVm,
    /// `v0.x` 版本列表。旧非 v0.x 不进这里。
    pub plan_versions: Vec<PlanVersionVm>,
    /// 当前登录用户名(给列表「我的」筛选用)。空 = 认不出。
    pub current_user: String,
    /// 本周四段计数:待办 / 进行中 / 评审中 / 完成。总览与计划屏的进度条都用它。
    /// **当前周**的五段计数。总览那块「本周计划进度」用它。
    pub week_counts: WeekCountsVm,
    /// 计划屏正在看的那个看板的五段计数(看某一周就是那一周,点了「全部」就是
    /// 全部)。它跟着左栏走,所以**不能拿去当「本周」**。
    pub board_counts: WeekCountsVm,
    /// **当前周**的运作活①②③状态点(查活缓存现算)。总览那块用它。
    pub ops: Vec<OpsChipVm>,
    /// 计划屏正在看的那一周的运作活状态点。跟着左栏走,**不能拿去当「本周」**
    /// —— 和 `board_counts` 同一个理由。
    pub board_ops: Vec<OpsChipVm>,
    /// 代码仓级指标。**现算很贵(要起好几个 git 子进程),所以按需**:
    /// `None` = 还没采过,界面显示一颗「立即采集」。
    pub repo_stats: Option<RepoStatsVm>,
    /// 名片改动那张轻量活走到哪了。`None` = 没有在途的名片改动。
    pub card_mr: Option<CardMrVm>,
    /// 「开始本版本」刚产出、**还没经人确认**的草稿活标。确认之前一张活都不建
    /// —— 这是「活由人确认才存在」那条,不是界面装饰。
    pub pending_drafts: Vec<String>,
    pub releases: Vec<ReleaseVm>,
    pub sessions: Vec<SessionVm>,
    /// 会话屏选中的那一个(按活)。
    pub session_open: Option<IssueId>,
    /// MR / PR 网页地址的前缀,后面直接拼号码(`.../pull/` 或 codehub 的
    /// `.../-/merge_requests/`)。**按 provider 拼**,不是从 `.git/config` 的
    /// origin 推 —— codehub clone 走 SSH,origin 里是 SSH 主机加端口,拿它当
    /// 网址点不开。没挂远端就是空串,那时候详情里不给链接,不编一个。
    pub mr_url_prefix: String,
    /// 远端 issue 网页地址的前缀,规矩同 [`Self::mr_url_prefix`]。
    pub issue_url_prefix: String,
    pub workbench: WorkbenchVm,
    pub notify: NotifyVm,
    pub config: ConfigVm,
    pub kb: KbVm,
}

/// 名片。四个字段的正本是 `.bw/project.toml`,不在库里。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CardVm {
    pub brief: String,
    pub benchmark: String,
    pub north_star: String,
    pub remote: String,
    /// 在研版本,**显示用**:空的时候是「(待填)」。
    pub current_version: String,
    /// 在研版本,**机读用**:空就是空。发版这类要把它当负载送进命令的地方
    /// 只能用这一个 —— 把「(待填)」当版本号发出去,发版记录里就多一行叫
    /// 「(待填)」的版本,而且按版本号幂等,这个项目以后再也发不出版。
    pub current_version_raw: String,
    pub standard_version: String,
    /// 项目群。没配就是「未配」。
    pub chat: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct HealthVm {
    pub signal: Option<Signal>,
    /// 三条判据,每条一句人话 +「成不成立」。
    pub reasons: Vec<(bool, String)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct MetricsVm {
    pub north_star: Option<MetricCardVm>,
    pub lagging: Vec<MetricCardVm>,
    pub leading: Vec<MetricCardVm>,
    /// 这轮会话里人点过「采一次指标」。空着的走势和「还没点」是两件事,
    /// 后者要在滞后/引领上写出和代码仓级同一句「点了才采」。
    pub collected: bool,
    /// 读不到 `.bw/metrics.toml` 时的实话(还没有这份文件 —— 正常状态)。
    pub note: Option<String>,
    /// 有这份文件、但**读不动**时的原话(格式错、旧格式)。和 `note` 分开:
    /// 前者是「还没定出来」,后者是「定了但我读不了」,**两件事不能混成一句
    /// 「没有指标」**,那会让人以为文件不存在,去写一份新的。
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
    /// 这条指标的定义(`def`),给人看「这个数到底数的是什么」。
    pub def: String,
    /// 采集方式是「手填」。手填的数带徽记,一眼看得出它不是自动采来的。
    pub manual: bool,
    pub source: String,
    pub collected_at: String,
    /// 本周哪些活在推它。
    pub driving: Vec<String>,
    /// 这条属于哪一类:可回溯 / 不可回溯 / 手填。**空 = 还没读到定义。**
    pub class: String,
    /// 上一次「采一次指标」真采到的现值。**`None` ≠ 0** —— 没采过、没采到、
    /// 手填,都是 `None`。
    pub collected: Option<String>,
    /// 近四周走势,旧的在前。采不到的点是 `None`,画的时候断开,不补前值。
    pub trend: Vec<(String, Option<f64>)>,
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
    /// 卡住的那几张。**单独一段** —— 混进别的段或者干脆不数,等于把红灯藏了。
    pub blocked: usize,
}

impl WeekCountsVm {
    pub fn total(&self) -> usize {
        self.todo + self.doing + self.review + self.done + self.blocked
    }

    /// 进度条一段占多宽。总数是 0 就全都是 0 —— 不给空周画一条满的。
    pub fn pct(&self, n: usize) -> u32 {
        if self.total() == 0 {
            0
        } else {
            (n * 100 / self.total()) as u32
        }
    }
}

/// 「本周运作」表里的一行。正本是远端 issue,不是库。
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct OpsChipVm {
    pub title: String,
    pub status: String,
    pub note: String,
}

/// 代码仓级指标。每一项都带「这个数从哪来」——采不到就整块给出原话,不填 0。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct RepoStatsVm {
    /// `(数值, 这个数是什么, 从哪采的)`。压成一行小字,不再是一格格的卡片。
    pub items: Vec<(String, String, String)>,
    /// 近四周走势,**旧的在前**。全部现算 —— 能采今天就能采过去任意一周,
    /// 所以新接入的项目第一天就有走势,不用先攒几周。
    pub trend: Vec<TrendPointVm>,
    /// git 那两条线为什么是空的。空字符串 = 没有话要说。
    pub git_note: String,
    /// 远端那条线为什么是空的。空字符串 = 没有话要说。
    pub trend_note: String,
    pub error: String,
}

/// 走势上的一个点 = 一周。
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct TrendPointVm {
    pub week: String,
    /// 三条线一律 `Option`:`None` = 没采到,**画的时候断开,不当 0 画**。
    /// git 读不动(不是仓、没装 git)时提交那条是 `None`;远端查不成时另外
    /// 两条是 `None`。
    pub commits: Option<u32>,
    pub merged_prs: Option<u32>,
    /// 这一周周末那一刻还没关闭的 issue 数。**存量,不是流量。**
    pub open_issues: Option<u32>,
}

/// 名片改动那张轻量活。名片是仓文件,改它一律走分支 + MR。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct CardMrVm {
    pub issue_id: Option<IssueId>,
    pub number: u32,
    /// 活现在的状态标签(「评审中」/「已完成」这种)。
    pub status: String,
    pub pr_number: u32,
    /// 能不能点「合入并完成」——只有停在评审中的才能。
    pub mergeable: bool,
    /// 现在有没有开着的 MR。合入按钮用它;已合入的只展示号。
    pub has_open_mr: bool,
}

/// 四列看板(合并后:待办/进行中/待处理/已完成)。列的顺序是活的生命周期顺序,
/// 列内再分段(待办=未排期/已排期,待处理=待评审/阻塞,已完成=完成/拒绝)。
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
    /// 合并列内的分段。单段列(进行中)只一段。两段列默认显示第一段。
    pub segments: Vec<ColumnSegVm>,
}

/// 看板一列里的段(如「未排期」「已排期」)。`cards` 是这段的卡(build_board
/// 已按排期/状态分好,屏直接渲染,不再二次过滤)。
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
    pub kind: String,
    pub origin: String,
    pub week_of: String,
    pub version: String,
    pub metric_key: String,
    pub settled: bool,
    pub status: IssueStatus,
    /// 远端 MR 号。0 = 没有 MR。开着的或已合入的都算,详情链接用它。
    pub pr_number: u32,
    /// 分支上现在有没有开着的 MR。待评审→完成时:有则合入,没有则确认后只关 issue。
    pub has_open_mr: bool,
    /// 远端 issue 号。0 = 这张活只在本机,没有对应的远端 issue。
    pub remote_number: u32,
    /// 这张活的分支。空 = 还没开过工。
    pub branch: String,
    /// 活的正文。详情抽屉里要看的就是它 —— 光有标题看不出这张活要干什么。
    pub body: String,
    /// 责任人(codehub assignee)。空 = 未指派。
    pub assignee: String,
    /// 提出人(codehub author)。空 = 认不出。
    pub author: String,
    /// 排进人起名的版本(`bw:plan:*`)。空 = 没挂这个写法;与 week_of 是同一槽位。
    pub plan_version: String,
    /// 最近更新时间(unix 秒)。0 = 认不出。卡片「已更新」用它现算相对时间。
    pub updated_at: i64,
}

/// 计划版本,号就是 `v0.x`,与发版号同一串。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PlanVersionVm {
    pub name: String,
    pub start: String,
    pub end: String,
    pub issue_count: u32,
    /// 远端 Release 或 issue 的 `bw:released:` 里有同名。
    pub released: bool,
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
    /// PTY 进程还活着没有。**只有这一个信号是真的**——「等你输入」那种细粒度
    /// 状态要靠 claude 的 hook 回传,还没接,所以不显示,不猜。
    pub live: bool,
}

/// 会话屏中栏两个组件:Orca + Open Design(都常驻,不按活露不露)。原型活
/// 默认停 Open Design,构建类默认停 Orca。
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SessionTab {
    #[default]
    Orca,
    OpenDesign,
}

/// 会话屏两个组件要的那点状态。右栏(文件树 / 改动 / git / MR)和终端页签删了,
/// 那些能力在 Orca 里;这里只剩页签、开工工具和 OD iframe 的 src/gen。
#[derive(Clone, Debug, Default, PartialEq)]
pub struct WorkbenchVm {
    pub tab: SessionTab,
    /// 当前打开的会话那张活的开工工具(`claude_cli`/`cursor`/`open_design`)。
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
    /// 还没看的动静有几件 = 评审中的活张数(现算,不靠「读到哪个时间点」的
    /// 账本)。项目墙卡片上的 ⚑ 和项目轨头部徽章读它。**通知页签已删**(见
    /// ADR-0003),个人提醒改走 OS 弹窗(后建);这个数先撑着「有几张等你
    /// 合入」,弹窗到位后它的角色再看。
    pub unread: u32,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ConfigVm {
    /// 「类别→工具→workflow」三列映射。
    pub mappings: Vec<MappingVm>,
    /// 项目仓 `.claude/skills/` 里扫出来的技能包 + 现算的「用过几次」。
    pub skills: Vec<SkillVm>,
    pub tools: Vec<ToolProbeVm>,
    pub remote: String,
    /// `.bw/issue-policy.toml` 的 `[cadence]` 段:定时节律。原样一句话。
    pub cadence: String,
    /// 节律拆成表格行:哪张运作活、怎么触发、判据是什么。
    pub crons: Vec<CronVm>,
    /// 项目群三件:提供方 / 群号 / 同步哪些事件。仓是正本,这里只显示。
    pub chat_provider: String,
    pub chat_group: String,
    pub chat_events: Vec<(String, bool)>,
    /// `.bw/project.toml` 的 `[chat]` 段:项目群。**仓是正本**,这里只显示;
    /// 改它走总览「编辑项目名片」那张轻量活 + MR。
    pub chat: String,
    /// 从活详情点 workflow 跳过来时要亮的那一行(slug)。空 = 没指定。
    pub focus_skill: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MappingVm {
    pub category_key: String,
    pub category_label: String,
    pub tool: String,
    pub workflow: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SkillVm {
    pub slug: String,
    pub title: String,
    pub uses: u32,
    /// 「内置」(随 Workbench 出厂、铺底时复制进来)/「项目自有」/「蒸馏」。
    pub origin: String,
    /// SKILL.md 头里的 `description:`。读不到就空着,不替它写一句。
    pub desc: String,
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
    /// 仓里实际有几份 `.bw` 规范件。**不做对账** ——
    /// 对账是配置屏那颗按钮的事,这里只报个数。
    pub managed_count: usize,
    /// 知识页签:按规范八大类分组的文件清单。**只列存在的文件**,不列位置。
    pub groups: Vec<KbGroupVm>,
    /// 打开的那份文档:路径 + 原文。懒加载 —— 点了才现读。
    pub open_doc: Option<(String, String)>,
    /// 代码图页签。`None` = 还没跑过(没点过这个页签)。
    pub codegraph: Option<CodeGraphVm>,
    /// 资产页签。`None` = 还没扫过。
    pub assets: Option<AssetsVm>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct KbGroupVm {
    pub title: String,
    pub files: Vec<KbFileVm>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct KbFileVm {
    /// 仓内相对路径,也是打开它的 key。
    pub rel: String,
    pub label: String,
    /// 「回填」这类小徽记。回填的周文件与人写的同目录同格式,只靠这个区分。
    pub badge: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CodeGraphVm {
    /// `ready` / `running` / `not_installed` / `not_indexed` / `error`。
    pub state: String,
    /// 灰态时的下一步该干什么。
    pub hint: String,
    pub rows: Vec<CodeFileVm>,
    /// 子进程失败的原文。**原样显示**,不留空白也不静默重试。
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
    /// 项目自己的技能包(扫 `.claude/skills/**/SKILL.md` 得到)。
    pub skills: Vec<SkillVm>,
    /// 蒸馏产出的技能。V4 还没有蒸馏这颗按钮,所以今天恒为空 —— 不放假数据。
    pub distilled: Vec<SkillVm>,
    /// 产物登记 = `git log --name-only`,没有登记表。
    pub artifacts: Vec<ArtifactVm>,
    pub releases: Vec<ReleaseVm>,
    /// 仓统计:与总览第⑤块同一次采集逻辑。
    pub repo_stats: Vec<(String, String)>,
    /// 采不到时的原话。
    pub error: String,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ArtifactVm {
    pub path: String,
    pub commit: String,
    pub subject: String,
    /// 提交消息里解析到的活号。解析不到就空着,不强凑。
    pub issue: String,
}
