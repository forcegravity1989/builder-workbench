//! 项目内 · 计划。结构照 `docs/hifi/plan.html` 的 `midBar`/`kanban`/
//! `detail`/`listView`/弹窗排:右上角下拉(全部 issue / 各 `v0.x`)+ 中栏
//! (工具条 + 版本目标/进度条/运作活,或列表视图)+ 四列看板。
//! 详情与弹窗都是屏幕居中浮层。
//!
//! 看板四列:待办(未排期/已排期)→ 进行中 → 待处理(待评审/阻塞)→ 已完成
//! (完成/拒绝)。两段列默认显示第一段,点子标题切到第二段。卡面无开工按钮,
//! 开工/排期/Complete 等入口在详情弹窗。

mod detail;
mod kanban;
mod list_view;
mod plan_dialogs;

use crate::{
    bridge::{Bridge, PanelNav, Req},
    vm::ProjectVm,
};
use bw::{command::Command, model::IssueId};
use dioxus::prelude::*;

use detail::{DetailModal, StartModal};
use kanban::{board, PendingMove, PendingReject, PendingSchedule};
use plan_dialogs::{
    ConfirmMoveDialog, CreateVersionDialog, DeleteVersionDialog, DialogKind, NewIssueDialog,
    NewIssueDraft, PackDialog, PackDraft, PackJob, RejectMoveDialog, ReleaseDialog, ReleaseDraft,
    ScheduleDialog,
};

/// 列表/看板视图模式。
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ViewMode {
    Board,
    List,
}

/// 列表筛选(对齐 opt:listFilter)。
#[derive(Clone, PartialEq)]
pub struct ListFilter {
    pub preset: String, // open | assigned | mine
    pub plan: String,
    pub stage: String, // IssueStatus key
    pub q: String,
}

impl Default for ListFilter {
    fn default() -> Self {
        Self {
            preset: "open".into(),
            plan: String::new(),
            stage: String::new(),
            q: String::new(),
        }
    }
}

impl ListFilter {
    fn keep(&self, c: &crate::vm::CardItemVm, current_user: &str) -> bool {
        if self.preset == "assigned" && c.assignee != current_user {
            return false;
        }
        if self.preset == "mine" && c.author != current_user {
            return false;
        }
        // open 预设不过滤(显示全部);assigned/mine 已过滤
        if !self.plan.is_empty() {
            if self.plan == "unscheduled" {
                if !c.plan_versions.is_empty() {
                    return false;
                }
            } else if !c.plan_versions.contains(&self.plan) {
                return false;
            }
        }
        if !self.stage.is_empty() && format!("{:?}", c.status) != self.stage {
            return false;
        }
        if !(self.q.is_empty()
            || c.title.to_lowercase().contains(&self.q.to_lowercase())
            || c.assignee.to_lowercase().contains(&self.q.to_lowercase()))
        {
            return false;
        }
        true
    }
}

/// 「全部 issue」视图上的筛选(保留给 board 用,现 board 不再筛)。
#[derive(Clone, Default, PartialEq)]
struct Filters {
    category: String,
    version: String,
    origin: String,
    keyword: String,
}

impl Filters {
    fn keep(&self, c: &crate::vm::CardItemVm) -> bool {
        (self.category.is_empty() || c.category == self.category)
            && (self.version.is_empty() || c.version == self.version)
            && (self.origin.is_empty() || c.origin == self.origin)
            && (self.keyword.is_empty()
                || c.title
                    .to_lowercase()
                    .contains(&self.keyword.to_lowercase()))
    }
}

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let (p, bridge) = (&p, &bridge);
    let dragging = use_signal(|| None::<crate::vm::CardItemVm>);
    let pending = use_signal(|| None::<PendingMove>);
    let selected = use_signal(|| None::<IssueId>);
    let schedule = use_signal(|| None::<PendingSchedule>);
    let start = use_signal(|| None::<IssueId>);
    let reject = use_signal(|| None::<PendingReject>);
    let dialog = use_signal(|| None::<DialogKind>);
    let mut pack_job = use_signal(|| PackJob {
        packing: bridge.pack_ctl.in_flight(),
        version: bridge.pack_ctl.version().unwrap_or_default(),
        ..PackJob::default()
    });
    let view_mode = use_signal(|| ViewMode::Board);
    let list_filter = use_signal(ListFilter::default);
    let col_seg = use_signal(std::collections::HashMap::<String, String>::new);
    let nav = use_context::<PanelNav>();
    let viewing_released = p
        .plan_versions
        .iter()
        .find(|v| v.name == p.viewing_plan)
        .is_some_and(|v| v.released);

    let prog = bridge.progress.clone();
    use_future(move || {
        let mut rx = prog.subscribe();
        async move {
            while let Ok(line) = rx.recv().await {
                pack_job.with_mut(|job| job.apply_progress(line));
            }
        }
    });

    let rows: Vec<&crate::vm::CardItemVm> = p
        .board
        .columns
        .iter()
        .flat_map(|c| c.cards.iter())
        .collect();

    rsx! {
        section {
            class: "plan-grid",
            "data-screen": "plan",
            div { class: "plan-mid",
                Toolbar { p: p.clone(), bridge: bridge.clone(), view_mode, dialog, pack_job }
                if !p.view_all {
                    WeekHead { p: p.clone() }
                }
                {draft_confirm(p, bridge)}
                if *view_mode.read() == ViewMode::List {
                    {list_view::list_view(p, rows, list_filter, selected, schedule, start, bridge, nav, viewing_released)}
                } else {
                    {board(p, Some(Filters::default()), list_filter.read().plan.clone(), bridge, dragging, pending, schedule, selected, start, reject, col_seg, nav, viewing_released)}
                }
            }
        }
        if selected.read().is_some() {
            DetailModal { p: p.clone(), selected, schedule, start, pending, bridge: bridge.clone(), viewing_released }
        }
        if let Some(sid) = *start.read() {
            StartModal { p: p.clone(), sid, start, bridge: bridge.clone() }
        }
        if let Some(pm) = pending.read().clone() {
            ConfirmMoveDialog { pm, pending, bridge: bridge.clone() }
        }
        if let Some(pr) = reject.read().clone() {
            RejectMoveDialog { pr, reject }
        }
        if let Some(ps) = schedule.read().clone() {
            ScheduleDialog { p: p.clone(), ps, schedule, bridge: bridge.clone() }
        }
        if let Some(d) = dialog.read().clone() {
            match d {
                DialogKind::NewIssue(_) => rsx! { NewIssueDialog { p: p.clone(), dialog, bridge: bridge.clone() } },
                DialogKind::CreateVersion => rsx! { CreateVersionDialog { p: p.clone(), dialog, bridge: bridge.clone() } },
                DialogKind::DeleteVersion => rsx! { DeleteVersionDialog { p: p.clone(), dialog, bridge: bridge.clone() } },
                DialogKind::Pack(draft) => rsx! { PackDialog { draft, dialog, pack_job, bridge: bridge.clone() } },
                DialogKind::Release(draft) => rsx! { ReleaseDialog { draft, dialog, bridge: bridge.clone() } },
            }
        }
    }
}

// ── 中栏顶部 ────────────────────────────────────────

#[component]
fn Toolbar(
    p: ProjectVm,
    bridge: Bridge,
    mut view_mode: Signal<ViewMode>,
    mut dialog: Signal<Option<DialogKind>>,
    mut pack_job: Signal<PackJob>,
) -> Element {
    let pid = p.id;
    let done_ids: Vec<IssueId> = p
        .board
        .columns
        .iter()
        .find(|c| c.status == bw::model::IssueStatus::Done)
        .map(|c| c.cards.iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let viewing_plan = p.viewing_plan.clone();
    let released = p
        .plan_versions
        .iter()
        .find(|v| v.name == viewing_plan)
        .is_some_and(|v| v.released);
    let mut editing = use_signal(|| false);
    let mut draft = use_signal(String::new);
    let mut last_view = use_signal(String::new);
    if last_view.peek().as_str() != viewing_plan.as_str() {
        last_view.set(viewing_plan.clone());
        if *editing.peek() {
            editing.set(false);
        }
    }
    let benzhou = |name: &str| -> String {
        if !p.confirmed_version.is_empty() && name == p.confirmed_version {
            format!("{name} · 本周")
        } else {
            name.to_string()
        }
    };
    let title = if p.view_all {
        "全部 issue".to_string()
    } else if !p.viewing_plan.is_empty() {
        benzhou(&p.viewing_plan)
    } else {
        "全部 issue".to_string()
    };
    let b_view = bridge.clone();
    let b_rename = bridge.clone();
    let view_opts: Vec<(String, String)> = {
        let mut v: Vec<(String, String)> = vec![("all".into(), "全部 issue".into())];
        for v2 in &p.plan_versions {
            v.push((format!("version:{}", v2.name), benzhou(&v2.name)));
        }
        v
    };
    let cur_view = if p.view_all || p.viewing_plan.is_empty() {
        "all".to_string()
    } else {
        format!("version:{}", p.viewing_plan)
    };
    let can_rename = !viewing_plan.is_empty() && !released;
    let taken: Vec<String> = p
        .plan_versions
        .iter()
        .map(|v| v.name.clone())
        .chain(std::iter::once(p.last_released.clone()))
        .filter(|s| !s.is_empty())
        .collect();
    let from = viewing_plan.clone();
    let pack_ver = p.viewing_plan.clone();
    let rel_ver = p.viewing_plan.clone();
    let pack_ok = bw::version::pack_source(&viewing_plan, &p.confirmed_version, released).is_some();
    let release_ok = bw::version::can_cut_release(&viewing_plan, &p.confirmed_version, released);
    rsx! {
        div { class: "plan-toolbar",
            div { class: "left",
                if *editing.read() && can_rename {
                    span { class: "ver-wrap",
                        input {
                            class: "input input-sm",
                            value: "{draft}",
                            oninput: move |e| draft.set(e.value()),
                            onkeydown: move |e| {
                                if e.key() == Key::Escape {
                                    editing.set(false);
                                }
                            },
                        }
                        button {
                            class: "icon-btn ok",
                            title: "保存",
                            onclick: move |_| {
                                let to = draft.read().trim().to_string();
                                let clash = to.is_empty()
                                    || (to != from && taken.iter().any(|s| s == &to));
                                editing.set(false);
                                if clash {
                                    b_rename.send(Req::Note("版本名不合法或已经有了".into()));
                                    return;
                                }
                                b_rename.cmd(Command::RenamePlanVersion {
                                    project_id: pid,
                                    from: from.clone(),
                                    to,
                                });
                            },
                            "✓"
                        }
                    }
                } else if can_rename {
                    span { class: "ver-wrap",
                        "{title}"
                        button {
                            class: "icon-btn",
                            title: "改名",
                            onclick: move |_| {
                                draft.set(viewing_plan.clone());
                                editing.set(true);
                            },
                            "✎"
                        }
                    }
                } else {
                    "{title}"
                }
            }
            div { class: "right",
                select {
                    class: "input input-sm",
                    onchange: move |e| {
                        let v = e.value();
                        if v == "all" {
                            b_view.send(Req::ViewAll(true));
                        } else if let Some(pl) = v.strip_prefix("version:") {
                            b_view.send(Req::ViewPlan(pl.to_string()));
                        }
                    },
                    for (val, label) in view_opts.iter() {
                        option { value: "{val}", selected: val.as_str() == cur_view.as_str(), "{label}" }
                    }
                }
                button {
                    class: "btn btn-secondary",
                    title: "先快进主检出再重读",
                    onclick: {
                        let b = bridge.clone();
                        move |_| b.send(Req::Refresh)
                    },
                    "刷新"
                }
                if p.view_all {
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| dialog.set(Some(DialogKind::CreateVersion)),
                        "创建版本"
                    }
                    button {
                        class: "btn btn-secondary",
                        disabled: !p.plan_versions.iter().any(|v| !v.released),
                        onclick: move |_| dialog.set(Some(DialogKind::DeleteVersion)),
                        "删除版本"
                    }
                } else if !p.viewing_plan.is_empty() {
                    button {
                        class: "btn btn-secondary",
                        disabled: !pack_ok,
                        onclick: move |_| {
                            if !pack_ok {
                                return;
                            }
                            let job = pack_job.read().clone();
                            if job.packing || (job.finished && !job.version.is_empty()) {
                                dialog.set(Some(DialogKind::Pack(PackDraft {
                                    project_id: pid,
                                    version: job.version,
                                })));
                                return;
                            }
                            dialog.set(Some(DialogKind::Pack(PackDraft {
                                project_id: pid,
                                version: pack_ver.clone(),
                            })));
                        },
                        {if pack_job.read().packing { "出包..." } else { "出包" }}
                    }
                    button {
                        class: "btn btn-secondary",
                        disabled: !release_ok,
                        onclick: move |_| {
                            if !release_ok {
                                return;
                            }
                            dialog.set(Some(DialogKind::Release(ReleaseDraft {
                                project_id: pid,
                                version: rel_ver.clone(),
                                note: format!("版本 {} 完成的活", rel_ver),
                                included: done_ids.clone(),
                            })));
                        },
                        "发版本"
                    }
                }
                button {
                    class: "btn btn-primary",
                    onclick: move |_| dialog.set(Some(DialogKind::NewIssue(NewIssueDraft::default()))),
                    "新建issue"
                }
                button {
                    class: "btn btn-secondary ml-auto",
                    onclick: move |_| view_mode.set(if *view_mode.read() == ViewMode::Board { ViewMode::List } else { ViewMode::Board }),
                    {if *view_mode.read() == ViewMode::Board { "☰" } else { "▦" }}
                }
            }
        }
    }
}

#[component]
fn WeekHead(p: ProjectVm) -> Element {
    let goal = if !p.viewing_plan.is_empty() {
        p.plan_versions
            .iter()
            .find(|v| v.name == p.viewing_plan)
            .map(|v| v.goal.clone())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "（这个版本还没写版本目标）".into())
    } else if !p.confirmed_version.is_empty() {
        p.plan_versions
            .iter()
            .find(|v| v.name == p.confirmed_version)
            .map(|v| v.goal.clone())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "（在研版本还没写版本目标）".into())
    } else {
        "（还没有在研版本）".into()
    };
    let mut open = use_signal(|| false);
    let c = &p.board_counts;
    rsx! {
        div { class: if *open.read() { "goal-box is-open" } else { "goal-box" },
            div { class: "goal-box-text", "{goal}" }
            button {
                class: "goal-box-toggle",
                title: if *open.read() { "收起" } else { "展开" },
                onclick: move |_| {
                    let next = !*open.peek();
                    open.set(next);
                },
                {if *open.read() { "▴" } else { "▾" }}
            }
        }
        div { class: "week-progress",
            div { style: "width:{c.pct(c.done)}%;background:var(--color-success);" }
            div { style: "width:{c.pct(c.review)}%;background:var(--color-accent-2);" }
            div { style: "width:{c.pct(c.doing)}%;background:var(--color-warning);" }
            div { style: "width:{c.pct(c.blocked)}%;background:var(--color-danger);" }
            div { style: "width:{c.pct(c.todo)}%;background:var(--color-neutral-300);" }
        }
        if !p.board_ops.is_empty() {
            div { class: "row-wrap",
                for o in p.board_ops.iter() {
                    span { key: "{o.title}", class: "tag tag-outline", title: "{o.note}",
                        "{o.title} · {o.status}"
                    }
                }
            }
        }
    }
}

/// 「开始本版本」产出的草稿活标,等人确认。
fn draft_confirm(p: &ProjectVm, bridge: &Bridge) -> Element {
    if p.pending_drafts.is_empty() {
        return rsx! {};
    }
    let b_ok = bridge.clone();
    let b_no = bridge.clone();
    let pid = p.id;
    let week = p.viewing_week.clone();
    let titles = p.pending_drafts.clone();
    rsx! {
        div { class: "card flex-none",
            div { class: "text-muted",
                "{week} 的运作活①已开工,下面是草稿活标。确认之前一张活都还没建。"
            }
            for t in titles.iter() {
                div { key: "{t}", "· {t}" }
            }
            div { class: "row",
                button {
                    class: "btn btn-primary",
                    onclick: move |_| b_ok.cmd(Command::ConfirmWeekDraft {
                        project_id: pid,
                        week: week.clone(),
                        titles: titles.clone(),
                    }),
                    "确认,按这些建活"
                }
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| b_no.send(Req::DropDrafts),
                    "先不建"
                }
            }
        }
    }
}
