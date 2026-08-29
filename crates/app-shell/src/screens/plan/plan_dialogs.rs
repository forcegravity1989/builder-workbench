//! 计划屏的弹窗:新建issue / 创建版本 / 排期 / 作废确认 / 发版本。
//! 全部屏幕居中(modal-backdrop + plan-modal)。

use crate::bridge::Bridge;
use crate::vm::{CardItemVm, ProjectVm};
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
    Release(ReleaseDraft),
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
                    div { class: "cfg-readonly-note", "新建的 issue 进待办池·未排期;创建后同步到 codehub。" }
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
                                b.cmd(Command::CreateIssue {
                                    project_id: pid,
                                    title: t,
                                    body: body.read().trim().to_string(),
                                    category: Some(*category.read()),
                                    kind: IssueKind::Business,
                                    origin: IssueOrigin::Human,
                                    week_of: String::new(),
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

/// 创建版本(自定义计划包)弹窗。版本名 + 时间 + 说明 + 勾选未排期 issue。
#[component]
pub fn CreateVersionDialog(
    p: ProjectVm,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    // 草稿存组件局部 state(use_signal),弹窗关了就丢。
    let mut name = use_signal(String::new);
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
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| dialog.set(None),
            div { class: "modal plan-modal", onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "自定义计划包" }
                    div { class: "plan-modal-title", "创建版本" }
                    button { class: "plan-modal-x", onclick: move |_| dialog.set(None), "✕" }
                }
                div { class: "plan-modal-body",
                    div { class: "formrow",
                        label { class: "label", "版本名 *" }
                        input { class: "input", value: "{name}", placeholder: "例如 MVP收尾",
                            oninput: move |e| name.set(e.value()) }
                    }
                    div { class: "formrow",
                        label { class: "label", "时间" }
                        div { class: "cv-field-2",
                            div { span { class: "sub", "开始" },
                                input { class: "input", r#type: "date", value: "{start}",
                                    oninput: move |e| start.set(e.value()) } }
                            div { span { class: "sub", "结束" },
                                input { class: "input", r#type: "date", value: "{due}",
                                    oninput: move |e| due.set(e.value()) } }
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
                        "版本是自定义计划包,与发版号(如 {p.card.current_version})不是一回事。"
                    }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { style: "display:flex;gap:8px;",
                        button { class: "btn btn-secondary", onclick: move |_| dialog.set(None), "取消" }
                        button {
                            class: "btn btn-primary",
                            disabled: !name_ok,
                            onclick: move |_| {
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

/// 排期弹窗(拖未排期卡到已排期段触发):下拉选未结束周 / 已建版本。
#[component]
pub fn ScheduleDialog(
    p: ProjectVm,
    ps: PendingSchedule,
    mut schedule: Signal<Option<PendingSchedule>>,
    bridge: Bridge,
) -> Element {
    let b = bridge.clone();
    let id = ps.id;
    let open_weeks: Vec<&crate::vm::WeekVm> = p
        .weeks
        .iter()
        .filter(|w| w.week >= p.current_week)
        .collect();
    // 默认选本周
    let default_sel = format!("week:{}", p.current_week);
    let mut sel = use_signal(move || default_sel.clone());
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| schedule.set(None),
            div { class: "modal", onclick: move |e| e.stop_propagation(),
                h3 { "排期" }
                div { style: "font-size:13px;line-height:1.7;color:var(--ink-2);",
                    "把「{ps.title}」排进哪个未结束的周计划或版本。"
                }
                div { class: "formrow",
                    label { class: "label", "排进" }
                    select {
                        class: "select",
                        onchange: move |e| sel.set(e.value()),
                        for w in open_weeks {
                            {
                                let label = if w.week == p.current_week {
                                    format!("周计划 · {} (本周)", w.week)
                                } else {
                                    format!("周计划 · {}", w.week)
                                };
                                let val = format!("week:{}", w.week);
                                let sel = w.week == p.current_week;
                                rsx! {
                                    option { value: "{val}", selected: sel, "{label}" }
                                }
                            }
                        }
                        for v in p.plan_versions.iter() {
                            {let val = format!("version:{}", v.name); rsx! { option { value: "{val}", "版本 · {v.name}" } }}
                        }
                    }
                }
                div { class: "cfg-readonly-note",
                    "排进周计划 = 打 bw:week 标签;排进版本 = 划归到自定义版本。两者都让它从未排期变已排期。"
                }
                div { class: "modal-actions",
                    button { class: "btn btn-secondary", onclick: move |_| schedule.set(None), "取消" }
                    button {
                        class: "btn btn-primary",
                        onclick: move |_| {
                            let s = sel.read().clone();
                            if let Some(rest) = s.strip_prefix("week:") {
                                b.cmd(Command::ScheduleIssue { id, week_of: Some(rest.to_string()) });
                            } else if let Some(rest) = s.strip_prefix("version:") {
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

/// 作废/状态转移确认框(拖卡片进状态列的旧路径,详情弹窗里点 Complete/阻塞
/// 不走这里)。保留给直接发 TransitionIssue 的场景。
pub fn confirm_dialog(
    pm: PendingMove,
    mut pending: Signal<Option<PendingMove>>,
    bridge: &Bridge,
) -> Element {
    let b = bridge.clone();
    let pm2 = pm.clone();
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| pending.set(None),
            div { class: "modal", onclick: move |e| e.stop_propagation(),
                h3 { "确认一下" }
                div { style: "font-size:13px;line-height:1.85;color:var(--ink-2);margin-bottom:8px;",
                    "把「{pm.title}」从「{pm.from.label()}」移到「{pm.to.label()}」。"
                }
                div { class: "modal-actions",
                    button { class: "btn btn-secondary", onclick: move |_| pending.set(None), "算了" }
                    button {
                        class: "btn btn-primary",
                        onclick: move |_| {
                            if pm2.to == IssueStatus::Done {
                                b.cmd(Command::MergeAndSettle { id: pm2.id });
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

/// 发版本弹窗(周视图)。
#[component]
pub fn ReleaseDialog(
    draft: ReleaseDraft,
    mut dialog: Signal<Option<DialogKind>>,
    bridge: Bridge,
) -> Element {
    let mut version = use_signal(move || draft.version.clone());
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
                    input { class: "input", value: "{version}", placeholder: "例如 v0.2",
                        oninput: move |e| version.set(e.value()) }
                }
                div { class: "formrow",
                    label { class: "label", "说明" }
                    textarea { class: "textarea", value: "{note}", oninput: move |e| note.set(e.value()) }
                }
                div { class: "cfg-readonly-note", "确认后在代码平台建 Release,再给本周已完成的活打发版标签。" }
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
