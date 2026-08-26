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

use super::vm_derive::{build_card_mr, build_notify_events, build_ops, build_week_counts};
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

/// 壳这边的纯导航状态(打开了哪个项目、在看哪一周)。不进库。
pub struct UiState {
    pub open: Option<ProjectId>,
    pub viewing_week: String,
    /// 计划屏左栏点的是「全部」。
    pub view_all: bool,
    pub open_doc: Option<String>,
    pub note: Option<String>,
    /// 这是第几条回执。toast 靠它判断「这条我关过没有」—— 按正文判断的话,
    /// 同一句失败第二次出现会被当成已关过的那条,静默不弹。
    pub note_seq: u64,
    /// 「开始本周」回来的草稿活标,连同是哪一周。人确认前只存在这里,不进库。
    pub pending_drafts: Option<(String, Vec<String>)>,
    /// 会话屏选中哪个会话、开着哪个页签、展开了哪些目录、中栏开着哪个文件。
    /// 纯导航状态,一律不进库。
    pub session_open: Option<bw::model::IssueId>,
    /// 计划屏详情抽屉开着哪张活。纯导航状态,不进库。
    pub selected_issue: Option<bw::model::IssueId>,
    pub session_tab: crate::vm::SessionTab,
    pub expanded_dirs: Vec<String>,
    pub open_file: String,
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
    /// 会话屏那块「这次开工喂了什么」。`None` = 面板关着。
    pub briefing: Option<String>,
    /// 配置屏要亮的技能 slug。纯导航。
    pub focus_skill: String,
    pub data_dir: String,
    pub workspaces_root: String,
    /// 接入屏那份仓列表的状态。**不进库** —— 它是「现在去平台问了一次」的结果,
    /// 关掉接入屏就该忘掉。
    pub repos: crate::vm::RepoPickerVm,
    /// inreview 的活「开着的 MR iid」现查缓存(刀3:pr_number 不进库,这里查一次
    /// 复用,免得每重拼一次 ViewModel 都打 codehub-cli/gh)。键是 IssueId(含项目
    /// id,跨项目不撞);值 0 = 查过了、没有开着的 MR。issue 离开 inreview 后这条
    /// 留着也无害(只有 inreview 的活读它)。
    pub mr_cache: std::collections::HashMap<bw::model::IssueId, u32>,
    /// 会话屏 Open Design iframe 该打开的地址。开工成功后写入;空 = 组件自己探首页。
    pub od_src: String,
    /// 换一次就让 iframe 卸掉重挂,否则同一 origin 不刷新。
    pub od_gen: u64,
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
        Event::NotifySeenMarked { .. } => "通知已读到这里".into(),
        Event::HealthDerived { signal, .. } => format!("健康现算完成:{signal:?}"),
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

pub async fn build(app: &App, ui: &mut UiState) -> Vm {
    let projects = app.projects().await.unwrap_or_default();
    let mut warnings: Vec<String> = Vec::new();

    let mut cards = Vec::with_capacity(projects.len());
    for p in &projects {
        let ws = app.workspace_of(p.id).await.unwrap_or_default();
        let file = read_or_warn(
            &format!("{} 的 .bw/project.toml", p.slug),
            project_file::read(&ws),
            &mut warnings,
        )
        .unwrap_or_default();
        let week = bw::isoweek::current_week();
        // 每项目只起一次 codehub-cli:issues 拿一次,再借给下面的纯内存过滤。
        // 失败不吞(刀3-fix):以前 `unwrap_or_default()` 把 codehub 抖一下整屏
        // 蒸发成空;现在挂到 warnings,UI 显式横幅「读 issue 失败」,活用空数组
        // —— 健康判据落到 Unknown 灰,不假装绿。
        let issues = match app.issues(p.id).await {
            Ok(v) => v,
            Err(e) => {
                warnings.push(format!("读 issue 失败:{e}"));
                Vec::new()
            }
        };
        // 项目墙「本周 x/y 完成」跟总览五段同一口径:作废的活不算进分母。
        // 以前用带周标签的张数当 y,#10/#11 这种打了本周标签又作废的卡会把 3/4 撑成 3/6。
        let week_counts = build_week_counts(&issues, Some(week.as_str()));
        let week_total = (week_counts.todo
            + week_counts.doing
            + week_counts.review
            + week_counts.done
            + week_counts.blocked) as u32;
        // 未读 = 评审中的活有几张。这个数是现算的,库里没有未读表
        // (MVP 不再按 seen_at 过滤:pr_number/updated_at 是 lossy)。
        let unread = bw::app::count_unseen(&issues);
        // 周目标:从本周运作活①评论解析出的那一句话。没有或解析不到就是空。
        let goals = app.week_goals_from_ops1(p, &issues).await;
        let week_goal = goals.get(&week).cloned().unwrap_or_default();
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
            week,
            unread,
            week_goal,
            last_delivery,
        });
    }

    let open = match ui.open {
        None => None,
        Some(id) => build_project(app, id, ui, &mut warnings).await,
    };

    // 去重保序:开项目的 issues 会在 build_project 里再拉一次,失败时同一条
    // 「读 issue 失败」被推两遍 —— 去掉重复,横幅不显示两遍同一条(也避免按
    // 文本 key 的渲染崩,虽然 key 已改按索引)。
    let mut seen = std::collections::HashSet::new();
    warnings.retain(|w| seen.insert(w.clone()));

    Vm {
        ready: true,
        fatal: None,
        projects: cards,
        env: probe_env().await,
        repos: ui.repos.clone(),
        open,
        settings: SettingsVm {
            workspaces_root: ui.workspaces_root.clone(),
            data_dir: ui.data_dir.clone(),
            claude_binary: bw_engine::resolve_claude_binary(None),
        },
        note: ui.note.clone(),
        note_seq: ui.note_seq,
        warnings,
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

/// inreview 的活现查「开着的 MR iid」,填进 `issue.pr_number` + 缓存到 `mr_cache`。
///
/// pr_number 不进库(刀3:`.bw/` 不存、codehub issue 也没这字段),不查的话
/// 通知「评审中待合入」、详情 MR 卡、总览名片 MR 横幅全读 `pr_number=0` →
/// 永远看不到 MR。这里给 inreview 的活现查 `Remote::open_mr_for_branch`(按
/// `bw/issue-<号>` 分支查开着没),查过一次缓存,每重拼 ViewModel 不重打远端。
/// 非在审的活不查(没 MR 要看);查失败按 0(不显),不崩。
async fn fill_pr_numbers(
    project: &Project,
    issues: &mut [bw::Issue],
    mr_cache: &mut std::collections::HashMap<bw::model::IssueId, u32>,
) {
    let Ok(remote) = bw_engine::remote::Remote::for_project(
        &project.provider,
        &project.remote_host,
        &project.remote_path,
    ) else {
        return;
    };
    for i in issues.iter_mut() {
        // 评审中必查。名片那张轻量活开了 MR 却停在待办池时也要查,
        // 否则总览横幅永远「还没提 MR」,人只能去看板里盲找。
        let card_edit = i.title.starts_with("编辑项目名片")
            && matches!(
                i.status,
                IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::InProgress
            );
        if i.number == 0 || (i.status != IssueStatus::InReview && !card_edit) {
            continue;
        }
        if let Some(&pr) = mr_cache.get(&i.id) {
            i.pr_number = pr;
            continue;
        }
        let branch = bw_engine::github::issue_branch(i.number);
        let pr = match remote.open_mr_for_branch(&branch).await {
            Ok(Some(n)) => n,
            // 查不成 / 没开着的 MR —— 0,不显 MR(如实,不假装)。
            _ => 0,
        };
        i.pr_number = pr;
        mr_cache.insert(i.id, pr);
    }
}

async fn build_project(
    app: &App,
    id: ProjectId,
    ui: &mut UiState,
    warnings: &mut Vec<String>,
) -> Option<ProjectVm> {
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
    let conversations = app.conversations(id).await.unwrap_or_default();
    // 「读到这里」是哪一刻。通知屏和项目轨的红点用的是同一个值,读一次就够。
    let notify_seen: Option<i64> = app.notify_seen(id).await;
    let sessions = build_sessions(app, id, &issues).await;
    // 详情抽屉里那两条链接的前缀。**按 provider 拼**(库里那三个远端字段),
    // 不从 `origin` 推 —— codehub clone 走 SSH,origin 里是 SSH 主机加端口。
    let mr_url_prefix = p.mr_url_prefix();
    let issue_url_prefix = p.issue_url_prefix();
    let current_week = bw::isoweek::current_week();
    let viewing_week = if ui.viewing_week.is_empty() {
        current_week.clone()
    } else {
        ui.viewing_week.clone()
    };

    // 健康:四条判据当场从 issue 列表、仓文件与 git 取,不读缓存。
    let week_goals = app.week_goals_from_ops1(&p, &issues).await;
    let inputs = bw::app::collect_health_inputs(
        &p,
        &ws,
        &current_week,
        &issues,
        week_goals.get(&current_week).map(String::as_str),
    )
    .await;
    let derived = bw::derive::derive_project_health(&inputs);
    // 算完顺手写回显示缓存。**项目墙只有这一个数据来源** —— 它要在不打开项目
    // 的情况下列出 N 个项目的灯,不能每次启动扫 N 个仓。此前壳里没有一处写过
    // 这两列,于是项目墙的灯永远是灰的,哪怕总览上算出来是黄的。写的是刚算出
    // 来的那个值,不重算(重算要再起一遍 git 子进程)。
    //
    // **只在灯真变了的时候写**:这个函数每重拼一次 ViewModel 就跑一次(人打字
    // 时每 30ms 一次),而这条写回顺带会把项目的 `updated_at` 顶新 —— 每次
    // 都写等于让「这个项目最近动过」永远是刚刚,那是假的。
    if p.signal != Some(derived.signal()) || p.weekly_signal != Some(derived.weekly_signal()) {
        let _ = app.cache_project_health(id, &derived).await;
    }

    let policy = read_or_warn(
        ".bw/issue-policy.toml",
        issue_policy_file::read(&ws),
        warnings,
    );
    // 指标读数从仓 `.bw/metrics/readings.jsonl` 取(刀6:不再读周计划文件的
    // 「本周指标读数」段)。取的是正在看的那一周。
    let readings = bw::app::read_metric_readings(&ws, &viewing_week);

    // 本周计数与本周运作点在构造之前算好 —— `current_week` 会被 move 进结构体。
    let week_counts_now = build_week_counts(&issues, Some(current_week.as_str()));
    let ops_now = build_ops(&issues, current_week.as_str(), &ws).await;

    // 周列表 = 库里活排过的周(issues 的 `bw:week:*` 标签)∪ 本周。刀6:不再
    // 扫 `.bw/plan/` 目录(那个文件没人写了,扫到也是旧的)。本周永远在列表里。
    let weeks = build_weeks(&issues, &current_week, &week_goals);

    // 横幅判据:本周运作活①在不在(含已完成)。做完再冒「开始本周」是假的。
    let ops1_title = bw::app::ops1_title(&current_week);
    let ops1 = issues.iter().find(|i| i.title == ops1_title);
    let week_started = ops1.is_some();
    let ops1_status = ops1
        .filter(|i| i.status != IssueStatus::Done)
        .map(|i| i.status.label().to_string());
    let releases = load_releases(app, &p, &ws).await;
    Some(ProjectVm {
        id,
        slug: p.slug.clone(),
        name: p.name.clone(),
        card: CardVm {
            brief: or_blank(&file.brief),
            benchmark: or_blank(&file.benchmark),
            north_star: or_blank(&file.opportunity),
            remote: remote_label(&p),
            current_version: or_blank(&file.current_version),
            current_version_raw: file.current_version.clone(),
            standard_version: or_blank(&file.standard_version),
            chat: match &file.chat {
                None => "未配".into(),
                Some(c) => format!("{} · 群号 {}", c.provider, c.group_id),
            },
        },
        health: HealthVm {
            signal: Some(derived.signal()),
            reasons: derived
                .reasons()
                .iter()
                .map(|r| (r.ok, r.text.clone()))
                .collect(),
        },
        metrics: build_metrics(&ws, &issues, &ui.metrics, &readings, !ui.metrics.is_empty()),
        week_started,
        ops1_status,
        weeks,
        current_week,
        viewing_week: viewing_week.clone(),
        view_all: ui.view_all,
        board: build_board(
            &issues,
            if ui.view_all {
                None
            } else {
                Some(viewing_week.as_str())
            },
            policy.as_ref(),
        ),
        // 两份计数,各有各的归属:总览那块标题写着「本周」,就只能是本周;
        // 计划屏的进度条画在它正在看的那个看板上面,就跟着看板的范围走。
        // **共用一份的后果**是人在计划屏点了历史周,总览的「本周」下面摆着
        // 那一周的数。
        week_counts: week_counts_now,
        board_counts: build_week_counts(
            &issues,
            if ui.view_all {
                None
            } else {
                Some(viewing_week.as_str())
            },
        ),
        ops: ops_now,
        board_ops: build_ops(&issues, viewing_week.as_str(), &ws).await,
        // 采不采由界面点 —— 现算一次要起好几个 git 子进程,不能每次重拼
        // ViewModel 都跑一遍(人打字时每 30ms 就重拼一次)。
        repo_stats: ui.repo_stats.clone(),
        card_mr: build_card_mr(&issues),
        pending_drafts: match &ui.pending_drafts {
            Some((week, titles)) if *week == viewing_week => titles.clone(),
            _ => Vec::new(),
        },
        releases,
        sessions: sessions.clone(),
        session_open: ui.session_open,
        briefing: ui.briefing.clone(),
        selected_issue: ui.selected_issue,
        mr_url_prefix,
        issue_url_prefix,
        workbench: build_workbench(
            &sessions,
            &issues,
            ui.session_open,
            ui.session_tab,
            &ui.expanded_dirs,
            &ui.open_file,
            &ui.od_src,
            ui.od_gen,
        )
        .await,
        notify: NotifyVm {
            // 评审中 **且真有 MR**。没 MR 的评审中活不是通知 —— 它在计划屏的
            // 评审中那一列里,人在那儿点完成。
            to_merge: issues
                .iter()
                .filter(|i| i.status == IssueStatus::InReview && i.pr_number > 0)
                .map(card_item)
                .collect(),
            seen_at: notify_seen,
            events: build_notify_events(&issues, &conversations),
            unread: bw::app::count_unseen(&issues),
        },
        config: {
            let mut c = build_config(&ws, policy.as_ref(), &p, &file, &issues).await;
            c.focus_skill = ui.focus_skill.clone();
            c
        },
        kb: KbVm {
            codegraph: ui.kb_codegraph.clone(),
            assets: ui.kb_assets.clone(),
            ..build_kb(&ws, ui.kb_tab, ui.open_doc.as_deref())
        },
    })
}

pub(super) fn or_blank(s: &str) -> String {
    if s.trim().is_empty() {
        "(待填)".into()
    } else {
        s.to_string()
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
        remote_number: i.remote_number,
        branch: i.branch.clone(),
        body: i.body.clone(),
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
