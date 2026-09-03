//! 总览「版本计划与进展」。页签 = 当天在研 + 已发历史;框高 6 行。

use crate::{
    bridge::{Bridge, Req},
    vm::{ProjectVm, WeekCountsVm},
};
use dioxus::prelude::*;

#[component]
pub fn VersionPlan(p: ProjectVm, bridge: Bridge) -> Element {
    let tabs = version_tabs(&p);
    let start = if tabs.iter().any(|(k, _)| k == &p.confirmed_version) {
        p.confirmed_version.clone()
    } else {
        tabs.first().map(|(k, _)| k.clone()).unwrap_or_default()
    };
    let mut sel = use_signal(|| start);
    let chosen = sel();
    let covering = p.covering_versions.clone();
    let b = bridge.clone();
    let ver = p
        .plan_versions
        .iter()
        .find(|v| v.name == chosen)
        .cloned()
        .unwrap_or_default();
    let counts = if ver.name.is_empty() {
        if chosen == p.confirmed_version {
            p.week_counts.clone()
        } else {
            WeekCountsVm::default()
        }
    } else {
        ver.counts.clone()
    };
    let released = ver.released || p.releases.iter().any(|r| r.version == chosen);
    let goal = ver.goal;
    let tag = if chosen.is_empty() {
        ""
    } else if released {
        "已发版"
    } else {
        "进行中"
    };

    rsx! {
        div { class: "card ov-block",
            div { class: "ov-card-head",
                div { class: "ov-head-row",
                    div { class: "ov-block-title", "版本计划与进展" }
                    if !tag.is_empty() {
                        span { class: if released { "chip chip-gray" } else { "chip chip-clay" }, "{tag}" }
                    }
                }
                if !tabs.is_empty() {
                    div { class: "ov-tabs", role: "tablist",
                        for (key, label) in tabs.iter() {
                            button {
                                key: "{key}",
                                class: if *key == chosen { "ov-tab on" } else { "ov-tab" },
                                role: "tab",
                                onclick: {
                                    let key = key.clone();
                                    let covering = covering.clone();
                                    let b = b.clone();
                                    move |_| {
                                        sel.set(key.clone());
                                        if covering.iter().any(|n| n == &key) {
                                            b.send(Req::SelectOverviewVersion(key.clone()));
                                        }
                                    }
                                },
                                "{label}"
                            }
                        }
                    }
                }
            }
            if chosen.is_empty() {
                div { class: "detail-empty", "还没有版本。" }
            } else {
                div { class: "ov-goal-week",
                    div {
                        div { class: "ov-kicker", "版本目标" }
                        div { class: "ov-text-box",
                            if goal.trim().is_empty() {
                                span { class: "detail-empty", "还没有版本目标" }
                            } else {
                                "{goal}"
                            }
                        }
                    }
                    div {
                        div { class: "ov-kicker", "每周进展" }
                        div { class: "ov-text-box",
                            span { class: "detail-empty", "还没有周进展" }
                        }
                    }
                }
                {progress_bar(&counts)}
            }
        }
    }
}

fn version_tabs(p: &ProjectVm) -> Vec<(String, String)> {
    let mut tabs: Vec<(String, String)> = Vec::new();
    let push = |tabs: &mut Vec<(String, String)>, name: &str, label: String| {
        if name.is_empty() || tabs.iter().any(|(k, _)| k == name) {
            return;
        }
        tabs.push((name.to_string(), label));
    };
    for name in &p.covering_versions {
        push(&mut tabs, name, format!("{name} · 本周"));
    }
    if tabs.is_empty() && !p.confirmed_version.is_empty() {
        push(
            &mut tabs,
            &p.confirmed_version,
            format!("{} · 本周", p.confirmed_version),
        );
    }
    for v in &p.plan_versions {
        if v.released {
            push(&mut tabs, &v.name, v.name.clone());
        }
    }
    for r in &p.releases {
        push(&mut tabs, &r.version, r.version.clone());
    }
    tabs
}

fn progress_bar(c: &WeekCountsVm) -> Element {
    if c.total() == 0 {
        return rsx! {
            div { class: "week-counts",
                span { class: "detail-empty", "这一版还没有挂活" }
            }
        };
    }
    rsx! {
        div {
            div { class: "week-progress",
                div { style: "width:{c.pct(c.done)}%;background:var(--green);" }
                div { style: "width:{c.pct(c.review)}%;background:var(--amber);" }
                div { style: "width:{c.pct(c.doing)}%;background:var(--clay);" }
                div { style: "width:{c.pct(c.blocked)}%;background:var(--red);" }
                div { style: "width:{c.pct(c.todo)}%;background:#E4DDC8;" }
            }
            div { class: "week-counts",
                span { "待办 " b { "{c.todo}" } }
                span { "进行中 " b { "{c.doing}" } }
                span { "评审中 " b { "{c.review}" } }
                span { "完成 " b { "{c.done}" } }
                if c.blocked > 0 {
                    span { style: "color:var(--alert-deep);", "阻塞 " b { "{c.blocked}" } }
                }
            }
        }
    }
}
