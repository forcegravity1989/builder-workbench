use crate::bridge::{Bridge, GuideNav, Req, TopView};
use crate::chrome::light_dot;
use crate::vm::{ProjectCardVm, ToolProbeVm, Vm};
use bw::Signal as HealthSignal;
use dioxus::prelude::*;

#[component]
pub fn View(vm: Vm, bridge: Bridge, go_top: EventHandler<TopView>) -> Element {
    let (vm, bridge) = (&vm, &bridge);
    let counts = Counts::of(&vm.projects);
    // hook 放在组件中，不能在逐卡渲染的循环里调用。
    let guide = use_context::<GuideNav>();
    let asking = use_signal(|| None::<bw::model::ProjectId>);
    rsx! {
        section {
            "data-screen": "wall",
            div { class: "page-head",
                div {
                    h1 { "项目墙" }
                }
                div { class: "page-actions",
                    button {
                        class: "btn btn-secondary",
                        title: "刷新项目数据",
                        onclick: {
                            let b = bridge.clone();
                            move |_| b.send(Req::Refresh)
                        },
                        "刷新"
                    }
                    button {
                        class: "btn btn-primary",
                        onclick: move |_| go_top(TopView::Onboard),
                        "+ 接入项目"
                    }
                }
            }

            {env_bar(&vm.env, guide)}

            div { class: "card healthbar",
                span { class: "bar-label", "健康概览" }
                {health_group(Some(HealthSignal::Green), "平稳", counts.green)}
                {health_group(Some(HealthSignal::Amber), "需要关注", counts.amber)}
                {health_group(Some(HealthSignal::Red), "异常", counts.red)}
                {health_group(None, "无数据", counts.unknown)}
                span { class: "ml-auto hint", "共 {vm.projects.len()} 个项目" }
            }

            if vm.projects.is_empty() {
                div { class: "card empty empty-center",
                    "还没有接入任何项目。"
                    br {}
                    "点击「接入项目」打开本地仓库或克隆远端仓库。"
                }
            } else {
                div { class: "wall-grid",
                    for p in vm.projects.iter() {
                        {project_card(p, bridge, asking)}
                    }
                }
            }
        }
    }
}

struct Counts {
    green: usize,
    amber: usize,
    red: usize,
    unknown: usize,
}

impl Counts {
    fn of(projects: &[ProjectCardVm]) -> Counts {
        let n = |s: Option<HealthSignal>| projects.iter().filter(|p| p.signal == s).count();
        Counts {
            green: n(Some(HealthSignal::Green)),
            amber: n(Some(HealthSignal::Amber)),
            red: n(Some(HealthSignal::Red)),
            unknown: n(Some(HealthSignal::Unknown)) + n(None),
        }
    }
}

fn health_group(s: Option<HealthSignal>, label: &str, n: usize) -> Element {
    rsx! {
        span { class: "health-group", {light_dot(s, false)} "{label} {n}" }
    }
}

fn env_bar(env: &[ToolProbeVm], guide: GuideNav) -> Element {
    rsx! {
        div { class: "card envbar",
            span { class: "bar-label", "本机环境" }
            for t in env.iter() {
                {env_item(t, guide)}
            }
        }
    }
}

fn env_item(t: &ToolProbeVm, guide: GuideNav) -> Element {
    let (text, fail) = match t.ok {
        Some(true) => ("可用", false),
        Some(false) => ("不可用", true),
        None => ("未检测", false),
    };
    rsx! {
        span {
            key: "{t.name}",
            class: if fail { "env-item fail" } else { "env-item" },
            title: "{t.detail}",
            {light_dot(dot_of(t.ok), false)}
            "{t.label} · {text}"
            if fail {
                span {
                    class: "env-help",
                    onclick: move |_| guide.open("u-import"),
                    "怎么处理 →"
                }
            }
        }
    }
}

fn dot_of(ok: Option<bool>) -> Option<HealthSignal> {
    match ok {
        Some(true) => Some(HealthSignal::Green),
        Some(false) => Some(HealthSignal::Red),
        None => None,
    }
}

fn project_card(
    p: &ProjectCardVm,
    bridge: &Bridge,
    mut asking: Signal<Option<bw::model::ProjectId>>,
) -> Element {
    let b = bridge.clone();
    let b_del = bridge.clone();
    let id = p.id;
    let confirming = *asking.read() == Some(id);
    let pct = (p.week_done * 100).checked_div(p.week_total).unwrap_or(0);
    let goal = if p.week_goal.trim().is_empty() {
        "版本目标:还没定".to_string()
    } else {
        let g = p.week_goal.trim();
        let short: String = g.chars().take(30).collect();
        format!(
            "版本目标:{short}{}",
            if g.chars().count() > 30 { "…" } else { "" }
        )
    };
    let delivery = if p.last_delivery.trim().is_empty() {
        "上次交付:仓里还没有发版记录".to_string()
    } else {
        format!("上次交付 {}", p.last_delivery)
    };
    rsx! {
        div {
            key: "{p.slug}",
            class: "card pcard",
            onclick: move |_| b.send(Req::Open(Some(id))),
            div { class: "pcard-top",
                if p.version.trim().is_empty() {
                    span { class: "tag tag-outline mono", title: "当前没有在研版本", "版本未定" }
                } else {
                    span { class: "tag tag-outline mono", "{p.version}" }
                }
                span { class: "tag tag-neutral", "{p.week}" }
                if p.unread > 0 {
                    span { class: "tag tag-accent", title: "待评审工作数量", "⚑ {p.unread}" }
                }
                span { class: "spacer" }
                {light_dot(p.signal, true)}
                span {
                    class: "pcard-x",
                    title: "从工作台移走(不删仓)",
                    onclick: move |e: MouseEvent| {
                        e.stop_propagation();
                        asking.set(if confirming { None } else { Some(id) });
                    },
                    "✕"
                }
            }
            div { class: "pcard-name", "{p.name}" }
            div { class: "pcard-oneliner",
                if p.brief.trim().is_empty() { "(还没填「想做什么」)" } else { "{p.brief}" }
            }
            div { class: "pcard-meta",
                span { "{goal}" }
                span { "{delivery}" }
            }
            if confirming {
                div {
                    class: "pcard-confirm",
                    onclick: move |e: MouseEvent| e.stop_propagation(),
                    div {
                        "把「" strong { "{p.name}" } "」从工作台移走?"
                        br {}
                        "将移除本机项目和会话记录，"
                        strong { "保留仓库与远端 Issue" }
                        "。"
                    }
                    div { class: "row",
                        button {
                            class: "btn btn-secondary",
                            onclick: move |e: MouseEvent| {
                                e.stop_propagation();
                                asking.set(None);
                            },
                            "取消"
                        }
                        button {
                            class: "btn btn-danger",
                            onclick: move |e: MouseEvent| {
                                e.stop_propagation();
                                asking.set(None);
                                b_del.cmd(bw::command::Command::RemoveProject { project_id: id });
                            },
                            "移走"
                        }
                    }
                }
            }
            div { class: "pcard-bar",
                div { class: "pcard-bar-fill", style: "width:{pct}%" }
            }
            div { class: "hint",
                if p.week_total == 0 {
                    "本周暂无排期"
                } else {
                    "本周 {p.week_done}/{p.week_total} 完成 · {p.remote}"
                }
            }
        }
    }
}
