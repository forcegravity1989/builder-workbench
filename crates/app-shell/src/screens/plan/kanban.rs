use super::Filters;
use crate::{
    bridge::{Bridge, PanelNav},
    vm::{CardItemVm, ColumnVm, ProjectVm},
};
use bw::model::{IssueId, IssueStatus};
use dioxus::prelude::*;
use std::collections::HashMap;

#[derive(Clone, PartialEq)]
pub struct PendingMove {
    pub id: IssueId,
    pub title: String,
    pub from: IssueStatus,
    pub to: IssueStatus,
    /// 此 Issue的 MR 号,`0` = 没有(开着的或已合入的都算)。详情展示用。
    pub pr_number: u32,
    pub has_open_mr: bool,
}

#[derive(Clone, PartialEq)]
pub struct PendingSchedule {
    pub id: IssueId,
    pub title: String,
}

#[derive(Clone, PartialEq)]
pub struct PendingReject {
    pub from: IssueStatus,
    pub to: IssueStatus,
    pub reason: String,
}

fn status_dot_class(s: IssueStatus) -> &'static str {
    match s {
        IssueStatus::Backlog | IssueStatus::Todo | IssueStatus::Cancelled => "status-todo",
        IssueStatus::InProgress => "status-progress is-live",
        IssueStatus::InReview => "status-review",
        IssueStatus::Done => "status-done",
        IssueStatus::Blocked => "status-blocked",
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

fn place_of(c: &CardItemVm) -> String {
    if !c.plan_versions.is_empty() {
        format!("版本·{}", c.plan_versions.join("、"))
    } else {
        "未排期".into()
    }
}

pub(super) fn carryover_label(
    c: &CardItemVm,
    viewing_plan: &str,
    viewing_released: bool,
) -> Option<String> {
    carryover_text(
        &c.plan_versions,
        &c.released_version,
        viewing_plan,
        viewing_released,
    )
}

fn carryover_text(
    plan_versions: &[String],
    released_version: &str,
    viewing_plan: &str,
    viewing_released: bool,
) -> Option<String> {
    if !viewing_released || viewing_plan.is_empty() || released_version == viewing_plan {
        return None;
    }
    let others: Vec<&str> = plan_versions
        .iter()
        .map(String::as_str)
        .filter(|name| *name != viewing_plan)
        .collect();
    Some(if others.len() == 1 {
        format!("遗留 {}", others[0])
    } else {
        "遗留".into()
    })
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
    reject: Signal<Option<PendingReject>>,
    col_seg: Signal<HashMap<String, String>>,
    nav: PanelNav,
    viewing_released: bool,
) -> Element {
    let f = if p.view_all { filters } else { None };
    let view_all = p.view_all;
    rsx! {
        div { class: "board",
            for col in p.board.columns.iter() {
                {column(col, f.clone(), &plan_filter, view_all, &p.remote_brand, bridge, dragging, schedule, selected, start, pending, reject, col_seg, nav, &p.viewing_plan, viewing_released)}
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
    brand: &str,
    _bridge: &Bridge,
    mut dragging: Signal<Option<CardItemVm>>,
    schedule: Signal<Option<PendingSchedule>>,
    selected: Signal<Option<IssueId>>,
    start: Signal<Option<IssueId>>,
    pending: Signal<Option<PendingMove>>,
    reject: Signal<Option<PendingReject>>,
    col_seg: Signal<HashMap<String, String>>,
    _nav: PanelNav,
    viewing_plan: &str,
    viewing_released: bool,
) -> Element {
    let plan_ok = |c: &CardItemVm| -> bool {
        if plan_filter.is_empty() {
            return true;
        }
        if plan_filter == "unscheduled" {
            c.plan_versions.is_empty()
        } else {
            c.plan_versions.iter().any(|v| v == plan_filter)
        }
    };
    // 分段已按排期分类；不能再用状态过滤，否则会漏掉未排期的 Todo。
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
    let _ = view_all;
    let drop_seg = active_seg.0.clone();
    let seg_group = format!("board-seg-{col_key}");
    rsx! {
        div { class: "board-col",
            div { class: "board-col-head",
                span { class: "status-dot {status_dot_class(col.status)}" }
                "{col.title}"
                span { class: "count", "{total}" }
            }
            if segs_owned.len() > 1 {
                div { class: "seg board-seg",
                    for (i, s) in segs_owned.iter().enumerate() {
                        {
                            let key = s.0.clone();
                            let label = s.1.clone();
                            let ck = col_key.clone();
                            let cnt = s.2.len() as u32;
                            rsx! {
                                label { class: "seg-opt",
                                    input {
                                        r#type: "radio",
                                        name: "{seg_group}",
                                        checked: i == active_idx,
                                        onchange: move |_| { col_seg_w.write().insert(ck.clone(), key.clone()); },
                                    }
                                    "{label}"
                                    span { class: "seg-count", "{cnt}" }
                                }
                            }
                        }
                    }
                }
            }
            div {
                class: "board-seg-box",
                ondragover: move |e| e.prevent_default(),
                ondrop: move |_| {
                    if let Some(card) = dragging.read().clone() {
                        apply_drop(&card, col_status, &drop_seg, start, pending, schedule, reject);
                    }
                    dragging.set(None);
                },
                for c in active_cards.iter() {
                    {card_view(c, dragging, selected, view_all, brand, viewing_plan, viewing_released)}
                }
                if active_cards.is_empty() {
                    div { class: "board-empty", "无 issue" }
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
    brand: &str,
    viewing_plan: &str,
    viewing_released: bool,
) -> Element {
    let c1 = c.clone();
    let cid = c.id;
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
    let carryover = carryover_label(c, viewing_plan, viewing_released);
    let remote_badge = if c.remote_number > 0 && !brand.is_empty() {
        rsx! { span { class: "tag tag-accent-2", "{brand}" } }
    } else {
        rsx! {}
    };
    rsx! {
        div {
            class: "card kcard",
            draggable: true,
            ondragstart: move |_| dragging.set(Some(c1.clone())),
            ondragend: move |_| dragging.set(None),
            onclick: move |_| selected.set(Some(cid)),
            div { class: "kcard-top",
                span { class: "mono", "#{c.number}" }
                {remote_badge}
                span { class: "status-dot {status_dot_class(c.status)} ml-auto", title: "{plan_status_label(c.status)}" }
            }
            div { class: "kcard-title", "{c.title}" }
            if let Some(label) = carryover {
                span { class: "tag tag-warning", "{label}" }
            }
            if !c.body.trim().is_empty() {
                div { class: "kcard-desc", "{c.body.chars().take(64).collect::<String>()}" }
            }
            if view_all {
                div { class: "tag tag-neutral kcard-place",
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

pub fn allowed_plan_targets(from: IssueStatus) -> &'static [IssueStatus] {
    match from {
        IssueStatus::Backlog => &[IssueStatus::Done, IssueStatus::Cancelled],
        IssueStatus::Todo => &[
            IssueStatus::InProgress,
            IssueStatus::Blocked,
            IssueStatus::Cancelled,
            IssueStatus::Done,
        ],
        IssueStatus::InProgress => &[
            IssueStatus::Todo,
            IssueStatus::Blocked,
            IssueStatus::Cancelled,
            IssueStatus::InReview,
            IssueStatus::Done,
        ],
        IssueStatus::InReview => &[
            IssueStatus::Done,
            IssueStatus::Cancelled,
            IssueStatus::InProgress,
        ],
        IssueStatus::Blocked => &[
            IssueStatus::InProgress,
            IssueStatus::Cancelled,
            IssueStatus::Done,
        ],
        _ => &[],
    }
}

pub fn reject_move_reason(from: IssueStatus, to: IssueStatus) -> String {
    use IssueStatus::*;
    match (from, to) {
        (Todo | Backlog | Blocked, InReview) => {
            "不能直接到待评审。要送审请先到进行中；已经在外面做完了请拖到完成。".into()
        }
        (InReview, Todo | Backlog) => "打回请拖到进行中。".into(),
        (InReview, Blocked) => "卡住请先拖回进行中，再拖到阻塞。".into(),
        (Blocked, Todo | Backlog) => "解除阻塞请拖到进行中；不再继续时可取消 Issue。".into(),
        (Done | Cancelled, _) => "已结束的 Issue 不能再修改状态。".into(),
        _ => format!(
            "不能从「{}」拖到「{}」。",
            plan_status_label(from),
            plan_status_label(to)
        ),
    }
}

pub fn plan_status_label(s: IssueStatus) -> &'static str {
    match s {
        IssueStatus::Backlog => "未排期",
        IssueStatus::Todo => "待办",
        IssueStatus::InProgress => "进行中",
        IssueStatus::InReview => "待评审",
        IssueStatus::Done => "完成",
        IssueStatus::Blocked => "阻塞",
        IssueStatus::Cancelled => "取消",
    }
}

pub fn status_key(s: IssueStatus) -> &'static str {
    match s {
        IssueStatus::Backlog => "backlog",
        IssueStatus::Todo => "todo",
        IssueStatus::InProgress => "inprogress",
        IssueStatus::InReview => "inreview",
        IssueStatus::Done => "done",
        IssueStatus::Blocked => "blocked",
        IssueStatus::Cancelled => "cancelled",
    }
}

pub fn status_from_key(k: &str) -> Option<IssueStatus> {
    Some(match k {
        "backlog" => IssueStatus::Backlog,
        "todo" => IssueStatus::Todo,
        "inprogress" => IssueStatus::InProgress,
        "inreview" => IssueStatus::InReview,
        "done" => IssueStatus::Done,
        "blocked" => IssueStatus::Blocked,
        "cancelled" => IssueStatus::Cancelled,
        _ => return None,
    })
}

pub fn apply_status_move(
    card: &CardItemVm,
    target: IssueStatus,
    mut start: Signal<Option<IssueId>>,
    mut pending: Signal<Option<PendingMove>>,
) {
    if target == card.status || !allowed_plan_targets(card.status).contains(&target) {
        return;
    }
    if card.status == IssueStatus::Todo && target == IssueStatus::InProgress {
        start.set(Some(card.id));
        return;
    }
    pending.set(Some(move_to(card, target)));
}

/// 落点状态以当前分组为准；已完成列也容纳取消的 Issue。
fn drop_target_status(col: IssueStatus, seg: &str) -> IssueStatus {
    match seg {
        "cancelled" => IssueStatus::Cancelled,
        "done" => IssueStatus::Done,
        "blocked" => IssueStatus::Blocked,
        "review" => IssueStatus::InReview,
        "unassigned" => IssueStatus::Backlog,
        "assigned" => IssueStatus::Todo,
        "doing" => IssueStatus::InProgress,
        _ => col,
    }
}

fn apply_drop(
    card: &CardItemVm,
    col_status: IssueStatus,
    drop_seg: &str,
    start: Signal<Option<IssueId>>,
    pending: Signal<Option<PendingMove>>,
    mut schedule: Signal<Option<PendingSchedule>>,
    mut reject: Signal<Option<PendingReject>>,
) {
    if drop_seg == "assigned"
        && card.plan_versions.is_empty()
        && matches!(card.status, IssueStatus::Backlog | IssueStatus::Todo)
    {
        schedule.set(Some(PendingSchedule {
            id: card.id,
            title: card.title.clone(),
        }));
        return;
    }

    let target = drop_target_status(col_status, drop_seg);
    if target == card.status {
        return;
    }
    if !allowed_plan_targets(card.status).contains(&target) {
        reject.set(Some(PendingReject {
            from: card.status,
            to: target,
            reason: reject_move_reason(card.status, target),
        }));
        return;
    }
    apply_status_move(card, target, start, pending);
}

fn move_to(card: &CardItemVm, to: IssueStatus) -> PendingMove {
    PendingMove {
        id: card.id,
        title: card.title.clone(),
        from: card.status,
        to,
        pr_number: card.pr_number,
        has_open_mr: card.has_open_mr,
    }
}

trait ColKey {
    fn status_label_key(&self) -> String;
}
impl ColKey for ColumnVm {
    fn status_label_key(&self) -> String {
        format!("{:?}", self.status)
    }
}

#[cfg(test)]
mod tests {
    use super::carryover_text;

    #[test]
    fn released_plan_derives_small_carryover_label() {
        let plans = vec!["A".into(), "B".into()];
        assert_eq!(
            carryover_text(&plans, "", "A", true).as_deref(),
            Some("遗留 B")
        );
        assert_eq!(carryover_text(&plans, "A", "A", true), None);
        assert_eq!(carryover_text(&plans, "", "B", false), None);
    }

    #[test]
    fn ambiguous_destination_stays_generic() {
        let plans = vec!["A".into(), "B".into(), "C".into()];
        assert_eq!(
            carryover_text(&plans, "", "A", true).as_deref(),
            Some("遗留")
        );
    }
}
