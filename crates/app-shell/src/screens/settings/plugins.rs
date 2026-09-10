//! Plugins 列表 + 详情。两个 vendor 进仓的业界技能库,来源判据是
//! `standard/vendor/README.md`。见 spec.md §「插件」。

use crate::vm::PluginVm;
use dioxus::prelude::*;

#[component]
pub fn PluginsPage(items: Vec<PluginVm>) -> Element {
    let mut open = use_signal(|| None::<String>);

    let open_slug = open.read().clone();
    if let Some(slug) = open_slug {
        if let Some(item) = items.iter().find(|p| p.slug == slug).cloned() {
            return rsx! {
                PluginDetail { p: item, on_back: move |_| open.set(None) }
            };
        }
        open.set(None);
    }

    rsx! {
        div { class: "pane-head", h2 { "Plugins" } }
        div { class: "tbl-wrap",
            table { class: "table",
                thead {
                    tr {
                        th { style: "width:26%", "Plugin" }
                        th { style: "width:14%", "版本" }
                        th { class: "num", style: "width:12%", "skill" }
                        th { style: "width:34%", "谁用到" }
                        th { style: "width:10%", "许可" }
                        th { style: "width:4%" }
                    }
                }
                tbody {
                    if items.is_empty() {
                        tr { td { colspan: "6", class: "empty", "仓里没有 vendor 任何插件" } }
                    }
                    for p in items {
                        tr {
                            key: "{p.slug}",
                            class: "rowbtn",
                            tabindex: "0",
                            role: "button",
                            onclick: {
                                let slug = p.slug.clone();
                                move |_| open.set(Some(slug.clone()))
                            },
                            td { class: "t-name", "{p.name}" }
                            td { class: "mono", "{p.version}" }
                            td { class: "num", "{p.skill_count}" }
                            td { class: "t-sub",
                                if p.used_by.is_empty() { "没有 workflow 用它" } else { {p.used_by.join(" · ")} }
                            }
                            td { "MIT" }
                            td { class: "go", "›" }
                        }
                    }
                }
            }
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tab {
    Overview,
    Skills,
}

#[component]
fn PluginDetail(p: PluginVm, on_back: EventHandler<MouseEvent>) -> Element {
    let mut tab = use_signal(|| Tab::Overview);
    rsx! {
        button { class: "backlink", onclick: on_back,
            svg { view_box: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.7",
                path { d: "M10 3 5 8l5 5" }
            }
            "Plugins"
        }
        div { class: "dt-head",
            div { class: "dt-icon", "▣" }
            div { class: "grow",
                div { class: "dt-name", "{p.name}" }
                div { class: "dt-from", "{p.upstream} · {p.version}" }
            }
            if !p.used_by.is_empty() {
                div { class: "dt-act",
                    span { class: "status status-done", span { class: "status-dot" } "{p.used_by.len()} 个阶段在用" }
                }
            }
        }

        div { class: "tabs", role: "tablist",
            button {
                class: "tab",
                "aria-selected": if *tab.read() == Tab::Overview { "true" } else { "false" },
                onclick: move |_| tab.set(Tab::Overview),
                "Overview"
            }
            button {
                class: "tab",
                "aria-selected": if *tab.read() == Tab::Skills { "true" } else { "false" },
                onclick: move |_| tab.set(Tab::Skills),
                "Skills · {p.skill_count}"
            }
        }

        match *tab.read() {
            Tab::Overview => rsx! {
                dl { class: "kv",
                    dt { "上游" }
                    dd { "{p.upstream}" }
                    dt { "版本" }
                    dd { "{p.version}" }
                    dt { "许可" }
                    dd { "{p.license}" }
                    dt { "技能数" }
                    dd { "{p.skill_count}" }
                    dt { "谁用到" }
                    dd {
                        if p.used_by.is_empty() { "没有 workflow 用它" } else { {p.used_by.join(" · ")} }
                    }
                }
                div { class: "todo-note",
                    "打包机制未实现 —— Skills 页签列的 {p.skill_count} 个眼下一个都注入不了,不像 Claude 的插件详情能直接跳过去用。"
                }
            },
            Tab::Skills => rsx! {
                for g in &p.groups {
                    div { class: "skillgroup", key: "{g.name}",
                        h4 { class: "section-title", "{g.name} · {g.skills.len()}" }
                        div { class: "skillchips",
                            for s in &g.skills {
                                span { class: "skillchip", key: "{s}", "{s}" }
                            }
                        }
                    }
                }
            },
        }
    }
}
