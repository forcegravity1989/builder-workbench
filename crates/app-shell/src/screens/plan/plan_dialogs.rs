//! 计划屏的弹窗:新建issue / 创建版本 / 排期 / 作废确认 / 出包 / 发版本。
//! 全部屏幕居中(modal-backdrop + plan-modal)。

use crate::bridge::Bridge;
use crate::vm::{CardItemVm, ProjectVm};
use bw::app::{ProgressLine, StepState};
use bw::command::Command;
use bw::model::{
    category_from_key, category_key, IssueId, IssueKind, IssueOrigin, IssueStatus, StageKind,
};
use dioxus::prelude::*;

use super::kanban::{PendingMove, PendingSchedule};

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
        div { class: "modal-backdrop", onclick: move |_| dialog.set(None),
            div { class: "modal plan-modal", onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "新建" }
                    div { class: "plan-modal-title", "新建 issue" }
                    button { class: "plan-modal-x", onclick: move |_| dialog.set(None), "✕" }
                }
                div { class: "plan-modal-body",
                    div { class: "formrow",
                        label { class: "label", "标题 *" }
                        input { class: "input", value: "{title}", placeholder: "这张活要干什么",
                            oninput: move |e| title.set(e.value()) }
                    }
                    div { class: "formrow",
                        label { class: "label", "正文" }
                        textarea { class: "textarea", value: "{body}", placeholder: "要做成什么、边界。可空",
                            oninput: move |e| body.set(e.value()) }
                    }
                    div { class: "formrow",
                        label { class: "label", "类别" }
                        select { class: "select",
                            onchange: move |e| { if let Some(c) = category_from_key(&e.value()) { category.set(c); } },
                            for c in StageKind::ALL {
                                option { key: "{category_key(c)}", value: "{category_key(c)}", selected: *category.read() == c, "{c.label()}" }
                            }
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "负责人" }
                        input { class: "input", value: "{assignee}", placeholder: "指派谁(可空)",
                            oninput: move |e| assignee.set(e.value()) }
                    }
                    div { class: "cfg-readonly-note", "{where_note}" }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { style: "display:flex;gap:8px;",
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

/// 创建版本弹窗。只要 `v0.x`。
#[component]
pub fn CreateVersionDialog(
    p: ProjectVm,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    // 草稿存组件局部 state(use_signal),弹窗关了就丢。
    let mut name = use_signal(|| p.suggested_next.clone());
    let mut start = use_signal(String::new);
    let mut due = use_signal(String::new);
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
    let dates_ok = !start_v.is_empty() && !due_v.is_empty();
    let range_bad = dates_ok && start_v > due_v;
    let name_v = name.read().trim().to_string();
    let taken = p.plan_versions.iter().any(|v| v.name == name_v)
        || p.last_released == name_v
        || p.unreleased.iter().any(|s| s == &name_v);
    let shape_ok = bw::version::is_v0x(&name_v);
    let can_create = name_ok && dates_ok && !range_bad && shape_ok && !taken;
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| dialog.set(None),
            div { class: "modal plan-modal", onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "版本" }
                    div { class: "plan-modal-title", "创建版本" }
                    button { class: "plan-modal-x", onclick: move |_| dialog.set(None), "✕" }
                }
                div { class: "plan-modal-body",
                    div { class: "formrow",
                        label { class: "label", "版本名 *" }
                        input { class: "input", value: "{name}", placeholder: "例如 v0.3",
                            oninput: move |e| name.set(e.value()) }
                        if !name_v.is_empty() && !shape_ok {
                            div { class: "field-err", "版本名必须是 v0.1 这种" }
                        } else if taken {
                            div { class: "field-err", "{name_v} 已经有了" }
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "时间" }
                        div { class: "cv-field-2",
                            div {
                                span { class: "sub", "开始 " span { class: "asterisk", "*" } }
                                input {
                                    class: if range_bad { "input invalid" } else { "input" },
                                    r#type: "date",
                                    value: "{start}",
                                    oninput: move |e| start.set(e.value()),
                                }
                            }
                            div {
                                span { class: "sub", "结束 " span { class: "asterisk", "*" } }
                                input {
                                    class: if range_bad { "input invalid" } else { "input" },
                                    r#type: "date",
                                    value: "{due}",
                                    oninput: move |e| due.set(e.value()),
                                }
                            }
                        }
                        if range_bad {
                            div { class: "field-err", "开始不能晚于结束" }
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "说明" }
                        textarea { class: "textarea", value: "{note}", placeholder: "这个版本要收口什么",
                            oninput: move |e| note.set(e.value()) }
                    }
                    div { class: "formrow",
                        label { class: "label", "划归的 issue" }
                        div { class: "check-list",
                            if unassigned.is_empty() {
                                div { class: "cfg-readonly-note", "当前没有未排期的活可划归。" }
                            }
                            for c in unassigned.iter() {
                                {check_row(c, picked)}
                            }
                        }
                    }
                    div { class: "cfg-readonly-note",
                        {
                            let last = if p.last_released.is_empty() { "没有" } else { p.last_released.as_str() };
                            let unrel = if p.unreleased.is_empty() { "没有".to_string() } else { p.unreleased.join("、") };
                            format!("上一发 · {last}　未发 · {unrel}　推荐 · {}", p.suggested_next)
                        }
                    }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { style: "display:flex;gap:8px;",
                        button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                        button {
                            class: "btn btn-primary",
                            disabled: !can_create,
                            onclick: move |_| {
                                let start_v = start.read().clone();
                                let due_v = due.read().clone();
                                if name.read().trim().is_empty()
                                    || start_v.is_empty()
                                    || due_v.is_empty()
                                    || start_v > due_v
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
        div { class: "modal-backdrop", onclick: move |_| schedule.set(None),
            div { class: "modal", onclick: move |e| e.stop_propagation(),
                h3 { "排期" }
                div { style: "font-size:13px;line-height:1.7;color:var(--ink-2);",
                    "把「{ps.title}」排进一个版本。一张活只属于一个槽。"
                }
                div { class: "formrow",
                    label { class: "label", "排进" }
                    select {
                        class: "select",
                        onchange: move |e| sel.set(e.value()),
                        for v in p.plan_versions.iter() {
                            {let val = format!("version:{}", v.name); rsx! { option { value: "{val}", "{v.name}" } }}
                        }
                    }
                }
                div { class: "cfg-readonly-note",
                    "打 bw:plan:。旧周标签只读回显示,排期不再新写。"
                }
                div { class: "modal-actions",
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
    let to_label = match pm.to {
        IssueStatus::Cancelled => "拒绝",
        IssueStatus::Blocked => "阻塞",
        other => other.label(),
    };
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
        div { class: "modal-backdrop", onclick: move |_| pending.set(None),
            div { class: "modal", onclick: move |e| e.stop_propagation(),
                h3 { "确认一下" }
                div { style: "font-size:13px;line-height:1.85;color:var(--ink-2);margin-bottom:8px;",
                    "把「{pm.title}」从「{pm.from.label()}」移到「{to_label}」。"
                }
                if pm.to == IssueStatus::Done && !pm.has_open_mr {
                    div { style: "font-size:13px;line-height:1.85;color:var(--ink-2);margin-bottom:8px;",
                        "没有开着的 MR。可能已经在网页合过了。确认后只关这张 issue,不会再去合。"
                    }
                }
                if need_reason {
                    div { class: "formrow",
                        label { class: "label", "{reason_label}" }
                        textarea {
                            class: "textarea",
                            rows: "3",
                            placeholder: "{reason_hint}",
                            oninput: move |e| reason.set(e.value()),
                        }
                    }
                }
                div { class: "modal-actions",
                    button { class: "btn btn-secondary", onclick: move |_| pending.set(None), "算了" }
                    button {
                        class: "btn btn-primary",
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
        .filter(|v| bw::version::is_v0x(&v.name) && !v.released)
        .map(|v| v.name.clone())
        .collect();
    let default_sel = versions.first().cloned().unwrap_or_default();
    let mut sel = use_signal(move || default_sel.clone());
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| dialog.set(None),
            div { class: "modal plan-modal", onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "删除版本" }
                    button { class: "plan-modal-x", onclick: move |_| dialog.set(None), "✕" }
                }
                div { class: "plan-modal-body",
                    div { class: "formrow",
                        label { class: "label", "选版本" }
                        select {
                            class: "select",
                            onchange: move |e| sel.set(e.value()),
                            for v in versions.iter() {
                                option { value: "{v}", "{v}" }
                            }
                        }
                    }
                    div { class: "cfg-readonly-note", "确认后删掉 codehub 里程碑,issue 上的 bw:plan 标签也会摘掉。" }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { style: "display:flex;gap:8px;",
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
#[component]
pub fn PackDialog(
    draft: PackDraft,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    let version = use_signal(move || draft.version.clone());
    let mut packing = use_signal(|| false);
    let mut finished = use_signal(|| false);
    let mut pack_line = use_signal(|| None::<ProgressLine>);
    let mut e2e_line = use_signal(|| None::<ProgressLine>);
    let pid = draft.project_id;
    let b = bridge.clone();
    let version_ok = {
        let t = version.read().trim().to_string();
        !t.is_empty() && !t.contains('(')
    };

    let prog = bridge.progress.clone();
    use_future(move || {
        let mut rx = prog.subscribe();
        async move {
            while let Ok(line) = rx.recv().await {
                match line.step {
                    21 => {
                        let fail = line.state == StepState::Fail;
                        pack_line.set(Some(line));
                        if fail {
                            packing.set(false);
                            finished.set(true);
                        }
                    }
                    22 if line.state != StepState::Doing => {
                        e2e_line.set(Some(line));
                        packing.set(false);
                        finished.set(true);
                    }
                    22 => e2e_line.set(Some(line)),
                    _ => {}
                }
            }
        }
    });

    let busy = *packing.read();
    let done = *finished.read();
    let close_label = if done { "关闭" } else { "取消" };
    let pack = pack_line.read().clone();
    let e2e = e2e_line.read().clone();
    rsx! {
        div {
            class: "modal-backdrop",
            onclick: move |_| {
                if !*packing.read() {
                    dialog.set(None);
                }
            },
            div { class: "modal", onclick: move |e| e.stop_propagation(),
                h3 { "出包" }
                div { class: "formrow",
                    label { class: "label", "版本号" }
                    input { class: "input", value: "{version}", readonly: true }
                }
                div { class: "ship-rows",
                    {ship_status_row("出包", "还没开始", pack.clone(), false)}
                    {ship_status_row("验包", "出包过了再验", e2e.clone(), true)}
                }
                div { class: "cfg-readonly-note",
                    "确认后先出包、再对包装好的安装包做验收。不建远端 Release,也不打发版标签。"
                }
                div { class: "modal-actions",
                    if done || !busy {
                        button {
                            class: "btn btn-secondary",
                            onclick: move |_| dialog.set(None),
                            "{close_label}"
                        }
                    }
                    if !busy && !done {
                        button {
                            class: "btn btn-primary",
                            disabled: !version_ok,
                            onclick: move |_| {
                                let v = version.read().trim().to_string();
                                if v.is_empty() || v.contains('(') { return; }
                                pack_line.set(None);
                                e2e_line.set(None);
                                finished.set(false);
                                packing.set(true);
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
    let included_empty = included.is_empty();
    let included = std::rc::Rc::new(included);
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| dialog.set(None),
            div { class: "modal", onclick: move |e| e.stop_propagation(),
                h3 { "发版本" }
                div { class: "formrow",
                    label { class: "label", "版本号" }
                    input { class: "input", value: "{version}", readonly: true }
                }
                div { class: "formrow",
                    label { class: "label", "说明" }
                    textarea { class: "textarea", value: "{note}", oninput: move |e| note.set(e.value()) }
                }
                div { class: "cfg-readonly-note", "确认后在代码平台建 Release,再给本版本已完成的活打发版标签。不出包。" }
                div { class: "modal-actions",
                    button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                    button {
                        class: "btn btn-primary",
                        disabled: !version_ok || included_empty,
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
) -> Element {
    let (cls, spinning, text, open_dir_path) = match line.as_ref() {
        None => ("ship-row--idle", false, idle.to_string(), None),
        Some(l) => match l.state {
            StepState::Doing => ("ship-row--doing", true, l.text.clone(), None),
            StepState::Ok if treat_ok_as_done => ("ship-row--done", false, l.text.clone(), None),
            StepState::Ok => ("ship-row--ok", false, String::new(), Some(l.text.clone())),
            StepState::Fail => ("ship-row--fail", false, l.text.clone(), None),
        },
    };
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
                    class: "btn btn-sm",
                    onclick: move |_| open_artifact_dir(&dir),
                    "打开目录"
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
