//! 详情弹窗(屏幕居中)。点卡片打开,三段式:头/体/底。字段精简,主操作按
//! 状态互斥。Start 是只读子弹窗,确认即 RunIssue。

use crate::bridge::{Bridge, Panel, PanelNav, Req};
use crate::vm::{CardItemVm, ProjectVm};
use bw::command::Command;
use bw::model::{category_from_key, category_key, IssueId, IssueStatus, StageKind};
use dioxus::prelude::*;

use super::kanban::PendingSchedule;

#[component]
pub fn DetailModal(
    p: ProjectVm,
    mut selected: Signal<Option<IssueId>>,
    mut schedule: Signal<Option<PendingSchedule>>,
    mut start: Signal<Option<IssueId>>,
    bridge: Bridge,
) -> Element {
    let nav = use_context::<PanelNav>();
    let picked = selected.read().and_then(|id| pick_card(&p, id));
    let Some(c) = picked else {
        return rsx! {};
    };
    let id = c.id;
    let title_orig = c.title.clone();
    let body_orig = c.body.clone();
    let assignee_orig = c.assignee.clone();
    let mut title_val = use_signal(move || title_orig.clone());
    let mut body_val = use_signal(move || body_orig.clone());
    let mut assignee_val = use_signal(move || assignee_orig.clone());
    let close = move |_| selected.set(None);

    let mr_url = (!p.mr_url_prefix.is_empty() && c.pr_number > 0)
        .then(|| format!("{}{}", p.mr_url_prefix, c.pr_number));
    let issue_url = (!p.issue_url_prefix.is_empty() && c.remote_number > 0)
        .then(|| format!("{}{}", p.issue_url_prefix, c.remote_number));
    let _place = if !c.week_of.is_empty() {
        c.week_of.clone()
    } else if !c.plan_version.is_empty() {
        format!("版本·{}", c.plan_version)
    } else {
        "未排期".into()
    };

    let b_complete = bridge.clone();
    let b_block = bridge.clone();
    let b_cancel = bridge.clone();
    let b_assignee = bridge.clone();
    let b_sess = bridge.clone();
    let b_cat = bridge.clone();
    let b_edit = bridge.clone();
    let b_sched = bridge.clone();

    rsx! {
        div { class: "modal-backdrop", onclick: close,
            div { class: "modal plan-modal", onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "详情 · #{c.number}" }
                    input {
                        class: "input plan-modal-title-input",
                        value: "{title_val}",
                        oninput: move |e| title_val.set(e.value()),
                    }
                    button { class: "plan-modal-x", onclick: close, "✕" }
                }
                div { class: "plan-modal-body",
                    textarea {
                        class: "textarea detail-body-text",
                        value: "{body_val}",
                        oninput: move |e| body_val.set(e.value()),
                        placeholder: "正文",
                    }
                    div { class: "plan-meta-grid",
                        div { class: "detail-row", style: "grid-column:1/-1;",
                            div { class: "k", "链接" }
                            if c.pr_number > 0 {
                                if let Some(u) = mr_url.clone() {
                                    span { class: "detail-link", onclick: move |_| crate::chrome::open_in_browser(&u), "MR #{c.pr_number} ↗" }
                                } else {
                                    span { "MR #{c.pr_number}" }
                                }
                            } else {
                                span { style: "color:var(--ink-3);" }
                            }
                            " · "
                            if c.remote_number > 0 {
                                if let Some(u) = issue_url.clone() {
                                    span { class: "detail-link", onclick: move |_| crate::chrome::open_in_browser(&u), "issue #{c.remote_number} ↗" }
                                } else {
                                    span { "issue #{c.remote_number}" }
                                }
                            } else {
                                span { style: "color:var(--ink-3);", "— 只在本机" }
                            }
                        }
                        if c.kind != "业务活" {
                            div { class: "detail-row",
                                div { class: "k", "类别" }
                                select {
                                    class: "select",
                                    style: "width:100%;",
                                    onchange: move |e| {
                                        if let Some(cat) = category_from_key(&e.value()) {
                                            b_cat.cmd(Command::SetIssueCategory { id, category: cat });
                                        }
                                    },
                                    option { value: "", selected: c.category == "—", "还没选" }
                                    for cat in StageKind::ALL {
                                        option { key: "{category_key(cat)}", value: "{category_key(cat)}", selected: c.category == cat.label(), "{cat.label()}" }
                                    }
                                }
                            }
                        } else {
                            {row("类别", "运作")}
                        }
                        div { class: "detail-row",
                            div { class: "k", "计划" }
                            select {
                                class: "select",
                                style: "width:100%;",
                                onchange: move |e| {
                                    let v = e.value();
                                    if v == "unscheduled" {
                                        b_sched.cmd(Command::ScheduleIssue { id, week_of: None });
                                    } else if let Some(w) = v.strip_prefix("week:") {
                                        b_sched.cmd(Command::ScheduleIssue { id, week_of: Some(w.to_string()) });
                                    } else if let Some(pl) = v.strip_prefix("version:") {
                                        b_sched.cmd(Command::ScheduleToPlan { id, plan: pl.to_string() });
                                    }
                                },
                                option { value: "unscheduled", selected: c.week_of.is_empty() && c.plan_version.is_empty(), "未排期" }
                                for w in p.weeks.iter().filter(|w| w.week >= p.current_week) {
                                    {let val = format!("week:{}", w.week); let sel = c.week_of == w.week; rsx! { option { value: "{val}", selected: sel, "周 · {w.week}" } }}
                                }
                                for v in p.plan_versions.iter() {
                                    {let val = format!("version:{}", v.name); let sel = c.plan_version == v.name; rsx! { option { value: "{val}", selected: sel, "版本 · {v.name}" } }}
                                }
                            }
                        }
                        div { class: "detail-row",
                            div { class: "k", "负责人" }
                            input {
                                class: "input",
                                style: "width:100%;",
                                value: "{assignee_val}",
                                placeholder: "指派谁",
                                oninput: move |e| assignee_val.set(e.value()),
                            }
                        }
                    }
                    if c.status == IssueStatus::InReview {
                        div { class: "plan-review-hint", "Complete 由人确认。agent 跑完只到待评审。" }
                    }
                }
                div { class: "plan-modal-foot",
                    div { style: "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;",
                        {match c.status {
                            IssueStatus::Backlog => rsx! {
                                button { class: "btn btn-sm btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    schedule.set(Some(PendingSchedule { id, title: String::new() }));
                                }, "schedule" }
                            },
                            IssueStatus::Todo => rsx! {
                                button { class: "btn btn-sm btn-primary", onclick: move |_| start.set(Some(id)), "Start" }
                            },
                            IssueStatus::InProgress => rsx! {
                                button { class: "btn btn-sm btn-secondary", onclick: move |_| {
                                    b_sess.send(Req::SelectSession(Some(id)));
                                    nav.go(Panel::Session);
                                }, "Open" }
                            },
                            IssueStatus::InReview => rsx! {
                                button { class: "btn btn-sm btn-primary", onclick: move |_| b_complete.cmd(Command::MergeAndSettle { id }), "Complete" }
                            },
                            IssueStatus::Done => rsx! { span { style: "color:var(--ink-3);", "已完成并结清" } },
                            IssueStatus::Blocked => rsx! {
                                button { class: "btn btn-sm btn-secondary", onclick: move |_| {
                                    b_sess.send(Req::SelectSession(Some(id)));
                                    nav.go(Panel::Session);
                                }, "Open" }
                            },
                            IssueStatus::Cancelled => rsx! { span { style: "color:var(--ink-3);", "已取消" } },
                        }}
                        {match c.status {
                            IssueStatus::Done | IssueStatus::Cancelled => rsx! {},
                            _ => rsx! {
                                button { class: "btn btn-sm btn-secondary", onclick: move |_| b_block.cmd(Command::BlockIssue { id, reason: "在计划屏手动标为阻塞".into() }), "阻塞" }
                            },
                        }}
                        {match c.status {
                            IssueStatus::Done | IssueStatus::Cancelled => rsx! {},
                            _ => rsx! {
                                button { class: "btn btn-sm btn-secondary", onclick: move |_| b_cancel.cmd(Command::CancelIssue { id, reason: "在计划屏作废".into() }), "Cancel" }
                            },
                        }}
                    }
                    div { style: "display:flex;gap:8px;justify-content:flex-end;",
                        button {
                            class: "btn btn-sm btn-primary",
                            onclick: move |_| {
                                let t = title_val.read().trim().to_string();
                                let b = body_val.read().clone();
                                b_edit.cmd(Command::EditIssue { id, title: t, body: b });
                                let a = assignee_val.read().trim().to_string();
                                if a != c.assignee {
                                    b_assignee.cmd(Command::SetIssueAssignee { id, assignee: a });
                                }
                                selected.set(None);
                            },
                            "保存"
                        }
                    }
                }
            }
        }
    }
}

pub fn start_modal(
    p: &ProjectVm,
    sid: IssueId,
    bridge: &Bridge,
    mut start: Signal<Option<IssueId>>,
    nav: &PanelNav,
) -> Element {
    let c = pick_card(p, sid);
    let Some(c) = c else {
        return rsx! {};
    };
    let name = if c.branch.is_empty() {
        format!("bw/issue-{}", c.number)
    } else {
        c.branch.clone()
    };
    let b_run = bridge.clone();
    let id = c.id;
    let nav = *nav;
    rsx! {
        div { class: "modal-backdrop", onclick: move |_| start.set(None),
            div { class: "modal plan-modal", onclick: move |e| e.stop_propagation(),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "worktree" }
                    div { class: "plan-modal-title", "Start · #{c.number}" }
                    button { class: "plan-modal-x", onclick: move |_| start.set(None), "✕" }
                }
                div { class: "plan-modal-body",
                    div { class: "detail-row", div { class: "k", "worktree 名" }, "{name}" }
                    div { class: "detail-row", div { class: "k", "基于" }, "main" }
                    div { class: "cfg-readonly-note", "确认后建 worktree,issue 切到进行中,并打开会话。" }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { style: "display:flex;gap:8px;",
                        button { class: "btn btn-secondary", onclick: move |_| start.set(None), "取消" }
                        button { class: "btn btn-primary", onclick: move |_| {
                            b_run.cmd(Command::RunIssue { id });
                            start.set(None);
                            nav.go(Panel::Session);
                        }, "Start" }
                    }
                }
            }
        }
    }
}

fn pick_card(p: &ProjectVm, id: IssueId) -> Option<CardItemVm> {
    p.board
        .columns
        .iter()
        .flat_map(|c| c.cards.iter())
        .find(|c| c.id == id)
        .cloned()
}

fn row(k: &str, v: &str) -> Element {
    rsx! { div { class: "detail-row", div { class: "k", "{k}" }, "{v}" } }
}
