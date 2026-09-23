use crate::bridge::{
    Bridge, ChromeBusy, GuideNav, HelpNav, HelpTab, Panel, PanelNav, REPORTING, REPORTING_LOG,
};
use crate::chrome::{icon, light_dot};
use crate::theme;
use crate::vm::ToolProbeVm;
use bw::model::Signal;
use dioxus::prelude::*;

fn guide_toc(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    for seg in html.split("data-screen=\"").skip(1) {
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
            out.push((id.to_string(), label.to_string()));
        }
    }
    out
}

/// 章节 ID 只接受指南目录中已有的值，避免向 srcdoc 拼入外部脚本。
fn guide_doc(html: &str, chapter: &str) -> String {
    if guide_toc(html).iter().any(|(id, _)| id == chapter) {
        format!("{html}\n<script>window.go({chapter:?});</script>")
    } else {
        html.to_string()
    }
}

fn env_status(env: &[ToolProbeVm]) -> (Option<Signal>, String, String) {
    if env.is_empty() {
        return (
            None,
            "尚未检测本机环境".into(),
            "返回项目墙查看检测结果。".into(),
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
            format!("已检测到 {found} 项工具。"),
        )
    } else {
        (
            Some(Signal::Amber),
            format!("{} 项工具没找到", miss.len()),
            format!("没找到:{}。", miss.join("、")),
        )
    }
}

#[component]
pub fn HelpHub(bridge: Bridge, env: Vec<ToolProbeVm>) -> Element {
    let help = use_context::<HelpNav>();
    let guide = use_context::<GuideNav>();
    let chrome_busy = use_context::<ChromeBusy>();
    let mut title = use_signal(String::new);
    let mut title_focus = use_signal(|| false);
    let mut attach_log = use_signal(|| true);
    let mut query = use_signal(String::new);
    let mut off = use_signal(|| (0.0f64, 0.0f64));
    let mut drag = use_signal(|| None::<(f64, f64)>);

    let b = bridge.clone();
    let nav = use_context::<PanelNav>();
    use_future(move || {
        let nav = nav;
        let guide = guide;
        async move {
            let mut eval = document::eval(
                r#"
                if (!window.__bwGoPanelBound) {
                  window.__bwGoPanelBound = true;
                  window.addEventListener('message', function (e) {
                    var d = e.data;
                    if (d && d.bw === 'go-panel' && typeof d.panel === 'string') {
                      dioxus.send(d.panel);
                    }
                  });
                }
                await new Promise(function () {});
                "#,
            );
            while let Ok(name) = eval.recv::<String>().await {
                if let Some(p) = Panel::parse(&name) {
                    guide.close();
                    nav.go(p);
                }
            }
        }
    });
    // 每次渲染现读：指南 HTML 可热加载，存盘后下次交互（切页签、搜索、开章节）
    // 就是新内容，不需要重开窗口。
    let guide_html = theme::guide_html();
    let toc = guide_toc(&guide_html);
    let tab = *help.0.read();
    let chapter = guide.0.read().clone();
    let title_ok = !title.read().trim().is_empty();
    let log_ready = bw_engine::dlog::log_path().is_file();
    let (sig, head, sub) = env_status(&env);
    let q = query.read().trim().to_lowercase();
    let hits: Vec<(String, String)> = toc
        .iter()
        .filter(|(_, label)| q.is_empty() || label.to_lowercase().contains(&q))
        .cloned()
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
                            onmousedown: move |e| e.stop_propagation(),
                            onclick: move |_| help.close(),
                            "✕"
                        }
                    }
                    h4 { "帮助" }
                    p { "查看指南或报告问题。" }
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
                                        span { class: "help-row-sub", "向 Workbench 报告问题，可附加诊断日志" }
                                    }
                                    span { class: "help-row-go", {icon("chev")} }
                                }
                            }
                            div { class: "help-card",
                                div { class: "help-card-head", "产品指南" }
                                for (id , label) in toc.iter().take(4).cloned() {
                                    button {
                                        key: "{id}",
                                        class: "help-row",
                                        onclick: move |_| {
                                            guide.open(id.clone());
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
                                    div { class: "empty", "没有匹配的章节。" }
                                }
                                for (id , label) in hits.iter().cloned() {
                                    button {
                                        key: "{id}",
                                        class: "help-row",
                                        onclick: move |_| {
                                            guide.open(id.clone());
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
                                    div { class: "help-lead", "报告将提交到 Workbench 项目。" }
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
                                            "附加诊断日志"
                                            span { class: "help-row-sub",
                                                if log_ready {
                                                    "发送本机 bw.log。"
                                                } else {
                                                    "本机暂无日志文件。"
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
                                            let attach = *attach_log.read() && log_ready;
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
                iframe { class: "guide-frame", srcdoc: guide_doc(&guide_html, &ch) }
            }
        }
    }
}
