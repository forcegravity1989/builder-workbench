//! 项目内 · 总览。结构照 `docs/hifi/overview-36.html`:横幅、名片|北极星、
//! 版本计划与进展、滞后+引领合图、项目指标 · SDLC。

mod metrics;
mod version;

use crate::{
    bridge::{Bridge, Panel, PanelNav, Req},
    chrome::light_dot,
    vm::ProjectVm,
};
use bw::command::{Command, ProjectIntent};
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let nav = use_context::<PanelNav>();
    let editing = use_signal(|| false);
    let draft = use_signal(CardDraft::default);

    rsx! {
        section { class: "ov-stack", "data-screen": "overview",
            if let Some(pending) = p.bootstrap_pending.clone() {
                {bootstrap_banner(pending, &bridge, nav)}
            }
            div { class: "ov-top-row",
                {card_block(&p, &bridge, editing, draft)}
                {north_star_block(&p, &bridge)}
            }
            version::VersionPlan { p: p.clone(), bridge: bridge.clone() }
            metrics::BizMetrics { p: p.clone(), bridge: bridge.clone() }
            metrics::SdlcMetrics { p: p.clone(), bridge: bridge.clone() }
        }
    }
}

fn bootstrap_banner(mr: crate::vm::CardMrVm, bridge: &Bridge, nav: PanelNav) -> Element {
    let b = bridge.clone();
    let id = mr.issue_id;
    let pr = if mr.pr_number > 0 {
        format!("MR !{}", mr.pr_number)
    } else {
        "还没提 MR".to_string()
    };
    rsx! {
        div { class: "ov-banner",
            span {
                "项目约定还没合进默认分支 · #{mr.number}「{mr.status}」· {pr}。不合入的话别人再纳入看不见这次改动。"
            }
            if mr.mergeable {
                if let Some(id) = id {
                    if mr.has_open_mr {
                        button {
                            class: "btn btn-primary",
                            onclick: move |_| b.cmd(Command::MergeAndSettle { id }),
                            "合入并完成"
                        }
                    }
                }
            }
            button {
                class: "btn btn-secondary",
                onclick: move |_| nav.go(Panel::Plan),
                "去计划屏"
            }
        }
    }
}

#[derive(Clone, Default)]
struct CardDraft {
    brief: String,
    benchmark: String,
    north: String,
    chat_provider: String,
    chat_group: String,
    notify: Vec<bool>,
}

impl CardDraft {
    fn from_project(p: &ProjectVm) -> Self {
        let ev = &p.config.chat_events;
        let on = |i: usize| ev.get(i).map(|(_, o)| *o).unwrap_or(ev.is_empty());
        let provider = if p.config.chat_provider == "未配" {
            String::new()
        } else {
            p.config.chat_provider.clone()
        };
        let group = if p.config.chat_group == "—" {
            String::new()
        } else {
            p.config.chat_group.clone()
        };
        Self {
            brief: p.card.brief.clone(),
            benchmark: p.card.benchmark.clone(),
            north: p.card.north_star.clone(),
            chat_provider: provider,
            chat_group: group,
            notify: bw::chat::NotifyEvent::ALL
                .iter()
                .enumerate()
                .map(|(i, _)| on(i))
                .collect(),
        }
    }

    fn notify_keys(&self) -> Vec<String> {
        bw::chat::NotifyEvent::ALL
            .iter()
            .zip(self.notify.iter().chain(std::iter::repeat(&false)))
            .filter(|(_, on)| **on)
            .map(|(e, _)| e.key().to_string())
            .collect()
    }
}

fn card_block(
    p: &ProjectVm,
    bridge: &Bridge,
    mut editing: Signal<bool>,
    mut draft: Signal<CardDraft>,
) -> Element {
    let c = &p.card;
    let is_editing = *editing.read();
    let b_edit = bridge.clone();
    let b_pull = bridge.clone();
    let b_ver = bridge.clone();
    let covering = p.covering_versions.clone();
    let selected_ver = p.card.current_version_raw.clone();
    let pid = p.id;
    let name = p.name.clone();

    let start_edit = {
        let seed = CardDraft::from_project(p);
        move |_| {
            draft.set(seed.clone());
            editing.set(true);
        }
    };

    rsx! {
        div { class: "card ov-block",
            div { class: "ov-head-row",
                div { class: "ov-name-row",
                    span { class: "charter-name", "{name}" }
                    {light_dot(p.health.signal, false)}
                    span { class: "ov-health-word", "{crate::theme::signal_label(p.health.signal)}" }
                    if !selected_ver.is_empty() {
                        span { class: "tag tag-outline mono", "{selected_ver} · 本周" }
                    }
                }
                if !is_editing {
                    span { class: "row",
                        button {
                            class: "btn btn-secondary",
                            title: "把工作区的主检出快进到远端最新(git pull --ff-only)",
                            onclick: move |_| b_pull.cmd(Command::PullWorkspace { project_id: pid }),
                            "↻ 拉到最新"
                        }
                        button { class: "btn btn-secondary", onclick: start_edit, "编辑" }
                    }
                }
            }
            if is_editing {
                div { class: "field",
                    label { "想做什么" }
                    textarea {
                        class: "input",
                        value: "{draft.read().brief}",
                        oninput: move |e| draft.write().brief = e.value(),
                    }
                }
                div { class: "field",
                    label { "最像的对标" }
                    input {
                        class: "input",
                        value: "{draft.read().benchmark}",
                        oninput: move |e| draft.write().benchmark = e.value(),
                    }
                }
                div { class: "field",
                    label { "三个月长成什么样(北极星)" }
                    textarea {
                        class: "input",
                        value: "{draft.read().north}",
                        oninput: move |e| draft.write().north = e.value(),
                    }
                }
                div { class: "field",
                    label { "在研版本" }
                    select {
                        class: "input mono",
                        value: "{selected_ver}",
                        onchange: move |e| b_ver.send(Req::SelectOverviewVersion(e.value())),
                        if covering.is_empty() {
                            option { value: "", selected: true, "（空）" }
                        }
                        for name in covering.iter() {
                            option {
                                value: "{name}",
                                selected: name.as_str() == selected_ver.as_str(),
                                "{name}"
                            }
                        }
                    }
                }
                div { class: "field",
                    label { "项目群" }
                    select {
                        class: "input",
                        value: "{draft.read().chat_provider}",
                        onchange: move |e| draft.write().chat_provider = e.value(),
                        option { value: "", "不配" }
                        option { value: "welink", "WeLink" }
                    }
                }
                if !draft.read().chat_provider.is_empty() {
                    div { class: "field",
                        label { "群号" }
                        input {
                            class: "input mono",
                            value: "{draft.read().chat_group}",
                            oninput: move |e| draft.write().chat_group = e.value(),
                        }
                    }
                    div { class: "field",
                        label { "同步哪些通知" }
                        div { class: "row-wrap",
                            for (i, ev) in bw::chat::NotifyEvent::ALL.iter().enumerate() {
                                label {
                                    input {
                                        r#type: "checkbox",
                                        checked: draft.read().notify.get(i).copied().unwrap_or(false),
                                        oninput: move |e| {
                                            if let Some(slot) = draft.write().notify.get_mut(i) {
                                                *slot = e.checked();
                                            }
                                        },
                                    }
                                    " {ev.label()}"
                                }
                            }
                        }
                    }
                }
                div { class: "row",
                    button {
                        class: "btn btn-secondary ml-auto",
                        onclick: move |_| editing.set(false),
                        "取消"
                    }
                    button {
                        class: "btn btn-primary",
                        onclick: move |_| {
                            let d = draft.read().clone();
                            let chat_notify = d.notify_keys();
                            b_edit.cmd(Command::EditProjectCard {
                                project_id: pid,
                                intent: ProjectIntent {
                                    name: name.clone(),
                                    brief: d.brief,
                                    benchmark: d.benchmark,
                                    north_star: d.north,
                                    chat_provider: d.chat_provider.clone(),
                                    chat_group: d.chat_group.trim().to_string(),
                                    chat_notify,
                                },
                            });
                            editing.set(false);
                        },
                        "保存 · 建一张活提 MR"
                    }
                }
            } else {
                {charter_line("想做什么", &c.brief)}
                {charter_line("对标", &c.benchmark)}
                {charter_line("名片北极星", &c.north_star)}
                {charter_line("项目群", &c.chat)}
                div { class: "charter-meta",
                    span { class: "mono", "{c.remote}" }
                }
            }
        }
    }
}

fn charter_line(k: &str, v: &str) -> Element {
    rsx! {
        div { class: "charter-line",
            span { class: "k", "{k}" }
            "{v}"
        }
    }
}

fn north_star_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "card ov-block",
            div { class: "ov-kicker", "北极星" }
            if let Some(e) = p.metrics.error.as_ref() {
                div { class: "empty text-danger", "指标文件读不了:{e}" }
            } else {
                match p.metrics.north_star.as_ref() {
                    Some(m) => {
                        let shown = metrics::shown_value(m);
                        let target = if m.target.is_empty() {
                            "目标未设".to_string()
                        } else {
                            format!("目标 {}", m.target)
                        };
                        rsx! {
                            div { class: "ov-north-name", title: "{m.def}", "{m.name}" }
                            div { class: "ov-north-row",
                                span {
                                    class: if shown.is_none() { "ov-north-val text-muted" } else { "ov-north-val" },
                                    {shown.map(|s| s.as_str()).unwrap_or("—")}
                                }
                                span { class: "ov-north-tgt", "{target}" }
                                if shown.is_none() {
                                    span { class: "tag tag-neutral", "Unknown" }
                                }
                            }
                            if !m.collect_error.is_empty() {
                                div { class: "hint text-danger", "{m.collect_error}" }
                            }
                            if m.manual {
                                metrics::ManualFill {
                                    pid: p.id,
                                    name: m.name.clone(),
                                    current: shown.cloned().unwrap_or_default(),
                                    bridge: bridge.clone(),
                                }
                            }
                        }
                    }
                    None => rsx! { div { class: "empty", "还没定北极星。" } },
                }
            }
        }
    }
}
