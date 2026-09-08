//! 计划屏 · 列表视图(对齐 opt:listView)。预设(开放/分配我的/我的)+ 计划/
//! 阶段下拉 + 搜索 + 表格行(ID/标题双行/负责人/状态胶囊/已更新/行操作)。
//! 行操作:未排期→schedule、已排期→Start、进行中/待评审/阻塞/完成/取消→Open。

use crate::{
    bridge::{Bridge, Panel, PanelNav, Req},
    vm::{CardItemVm, ProjectVm},
};
use bw::model::{IssueId, IssueStatus};
use dioxus::prelude::*;

use super::ListFilter;

/// 状态 → 胶囊 css + 中文。按 scheduled 判断未排期/已排期(而非纯 status),
/// 因为历史 issue 可能 status=Todo 但 week_of 空(旧默认 Todo),那样该显示"未排期"。
fn stage_pill(c: &CardItemVm) -> (&'static str, String) {
    let scheduled = !c.plan_version.is_empty();
    match c.status {
        IssueStatus::Backlog => ("tag tag-neutral", "未排期".into()),
        IssueStatus::Todo if !scheduled => ("tag tag-neutral", "未排期".into()),
        IssueStatus::Todo => ("tag tag-neutral", "已排期".into()),
        IssueStatus::InProgress => ("tag tag-warning", "进行中".into()),
        IssueStatus::InReview => ("tag tag-accent-2", "待评审".into()),
        IssueStatus::Done => ("tag tag-success", "完成".into()),
        IssueStatus::Blocked => ("tag tag-danger", "阻塞".into()),
        IssueStatus::Cancelled => ("tag tag-outline", "已取消".into()),
    }
}

/// 行操作类型。按 scheduled 判断:未排期→schedule,已排期 Todo→start。
fn action_kind(c: &CardItemVm) -> &'static str {
    let scheduled = !c.plan_version.is_empty();
    match c.status {
        IssueStatus::Backlog => "schedule",
        IssueStatus::Todo if !scheduled => "schedule",
        IssueStatus::Todo => "start",
        IssueStatus::InProgress
        | IssueStatus::InReview
        | IssueStatus::Blocked
        | IssueStatus::Done
        | IssueStatus::Cancelled => "open",
    }
}

#[allow(clippy::too_many_arguments)]
pub fn list_view(
    p: &ProjectVm,
    rows: Vec<&CardItemVm>,
    mut list_filter: Signal<ListFilter>,
    selected: Signal<Option<IssueId>>,
    schedule: Signal<Option<super::kanban::PendingSchedule>>,
    start: Signal<Option<IssueId>>,
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

    let plans: Vec<String> = p.plan_versions.iter().map(|v| v.name.clone()).collect();

    // 阶段下拉联动:选了"未排期"后,未排期的 issue 状态都是 Backlog/Todo,
    // 阶段下拉只剩"全部"(bug 5b)。
    let stage_options = if f.plan == "unscheduled" {
        vec![(String::new(), "全部".into())]
    } else {
        stage_opts()
    };

    rsx! {
        div { class: "il-wrap",
            div { class: "il-bar",
                div { class: "il-presets",
                    div { class: "seg",
                        {preset_btn("open", "开放", &f.preset, list_filter)}
                        {preset_btn("assigned", "分配我的", &f.preset, list_filter)}
                        {preset_btn("mine", "我的", &f.preset, list_filter)}
                    }
                }
                div { class: "il-tools",
                    // 计划下拉只在「全部 issue」显示;周/版本视图已经在看特定计划,不需要再筛
                    if p.view_all {
                        {dropdown(&f.plan, plan_opts(&plans), list_filter, "plan")}
                    }
                    {dropdown(&f.stage, stage_options, list_filter, "stage")}
                    div { class: "il-search-wrap",
                        input {
                            class: "input input-sm",
                            placeholder: "Search issues...",
                            value: "{f.q}",
                            oninput: move |e| list_filter.write().q = e.value(),
                        }
                    }
                }
            }
            div { class: "list issue-list",
                div { class: "list-row il-head",
                    span { class: "il-num", "ID" }
                    span { class: "il-title", "标题" }
                    span { class: "il-owner", "负责人" }
                    span { class: "il-status", "状态" }
                    span { class: "il-updated", "已更新" }
                    span { class: "il-act", "" }
                }
                for c in &filtered {
                    {list_row(c, selected, schedule, start, bridge, nav)}
                }
                if filtered.is_empty() {
                    div { class: "empty empty-center", "没有符合的 issue" }
                }
            }
        }
    }
}

fn stage_list() -> Vec<(&'static str, &'static str)> {
    // 阶段下拉不含"未排期"(Backlog)—— 未排期在「计划」下拉里筛。
    vec![
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
        label { class: "seg-opt",
            input {
                r#type: "radio",
                name: "list-preset",
                checked: on,
                onchange: move |_| lf.write().preset = id.clone(),
            }
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
    let mut v: Vec<(String, String)> = vec![
        (String::new(), "全部".into()),
        ("unscheduled".into(), "未排期".into()),
    ];
    v.extend(plans.iter().map(|s| (s.clone(), s.clone())));
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
        select {
            class: "input input-sm",
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

fn list_row(
    c: &CardItemVm,
    mut selected: Signal<Option<IssueId>>,
    mut schedule: Signal<Option<super::kanban::PendingSchedule>>,
    mut start: Signal<Option<IssueId>>,
    bridge: &Bridge,
    nav: PanelNav,
) -> Element {
    let (pill_cls, stage) = stage_pill(c);
    let act = action_kind(c);
    // 负责人(assignee)给负责人列;提出人(author)给 by 行。
    let assignee_name = if c.assignee.is_empty() {
        "—".into()
    } else {
        c.assignee.clone()
    };
    let author_name = if c.author.is_empty() {
        "—".into()
    } else {
        c.author.clone()
    };
    let initial = assignee_name
        .chars()
        .next()
        .unwrap_or('—')
        .to_uppercase()
        .collect::<String>();
    let plan_tag = if !c.plan_version.is_empty() {
        format!("版本·{}", c.plan_version)
    } else {
        "未排期".into()
    };
    let sub = format!("by {} · {}", author_name, plan_tag);
    let cid = c.id;
    let ctitle = c.title.clone();
    let b_sess = bridge.clone();
    rsx! {
        div {
            class: "list-row",
            onclick: move |_| selected.set(Some(cid)),
            span { class: "il-num", span { class: "il-idmark" }, "#{c.number}" }
            span { class: "il-title",
                span { class: "il-t1", "{c.title}" }
                span { class: "il-t2", "{sub}" }
            }
            span { class: "il-owner",
                span { class: "avatar avatar-sm", "{initial}" }
                "{assignee_name}"
            }
            span { class: "il-status", span { class: "{pill_cls}", "{stage}" } }
            span { class: "il-updated", "" }
            span { class: "il-act",
                {match act {
                    "schedule" => rsx! {
                        button { class: "btn btn-secondary", onclick: move |e| {
                            e.stop_propagation();
                            selected.set(None);
                            schedule.set(Some(super::kanban::PendingSchedule { id: cid, title: ctitle.clone() }));
                        }, "schedule" }
                    },
                    "start" => rsx! {
                        button { class: "btn btn-secondary", onclick: move |e| {
                            e.stop_propagation();
                            selected.set(None);
                            start.set(Some(cid));
                        }, "Start →" }
                    },
                    "open" => rsx! {
                        button { class: "btn btn-ghost", onclick: move |e| {
                            e.stop_propagation();
                            selected.set(None);
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
