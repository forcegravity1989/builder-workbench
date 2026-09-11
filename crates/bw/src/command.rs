use crate::model::{Category, IssueId, IssueStatus, ProjectId};

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct ProjectIntent {
    pub name: String,
    pub brief: String,
    pub benchmark: String,
    pub north_star: String,
    /// 项目群提供方。空或 `"none"` = 不配群。
    pub chat_provider: String,
    pub chat_group: String,
    /// 使用 NotifyEvent::key 的事件名；空数组表示关闭全部通知。
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
    CreateProject {
        slug: String,
        intent: ProjectIntent,
        remote: RemoteRef,
        /// 空 = 用工作区根目录下的 `<slug>`。
        workspace_path: String,
    },
    EditProjectCard {
        project_id: ProjectId,
        intent: ProjectIntent,
    },

    // 只移除本机项目记录，保留仓库和 worktree。
    RemoveProject {
        project_id: ProjectId,
    },
    /// 只切换已有会话，不改变 issue 状态、不发送提示词。
    ReopenSession {
        issue_id: IssueId,
    },
    /// 纯读:按「缺 / 过期 / 人改过 / 一致」四类对账,不创建 Issue不写仓。
    ReconcileStandard {
        project_id: ProjectId,
    },

    ConfirmWeekDraft {
        project_id: ProjectId,
        week: String,
        titles: Vec<String>,
    },
    /// 类别决定工具与 workflow；工具从本机设置读取，未设置时使用产品默认。
    CreateIssue {
        project_id: ProjectId,
        title: String,
        body: String,
        category: Option<Category>,
        kind: crate::model::IssueKind,
        origin: crate::model::IssueOrigin,
        week_of: String,
        /// 排进版本(`bw:plan:<name>`)。空 = 未排期。`week_of` 不再写标签。
        plan: String,
    },
    ScheduleIssue {
        id: IssueId,
        week_of: Option<String>,
    },
    ScheduleToPlan {
        id: IssueId,
        plan: String,
    },
    CreatePlanVersion {
        project_id: ProjectId,
        name: String,
        start: String,
        due: String,
        included: Vec<IssueId>,
    },
    DeletePlanVersion {
        project_id: ProjectId,
        name: String,
    },
    RenamePlanVersion {
        project_id: ProjectId,
        from: String,
        to: String,
    },
    /// 先创建远端 Release，再写发版标签；打包使用 PackRelease。
    CutRelease {
        project_id: ProjectId,
        version: String,
        note: String,
        included: Vec<IssueId>,
    },
    PackRelease {
        project_id: ProjectId,
        version: String,
    },
    PullWorkspace {
        project_id: ProjectId,
    },

    RunIssue {
        id: IssueId,
    },
    SubmitIssueWork {
        id: IssueId,
    },
    /// 完成必须由用户显式发起；合法转移由 can_transition_to 检查。
    TransitionIssue {
        id: IssueId,
        to: IssueStatus,
    },
    SetIssueCategory {
        id: IssueId,
        category: Category,
    },
    SetIssueAssignee {
        id: IssueId,
        assignee: String,
    },
    EditIssue {
        id: IssueId,
        title: String,
        body: String,
    },
    /// 列表不带正文，详情打开时单独查询。
    FetchIssue {
        id: IssueId,
    },
    BlockIssue {
        id: IssueId,
        reason: String,
    },
    /// 原因不能为空；写取消标签并关闭 issue，不能标为完成。
    CancelIssue {
        id: IssueId,
        reason: String,
    },
    /// 删除本机会话和 worktree，保留远端 issue。
    DeleteSession {
        id: IssueId,
    },

    // ── 配置 ──────────────────────────────────────────────
    /// 保存本机「我用什么工具」。只写 settings,不进仓。`workflow` 带着不存。
    SaveToolMapping {
        project_id: ProjectId,
        category: Category,
        tool: String,
        workflow: String,
    },
    /// 手动探活一次。项目墙「测一下」与配置屏共用。
    ProbeTool {
        name: String,
    },
    /// 改「工作区根目录」——新接入的项目默认落在哪。**只是本机设置**,存 `app_meta`,
    /// 不进任何仓文件:换台机器仓拉下来还在原处,这个值本来就该各人各配。
    ///
    /// 只影响**之后**接入的项目:已接入的项目行里各自记着自己的仓路径,不会被这
    /// 一改牵着走(不然改一下根目录,已有项目就集体找不到仓了)。
    SetWorkspacesRoot {
        path: String,
    },
    /// 改「Orca 网页地址」——会话屏 iframe 打开的那条配对 URL(带 token)。
    /// **只存本机 `settings.toml`,不进仓** —— 是这台机器看 Orca web 的事。
    /// `BW_ORCA_WEB_URL` 仍可覆盖(开发期)。空串 = 清掉。
    SetOrcaWebUrl {
        url: String,
    },
    /// 改界面配色(`claude` / `apple`,设计系统的两套 token)。只存本机
    /// `settings.toml`,不进仓。不认识的值 = 回默认。
    SetTheme {
        theme: String,
    },

    /// 先合入 MR，成功后才关闭 issue。
    MergeAndSettle {
        id: IssueId,
    },

    SyncNotifyToChat {
        issue_id: IssueId,
        /// NotifyEvent::key 返回的事件名。
        event_type: String,
    },
    /// 当前未接入 Orca 进程停止接口，不改变 issue 状态。
    CancelRun {
        id: IssueId,
    },
    /// 同日同指标更新原值，保存到指标记录工作树。
    RecordManualMetric {
        project_id: ProjectId,
        name: String,
        value: String,
    },

    ReportWorkbenchIssue {
        title: String,
        attach_log: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProbeResult {
    Found(String),
    Missing(String),
    Unknown(String),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
    ProjectCreated {
        id: ProjectId,
        slug: String,
        adopted: bool,
    },
    ProjectCardEditPending {
        issue_id: IssueId,
    },
    /// 本机项目记录已移除；仓库和 worktree 仍保留。
    ProjectRemoved {
        slug: String,
        issues: u64,
        workspace: String,
    },
    SessionReopened {
        issue_id: IssueId,
        live: bool,
    },
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
    PlanVersionDeleted {
        project_id: ProjectId,
        name: String,
        /// 摘掉 `bw:plan` 的活有几张。
        issues_cleared: u32,
    },
    PlanVersionRenamed {
        project_id: ProjectId,
        from: String,
        to: String,
        issues_moved: u32,
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
    /// `FetchIssue` 的回执:单查拉回的正文。bridge 用它补丁 last_gather,
    /// 不重拉整个 issue 列表。空串如实 = 此 Issue本来就没写正文。
    IssueBodyFetched {
        id: IssueId,
        body: String,
    },
    /// 一次 ▶跑 结束。`summary` 原样来自执行器(mock 的自带【mock】字样)。
    /// `tool` 是此 Issue读回的开工工具,壳用来决定会话屏落在哪一页。
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
    WorkspacesRootChanged {
        path: String,
        pinned: u32,
    },
    /// Orca 网页地址改了。**不带 URL 原文**(配对 URL 带 token,不进 Event);
    /// 壳收到后自己重读本机 `settings.toml` 刷新显示。
    OrcaWebUrlChanged,
    /// 界面配色改了。壳重读本机设置,根节点换 `data-theme`。
    ThemeChanged {
        theme: String,
    },
    IssueTransitioned {
        id: IssueId,
        to: IssueStatus,
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
    ReleasePacked {
        version: String,
        artifact_dir: String,
        passed: u32,
        total: u32,
    },
    ReleasePackStopped {
        version: String,
    },
    /// moved 表示主检出是否更新；失败原因保留在 note 中。
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
    ChatNotifySent {
        number: u32,
        event_type: String,
        ok: bool,
        /// 失败原文。成功时为空。
        note: String,
    },

    /// 仅表示 MR 是否实际合入，不代表本地清理全部成功。
    IssueMerged {
        id: IssueId,
        pr_number: u32,
        merged: bool,
        /// 主检出更新和工作树清理的结果，失败信息也须保留。
        local_note: String,
    },
    /// 当前未接入 Orca 停止接口，was_live 为 false。
    RunCancelled {
        id: IssueId,
        was_live: bool,
    },
    SessionDeleted {
        id: IssueId,
        note: String,
    },
    /// 同日同指标再次保存时更新原值。
    MetricRecorded {
        project_id: ProjectId,
        name: String,
        day: String,
        value: String,
    },
    /// 健康计算结果，注册表仅保留显示缓存。
    HealthDerived {
        project_id: ProjectId,
        signal: crate::model::Signal,
        reasons: Vec<String>,
    },
    WorkbenchIssueReported {
        iid: u32,
        url: String,
    },
}
