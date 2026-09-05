//! codehub/GitHub issue 持久化映射层(数据层迁移刀2/刀3)。
//!
//! 把 bw 的 `Issue` 领域对象 ↔ codehub/GitHub issue 互转。issue 的状态、
//! 排期、版本、类别以远端 issue + 标签为正本(`bw:status:*` /
//! `bw:plan:*` / `bw:released:*` / `bw:category:*`)。旧 `bw:week:` 不认。
//! 每个里程碑都是一个版本,一张活只挂一个。
//!
//! 字段映射的取舍:每一条都不自作主张加标签。**lossy**:远端 issue 的 `body` 经
//! `view_issue` 单查带回(列表查询不带正文);`branch`/`pr_number`、
//! `sort_order`/`metric_key`、`settled_at` 这些读回时一律给默认值。

use crate::model::{Issue, IssueId, IssueKind, IssueOrigin, IssueStatus, Project};
use bw_engine::remote::{IssueFilter, IssueState, Remote, RemoteIssue};

use super::{App, AppError, Result};

// ─────────────── 标题枚举(幂等键,也是 kind/workflow 的推断源)───────────────
//
// kind 不占标签,从标题前缀推断。三张运作活与「编辑项目名片」这张轻量活的标
// 题都是固定前缀 + 变量(周号 / 版本 / 项目名),所以这里认前缀,不是精确
// 匹配。前缀与 `app/ops.rs` / `app/project.rs` / `standard/bootstrap.rs` 里建
// 活时拼标题用的那几个串一字不差,改那边要同步改这里。

/// 运作活①的标题前缀。光杆或后面跟 ` v0.x` 都认。
const OPS1_TITLE_PREFIX: &str = "更新指标 + 制定版本计划";
/// 运作活②的标题前缀。完整标题 = 这个前缀 + 周号(`"资产盘点 {week}"`)。
const OPS2_TITLE_PREFIX: &str = "资产盘点 ";
/// 运作活③的标题前缀。完整标题 = 这个前缀 + 版本号(`"规范铺底 v{version}"`)。
/// **不再新建**;读回旧活仍认,给在途 MR / 横幅 / 跳过接入用。
const OPS3_TITLE_PREFIX: &str = "规范铺底 v";
/// 项目信息常驻车的固定标题。接入第一次写名片、之后改名片 / 在研版本 / 项目群
/// 都复用这一张(开着就接着写,合入后人点完成,下次再开一张同名)。
pub const CHARTER_TITLE: &str = "项目约定";
/// 轻量活「编辑项目名片」的旧标题。**不再新建**;读回旧活仍认。
pub const LIGHT_TITLE: &str = "编辑项目名片";
/// 轻量活「配置项目群」的固定标题(B 类在途复用的幂等键)。高优3:改群配置
/// 也走 worktree + MR,不再直写主检出。
pub const LIGHT_CHAT_TITLE: &str = "配置项目群";
/// 旧标题「切换在研版本」。新改动跟「编辑项目名片」走;读回旧活仍认轻量。
pub const LIGHT_VERSION_TITLE: &str = "切换在研版本";

// ─────────────── 远端拿取 ───────────────

/// `RemoteError` → `AppError::Exec` 的统一包装,前缀一句人话说明这步在干嘛。
fn map_remote_err<E: std::fmt::Display>(ctx: &str, e: E) -> AppError {
    AppError::Exec(format!("{ctx}:{e}"))
}

// ─────────────── 公开 API ───────────────

/// 在远端仓里真开一个 issue,返回填好 `number`/`remote_number` 的 `Issue`。
///
/// labels = `bw:status:todo`(新活默认待办)+ 一个版本槽(`bw:plan:v0.x`,
/// 见 [`one_schedule`])+ `extra_labels`(调用方自塞,如类别)。不再写 `bw:week:`。
/// kind 由参数显式给(不推断),决定回填 `tool`/`workflow`/`origin`。
///
/// issue 读写唯一入口:app 层各用例(issue / plan / ops / bootstrap / project /
/// session)都经这里的 `create` / `set_status` / `find_open_by_title` / `fetch` 落远端。
pub async fn create(
    app: &App,
    project: &Project,
    title: &str,
    body: &str,
    kind: IssueKind,
    week_of: &str,
    extra_labels: &[&str],
) -> Result<Issue> {
    let remote = app.remote_for(project)?;
    let (week, plan) = one_schedule(week_of, extra_labels);
    // 未排期的 issue 状态是 Backlog(待办池),排进一个版本的才是 Todo。
    let status_label = if week.is_none() && plan.is_none() {
        "bw:status:backlog"
    } else {
        "bw:status:todo"
    };
    let mut labels: Vec<String> = vec![status_label.to_string()];
    for x in extra_labels {
        labels.push((*x).to_string());
    }
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    let iid = remote
        .create_issue(title, body, &label_refs)
        .await
        .map_err(|e| map_remote_err("远端建活没成", e))?;
    if let Some(name) = &plan {
        project_plan_best_effort(&remote, &project.remote_path, iid, name).await;
    }
    Ok(issue_from_create(
        project,
        &app.asset_root,
        iid,
        title,
        body,
        kind,
        week.as_deref().unwrap_or(""),
        extra_labels,
    ))
}

/// 读回单张 issue(带正文)。走 `view_issue` 单查,正文在回程的 `body` 字段。
pub async fn fetch(app: &App, project: &Project, iid: u32) -> Result<Issue> {
    let remote = app.remote_for(project)?;
    let r = remote
        .view_issue(iid)
        .await
        .map_err(|e| map_remote_err("远端读 issue 没成", e))?;
    Ok(issue_from_remote(project, &app.asset_root, &r))
}

/// 按过滤条件读回 issue 列表,逐条映射回 `Issue`。
pub async fn list(app: &App, project: &Project, filter: IssueFilter) -> Result<Vec<Issue>> {
    let remote = app.remote_for(project)?;
    let list = remote
        .list_issues(&filter)
        .await
        .map_err(|e| map_remote_err("远端读 issue 列表没成", e))?;
    Ok(list
        .iter()
        .map(|r| issue_from_remote(project, &app.asset_root, r))
        .collect())
}

/// 改 issue 的状态标签(`bw:status:*`,namespace-replace 会换掉旧 status)。
/// `Done` 不打标签——走 `close_issue`(issue closed = Done)。`Backlog` 没有
/// 对应标签,如实弹回。`Cancelled` 先打 `bw:status:cancelled` 再关 issue。
pub async fn set_status(app: &App, project: &Project, iid: u32, status: IssueStatus) -> Result<()> {
    let remote = app.remote_for(project)?;
    if status == IssueStatus::Done {
        remote
            .close_issue(iid)
            .await
            .map_err(|e| map_remote_err("远端关 issue 没成", e))?;
        return Ok(());
    }
    let label = status_label(status);
    if label.is_empty() {
        return Err(AppError::Refused(format!(
            "「{}」这个状态在 codehub 映射里没有对应标签",
            status.label()
        )));
    }
    let labels = [format!("bw:status:{label}")];
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端改 issue 状态没成", e))?;
    if status == IssueStatus::Cancelled {
        remote
            .close_issue(iid)
            .await
            .map_err(|e| map_remote_err("远端关作废 issue 没成", e))?;
    }
    Ok(())
}

/// 在 issue 上写一条评论(结构化产出挂评论,不动正文)。
pub async fn comment(app: &App, project: &Project, iid: u32, body: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    remote
        .comment_issue(iid, body)
        .await
        .map_err(|e| map_remote_err("远端写 issue 评论没成", e))?;
    Ok(())
}

/// 读 issue 评论正文,旧的在前。
pub async fn list_comments(app: &App, project: &Project, iid: u32) -> Result<Vec<String>> {
    let remote = app.remote_for(project)?;
    remote
        .list_issue_comments(iid)
        .await
        .map_err(|e| map_remote_err("远端读 issue 评论没成", e))
}

/// 改 issue 的类别标签(`bw:category:*`,namespace-replace 会换掉旧类别)。
pub async fn set_category(
    app: &App,
    project: &Project,
    iid: u32,
    category: crate::model::Category,
) -> Result<()> {
    let remote = app.remote_for(project)?;
    let label = format!("bw:category:{}", crate::model::category_key(category));
    let labels = [label];
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端改 issue 类别没成", e))?;
    Ok(())
}

async fn project_plan_best_effort(remote: &Remote, path: &str, iid: u32, plan: &str) {
    if let Err(e) = remote.project_plan(iid, path, plan).await {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] #{iid} 版本 {plan} 投影没成:{e}"
        );
    }
}

/// 改 issue 的发版标签(`bw:released:*`,namespace-replace 会换掉旧 released)。
pub async fn set_released(app: &App, project: &Project, iid: u32, version: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    let label = format!("bw:released:{version}");
    let labels = [label];
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端改 issue 版本没成", e))?;
    Ok(())
}

/// 改 issue 的责任人(codehub assignee)。空串 = 取消指派。正本在远端。
pub async fn set_assignee(app: &App, project: &Project, iid: u32, assignee: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    remote
        .set_issue_assignee(iid, assignee)
        .await
        .map_err(|e| map_remote_err("远端改 issue 责任人没成", e))?;
    Ok(())
}

/// 改 issue 的标题与正文(codehub issue update)。
pub async fn edit_issue(
    app: &App,
    project: &Project,
    iid: u32,
    title: &str,
    body: &str,
) -> Result<()> {
    let remote = app.remote_for(project)?;
    remote
        .edit_issue(iid, title, body)
        .await
        .map_err(|e| map_remote_err("远端改 issue 标题/正文没成", e))?;
    Ok(())
}

/// 把 issue 排进人起名的版本:打 `bw:plan:<name>` 标签(namespace-replace 摘掉旧
/// `bw:plan:`)+ 挂到同名里程碑(best-effort 镜像)。同一槽位 —— 同时摘
/// `bw:week:`(排进这个版本就不该还挂着周版本)。
pub async fn assign_to_plan(app: &App, project: &Project, iid: u32, plan: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    // 打 bw:plan:<name>,同时摘 bw:week:(空后缀 = 摘掉整个周命名空间)。
    // 一张活只属于一个版本。
    let labels = [format!("bw:plan:{plan}"), "bw:week:".to_string()];
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端打 bw:plan 标签没成", e))?;
    // 里程碑是 codehub 侧镜像,失败只打 stderr,不挡正本(标签)。
    if let Err(e) = remote.project_plan(iid, &project.remote_path, plan).await {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] #{iid} 版本 {plan} 投影没成:{e}"
        );
    }
    Ok(())
}

/// 从版本拿下:摘 `bw:plan:`(空后缀),顺手摘旧 `bw:week:`。
/// 里程碑镜像 best-effort 摘下。
pub async fn clear_plan(app: &App, project: &Project, iid: u32) -> Result<()> {
    let remote = app.remote_for(project)?;
    let labels = ["bw:plan:".to_string(), "bw:week:".to_string()];
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端摘 bw:plan 标签没成", e))?;
    if let Err(e) = remote.clear_issue_milestone(iid).await {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] #{iid} 从版本里程碑摘下没成:{e}"
        );
    }
    Ok(())
}

/// 按标题删版本里程碑。找不到当成功。周格式标题远端也不删。
pub async fn delete_plan_version(app: &App, project: &Project, name: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    remote
        .delete_plan_milestone(&project.remote_path, name)
        .await
        .map_err(|e| map_remote_err("远端删版本里程碑没成", e))?;
    Ok(())
}

/// 建一个版本里程碑(title=name,start,due),返回 mid。不碰 issue ——
/// `assign_to_plan` 才把 issue 挂上去。0 = provider 不投(github/mock)。
pub async fn create_plan_version(
    app: &App,
    project: &Project,
    name: &str,
    start: &str,
    due: &str,
) -> Result<u64> {
    let remote = app.remote_for(project)?;
    remote
        .ensure_plan_milestone(&project.remote_path, name, start, due)
        .await
        .map_err(|e| map_remote_err("远端建版本里程碑没成", e))
}

/// 在远端**开着的** issue 里找一张标题精确匹配的。B 类轻量活在途复用用
/// (固定枚举标题,同一张卡不建第二张)。找不到返回 `None`,不报错。
pub async fn find_open_by_title(
    app: &App,
    project: &Project,
    title: &str,
) -> Result<Option<Issue>> {
    let remote = app.remote_for(project)?;
    let list = remote
        .list_issues(&IssueFilter {
            state: Some(IssueState::Open),
            labels: vec![],
        })
        .await
        .map_err(|e| map_remote_err("远端读 issue 列表没成", e))?;
    Ok(list
        .into_iter()
        .find(|r| r.title == title)
        .map(|r| issue_from_remote(project, &app.asset_root, &r)))
}

/// 开着的项目约定类活:「项目约定」或残留的「编辑项目名片」/「规范铺底 v*」。
pub async fn find_open_charter(app: &App, project: &Project) -> Result<Option<Issue>> {
    let list = list(
        app,
        project,
        IssueFilter {
            state: Some(IssueState::Open),
            labels: vec![],
        },
    )
    .await?;
    Ok(list.into_iter().find(is_open_charter))
}

// ─────────────── Issue 构造(两条路:create 直接拼 / 从 RemoteIssue 映射)────

/// 一张活只属于一个版本槽。有 `bw:plan:<name>` 就排期;`week_of` 即使非空
/// 也不再生成周排期(不再写 `bw:week:`)。
fn one_schedule(_week_of: &str, extra_labels: &[&str]) -> (Option<String>, Option<String>) {
    let plan = extra_labels
        .iter()
        .find_map(|l| l.strip_prefix("bw:plan:"))
        .filter(|s| crate::version::is_plan_name(s))
        .map(|s| s.to_string());
    (None, plan)
}

/// `create` 成功后拼 `Issue`——这会儿没有 `RemoteIssue` 快照,但 title/body/
/// kind/week 都是调用方给的,其余 lossy 字段给默认值。
#[allow(clippy::too_many_arguments)]
fn issue_from_create(
    project: &Project,
    asset_root: &std::path::Path,
    iid: u32,
    title: &str,
    body: &str,
    kind: IssueKind,
    week_of: &str,
    extra_labels: &[&str],
) -> Issue {
    let category = parse_category(extra_labels);
    let (tool, workflow) = resolve_tool_workflow(project, asset_root, kind, title, category);
    let (week, plan) = one_schedule(week_of, extra_labels);
    let scheduled = week.is_some() || plan.is_some();
    Issue {
        id: IssueId::from_remote(project.id, iid),
        project_id: project.id,
        number: iid,
        remote_number: iid,
        title: title.to_string(),
        body: body.to_string(),
        status: if scheduled {
            IssueStatus::Todo
        } else {
            IssueStatus::Backlog
        },
        branch: String::new(),
        pr_number: 0,
        has_open_mr: false,
        week_of: week.unwrap_or_default(),
        version: String::new(),
        tool,
        kind,
        origin: origin_for(kind),
        workflow,
        category,
        sort_order: iid as f64,
        metric_key: String::new(),
        created_at: parse_iso_to_unix(None),
        updated_at: 0,
        settled_at: None,
        assignee: String::new(),
        author: String::new(),
        plan_version: plan.unwrap_or_default(),
    }
}

/// 把一条远端 issue 快照映射回 `Issue`。body 在 list 不带(填空串),view
/// 带;branch/pr_number/sort_order/metric_key 仍按设计篇给默认值。
/// `created_at`/`settled_at` 从远端 RFC3339 串解析(刀3-fix:以前写死 0/None,
/// 事件流恒空)。`settled_at`:关闭的 issue 取 `closed_at`;`closed_at` 缺失
/// 但确实关了,退回 `created_at` 当近似(事件流至少能进「结清」那条)。
fn issue_from_remote(project: &Project, asset_root: &std::path::Path, r: &RemoteIssue) -> Issue {
    let closed = r.state.eq_ignore_ascii_case("closed");
    let cancelled = has_cancelled_label(&r.labels);
    let kind = kind_from_title(&r.title);
    // 作废会关 issue。先认取消标签,否则 closed 会被读成已完成。
    let status = if cancelled {
        IssueStatus::Cancelled
    } else if closed {
        IssueStatus::Done
    } else {
        parse_status_from_labels(&r.labels)
    };
    let created_at = parse_iso_to_unix(r.created_at.as_deref());
    let settled_at = if closed && !cancelled {
        Some(parse_iso_to_unix(r.closed_at.as_deref()).max(created_at))
    } else {
        None
    };
    let category = parse_category(&r.labels);
    let (tool, workflow) = resolve_tool_workflow(project, asset_root, kind, &r.title, category);
    Issue {
        id: IssueId::from_remote(project.id, r.iid),
        project_id: project.id,
        number: r.iid,
        remote_number: r.iid,
        title: r.title.clone(),
        // view_issue 单查带正文;list_issues 不带(填空串)。
        body: r.body.clone(),
        status,
        branch: String::new(),
        pr_number: 0,
        has_open_mr: false,
        week_of: parse_week(&r.labels),
        version: parse_released(&r.labels),
        tool,
        kind,
        origin: origin_for(kind),
        workflow,
        category,
        sort_order: r.iid as f64,
        metric_key: String::new(),
        created_at,
        updated_at: 0,
        settled_at,
        assignee: r.assignee.clone().unwrap_or_default(),
        author: r.author.clone().unwrap_or_default(),
        plan_version: parse_plan(&r.labels),
    }
}

/// RFC3339 串 → unix 秒。`None`/解析不出 = 0(事件流靠 `created_at > 0` 判进不进,
/// 0 就是「这条进不来」,如实地少一条,不编一个时刻)。
fn parse_iso_to_unix(s: Option<&str>) -> i64 {
    let Some(s) = s else { return 0 };
    let Ok(t) = time::OffsetDateTime::parse(s, &time::format_description::well_known::Rfc3339)
    else {
        return 0;
    };
    t.unix_timestamp()
}

// ─────────────── 辅助:kind/workflow/tool/origin 推断 ───────────────

fn is_ops_title(title: &str) -> bool {
    title.starts_with(OPS1_TITLE_PREFIX)
        || title.starts_with(OPS2_TITLE_PREFIX)
        || title.starts_with(OPS3_TITLE_PREFIX)
}

fn kind_from_title(title: &str) -> IssueKind {
    if is_ops_title(title) {
        IssueKind::Ops
    } else if title == CHARTER_TITLE
        || title == LIGHT_TITLE
        || title == LIGHT_CHAT_TITLE
        || title == LIGHT_VERSION_TITLE
    {
        IssueKind::Light
    } else {
        IssueKind::Business
    }
}

/// 项目约定类标题:现行「项目约定」+ 残留的名片轻量活 / 规范铺底。
pub fn is_charter_title(title: &str) -> bool {
    title == CHARTER_TITLE || title == LIGHT_TITLE || title.starts_with(OPS3_TITLE_PREFIX)
}

/// 开着的项目约定类活(没完成、没作废)。
pub fn is_open_charter(i: &Issue) -> bool {
    is_charter_title(&i.title) && !matches!(i.status, IssueStatus::Done | IssueStatus::Cancelled)
}

/// 这张活干活的分支。常驻车走固定名;其余 `bw/issue-<号>`。
pub fn work_branch(issue: &Issue) -> String {
    if issue.title == CHARTER_TITLE {
        bw_engine::workspace::PROJECT_BRANCH.to_string()
    } else if issue.workflow == super::OPS1_WORKFLOW || issue.title.starts_with(OPS1_TITLE_PREFIX) {
        bw_engine::workspace::WEEK_PLAN_BRANCH.to_string()
    } else if issue.workflow == super::OPS2_WORKFLOW || issue.title.starts_with(OPS2_TITLE_PREFIX) {
        bw_engine::workspace::OPS_AUDIT_BRANCH.to_string()
    } else {
        bw_engine::github::issue_branch(issue.number)
    }
}

/// 未合入的项目约定:从常驻树或残留 issue 树读名片,盖过主检出/HEAD。
pub fn overlay_project_file(
    ws: &std::path::Path,
    issues: &[Issue],
) -> Option<crate::repo::project_file::ProjectFile> {
    let i = issues.iter().find(|i| is_open_charter(i))?;
    let tree = if i.title == CHARTER_TITLE {
        bw_engine::workspace::project_worktree_path(ws)?
    } else {
        bw_engine::workspace::resolve_issue_worktree(ws, i.number, None)
            .or_else(|| bw_engine::workspace::issue_worktree_path(ws, i.number))?
    };
    crate::repo::project_file::read(&tree).ok().flatten()
}

/// 运作活的 workflow 从标题推断:①→`更新指标与版本计划`,②→`资产盘点`,
/// ③→`规范铺底`(③没有 agent 步骤,skill_slug 回 None,但 workflow 字段
/// 仍需有值给配置屏「用过几次」与演示读回用)。
fn ops_workflow_from_title(title: &str) -> String {
    if title.starts_with(OPS1_TITLE_PREFIX) {
        super::OPS1_WORKFLOW.into()
    } else if title.starts_with(OPS2_TITLE_PREFIX) {
        super::OPS2_WORKFLOW.into()
    } else if title.starts_with(OPS3_TITLE_PREFIX) {
        super::OPS3_WORKFLOW.into()
    } else {
        String::new()
    }
}

fn workflow_for(kind: IssueKind, title: &str) -> String {
    match kind {
        IssueKind::Ops => ops_workflow_from_title(title),
        // light→无;business 的 workflow 走产品默认,不在这里。
        _ => String::new(),
    }
}

/// 开工工具:本机 settings → 产品默认。不读仓里的残留文件。
fn resolve_tool(asset_root: &std::path::Path, cat: crate::model::Category) -> String {
    let key = crate::model::category_key(cat);
    crate::local::Settings::get_tool(asset_root, key)
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| crate::defaults::default_tool(cat).to_string())
}

fn resolve_tool_workflow(
    _project: &Project,
    asset_root: &std::path::Path,
    kind: IssueKind,
    title: &str,
    category: Option<crate::model::Category>,
) -> (String, String) {
    if kind == IssueKind::Ops {
        // 运作活①② 跟构建的本机开工工具,不走配置屏「运维」。
        return (
            resolve_tool(asset_root, crate::model::Category::Build),
            workflow_for(kind, title),
        );
    }
    if kind == IssueKind::Light {
        return (String::new(), String::new());
    }
    let Some(cat) = category else {
        return (String::new(), String::new());
    };
    (
        resolve_tool(asset_root, cat),
        crate::defaults::default_workflow(cat).to_string(),
    )
}

fn parse_category<S: AsRef<str>>(labels: &[S]) -> Option<crate::model::Category> {
    labels.iter().find_map(|l| {
        l.as_ref()
            .strip_prefix("bw:category:")
            .and_then(crate::model::category_from_key)
    })
}

fn origin_for(kind: IssueKind) -> IssueOrigin {
    match kind {
        IssueKind::Ops => IssueOrigin::Auto,
        _ => IssueOrigin::Human,
    }
}

// ─────────────── 辅助:标签 ↔ 字段 ───────────────

fn has_cancelled_label(labels: &[String]) -> bool {
    labels
        .iter()
        .any(|l| l.strip_prefix("bw:status:") == Some("cancelled"))
}

/// 状态标签后缀。Done 走 close;Backlog 仍无对应标签。Cancelled 打
/// `bw:status:cancelled` 再关 issue——codehub 不能删卡,作废不等于完成。
fn status_label(status: IssueStatus) -> &'static str {
    match status {
        IssueStatus::Todo => "todo",
        IssueStatus::InProgress => "inprogress",
        IssueStatus::InReview => "inreview",
        IssueStatus::Blocked => "blocked",
        IssueStatus::Cancelled => "cancelled",
        _ => "",
    }
}

/// 从标签里找 `bw:status:*`,映射回 `IssueStatus`。无 → Todo(默认)。
fn parse_status_from_labels(labels: &[String]) -> IssueStatus {
    for l in labels {
        if let Some(suffix) = l.strip_prefix("bw:status:") {
            return match suffix {
                "todo" => IssueStatus::Todo,
                "inprogress" => IssueStatus::InProgress,
                "inreview" => IssueStatus::InReview,
                "blocked" => IssueStatus::Blocked,
                "cancelled" => IssueStatus::Cancelled,
                _ => continue,
            };
        }
    }
    IssueStatus::Todo
}

/// 旧 `bw:week:` 产品不再认。字段留下以免大拆,解析一律空。
fn parse_week(_labels: &[String]) -> String {
    String::new()
}

fn parse_released(labels: &[String]) -> String {
    labels
        .iter()
        .find_map(|l| l.strip_prefix("bw:released:").map(|s| s.to_string()))
        .unwrap_or_default()
}

/// 从 `bw:plan:<name>` 标签取这张活排进的版本。空后缀当没排。
fn parse_plan(labels: &[String]) -> String {
    labels
        .iter()
        .find_map(|l| {
            let s = l.strip_prefix("bw:plan:")?;
            if crate::version::is_plan_name(s) {
                Some(s.to_string())
            } else {
                None
            }
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bw_engine::remote::RemoteIssue;

    fn proj() -> Project {
        Project {
            id: crate::model::ProjectId::nil(),
            slug: "t".into(),
            name: "t".into(),
            workspace_path: String::new(),
            provider: String::new(),
            remote_host: String::new(),
            remote_path: String::new(),
            signal: None,
            weekly_signal: None,
            signal_derived_at: None,
            sort_order: 0.0,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn remote(state: &str, labels: &[&str]) -> RemoteIssue {
        RemoteIssue {
            iid: 9,
            number: 9,
            title: "精品 skill 打磨".into(),
            state: state.into(),
            labels: labels.iter().map(|s| (*s).to_string()).collect(),
            body: String::new(),
            created_at: None,
            closed_at: Some("2026-08-25T00:00:00Z".into()),
            assignee: None,
            author: None,
        }
    }

    #[test]
    fn closed_with_cancelled_is_cancelled_not_done() {
        let i = issue_from_remote(
            &proj(),
            std::path::Path::new(""),
            &remote("closed", &["bw:status:cancelled", "bw:week:2026-W35"]),
        );
        assert_eq!(i.status, IssueStatus::Cancelled);
        assert!(i.settled_at.is_none());
    }

    #[test]
    fn closed_without_cancelled_is_done() {
        let i = issue_from_remote(&proj(), std::path::Path::new(""), &remote("closed", &[]));
        assert_eq!(i.status, IssueStatus::Done);
        assert!(i.settled_at.is_some());
    }

    #[test]
    fn one_schedule_keeps_only_v0x_plan() {
        let (week, plan) = one_schedule("2026-W35", &["bw:plan:v0.3"]);
        assert!(week.is_none());
        assert_eq!(plan.as_deref(), Some("v0.3"));
    }

    #[test]
    fn one_schedule_keeps_any_nonempty_plan() {
        let (week, plan) = one_schedule("2026-W35", &["bw:plan:MVP收尾"]);
        assert!(week.is_none());
        assert_eq!(plan.as_deref(), Some("MVP收尾"));
    }

    #[test]
    fn parse_plan_keeps_old_and_v0x() {
        assert_eq!(parse_plan(&["bw:plan:MVP收尾".into()]), "MVP收尾");
        assert_eq!(parse_plan(&["bw:plan:v0.3".into()]), "v0.3");
        assert_eq!(parse_plan(&["bw:plan:".into()]), "");
        assert_eq!(parse_plan(&["bw:plan:2026-W36".into()]), "2026-W36");
    }

    #[test]
    fn parse_week_ignores_old_label() {
        assert_eq!(parse_week(&["bw:week:2026-W35".into()]), "");
        assert_eq!(parse_week(&["bw:week:".into()]), "");
    }

    #[test]
    fn issue_from_create_writes_plan_not_week() {
        let i = issue_from_create(
            &proj(),
            std::path::Path::new(""),
            3,
            "收口看板",
            "",
            IssueKind::Business,
            "2026-W35",
            &["bw:plan:v0.3", "bw:category:build"],
        );
        assert_eq!(i.week_of, "");
        assert_eq!(i.plan_version, "v0.3");
        assert_eq!(i.status, IssueStatus::Todo);
    }

    #[test]
    fn leftover_issue_policy_does_not_drive_tool() {
        let dir = std::env::temp_dir().join(format!(
            "bw-ops-policy-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(dir.join(".bw")).unwrap();
        std::fs::write(
            dir.join(".bw/issue-policy.toml"),
            r#"
schema_version = 1
[[mapping]]
category = "ops"
tool     = "cursor"
workflow = "mattpocock-skills"
"#,
        )
        .unwrap();
        let mut p = proj();
        p.workspace_path = dir.display().to_string();
        let (tool, workflow) = resolve_tool_workflow(
            &p,
            std::path::Path::new(""),
            IssueKind::Ops,
            "更新指标 + 制定版本计划",
            None,
        );
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(
            tool,
            crate::defaults::default_tool(crate::model::Category::Build)
        );
        assert_eq!(workflow, super::super::OPS1_WORKFLOW);
    }

    #[test]
    fn ops_tool_falls_back_to_product_default() {
        let (tool, workflow) = resolve_tool_workflow(
            &proj(),
            std::path::Path::new(""),
            IssueKind::Ops,
            "资产盘点 2026-W35",
            None,
        );
        assert_eq!(
            tool,
            crate::defaults::default_tool(crate::model::Category::Build)
        );
        assert_eq!(workflow, super::super::OPS2_WORKFLOW);
    }

    #[test]
    fn settings_tool_wins_over_product_default() {
        let dir = std::env::temp_dir().join(format!(
            "bw-ops-settings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(dir.join(".bw")).unwrap();
        std::fs::write(
            dir.join(".bw/issue-policy.toml"),
            r#"
schema_version = 1
[[mapping]]
category = "ops"
tool     = "cursor"
workflow = "mattpocock-skills"
"#,
        )
        .unwrap();
        let assets = dir.join("assets");
        std::fs::create_dir_all(&assets).unwrap();
        crate::local::Settings::set_tool(&assets, "build", "cursor").unwrap();
        let mut p = proj();
        p.workspace_path = dir.display().to_string();
        let (tool, workflow) =
            resolve_tool_workflow(&p, &assets, IssueKind::Ops, "更新指标 + 制定版本计划", None);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(tool, "cursor");
        assert_eq!(workflow, super::super::OPS1_WORKFLOW);
    }
}
