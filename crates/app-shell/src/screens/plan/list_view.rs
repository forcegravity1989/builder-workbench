//! 计划屏 · 列表视图(对齐 opt:listView)。预设(开放/分配我的/我的)+ 计划/
//! 阶段下拉 + 搜索 + 表格行(ID/标题双行/负责人/状态胶囊/已更新/行操作)。
//! 行操作:未排期→schedule、已排期→Start、进行中/待评审/阻塞→Open、完成/
//! 取消→灰杠。

use crate::bridge::{Bridge, Panel, PanelNav, Req};
use crate::vm::{CardItemVm, ProjectVm};
use bw::model::{IssueId, IssueStatus};
use dioxus::prelude::*;

use super::ListFilter;

/// 状态 → 胶囊 css + 中文。
fn stage_pill(s: IssueStatus) -> (&'static str, &'static str) {
    match s {
        IssueStatus::Backlog => ("il-pill status-todo", "未排期"),
        IssueStatus::Todo => ("il-pill status-todo", "已排期"),
        IssueStatus::InProgress => ("il-pill status-progress", "进行中"),
        IssueStatus::InReview => ("il-pill status-review", "待评审"),
        IssueStatus::Done => ("il-pill status-done", "完成"),
        IssueStatus::Blocked => ("il-pill status-blocked", "阻塞"),
        IssueStatus::Cancelled => ("il-pill status-cancelled", "已取消"),
    }
}

/// 行操作类型。
fn action_kind(s: IssueStatus) -> &'static str {
    match s {
        IssueStatus::Backlog => "schedule",
        IssueStatus::Todo => "start",
        IssueStatus::InProgress | IssueStatus::InReview | IssueStatus::Blocked => "open",
        _ => "dash",
    }
}

#[allow(clippy::too_many_arguments)]
pub fn list_view(
    p: &ProjectVm,
    rows: Vec<&CardItemVm>,
    mut list_filter: Signal<ListFilter>,
    selected: Signal<Option<IssueId>>,
    _dialog: Signal<Option<super::plan_dialogs::DialogKind>>,
    bridge: &Bridge,
    nav: PanelNav,
) -> Element {
    let current_user = p.current_user.as_str();

    let f = list_filter.read().clone();
    let mut filtered: Vec<&CardItemVm> = rows
        .into_iter()
        .filter(|c| f.keep(c, current_user))
        .collect();
    // 按生命周期顺序排
    let order = [
        IssueStatus::Backlog,
        IssueStatus::Todo,
        IssueStatus::InProgress,
        IssueStatus::InReview,
        IssueStatus::Blocked,
        IssueStatus::Done,
        IssueStatus::Cancelled,
    ];
    filtered.sort_by_key(|c| order.iter().position(|s| *s == c.status).unwrap_or(99));

    // 计划去重(供下拉)
    let mut plans: Vec<String> = Vec::new();
    for c in &filtered {
        let pl = if !c.week_of.is_empty() {
            &c.week_of
        } else if !c.plan_version.is_empty() {
            &c.plan_version
        } else {
            continue;
        };
        if !plans.contains(pl) {
            plans.push(pl.clone());
        }
    }

    rsx! {
        div { class: "il-wrap",
            div { class: "il-bar",
                div { class: "il-presets",
                    {preset_btn("open", "开放", &f.preset, list_filter)}
                    {preset_btn("assigned", "分配我的", &f.preset, list_filter)}
                    {preset_btn("mine", "我的", &f.preset, list_filter)}
                }
                div { class: "il-tools",
                    {dropdown(&f.plan, plan_opts(&plans), list_filter, "plan")}
                    {dropdown(&f.stage, stage_opts(), list_filter, "stage")}
                    div { class: "il-search-wrap",
                        input {
                            class: "il-search",
                            placeholder: "Search issues...",
                            value: "{f.q}",
                            oninput: move |e| list_filter.write().q = e.value(),
                        }
                    }
                }
            }
            div { class: "issue-list",
                div { class: "il-row il-head",
                    span { class: "il-num", "ID" }
                    span { class: "il-title", "标题" }
                    span { class: "il-owner", "负责人" }
                    span { class: "il-status", "状态" }
                    span { class: "il-updated", "已更新" }
                    span { class: "il-act", "" }
                }
                for c in &filtered {
                    {list_row(c, selected, bridge, nav)}
                }
                if filtered.is_empty() {
                    div { class: "il-empty", "没有符合的 issue" }
                }
            }
        }
    }
}

fn stage_list() -> Vec<(&'static str, &'static str)> {
    vec![
        ("Backlog", "未排期"),
        ("Todo", "已排期"),
        ("InProgress", "进行中"),
        ("InReview", "待评审"),
        ("Blocked", "阻塞"),
        ("Done", "完成"),
        ("Cancelled", "已取消"),
    ]
}

fn preset_btn(id: &str, label: &str, preset: &str, mut lf: Signal<ListFilter>) -> Element {
    let on = preset == id;
    let id = id.to_string();
    rsx! {
        button {
            class: if on { "il-preset on" } else { "il-preset" },
            onclick: move |_| lf.write().preset = id.clone(),
            "{label}"
        }
    }
}

fn stage_opts() -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = vec![(String::new(), "全部".into())];
    v.extend(
        stage_list()
            .into_iter()
            .map(|(val, label)| (val.to_string(), label.to_string())),
    );
    v
}

fn plan_opts(plans: &[String]) -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = plans.iter().map(|s| (s.clone(), s.clone())).collect();
    v.insert(0, (String::new(), "全部".into()));
    v
}

fn dropdown(
    value: &str,
    options: Vec<(String, String)>,
    mut list_filter: Signal<ListFilter>,
    key: &str,
) -> Element {
    let cur = value.to_string();
    let key_plan = key == "plan";
    let key_stage = key == "stage";
    rsx! {
        div { class: "il-dd",
            select {
                class: "il-dd-btn",
                onchange: move |e| {
                    let val = e.value();
                    if key_plan { list_filter.write().plan = val; }
                    else if key_stage { list_filter.write().stage = val; }
                },
                for (val, label) in options.iter() {
                    option { value: "{val}", selected: *val == cur, "{label}" }
                }
            }
        }
    }
}

fn list_row(
    c: &CardItemVm,
    mut selected: Signal<Option<IssueId>>,
    bridge: &Bridge,
    nav: PanelNav,
) -> Element {
    let (pill_cls, stage) = stage_pill(c.status);
    let act = action_kind(c.status);
    let owner = if c.assignee.is_empty() {
        "—".into()
    } else {
        c.assignee.clone()
    };
    let initial = owner
        .chars()
        .next()
        .unwrap_or('—')
        .to_uppercase()
        .collect::<String>();
    let plan_tag = if !c.week_of.is_empty() {
        c.week_of.clone()
    } else if !c.plan_version.is_empty() {
        format!("版本·{}", c.plan_version)
    } else {
        "未排期".into()
    };
    let sub = format!("by {} · {}", owner, plan_tag);
    let cid = c.id;
    let b_sess = bridge.clone();
    rsx! {
        div {
            class: "il-row",
            onclick: move |_| selected.set(Some(cid)),
            span { class: "il-num", span { class: "il-idmark" }, "#{c.number}" }
            span { class: "il-title",
                span { class: "il-t1", "{c.title}" }
                span { class: "il-t2", "{sub}" }
            }
            span { class: "il-owner",
                span { class: "avatar avatar-sm", "{initial}" }
                "{owner}"
            }
            span { class: "il-status", span { class: "{pill_cls}", "{stage}" } }
            span { class: "il-updated", "" }
            span { class: "il-act",
                {match act {
                    "schedule" => rsx! {
                        button { class: "il-btn", onclick: move |e| {
                            e.stop_propagation();
                            selected.set(None);
                            // 排期走 schedule signal —— 但 list_view 拿不到;先开详情
                        }, "schedule" }
                    },
                    "start" => rsx! {
                        button { class: "il-btn", onclick: move |e| {
                            e.stop_propagation();
                            selected.set(Some(cid));
                        }, "Start →" }
                    },
                    "open" => rsx! {
                        button { class: "il-btn primary", onclick: move |e| {
                            e.stop_propagation();
                            b_sess.send(Req::SelectSession(Some(cid)));
                            nav.go(Panel::Session);
                        }, "Open →" }
                    },
                    _ => rsx! { span { class: "il-dash" } },
                }}
            }
        }
    }
}
