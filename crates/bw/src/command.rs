//! 命令与事件 —— 界面和内核之间唯一的通路。
//!
//! 界面只发 [`Command`]、只收 [`Event`],别的一概不做:不直接开库、不直接写
//! 仓文件、不自己判断状态能不能转。所有用例与守卫都在 [`crate::app`]。
//!
//! 这里只列真接了实现的命令。**没接的不放进枚举** —— 一条能发出去但内核
//! 悄悄什么都不做的命令,比没有这条命令更糟。

use crate::model::{Category, ConversationId, IssueId, IssueStatus, ProjectId};

/// 总览「编辑项目名片」一次填完的仓文件字段。
///
/// 正本仍是 `.bw/PROJECT.md` + `.bw/project.toml` 两份。接入时只填前四项,
/// 在研版本 / 项目群落默认或仓里已有的;总览保存会把后几项一并写回。
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct ProjectIntent {
    pub name: String,
    /// 想做什么。
    pub brief: String,
    /// 最像的对标。
    pub benchmark: String,
    /// 三个月长成什么样(北极星一句话)。
    pub north_star: String,
    /// 在研版本。接入时空着 = 不覆盖仓里已有的 / 新建默认 `v0.1`。
    pub current_version: String,
    /// 项目群提供方。空或 `"none"` = 不配群。
    pub chat_provider: String,
    pub chat_group: String,
    /// 同步哪些事件(`review` / `merged` / `release`)。空数组 = 静音。
    pub chat_notify: Vec<String>,
}

/// 远端仓的地址。两个字段都空 = 没挂远端(本地仓),如实留白。
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct RemoteRef {
    /// `"github"` | `"codehub"`;空 = 未挂远端。
    pub provider: String,
    pub host: String,
    /// `"owner/repo"`。
    pub path: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Command {
    // ── 接入 ──────────────────────────────────────────────
    /// 接入项目:写项目行 + 备好工作区。名片字段落 `PROJECT.md`,不落库。
    CreateProject {
        slug: String,
        intent: ProjectIntent,
        remote: RemoteRef,
        /// 空 = 用工作区根目录下的 `<slug>`。
        workspace_path: String,
    },
    /// 总览「编辑→保存」:改 `PROJECT.md` 与 `.bw/project.toml`
    /// (名片 + 在研版本 + 项目群),走一张轻量活。
    EditProjectCard {
        project_id: ProjectId,
        intent: ProjectIntent,
    },

    // ── 规范铺底(运作活③)─────────────────────────────────
    /// 一次性运作活③:按探测结果决定要跑几步,A 刀只做第 1 步(写核心件)。
    RunStandardBootstrap { project_id: ProjectId },
    /// 把一个项目从工作台上移走。**只动库,不动仓** —— 仓是正本,里面是真实
    /// 的劳动成果。界面上要人点两下才发得出这条(第一下问「真移走?」)。
    RemoveProject { project_id: ProjectId },
    /// 把这张活上次那场会话接回来看看(`claude --resume <id>`)。
    ///
    /// **不改活的状态、不发任何 prompt** —— 纯粹是「让我看看上次聊到哪了」。
    /// 和 ▶开工 的区别就在这:▶开工 会把活推到「进行中」,这条不会。
    ReopenSession { issue_id: IssueId },
    /// 纯读:按「缺 / 过期 / 人改过 / 一致」四类对账,不建活不写仓。
    ReconcileStandard { project_id: ProjectId },

    // ── 计划 ──────────────────────────────────────────────
    /// 总览「开始本周」:建本周运作活①并开工。同一标题做过(含已完成)不再建。
    /// 判据是「本周文件不存在」——查文件,不查任何索引表。
    StartWeekPlanning { project_id: ProjectId, week: String },
    /// 人确认草稿后真的建活(`origin = agent_split`)。
    ConfirmWeekDraft {
        project_id: ProjectId,
        week: String,
        titles: Vec<String>,
    },
    /// 建一张活。`category` 决定默认工具与 workflow(查 `.bw/issue-policy.toml`)。
    CreateIssue {
        project_id: ProjectId,
        title: String,
        body: String,
        category: Option<Category>,
        kind: crate::model::IssueKind,
        origin: crate::model::IssueOrigin,
        week_of: String,
    },
    /// 排期:排进某一周,或传空串移回待办池。
    ScheduleIssue {
        id: IssueId,
        week_of: Option<String>,
    },
    /// 排进自定义版本(`bw:plan:<name>`)。和 `ScheduleIssue` 互斥:一张活要么
    /// 排进某一周、要么排进某个版本。正本走 codehub milestone + 标签,本地不缓存写。
    ScheduleToPlan { id: IssueId, plan: String },
    /// 建一个自定义版本(计划包):建 codehub milestone(title=name,start,due),
    /// 并给 `included` 每张打 `bw:plan:<name>` 标签、挂到这个里程碑。
    /// 与发版号 `CutRelease` 不同:发版号给已完成的活打版本标签;版本是把
    /// 若干待办活划归到一个计划包里排期。
    CreatePlanVersion {
        project_id: ProjectId,
        name: String,
        start: String,
        due: String,
        note: String,
        included: Vec<IssueId>,
    },
    /// 发版本:给选中的活写版本号 + 建远端 codehub/GitHub Release + 打 `bw:released:*` 标签。
    CutRelease {
        project_id: ProjectId,
        version: String,
        note: String,
        included: Vec<IssueId>,
    },
    /// 把项目工作区的主检出快进到远端最新。
    ///
    /// **为什么需要人手点这一下**:buddy 只在「合入并完成」某张活的时候自动拉
    /// 一次。人在 GitHub / codehub 网页上直接合了 MR,buddy 完全不知道 —— 工作
    /// 区就一直停在旧提交,合进去的 `.bw/` 那些件在本机根本不存在,而界面还照
    /// 常显示旧内容。以前没有任何入口能补这一下。
    PullWorkspace { project_id: ProjectId },

    // ── 干活 ──────────────────────────────────────────────
    /// 唯一的干活入口。跑完最远只到「评审中」。
    RunIssue { id: IssueId },
    /// 「提交并开 MR」:把这张活 worktree 里 agent 干出来的改动提交、推分支、
    /// 开 MR,然后把活推到「评审中」。
    ///
    /// **由人点**。agent 什么时候算干完只有人知道;而且这一下之后活就进了别人
    /// 的视线,不该由程序替人决定。它**最远只到「评审中」** —— 「完成」还是得
    /// 人在评审完之后再点一次。
    SubmitIssueWork { id: IssueId },
    /// 状态转移。合法性由 `can_transition_to` 守;「完成」只能从「评审中」来,
    /// 而且只能是人显式发这条命令。作废走 `Cancelled`,不是 Done。
    TransitionIssue { id: IssueId, to: IssueStatus },
    /// 给已有的活补/改类别标签。读回时用它查 issue-policy 的开工工具。
    SetIssueCategory { id: IssueId, category: Category },
    /// 改 issue 的责任人(codehub assignee)。空串 = 取消指派。走 codehub API,
    /// 不在本地另存一套。
    SetIssueAssignee { id: IssueId, assignee: String },
    /// 改 issue 的标题与正文(codehub issue update)。详情弹窗双击编辑后发这条。
    EditIssue {
        id: IssueId,
        title: String,
        body: String,
    },
    /// 卡住了。如实停在原地,可以重试,不假装前进。
    BlockIssue { id: IssueId, reason: String },
    /// 作废:写取消原因进评论、打 `bw:status:cancelled`、关掉远端 issue。
    /// 不是完成。原因不能空。
    CancelIssue { id: IssueId, reason: String },
    /// 删掉这张活的本机会话行和它的 worktree。不动远端 issue。
    DeleteSession { id: IssueId },

    // ── 配置 ──────────────────────────────────────────────
    /// 保存一行「类别→工具→workflow」映射,写 `.bw/issue-policy.toml`。
    SaveToolMapping {
        project_id: ProjectId,
        category: Category,
        tool: String,
        workflow: String,
    },
    /// 手动探活一次。项目墙「测一下」与配置屏共用。
    ProbeTool { name: String },
    /// 改「工作区根目录」——新接入的项目默认落在哪。**只是本机设置**,存 `app_meta`,
    /// 不进任何仓文件:换台机器仓拉下来还在原处,这个值本来就该各人各配。
    ///
    /// 只影响**之后**接入的项目:已接入的项目行里各自记着自己的仓路径,不会被这
    /// 一改牵着走(不然改一下根目录,已有项目就集体找不到仓了)。
    SetWorkspacesRoot { path: String },

    // ── 通知 ──────────────────────────────────────────────
    /// 记「这个项目的事件流看到哪个时间点」。只影响视觉状态,不参与待处理计数。
    MarkNotifySeen { project_id: ProjectId, at: i64 },

    /// 定时的一跳。**只会自动建活,绝不自动完成活**——到点了就查本周有没有
    /// 那张资产盘点活,没有就建一张并自动开工。没到点、已经有了,都是原地
    /// 返回空事件,不是错误。
    TickScheduler { project_id: ProjectId },

    /// 通知屏的「合入并完成」。先真的合 MR,再把活推「完成」——顺序反了,
    /// 合入失败就会留下一张已完成、改动却还挂在分支上的活。
    MergeAndSettle { id: IssueId },

    /// 把一件事同步进项目群。**调用即完成**:不写库、不去重、不排重试队列。
    SyncNotifyToChat {
        issue_id: IssueId,
        /// `review` / `merged` / `release`。
        event_type: String,
    },
    /// ■停止:关掉这件活的内嵌终端。**状态原地不动**——停下来既不是失败也
    /// 不是完成,人随时能再点▶跑接回去。
    CancelRun { id: IssueId },
    /// 人在内嵌终端里敲的字节。
    TerminalInput {
        conversation_id: ConversationId,
        bytes: Vec<u8>,
    },
    /// 终端框大小变了,PTY 那头也要跟着变,否则 agent 输出会按 80×24 折行。
    TerminalResize {
        conversation_id: ConversationId,
        cols: u16,
        rows: u16,
    },
    /// 总览手填卡:把人填的今天这个数记进账本 `.bw/metrics/readings.jsonl`(当天覆盖)。
    /// 只收 C 类(`collect.kind = "manual"`)。空值拒。
    RecordManualMetric {
        project_id: ProjectId,
        name: String,
        value: String,
    },
}

/// 一个工具探活的结果。探不到就是探不到,不猜。
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProbeResult {
    /// 探到了,带上探到的路径或版本。
    Found(String),
    /// 本机没装 / 没跑起来。
    Missing(String),
    /// 还没接这个工具的探活实现 —— 如实说「不知道」,不报绿也不报红。
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    ProjectCreated {
        id: ProjectId,
        slug: String,
        /// 仓里本来就有 `.bw/project.toml` —— 这次是「接手已有项目」,
        /// 人手填过的字段一个都没覆盖。
        adopted: bool,
    },
    ProjectCardEditPending {
        issue_id: IssueId,
    },
    /// 项目从工作台上移走了。`issues` = 跟着一起删掉的活数,好让人知道
    /// 自己刚才丢掉了多少账;仓和活自己的 worktree 都还在硬盘上。
    ProjectRemoved {
        slug: String,
        issues: u64,
        workspace: String,
    },
    /// 上次那场会话接回来了。`live` = 之前就开着、这次什么都没做。
    SessionReopened {
        issue_id: IssueId,
        live: bool,
    },
    /// 规范铺底第 1 步真的把文件写进仓并提交了。`files` 是实际落盘的路径。
    StandardBootstrapped {
        project_id: ProjectId,
        issue_id: IssueId,
        files: Vec<String>,
        committed: bool,
    },
    StandardReconciled {
        project_id: ProjectId,
        missing: Vec<String>,
        stale: Vec<String>,
        human_edited: Vec<String>,
    },
    /// 本周运作活①已建并开工。
    WeekPlanStarted {
        project_id: ProjectId,
        week: String,
        /// 运作活①本身那张活。界面据此跳会话屏。
        issue_id: IssueId,
        draft_titles: Vec<String>,
    },
    /// 本周运作活①已经做过(含已完成),这次什么都没做。
    WeekPlanAlreadyExists {
        project_id: ProjectId,
        week: String,
    },
    /// 本周那张运作活①还在路上,这次什么
    /// 都没做。**不是错误** —— 人再点一次「开始本周」该被平静地挡住,而不是
    /// 收到一句「这张活现在是评审中,不是能开工的状态」。
    WeekPlanInProgress {
        project_id: ProjectId,
        week: String,
        issue_id: IssueId,
        status: String,
    },
    IssueCreated {
        id: IssueId,
        number: u32,
    },
    IssueScheduled {
        id: IssueId,
        week_of: String,
    },
    IssueScheduledToPlan {
        id: IssueId,
        plan: String,
    },
    PlanVersionCreated {
        project_id: ProjectId,
        name: String,
        /// codehub milestone id;0 = 没建里程碑(只打了标签)。
        milestone_id: u64,
    },
    IssueCategorySet {
        id: IssueId,
        category: String,
    },
    IssueAssigneeSet {
        id: IssueId,
        assignee: String,
    },
    IssueEdited {
        id: IssueId,
    },
    /// 一次 ▶跑 结束。`summary` 原样来自执行器(mock 的自带【mock】字样)。
    /// `tool` 是这张活读回的开工工具,壳用来决定会话屏落在哪一页。
    /// `embed_url` 只给 Open Design:内嵌页该打开的 loopback 地址;空 = 不是 OD 或没灌上。
    IssueRan {
        id: IssueId,
        ok: bool,
        summary: String,
        tool: String,
        embed_url: String,
    },
    /// 「提交并开 MR」走完了。`commits` 是这条分支上比基线多出来的提交数,
    /// `pr_number = 0` 时 `note` 说明为什么没有 MR —— 绝不摆一个空号。
    IssueSubmitted {
        id: IssueId,
        branch: String,
        commits: u32,
        pr_number: u32,
        note: String,
    },
    /// 工作区根目录改好了。`pinned` = 有几个原本没填仓路径的老项目,被就地钉死在
    /// 了老位置(它们一个都没搬,只是从此不再跟着根目录走)。
    WorkspacesRootChanged {
        path: String,
        pinned: u32,
    },
    IssueTransitioned {
        id: IssueId,
        to: IssueStatus,
        /// 这次是不是真的结清了(人点「完成」那一下)。已经结过就是 `false`。
        settled: bool,
    },
    IssueBlocked {
        id: IssueId,
    },
    IssueCancelled {
        id: IssueId,
    },
    ReleaseCut {
        version: String,
        rows_written: bool,
    },
    /// 拉工作区的结果。`moved` = 主检出真的往前走了;`note` 是给人看的一句话,
    /// 拉不动时装的是 git 的原话(压成一行),**不吞**。
    WorkspacePulled {
        moved: bool,
        note: String,
    },
    ToolMappingSaved {
        category: Category,
    },
    ToolProbed {
        name: String,
        result: ProbeResult,
    },
    /// 往项目群发了(或没发成)一条。**不落库**——通知行上那句「已发到群 ✓」
    /// 和事件流里那一条是同一个事件在两处的展示,只在当前这次运行里存在。
    ChatNotifySent {
        number: u32,
        event_type: String,
        ok: bool,
        /// 失败原文。成功时为空。
        note: String,
    },

    /// 合入并完成走完了。`merged=false` = 这张活本来就没有 MR 可合(本地项目
    /// 或者还没开 PR),只走了「完成」那一步。
    IssueMerged {
        id: IssueId,
        pr_number: u32,
        merged: bool,
        /// 合入之后在本机做的收尾:主检出有没有拉到最新、那条活分支有没有
        /// 收掉。**拉不动就写拉不动、删不掉就写删不掉**,绝不假装做过了。
        /// `merged=false` 时为空(没合过就没有收尾这回事)。
        local_note: String,
    },
    /// ■停止按下去之后。`was_live=false` = 本来就没有活着的终端可停。
    RunCancelled {
        id: IssueId,
        was_live: bool,
    },
    /// 人确认后删掉了本机会话行。远端 issue 不动;`note` 写工作树收没收掉。
    SessionDeleted {
        id: IssueId,
        note: String,
    },
    /// 定时真的建出了一张活。界面上「本周运作」栏据此显示「已自动开工」。
    OpsAutoFired {
        id: IssueId,
        workflow: String,
        week: String,
    },
    /// B 类指标今日自动采了一轮。不建活、不完成活。
    MetricsAutoCollected {
        project_id: ProjectId,
        week: String,
        count: u32,
    },
    /// 人记下了一条 C 类读数。同一天再记覆盖读回(只追加,最后一行算)。
    MetricRecorded {
        project_id: ProjectId,
        name: String,
        day: String,
        value: String,
    },
    NotifySeenMarked {
        project_id: ProjectId,
    },
    /// 项目健康算完了一次。灯与理由都是现算出来的,库里那两列只是显示缓存。
    HealthDerived {
        project_id: ProjectId,
        signal: crate::model::Signal,
        reasons: Vec<String>,
    },
}
