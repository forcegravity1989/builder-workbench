//! 把内核状态拼成一份可直接渲染的 ViewModel。
//!
//! 这里是**现算**发生的地方:健康三条判据、指标读数、周列表、workflow 用过
//! 几次,全部当场从库、仓文件、git 取。**没有的就留空**,绝不为了界面好看
//! 填一个 0 或者一个假名字。

use crate::vm::*;
use bw::app::App;
use bw::command::Event;
use bw::model::{IssueKind, IssueStatus, Project, ProjectId};
use bw::repo::{issue_policy_file, project_file};

use super::vm_derive::{build_card_mr, build_ops, build_week_counts};
use super::vm_kb::build_kb;
use super::vm_panels::{
    build_board, build_config, build_metrics, build_sessions, build_weeks, build_workbench,
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
/// 复用这里的东西,不重跑 git 子进程 / 远端 / OD 探活。数据真变了(真命令、换
/// 项目、刷新、到点建活)才重新 `gather` 刷新它。设计见
/// [`docs/adr/0002-导航快路径-gather缓存.md`](../../../docs/adr/0002-导航快路径-gather缓存.md)。
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
    policy: Option<issue_policy_file::IssuePolicyFile>,
    /// 已填好 `pr_number`(`fill_pr_numbers` 跑过、`mr_cache` 跑过)的 issue 列表。
    issues: Vec<bw::Issue>,
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
            format!("{week} 的「更新指标 + 制定本周计划」已经做过,没有重开")
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
        Event::PlanVersionCreated { name, .. } => {
            format!("版本 {name} 已建 —— 自定义计划包,和发版号不是一回事")
        }
        Event::PlanVersionDeleted {
            name,
            issues_cleared,
            ..
        } => {
            format!("版本 {name} 已删,摘了 {issues_cleared} 张活的计划标签(周排期没动)")
        }
        Event::IssueAssigneeSet { assignee, .. } => {
            if assignee.is_empty() {
                "已取消指派 · 已同步到 codehub".into()
            } else {
                format!("责任人改为 {assignee} · 已同步到 codehub")
            }
        }
        Event::IssueEdited { .. } => "issue 标题/正文已改 · 已同步到 codehub".into(),
    })
}

impl UiState {
    /// 写一条回执,并把序号往前推一格。**所有写 `note` 的地方都走这里**,
    /// 漏掉一处就会出现「关过一次之后同样的话再也不弹」。
    pub fn set_note(&mut self, note: Option<String>) {
        self.note = note;
        self.note_seq = self.note_seq.wrapping_add(1);
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
    // 环境条会话内探一次够了:OD 管道探活最多 400ms、PATH 扫 5 次,没理由每次
    // 导航重跑。探的结果进 Gathered,assemble 和 build_config 共用这一份。
    let env = probe_env().await;
    let claude_binary = bw_engine::resolve_claude_binary(None);

    // 打开项目先采:它的 issues 借给项目墙那张卡,不再起第二次 codehub/gh。
    let open_g = match ui.open {
        Some(id) => gather_project(app, id, ui, &mut warnings, &current_week).await,
        None => None,
    };

    let mut cards = Vec::with_capacity(projects.len());
    for p in &projects {
        let ws = app.workspace_of(p.id).await.unwrap_or_default();
        let file = read_or_warn(
            &format!("{} 的 .bw/project.toml", p.slug),
            project_file::read(&ws),
            &mut warnings,
        )
        .unwrap_or_default();
        // 打开项目的 issues 复用 gather_project 采的那份;别的项目才起 codehub/gh。
        let issues = if Some(p.id) == ui.open {
            open_g
                .as_ref()
                .map(|g| g.issues.clone())
                .unwrap_or_default()
        } else {
            match app.issues(p.id).await {
                Ok(v) => v,
                Err(e) => {
                    warnings.push(format!("读 issue 失败:{e}"));
                    Vec::new()
                }
            }
        };
        // 项目墙「本周 x/y 完成」跟总览五段同一口径:作废的活不算进分母。
        let week_counts = build_week_counts(&issues, Some(current_week.as_str()));
        let week_total = (week_counts.todo
            + week_counts.doing
            + week_counts.review
            + week_counts.done
            + week_counts.blocked) as u32;
        let unread = bw::app::count_unseen(&issues);
        // 周目标:从本周运作活①评论解析出的整段。打开项目复用 gather_project
        // 解析的那份;别的项目现解析。没有或解析不到就是空。
        let goals = if Some(p.id) == ui.open {
            open_g
                .as_ref()
                .map(|g| g.week_goals.clone())
                .unwrap_or_default()
        } else {
            app.week_goals_from_ops1(p, &issues).await
        };
        let week_goal = goals.get(&current_week).cloned().unwrap_or_default();
        // 上次交付 = 最近一个 git 标签的提交日期 + tag(刀6:不再读
        // .bw/releases.md)。tags_with_dates 按 creatordate 升序,最后一个 = 最新。
        let last_delivery = bw::git::tags_with_dates(&ws)
            .await
            .into_iter()
            .last()
            .map(|(tag, date)| format!("{date} {tag}"))
            .unwrap_or_default();
        cards.push(ProjectCardVm {
            id: p.id,
            slug: p.slug.clone(),
            name: p.name.clone(),
            brief: file.brief.clone(),
            signal: p.signal,
            workspace_path: ws.display().to_string(),
            remote: remote_label(p),
            week_total,
            week_done: week_counts.done as u32,
            version: file.current_version.clone(),
            week: current_week.clone(),
            unread,
            week_goal,
            last_delivery,
        });
    }

    // 去重保序:开项目的 issues 会在 gather_project 里拉,失败时同一条
    // 「读 issue 失败」被推两遍 —— 去掉重复,横幅不显示两遍同一条。
    let mut seen = std::collections::HashSet::new();
    warnings.retain(|w| seen.insert(w.clone()));

    Gathered {
        gen,
        projects: cards,
        env,
        warnings,
        claude_binary,
        open: open_g,
    }
}

/// 从上次 [`gather`] 的结果 + 当前 `UiState` 视图字段现切一份 `Vm`。只做依赖
/// `viewing_week` / `view_all` / `selected_issue` / 会话 / 页签 的重切:看板按周
/// 过滤、四段计数、运作活状态点、指标读数、会话工作台、知识库扫描。**健康 /
/// Release / 环境 / issue / ops3 的 git 子进程与远端一律不跑**(都在 gather 采
/// 过);**会话工作台**(`build_workbench`)在会话相关字段变(展开目录 / 切会话 /
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

/// 给该看 MR 的活现查 iid,填进 `issue.pr_number` + `has_open_mr`,缓存到
/// `mr_cache`。pr_number 不进库(刀3),不查的话详情链接、总览横幅全是 0。
///
/// 开着的用 `open_mr_for_branch`;没有开着的再查 `mr_for_branch`(含已合入)。
/// 人在网页合过、活还停在待评审时,详情仍能显示 MR 号;完成时靠
/// `has_open_mr` 决定合入还是只关 issue。
async fn fill_pr_numbers(
    project: &Project,
    issues: &mut [bw::Issue],
    mr_cache: &mut std::collections::HashMap<bw::model::IssueId, (u32, bool)>,
) {
    let Ok(remote) = bw_engine::remote::Remote::for_project(
        &project.provider,
        &project.remote_host,
        &project.remote_path,
    ) else {
        return;
    };
    for i in issues.iter_mut() {
        // 进行中/待评审/阻塞/已完成都可能有 MR。名片轻量活停在待办也要查。
        let card_edit = i.title.starts_with("编辑项目名片")
            && matches!(
                i.status,
                IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::InProgress
            );
        if i.number == 0
            || (!matches!(
                i.status,
                IssueStatus::InProgress
                    | IssueStatus::InReview
                    | IssueStatus::Blocked
                    | IssueStatus::Done
            ) && !card_edit)
        {
            continue;
        }
        if let Some(&(pr, open)) = mr_cache.get(&i.id) {
            i.pr_number = pr;
            i.has_open_mr = open;
            continue;
        }
        let branch = bw_engine::github::issue_branch(i.number);
        let (pr, open) = match remote.open_mr_for_branch(&branch).await {
            Ok(Some(n)) => (n, true),
            _ => match remote.mr_for_branch(&branch).await {
                Ok(Some(n)) => (n, false),
                _ => (0, false),
            },
        };
        i.pr_number = pr;
        i.has_open_mr = open;
        mr_cache.insert(i.id, (pr, open));
    }
}

/// 采打开项目那份贵数据。issue 列表只拉一次(借给项目墙那张卡),健康三判据、
/// Release、会话、`ops3_landed` 各跑一遍,结果存进 [`ProjectGathered`] 给
/// [`assemble_project`] 重切。
async fn gather_project(
    app: &App,
    id: ProjectId,
    ui: &mut UiState,
    warnings: &mut Vec<String>,
    current_week: &str,
) -> Option<ProjectGathered> {
    let p = app.project(id).await.ok()??;
    let ws = app.workspace_of(id).await.ok()?;
    let file =
        read_or_warn(".bw/project.toml", project_file::read(&ws), warnings).unwrap_or_default();
    // 失败不吞:挂到 warnings,UI 横幅「读 issue 失败」,VM 用空活照建(健康落灰、
    // 看板空),保留上一份已知好的结构 —— 不整体清空。
    let mut issues = match app.issues(id).await {
        Ok(v) => v,
        Err(e) => {
            warnings.push(format!("读 issue 失败:{e}"));
            Vec::new()
        }
    };
    // pr_number 不进库(刀3):inreview 的活这里现查 open_mr_for_branch 填上,
    // 通知「待合入」/ 详情 MR 卡 / 总览名片 MR 才看得到号;查过一次缓存到
    // ui.mr_cache,每重拼一次 ViewModel 不重打 codehub-cli/gh。
    fill_pr_numbers(&p, &mut issues, &mut ui.mr_cache).await;
    let sessions = build_sessions(app, id, &issues).await;
    // 详情抽屉里那两条链接的前缀。**按 provider 拼**(库里那三个远端字段),
    // 不从 `origin` 推 —— codehub clone 走 SSH,origin 里是 SSH 主机加端口。
    let mr_url_prefix = p.mr_url_prefix();
    let issue_url_prefix = p.issue_url_prefix();

    // 健康:四条判据当场从 issue 列表、仓文件与 git 取,不读缓存。
    let week_goals = app.week_goals_from_ops1(&p, &issues).await;
    let inputs = bw::app::collect_health_inputs(
        &p,
        &ws,
        current_week,
        &issues,
        week_goals.get(current_week).map(String::as_str),
    )
    .await;
    let derived = bw::derive::derive_project_health(&inputs);
    // 算完顺手写回显示缓存。**项目墙只有这一个数据来源** —— 它要在不打开项目
    // 的情况下列出 N 个项目的灯,不能每次启动扫 N 个仓。写的是刚算出来的那个值,
    // 不重算(重算要再起一遍 git 子进程)。**只在灯真变了的时候写**:每次都写
    // 等于让「这个项目最近动过」永远是刚刚,那是假的。
    if p.signal != Some(derived.signal()) || p.weekly_signal != Some(derived.weekly_signal()) {
        let _ = app.cache_project_health(id, &derived).await;
    }

    let policy = read_or_warn(
        ".bw/issue-policy.toml",
        issue_policy_file::read(&ws),
        warnings,
    );
    // `ops3_landed` 只跟仓走、不跟周走:`build_ops` 要它,原来每次重拼都跑两遍
    // `git::path_in_head`(本周 + 看的那周,结果其实一样)。这里采一次传给
    // `assemble_project` 的 `build_ops`,不再每重切都跑 git。
    let ops3_landed = bw::git::path_in_head(&ws, ".bw/standard.toml").await;

    // 横幅判据:本周运作活①在不在(含已完成)。做完再冒「开始本周」是假的。
    let ops1_title = bw::app::ops1_title(current_week);
    let ops1 = issues.iter().find(|i| i.title == ops1_title);
    let week_started = ops1.is_some();
    let ops1_status = ops1
        .filter(|i| i.status != IssueStatus::Done)
        .map(|i| i.status.label().to_string());
    let releases = load_releases(app, &p, &ws).await;
    Some(ProjectGathered {
        id,
        slug: p.slug.clone(),
        name: p.name.clone(),
        project: p.clone(),
        ws,
        file,
        policy,
        issues,
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
    })
}

/// 从 [`ProjectGathered`] + 视图字段现切 `ProjectVm`。不起 git 子进程
/// (`ops3_landed` 已采)、不重探 OD(`env` 已采)。会话工作台用键缓存住,
/// 切周 / 选卡片时会话字段没变就直接复用。见 [`assemble`]。
async fn assemble_project(
    app: &App,
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
    let week = if ui.view_all || !ui.viewing_plan.is_empty() {
        None
    } else {
        Some(viewing_week.as_str())
    };
    let plan = if !ui.viewing_plan.is_empty() {
        Some(ui.viewing_plan.as_str())
    } else {
        None
    };
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
    ProjectVm {
        id: pg.id,
        slug: pg.slug.clone(),
        name: pg.name.clone(),
        card: CardVm {
            brief: or_blank(&pg.file.brief),
            benchmark: or_blank(&pg.file.benchmark),
            north_star: or_blank(&pg.file.opportunity),
            remote: remote_label(&pg.project),
            current_version: or_blank(&pg.file.current_version),
            current_version_raw: pg.file.current_version.clone(),
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
        ops1_status: pg.ops1_status.clone(),
        weeks: build_weeks(&pg.issues, &pg.current_week, &pg.week_goals),
        current_week: pg.current_week.clone(),
        viewing_week: viewing_week.clone(),
        viewing_plan: ui.viewing_plan.clone(),
        view_all: ui.view_all,
        board: build_board(&pg.issues, week, plan, pg.policy.as_ref()),
        plan_versions: build_plan_versions(app, &pg.project, &pg.issues).await,
        current_user: current_user(app, &pg.project).await,
        // 两份计数,各有各的归属:总览那块标题写着「本周」,就只能是本周;
        // 计划屏的进度条画在它正在看的那个看板上面,就跟着看板的范围走。
        week_counts: build_week_counts(&pg.issues, Some(pg.current_week.as_str())),
        board_counts: build_week_counts(&pg.issues, week),
        ops: build_ops(&pg.issues, pg.current_week.as_str(), pg.ops3_landed),
        board_ops: build_ops(&pg.issues, viewing_week.as_str(), pg.ops3_landed),
        // 采不采由界面点 —— 现算一次要起好几个 git 子进程,不能每次重切都跑。
        repo_stats: ui.repo_stats.clone(),
        card_mr: build_card_mr(&pg.issues),
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
            let mut c = build_config(
                &pg.ws,
                pg.policy.as_ref(),
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

/// 自定义版本(计划包)列表:扫 issues 的 `plan_version` 字段去重 + 读 codehub
/// milestone 列表(标题非周格式的就是版本)补 start/end,让空版本也能出现。
async fn build_plan_versions(app: &App, p: &Project, issues: &[bw::Issue]) -> Vec<PlanVersionVm> {
    let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for i in issues {
        if i.plan_version.is_empty() {
            continue;
        }
        *counts.entry(i.plan_version.clone()).or_default() += 1;
    }
    // 从 codehub milestone 列表读版本(标题非周格式),补上 start/end,且让
    // 没勾 issue 的空版本也能出现。读不到(没挂远端/cli 失败)就只靠 issues 标签。
    let mut order: Vec<String> = Vec::new();
    let mut meta: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new();
    if let Ok(remote) = app.remote_for(p) {
        if let Ok(rows) = remote.list_milestones(&p.remote_path).await {
            for (title, start, due) in rows {
                if !order.contains(&title) {
                    order.push(title.clone());
                }
                meta.insert(title, (start, due));
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
        .map(|name| {
            let (start, end) = meta.get(&name).cloned().unwrap_or_default();
            PlanVersionVm {
                name: name.clone(),
                start,
                end,
                issue_count: counts.remove(&name).unwrap_or(0),
            }
        })
        .collect()
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
