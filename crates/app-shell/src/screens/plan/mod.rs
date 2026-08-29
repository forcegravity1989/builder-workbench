//! 项目内 · 计划。结构照 `docs/hifi/plan-23-opt.html` 的 `midBar`/`kanban`/
//! `detail`/`listView`/弹窗排:左栏周列表(全部issue/本周/未来/版本/历史周/
//! 在研版本)+ 中栏(工具条 + 周目标/进度条/运作活,或列表视图)+ 四列看板。
//! 详情与弹窗都是屏幕居中浮层。
//!
//! 看板四列:待办(未排期/已排期)→ 进行中 → 待处理(待评审/阻塞)→ 已完成
//! (完成/拒绝)。两段列默认显示第一段,点子标题切到第二段。卡面无开工按钮,
//! 开工/排期/Complete 等入口在详情弹窗。

mod detail;
mod kanban;
mod list_view;
mod plan_dialogs;

use crate::bridge::{Bridge, PanelNav, Req};
use crate::vm::ProjectVm;
use bw::command::Command;
use bw::model::IssueId;
use dioxus::prelude::*;

use detail::DetailModal;
use kanban::{board, PendingMove, PendingSchedule};
use plan_dialogs::{
    confirm_dialog, CreateVersionDialog, DialogKind, NewIssueDialog, NewIssueDraft, ReleaseDialog,
    ReleaseDraft, ScheduleDialog,
};

/// 列表/看板视图模式。
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ViewMode {
    Board,
    List,
}

/// 列表筛选(对齐 opt:listFilter)。
#[derive(Clone, Default, PartialEq)]
pub struct ListFilter {
    pub preset: String, // open | assigned | mine
    pub plan: String,
    pub stage: String, // IssueStatus key
    pub q: String,
}

impl ListFilter {
    fn keep(&self, c: &crate::vm::CardItemVm, current_user: &str) -> bool {
        if self.preset == "assigned" && c.assignee != current_user {
            return false;
        }
        if self.preset == "mine" && c.origin != "人建" {
            return false;
        }
        // open 预设不过滤(显示全部);assigned/mine 已过滤
        if !self.plan.is_empty() {
            let pl = if !c.week_of.is_empty() {
                &c.week_of
            } else if !c.plan_version.is_empty() {
                &c.plan_version
            } else {
                return false;
            };
            if pl != &self.plan {
                return false;
            }
        }
        if !self.stage.is_empty() && format!("{:?}", c.status) != self.stage {
            return false;
        }
        if !self.q.is_empty()
            && !(c.title.to_lowercase().contains(&self.q.to_lowercase())
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
    let p_sel = p.selected_issue;
    let (p, bridge) = (&p, &bridge);
    let dragging = use_signal(|| None::<crate::vm::CardItemVm>);
    let pending = use_signal(|| None::<PendingMove>);
    let mut selected = use_signal(|| None::<IssueId>);
    let schedule = use_signal(|| None::<PendingSchedule>);
    let start = use_signal(|| None::<IssueId>);
    let dialog = use_signal(|| None::<DialogKind>);
    let mut came_from = use_signal(|| None::<IssueId>);
    let view_mode = use_signal(|| ViewMode::Board);
    let list_filter = use_signal(ListFilter::default);
    let col_seg = use_signal(std::collections::HashMap::<String, String>::new);
    use_effect(move || {
        let want = p_sel;
        if want.is_some() && want != *came_from.peek() {
            selected.set(want);
        }
        came_from.set(want);
    });
    let nav = use_context::<PanelNav>();

    let rows: Vec<&crate::vm::CardItemVm> = if p.view_all {
        p.board
            .columns
            .iter()
            .flat_map(|c| c.cards.iter())
            .collect()
    } else {
        p.board
            .columns
            .iter()
            .flat_map(|c| c.cards.iter())
            .filter(|c| {
                c.week_of == p.viewing_week || !c.plan_version.is_empty() || c.kind != "业务活"
            })
            .collect()
    };

    rsx! {
        section {
            class: "plan-grid",
            style: "height:calc(100vh - 112px);",
            div { class: "plan-col", {week_rail(p, bridge)} }
            div { class: "plan-col plan-mid",
                {toolbar(p, bridge, view_mode, dialog)}
                if !p.view_all {
                    {week_head(p)}
                }
                {draft_confirm(p, bridge)}
                if *view_mode.read() == ViewMode::List {
                    {list_view::list_view(p, rows, list_filter, selected, dialog, bridge, nav)}
                } else {
                    {board(p, Some(Filters::default()), bridge, dragging, pending, schedule, selected, use_signal(String::new), col_seg, nav)}
                }
            }
        }
        if selected.read().is_some() {
            DetailModal { p: p.clone(), selected, schedule, start, bridge: bridge.clone() }
        }
        if let Some(pm) = pending.read().clone() {
            {confirm_dialog(pm, pending, bridge)}
        }
        if let Some(ps) = schedule.read().clone() {
            ScheduleDialog { p: p.clone(), ps, schedule, bridge: bridge.clone() }
        }
        if let Some(d) = dialog.read().clone() {
            match d {
                DialogKind::NewIssue(_) => rsx! { NewIssueDialog { p: p.clone(), dialog, bridge: bridge.clone() } },
                DialogKind::CreateVersion => rsx! { CreateVersionDialog { p: p.clone(), dialog, bridge: bridge.clone() } },
                DialogKind::Release(draft) => rsx! { ReleaseDialog { draft, dialog, bridge: bridge.clone() } },
            }
        }
    }
}

// ── 左栏 ────────────────────────────────────────────

fn week_rail(p: &ProjectVm, bridge: &Bridge) -> Element {
    let b_all = bridge.clone();
    rsx! {
        div {
            class: if p.view_all { "plan-weekrow active" } else { "plan-weekrow" },
            onclick: move |_| b_all.send(Req::ViewAll(true)),
            "全部 issue"
        }
        if p.weeks.is_empty() {
            div { class: "detail-empty",
                "还没有挂过周标签的活。周列表从 issue 的 bw:week 标签来,本周永远在。"
            }
        }
        // 本周 + 未来周(可排期)
        for w in p.weeks.iter().filter(|w| !is_past(w, p)) {
            {week_row(w, p, bridge)}
        }
        // 版本(自定义计划包)在历史周上方
        if !p.plan_versions.is_empty() {
            div { class: "plan-weekgroup", "版本" }
            for v in p.plan_versions.iter() {
                div { class: "plan-weekrow",
                    span { "{v.name}" }
                    span { class: "chip-muted", "{v.issue_count}" }
                }
            }
        }
        // 历史周
        div { class: "plan-weekgroup", "历史周" }
        for w in p.weeks.iter().filter(|w| is_past(w, p)) {
            {week_row(w, p, bridge)}
        }
        div { class: "plan-versionsel",
            label { class: "label", "在研版本" }
            div { class: "mono", style: "font-size:13px;", "{p.card.current_version}" }
        }
    }
}

fn is_past(w: &crate::vm::WeekVm, p: &ProjectVm) -> bool {
    w.week < p.current_week
}

fn week_row(w: &crate::vm::WeekVm, p: &ProjectVm, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let week = w.week.clone();
    let active = !p.view_all && w.week == p.viewing_week;
    let is_current = w.week == p.current_week;
    let label = if is_current {
        format!("{} · 本周", w.week)
    } else {
        w.week.clone()
    };
    rsx! {
        div {
            key: "{w.week}",
            class: if active { "plan-weekrow active" } else { "plan-weekrow" },
            onclick: move |_| b.send(Req::ViewWeek(week.clone())),
            span { "{label}" }
            span { class: "chip-muted", "{w.activity_count}" }
        }
    }
}

// ── 中栏顶部 ────────────────────────────────────────

fn toolbar(
    p: &ProjectVm,
    _bridge: &Bridge,
    mut view_mode: Signal<ViewMode>,
    mut dialog: Signal<Option<DialogKind>>,
) -> Element {
    let pid = p.id;
    let version = p.card.current_version_raw.clone();
    let done_ids: Vec<IssueId> = p
        .board
        .columns
        .iter()
        .find(|c| c.status == bw::model::IssueStatus::Done)
        .map(|c| c.cards.iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let title = if p.view_all {
        "全部 issue".to_string()
    } else if p.viewing_week == p.current_week {
        format!("{} · 本周", p.viewing_week)
    } else {
        p.viewing_week.clone()
    };
    rsx! {
        div { class: "plan-toolbar",
            div { class: "left", "{title}" }
            div { class: "right",
                button {
                    class: "btn btn-sm btn-secondary",
                    onclick: move |_| view_mode.set(if *view_mode.read() == ViewMode::Board { ViewMode::List } else { ViewMode::Board }),
                    {if *view_mode.read() == ViewMode::Board { "切换列表" } else { "切换看板" }}
                }
                if p.view_all {
                    button {
                        class: "btn btn-sm btn-secondary",
                        onclick: move |_| dialog.set(Some(DialogKind::CreateVersion)),
                        "创建版本"
                    }
                } else {
                    button {
                        class: "btn btn-sm",
                        disabled: done_ids.is_empty(),
                        onclick: move |_| dialog.set(Some(DialogKind::Release(ReleaseDraft {
                            project_id: pid,
                            version: default_release_version(&version),
                            note: "本周完成的活".into(),
                            included: done_ids.clone(),
                        }))),
                        "发版本"
                    }
                }
                button {
                    class: "btn btn-sm btn-primary",
                    onclick: move |_| dialog.set(Some(DialogKind::NewIssue(NewIssueDraft::default()))),
                    "新建issue"
                }
            }
        }
    }
}

fn week_head(p: &ProjectVm) -> Element {
    let w = p.weeks.iter().find(|w| w.week == p.viewing_week);
    let goal = w
        .and_then(|w| w.goal.clone())
        .unwrap_or_else(|| "(这一周还没写周目标)".into());
    let c = &p.board_counts;
    rsx! {
        div { class: "goal-box", "{goal}" }
        div { class: "week-progress",
            div { style: "width:{c.pct(c.done)}%;background:var(--green);" }
            div { style: "width:{c.pct(c.review)}%;background:var(--amber);" }
            div { style: "width:{c.pct(c.doing)}%;background:var(--clay);" }
            div { style: "width:{c.pct(c.blocked)}%;background:var(--red);" }
            div { style: "width:{c.pct(c.todo)}%;background:#E4DDC8;" }
        }
        if !p.board_ops.is_empty() {
            div { class: "ops-chip-row",
                for o in p.board_ops.iter() {
                    span { key: "{o.title}", class: "chip chip-outline", title: "{o.note}",
                        "{o.title} · {o.status}"
                    }
                }
            }
        }
    }
}

/// 「开始本周」产出的草稿活标,等人确认。
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
        div { class: "card", style: "padding:14px 16px;margin-bottom:10px;flex:none;",
            div { style: "font-size:12.5px;color:var(--ink-2);margin-bottom:8px;line-height:1.8;",
                "{week} 的运作活①已开工,下面是草稿活标。确认之前一张活都还没建。"
            }
            for t in titles.iter() {
                div { key: "{t}", style: "font-size:12.5px;padding:3px 0;", "· {t}" }
            }
            div { style: "display:flex;gap:8px;margin-top:10px;",
                button {
                    class: "btn btn-sm btn-primary",
                    onclick: move |_| b_ok.cmd(Command::ConfirmWeekDraft {
                        project_id: pid,
                        week: week.clone(),
                        titles: titles.clone(),
                    }),
                    "确认,按这些建活"
                }
                button {
                    class: "btn btn-sm",
                    onclick: move |_| b_no.send(Req::DropDrafts),
                    "先不建"
                }
            }
        }
    }
}

fn default_release_version(cur: &str) -> String {
    let next = next_version(cur);
    if next.is_empty() {
        cur.trim().to_string()
    } else {
        next
    }
}

fn next_version(cur: &str) -> String {
    let t = cur.trim().trim_start_matches('v');
    let Some((head, tail)) = t.rsplit_once('.') else {
        return String::new();
    };
    match tail.parse::<u32>() {
        Ok(n) if !head.is_empty() => format!("v{head}.{}", n + 1),
        _ => String::new(),
    }
}
