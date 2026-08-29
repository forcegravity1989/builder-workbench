//! 四列看板本体(合并后:待办/进行中/待处理/已完成)。列内分段,两段列默认
//! 只显示第一段、点子标题切到第二段。卡面按 opt 重做:编号 + CodeHub 徽 +
//! 标题 + 正文一行预览 + 计划位置 + 责任人 + 更新时间,**无开工按钮**(开工
//! 入口在详情弹窗)。

use super::Filters;
use crate::bridge::{Bridge, PanelNav};
use crate::vm::{CardItemVm, ColumnVm, ProjectVm};
use bw::model::{IssueId, IssueStatus};
use dioxus::prelude::*;
use std::collections::HashMap;

/// 松手之后等人确认的那一下(拖进评审中/已完成等状态动作)。
#[derive(Clone, PartialEq)]
pub struct PendingMove {
    pub id: IssueId,
    pub title: String,
    pub from: IssueStatus,
    pub to: IssueStatus,
    /// 这张活的 MR 号,`0` = 没有。确认框据此说清楚这一下到底会不会去合 MR。
    pub pr_number: u32,
}

/// 拖一张未排期的卡到「已排期」段时,等人选排进哪个周/版本的那一下。
#[derive(Clone, PartialEq)]
pub struct PendingSchedule {
    pub id: IssueId,
    pub title: String,
}

/// 状态 → 状态点 css 类 + 标签。照 opt 的 `STATUS_META`。
fn status_dot_class(s: IssueStatus) -> &'static str {
    match s {
        IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::Cancelled => "dot-gray",
        IssueStatus::InProgress => "dot-amber dot-run",
        IssueStatus::InReview => "dot-amber",
        IssueStatus::Done => "dot-green",
        IssueStatus::Blocked => "dot-red",
    }
}

/// 一句「什么样的活会在这一列/这一段」。照 opt 的 `COL_DEF`。
fn seg_def(s: IssueStatus) -> &'static str {
    match s {
        IssueStatus::Backlog => "未排进任何一周",
        IssueStatus::Todo => "已排进这一周,等 Start",
        IssueStatus::InProgress => "agent 在做",
        IssueStatus::InReview => "MR 开着,等人审",
        IssueStatus::Done => "人点过完成",
        IssueStatus::Blocked => "填了原因",
        IssueStatus::Cancelled => "已取消",
    }
}

/// unix 秒 → 「X天前/X小时前」人话。0 = 认不出,留空。
fn ago(unix: i64) -> String {
    if unix <= 0 {
        return String::new();
    }
    let now = time::OffsetDateTime::now_utc().unix_timestamp();
    let d = now.saturating_sub(unix);
    if d < 3600 {
        format!("{}分钟前", d.max(1) / 60)
    } else if d < 86_400 {
        format!("{}小时前", d / 3600)
    } else {
        format!("{}天前", d / 86_400)
    }
}

/// 一张活「排在哪」:周 > 版本 > 未排期。
fn place_of(c: &CardItemVm) -> String {
    if !c.week_of.is_empty() {
        c.week_of.clone()
    } else if !c.plan_version.is_empty() {
        format!("版本·{}", c.plan_version)
    } else {
        "未排期".into()
    }
}

#[allow(clippy::too_many_arguments)]
pub fn board(
    p: &ProjectVm,
    filters: Option<Filters>,
    plan_filter: String,
    bridge: &Bridge,
    dragging: Signal<Option<CardItemVm>>,
    pending: Signal<Option<PendingMove>>,
    schedule: Signal<Option<PendingSchedule>>,
    selected: Signal<Option<IssueId>>,
    start: Signal<Option<IssueId>>,
    bounced: Signal<String>,
    col_seg: Signal<HashMap<String, String>>,
    nav: PanelNav,
) -> Element {
    let f = if p.view_all { filters } else { None };
    let view_all = p.view_all;
    rsx! {
        div { class: "kanban",
            for col in p.board.columns.iter() {
                {column(col, f.clone(), &plan_filter, view_all, bridge, dragging, schedule, selected, start, pending, bounced, col_seg, nav)}
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn column(
    col: &ColumnVm,
    filters: Option<Filters>,
    plan_filter: &str,
    view_all: bool,
    bridge: &Bridge,
    mut dragging: Signal<Option<CardItemVm>>,
    mut schedule: Signal<Option<PendingSchedule>>,
    selected: Signal<Option<IssueId>>,
    mut start: Signal<Option<IssueId>>,
    mut pending: Signal<Option<PendingMove>>,
    _bounced: Signal<String>,
    col_seg: Signal<HashMap<String, String>>,
    nav: PanelNav,
) -> Element {
    // 段卡过滤:按 filters(旧) + plan_filter(计划下拉)双重过滤。
    let plan_ok = |c: &CardItemVm| -> bool {
        if plan_filter.is_empty() {
            return true;
        }
        if plan_filter == "unscheduled" {
            c.week_of.is_empty() && c.plan_version.is_empty()
        } else {
            c.week_of == plan_filter || c.plan_version == plan_filter
        }
    };
    // 预拷贝成 owned 数据,rsx 闭包不借用 col。段自带 cards(build_board 已按
    // 排期/状态分好),屏直接用,不再靠 statuses 二次过滤(否则未排期段会漏掉
    // 那些状态是 Todo 但没排期的新建 issue)。
    let col_key = col.status_label_key();
    let segs_owned: Vec<(String, String, Vec<CardItemVm>)> = col
        .segments
        .iter()
        .map(|s| {
            let cards: Vec<CardItemVm> = s
                .cards
                .iter()
                .filter(|c| filters.as_ref().is_none_or(|f| f.keep(c)) && plan_ok(c))
                .cloned()
                .collect();
            (s.key.clone(), s.label.clone(), cards)
        })
        .collect();
    let all: Vec<CardItemVm> = segs_owned
        .iter()
        .flat_map(|s| s.2.iter().cloned())
        .collect();
    let active_idx: usize = col_seg
        .read()
        .get(&col_key)
        .and_then(|k| segs_owned.iter().position(|s| s.0 == *k))
        .unwrap_or(0);
    let active_seg = segs_owned
        .get(active_idx)
        .cloned()
        .unwrap_or_else(|| segs_owned[0].clone());
    let active_cards: Vec<CardItemVm> = active_seg.2.clone();
    let total = all.len() as u32;
    let mut col_seg_w = col_seg;
    let col_status = col.status;
    let col_tint = match col.status {
        IssueStatus::Todo => "col-todo",
        IssueStatus::InProgress => "col-doing",
        IssueStatus::InReview => "col-pending",
        IssueStatus::Done => "col-done",
        _ => "col-todo",
    };
    let _ = view_all;
    rsx! {
        div { class: "kanban-col {col_tint}",
            div { class: "kanban-col-head",
                span { class: "status-dot {status_dot_class(col.status)}" }
                "{col.title}"
                span { class: "count", "{total}" }
            }
            if segs_owned.len() > 1 {
                div { class: "kanban-segtabs",
                    for (i, s) in segs_owned.iter().enumerate() {
                        {
                            let key = s.0.clone();
                            let label = s.1.clone();
                            let ck = col_key.clone();
                            let cnt = s.2.len() as u32;
                            rsx! {
                                button {
                                    class: if i == active_idx { "seg-tab active" } else { "seg-tab" },
                                    onclick: move |_| { col_seg_w.write().insert(ck.clone(), key.clone()); },
                                    "{label}"
                                    span { class: "seg-count", "{cnt}" }
                                }
                            }
                        }
                    }
                }
            }
            div {
                class: "kanban-seg-box",
                ondragover: move |e| e.prevent_default(),
                ondrop: move |_| {
                    if let Some(card) = dragging.read().clone() {
                        if col_status == IssueStatus::InProgress && card.status == IssueStatus::Todo {
                            // 待办拖到进行中 → 弹 worktree 窗(Start)
                            start.set(Some(card.id));
                        } else if col_status == IssueStatus::Done && card.status == IssueStatus::InReview {
                            // 评审中拖到完成 → 合入并完成(确认框)
                            pending.set(Some(PendingMove {
                                id: card.id,
                                title: card.title.clone(),
                                from: IssueStatus::InReview,
                                to: IssueStatus::Done,
                                pr_number: card.pr_number,
                            }));
                        } else if active_seg.0 == "assigned"
                            && card.week_of.is_empty()
                            && card.plan_version.is_empty()
                        {
                            // 未排期拖到已排期 → 排期弹窗
                            schedule.set(Some(PendingSchedule {
                                id: card.id,
                                title: card.title.clone(),
                            }));
                        }
                    }
                    dragging.set(None);
                },
                for c in active_cards.iter() {
                    {card_view(c, dragging, selected, view_all, bridge, nav)}
                }
                if active_cards.is_empty() {
                    div { class: "kanban-empty", "无 issue" }
                }
            }
        }
    }
}

fn card_view(
    c: &CardItemVm,
    mut dragging: Signal<Option<CardItemVm>>,
    mut selected: Signal<Option<IssueId>>,
    view_all: bool,
    _bridge: &Bridge,
    _nav: PanelNav,
) -> Element {
    let c1 = c.clone();
    let cid = c.id;
    let can_drag = matches!(
        c.status,
        IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::InReview
    );
    let assignee = if c.assignee.is_empty() {
        "未指派".to_string()
    } else {
        c.assignee.clone()
    };
    let initial = assignee
        .chars()
        .next()
        .unwrap_or('?')
        .to_uppercase()
        .collect::<String>();
    let updated = ago(c.updated_at);
    let remote_badge = if c.remote_number > 0 {
        rsx! { span { class: "kcard-src", "CodeHub" } }
    } else {
        rsx! {}
    };
    rsx! {
        div {
            class: "kcard",
            draggable: can_drag,
            ondragstart: move |_| dragging.set(Some(c1.clone())),
            ondragend: move |_| dragging.set(None),
            onclick: move |_| selected.set(Some(cid)),
            div { class: "kcard-top",
                span { class: "mono", "#{c.number}" }
                {remote_badge}
                span { class: "status-dot {status_dot_class(c.status)}", style: "margin-left:auto;", title: "{seg_def(c.status)}" }
            }
            div { class: "kcard-title", "{c.title}" }
            if !c.body.trim().is_empty() {
                div { class: "kcard-desc", "{c.body.chars().take(64).collect::<String>()}" }
            }
            if view_all {
                div { class: "kcard-place",
                    span { class: "kcard-folder", "▸" }
                    "{place_of(c)}"
                }
            }
            div { class: "kcard-foot",
                span { class: "kcard-who",
                    span { class: "avatar avatar-sm", "{initial}" }
                    "{assignee}"
                }
                if !updated.is_empty() {
                    span { class: "kcard-ago", "{updated}" }
                }
            }
        }
    }
}

/// 给 `ColumnVm` 一个稳定的 key(用于 col_seg 状态)。
trait ColKey {
    fn status_label_key(&self) -> String;
}
impl ColKey for ColumnVm {
    fn status_label_key(&self) -> String {
        format!("{:?}", self.status)
    }
}
