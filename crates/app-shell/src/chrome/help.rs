//! 帮助:一个入口(侧栏底部那颗「帮助」)→ 一张浮层面板。
//!
//! 面板负责**找**:本机环境好不好、指南有哪几章、把问题报出去。指南正文另开
//! 一条宽抽屉负责**读** —— 一份完整的产品指南塞不进 380px 的面板。
//!
//! 章节目录是从指南 HTML 自己的侧栏扫出来的,**不在 Rust 里再抄一份**:目录写
//! 两遍,改了指南就会飘。

use crate::bridge::{Bridge, ChromeBusy, GuideNav, HelpNav, HelpTab, REPORTING, REPORTING_LOG};
use crate::chrome::{icon, light_dot};
use crate::vm::ToolProbeVm;
use bw::model::Signal;
use dioxus::prelude::*;

/// 指南正文编进二进制,不另写一套。
const GUIDE_HTML: &str = include_str!("../../../../docs/03-guide/v4-产品指南.html");

/// 从指南侧栏扫出目录:`<div class="nav-item" data-screen="u1"><svg…</svg>第 0 站 · 接入项目</div>`。
fn guide_toc() -> Vec<(&'static str, &'static str)> {
    let mut out = Vec::new();
    for seg in GUIDE_HTML.split("data-screen=\"").skip(1) {
        let Some((id, rest)) = seg.split_once('"') else {
            continue;
        };
        let Some((_, after)) = rest.split_once("</svg>") else {
            continue;
        };
        let Some((label, _)) = after.split_once('<') else {
            continue;
        };
        let label = label.trim();
        if !id.is_empty() && !label.is_empty() {
            out.push((id, label));
        }
    }
    out
}

/// 抽屉里要显示的那份文档。**只认目录里真有的章节 id**:这段脚本是拼进
/// `srcdoc` 的,不认的 id 一律不注入,别的什么东西也就进不来。`window.go` 是
/// 指南自己的换屏函数(它一屏一章,不是长滚动)。
fn guide_doc(chapter: &str) -> String {
    if guide_toc().iter().any(|(id, _)| *id == chapter) {
        format!("{GUIDE_HTML}\n<script>window.go({chapter:?});</script>")
    } else {
        GUIDE_HTML.to_string()
    }
}

/// 一句话说清本机环境。**没探过是灰,不是绿**;有没找到的就把名字念出来 ——
/// 只说「3 项没找到」等于让人再去设置屏找一遍。
fn env_status(env: &[ToolProbeVm]) -> (Option<Signal>, String, String) {
    if env.is_empty() {
        return (
            None,
            "本机环境还没探".into(),
            "回项目墙会自动探一遍。".into(),
        );
    }
    let miss: Vec<&str> = env
        .iter()
        .filter(|t| t.ok == Some(false))
        .map(|t| t.label.as_str())
        .collect();
    let found = env.iter().filter(|t| t.ok == Some(true)).count();
    if miss.is_empty() {
        (
            Some(Signal::Green),
            "本机环境就绪".into(),
            format!("{found} 项工具都探到了。"),
        )
    } else {
        // 汇总这一行用黄:哪一项红是项目墙环境条上逐项的事,这里说的是「有几项
        // 要你处理」。
        (
            Some(Signal::Amber),
            format!("{} 项工具没找到", miss.len()),
            format!("没找到:{}。", miss.join("、")),
        )
    }
}

/// 帮助面板 + 指南抽屉。挂在根上,和侧栏那颗「帮助」共用 [`HelpNav`]。
#[component]
pub fn HelpHub(bridge: Bridge, env: Vec<ToolProbeVm>) -> Element {
    let help = use_context::<HelpNav>();
    let guide = use_context::<GuideNav>();
    let chrome_busy = use_context::<ChromeBusy>();
    let mut title = use_signal(String::new);
    let mut title_focus = use_signal(|| false);
    let mut attach_log = use_signal(|| true);
    let mut query = use_signal(String::new);
    // 人把这个小窗拖到哪(相对右下角默认位的位移)。关掉再开还在原地。
    let mut off = use_signal(|| (0.0f64, 0.0f64));
    // 正在拖:按下那一刻「指针 - 当前位移」,拖的时候拿它反推新位移。
    let mut drag = use_signal(|| None::<(f64, f64)>);

    let b = bridge.clone();
    let toc = guide_toc();
    let tab = *help.0.read();
    let chapter = *guide.0.read();
    let title_ok = !title.read().trim().is_empty();
    let log_ready = bw_engine::dlog::log_path().is_file();
    let (sig, head, sub) = env_status(&env);
    let q = query.read().trim().to_lowercase();
    let hits: Vec<(&'static str, &'static str)> = toc
        .iter()
        .copied()
        .filter(|(_, label)| q.is_empty() || label.to_lowercase().contains(&q))
        .collect();

    rsx! {
        if let Some(t) = tab {
            // 拖的时候盖一层收 mousemove/mouseup:指针会跑出小窗,只挂在头上收不到。
            if drag.read().is_some() {
                div {
                    class: "help-drag-capture",
                    onmousemove: move |e| {
                        if let Some(base) = *drag.read() {
                            let c = e.client_coordinates();
                            off.set((c.x - base.0, c.y - base.1));
                        }
                    },
                    onmouseup: move |_| drag.set(None),
                    onmouseleave: move |_| drag.set(None),
                }
            }
            div {
                class: "help-panel",
                role: "dialog",
                aria_label: "帮助",
                style: "transform: translate({off.read().0}px, {off.read().1}px)",
                div { class: "help-scroll",
                div {
                    class: "help-hero",
                    onmousedown: move |e| {
                        let c = e.client_coordinates();
                        let o = *off.read();
                        drag.set(Some((c.x - o.0, c.y - o.1)));
                    },
                    div { class: "help-hero-top",
                        div { class: "rail-logo", "B" }
                        button {
                            class: "help-x",
                            title: "关闭",
                            // 关不是拖:别让这一下按出一次拖动。
                            onmousedown: move |e| e.stop_propagation(),
                            onclick: move |_| help.close(),
                            "✕"
                        }
                    }
                    h4 { "需要帮手?" }
                    p { "指南在这儿;卡住了就报一条给 Workbench 仓。" }
                }
                div { class: "help-body",
                    match t {
                        HelpTab::Home => rsx! {
                            div { class: "help-card help-card-lift",
                                div { class: "help-status",
                                    {light_dot(sig, true)}
                                    div { class: "help-row-copy",
                                        div { class: "help-status-title", "{head}" }
                                        div { class: "help-status-sub", "{sub}" }
                                    }
                                }
                            }
                            div { class: "help-card",
                                button {
                                    class: "help-row",
                                    onclick: move |_| help.open(HelpTab::Report),
                                    {icon("send")}
                                    span { class: "help-row-copy",
                                        "上报问题"
                                        span { class: "help-row-sub", "建一条 issue 到 Workbench 仓,可带本机日志" }
                                    }
                                    span { class: "help-row-go", {icon("chev")} }
                                }
                            }
                            div { class: "help-card",
                                div { class: "help-card-head", "产品指南" }
                                for (id , label) in toc.iter().copied().take(4) {
                                    button {
                                        key: "{id}",
                                        class: "help-row",
                                        onclick: move |_| {
                                            guide.open(id);
                                            help.close();
                                        },
                                        span { class: "help-row-copy", "{label}" }
                                        span { class: "help-row-go", {icon("chev")} }
                                    }
                                }
                                button {
                                    class: "help-row help-row-more",
                                    onclick: move |_| help.open(HelpTab::Guide),
                                    span { class: "help-row-copy", "全部 {toc.len()} 章" }
                                    span { class: "help-row-go", {icon("chev")} }
                                }
                            }
                        },
                        HelpTab::Guide => rsx! {
                            div { class: "help-card help-card-lift",
                                div { class: "help-search",
                                    {icon("search")}
                                    input {
                                        class: "input help-search-input",
                                        value: "{query}",
                                        placeholder: "搜索指南",
                                        oninput: move |e| query.set(e.value()),
                                    }
                                }
                                if hits.is_empty() {
                                    div { class: "empty", "没有对得上的章节。" }
                                }
                                for (id , label) in hits.iter().copied() {
                                    button {
                                        key: "{id}",
                                        class: "help-row",
                                        onclick: move |_| {
                                            guide.open(id);
                                            help.close();
                                        },
                                        span { class: "help-row-copy", "{label}" }
                                        span { class: "help-row-go", {icon("chev")} }
                                    }
                                }
                            }
                        },
                        HelpTab::Report => rsx! {
                            div { class: "help-card help-card-lift",
                                div { class: "help-form",
                                    div { class: "help-lead", "会在 Workbench 仓建一条 issue。" }
                                    input {
                                        class: "input",
                                        value: "{title}",
                                        placeholder: if *title_focus.read() { "" } else { "问题标题" },
                                        onfocus: move |_| title_focus.set(true),
                                        onblur: move |_| title_focus.set(false),
                                        oninput: move |e| title.set(e.value()),
                                    }
                                    label { class: "help-check",
                                        input {
                                            r#type: "checkbox",
                                            checked: *attach_log.read(),
                                            onchange: move |e| attach_log.set(e.checked()),
                                        }
                                        span { class: "help-row-copy",
                                            "附加对照日志"
                                            span { class: "help-row-sub",
                                                if log_ready {
                                                    "本机 bw.log,随 issue 一起发。"
                                                } else {
                                                    "本机还没有 bw.log,这次发不出去日志。"
                                                }
                                            }
                                        }
                                    }
                                    button {
                                        class: "btn btn-primary btn-block",
                                        disabled: !title_ok,
                                        onclick: move |_| {
                                            let t = title.read().trim().to_string();
                                            if t.is_empty() {
                                                return;
                                            }
                                            let attach = *attach_log.read();
                                            help.close();
                                            title.set(String::new());
                                            title_focus.set(false);
                                            attach_log.set(true);
                                            chrome_busy.set(if attach { REPORTING_LOG } else { REPORTING });
                                            b.cmd(bw::command::Command::ReportWorkbenchIssue {
                                                title: t,
                                                attach_log: attach,
                                            });
                                        },
                                        "发送报告"
                                    }
                                }
                            }
                        },
                    }
                }
                }
                div { class: "help-tabs",
                    for (name , label , t2) in [
                        ("home", "主页", HelpTab::Home),
                        ("book", "指南", HelpTab::Guide),
                        ("send", "上报", HelpTab::Report),
                    ]
                    {
                        button {
                            key: "{label}",
                            class: "help-tab",
                            aria_current: if t == t2 { "page" },
                            onclick: move |_| help.open(t2),
                            {icon(name)}
                            span { "{label}" }
                        }
                    }
                }
            }
        }
        if let Some(ch) = chapter {
            div { class: "guide-panel",
                div { class: "guide-panel-head",
                    h4 { "产品指南" }
                    button {
                        class: "btn btn-ghost btn-quiet btn-icon",
                        title: "关闭",
                        onclick: move |_| guide.close(),
                        "✕"
                    }
                }
                iframe { class: "guide-frame", srcdoc: guide_doc(ch) }
            }
        }
    }
}
