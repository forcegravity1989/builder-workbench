//! 把内核状态拼成一份可直接渲染的 ViewModel。
//!
//! 这里是**现算**发生的地方:健康三条判据、指标读数、周列表、workflow 用过
//! 几次,全部当场从库、仓文件、git 取。**没有的就留空**,绝不为了界面好看
//! 填一个 0 或者一个假名字。

use crate::vm::*;
use bw::{
    app::App,
    command::Event,
    model::{IssueId, IssueKind, IssueStatus, Project, ProjectId},
    repo::project_file,
};

use super::{
    vm_derive::{build_bootstrap_pending, build_ops, build_week_counts},
    vm_kb::build_kb,
    vm_panels::{
        build_board, build_config, build_metrics, build_sessions, build_weeks, build_workbench,
    },
};

/// 开工工具的机读键 → 人话标签。从 `week_plan_file` 搬来(刀6:那个模块删了,
/// 这是个纯展示函数,留在这层)。
pub(super) fn tool_label(tool: &str) -> &str {
    match tool {
        "claude_cli" => "Claude CLI",
        "cursor" => "Cursor",
        "open_design" => "Open Design",
        "" => "—",
        other => other,
    }
}

/// 读一份仓文件:读不出来就把原话记进 `warnings`,再退回默认值。
/// 「退回默认值」本身没问题,**不说话**才是问题。
pub(super) fn read_or_warn<T>(
    what: &str,
    r: Result<Option<T>, bw::repo::RepoFileError>,
    warnings: &mut Vec<String>,
) -> Option<T> {
    match r {
        Ok(v) => v,
        Err(e) => {
            warnings.push(format!("{what} 读不出来:{e}"));
            None
        }
    }
}

/// 一次 `gather()` 采回来的**与导航无关**的贵数据。导航请求只跑 `assemble()`,
/// 复用这里的东西,不重跑 git 子进程 / 远端 / OD 探活。数据真变了(换项目、
/// 刷新、到点建活、开工/合入/建活等真命令)才重新 `gather`。只改一张活状态
/// 标签的命令补丁 [`Gathered::apply_issue_status`],不重拉 issue list。
///
/// 换项目时 `gather` 只跑第一波(名单 / 周目标 / 发版 / 健康 / 环境),推完
/// ViewModel 就切页;`pr_number` 后台回填,见 [`PrFillSpec`]。设计见
/// [`docs/02-adr/0002-导航快路径-gather缓存.md`](../../../docs/02-adr/0002-导航快路径-gather缓存.md)。
pub struct Gathered {
    /// 第几代 gather。`assemble` 用它判断 workbench 缓存是不是同一代采的。
    pub gen: u64,
    /// 项目墙卡片。导航时不重采(每项目一次 codehub/gh + git tag 太贵)。
    pub projects: Vec<ProjectCardVm>,
    /// 环境条。会话内探一次够了:OD 管道探活最多 400ms,PATH 扫 5 次,没理由每次导航重跑。
    pub env: Vec<ToolProbeVm>,
    /// 采这份数据时攒的仓文件读不动原话。
    pub warnings: Vec<String>,
    /// `claude` 本机路径(设置条)。会话内不变,缓存。
    pub claude_binary: Option<String>,
    /// 打开项目的那一份贵数据。`None` = 还在项目墙。
    pub open: Option<ProjectGathered>,
}

/// 打开项目的、与「在看哪一周 / 选中哪张活 / 展开哪个目录」无关的贵数据。
/// `assemble` 从它 + `UiState` 视图字段现切出 `ProjectVm`。
pub(super) struct ProjectGathered {
    id: bw::model::ProjectId,
    slug: String,
    name: String,
    project: Project,
    ws: std::path::PathBuf,
    file: project_file::ProjectFile,
    /// issue 列表。`pr_number` 第一屏只带 `mr_cache` 命中的;没查过的后台回填。
    issues: Vec<bw::Issue>,
    /// 项目墙「上次交付」。打开项目在 gather 里和发版/健康一起采,借给那张卡。
    last_delivery: String,
    /// 会话行。`live` 是采那一刻的(PTY 已封存,恒 false —— 没真进程信号,不假绿)。
    sessions: Vec<SessionVm>,
    releases: Vec<ReleaseVm>,
    health: HealthVm,
    /// 规范铺底件在不在默认分支 HEAD。`build_ops` 要它,只跟仓走、不跟周走,
    /// 所以这里算一次传给 `build_ops`,不再每重切都跑一遍 git。
    ops3_landed: bool,
    week_goals: std::collections::HashMap<String, String>,
    current_week: String,
    mr_url_prefix: String,
    issue_url_prefix: String,
    week_started: bool,
    ops1_status: Option<String>,
    /// 版本列表 + 当前登录用户。gather 采一次,assemble 只克隆 —— 切周 / 改
    /// 一张卡状态时不再打 `project view` / milestones / `/user`。
    plan_versions: Vec<PlanVersionVm>,
    current_user: String,
}

/// 会话工作台缓存键 + 值。切周 / 选卡片时会话相关 ui 字段没变,直接复用。
/// 切会话 / 换页签时键变,重算(现在 build_workbench 便宜,没 git 子进程了)。
#[derive(PartialEq)]
pub(super) struct WorkbenchKey {
    session_open: Option<bw::model::IssueId>,
    session_tab: crate::vm::SessionTab,
    od_src: String,
    od_gen: u64,
    /// Orca 网页地址变了也要重算(会话屏 OrcaView 依赖它)。
    orca_web_url: String,
}

pub(super) struct WorkbenchCache {
    /// 这份缓存是针对第几代 gather 的。gather 刷新后,旧缓存自动作废。
    gen: u64,
    key: WorkbenchKey,
    vm: crate::vm::WorkbenchVm,
}

/// 壳这边的纯导航状态(打开了哪个项目、在看哪一周)。不进库。
pub struct UiState {
    pub open: Option<ProjectId>,
    pub viewing_week: String,
    /// 看某个自定义版本(计划包)。空 = 不在看版本。
    pub viewing_plan: String,
    /// 总览在研下拉选中的版本。空 = 用覆盖当天里最后创建的。
    pub overview_version: String,
    /// 计划屏左栏点的是「全部」。
    pub view_all: bool,
    pub open_doc: Option<String>,
    pub note: Option<String>,
    /// 这是第几条回执。toast 靠它判断「这条我关过没有」—— 按正文判断的话,
    /// 同一句失败第二次出现会被当成已关过的那条,静默不弹。
    pub note_seq: u64,
    /// 「开始本周」回来的草稿活标,连同是哪一周。人确认前只存在这里,不进库。
    pub pending_drafts: Option<(String, Vec<String>)>,
    /// 会话屏选中哪个会话、开着哪个页签。纯导航状态,一律不进库。
    pub session_open: Option<bw::model::IssueId>,
    pub session_tab: crate::vm::SessionTab,
    /// 知识库屏在看哪个页签,以及代码图/资产两个页签**上一次点开时**跑出来的
    /// 结果。这两样各要起好几个子进程(codegraph、`git log --name-only`、仓
    /// 统计),每重拼一次 ViewModel 就重跑一遍会把界面拖垮 —— 所以只在人点
    /// 页签或点「重新跑一次」那一刻跑,结果放在这里。
    pub kb_tab: crate::vm::KbTab,
    pub kb_codegraph: Option<crate::vm::CodeGraphVm>,
    pub kb_assets: Option<crate::vm::AssetsVm>,
    /// 总览那块「项目指标 · 代码仓级」上一次采到的数。同理:采一次要起好几个
    /// git 子进程,只在人点「立即采集」那一刻跑。
    pub repo_stats: Option<crate::vm::RepoStatsVm>,
    /// 上一次「采一次指标」采到的东西。同理:起脚本要几百毫秒到几秒,只在人
    /// 点那一下才跑。**空 = 还没采过**,不是「采到的是 0」。
    pub metrics: Vec<bw::app::collect::MetricReadout>,
    /// 配置屏要亮的技能 slug。纯导航。
    pub focus_skill: String,
    pub data_dir: String,
    pub workspaces_root: String,
    /// Orca 网页配对 URL(本机设置读出来,带 token)。会话屏 iframe 打开它。
    pub orca_web_url: String,
    /// 接入屏那份仓列表的状态。**不进库** —— 它是「现在去平台问了一次」的结果,
    /// 关掉接入屏就该忘掉。
    pub repos: crate::vm::RepoPickerVm,
    /// 活的 MR 现查缓存(刀3:pr_number 不进库)。键是 IssueId;值是
    /// `(iid, 现在开着)`。`iid=0` = 查过了、没有 MR。
    pub mr_cache: std::collections::HashMap<bw::model::IssueId, (u32, bool)>,
    /// 会话屏 Open Design iframe 该打开的地址。开工成功后写入;空 = 组件自己探首页。
    pub od_src: String,
    /// 换一次就让 iframe 卸掉重挂,否则同一 origin 不刷新。
    pub od_gen: u64,
    /// gather 世代号。每次 `gather()` +1;workbench 缓存靠它判是不是同一代采的。
    pub gather_gen: u64,
    /// 会话工作台缓存(见 [`WorkbenchCache`])。导航切周时复用,不重跑 git。
    pub workbench_cache: Option<WorkbenchCache>,
    /// 长操作遮罩文案。空 = 不挡。
    pub busy: Option<String>,
    /// 这个进程里已经问过 Orca、仓已在的项目。只加速同进程连点,不落盘;
    /// 正本是 Orca `repo.show`。
    pub orca_repos_ready: std::collections::HashSet<bw::model::ProjectId>,
}

/// 后台查 MR 要带的那点信息。第一屏不靠它;回填时按 `gen` 对世代,换项目就丢。
#[derive(Clone)]
pub struct PrFillSpec {
    pub project_id: ProjectId,
    pub gen: u64,
    pub provider: String,
    pub remote_host: String,
    pub remote_path: String,
    pub pending: Vec<PrPending>,
}

/// 一张还没查过 MR 的活。`done` = 已完成,直接打 `--state all`,跳过 opened。
/// `charter` = 项目约定常驻分支 `bw/project`,不是 `bw/issue-<号>`。
#[derive(Clone, Copy)]
pub struct PrPending {
    pub id: bw::model::IssueId,
    pub number: u32,
    pub done: bool,
    pub charter: bool,
}

impl Gathered {
    /// 打开项目里还没进 `mr_cache` 的活。空 = 不用派后台。
    pub fn pr_fill_spec(
        &self,
        cache: &std::collections::HashMap<bw::model::IssueId, (u32, bool)>,
    ) -> Option<PrFillSpec> {
        let pg = self.open.as_ref()?;
        let pending: Vec<PrPending> = pg
            .issues
            .iter()
            .filter(|i| needs_pr_lookup(i) && !cache.contains_key(&i.id))
            .map(|i| PrPending {
                id: i.id,
                number: i.number,
                done: i.status == IssueStatus::Done,
                charter: i.title == bw::app::CHARTER_TITLE,
            })
            .collect();
        if pending.is_empty() {
            return None;
        }
        Some(PrFillSpec {
            project_id: pg.id,
            gen: self.gen,
            provider: pg.project.provider.clone(),
            remote_host: pg.project.remote_host.clone(),
            remote_path: pg.project.remote_path.clone(),
            pending,
        })
    }

    /// 后台 `mr list` 回来:写进打开项目那份 issue。世代不对由调用方先判。
    pub fn apply_pr_numbers(&mut self, entries: &[(bw::model::IssueId, u32, bool)]) {
        let Some(pg) = self.open.as_mut() else {
            return;
        };
        for &(id, pr, open) in entries {
            if let Some(i) = pg.issues.iter_mut().find(|i| i.id == id) {
                i.pr_number = pr;
                i.has_open_mr = open;
            }
        }
    }

    /// 远端刚写成功的那一张:只改内存里的状态,不重拉 issue list。
    /// 墙卡片的本周计数跟着这张活走。找不到这张活就不动。
    pub fn apply_issue_status(&mut self, id: IssueId, to: IssueStatus, settled: bool) {
        let Some(pg) = self.open.as_mut() else {
            return;
        };
        if !patch_issue_status(&mut pg.issues, id, to, settled) {
            return;
        }
        let pid = pg.id;
        let week = pg.current_week.clone();
        pg.week_started = bw::app::week_started(&pg.issues, &week);
        let ops1 = pg.issues.iter().find(|i| {
            bw::app::is_ops1_issue(i)
                && i.status != IssueStatus::Done
                && i.status != IssueStatus::Cancelled
        });
        pg.ops1_status = ops1
            .filter(|i| i.status != IssueStatus::Done)
            .map(|i| i.status.label().to_string());
        let today = bw::isoweek::today_ymd();
        let covering = covering_version_names(&pg.plan_versions, &today);
        let confirmed = pick_overview_version(&covering, "");
        let week_counts = if confirmed.is_empty() {
            WeekCountsVm::default()
        } else {
            build_week_counts(&pg.issues, Some(confirmed.as_str()))
        };
        let unread = bw::app::count_unseen(&pg.issues);
        if let Some(card) = self.projects.iter_mut().find(|c| c.id == pid) {
            card.week_total = week_counts.total() as u32;
            card.week_done = week_counts.done as u32;
            card.unread = unread;
        }
    }
}

fn patch_issue_status(
    issues: &mut [bw::Issue],
    id: IssueId,
    to: IssueStatus,
    settled: bool,
) -> bool {
    let Some(issue) = issues.iter_mut().find(|i| i.id == id) else {
        return false;
    };
    issue.status = to;
    if settled {
        issue.settled_at = Some(time::OffsetDateTime::now_utc().unix_timestamp());
    } else if to == IssueStatus::Cancelled {
        issue.settled_at = None;
    }
    true
}

/// 深链按 slug 找,找不到再按显示名找。
pub async fn find_project(app: &App, want: &str) -> Option<Project> {
    if let Ok(Some(p)) = app.project_by_slug(want).await {
        return Some(p);
    }
    app.projects()
        .await
        .ok()?
        .into_iter()
        .find(|p| p.name == want)
}

/// 一次命令回来一串事件,界面上那条回执只有一行 —— 取第一条,那是人刚做的
/// 那个动作。
///
/// **发群失败是个例外**:它永远排在末尾(合入、结清、发版这些账先记完,群通知
/// 是末尾一个失败也不影响主干的旁支),取第一条就把它盖掉了,人得到的回音会是
/// 完全的沉默。所以失败时把它附在主句后面 —— 这一条不显示的话,那句
/// 「发群失败」的文案就是死代码。
pub fn note_of(events: &[Event]) -> Option<String> {
    let mut note = primary_note(events)?;
    // 第一条就是它的时候(人主动点「同步到群」),主句已经说过了,别说两遍。
    if matches!(events.first(), Some(Event::ChatNotifySent { .. })) {
        return Some(note);
    }
    if let Some(Event::ChatNotifySent { note: why, .. }) = events
        .iter()
        .find(|e| matches!(e, Event::ChatNotifySent { ok: false, .. }))
    {
        note.push_str(&format!(";但发群没成:{why}(不会自动重发)"));
    }
    Some(note)
}

fn primary_note(events: &[Event]) -> Option<String> {
    events.first().map(|e| match e {
        Event::ProjectCreated { slug, adopted, .. } => {
            if *adopted {
                format!("接手了已有项目 {slug} —— 仓里原有的 .bw/project.toml 一个字没动")
            } else {
                format!("项目 {slug} 已接入")
            }
        }
        Event::SessionReopened { live, .. } => {
            if *live {
                "这场会话本来就开着".into()
            } else {
                "把上次那场会话接回来了 —— 它不会自己动手,你说话它才动".into()
            }
        }
        Event::ProjectRemoved {
            slug,
            issues,
            workspace,
        } => format!(
            "{slug} 已从工作台移走(连同 {issues} 张活的账)。**仓一个字节都没动**,还在 {workspace}"
        ),
        Event::ProjectCardEditPending { .. } => "项目信息改动已建成一张轻量活,等评审合入".into(),
        Event::StandardBootstrapped {
            files, committed, ..
        } => format!(
            "规范铺底:落盘 {} 个文件,{}",
            files.len(),
            if *committed {
                "已提交"
            } else {
                "无改动可提交"
            }
        ),
        Event::StandardReconciled {
            missing,
            stale,
            human_edited,
            ..
        } => format!(
            "规范对账:缺 {} 份、过期 {} 份、人改过 {} 份",
            missing.len(),
            stale.len(),
            human_edited.len()
        ),
        Event::WeekPlanStarted {
            week, draft_titles, ..
        } => {
            if draft_titles.is_empty() {
                // 真跑:文件由 agent 会话产出、走 MR,这里没有骨架也没有草稿。
                format!("运作活①已开工:{week} 的周计划由这场会话产出,提交走 MR,人合入后总览才亮")
            } else {
                format!("{week} 的运作活①已开工(流程演示),等你确认草稿")
            }
        }
        Event::WorkspacesRootChanged { path, pinned } => {
            let tail = if *pinned > 0 {
                format!(",已接入的 {pinned} 个项目已就地钉在原位置、不会跟着搬")
            } else {
                ",已接入的项目都在原处".to_string()
            };
            format!("工作区根目录改成了 {path}{tail}")
        }
        // 不带 URL 原文(配对 URL 带 token)。进会话屏即打开。
        Event::OrcaWebUrlChanged => "Orca 网页地址已保存,进会话屏即可".into(),
        Event::IssueSubmitted {
            branch,
            commits,
            pr_number,
            note,
            ..
        } => {
            if *pr_number > 0 {
                format!("`{branch}` 上 {commits} 个提交已推上去,MR {note},活进「评审中」")
            } else {
                // 没有 MR 的时候必须把原因原样端出来 —— 只说「已提交」会让人
                // 以为远端已经有东西等着评审了。
                format!("`{branch}` 上 {commits} 个提交已提交,活进「评审中」。没有 MR:{note}")
            }
        }
        Event::IssueMerged {
            pr_number,
            merged,
            local_note,
            ..
        } => {
            if *merged {
                // 本机收尾的下落必须跟着一起说 —— 拉没拉到最新决定了工作区里
                // 那几份 `.bw/` 件读不读得到,人得当场知道。
                format!("MR #{pr_number} 已合入,活已完成。{local_note}")
            } else {
                "这张活没有可合的 MR,只标了完成".into()
            }
        }
        Event::RunCancelled { was_live, .. } => {
            if *was_live {
                "已停止。这张活还停在「进行中」,再点▶跑就接回去。".into()
            } else {
                "本来就没有活着的终端可停。".into()
            }
        }
        Event::ChatNotifySent {
            event_type,
            ok,
            note,
            ..
        } => {
            let label = bw::chat::event_label(event_type);
            if *ok {
                format!("已发到项目群:{label}")
            } else {
                // 发群失败不回滚已经发生的合入/完成/发版,只在这里说一次;
                // 没有下一次自动重试,如实说清楚。
                format!("发群失败(合入/完成本身已经生效,不会自动重发):{note}")
            }
        }
        Event::OpsAutoFired { workflow, week, .. } => {
            format!("定时到点:{week} 的「{workflow}」已自动建活并开工")
        }
        Event::WeekPlanAlreadyExists { week, .. } => {
            format!("{week} 的「更新指标 + 制定版本计划」已经做过,没有重开")
        }
        Event::WeekPlanInProgress { week, status, .. } => {
            format!("{week} 的运作活①还在路上({status})—— 去会话屏接着聊")
        }
        Event::IssueCreated { number, .. } => format!("建了一张活 #{number}"),
        Event::IssueScheduled { week_of, .. } => {
            if week_of.is_empty() {
                "这张活挪回待办池了".into()
            } else {
                format!("这张活排进了 {week_of}")
            }
        }
        Event::IssueCategorySet { category, .. } => {
            format!("类别改成了{category},开工工具按映射重算")
        }
        Event::WorkspacePulled { note, .. } => note.clone(),
        Event::IssueRan { ok, summary, .. } => {
            if *ok {
                // PTY / OD 开工成功只是「会话起来了」,还没到评审中。
                // 原话已经说清去哪看,不再谎称推到评审中。
                summary.clone()
            } else {
                format!("这次没跑成,活留在原地可以重试。原话:{summary}")
            }
        }
        Event::IssueTransitioned { to, settled, .. } => {
            if *settled {
                "这张活结清了(只结这一次)".into()
            } else {
                format!("状态改成「{}」", to.label())
            }
        }
        Event::IssueBlocked { .. } => "已标成阻塞,原因写进了活的说明".into(),
        Event::IssueCancelled { .. } => "已作废:取消标签打上了,远端 issue 关了,原因在评论里".into(),
        Event::SessionDeleted { note, .. } => note.clone(),
        Event::ReleaseCut {
            version,
            rows_written,
        } => {
            if *rows_written {
                format!("远端已建 Release {version},选中的活打了发版标签")
            } else {
                format!("{version} 已经在发版记录里了,没写第二行")
            }
        }
        Event::ReleasePacked {
            version,
            passed,
            total,
            ..
        } => format!("{version} 出包好了,验包 {passed}/{total}"),
        Event::ReleasePackStopped { version } => format!("{version} 出包已停止,中间件清掉了"),
        Event::MetricsAutoCollected { count, .. } => {
            format!("今日自动采了 {count} 条 B 类指标")
        }
        Event::MetricRecorded {
            name, day, value, ..
        } => format!("记下了 {name} = {value}({day})"),
        Event::ToolMappingSaved { category } => format!("「{}」的映射保存了", category.label()),
        Event::ToolProbed { name, result } => format!("{name} 探活:{result:?}"),
        Event::HealthDerived { signal, .. } => format!("健康现算完成:{signal:?}"),
        Event::IssueScheduledToPlan { plan, .. } => {
            format!("已排进版本 {plan} —— 正本是 bw:plan 标签,codehub 里程碑同步中")
        }
        Event::PlanVersionCreated { name, .. } => format!("版本 {name} 已建"),
        Event::PlanVersionDeleted {
            name,
            issues_cleared,
            ..
        } => format!("版本 {name} 已删,摘了 {issues_cleared} 张活的计划标签"),
        Event::PlanVersionRenamed {
            from,
            to,
            issues_moved,
            ..
        } => format!("版本 {from} 已改成 {to},同步了 {issues_moved} 张活"),
        Event::IssueAssigneeSet { assignee, .. } => {
            if assignee.is_empty() {
                "已取消指派 · 已同步到 codehub".into()
            } else {
                format!("责任人改为 {assignee} · 已同步到 codehub")
            }
        }
        Event::IssueEdited { .. } => "issue 标题/正文已改 · 已同步到 codehub".into(),
        Event::WorkbenchIssueReported { .. } => "issue上报成功".into(),
    })
}

impl UiState {
    /// 写一条回执,并把序号往前推一格。**所有写 `note` 的地方都走这里**,
    /// 漏掉一处就会出现「关过一次之后同样的话再也不弹」。
    pub fn set_note(&mut self, note: Option<String>) {
        if let Some(ref n) = note {
            let kind = toast_kind(n);
            bw_engine::dlog::write(kind, "toast", file!(), line!(), n);
        }
        self.note = note;
        self.note_seq = self.note_seq.wrapping_add(1);
    }
}

fn toast_kind(s: &str) -> &'static str {
    const MARKS: &[&str] = &[
        "没做成",
        "没成",
        "失败",
        "采不了",
        "没拉到",
        "崩了",
        "去会话没成",
        "定时没跑成",
    ];
    if MARKS.iter().any(|p| s.contains(p)) {
        "err"
    } else {
        "ok"
    }
}

/// 全量采集:跑所有跟导航无关的贵 I/O(环境探活、issue 列表、健康三判据、
/// Release、会话、ops3_landed)。数据真变了(真命令、换项目、刷新、到点建活)
/// 才调它;导航请求复用上次结果(见 [`assemble`])。设计见 ADR 0002。
pub async fn gather(app: &App, ui: &mut UiState) -> Gathered {
    ui.gather_gen = ui.gather_gen.wrapping_add(1);
    let gen = ui.gather_gen;
    let projects = app.projects().await.unwrap_or_default();
    let mut warnings: Vec<String> = Vec::new();
    let current_week = bw::isoweek::current_week();
    let ids: Vec<ProjectId> = projects.iter().map(|p| p.id).collect();
    // 第一波:环境条和各项目 issue list 一起打。名单齐了才能切页。
    let (env, issue_rows) = tokio::join!(probe_env(), fetch_issues_many(app, &ids));
    let claude_binary = bw_engine::resolve_claude_binary(None);

    let mut issues_by_id = std::collections::HashMap::new();
    for (id, r) in issue_rows {
        match r {
            Ok(v) => {
                issues_by_id.insert(id, v);
            }
            Err(e) => {
                warnings.push(format!("读 issue 失败:{e}"));
                issues_by_id.insert(id, Vec::new());
            }
        }
    }

    let open_g = match ui.open {
        Some(id) => {
            let issues = issues_by_id.remove(&id).unwrap_or_default();
            gather_project(app, id, ui, &mut warnings, &current_week, issues).await
        }
        None => None,
    };

    let mut wall_jobs: Vec<WallJob> = Vec::new();
    for p in &projects {
        if Some(p.id) == ui.open {
            continue;
        }
        let ws = app.workspace_of(p.id).await.unwrap_or_default();
        let file = read_or_warn(
            &format!("{} 的 .bw/project.toml", p.slug),
            project_file::read(&ws),
            &mut warnings,
        )
        .unwrap_or_default();
        let issues = issues_by_id.remove(&p.id).unwrap_or_default();
        wall_jobs.push(WallJob {
            p: p.clone(),
            ws,
            file,
            issues,
        });
    }
    let wall_extras = wall_extras_many(app, &wall_jobs).await;
    let mut extras = wall_jobs.into_iter().zip(wall_extras);

    let mut cards = Vec::with_capacity(projects.len());
    for p in &projects {
        let (issues, goals, last_delivery, brief, version, ws_path) = if Some(p.id) == ui.open {
            let g = open_g.as_ref();
            (
                g.map(|g| g.issues.clone()).unwrap_or_default(),
                g.map(|g| g.week_goals.clone()).unwrap_or_default(),
                g.map(|g| g.last_delivery.clone()).unwrap_or_default(),
                g.map(|g| g.file.brief.clone()).unwrap_or_default(),
                g.map(|g| {
                    let today = bw::isoweek::today_ymd();
                    covering_version_names(&g.plan_versions, &today)
                        .into_iter()
                        .next()
                        .unwrap_or_default()
                })
                .unwrap_or_default(),
                g.map(|g| g.ws.display().to_string())
                    .unwrap_or_else(|| p.workspace_path.clone()),
            )
        } else {
            let (job, (goals, last_delivery, version)) =
                extras.next().expect("墙项目与 extras 对齐");
            (
                job.issues,
                goals,
                last_delivery,
                job.file.brief,
                version,
                job.ws.display().to_string(),
            )
        };
        let week_counts = if version.is_empty() {
            WeekCountsVm::default()
        } else {
            build_week_counts(&issues, Some(version.as_str()))
        };
        let week_total = (week_counts.todo
            + week_counts.doing
            + week_counts.review
            + week_counts.done
            + week_counts.blocked) as u32;
        let unread = bw::app::count_unseen(&issues);
        let week_goal = if version.is_empty() {
            String::new()
        } else {
            goals.get(&version).cloned().unwrap_or_default()
        };
        cards.push(ProjectCardVm {
            id: p.id,
            slug: p.slug.clone(),
            name: p.name.clone(),
            brief,
            signal: p.signal,
            workspace_path: ws_path,
            remote: remote_label(p),
            week_total,
            week_done: week_counts.done as u32,
            version,
            week: current_week.clone(),
            unread,
            week_goal,
            last_delivery,
        });
    }

    let mut seen = std::collections::HashSet::new();
    warnings.retain(|w| seen.insert(w.clone()));
    for w in &warnings {
        bw_engine::dlog!(warn, "gather", "[BW_WARN] {w}");
    }

    Gathered {
        gen,
        projects: cards,
        env,
        warnings,
        claude_binary,
        open: open_g,
    }
}

struct WallJob {
    p: Project,
    ws: std::path::PathBuf,
    file: project_file::ProjectFile,
    issues: Vec<bw::Issue>,
}

async fn fetch_issues_many(
    app: &App,
    ids: &[ProjectId],
) -> Vec<(ProjectId, Result<Vec<bw::Issue>, String>)> {
    let mut out = Vec::with_capacity(ids.len());
    let mut i = 0;
    while i < ids.len() {
        if i + 1 < ids.len() {
            let (a, b) = tokio::join!(app.issues(ids[i]), app.issues(ids[i + 1]));
            out.push((ids[i], a.map_err(|e| e.to_string())));
            out.push((ids[i + 1], b.map_err(|e| e.to_string())));
            i += 2;
        } else {
            let a = app.issues(ids[i]).await;
            out.push((ids[i], a.map_err(|e| e.to_string())));
            i += 1;
        }
    }
    out
}

async fn wall_extra(
    app: &App,
    job: &WallJob,
) -> (std::collections::HashMap<String, String>, String, String) {
    let (goals, last_delivery, version) = tokio::join!(
        app.week_goals_from_ops1(&job.p, &job.issues),
        async {
            bw::git::tags_with_dates(&job.ws)
                .await
                .into_iter()
                .last()
                .map(|(tag, date)| format!("{date} {tag}"))
                .unwrap_or_default()
        },
        async {
            let Ok(remote) = app.remote_for(&job.p) else {
                return String::new();
            };
            let Ok(rows) = remote.list_milestones(&job.p.remote_path).await else {
                return String::new();
            };
            bw::version::current_from_milestones(&rows, &bw::isoweek::today_ymd())
                .unwrap_or_default()
        },
    );
    (goals, last_delivery, version)
}

async fn wall_extras_many(
    app: &App,
    jobs: &[WallJob],
) -> Vec<(std::collections::HashMap<String, String>, String, String)> {
    let mut out = Vec::with_capacity(jobs.len());
    let mut i = 0;
    while i < jobs.len() {
        if i + 1 < jobs.len() {
            let (a, b) = tokio::join!(wall_extra(app, &jobs[i]), wall_extra(app, &jobs[i + 1]));
            out.push(a);
            out.push(b);
            i += 2;
        } else {
            out.push(wall_extra(app, &jobs[i]).await);
            i += 1;
        }
    }
    out
}

/// 从上次 [`gather`] 的结果 + 当前 `UiState` 视图字段现切一份 `Vm`。只做依赖
/// `viewing_week` / `view_all` / `selected_issue` / 会话 / 页签 的重切:看板按周
/// 过滤、四段计数、运作活状态点、指标读数、会话工作台、知识库扫描。**健康 /
/// Release / 环境 / issue / 版本列表 / 当前用户 / ops3 的 git 子进程与远端
/// 一律不跑**(都在 gather 采过);**会话工作台**(`build_workbench`)在会话相关字段变(展开目录 / 切会话 /
/// 换页签)时仍跑 `list_dir` / `changed_files` / `ahead_behind` / `file_diff`
/// 几个 git——但同代 gather 内键没变就复用缓存,**切周 / 选卡片时不会跑**。
/// 导航请求只调它。设计见 ADR 0002。
pub async fn assemble(app: &App, ui: &mut UiState, g: &Gathered) -> Vm {
    let open = match (&g.open, ui.open) {
        (Some(pg), Some(_)) => Some(assemble_project(app, ui, pg, g.gen, &g.env).await),
        _ => None,
    };
    Vm {
        ready: true,
        fatal: None,
        projects: g.projects.clone(),
        env: g.env.clone(),
        repos: ui.repos.clone(),
        open,
        settings: SettingsVm {
            workspaces_root: ui.workspaces_root.clone(),
            orca_web_url: ui.orca_web_url.clone(),
            data_dir: ui.data_dir.clone(),
            claude_binary: g.claude_binary.clone(),
        },
        note: ui.note.clone(),
        note_seq: ui.note_seq,
        busy: ui.busy.clone(),
        warnings: g.warnings.clone(),
    }
}

pub(super) fn remote_label(p: &Project) -> String {
    if p.remote_path.is_empty() {
        "—(没挂远端)".into()
    } else {
        format!("{} · {}", p.provider, p.remote_path)
    }
}

/// 本机环境条。探不到就是探不到;还没接实现的返回「不知道」显示灰,不是红。
pub(super) async fn probe_env() -> Vec<ToolProbeVm> {
    // 探活与「要什么才能用」都问适配模块要,不在这里重写一遍 —— 加一个新的
    // 开工工具应该只是加一个适配模块目录,不改这个文件。
    //
    // 六项各走各的真实探活:能在 `PATH` 里当场找出来的(claude / cursor-agent /
    // codehub-cli / gh / welink-cli)走 `which_on_path`;Open Design 是本机网页
    // 内嵌类,走命名管道握手取 loopback URL(`bw_engine::open_design`)。绿/红
    // 都是真的;探不到就红,不是灰——灰只留给「这工具压根没接」。
    let claude = crate::adapters::claude_cli::detect();
    let cursor = bw_engine::which_on_path("cursor-agent");
    // **探的名字必须和真起的进程一模一样**:`codehub.rs` 里 8 处 shell-out 全是
    // `codehub-cli`。探 `codehub`、起 `codehub-cli`,两边对不上时这一格给的答案
    // 就是错的 —— 装了报红,或者更糟:机器上恰好有个叫 `codehub` 的别名,这格
    // 报绿而真正要起的 `codehub-cli` 根本不在。
    let codehub = bw_engine::which_on_path("codehub-cli");
    let gh = bw_engine::which_on_path("gh");
    // welink-cli 是 npm 的 `.cmd` shim,`which_on_path` 认 PATHEXT(含 .CMD)能找到。
    // 这里只探「装没装」——登录态要起子进程(`welink-cli auth status`),那是按
    // 群号的 probe(发测试消息)的事,不在环境条这儿做。
    let welink = bw_engine::which_on_path("welink-cli");
    let od_url = bw_engine::open_design::discover_web_url().await;
    vec![
        ToolProbeVm {
            name: "claude_cli".into(),
            label: "claude".into(),
            ok: Some(claude.is_some()),
            detail: claude.unwrap_or_else(|| {
                format!(
                    "本机路径里找不到 claude。要用它得先有:{}",
                    crate::adapters::claude_cli::REQUIRES.join("、")
                )
            }),
        },
        ToolProbeVm {
            name: "cursor".into(),
            label: "cursor-agent".into(),
            ok: Some(cursor.is_some()),
            detail: cursor.unwrap_or_else(|| "本机路径里找不到 cursor-agent".into()),
        },
        ToolProbeVm {
            name: "codehub".into(),
            label: "codehub-cli".into(),
            ok: Some(codehub.is_some()),
            detail: codehub.unwrap_or_else(|| "本机路径里找不到 codehub-cli".into()),
        },
        ToolProbeVm {
            name: "gh".into(),
            label: "GitHub CLI".into(),
            ok: Some(gh.is_some()),
            // 装没装能当场看出来;**登录没登录看不出来** —— 那要跑
            // `gh auth status`,起子进程的事没接,就别拿「装了」冒充「登录了」。
            detail: gh
                .map(|p| format!("{p}(登录态没探,探它要起子进程)"))
                .unwrap_or_else(|| "本机路径里找不到 gh".into()),
        },
        ToolProbeVm {
            name: "open_design".into(),
            label: "Open Design".into(),
            // 命名管道握手拿到 loopback URL = 在听(绿);拿不到 = 没起(红)。
            ok: Some(od_url.is_some()),
            detail: od_url
                .unwrap_or_else(|| "本机 Open Design 没起来(管道握手没拿到 loopback URL)".into()),
        },
        ToolProbeVm {
            name: "welink_cli".into(),
            label: "welink-cli".into(),
            ok: Some(welink.is_some()),
            detail: welink.unwrap_or_else(|| "本机路径里找不到 welink-cli".into()),
        },
    ]
}

/// 进行中 / 待评审 / 阻塞 / 已完成,以及停在待办的名片轻量活,详情和横幅要 MR 号。
fn needs_pr_lookup(i: &bw::Issue) -> bool {
    if i.number == 0 {
        return false;
    }
    let card_edit = bw::app::is_charter_title(&i.title)
        && matches!(
            i.status,
            IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::InProgress
        );
    matches!(
        i.status,
        IssueStatus::InProgress | IssueStatus::InReview | IssueStatus::Blocked | IssueStatus::Done
    ) || card_edit
}

fn apply_mr_cache(
    issues: &mut [bw::Issue],
    cache: &std::collections::HashMap<bw::model::IssueId, (u32, bool)>,
) {
    for i in issues.iter_mut() {
        if let Some(&(pr, open)) = cache.get(&i.id) {
            i.pr_number = pr;
            i.has_open_mr = open;
        }
    }
}

/// 后台按活查 MR。跨活最多 8 路并行;同一张活 opened → all 仍串行。
/// 已完成直接 `--state all`,跳过 opened。
pub async fn fill_pr_numbers_parallel(spec: PrFillSpec) -> Vec<(bw::model::IssueId, u32, bool)> {
    let Ok(remote) = bw_engine::remote::Remote::for_project(
        &spec.provider,
        &spec.remote_host,
        &spec.remote_path,
    ) else {
        return Vec::new();
    };
    let remote = std::sync::Arc::new(remote);
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
    let mut set = tokio::task::JoinSet::new();
    for item in spec.pending {
        let remote = remote.clone();
        let sem = sem.clone();
        set.spawn(async move {
            let _ok = sem.acquire().await.ok()?;
            Some(lookup_pr_one(&remote, item).await)
        });
    }
    let mut out = Vec::new();
    while let Some(r) = set.join_next().await {
        if let Ok(Some(e)) = r {
            out.push(e);
        }
    }
    out
}

async fn lookup_pr_one(
    remote: &bw_engine::remote::Remote,
    item: PrPending,
) -> (bw::model::IssueId, u32, bool) {
    let branch = if item.charter {
        bw_engine::workspace::PROJECT_BRANCH.to_string()
    } else {
        bw_engine::github::issue_branch(item.number)
    };
    if item.done {
        return match remote.mr_for_branch(&branch).await {
            Ok(Some(n)) => (item.id, n, false),
            _ => (item.id, 0, false),
        };
    }
    match remote.open_mr_for_branch(&branch).await {
        Ok(Some(n)) => (item.id, n, true),
        _ => match remote.mr_for_branch(&branch).await {
            Ok(Some(n)) => (item.id, n, false),
            _ => (item.id, 0, false),
        },
    }
}

/// 采打开项目那份贵数据。issue 列表由 [`gather`] 第一波并行拉齐后传入,
/// 这里不再起第二次 codehub。健康 / 发版 / 周目标 / 会话 / 标签一起打。
/// `pr_number` 只套 `mr_cache`;没查过的后台回填,不挡第一屏。
async fn gather_project(
    app: &App,
    id: ProjectId,
    ui: &mut UiState,
    warnings: &mut Vec<String>,
    current_week: &str,
    mut issues: Vec<bw::Issue>,
) -> Option<ProjectGathered> {
    let p = app.project(id).await.ok()??;
    let ws = app.workspace_of(id).await.ok()?;
    let mut file =
        read_or_warn(".bw/project.toml", project_file::read(&ws), warnings).unwrap_or_default();
    apply_mr_cache(&mut issues, &ui.mr_cache);
    if let Some(overlay) = bw::app::overlay_project_file(&ws, &issues) {
        file = overlay;
    }
    let mr_url_prefix = p.mr_url_prefix();
    let issue_url_prefix = p.issue_url_prefix();

    let (sessions, week_goals, releases, ops3_landed, last_delivery, plan_versions, current_user) = tokio::join!(
        build_sessions(app, id, &issues),
        app.week_goals_from_ops1(&p, &issues),
        load_releases(app, &p, &ws),
        bw::git::path_in_head(&ws, ".bw/project.toml"),
        async {
            bw::git::tags_with_dates(&ws)
                .await
                .into_iter()
                .last()
                .map(|(tag, date)| format!("{date} {tag}"))
                .unwrap_or_default()
        },
        build_plan_versions(app, &p, &issues),
        current_user(app, &p),
    );

    let covering_now = covering_version_names(&plan_versions, &bw::isoweek::today_ymd());
    let goal_key = covering_now.first().cloned().unwrap_or_default();
    let inputs = bw::app::collect_health_inputs(
        &p,
        &ws,
        current_week,
        &issues,
        week_goals.get(&goal_key).map(String::as_str),
    )
    .await;
    let derived = bw::derive::derive_project_health(&inputs);
    if p.signal != Some(derived.signal()) || p.weekly_signal != Some(derived.weekly_signal()) {
        let _ = app.cache_project_health(id, &derived).await;
    }

    let week_started = bw::app::week_started(&issues, current_week);
    let ops1 = issues.iter().find(|i| {
        bw::app::is_ops1_issue(i)
            && i.status != bw::model::IssueStatus::Done
            && i.status != bw::model::IssueStatus::Cancelled
    });
    let ops1_status = ops1
        .filter(|i| i.status != IssueStatus::Done)
        .map(|i| i.status.label().to_string());
    Some(ProjectGathered {
        id,
        slug: p.slug.clone(),
        name: p.name.clone(),
        project: p.clone(),
        ws,
        file,
        issues,
        last_delivery,
        sessions,
        releases,
        health: HealthVm {
            signal: Some(derived.signal()),
            reasons: derived
                .reasons()
                .iter()
                .map(|r| (r.ok, r.text.clone()))
                .collect(),
        },
        ops3_landed,
        week_goals,
        current_week: current_week.to_string(),

        mr_url_prefix,
        issue_url_prefix,
        week_started,
        ops1_status,
        plan_versions,
        current_user,
    })
}

/// 从 [`ProjectGathered`] + 视图字段现切 `ProjectVm`。不起 git 子进程
/// (`ops3_landed` 已采)、不重探 OD(`env` 已采)。会话工作台用键缓存住,
/// 切周 / 选卡片时会话字段没变就直接复用。见 [`assemble`]。
async fn assemble_project(
    _app: &App,
    ui: &mut UiState,
    pg: &ProjectGathered,
    gen: u64,
    env: &[ToolProbeVm],
) -> ProjectVm {
    let current_week = pg.current_week.clone();
    let viewing_week = if ui.viewing_week.is_empty() {
        current_week.clone()
    } else {
        ui.viewing_week.clone()
    };
    // 全部 / 某个版本。不再按旧 bw:week 切视图。
    let plan = if !ui.viewing_plan.is_empty() {
        Some(ui.viewing_plan.as_str())
    } else {
        None
    };
    let view_all = plan.is_none();
    // 指标读数按正在看的那一周现读(本机 jsonl,便宜)。
    let readings = bw::app::read_metric_readings(&pg.ws, &viewing_week);
    // 会话 live:PTY 已封存,build_sessions 已经如实置 false(没真进程信号,不假
    // 绿)。这里直接用采到的那份,不再查什么 live。
    let sessions: Vec<SessionVm> = pg.sessions.clone();
    // workbench 缓存:会话相关 ui 字段没变 + 同一代 gather,就复用。切会话 / 换
    // 页签时键变,重算(build_workbench 现在便宜,没 git 子进程了)。
    let wb_key = WorkbenchKey {
        session_open: ui.session_open,
        session_tab: ui.session_tab,
        od_src: ui.od_src.clone(),
        od_gen: ui.od_gen,
        orca_web_url: ui.orca_web_url.clone(),
    };
    let hit = ui
        .workbench_cache
        .as_ref()
        .is_some_and(|c| c.gen == gen && c.key == wb_key);
    let workbench = if hit {
        ui.workbench_cache.as_ref().expect("刚判过 hit").vm.clone()
    } else {
        let vm = build_workbench(
            &sessions,
            &pg.issues,
            ui.session_open,
            ui.session_tab,
            &ui.od_src,
            ui.od_gen,
            &ui.orca_web_url,
        );
        ui.workbench_cache = Some(WorkbenchCache {
            gen,
            key: wb_key,
            vm: vm.clone(),
        });
        vm
    };
    let today = bw::isoweek::today_ymd();
    let covering = covering_version_names(&pg.plan_versions, &today);
    let confirmed = pick_overview_version(&covering, &ui.overview_version);
    let week_covered = week_is_covered(&pg.plan_versions, &pg.current_week);
    let mut plan_versions = pg.plan_versions.clone();
    let released_names: Vec<String> = pg
        .releases
        .iter()
        .map(|r| r.version.clone())
        .chain(
            pg.issues
                .iter()
                .filter(|i| !i.version.is_empty())
                .map(|i| i.version.clone()),
        )
        .collect();
    for v in &mut plan_versions {
        v.released = released_names.iter().any(|r| r == &v.name);
        if v.goal.is_empty() {
            if let Some(g) = pg.week_goals.get(&v.name) {
                v.goal = g.clone();
            }
        }
    }
    let plan_names: Vec<String> = plan_versions.iter().map(|v| v.name.clone()).collect();
    let inv = bw::version::inventory(&plan_names, &released_names);
    ProjectVm {
        id: pg.id,
        slug: pg.slug.clone(),
        name: pg.name.clone(),
        card: CardVm {
            brief: or_blank(&pg.file.brief),
            benchmark: or_blank(&pg.file.benchmark),
            north_star: or_blank(&pg.file.opportunity),
            remote: remote_label(&pg.project),
            current_version: if confirmed.is_empty() {
                "（空）".into()
            } else {
                confirmed.clone()
            },
            current_version_raw: confirmed.clone(),
            standard_version: or_blank(&pg.file.standard_version),
            chat: match &pg.file.chat {
                None => "未配".into(),
                Some(c) => format!("{} · 群号 {}", c.provider, c.group_id),
            },
        },
        health: pg.health.clone(),
        metrics: build_metrics(
            &pg.ws,
            &pg.issues,
            &ui.metrics,
            &readings,
            !ui.metrics.is_empty(),
        ),
        week_started: pg.week_started,
        week_covered,
        covering_versions: covering.clone(),
        last_released: inv.last_released.clone().unwrap_or_default(),
        unreleased: inv.unreleased.clone(),
        suggested_next: inv.suggested_next.clone(),
        confirmed_version: confirmed.clone(),
        ops1_status: pg.ops1_status.clone(),
        bootstrap_pending: build_bootstrap_pending(&pg.issues, pg.ops3_landed),
        weeks: build_weeks(&pg.issues, &pg.current_week, &pg.week_goals),
        current_week: pg.current_week.clone(),
        viewing_week: viewing_week.clone(),
        viewing_plan: ui.viewing_plan.clone(),
        view_all,
        board: build_board(&pg.issues, plan),
        plan_versions,
        current_user: pg.current_user.clone(),
        week_counts: if confirmed.is_empty() {
            WeekCountsVm::default()
        } else {
            build_week_counts(&pg.issues, Some(confirmed.as_str()))
        },
        board_counts: build_week_counts(&pg.issues, plan),
        ops: build_ops(&pg.issues, pg.current_week.as_str(), pg.ops3_landed),
        board_ops: build_ops(&pg.issues, viewing_week.as_str(), pg.ops3_landed),
        // 采不采由界面点 —— 现算一次要起好几个 git 子进程,不能每次重切都跑。
        repo_stats: ui.repo_stats.clone(),
        pending_drafts: match &ui.pending_drafts {
            Some((w, titles)) if *w == viewing_week => titles.clone(),
            _ => Vec::new(),
        },
        releases: pg.releases.clone(),
        sessions: sessions.clone(),
        session_open: ui.session_open,
        mr_url_prefix: pg.mr_url_prefix.clone(),
        issue_url_prefix: pg.issue_url_prefix.clone(),
        workbench,
        notify: NotifyVm {
            // 评审中的活张数,现算。项目墙 ⚾ 与项目轨头部徽章读它。通知页签已删
            // (ADR-0003),事件流/等你合入列表不再进 ViewModel。
            unread: bw::app::count_unseen(&pg.issues),
        },
        config: {
            let settings = bw::local::Settings::load(std::path::Path::new(&ui.data_dir)).ok();
            let mut c = build_config(
                &pg.ws,
                settings.as_ref(),
                &pg.project,
                &pg.file,
                &pg.issues,
                env,
            );
            c.focus_skill = ui.focus_skill.clone();
            c
        },
        kb: KbVm {
            codegraph: ui.kb_codegraph.clone(),
            assets: ui.kb_assets.clone(),
            ..build_kb(&pg.ws, ui.kb_tab, ui.open_doc.as_deref())
        },
    }
}

pub(super) fn or_blank(s: &str) -> String {
    if s.trim().is_empty() {
        "(待填)".into()
    } else {
        s.to_string()
    }
}

/// 自定义版本(计划包)列表:扫 issues 的 `plan_version` 字段去重,带计数。
/// 起止时间暂留空(要读 codehub milestone 列表才有,VM 构建时不起远端调用)。
/// 当前登录用户名(给列表「我的」筛选用)。读不到返空。
async fn current_user(app: &App, p: &Project) -> String {
    match app.remote_for(p) {
        Ok(r) => r.current_user().await.unwrap_or_default(),
        Err(_) => String::new(),
    }
}

/// 版本列表:扫 issues 的 `plan_version` + 读全部里程碑补 start/end,
/// 没挂活的空版本也能出现。每个里程碑标题都是一个版本。
async fn build_plan_versions(app: &App, p: &Project, issues: &[bw::Issue]) -> Vec<PlanVersionVm> {
    let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for i in issues {
        if i.plan_version.is_empty() {
            continue;
        }
        *counts.entry(i.plan_version.clone()).or_default() += 1;
    }
    // 从 codehub milestone 列表读全部版本,补上 start/end,且让
    // 没勾 issue 的空版本也能出现。读不到(没挂远端/cli 失败)就只靠 issues 标签。
    let mut order: Vec<String> = Vec::new();
    let mut meta: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();
    if let Ok(remote) = app.remote_for(p) {
        if let Ok(rows) = remote.list_milestones(&p.remote_path).await {
            for (title, start, due, created) in rows {
                if !order.contains(&title) {
                    order.push(title.clone());
                }
                meta.insert(title, (start, due, created));
            }
        }
    }
    // issues 里带的版本名也补进 order(防止 milestone 列表读不到时漏掉)
    for i in issues {
        if !i.plan_version.is_empty() && !order.contains(&i.plan_version) {
            order.push(i.plan_version.clone());
        }
    }
    order
        .into_iter()
        .filter(|name| !name.is_empty())
        .map(|name| {
            let (start, end, created_at) = meta.get(&name).cloned().unwrap_or_default();
            PlanVersionVm {
                name: name.clone(),
                start,
                end,
                created_at,
                issue_count: counts.remove(&name).unwrap_or(0),
                released: false,
                goal: String::new(),
            }
        })
        .collect()
}

fn covering_version_names(versions: &[PlanVersionVm], day: &str) -> Vec<String> {
    let rows: Vec<(String, String, String, String)> = versions
        .iter()
        .map(|v| {
            (
                v.name.clone(),
                v.start.clone(),
                v.end.clone(),
                v.created_at.clone(),
            )
        })
        .collect();
    bw::version::covering_on(&rows, day)
        .into_iter()
        .map(str::to_string)
        .collect()
}

fn week_is_covered(versions: &[PlanVersionVm], week: &str) -> bool {
    versions
        .iter()
        .any(|v| bw::version::overlaps_week(&v.start, &v.end, week))
}

fn pick_overview_version(covering: &[String], selected: &str) -> String {
    if covering.iter().any(|n| n == selected) {
        selected.to_string()
    } else {
        covering.first().cloned().unwrap_or_default()
    }
}

pub(super) fn card_item(i: &bw::Issue) -> CardItemVm {
    CardItemVm {
        id: i.id,
        number: i.number,
        title: i.title.clone(),
        category: if i.kind == IssueKind::Ops {
            "运作".into()
        } else {
            i.category.map(|c| c.label()).unwrap_or("—").into()
        },
        tool: tool_label(&i.tool).into(),
        workflow: if i.workflow.is_empty() {
            "—".into()
        } else {
            i.workflow.clone()
        },
        kind: i.kind.label().into(),
        origin: i.origin.label().into(),
        week_of: i.week_of.clone(),
        version: i.version.clone(),
        metric_key: i.metric_key.clone(),
        settled: i.settled_at.is_some(),
        status: i.status,
        pr_number: i.pr_number,
        has_open_mr: i.has_open_mr,
        remote_number: i.remote_number,
        branch: i.branch.clone(),
        body: i.body.clone(),
        assignee: i.assignee.clone(),
        author: i.author.clone(),
        plan_version: i.plan_version.clone(),
        updated_at: if i.updated_at > 0 {
            i.updated_at
        } else {
            i.created_at
        },
    }
}

/// 发版次数与列表:优先读远端 Release。本机 git 标签经常还没 fetch,只靠它
/// 会把刚发出去的版本算成 0。远端读不到(没挂仓 / CLI 失败)再退回本机标签。
pub(super) async fn load_releases(app: &App, p: &Project, ws: &std::path::Path) -> Vec<ReleaseVm> {
    if p.has_remote() {
        if let Ok(remote) = app.remote_for(p) {
            if let Ok(tags) = remote.list_releases().await {
                if !tags.is_empty() {
                    return tags
                        .into_iter()
                        .map(|tag| ReleaseVm {
                            version: tag,
                            released_at: String::new(),
                            note: String::new(),
                            included: "—".into(),
                            origin: "远端 Release".into(),
                        })
                        .collect();
                }
            }
        }
    }
    bw::git::tags_with_dates(ws)
        .await
        .into_iter()
        .rev()
        .map(|(tag, date)| ReleaseVm {
            version: tag,
            released_at: date,
            note: String::new(),
            included: "—".into(),
            origin: "git 标签".into(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bw::model::{Issue, IssueKind, IssueOrigin, ProjectId};

    fn issue(iid: u32, status: IssueStatus) -> Issue {
        Issue {
            id: IssueId::from_remote(ProjectId::nil(), iid),
            project_id: ProjectId::nil(),
            number: iid,
            remote_number: iid,
            title: "测".into(),
            body: String::new(),
            status,
            branch: String::new(),
            pr_number: 0,
            has_open_mr: false,
            week_of: "2026-W35".into(),
            version: String::new(),
            tool: String::new(),
            kind: IssueKind::Business,
            origin: IssueOrigin::Human,
            workflow: String::new(),
            category: None,
            sort_order: 0.0,
            metric_key: String::new(),
            created_at: 0,
            updated_at: 0,
            settled_at: None,
            assignee: String::new(),
            author: String::new(),
            plan_version: String::new(),
        }
    }

    #[test]
    fn patch_moves_status_and_settles_done() {
        let id = IssueId::from_remote(ProjectId::nil(), 7);
        let mut issues = vec![issue(7, IssueStatus::InReview)];
        assert!(patch_issue_status(&mut issues, id, IssueStatus::Done, true));
        assert_eq!(issues[0].status, IssueStatus::Done);
        assert!(issues[0].settled_at.is_some());
    }

    #[test]
    fn patch_cancel_clears_settled() {
        let id = IssueId::from_remote(ProjectId::nil(), 3);
        let mut issues = vec![issue(3, IssueStatus::Todo)];
        issues[0].settled_at = Some(1);
        assert!(patch_issue_status(
            &mut issues,
            id,
            IssueStatus::Cancelled,
            false
        ));
        assert_eq!(issues[0].status, IssueStatus::Cancelled);
        assert!(issues[0].settled_at.is_none());
    }

    #[test]
    fn patch_unknown_id_is_false() {
        let mut issues = vec![issue(1, IssueStatus::Todo)];
        assert!(!patch_issue_status(
            &mut issues,
            IssueId::from_remote(ProjectId::nil(), 99),
            IssueStatus::Blocked,
            false
        ));
        assert_eq!(issues[0].status, IssueStatus::Todo);
    }
}
