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

pub(super) fn tool_label(tool: &str) -> &str {
    match tool {
        "claude_cli" => "Claude CLI",
        "cursor" => "Cursor",
        "open_design" => "Open Design",
        "" => "—",
        other => other,
    }
}

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

/// 导航复用 gather 结果；状态和正文单查通过局部更新保留其他已加载数据。
pub struct Gathered {
    /// 第几代 gather。`assemble` 用它判断 workbench 缓存是不是同一代采的。
    pub gen: u64,
    pub projects: Vec<ProjectCardVm>,
    /// 工具检测在本次进程中复用，避免每次导航扫描 PATH 和连接本机管道。
    pub env: Vec<ToolProbeVm>,
    pub warnings: Vec<String>,
    /// `claude` 本机路径(设置条)。会话内不变,缓存。
    pub claude_binary: Option<String>,
    pub open: Option<ProjectGathered>,
    /// 设置屏「能力」一节的五张表。在 `gather` 里算一次(和 `env` 同一个
    /// 取舍:导航请求只调 `assemble`,不重扫磁盘 / 不重探活)。
    pub(super) capabilities: super::vm_settings::Capabilities,
    /// 桌面宠物探活,和 `env` 同一节律(gather 时读两个小文件)。
    pub clawd: crate::vm::ClawdProbeVm,
}

pub(super) struct ProjectGathered {
    id: bw::model::ProjectId,
    slug: String,
    name: String,
    project: Project,
    ws: std::path::PathBuf,
    file: project_file::ProjectFile,
    /// issue 列表。`pr_number` 第一屏只带 `mr_cache` 命中的;没查过的后台回填。
    issues: Vec<bw::Issue>,
    last_delivery: String,
    /// 尚未接入 Orca 进程状态，live 为 false。
    sessions: Vec<SessionVm>,
    releases: Vec<ReleaseVm>,
    health: HealthVm,
    /// 默认分支 HEAD 是否已有项目约定；只在采集时查询一次。
    ops3_landed: bool,
    week_goals: std::collections::HashMap<String, String>,
    week_progress: std::collections::HashMap<String, String>,
    current_week: String,
    mr_url_prefix: String,
    issue_url_prefix: String,
    remote_brand: String,
    /// 版本列表 + 当前登录用户。gather 采一次,assemble 只克隆 —— 切周 / 改
    /// 一张卡状态时不再打 `project view` / milestones / `/user`。
    plan_versions: Vec<PlanVersionVm>,
    current_user: String,
}

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

pub struct UiState {
    pub open: Option<ProjectId>,
    pub viewing_week: String,
    pub viewing_plan: String,
    pub overview_version: String,
    pub view_all: bool,
    pub open_doc: Option<String>,
    pub note: Option<String>,
    pub note_seq: u64,
    /// 「开始本周」回来的草稿Issue 标题,连同是哪一周。人确认前只存在这里,不进库。
    pub pending_drafts: Option<(String, Vec<String>)>,
    pub session_open: Option<bw::model::IssueId>,
    pub session_tab: crate::vm::SessionTab,
    /// 代码图和资产查询只在进入页签或刷新时执行，避免重绘触发子进程。
    pub kb_tab: crate::vm::KbTab,
    pub kb_codegraph: Option<crate::vm::CodeGraphVm>,
    pub kb_assets: Option<crate::vm::AssetsVm>,
    pub repo_stats: Option<crate::vm::RepoStatsVm>,
    /// 上次采集结果；空表示尚无结果。
    pub metrics: Vec<bw::app::collect::MetricReadout>,
    /// 配置屏要亮的技能 slug。纯导航。
    pub focus_skill: String,
    pub data_dir: String,
    pub workspaces_root: String,
    /// Orca 网页配对 URL(本机设置读出来,带 token)。会话屏 iframe 打开它。
    pub orca_web_url: String,
    /// 界面配色(本机设置)。空 = 默认。
    pub theme: String,
    pub repos: crate::vm::RepoPickerVm,
    /// 值为 (MR 号, 是否仍开放)；号码 0 表示已查询但没有 MR。
    pub mr_cache: std::collections::HashMap<bw::model::IssueId, (u32, bool)>,
    /// 会话屏 Open Design iframe 该打开的地址。开工成功后写入;空 = 组件自己探首页。
    pub od_src: String,
    /// 换一次就让 iframe 卸掉重挂,否则同一 origin 不刷新。
    pub od_gen: u64,
    pub gather_gen: u64,
    pub workbench_cache: Option<WorkbenchCache>,
    pub busy: Option<String>,
    /// 仅在当前进程内缓存已完成仓库登记及自动化创建的项目。
    pub orca_repos_ready: std::collections::HashSet<bw::model::ProjectId>,
    /// 桌面宠物上一次推出去的报告(按项目)。同样的不重发;`None` 报告 = 撤卡已发。
    pub pet_last: Option<(ProjectId, Option<bw::app::pet::PetReport>)>,
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
    /// 桌面宠物要的四样:项目 id、slug、工作区、issue 列表。没打开项目就没有。
    pub fn pet_input(&self) -> Option<(ProjectId, &str, &std::path::Path, &[bw::Issue])> {
        let pg = self.open.as_ref()?;
        Some((
            pg.id,
            pg.slug.as_str(),
            pg.ws.as_path(),
            pg.issues.as_slice(),
        ))
    }

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
    /// 墙卡片的本周计数跟着此 Issue走。找不到此 Issue就不动。
    pub fn apply_issue_status(&mut self, id: IssueId, to: IssueStatus, settled: bool) {
        let Some(pg) = self.open.as_mut() else {
            return;
        };
        if !patch_issue_status(&mut pg.issues, id, to, settled) {
            return;
        }
        let pid = pg.id;
        let released: Vec<String> = pg
            .issues
            .iter()
            .filter(|i| !i.version.is_empty())
            .map(|i| i.version.clone())
            .collect();
        let confirmed = bw::app::current_week_version(&pg.issues, &released);
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

    /// 只更新正文；列表查询不带正文，不能用它覆盖已加载内容。
    pub fn apply_issue_body(&mut self, id: IssueId, body: String) {
        let Some(pg) = self.open.as_mut() else {
            return;
        };
        if let Some(i) = pg.issues.iter_mut().find(|i| i.id == id) {
            i.body = body;
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

/// 群发送失败附在主操作结果后；通知失败不影响已经完成的主操作。
pub fn note_of(events: &[Event]) -> Option<String> {
    let mut note = primary_note(events)?;
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
    Some(match events.first()? {
        Event::ProjectCreated { slug, adopted, .. } => {
            if *adopted {
                format!("已接入已有项目 {slug}")
            } else {
                format!("项目 {slug} 已接入")
            }
        }
        Event::SessionReopened { live, .. } => {
            if *live {
                "这场会话本来就开着".into()
            } else {
                "已打开上次会话".into()
            }
        }
        Event::ProjectRemoved {
            slug,
            issues: _,
            workspace,
        } => format!("{slug} 已移除，本机会话记录已清理。仓库保留在 {workspace}"),
        Event::ProjectCardEditPending { .. } => "已创建项目约定 Issue，等待评审合入".into(),
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
        Event::ThemeChanged { theme } => match theme.as_str() {
            "apple" => "配色已切成 Apple 板".into(),
            _ => "配色已切成 Claude 板".into(),
        },
        Event::IssueSubmitted {
            branch,
            commits,
            pr_number,
            note,
            ..
        } => {
            if *pr_number > 0 {
                format!("分支 {branch} 的 {commits} 个提交已推送，MR {note}，状态为待评审")
            } else {
                format!("分支 {branch} 的 {commits} 个提交已保存，状态为待评审。未创建 MR：{note}")
            }
        }
        Event::IssueMerged {
            pr_number,
            merged,
            local_note,
            ..
        } => {
            if *merged {
                format!("MR #{pr_number} 已合入，Issue 已完成。{local_note}")
            } else {
                "此 Issue 没有可合入的 MR，已标记完成".into()
            }
        }
        Event::RunCancelled { was_live, .. } => {
            if *was_live {
                "Issue 状态保持进行中。请在 Orca 中停止运行。".into()
            } else {
                "未接入运行停止接口，请在 Orca 中停止运行。".into()
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
                // 群发送失败不回滚主操作，也不自动重试。
                format!("发群失败(合入/完成本身已经生效,不会自动重发):{note}")
            }
        }
        Event::IssueCreated { number, .. } => format!("已创建 Issue #{number}"),
        Event::IssueScheduled { week_of, .. } => {
            if week_of.is_empty() {
                "Issue 已移回未排期".into()
            } else {
                format!("Issue 已排入 {week_of}")
            }
        }
        Event::IssueCategorySet { category, .. } => {
            format!("类别已改为 {category}")
        }
        Event::WorkspacePulled { note, .. } => note.clone(),
        Event::IssueRan { ok, summary, .. } => {
            if *ok {
                summary.clone()
            } else {
                format!("运行失败，可重试：{summary}")
            }
        }
        Event::IssueTransitioned { to, settled, .. } => {
            if *settled {
                "已完成".into()
            } else {
                format!("状态改成「{}」", to.label())
            }
        }
        Event::IssueBlocked { .. } => "已标记阻塞，原因已写入 Issue 说明".into(),
        Event::IssueCancelled { .. } => "已取消，原因已记录在评论中".into(),
        Event::SessionDeleted { note, .. } => note.clone(),
        Event::ReleaseCut {
            version,
            rows_written,
        } => {
            if *rows_written {
                format!("版本 {version} 已发布，已关联所选 Issue")
            } else {
                format!("版本 {version} 已发布")
            }
        }
        Event::ReleasePacked {
            version,
            passed,
            total,
            ..
        } => format!("{version} 出包好了,验包 {passed}/{total}"),
        Event::ReleasePackStopped { version } => format!("{version} 打包已停止，临时文件已清理"),
        Event::MetricRecorded {
            name, day, value, ..
        } => format!("记下了 {name} = {value}({day})"),
        Event::ToolMappingSaved { category } => format!("「{}」的映射保存了", category.label()),
        Event::ToolProbed { name, result } => format!("{name} 检测结果：{result:?}"),
        Event::CodexPetsExported {
            pets_dir,
            written,
            skipped,
            missing,
        } => format!(
            "Codex 宠物包:新写 {}、已有没动 {}、本机没缓存 {} → {pets_dir}(Clawd 重启或刷新主题后可选)",
            written.len(),
            skipped.len(),
            missing.len()
        ),
        Event::HealthDerived { signal, .. } => format!("健康现算完成:{signal:?}"),
        Event::IssueScheduledToPlan { plan, .. } => {
            format!("已排入版本 {plan}")
        }
        Event::PlanVersionCreated { name, .. } => {
            format!("版本 {name} 已创建")
        }
        Event::PlanVersionDeleted {
            name,
            issues_cleared,
            ..
        } => format!("版本 {name} 已删除，{issues_cleared} 项工作已移出该版本"),
        Event::PlanVersionRenamed {
            from,
            to,
            issues_moved,
            ..
        } => format!("版本 {from} 已改为 {to}，已同步 {issues_moved} 个 Issue"),
        Event::IssueAssigneeSet { assignee, .. } => {
            if assignee.is_empty() {
                "已取消指派".into()
            } else {
                format!("负责人已改为 {assignee}")
            }
        }
        Event::IssueEdited { .. } => "issue 标题/正文已改 · 已同步到 codehub".into(),
        // 后台补正文不弹提示，避免覆盖用户操作的结果。
        Event::IssueBodyFetched { .. } => return None,
        Event::WorkbenchIssueReported { .. } => "问题已上报".into(),
    })
}

impl UiState {
    /// 每次递增序号，让相同内容的下一条通知仍可显示。
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

/// 打开项目只采当前仓；项目墙才采全部仓。见 ADR-0002。
pub async fn gather(app: &App, ui: &mut UiState, prev_cards: &[ProjectCardVm]) -> Gathered {
    let t0 = std::time::Instant::now();
    ui.gather_gen = ui.gather_gen.wrapping_add(1);
    let gen = ui.gather_gen;
    let projects = app.projects().await.unwrap_or_default();
    let warnings: Vec<String> = Vec::new();
    let current_week = bw::isoweek::current_week();
    let open_slug = ui
        .open
        .and_then(|id| {
            projects
                .iter()
                .find(|p| p.id == id)
                .map(|p| p.slug.as_str())
        })
        .unwrap_or("-");
    bw_engine::dlog!(
        ok,
        "gather",
        "gather start gen={gen} open={open_slug} wall={}",
        projects.len()
    );

    if let Some(open_id) = ui.open {
        return gather_open(
            app,
            ui,
            &projects,
            open_id,
            prev_cards,
            warnings,
            current_week,
            gen,
            t0,
        )
        .await;
    }

    gather_wall(app, ui, projects, warnings, current_week, gen, t0).await
}

#[allow(clippy::too_many_arguments)]
async fn gather_open(
    app: &App,
    ui: &mut UiState,
    projects: &[Project],
    open_id: ProjectId,
    prev_cards: &[ProjectCardVm],
    mut warnings: Vec<String>,
    current_week: String,
    gen: u64,
    t0: std::time::Instant,
) -> Gathered {
    let t_issues = std::time::Instant::now();
    let (env, issues_r) = tokio::join!(probe_env(), app.issues(open_id));
    let issues = match issues_r {
        Ok(v) => v,
        Err(e) => {
            warnings.push(format!("读 issue 失败:{e}"));
            Vec::new()
        }
    };
    bw_engine::dlog!(
        ok,
        "gather",
        "gather issues elapsed_ms={} n={} wall=1",
        t_issues.elapsed().as_millis(),
        issues.len()
    );
    let claude_binary = bw_engine::resolve_claude_binary(None);
    let n = issues.len();
    let t_open = std::time::Instant::now();
    let open_g = gather_project(app, open_id, ui, &mut warnings, &current_week, issues).await;
    let slug = open_g.as_ref().map(|p| p.slug.as_str()).unwrap_or("-");
    bw_engine::dlog!(
        ok,
        "gather",
        "gather open extras elapsed_ms={} slug={slug} issues={n}",
        t_open.elapsed().as_millis()
    );

    let mut cards = Vec::with_capacity(projects.len());
    for p in projects {
        if p.id == open_id {
            cards.push(card_from_open(p, open_g.as_ref(), &current_week));
        } else if let Some(old) = prev_cards.iter().find(|c| c.id == p.id) {
            cards.push(old.clone());
        } else {
            cards.push(card_stub(p, &current_week));
        }
    }
    finish_gather(
        app,
        &ui.orca_web_url,
        gen,
        cards,
        env,
        warnings,
        claude_binary,
        open_g,
        t0,
    )
}

async fn gather_wall(
    app: &App,
    ui: &mut UiState,
    projects: Vec<Project>,
    mut warnings: Vec<String>,
    current_week: String,
    gen: u64,
    t0: std::time::Instant,
) -> Gathered {
    let ids: Vec<ProjectId> = projects.iter().map(|p| p.id).collect();
    let t_issues = std::time::Instant::now();
    let (env, issue_rows) = tokio::join!(probe_env(), fetch_issues_many(app, &ids));
    let issue_n: usize = issue_rows
        .iter()
        .filter_map(|(_, r)| r.as_ref().ok().map(Vec::len))
        .sum();
    bw_engine::dlog!(
        ok,
        "gather",
        "gather issues elapsed_ms={} n={issue_n} wall={}",
        t_issues.elapsed().as_millis(),
        ids.len()
    );
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

    let mut wall_jobs: Vec<WallJob> = Vec::new();
    for p in &projects {
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
    let t_wall = std::time::Instant::now();
    let wall_n = wall_jobs.len();
    let wall_extras = wall_extras_many(app, &wall_jobs).await;
    bw_engine::dlog!(
        ok,
        "gather",
        "gather wall extras elapsed_ms={} n={wall_n}",
        t_wall.elapsed().as_millis()
    );

    let mut cards = Vec::with_capacity(projects.len());
    for (job, (goals, last_delivery, version)) in wall_jobs.into_iter().zip(wall_extras) {
        let chat_provider = super::vm_panels::chat_provider(job.file.chat.as_ref());
        cards.push(card_from_wall(
            &job.p,
            &job.issues,
            &job.file.brief,
            &job.ws,
            &goals,
            last_delivery,
            version,
            &current_week,
            &chat_provider,
        ));
    }
    finish_gather(
        app,
        &ui.orca_web_url,
        gen,
        cards,
        env,
        warnings,
        claude_binary,
        None,
        t0,
    )
}

fn card_from_open(p: &Project, g: Option<&ProjectGathered>, current_week: &str) -> ProjectCardVm {
    let version = g
        .map(|g| {
            let released: Vec<String> = g
                .releases
                .iter()
                .map(|r| r.version.clone())
                .chain(
                    g.issues
                        .iter()
                        .filter(|i| !i.version.is_empty())
                        .map(|i| i.version.clone()),
                )
                .collect();
            bw::app::current_week_version(&g.issues, &released)
        })
        .unwrap_or_default();
    let issues = g.map(|g| g.issues.as_slice()).unwrap_or(&[]);
    let goals = g.map(|g| &g.week_goals);
    let brief = g.map(|g| g.file.brief.clone()).unwrap_or_default();
    let chat_provider = g
        .map(|g| super::vm_panels::chat_provider(g.file.chat.as_ref()))
        .unwrap_or_default();
    let last_delivery = g.map(|g| g.last_delivery.clone()).unwrap_or_default();
    let ws_path = g
        .map(|g| g.ws.display().to_string())
        .unwrap_or_else(|| p.workspace_path.clone());
    card_from_parts(
        p,
        issues,
        &brief,
        &ws_path,
        goals,
        last_delivery,
        version,
        current_week,
        &chat_provider,
    )
}

#[allow(clippy::too_many_arguments)]
fn card_from_wall(
    p: &Project,
    issues: &[bw::Issue],
    brief: &str,
    ws: &std::path::Path,
    goals: &std::collections::HashMap<String, String>,
    last_delivery: String,
    version: String,
    current_week: &str,
    chat_provider: &str,
) -> ProjectCardVm {
    card_from_parts(
        p,
        issues,
        brief,
        &ws.display().to_string(),
        Some(goals),
        last_delivery,
        version,
        current_week,
        chat_provider,
    )
}

fn card_stub(p: &Project, current_week: &str) -> ProjectCardVm {
    ProjectCardVm {
        id: p.id,
        slug: p.slug.clone(),
        name: p.name.clone(),
        brief: String::new(),
        signal: p.signal,
        workspace_path: p.workspace_path.clone(),
        remote: remote_label(p),
        remote_provider: p.provider.clone(),
        // 打开了别的项目时,这张卡不重刷 —— 项目群要读一次 `.bw/project.toml`,
        // 划不来为一张没在看的卡去读。空 = 「这一轮没重读」,不是「没配群」。
        chat_provider: String::new(),
        week_total: 0,
        week_done: 0,
        version: String::new(),
        week: current_week.to_string(),
        unread: 0,
        week_goal: String::new(),
        last_delivery: String::new(),
    }
}

#[allow(clippy::too_many_arguments)]
fn card_from_parts(
    p: &Project,
    issues: &[bw::Issue],
    brief: &str,
    ws_path: &str,
    goals: Option<&std::collections::HashMap<String, String>>,
    last_delivery: String,
    version: String,
    current_week: &str,
    chat_provider: &str,
) -> ProjectCardVm {
    let week_counts = if version.is_empty() {
        WeekCountsVm::default()
    } else {
        build_week_counts(issues, Some(version.as_str()))
    };
    let week_total = (week_counts.todo
        + week_counts.doing
        + week_counts.review
        + week_counts.done
        + week_counts.blocked) as u32;
    let week_goal = if version.is_empty() {
        String::new()
    } else {
        goals
            .and_then(|g| g.get(&version).cloned())
            .unwrap_or_default()
    };
    ProjectCardVm {
        id: p.id,
        slug: p.slug.clone(),
        name: p.name.clone(),
        brief: brief.to_string(),
        signal: p.signal,
        workspace_path: ws_path.to_string(),
        remote: remote_label(p),
        remote_provider: p.provider.clone(),
        chat_provider: chat_provider.to_string(),
        week_total,
        week_done: week_counts.done as u32,
        version,
        week: current_week.to_string(),
        unread: bw::app::count_unseen(issues),
        week_goal,
        last_delivery,
    }
}

#[allow(clippy::too_many_arguments)]
fn finish_gather(
    app: &App,
    orca_web_url: &str,
    gen: u64,
    cards: Vec<ProjectCardVm>,
    env: Vec<ToolProbeVm>,
    mut warnings: Vec<String>,
    claude_binary: Option<String>,
    open: Option<ProjectGathered>,
    t0: std::time::Instant,
) -> Gathered {
    let mut seen = std::collections::HashSet::new();
    warnings.retain(|w| seen.insert(w.clone()));
    for w in &warnings {
        bw_engine::dlog!(warn, "gather", "[BW_WARN] {w}");
    }
    let settings = bw::local::Settings::load(app.asset_root()).ok();
    let cap_open = open
        .as_ref()
        .map(|pg| (pg.ws.as_path(), pg.issues.as_slice(), pg.name.as_str()));
    let clawd = probe_clawd();
    let capabilities = super::vm_settings::build(
        app,
        settings.as_ref(),
        &env,
        &cards,
        orca_web_url,
        &clawd,
        cap_open,
    );
    bw_engine::dlog!(
        ok,
        "gather",
        "gather done elapsed_ms={} gen={gen}",
        t0.elapsed().as_millis()
    );
    Gathered {
        gen,
        projects: cards,
        env,
        warnings,
        claude_binary,
        open,
        capabilities,
        clawd,
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
    let (notes, last_delivery, version) = tokio::join!(
        app.version_plan_notes(&job.p),
        async {
            bw::git::tags_with_dates(&job.ws)
                .await
                .into_iter()
                .last()
                .map(|(tag, date)| format!("{date} {tag}"))
                .unwrap_or_default()
        },
        async {
            let mut released: Vec<String> = job
                .issues
                .iter()
                .filter(|i| !i.version.is_empty())
                .map(|i| i.version.clone())
                .collect();
            if let Ok(remote) = app.remote_for(&job.p) {
                if let Ok(tags) = remote.list_releases().await {
                    released.extend(tags);
                }
            }
            bw::app::current_week_version(&job.issues, &released)
        },
    );
    (notes.goals, last_delivery, version)
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

/// 从已采集数据组装视图，导航不重复查询健康、版本和远端 issue。
pub async fn assemble(app: &App, ui: &mut UiState, g: &Gathered) -> Vm {
    let open = match (&g.open, ui.open) {
        (Some(pg), Some(_)) => Some(assemble_project(app, ui, pg, g.gen).await),
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
            theme: ui.theme.clone(),
            data_dir: ui.data_dir.clone(),
            claude_binary: g.claude_binary.clone(),
            connectors: g.capabilities.connectors.clone(),
            skills: g.capabilities.skills.clone(),
            stage: g.capabilities.stage.clone(),
            plugins: g.capabilities.plugins.clone(),
            assets: g.capabilities.assets.clone(),
            assets_open_project: g.capabilities.assets_open_project.clone(),
            focus_skill: ui.focus_skill.clone(),
            clawd: g.clawd.clone(),
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

pub(super) async fn probe_env() -> Vec<ToolProbeVm> {
    let claude = crate::adapters::claude_cli::detect();
    let cursor = bw_engine::which_on_path("cursor-agent");
    let codehub = bw_engine::which_on_path("codehub-cli");
    let gh = bw_engine::which_on_path("gh");
    // PATH 检测只代表已安装；登录状态需要单独调用 CLI。
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
            detail: gh
                .map(|p| format!("{p}(登录态没探,探它要起子进程)"))
                .unwrap_or_else(|| "本机路径里找不到 gh".into()),
        },
        ToolProbeVm {
            name: "open_design".into(),
            label: "Open Design".into(),
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

/// 后台按 Issue查 MR。跨 Issue最多 8 路并行;同一个 Issue opened → all 仍串行。
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
        bw_engine::workspace::issue_branch(item.number)
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

async fn log_elapsed<F, T>(name: &str, fut: F) -> T
where
    F: std::future::Future<Output = T>,
{
    let t0 = std::time::Instant::now();
    let v = fut.await;
    bw_engine::dlog!(
        ok,
        "gather",
        "gather extras {name} elapsed_ms={}",
        t0.elapsed().as_millis()
    );
    v
}

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
    let remote_brand = p.remote_brand().to_string();

    let (sessions, ops1_notes, releases, ops3_landed, last_delivery, plan_versions, current_user) = tokio::join!(
        log_elapsed("sessions", build_sessions(app, id, &issues)),
        log_elapsed("comments", app.version_plan_notes(&p)),
        log_elapsed("releases", load_releases(app, &p, &ws)),
        log_elapsed("ops3", bw::git::path_in_head(&ws, ".bw/project.toml")),
        log_elapsed("git-tags", async {
            bw::git::tags_with_dates(&ws)
                .await
                .into_iter()
                .last()
                .map(|(tag, date)| format!("{date} {tag}"))
                .unwrap_or_default()
        }),
        log_elapsed("milestones", build_plan_versions(app, &p, &issues)),
        log_elapsed("user", current_user(app, &p)),
    );

    let released_now: Vec<String> = releases
        .iter()
        .map(|r| r.version.clone())
        .chain(
            issues
                .iter()
                .filter(|i| !i.version.is_empty())
                .map(|i| i.version.clone()),
        )
        .collect();
    let goal_key = bw::app::current_week_version(&issues, &released_now);
    let t_health = std::time::Instant::now();
    let inputs = bw::app::collect_health_inputs(
        &p,
        &ws,
        current_week,
        &issues,
        ops1_notes.goal_for(&goal_key, current_week),
    )
    .await;
    bw_engine::dlog!(
        ok,
        "gather",
        "gather extras health elapsed_ms={}",
        t_health.elapsed().as_millis()
    );
    let derived = bw::derive::derive_project_health(&inputs);
    if p.signal != Some(derived.signal()) || p.weekly_signal != Some(derived.weekly_signal()) {
        let _ = app.cache_project_health(id, &derived).await;
    }

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
        week_goals: ops1_notes.goals,
        week_progress: ops1_notes.progress,
        current_week: current_week.to_string(),

        mr_url_prefix,
        issue_url_prefix,
        remote_brand,
        plan_versions,
        current_user,
    })
}

/// 按导航字段组装视图；会话缓存同时比较字段和采集版本。
async fn assemble_project(
    _app: &App,
    ui: &mut UiState,
    pg: &ProjectGathered,
    gen: u64,
) -> ProjectVm {
    let current_week = pg.current_week.clone();
    let viewing_week = if ui.viewing_week.is_empty() {
        current_week.clone()
    } else {
        ui.viewing_week.clone()
    };
    let plan = if !ui.viewing_plan.is_empty() {
        Some(ui.viewing_plan.as_str())
    } else {
        None
    };
    let view_all = plan.is_none();
    let readings = bw::app::read_metric_readings(&pg.ws, &viewing_week);
    let sessions: Vec<SessionVm> = pg.sessions.clone();
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
    let auto = bw::app::current_week_version(&pg.issues, &released_names);
    let covering = if auto.is_empty() {
        Vec::new()
    } else {
        vec![auto.clone()]
    };
    let confirmed = pick_overview_version(&covering, &ui.overview_version);
    for v in &mut plan_versions {
        v.released = released_names.iter().any(|r| r == &v.name);
        if v.goal.is_empty() {
            if let Some(g) = pg.week_goals.get(&v.name) {
                v.goal = g.clone();
            }
        }
        if v.week_progress.is_empty() {
            if let Some(note) = pg.week_progress.get(&v.name) {
                v.week_progress = note.clone();
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
        covering_versions: covering.clone(),
        last_released: inv.last_released.clone().unwrap_or_default(),
        unreleased: inv.unreleased.clone(),
        suggested_next: inv.suggested_next.clone(),
        confirmed_version: confirmed.clone(),
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
        remote_brand: pg.remote_brand.clone(),
        workbench,
        notify: NotifyVm {
            unread: bw::app::count_unseen(&pg.issues),
        },
        config: build_config(&pg.ws, &pg.project, &pg.file),
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

async fn current_user(app: &App, p: &Project) -> String {
    match app.remote_for(p) {
        Ok(r) => r.current_user().await.unwrap_or_default(),
        Err(_) => String::new(),
    }
}

/// 版本列表:只扫 issues 的 `bw:plan:`。同名里程碑只补 start/end。
async fn build_plan_versions(app: &App, p: &Project, issues: &[bw::Issue]) -> Vec<PlanVersionVm> {
    let mut counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for i in issues {
        for name in &i.plan_versions {
            *counts.entry(name.clone()).or_default() += 1;
        }
    }
    // 版本身份只认 `bw:plan:`。里程碑列表只给同名补起止,不单独贡献空版本。
    let mut order: Vec<String> = Vec::new();
    let mut meta: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();
    for i in issues {
        for name in &i.plan_versions {
            if !order.contains(name) {
                order.push(name.clone());
            }
        }
    }
    if let Ok(remote) = app.remote_for(p) {
        if let Ok(rows) = remote.list_milestones().await {
            for (title, start, due, created) in rows {
                if order.contains(&title) {
                    meta.insert(title, (start, due, created));
                }
            }
        }
    }
    order
        .into_iter()
        .filter(|name| bw::version::is_plan_name(name))
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
                week_progress: String::new(),
                counts: build_week_counts(issues, Some(name.as_str())),
            }
        })
        .collect()
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
            "周期工作".into()
        } else {
            i.category.map(|c| c.label()).unwrap_or("—").into()
        },
        tool: tool_label(&i.tool).into(),
        workflow: if i.workflow.is_empty() {
            "—".into()
        } else {
            i.workflow.clone()
        },
        kind: i.kind,
        origin: i.origin.label().into(),
        week_of: i.week_of.clone(),
        version: i.version.clone(),
        metric_key: i.metric_key.clone(),
        settled: i.settled_at.is_some(),
        status: i.status,
        pr_number: i.pr_number,
        has_open_mr: i.has_open_mr,
        remote_number: i.remote_number,
        branch: bw::app::work_branch(i),
        body: i.body.clone(),
        assignee: i.assignee.clone(),
        author: i.author.clone(),
        plan_versions: i.plan_versions.clone(),
        released_version: i.version.clone(),
        updated_at: if i.updated_at > 0 {
            i.updated_at
        } else {
            i.created_at
        },
    }
}

/// 优先查询远端 Release，本地标签可能尚未 fetch；失败时使用本地标签。
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
            plan_versions: Vec::new(),
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

/// 桌面宠物探活 → ViewModel。三样分开取;都是读本机小文件,gather 时顺手做。
pub(super) fn probe_clawd() -> crate::vm::ClawdProbeVm {
    let p = bw_engine::clawd::probe();
    crate::vm::ClawdProbeVm {
        exe: p.exe.display().to_string(),
        agent_id: p.agent_id,
        installed: p.installed.map(|i| match i.version {
            Some(v) => format!("{} · {v}", i.path.display()),
            None => format!("{}(版本号读不到)", i.path.display()),
        }),
        running: p.running.map(|r| r.port),
        registered: p.registered,
        prefs_path: p
            .prefs_path
            .map(|x| x.display().to_string())
            .unwrap_or_else(|| "(没有 HOME)".into()),
    }
}
