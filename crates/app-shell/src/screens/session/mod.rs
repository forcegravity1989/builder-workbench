//! 项目内 · 会话。只剩两个组件:**Orca**、**Open Design**。
//! 动作条 / 灌词条不要 —— 开工在计划屏(拖进进行中);停止、MR、评审在 Orca
//! 或计划屏拖列。Workbench 不知道人在 Orca 里点了哪条会话,灌词条会对着错的活。
//!
//! 两个页签常驻:原型活默认停 Open Design,构建类默认停 Orca。
//! 没接到就如实说,不假装嵌进去。Orca / Open Design 都走 iframe。

use crate::bridge::{Bridge, ChromeBusy, Req};
use crate::vm::{ProjectVm, SessionTab};
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let cur = p.workbench.tab;
    rsx! {
        div { class: "session-screen", "data-screen": "session",
            div { class: "card sess-col",
                div { class: "tabs", role: "tablist",
                    TabBtn { label: "Orca".to_string(), tab: SessionTab::Orca, cur, bridge: bridge.clone() }
                    TabBtn { label: "Open Design".to_string(), tab: SessionTab::OpenDesign, cur, bridge: bridge.clone() }
                }
                {mid_body(&p, bridge.clone())}
            }
        }
    }
}

#[component]
fn TabBtn(label: String, tab: SessionTab, cur: SessionTab, bridge: Bridge) -> Element {
    let b = bridge.clone();
    rsx! {
        button {
            class: "tab",
            role: "tab",
            aria_selected: if tab == cur { "true" },
            onclick: move |_| b.send(Req::SessionTab(tab)),
            "{label}"
        }
    }
}

fn mid_body(p: &ProjectVm, bridge: Bridge) -> Element {
    match p.workbench.tab {
        SessionTab::Orca => {
            rsx! { OrcaView { orca_url: p.workbench.orca_web_url.clone(), bridge } }
        }
        SessionTab::OpenDesign => rsx! {
            OpenDesignView { src: p.workbench.od_src.clone(), gen: p.workbench.od_gen }
        },
    }
}

/// 本机 Orca web 的 pairing 页,iframe 嵌。地址来自本机设置
/// (`settings.toml` 的 `orca_web_url`),`BW_ORCA_WEB_URL` 可覆盖;都只认 loopback。
#[component]
fn OrcaView(orca_url: String, bridge: Bridge) -> Element {
    let starting = use_context::<ChromeBusy>().get().is_some();
    let url = bw_engine::orca::web_embed_url(Some(&orca_url));
    if starting {
        return rsx! {
            div { class: "sess-midbody" }
        };
    }
    if let Some(u) = url {
        let iframe_src = iframe_src(&u);
        let ready = bridge.clone();
        return rsx! {
            div { class: "sess-midbody",
                iframe {
                    key: "{iframe_src}",
                    src: "{iframe_src}",
                    class: "sess-frame",
                    allow: "clipboard-read; clipboard-write; fullscreen",
                    onload: move |_| ready.send(Req::OrcaEmbedReady)
                }
            }
        };
    }
    rsx! {
        div { class: "sess-midbody",
            div { class: "sess-empty",
                "还没接到 Orca 网页。到顶层设置贴「给 web 配对」的完整 URL。"
            }
        }
    }
}

/// 本机 Open Design 的 loopback 首页。探活走 `discover_web_url`。
#[component]
fn OpenDesignView(src: String, gen: u64) -> Element {
    let mut url = use_signal(|| None::<String>);
    let mut probing = use_signal(|| src.is_empty());
    let mut fut = use_future(move || async move {
        let found = bw_engine::open_design::discover_web_url().await;
        url.set(found);
        probing.set(false);
    });
    let probing_now = *probing.read() && src.is_empty();
    let u = if src.is_empty() {
        (*url.read()).clone()
    } else {
        Some(src.clone())
    };
    if let Some(u) = u {
        let iframe_src = iframe_src(&u);
        return rsx! {
            div { class: "sess-midbody",
                iframe {
                    key: "{gen}-{iframe_src}",
                    src: "{iframe_src}",
                    class: "sess-frame",
                    allow: "clipboard-read; clipboard-write; fullscreen"
                }
            }
        };
    }
    let msg = if probing_now {
        "正在找本机已打开的 Open Design…".to_string()
    } else {
        "还没接到 Open Design。先打开它,再点「重新发现」。".to_string()
    };
    rsx! {
        div { class: "sess-midbody",
            div { class: "sess-empty",
                div {
                    "{msg}"
                    div {
                        button {
                            class: "btn btn-primary",
                            disabled: probing_now,
                            onclick: move |_| {
                                probing.set(true);
                                url.set(None);
                                fut.restart();
                            },
                            "重新发现"
                        }
                    }
                }
            }
        }
    }
}

fn iframe_src(u: &str) -> String {
    let u = u.trim();
    if u.contains('?') || u.contains('#') || u.ends_with('/') {
        return u.to_string();
    }
    let after = u.strip_prefix("http://").unwrap_or(u);
    if after.contains('/') {
        u.to_string()
    } else {
        format!("{u}/")
    }
}
