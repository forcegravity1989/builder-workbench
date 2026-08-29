//! 项目内 · 会话。只剩两个组件:**Orca**、**Open Design**。
//! 动作条 / 灌词条不要 —— 开工在计划屏(拖进进行中);停止、MR、评审在 Orca
//! 或计划屏拖列。buddy 不知道人在 Orca 里点了哪条会话,灌词条会对着错的活。
//!
//! 两个页签常驻:原型活默认停 Open Design,构建类默认停 Orca。
//! 没接到就如实说,不假装嵌进去。

use crate::bridge::{Bridge, Req};
use crate::vm::{ProjectVm, SessionTab};
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let (p, bridge) = (&p, &bridge);
    rsx! {
        div {
            class: "session-screen",
            style: "display:flex;flex-direction:column;height:100%;min-height:0;",
            div { class: "sess-col sess-midhead",
                {tabs(p, bridge)}
            }
            {mid_body(p)}
        }
    }
}

fn tabs(p: &ProjectVm, bridge: &Bridge) -> Element {
    let cur = p.workbench.tab;
    rsx! {
        div { class: "sess-tabs",
            {tab_btn("Orca", SessionTab::Orca, cur, bridge)}
            {tab_btn("Open Design", SessionTab::OpenDesign, cur, bridge)}
        }
    }
}

fn tab_btn(label: &str, tab: SessionTab, cur: SessionTab, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let label = label.to_string();
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

/// 把本机已开的 Orca **网页**嵌进会话屏。产品意图就是在这里看、在这里聊,
/// 不是让人再去 Orca 桌面窗口。跳会话靠计划屏开工打 pipe,不改 iframe src、
/// 不 postMessage。
///
/// 嵌进来要带配对 URL。buddy 自己 mint 不到配对码,人从安装版「给 web 配对」
/// 拿完整地址塞进 `BW_ORCA_WEB_URL`。没喂则这页空着(缺口,不是改去桌面看)。
#[component]
fn OrcaView() -> Element {
    let mut url = use_signal(|| None::<String>);
    let mut probing = use_signal(|| true);
    let mut fut = use_future(move || async move {
        url.set(bw_engine::orca::web_embed_url());
        probing.set(false);
    });
    let body_style = "flex:1;min-height:0;display:flex;flex-direction:column;";
    if let Some(u) = (*url.read()).clone() {
        let iframe_src = iframe_src(&u);
        return rsx! {
            div { class: "sess-col sess-midbody", style: "{body_style}",
                iframe {
                    key: "orca-{iframe_src}",
                    src: "{iframe_src}",
                    style: "flex:1;width:100%;height:100%;border:0;display:block;background:#fff;",
                    allow: "clipboard-read; clipboard-write; fullscreen"
                }
            }
        };
    }
    let msg = if *probing.read() {
        "正在找本机已打开的 Orca…"
    } else {
        "会话屏要把 Orca 嵌在这里,现在还没接到它的网页。\n\
         先打开安装版 Orca,用「给 web 配对」复制整段\n\
         http://127.0.0.1:<端口>/web-index.html#pairing=…\n\
         设成环境变量 BW_ORCA_WEB_URL,再开 buddy,点「重新发现」。\n\
         不带 #pairing= 的地址进不去同一份桌面状态。"
    };
    rsx! {
        div { class: "sess-col sess-midbody", style: "{body_style}",
            div {
                style: "margin:auto;padding:24px;max-width:580px;text-align:center;\
                        color:var(--ink-3);font-size:13px;line-height:1.8;white-space:pre-wrap;",
                "{msg}"
                button {
                    class: "btn btn-sm btn-primary",
                    style: "margin-top:10px;",
                    disabled: *probing.read(),
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
    let body_style = "flex:1;min-height:0;display:flex;flex-direction:column;";
    if let Some(u) = u {
        let iframe_src = iframe_src(&u);
        return rsx! {
            div { class: "sess-col sess-midbody", style: "{body_style}",
                iframe {
                    key: "{gen}-{iframe_src}",
                    src: "{iframe_src}",
                    style: "flex:1;width:100%;height:100%;border:0;display:block;background:#fff;",
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
