//! 项目内 · 会话。只剩两个组件:**Orca**、**Open Design**。
//! 动作条 / 灌词条不要 —— 开工在计划屏(拖进进行中);停止、MR、评审在 Orca
//! 或计划屏拖列。buddy 不知道人在 Orca 里点了哪条会话,灌词条会对着错的活。
//!
//! 两个页签常驻:原型活默认停 Open Design,构建类默认停 Orca。
//! 没接到就如实说,不假装嵌进去。

mod orca_host;

use crate::bridge::{Bridge, Req};
use crate::vm::{ProjectVm, SessionTab};
use dioxus::prelude::*;
use std::cell::Cell;
use std::rc::Rc;
use std::time::Duration;

const FILL: &str = "display:flex;flex-direction:column;flex:1;height:100%;min-height:0;";

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let cur = p.workbench.tab;
    rsx! {
        div {
            class: "session-screen",
            "data-screen": "session",
            style: "{FILL}",
            div { class: "sess-col sess-midhead", style: "flex:none;",
                div { class: "sess-tabs",
                    TabBtn { label: "Orca".to_string(), tab: SessionTab::Orca, cur, bridge: bridge.clone() }
                    TabBtn { label: "Open Design".to_string(), tab: SessionTab::OpenDesign, cur, bridge: bridge.clone() }
                }
            }
            {mid_body(&p)}
        }
    }
}

#[component]
fn TabBtn(label: String, tab: SessionTab, cur: SessionTab, bridge: Bridge) -> Element {
    let b = bridge.clone();
    rsx! {
        div {
            class: if tab == cur { "sess-tab active" } else { "sess-tab" },
            onclick: move |_| b.send(Req::SessionTab(tab)),
            span { "{label}" }
        }
    }
}

fn mid_body(p: &ProjectVm) -> Element {
    match p.workbench.tab {
        SessionTab::Orca => rsx! { OrcaView {} },
        SessionTab::OpenDesign => rsx! {
            OpenDesignView { src: p.workbench.od_src.clone(), gen: p.workbench.od_gen }
        },
    }
}

/// Orca 走所属 wry 窗顶级打开 `BW_ORCA_WEB_URL`,不走 iframe。
#[component]
fn OrcaView() -> Element {
    let url = bw_engine::orca::web_embed_url();
    let alive = use_hook(|| Rc::new(Cell::new(true)));
    alive.set(true);
    use_drop({
        let alive = alive.clone();
        move || {
            alive.set(false);
            orca_host::hide();
        }
    });
    use_future({
        let alive = alive.clone();
        let src = url.clone();
        move || {
            let alive = alive.clone();
            let src = src.clone();
            async move {
                let Some(src) = src else {
                    return;
                };
                orca_host::show(&src).await;
                while alive.get() {
                    orca_host::place().await;
                    tokio::time::sleep(Duration::from_millis(80)).await;
                }
            }
        }
    });
    let body = "flex:1;min-height:0;width:100%;background:#fff;";
    if url.is_none() {
        return rsx! {
            div { class: "sess-col sess-midbody", id: "orca-host", style: "{body}",
                div {
                    style: "margin:auto;padding:24px;max-width:520px;text-align:center;\
                            color:var(--ink-3);font-size:13px;line-height:1.8;",
                    "还没接到 Orca 网页。把安装版「给 web 配对」的完整 URL 塞进启动环境 BW_ORCA_WEB_URL。"
                }
            }
        };
    }
    rsx! {
        div { class: "sess-col sess-midbody", id: "orca-host", style: "{body}" }
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
    let body_style = "flex:1;min-height:0;display:flex;flex-direction:column;height:100%;";
    if let Some(u) = u {
        let iframe_src = iframe_src(&u);
        return rsx! {
            div { class: "sess-col sess-midbody", style: "{body_style}",
                iframe {
                    key: "{gen}-{iframe_src}",
                    src: "{iframe_src}",
                    style: "flex:1;width:100%;height:100%;min-height:0;border:0;display:block;background:#fff;",
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
        div { class: "sess-col sess-midbody", style: "{body_style}",
            div {
                style: "margin:auto;padding:24px;max-width:520px;text-align:center;\
                        color:var(--ink-3);font-size:13px;line-height:1.8;white-space:pre-wrap;",
                "{msg}"
                button {
                    class: "btn btn-sm btn-primary",
                    style: "margin-top:10px;",
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
