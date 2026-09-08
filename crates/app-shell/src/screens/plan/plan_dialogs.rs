//! 计划屏的弹窗:新建issue / 创建版本 / 排期 / 作废确认 / 出包 / 发版本。
//! 全部屏幕居中(dialog-backdrop + dialog)。
//!
//! 出包进度活在 [`PackJob`] 上,关弹窗不打断后台。

use crate::{
    bridge::Bridge,
    vm::{CardItemVm, ProjectVm},
};
use bw::{
    app::{ProgressCase, ProgressLine, StepState},
    command::Command,
    model::{
        category_from_key, category_key, IssueId, IssueKind, IssueOrigin, IssueStatus, StageKind,
    },
};
use dioxus::prelude::*;

use super::kanban::{plan_status_label, PendingMove, PendingReject, PendingSchedule};

/// 当前打开哪个弹窗。`None` = 没有。
#[derive(Clone, PartialEq)]
pub enum DialogKind {
    NewIssue(NewIssueDraft),
    CreateVersion,
    DeleteVersion,
    Pack(PackDraft),
    Release(ReleaseDraft),
}

#[derive(Clone, PartialEq)]
pub struct PackDraft {
    pub project_id: bw::model::ProjectId,
    pub version: String,
}

/// 出包这一趟的界面账。关弹窗也留着,按钮三个点再点回来。
#[derive(Clone, PartialEq, Default)]
pub struct PackJob {
    pub project_id: Option<bw::model::ProjectId>,
    pub version: String,
    pub packing: bool,
    pub finished: bool,
    pub pack_line: Option<ProgressLine>,
    pub e2e_line: Option<ProgressLine>,
}

impl PackJob {
    pub fn apply_progress(&mut self, line: ProgressLine) {
        match line.step {
            21 => {
                let fail = line.state == StepState::Fail;
                self.pack_line = Some(line);
                if fail {
                    self.packing = false;
                    self.finished = true;
                }
            }
            22 if line.state != StepState::Doing => {
                self.e2e_line = Some(line);
                self.packing = false;
                self.finished = true;
            }
            22 => self.e2e_line = Some(line),
            _ => {}
        }
    }
}

#[derive(Clone, PartialEq)]
pub struct NewIssueDraft {
    pub title: String,
    pub body: String,
    pub category: StageKind,
    pub kind: IssueKind,
    pub assignee: String,
}

impl Default for NewIssueDraft {
    fn default() -> Self {
        Self {
            title: String::new(),
            body: String::new(),
            category: StageKind::Prototype,
            kind: IssueKind::Business,
            assignee: String::new(),
        }
    }
}

#[derive(Clone, PartialEq)]
pub struct ReleaseDraft {
    pub project_id: bw::model::ProjectId,
    pub version: String,
    pub note: String,
    pub included: Vec<IssueId>,
}

/// 新建 issue 弹窗。含负责人字段;创建后同步到 codehub(走 CreateIssue +
/// 可选 SetIssueAssignee)。
#[component]
pub fn NewIssueDialog(
    p: ProjectVm,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    let mut title = use_signal(String::new);
    let mut body = use_signal(String::new);
    let mut category = use_signal(|| StageKind::Prototype);
    let mut assignee = use_signal(String::new);
    let b = bridge.clone();
    let pid = p.id;
    let title_ok = !title.read().trim().is_empty();
    let where_note = if p.view_all {
        "新建的 issue 进待办池·未排期;创建后同步到 codehub。".to_string()
    } else if !p.viewing_plan.is_empty() {
        format!("新建的 issue 排进版本「{}」。", p.viewing_plan)
    } else {
        "新建的 issue 进待办池·未排期。".to_string()
    };
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| dialog.set(None),
            div {
                class: "dialog dialog-wide plan-modal",
                role: "dialog",
                onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "新建" }
                    div { class: "plan-modal-title", "新建 issue" }
                    button {
                        class: "btn btn-ghost btn-quiet btn-icon plan-modal-x",
                        onclick: move |_| dialog.set(None),
                        "✕"
                    }
                }
                div { class: "plan-modal-body",
                    div { class: "field",
                        label { "标题 *" }
                        input { class: "input", value: "{title}", placeholder: "这张活要干什么",
                            oninput: move |e| title.set(e.value()) }
                    }
                    div { class: "field",
                        label { "正文" }
                        textarea { class: "input", value: "{body}", placeholder: "要做成什么、边界。可空",
                            oninput: move |e| body.set(e.value()) }
                    }
                    div { class: "field",
                        label { "类别" }
                        select { class: "input",
                            onchange: move |e| { if let Some(c) = category_from_key(&e.value()) { category.set(c); } },
                            for c in StageKind::ALL {
                                option { key: "{category_key(c)}", value: "{category_key(c)}", selected: *category.read() == c, "{c.label()}" }
                            }
                        }
                    }
                    div { class: "field",
                        label { "负责人" }
                        input { class: "input", value: "{assignee}", placeholder: "指派谁(可空)",
                            oninput: move |e| assignee.set(e.value()) }
                    }
                    div { class: "hint", "{where_note}" }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { class: "row",
                        button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                        button {
                            class: "btn btn-primary",
                            disabled: !title_ok,
                            onclick: move |_| {
                                let t = title.read().trim().to_string();
                                if t.is_empty() { return; }
                                // 看某个计划版本只带 plan;看周或全部进待办池。
                                // 不再给新建活打 bw:week。
                                let viewing_custom = !p.viewing_plan.is_empty();
                                b.cmd(Command::CreateIssue {
                                    project_id: pid,
                                    title: t,
                                    body: body.read().trim().to_string(),
                                    category: Some(*category.read()),
                                    kind: IssueKind::Business,
                                    origin: IssueOrigin::Human,
                                    week_of: String::new(),
                                    plan: if viewing_custom {
                                        p.viewing_plan.clone()
                                    } else {
                                        String::new()
                                    },
                                });
                                dialog.set(None);
                            },
                            "创建"
                        }
                    }
                }
            }
        }
    }
}

/// 创建版本弹窗。默认起止是本周周一到周五。
#[component]
pub fn CreateVersionDialog(
    p: ProjectVm,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    // 草稿存组件局部 state(use_signal),弹窗关了就丢。
    let mut name = use_signal(|| p.suggested_next.clone());
    let week = p.current_week.clone();
    let mut start = use_signal(|| bw::isoweek::week_monday_ymd(&week).unwrap_or_default());
    let mut due = use_signal(|| bw::isoweek::week_friday_ymd(&week).unwrap_or_default());
    let mut note = use_signal(String::new);
    let picked = use_signal(Vec::<IssueId>::new);
    let unassigned: Vec<&CardItemVm> = p
        .board
        .columns
        .iter()
        .flat_map(|c| c.cards.iter())
        .filter(|c| c.status == IssueStatus::Backlog)
        .collect();
    let b = bridge.clone();
    let pid = p.id;
    let name_ok = !name.read().trim().is_empty();
    let start_v = start.read().clone();
    let due_v = due.read().clone();
    let dates_partial = start_v.is_empty() != due_v.is_empty();
    let dates_ok = !start_v.is_empty() && !due_v.is_empty();
    let range_bad = dates_ok && start_v > due_v;
    let name_v = name.read().trim().to_string();
    let taken = p.plan_versions.iter().any(|v| v.name == name_v)
        || p.last_released == name_v
        || p.unreleased.iter().any(|s| s == &name_v);
    let shape_ok = !name_v.is_empty();
    let can_create = name_ok && !dates_partial && !range_bad && shape_ok && !taken;
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| dialog.set(None),
            div {
                class: "dialog dialog-wide plan-modal",
                role: "dialog",
                onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "版本" }
                    div { class: "plan-modal-title", "创建版本" }
                    button {
                        class: "btn btn-ghost btn-quiet btn-icon plan-modal-x",
                        onclick: move |_| dialog.set(None),
                        "✕"
                    }
                }
                div { class: "plan-modal-body",
                    div { class: "field",
                        label { "版本名 *" }
                        input { class: "input", value: "{name}", placeholder: "例如 v0.3",
                            oninput: move |e| name.set(e.value()) }
                        if !name_v.is_empty() && !shape_ok {
                            div { class: "field-err", "版本名不能是周号" }
                        } else if taken {
                            div { class: "field-err", "{name_v} 已经有了" }
                        }
                    }
                    div { class: "field",
                        label { "时间" }
                        div { class: "field-2",
                            div { class: "field",
                                label { "开始 " span { class: "asterisk", "*" } }
                                input {
                                    class: if range_bad { "input invalid" } else { "input" },
                                    r#type: "date",
                                    value: "{start}",
                                    oninput: move |e| start.set(e.value()),
                                }
                            }
                            div { class: "field",
                                label { "结束 " span { class: "asterisk", "*" } }
                                input {
                                    class: if range_bad { "input invalid" } else { "input" },
                                    r#type: "date",
                                    value: "{due}",
                                    oninput: move |e| due.set(e.value()),
                                }
                            }
                        }
                        if dates_partial {
                            div { class: "field-err", "开始和结束要一起填,也可以都空着" }
                        } else if range_bad {
                            div { class: "field-err", "开始不能晚于结束" }
                        }
                    }
                    div { class: "field",
                        label { "说明" }
                        textarea { class: "input", value: "{note}", placeholder: "这个版本要收口什么（写成运作活①的版本目标）",
                            oninput: move |e| note.set(e.value()) }
                    }
                    div { class: "field",
                        label { "划归的 issue" }
                        div { class: "check-list",
                            if unassigned.is_empty() {
                                div { class: "hint", "当前没有未排期的活可划归。" }
                            }
                            for c in unassigned.iter() {
                                {check_row(c, picked)}
                            }
                        }
                    }
                    div { class: "hint",
                        {
                            let last = if p.last_released.is_empty() { "没有" } else { p.last_released.as_str() };
                            let unrel = if p.unreleased.is_empty() { "没有".to_string() } else { p.unreleased.join("、") };
                            format!("会建一张「更新指标 + 制定版本计划 {name_v}」。上一发 · {last}　未发 · {unrel}　推荐 · {}", p.suggested_next)
                        }
                    }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { class: "row",
                        button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                        button {
                            class: "btn btn-primary",
                            disabled: !can_create,
                            onclick: move |_| {
                                let start_v = start.read().clone();
                                let due_v = due.read().clone();
                                if name.read().trim().is_empty()
                                    || start_v.is_empty() != due_v.is_empty()
                                    || (!start_v.is_empty() && start_v > due_v)
                                {
                                    return;
                                }
                                let included = picked.read().clone();
                                b.cmd(Command::CreatePlanVersion {
                                    project_id: pid,
                                    name: name.read().trim().to_string(),
                                    start: start.read().clone(),
                                    due: due.read().clone(),
                                    note: note.read().trim().to_string(),
                                    included,
                                });
                                dialog.set(None);
                            },
                            "创建"
                        }
                    }
                }
            }
        }
    }
}

fn check_row(c: &CardItemVm, mut picked: Signal<Vec<IssueId>>) -> Element {
    let id = c.id;
    let checked = picked.read().contains(&id);
    rsx! {
        label { class: "check-row",
            input {
                r#type: "checkbox",
                checked,
                onchange: move |e| {
                    let mut v = picked.write();
                    if e.checked() { if !v.contains(&id) { v.push(id); } }
                    else { v.retain(|x| *x != id); }
                },
            }
            span { "#{c.number} {c.title}" }
        }
    }
}

/// 排期弹窗(拖未排期卡到已排期段触发):只排进已有计划版本,不再写周标签。
#[component]
pub fn ScheduleDialog(
    p: ProjectVm,
    ps: PendingSchedule,
    mut schedule: Signal<Option<PendingSchedule>>,
    bridge: Bridge,
) -> Element {
    let b = bridge.clone();
    let id = ps.id;
    let default_sel = p
        .plan_versions
        .first()
        .map(|v| format!("version:{}", v.name))
        .unwrap_or_default();
    let mut sel = use_signal(move || default_sel.clone());
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| schedule.set(None),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "排期" }
                div { class: "dialog-body",
                    "把「{ps.title}」排进一个版本。一张活只属于一个槽。"
                }
                div { class: "field",
                    label { "排进" }
                    select {
                        class: "input",
                        onchange: move |e| sel.set(e.value()),
                        for v in p.plan_versions.iter() {
                            {let val = format!("version:{}", v.name); rsx! { option { value: "{val}", "{v.name}" } }}
                        }
                    }
                }
                div { class: "hint",
                    "打 bw:plan:。旧周标签只读回显示,排期不再新写。"
                }
                div { class: "dialog-actions",
                    button { class: "btn btn-secondary", onclick: move |_| schedule.set(None), "取消" }
                    button {
                        class: "btn btn-primary",
                        disabled: p.plan_versions.is_empty(),
                        onclick: move |_| {
                            let s = sel.read().clone();
                            if let Some(rest) = s.strip_prefix("version:") {
                                b.cmd(Command::ScheduleToPlan { id, plan: rest.to_string() });
                            }
                            schedule.set(None);
                        },
                        "确认 · 排期"
                    }
                }
            }
        }
    }
}

/// 拖卡片松手后的确认框。完成走合入;拒绝走作废(必须写原因);其余走状态转移。
#[component]
pub fn ConfirmMoveDialog(
    pm: PendingMove,
    mut pending: Signal<Option<PendingMove>>,
    bridge: Bridge,
) -> Element {
    let b = bridge.clone();
    let pm2 = pm.clone();
    let mut reason = use_signal(String::new);
    let need_reason = matches!(pm.to, IssueStatus::Cancelled | IssueStatus::Blocked);
    let to_label = plan_status_label(pm.to);
    let from_label = plan_status_label(pm.from);
    let reason_label = if pm.to == IssueStatus::Blocked {
        "阻塞原因"
    } else {
        "作废原因"
    };
    let reason_hint = if pm.to == IssueStatus::Blocked {
        "阻塞必须写原因,会写进 issue 评论"
    } else {
        "作废必须写原因,会写进 issue 评论"
    };
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| pending.set(None),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "确认一下" }
                div { class: "dialog-body",
                    "把「{pm.title}」从「{from_label}」移到「{to_label}」。"
                }
                if pm.to == IssueStatus::Done && pm.has_open_mr {
                    div { class: "dialog-body",
                        "有开着的 MR。确认后会合入再完成。"
                    }
                }
                if pm.to == IssueStatus::Done && !pm.has_open_mr {
                    div { class: "dialog-body",
                        "没有开着的 MR。可能已经在网页合过了。确认后只关这张 issue,不会再去合。"
                    }
                }
                if pm.to == IssueStatus::InReview && pm.pr_number == 0 {
                    div { class: "dialog-body",
                        "这张活没有绑定的 MR。确认后仍移到待评审,合入时只会关 issue。"
                    }
                }
                if need_reason {
                    div { class: "field",
                        label { "{reason_label}" }
                        textarea {
                            class: "input",
                            rows: "3",
                            placeholder: "{reason_hint}",
                            oninput: move |e| reason.set(e.value()),
                        }
                    }
                }
                div { class: "dialog-actions",
                    button { class: "btn btn-secondary", onclick: move |_| pending.set(None), "算了" }
                    button {
                        class: if pm.to == IssueStatus::Cancelled { "btn btn-danger" } else { "btn btn-primary" },
                        disabled: need_reason && reason.read().trim().is_empty(),
                        onclick: move |_| {
                            if pm2.to == IssueStatus::Done && pm2.has_open_mr {
                                b.cmd(Command::MergeAndSettle { id: pm2.id });
                            } else if pm2.to == IssueStatus::Done {
                                b.cmd(Command::TransitionIssue {
                                    id: pm2.id,
                                    to: IssueStatus::Done,
                                });
                            } else if pm2.to == IssueStatus::Cancelled {
                                let why = reason.read().trim().to_string();
                                if why.is_empty() {
                                    return;
                                }
                                b.cmd(Command::CancelIssue { id: pm2.id, reason: why });
                            } else if pm2.to == IssueStatus::Blocked {
                                let why = reason.read().trim().to_string();
                                if why.is_empty() {
                                    return;
                                }
                                b.cmd(Command::BlockIssue { id: pm2.id, reason: why });
                            } else {
                                b.cmd(Command::TransitionIssue { id: pm2.id, to: pm2.to });
                            }
                            pending.set(None);
                        },
                        "确认"
                    }
                }
            }
        }
    }
}

/// 非法拖的说明。只有「知道了」。
#[component]
pub fn RejectMoveDialog(pr: PendingReject, mut reject: Signal<Option<PendingReject>>) -> Element {
    let from = plan_status_label(pr.from);
    let to = plan_status_label(pr.to);
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| reject.set(None),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "不能这样拖" }
                div { class: "dialog-body",
                    "不能从「{from}」拖到「{to}」。"
                }
                div { class: "dialog-body",
                    "{pr.reason}"
                }
                div { class: "dialog-actions",
                    button { class: "btn btn-primary", onclick: move |_| reject.set(None), "知道了" }
                }
            }
        }
    }
}

/// 删除版本弹窗:选一个版本删,确认后清掉 milestone + 摘掉 issues 上的 bw:plan 标签。
#[component]
pub fn DeleteVersionDialog(
    p: ProjectVm,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    let b = bridge.clone();
    let pid = p.id;
    let versions: Vec<String> = p
        .plan_versions
        .iter()
        .filter(|v| !v.released)
        .map(|v| v.name.clone())
        .collect();
    let default_sel = versions.first().cloned().unwrap_or_default();
    let mut sel = use_signal(move || default_sel.clone());
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| dialog.set(None),
            div {
                class: "dialog dialog-wide plan-modal",
                role: "dialog",
                onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "删除版本" }
                    button {
                        class: "btn btn-ghost btn-quiet btn-icon plan-modal-x",
                        onclick: move |_| dialog.set(None),
                        "✕"
                    }
                }
                div { class: "plan-modal-body",
                    div { class: "field",
                        label { "选版本" }
                        select {
                            class: "input",
                            onchange: move |e| sel.set(e.value()),
                            for v in versions.iter() {
                                option { value: "{v}", "{v}" }
                            }
                        }
                    }
                    if versions.is_empty() {
                        div { class: "hint", "没有未发的版本可删。" }
                    }
                    div { class: "hint", "确认后摘掉 issue 上的 bw:plan 标签。同名里程碑能删就删,删不成不影响标签。" }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { class: "row",
                        button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                        button {
                            class: "btn btn-danger",
                            disabled: versions.is_empty(),
                            onclick: move |_| {
                                let s = sel.read().clone();
                                b.cmd(Command::DeletePlanVersion {
                                    project_id: pid,
                                    name: s,
                                });
                                dialog.set(None);
                            },
                            "删除"
                        }
                    }
                }
            }
        }
    }
}

/// 出包弹窗。号锁死当前版本视图。确认后出包再验包,不打标签。
/// 关闭只收窗,后台继续;停止再问一句,确认后杀进程并清中间件。
#[component]
pub fn PackDialog(
    draft: PackDraft,
    mut dialog: Signal<Option<DialogKind>>,
    mut pack_job: Signal<PackJob>,
    bridge: Bridge,
) -> Element {
    let mut asking_stop = use_signal(|| false);
    let asking_detail = use_signal(|| false);
    let version = draft.version.clone();
    let version_show = version.clone();
    let pid = draft.project_id;
    let b = bridge.clone();
    let job = pack_job.read().clone();
    let busy = job.packing;
    let pack = job.pack_line.clone();
    let e2e = job.e2e_line.clone();
    let version_ok = {
        let t = version.trim();
        !t.is_empty() && !t.contains('(')
    };
    rsx! {
        div {
            class: "dialog-backdrop",
            onclick: move |_| dialog.set(None),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "出包" }
                div { class: "field",
                    label { "版本号" }
                    input { class: "input", value: "{version_show}", readonly: true }
                }
                div { class: "ship-rows",
                    {ship_status_row("出包", "还没开始", pack.clone(), false, None)}
                    {ship_status_row("验包", "出包过了再验", e2e.clone(), true, Some(asking_detail))}
                }
                div { class: "hint",
                    "已打 tag 的号从独立 worktree 检出 tag 再出,主检出不动。在研且还没 tag 的号先把工作区拉到远端最新再出。不建远端 Release。"
                }
                div { class: "dialog-actions",
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| dialog.set(None),
                        "关闭"
                    }
                    if busy {
                        button {
                            class: "btn btn-danger",
                            onclick: move |_| asking_stop.set(true),
                            "停止"
                        }
                    }
                    if !busy {
                        button {
                            class: "btn btn-primary",
                            disabled: !version_ok,
                            onclick: move |_| {
                                let v = version.trim().to_string();
                                if v.is_empty() || v.contains('(') { return; }
                                pack_job.set(PackJob {
                                    project_id: Some(pid),
                                    version: v.clone(),
                                    packing: true,
                                    finished: false,
                                    pack_line: None,
                                    e2e_line: None,
                                });
                                b.cmd(Command::PackRelease {
                                    project_id: pid,
                                    version: v,
                                });
                            },
                            "确认 · 出包"
                        }
                    }
                }
            }
        }
        if *asking_stop.read() {
            PackStopConfirm {
                asking_stop,
                dialog,
                pack_job,
                bridge: bridge.clone(),
            }
        }
        if *asking_detail.read() {
            PackE2eDetail {
                cases: e2e.as_ref().map(|l| l.cases.clone()).unwrap_or_default(),
                fallback: e2e.as_ref().map(|l| l.text.clone()).unwrap_or_default(),
                asking_detail,
            }
        }
    }
}

#[component]
fn PackE2eDetail(
    cases: Vec<ProgressCase>,
    fallback: String,
    mut asking_detail: Signal<bool>,
) -> Element {
    rsx! {
        div {
            class: "dialog-backdrop dialog-backdrop-2",
            onclick: move |_| asking_detail.set(false),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "验包详情" }
                if cases.is_empty() {
                    div { class: "hint",
                        if fallback.is_empty() { "这次验包没打出用例明细。" } else { "{fallback}" }
                    }
                } else {
                    div { class: "ship-cases",
                        for c in cases.iter() {
                            PackE2eCaseRow { c: c.clone() }
                        }
                    }
                }
                div { class: "dialog-actions",
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| asking_detail.set(false),
                        "关闭"
                    }
                }
            }
        }
    }
}

#[component]
fn PackE2eCaseRow(c: ProgressCase) -> Element {
    let skipped = !c.ok && c.message.starts_with("未跑");
    let mark = if c.ok {
        "过了"
    } else if skipped {
        "未跑"
    } else {
        "没过"
    };
    let mark_cls = if c.ok {
        "ship-case-mark--ok"
    } else {
        "ship-case-mark--fail"
    };
    let title = e2e_case_label(&c.name);
    let show_msg = !c.ok && !c.message.is_empty();
    let msg = c.message.clone();
    rsx! {
        div { class: "ship-case",
            div { class: "ship-case-head",
                span { class: "ship-case-name", "{title}" }
                span { class: "ship-case-mark {mark_cls}", "{mark}" }
            }
            if show_msg {
                div { class: "ship-case-msg", "{msg}" }
            }
        }
    }
}

fn e2e_case_label(name: &str) -> String {
    match name {
        "shell_launches" => "壳能亮".into(),
        "cu_settings" => "设置屏".into(),
        "cu_onboard" => "接入屏".into(),
        other => other.to_string(),
    }
}

#[component]
fn PackStopConfirm(
    mut asking_stop: Signal<bool>,
    mut dialog: Signal<Option<DialogKind>>,
    mut pack_job: Signal<PackJob>,
    bridge: Bridge,
) -> Element {
    rsx! {
        div {
            class: "dialog-backdrop dialog-backdrop-2",
            onclick: move |_| asking_stop.set(false),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "停止这次出包？" }
                div { class: "hint",
                    "确认后会停掉正在跑的出包 / 验包,并清掉这次的中间生成件。已经落到产物目录里的半成品也会删掉。"
                }
                div { class: "dialog-actions",
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| asking_stop.set(false),
                        "取消"
                    }
                    button {
                        class: "btn btn-danger",
                        onclick: move |_| {
                            bridge.abort_pack();
                            asking_stop.set(false);
                            dialog.set(None);
                            pack_job.set(PackJob::default());
                        },
                        "确认"
                    }
                }
            }
        }
    }
}

/// 发版本弹窗。号锁死当前版本视图,不能改。
#[component]
pub fn ReleaseDialog(
    draft: ReleaseDraft,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    let version = use_signal(move || draft.version.clone());
    let mut note = use_signal(move || draft.note.clone());
    let included = draft.included.clone();
    let pid = draft.project_id;
    let b = bridge.clone();
    let version_ok = {
        let t = version.read().trim().to_string();
        !t.is_empty() && !t.contains('(')
    };
    let included = std::rc::Rc::new(included);
    rsx! {
        div { class: "dialog-backdrop", onclick: move |_| dialog.set(None),
            div { class: "dialog", role: "dialog", onclick: move |e| e.stop_propagation(),
                div { class: "dialog-title", "发版本" }
                div { class: "field",
                    label { "版本号" }
                    input { class: "input", value: "{version}", readonly: true }
                }
                div { class: "field",
                    label { "说明" }
                    textarea { class: "input", value: "{note}", oninput: move |e| note.set(e.value()) }
                }
                div { class: "hint", "只有在研且还没打 tag 的号能发。确认后给这份代码打远端 tag。没有已完成的活也能发;勾上的才打发版标签。不出包。" }
                div { class: "dialog-actions",
                    button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                    button {
                        class: "btn btn-primary",
                        disabled: !version_ok,
                        onclick: move |_| {
                            let v = version.read().trim().to_string();
                            if v.is_empty() || v.contains('(') { return; }
                            b.cmd(Command::CutRelease {
                                project_id: pid,
                                version: v,
                                note: note.read().clone(),
                                included: (*included).clone(),
                            });
                            dialog.set(None);
                        },
                        "确认 · 发版"
                    }
                }
            }
        }
    }
}

fn ship_status_row(
    label: &'static str,
    idle: &'static str,
    line: Option<ProgressLine>,
    treat_ok_as_done: bool,
    on_detail: Option<Signal<bool>>,
) -> Element {
    let (cls, spinning, text, open_dir_path, failed) = match line.as_ref() {
        None => ("ship-row--idle", false, idle.to_string(), None, false),
        Some(l) => match l.state {
            StepState::Doing => ("ship-row--doing", true, l.text.clone(), None, false),
            StepState::Ok if treat_ok_as_done => {
                ("ship-row--done", false, l.text.clone(), None, false)
            }
            StepState::Ok => (
                "ship-row--ok",
                false,
                String::new(),
                Some(l.text.clone()),
                false,
            ),
            StepState::Fail => ("ship-row--fail", false, l.text.clone(), None, true),
        },
    };
    let detail = if failed { on_detail } else { None };
    rsx! {
        div { class: "ship-row {cls}",
            if spinning {
                span { class: "ship-spin", aria_hidden: "true" }
            } else {
                span { class: "ship-dot", aria_hidden: "true" }
            }
            span { class: "ship-row-label", "{label}" }
            span { class: "ship-row-text", "{text}" }
            if let Some(dir) = open_dir_path {
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| open_artifact_dir(&dir),
                    "打开目录"
                }
            }
            if let Some(mut open) = detail {
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| open.set(true),
                    "详情"
                }
            }
        }
    }
}

fn open_artifact_dir(path: &str) {
    let path = path.trim();
    if path.is_empty() {
        return;
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer").arg(path).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(path).spawn();
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(path).spawn();
    }
}
