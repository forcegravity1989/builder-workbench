use crate::model::{Issue, IssueId, IssueKind, IssueOrigin, IssueStatus, Project};
use bw_engine::remote::{IssueFilter, IssueState, Remote, RemoteIssue};

use super::{App, AppError, Result};

const OPS1_TITLE_PREFIX: &str = "更新指标 + 制定版本计划";
const OPS2_TITLE_PREFIX: &str = "资产盘点 ";
/// 历史标题，仅用于识别尚未结束的项目约定。
const OPS3_TITLE_PREFIX: &str = "规范铺底 v";
pub const CHARTER_TITLE: &str = "项目约定";
pub const LIGHT_TITLE: &str = "编辑项目名片";
pub const LIGHT_CHAT_TITLE: &str = "配置项目群";
pub const LIGHT_VERSION_TITLE: &str = "切换在研版本";

fn map_remote_err<E: std::fmt::Display>(ctx: &str, e: E) -> AppError {
    AppError::Exec(format!("{ctx}:{e}"))
}

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
    let (week, plans) = schedules(week_of, extra_labels);
    let status_label = if week.is_none() && plans.is_empty() {
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
        .map_err(|e| map_remote_err("远端 Issue 创建失败", e))?;
    if let Some(name) = plans.last() {
        project_plan_best_effort(&remote, iid, name).await;
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

pub async fn fetch(app: &App, project: &Project, iid: u32) -> Result<Issue> {
    let remote = app.remote_for(project)?;
    let r = remote
        .view_issue(iid)
        .await
        .map_err(|e| map_remote_err("远端读 issue 没成", e))?;
    Ok(issue_from_remote(project, &app.asset_root, &r))
}

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

/// Done 关闭 issue；Cancelled 先写取消标签再关闭，读取时优先识别取消。
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
            .map_err(|e| map_remote_err("关闭已取消的远端 Issue 失败", e))?;
    }
    Ok(())
}

pub async fn comment(app: &App, project: &Project, iid: u32, body: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    remote
        .comment_issue(iid, body)
        .await
        .map_err(|e| map_remote_err("远端写 issue 评论没成", e))?;
    Ok(())
}

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

pub(crate) async fn project_plan_best_effort(remote: &Remote, iid: u32, plan: &str) {
    if let Err(e) = remote.project_plan(iid, plan).await {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] #{iid} 版本 {plan} 投影没成:{e}"
        );
    }
}

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

pub async fn set_assignee(app: &App, project: &Project, iid: u32, assignee: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    remote
        .set_issue_assignee(iid, assignee)
        .await
        .map_err(|e| map_remote_err("远端改 issue 责任人没成", e))?;
    Ok(())
}

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

pub async fn assign_to_plan(app: &App, project: &Project, iid: u32, plan: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    let current = remote
        .view_issue(iid)
        .await
        .map_err(|e| map_remote_err("远端读 issue 标签没成", e))?;
    let mut labels = plan_label_set(&current.labels, Some(plan), None);
    labels.push("bw:week:".to_string());
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端打 bw:plan 标签没成", e))?;
    // 里程碑同步失败不回滚已经写入的版本标签。
    if let Err(e) = remote.project_plan(iid, plan).await {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] #{iid} 版本 {plan} 投影没成:{e}"
        );
    }
    Ok(())
}

/// 从指定版本拿下：只摘精确的 `bw:plan:<plan>`，其余版本关系保留。
pub async fn clear_plan(app: &App, project: &Project, iid: u32, plan: &str) -> Result<()> {
    let remote = app.remote_for(project)?;
    let current = remote
        .view_issue(iid)
        .await
        .map_err(|e| map_remote_err("远端读 issue 标签没成", e))?;
    let mut labels = plan_label_set(&current.labels, None, Some(plan));
    let remaining_plan = labels
        .iter()
        .filter_map(|l| l.strip_prefix("bw:plan:"))
        .next_back()
        .map(str::to_string);
    // 空后缀只负责清空 namespace，本身不会被持久化。
    labels.push("bw:plan:".to_string());
    labels.push("bw:week:".to_string());
    let label_refs: Vec<&str> = labels.iter().map(|s| s.as_str()).collect();
    remote
        .update_issue(iid, Some(&label_refs), None)
        .await
        .map_err(|e| map_remote_err("远端摘 bw:plan 标签没成", e))?;
    let projected = if let Some(name) = remaining_plan {
        remote.project_plan(iid, &name).await
    } else {
        remote.clear_issue_milestone(iid).await
    };
    if let Err(e) = projected {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] #{iid} 从版本里程碑摘下没成:{e}"
        );
    }
    Ok(())
}

fn plan_label_set(labels: &[String], add: Option<&str>, remove: Option<&str>) -> Vec<String> {
    let mut plans: Vec<String> = labels
        .iter()
        .filter_map(|l| l.strip_prefix("bw:plan:"))
        .filter(|s| crate::version::is_plan_name(s) && remove != Some(*s))
        .map(|s| format!("bw:plan:{s}"))
        .collect();
    if let Some(name) = add.filter(|s| crate::version::is_plan_name(s)) {
        let target = format!("bw:plan:{name}");
        if !plans.contains(&target) {
            plans.push(target);
        }
    }
    plans.sort();
    plans.dedup();
    plans
}

/// 按标题删版本里程碑。找不到当成功。失败只记日志,不挡标签正本。
pub async fn try_delete_plan_milestone(app: &App, project: &Project, name: &str) {
    let Ok(remote) = app.remote_for(project) else {
        return;
    };
    if let Err(e) = remote.delete_plan_milestone(name).await {
        bw_engine::dlog!(
            err,
            "milestone",
            "[BW_MILESTONE] 删版本里程碑 {name} 没成:{e}"
        );
    }
}

/// 建/复用同名里程碑。失败返 0,不挡 `bw:plan:` 正本。
pub async fn try_ensure_plan_milestone(
    app: &App,
    project: &Project,
    name: &str,
    start: &str,
    due: &str,
) -> u64 {
    let Ok(remote) = app.remote_for(project) else {
        return 0;
    };
    match remote.ensure_plan_milestone(name, start, due).await {
        Ok(id) => id,
        Err(e) => {
            bw_engine::dlog!(
                err,
                "milestone",
                "[BW_MILESTONE] 建版本里程碑 {name} 没成:{e}"
            );
            0
        }
    }
}

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

fn schedules(_week_of: &str, extra_labels: &[&str]) -> (Option<String>, Vec<String>) {
    let mut plans: Vec<String> = extra_labels
        .iter()
        .filter_map(|l| l.strip_prefix("bw:plan:"))
        .filter(|s| crate::version::is_plan_name(s))
        .map(|s| s.to_string())
        .collect();
    plans.sort();
    plans.dedup();
    (None, plans)
}

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
    let (week, plan_versions) = schedules(week_of, extra_labels);
    let scheduled = week.is_some() || !plan_versions.is_empty();
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
        plan_versions,
    }
}

fn issue_from_remote(project: &Project, asset_root: &std::path::Path, r: &RemoteIssue) -> Issue {
    let closed = r.state.eq_ignore_ascii_case("closed");
    let cancelled = has_cancelled_label(&r.labels);
    let kind = kind_from_title(&r.title);
    // 取消也会关闭 issue，必须先识别取消标签。
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
        plan_versions: parse_plans(&r.labels),
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

pub fn is_charter_title(title: &str) -> bool {
    title == CHARTER_TITLE || title == LIGHT_TITLE || title.starts_with(OPS3_TITLE_PREFIX)
}

pub fn is_open_charter(i: &Issue) -> bool {
    is_charter_title(&i.title) && !matches!(i.status, IssueStatus::Done | IssueStatus::Cancelled)
}

pub fn work_branch(issue: &Issue) -> String {
    if issue.title == CHARTER_TITLE {
        bw_engine::workspace::PROJECT_BRANCH.to_string()
    } else if issue.workflow == super::OPS1_WORKFLOW || issue.title.starts_with(OPS1_TITLE_PREFIX) {
        bw_engine::workspace::WEEK_PLAN_BRANCH.to_string()
    } else if issue.workflow == super::OPS2_WORKFLOW || issue.title.starts_with(OPS2_TITLE_PREFIX) {
        bw_engine::workspace::OPS_AUDIT_BRANCH.to_string()
    } else {
        bw_engine::workspace::issue_branch(issue.number)
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
        // 版本计划与资产盘点 跟构建的本机开工工具,不走配置屏「运维」。
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

fn has_cancelled_label(labels: &[String]) -> bool {
    labels
        .iter()
        .any(|l| l.strip_prefix("bw:status:") == Some("cancelled"))
}

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

fn parse_week(_labels: &[String]) -> String {
    String::new()
}

fn parse_released(labels: &[String]) -> String {
    labels
        .iter()
        .find_map(|l| l.strip_prefix("bw:released:").map(|s| s.to_string()))
        .unwrap_or_default()
}

fn parse_plans(labels: &[String]) -> Vec<String> {
    let mut plans: Vec<String> = labels
        .iter()
        .filter_map(|l| {
            let s = l.strip_prefix("bw:plan:")?;
            if crate::version::is_plan_name(s) {
                Some(s.to_string())
            } else {
                None
            }
        })
        .collect();
    plans.sort();
    plans.dedup();
    plans
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
    fn schedules_keeps_v0x_plan() {
        let (week, plans) = schedules("2026-W35", &["bw:plan:v0.3"]);
        assert!(week.is_none());
        assert_eq!(plans, vec!["v0.3".to_string()]);
    }

    #[test]
    fn schedules_keeps_any_nonempty_plan() {
        let (week, plans) = schedules("2026-W35", &["bw:plan:MVP收尾"]);
        assert!(week.is_none());
        assert_eq!(plans, vec!["MVP收尾".to_string()]);
    }

    #[test]
    fn parse_plans_keeps_all_distinct_versions() {
        assert_eq!(
            parse_plans(&[
                "bw:plan:B".into(),
                "bw:plan:A".into(),
                "bw:plan:B".into(),
                "bw:plan:".into(),
            ]),
            vec!["A".to_string(), "B".to_string()]
        );
    }

    #[test]
    fn plan_label_set_adds_without_replacing_and_removes_exactly() {
        let current = vec!["bw:plan:A".into(), "bw:status:todo".into()];
        assert_eq!(
            plan_label_set(&current, Some("B"), None),
            vec!["bw:plan:A".to_string(), "bw:plan:B".to_string()]
        );
        let carried = vec!["bw:plan:A".into(), "bw:plan:B".into()];
        assert_eq!(
            plan_label_set(&carried, None, Some("A")),
            vec!["bw:plan:B".to_string()]
        );
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
        assert_eq!(i.plan_versions, vec!["v0.3".to_string()]);
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
