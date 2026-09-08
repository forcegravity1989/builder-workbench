//! 总览业务图(滞后+引领)与项目指标 · SDLC。

use crate::{
    bridge::Bridge,
    chrome::sparkline::{self, MultiSeries, Series},
    vm::{MetricCardVm, ProjectVm, RepoStatsVm, TrendPointVm},
};
use bw::{command::Command, model::ProjectId};
use dioxus::prelude::*;
use std::collections::HashSet;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Grain {
    Week,
    Day,
}

const TAB_MAIN: &str = "主要";
const LAG_COLOR: &str = "var(--color-accent)";
const LEAD_COLORS: [&str; 4] = [
    "var(--color-accent-2)",
    "var(--color-success)",
    "var(--color-warning)",
    "var(--color-neutral-600)",
];

#[component]
pub fn BizMetrics(p: ProjectVm, bridge: Bridge) -> Element {
    let tabs = feature_tabs(&p.metrics.lagging, &p.metrics.leading);
    let mut tab = use_signal(|| TAB_MAIN.to_string());
    let grain = use_signal(|| Grain::Week);
    let off = use_signal(HashSet::<String>::new);
    let chosen = tab();
    let plots = plots_for(&chosen, &p.metrics.lagging, &p.metrics.leading);
    let b = bridge.clone();
    let pid = p.id;
    let day = grain() == Grain::Day;
    let multi = plots.len() > 1;

    rsx! {
        div { class: "card ov-block",
            div { class: "ov-head-row",
                div { class: "ov-block-title", "滞后性指标和引领性指标" }
                {grain_seg(grain, "biz-grain")}
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| b.send(crate::bridge::Req::CollectMetrics),
                    "立即采集"
                }
            }
            div { class: "tabs ov-tabs", role: "tablist",
                for t in tabs.iter() {
                    button {
                        key: "{t}",
                        class: "tab",
                        role: "tab",
                        aria_selected: if t == &chosen { "true" },
                        onclick: {
                            let t = t.clone();
                            move |_| tab.set(t.clone())
                        },
                        "{tab_label(t)}"
                    }
                }
            }
            if let Some(e) = p.metrics.error.as_ref() {
                div { class: "empty text-danger", "指标文件读不了:{e}" }
            } else if let Some(n) = p.metrics.note.as_ref() {
                div { class: "empty", "{n}" }
            } else if plots.is_empty() {
                div { class: "empty", "这一档还没有指标。" }
            } else {
                div { class: if multi { "ov-plots is-multi" } else { "ov-plots" },
                    for (i, (lag, leads)) in plots.iter().enumerate() {
                        {plot_block(lag, leads, day, pid, &bridge, off, i)}
                    }
                }
            }
        }
    }
}

fn plot_block(
    lag: &MetricCardVm,
    leads: &[&MetricCardVm],
    day: bool,
    pid: ProjectId,
    bridge: &Bridge,
    off: Signal<HashSet<String>>,
    idx: usize,
) -> Element {
    let hidden = off();
    let mut rows: Vec<(&MetricCardVm, bool, &'static str)> = vec![(lag, false, LAG_COLOR)];
    for (i, lead) in leads.iter().copied().enumerate() {
        rows.push((lead, true, LEAD_COLORS[i % LEAD_COLORS.len()]));
    }
    let series: Vec<MultiSeries> = rows
        .iter()
        .map(|(m, right, color)| MultiSeries {
            name: m.name.clone(),
            points: points_of(m, day),
            color,
            right: *right,
            fill: !*right,
            on: !hidden.contains(&m.name),
        })
        .collect();

    rsx! {
        div { class: "ov-plot", key: "{idx}-{lag.id}",
            div { class: "ov-series",
                for (m, right, color) in rows.iter() {
                    {series_row(m, *right, color, pid, bridge, off)}
                }
            }
            {sparkline::trend_chart_multi(&series)}
        }
    }
}

fn series_row(
    m: &MetricCardVm,
    right: bool,
    color: &'static str,
    pid: ProjectId,
    bridge: &Bridge,
    mut off: Signal<HashSet<String>>,
) -> Element {
    let on = !off().contains(&m.name);
    let name = m.name.clone();
    let shown = shown_value(m).cloned().unwrap_or_else(|| "—".into());
    let target = if m.target.is_empty() {
        "未设".to_string()
    } else {
        m.target.clone()
    };
    let kind = if right { "引领" } else { "滞后" };
    rsx! {
        div { class: if on { "ov-series-row" } else { "ov-series-row off" },
            style: "--swatch:{color}",
            label { class: "ov-series-toggle",
                input {
                    r#type: "checkbox",
                    checked: on,
                    oninput: move |_| {
                        let mut s = off();
                        if s.contains(&name) {
                            s.remove(&name);
                        } else {
                            s.insert(name.clone());
                        }
                        off.set(s);
                    },
                }
                span { class: "ov-swatch" }
                span { class: "ov-series-name", title: "{m.def}", "{m.name}" }
                span { class: "ov-series-kind", "{kind}" }
            }
            span { class: "ov-series-val", "{shown}" }
            span { class: "ov-series-tgt", "{target}" }
            if !m.collect_error.is_empty() {
                span { class: "ov-series-err hint text-danger", "{m.collect_error}" }
            }
            if !right && m.manual {
                ManualFill {
                    pid,
                    name: m.name.clone(),
                    current: shown_value(m).cloned().unwrap_or_default(),
                    bridge: bridge.clone(),
                }
            }
        }
    }
}

#[component]
pub fn ManualFill(pid: ProjectId, name: String, current: String, bridge: Bridge) -> Element {
    let mut draft = use_signal(|| current);
    let b = bridge.clone();
    rsx! {
        div { class: "ov-manual",
            input {
                class: "input",
                value: "{draft}",
                placeholder: "今天这个数",
                aria_label: "{name}",
                oninput: move |e| draft.set(e.value()),
            }
            button {
                class: "btn btn-secondary",
                disabled: draft.read().trim().is_empty(),
                onclick: move |_| {
                    let v = draft.read().trim().to_string();
                    if v.is_empty() {
                        return;
                    }
                    b.cmd(Command::RecordManualMetric {
                        project_id: pid,
                        name: name.clone(),
                        value: v,
                    });
                },
                "记下"
            }
        }
    }
}

#[component]
pub fn SdlcMetrics(p: ProjectVm, bridge: Bridge) -> Element {
    let grain = use_signal(|| Grain::Week);
    let b = bridge.clone();
    let day = grain() == Grain::Day;
    rsx! {
        div { class: "card ov-block",
            div { class: "ov-head-row",
                div { class: "ov-block-title", "项目指标 · SDLC" }
                div { class: "ov-head-tools",
                    {grain_seg(grain, "sdlc-grain")}
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| b.send(crate::bridge::Req::CollectRepoStats),
                        "立即采集"
                    }
                }
            }
            match p.repo_stats.as_ref() {
                None => rsx! {
                    div { class: "empty", "还没采过。打开项目会自动采一轮,也可以点上面那颗按钮。" }
                },
                Some(s) if !s.error.is_empty() => rsx! {
                    div { class: "empty text-danger", "{s.error}" }
                },
                Some(s) => rsx! {
                    {sdlc_grid(s, day)}
                    if !s.git_note.is_empty() {
                        div { class: "hint", "{s.git_note}" }
                    }
                    if !s.trend_note.is_empty() {
                        div { class: "hint", "{s.trend_note}" }
                    }
                },
            }
        }
    }
}

fn sdlc_grid(s: &RepoStatsVm, day: bool) -> Element {
    let pts = if day { &s.day_trend } else { &s.trend };
    type Pick = fn(&TrendPointVm) -> Option<f64>;
    const LINES: [(&str, Pick, &str); 3] = [
        (
            "每周提交",
            |p| p.commits.map(|n| n as f64),
            "var(--color-accent)",
        ),
        (
            "每周合入的 PR",
            |p| p.merged_prs.map(|n| n as f64),
            "var(--color-accent-2)",
        ),
        (
            "未处理 issue",
            |p| p.open_issues.map(|n| n as f64),
            "var(--color-warning)",
        ),
    ];
    rsx! {
        div { class: "ov-sdlc",
            for (label, pick, color) in LINES {
                div { class: "ov-sdlc-cell", key: "{label}",
                    div { class: "ov-sdlc-head",
                        span { class: "name", "{label}" }
                        span { class: "val", "{last_known(pts, pick)}" }
                    }
                    {sparkline::trend_chart(&Series {
                        label: label.to_string(),
                        points: pts.iter().map(|p| (axis_label(&p.week), pick(p))).collect(),
                        color,
                    })}
                }
            }
        }
    }
}

fn last_known(pts: &[TrendPointVm], pick: fn(&TrendPointVm) -> Option<f64>) -> String {
    pts.iter()
        .rev()
        .find_map(pick)
        .map(|v| {
            if (v - v.round()).abs() < 0.05 {
                format!("{}", v.round() as i64)
            } else {
                format!("{v:.1}")
            }
        })
        .unwrap_or_else(|| "—".into())
}

fn grain_seg(mut grain: Signal<Grain>, name: &str) -> Element {
    let cur = grain();
    rsx! {
        div { class: "seg",
            label { class: "seg-opt",
                input {
                    r#type: "radio",
                    name: "{name}",
                    checked: cur == Grain::Week,
                    onchange: move |_| grain.set(Grain::Week),
                }
                "周"
            }
            label { class: "seg-opt",
                input {
                    r#type: "radio",
                    name: "{name}",
                    checked: cur == Grain::Day,
                    onchange: move |_| grain.set(Grain::Day),
                }
                "天"
            }
        }
    }
}

fn feature_of(m: &MetricCardVm) -> String {
    let f = m.feature.trim();
    if f.is_empty() {
        TAB_MAIN.into()
    } else {
        f.to_string()
    }
}

fn tab_label(key: &str) -> String {
    if key == TAB_MAIN {
        TAB_MAIN.into()
    } else if key.ends_with("特性") {
        key.to_string()
    } else {
        format!("{key}特性")
    }
}

pub(super) fn feature_tabs(lagging: &[MetricCardVm], leading: &[MetricCardVm]) -> Vec<String> {
    let mut tabs = vec![TAB_MAIN.to_string()];
    for m in lagging.iter().chain(leading.iter()) {
        let f = feature_of(m);
        if f != TAB_MAIN && !tabs.iter().any(|t| t == &f) {
            tabs.push(f);
        }
    }
    tabs
}

/// 该页签要画的图。只有引领、没有滞后的特性不另开空图,那些引领落到主要第一条。
pub(super) fn plots_for<'a>(
    tab: &str,
    lagging: &'a [MetricCardVm],
    leading: &'a [MetricCardVm],
) -> Vec<(&'a MetricCardVm, Vec<&'a MetricCardVm>)> {
    let lags: Vec<&'a MetricCardVm> = lagging.iter().filter(|m| feature_of(m) == tab).collect();
    if lags.is_empty() {
        return Vec::new();
    }
    let mut leads: Vec<&'a MetricCardVm> =
        leading.iter().filter(|m| feature_of(m) == tab).collect();
    if tab == TAB_MAIN {
        for m in leading {
            let f = feature_of(m);
            if f != TAB_MAIN && !lagging.iter().any(|l| feature_of(l) == f) {
                leads.push(m);
            }
        }
    }
    let first = lags[0].name.as_str();
    lags.into_iter()
        .map(|lag| {
            let kids: Vec<&'a MetricCardVm> = leads
                .iter()
                .copied()
                .filter(|lead| lead_target(lead, &lags_names(lagging, tab), first) == lag.name)
                .collect();
            (lag, kids)
        })
        .collect()
}

fn lags_names(lagging: &[MetricCardVm], tab: &str) -> Vec<String> {
    lagging
        .iter()
        .filter(|m| feature_of(m) == tab)
        .map(|m| m.name.clone())
        .collect()
}

fn lead_target(lead: &MetricCardVm, lag_names: &[String], first: &str) -> String {
    let k = lead.leads.trim();
    if !k.is_empty() && lag_names.iter().any(|n| n == k) {
        k.to_string()
    } else {
        first.to_string()
    }
}

fn points_of(m: &MetricCardVm, day: bool) -> Vec<(String, Option<f64>)> {
    let src = if day { &m.day_trend } else { &m.trend };
    src.iter().map(|(l, v)| (axis_label(l), *v)).collect()
}

fn axis_label(raw: &str) -> String {
    if let Some((_, w)) = raw.split_once("-W") {
        format!("W{w}")
    } else if raw.len() >= 10 {
        raw[5..].to_string()
    } else {
        raw.to_string()
    }
}

pub(super) fn shown_value(m: &MetricCardVm) -> Option<&String> {
    if m.manual {
        m.reading.as_ref().or(m.collected.as_ref())
    } else {
        m.collected.as_ref().or(m.reading.as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(name: &str, feature: &str, leads: &str) -> MetricCardVm {
        MetricCardVm {
            id: name.into(),
            name: name.into(),
            reading: None,
            target: String::new(),
            def: String::new(),
            manual: false,
            source: String::new(),
            collected_at: String::new(),
            driving: vec![],
            class: String::new(),
            collected: None,
            trend: vec![],
            day_trend: vec![],
            feature: feature.into(),
            leads: leads.into(),
            collect_error: String::new(),
        }
    }

    #[test]
    fn tab_label_adds_特性() {
        assert_eq!(tab_label(TAB_MAIN), "主要");
        assert_eq!(tab_label("会话"), "会话特性");
        assert_eq!(tab_label("会话特性"), "会话特性");
    }

    #[test]
    fn empty_feature_is_overall_tab() {
        let lags = vec![card("滞后甲", "", "")];
        let leads = vec![card("引领甲", "", "滞后甲")];
        assert_eq!(feature_tabs(&lags, &leads), vec![TAB_MAIN.to_string()]);
        let plots = plots_for(TAB_MAIN, &lags, &leads);
        assert_eq!(plots.len(), 1);
        assert_eq!(plots[0].0.name, "滞后甲");
        assert_eq!(plots[0].1.len(), 1);
        assert_eq!(plots[0].1[0].name, "引领甲");
    }

    #[test]
    fn missing_leads_attaches_to_first_lag() {
        let lags = vec![card("滞后甲", "", ""), card("滞后乙", "", "")];
        let leads = vec![card("引领甲", "", "")];
        let plots = plots_for(TAB_MAIN, &lags, &leads);
        assert_eq!(plots[0].1.len(), 1);
        assert!(plots[1].1.is_empty());
    }

    #[test]
    fn named_leads_attaches_to_second_lag() {
        let lags = vec![card("滞后甲", "", ""), card("滞后乙", "", "")];
        let leads = vec![card("引领乙", "", "滞后乙")];
        let plots = plots_for(TAB_MAIN, &lags, &leads);
        assert!(plots[0].1.is_empty());
        assert_eq!(plots[1].1.len(), 1);
        assert_eq!(plots[1].1[0].name, "引领乙");
    }

    #[test]
    fn orphan_feature_lead_falls_to_overall() {
        let lags = vec![card("滞后甲", "", "")];
        let leads = vec![card("引领甲", "某特性", "")];
        assert_eq!(
            feature_tabs(&lags, &leads),
            vec![TAB_MAIN.to_string(), "某特性".to_string()]
        );
        assert!(plots_for("某特性", &lags, &leads).is_empty());
        let overall = plots_for(TAB_MAIN, &lags, &leads);
        assert_eq!(overall[0].1.len(), 1);
        assert_eq!(overall[0].1[0].name, "引领甲");
    }
}
