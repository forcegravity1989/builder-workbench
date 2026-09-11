use crate::{
    bridge::{Bridge, ChromeBusy, Panel, PanelNav, Req, STARTING_SESSION},
    vm::{CardItemVm, ProjectVm},
};
use bw::{
    command::Command,
    model::{category_from_key, category_key, IssueId, IssueKind, IssueStatus, StageKind},
};
use dioxus::prelude::*;

use super::kanban::{
    allowed_plan_targets, apply_status_move, plan_status_label, status_from_key, status_key,
    PendingMove, PendingSchedule,
};
use super::plan_dialogs::Overlay;

#[component]
pub fn DetailModal(
    p: ProjectVm,
    mut selected: Signal<Option<IssueId>>,
    mut schedule: Signal<Option<PendingSchedule>>,
    mut start: Signal<Option<IssueId>>,
    mut pending: Signal<Option<PendingMove>>,
    bridge: Bridge,
    viewing_released: bool,
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
    let mut body_val = use_signal(String::new);
    let mut assignee_val = use_signal(move || assignee_orig.clone());
    // 列表不带正文，打开时单查；用户开始编辑后，不再用异步结果覆盖输入。
    let mut body_dirty = use_signal(|| false);
    let body_show = if *body_dirty.read() {
        body_val.read().clone()
    } else {
        body_orig.clone()
    };
    let b_fetch = bridge.clone();
    use_future(move || {
        let b = b_fetch.clone();
        async move {
            b.cmd(Command::FetchIssue { id });
        }
    });
    let close = move |_| selected.set(None);

    let mr_url = (!p.mr_url_prefix.is_empty() && c.pr_number > 0)
        .then(|| format!("{}{}", p.mr_url_prefix, c.pr_number));
    let issue_url = (!p.issue_url_prefix.is_empty() && c.remote_number > 0)
        .then(|| format!("{}{}", p.issue_url_prefix, c.remote_number));
    let _place = if !c.plan_versions.is_empty() {
        format!("版本·{}", c.plan_versions.join("、"))
    } else {
        "未排期".into()
    };

    let b_assignee = bridge.clone();
    let b_sess = bridge.clone();
    let b_cat = bridge.clone();
    let b_edit = bridge.clone();
    let b_sched = bridge.clone();

    rsx! {
        Overlay {
            outer: "dialog-backdrop",
            inner: "dialog dialog-wide plan-modal",
            on_close: move |_| selected.set(None),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "详情 · #{c.number}" }
                    if let Some(label) = super::kanban::carryover_label(&c, &p.viewing_plan, viewing_released) {
                        span { class: "tag tag-warning", "{label}" }
                    }
                    input {
                        class: "input plan-modal-title-input",
                        value: "{title_val}",
                        oninput: move |e| title_val.set(e.value()),
                    }
                    button { class: "btn btn-ghost btn-quiet btn-icon plan-modal-x", onclick: close, "✕" }
                }
                div { class: "plan-modal-body",
                    textarea {
                        class: "input detail-body-text",
                        value: "{body_show}",
                        oninput: move |e| {
                            body_val.set(e.value());
                            body_dirty.set(true);
                        },
                        placeholder: "正文",
                    }
                    div { class: "plan-meta-grid",
                        div { class: "detail-row span-all",
                            div { class: "k", "链接" }
                            if c.pr_number > 0 {
                                if let Some(u) = mr_url.clone() {
                                    span { class: "link", onclick: move |_| crate::chrome::open_in_browser(&u), "MR #{c.pr_number} ↗" }
                                } else {
                                    span { "MR #{c.pr_number}" }
                                }
                            } else {
                                span { class: "hint" }
                            }
                            " · "
                            if c.remote_number > 0 {
                                if let Some(u) = issue_url.clone() {
                                    span { class: "link", onclick: move |_| crate::chrome::open_in_browser(&u), "issue #{c.remote_number} ↗" }
                                } else {
                                    span { "issue #{c.remote_number}" }
                                }
                            } else {
                                span { class: "hint", "— 只在本机" }
                            }
                        }
                        if c.kind == IssueKind::Ops {
                            div { class: "detail-row span-all",
                                div { class: "k", "类别" }
                                "周期工作"
                            }
                        } else {
                            div { class: "detail-row span-all",
                                div { class: "k", "类别" }
                                select {
                                    class: "input",
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
                        }
                        div { class: "detail-row",
                            div { class: "k", "状态" }
                            {
                                let targets = allowed_plan_targets(c.status);
                                let card = c.clone();
                                if targets.is_empty() {
                                    rsx! {
                                        select {
                                            class: "input",
                                            disabled: true,
                                            option { selected: true, "{plan_status_label(c.status)}" }
                                        }
                                    }
                                } else {
                                    rsx! {
                                        select {
                                            class: "input",
                                            onchange: move |e| {
                                                let Some(to) = status_from_key(&e.value()) else { return; };
                                                if to == card.status {
                                                    return;
                                                }
                                                apply_status_move(&card, to, start, pending);
                                                selected.set(None);
                                            },
                                            option { value: "{status_key(c.status)}", selected: true, "{plan_status_label(c.status)}" }
                                            for to in targets.iter().copied() {
                                                option { value: "{status_key(to)}", "{plan_status_label(to)}" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        div { class: "detail-row",
                            div { class: "k", "计划" }
                            select {
                                class: "input",
                                onchange: move |e| {
                                    let v = e.value();
                                    if v == "unscheduled" {
                                        b_sched.cmd(Command::ScheduleIssue { id, week_of: None });
                                    } else if let Some(pl) = v.strip_prefix("version:") {
                                        b_sched.cmd(Command::ScheduleToPlan { id, plan: pl.to_string() });
                                    }
                                },
                                option { value: "unscheduled", selected: c.plan_versions.is_empty(), "未排期" }
                                for v in p.plan_versions.iter() {
                                    {let val = format!("version:{}", v.name); let sel = c.plan_versions.contains(&v.name); rsx! { option { value: "{val}", selected: sel, "{v.name}" } }}
                                }
                            }
                        }
                        div { class: "detail-row",
                            div { class: "k", "负责人" }
                            input {
                                class: "input",
                                value: "{assignee_val}",
                                placeholder: "指派谁",
                                oninput: move |e| assignee_val.set(e.value()),
                            }
                        }
                    }
                    if matches!(
                        c.status,
                        IssueStatus::Backlog
                            | IssueStatus::Todo
                            | IssueStatus::InProgress
                            | IssueStatus::InReview
                            | IssueStatus::Blocked
                    ) {
                        div { class: "plan-review-hint", "Complete 由人确认。agent 跑完只到待评审。" }
                    }
                }
                div { class: "plan-modal-foot",
                    div { class: "row-wrap",
                        {match c.status {
                            IssueStatus::Backlog => rsx! {
                                button { class: "btn btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    schedule.set(Some(PendingSchedule { id, title: String::new() }));
                                }, "schedule" }
                                {complete_btn(&c, pending, selected)}
                            },
                            IssueStatus::Todo => rsx! {
                                button { class: "btn btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    start.set(Some(id));
                                }, "Start" }
                                {complete_btn(&c, pending, selected)}
                            },
                            IssueStatus::InProgress => rsx! {
                                button { class: "btn btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    b_sess.send(Req::SelectSession(Some(id)));
                                    nav.go(Panel::Session);
                                }, "Open" }
                                {complete_btn(&c, pending, selected)}
                            },
                            IssueStatus::InReview => rsx! {
                                button { class: "btn btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    b_sess.send(Req::SelectSession(Some(id)));
                                    nav.go(Panel::Session);
                                }, "Open" }
                                {complete_btn(&c, pending, selected)}
                            },
                            IssueStatus::Done | IssueStatus::Cancelled => rsx! {
                                button { class: "btn btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    b_sess.send(Req::SelectSession(Some(id)));
                                    nav.go(Panel::Session);
                                }, "Open" }
                            },
                            IssueStatus::Blocked => rsx! {
                                button { class: "btn btn-secondary", onclick: move |_| {
                                    selected.set(None);
                                    b_sess.send(Req::SelectSession(Some(id)));
                                    nav.go(Panel::Session);
                                }, "Open" }
                                {complete_btn(&c, pending, selected)}
                            },
                        }}
                    }
                    div { class: "row",
                        button {
                            class: "btn btn-primary",
                            onclick: move |_| {
                                let t = title_val.read().trim().to_string();
                                let b = if *body_dirty.read() {
                                    body_val.read().clone()
                                } else {
                                    body_orig.clone()
                                };
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

#[component]
pub fn StartModal(
    p: ProjectVm,
    sid: IssueId,
    mut start: Signal<Option<IssueId>>,
    bridge: Bridge,
) -> Element {
    let nav = use_context::<PanelNav>();
    let start_busy = use_context::<ChromeBusy>();
    let picked = pick_card(&p, sid);
    let init_cat = picked.as_ref().and_then(|c| {
        StageKind::ALL
            .iter()
            .copied()
            .find(|k| k.label() == c.category)
    });
    let mut cat_sel = use_signal(move || init_cat);
    let Some(c) = picked else {
        return rsx! {};
    };
    let name = if c.branch.is_empty() {
        format!("bw/issue-{}", c.number)
    } else {
        c.branch.clone()
    };
    let is_ops = c.kind == IssueKind::Ops;
    let can_start = is_ops || cat_sel.read().is_some();
    let current_cat = c.category.clone();
    let b_run = bridge.clone();
    let b_cat = bridge.clone();
    let id = c.id;
    rsx! {
        Overlay {
            outer: "dialog-backdrop",
            inner: "dialog dialog-wide plan-modal",
            on_close: move |_| start.set(None),
                div { class: "plan-modal-head",
                    div { class: "plan-modal-tag", "worktree" }
                    div { class: "plan-modal-title", "Start · #{c.number}" }
                    button {
                        class: "btn btn-ghost btn-quiet btn-icon plan-modal-x",
                        onclick: move |_| start.set(None),
                        "✕"
                    }
                }
                div { class: "plan-modal-body",
                    div { class: "detail-row", div { class: "k", "worktree 名" }, "{name}" }
                    div { class: "detail-row", div { class: "k", "基于" }, "main" }
                    if is_ops {
                        {row("类别", "周期工作")}
                    } else {
                        div { class: "field",
                            label { "类别" }
                            select {
                                class: "input",
                                onchange: move |e| cat_sel.set(category_from_key(&e.value())),
                                option { value: "", selected: cat_sel.read().is_none(), "还没选" }
                                for cat in StageKind::ALL {
                                    option {
                                        key: "{category_key(cat)}",
                                        value: "{category_key(cat)}",
                                        selected: cat_sel.read().is_some_and(|s| s == cat),
                                        "{cat.label()}"
                                    }
                                }
                            }
                        }
                    }
                    div { class: "hint", "确认后创建工作树，将 Issue 设为进行中并打开会话。" }
                }
                div { class: "plan-modal-foot",
                    span {}
                    div { class: "row",
                        button { class: "btn btn-secondary", onclick: move |_| start.set(None), "取消" }
                        button {
                            class: "btn btn-primary",
                            disabled: !can_start,
                            onclick: move |_| {
                                if let Some(cat) = *cat_sel.read() {
                                    if current_cat != cat.label() {
                                        b_cat.cmd(Command::SetIssueCategory { id, category: cat });
                                    }
                                }
                                start_busy.set(STARTING_SESSION);
                                b_run.cmd(Command::RunIssue { id });
                                start.set(None);
                                nav.go(Panel::Session);
                            },
                            "Start"
                        }
                    }
                }
        }
    }
}

fn complete_btn(
    c: &CardItemVm,
    mut pending: Signal<Option<PendingMove>>,
    mut selected: Signal<Option<IssueId>>,
) -> Element {
    let id = c.id;
    let title = c.title.clone();
    let from = c.status;
    let pr = c.pr_number;
    let open = c.has_open_mr;
    rsx! {
        button {
            class: "btn btn-secondary",
            onclick: move |_| {
                pending.set(Some(PendingMove {
                    id,
                    title: title.clone(),
                    from,
                    to: IssueStatus::Done,
                    pr_number: pr,
                    has_open_mr: open,
                }));
                selected.set(None);
            },
            "Complete"
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
