pub mod help;
pub mod sparkline;

use crate::bridge::{Panel, TopView};
use crate::theme;
use bw::model::Signal;
use dioxus::prelude::*;

fn icon_path(name: &str) -> &'static str {
    match name {
        "wall" => {
            r#"<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>"#
        }
        "settings" => {
            r#"<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>"#
        }
        "overview" => r#"<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/>"#,
        "plan" => r#"<path d="M5 6h14M5 12h14M5 18h9"/>"#,
        "session" => {
            r#"<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/>"#
        }
        "config" => {
            r#"<path d="M4 7h9M17 7h3M4 12h3M9 12h11M4 17h13M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>"#
        }
        "space" => {
            r#"<path d="M4 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 9h16"/>"#
        }
        "back" => r#"<path d="M15 5l-7 7 7 7"/>"#,
        "help" => {
            r#"<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 015 .9c0 1.7-2.5 2.1-2.5 3.9"/><path d="M12 17.2v.1"/>"#
        }
        "book" => {
            r#"<path d="M5 4h13v16H5.5A1.5 1.5 0 014 18.5v-13A1.5 1.5 0 015.5 4z"/><path d="M4 17.2h14"/>"#
        }
        "send" => r#"<path d="M21 3L3 10.4l7.2 3.4L21 3z"/><path d="M21 3l-7.4 18-3.4-7.2"/>"#,
        "chev" => r#"<path d="M9.5 5.5l6.5 6.5-6.5 6.5"/>"#,
        "search" => r#"<circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8L20.5 20.5"/>"#,
        "home" => r#"<path d="M4 10.6L12 4l8 6.6V20H4z"/><path d="M9.6 20v-5.4h4.8V20"/>"#,
        "notify" => {
            r#"<path d="M6 8a6 6 0 0112 0c0 4 1.6 5.4 1.6 5.4H4.4S6 12 6 8z"/><path d="M9.5 17a2.5 2.5 0 005 0"/>"#
        }
        _ => "",
    }
}

pub fn icon(name: &str) -> Element {
    rsx! {
        svg {
            view_box: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            stroke_width: "1.7",
            stroke_linecap: "round",
            stroke_linejoin: "round",
            dangerous_inner_html: "{icon_path(name)}",
        }
    }
}

pub fn progress_log(lines: &[bw::app::ProgressLine]) -> Element {
    use bw::app::StepState;
    if lines.is_empty() {
        return rsx! {};
    }
    rsx! {
        div { class: "prog-log",
            for line in lines.iter() {
                div {
                    key: "{line.step}",
                    class: "prog-log-row",
                    span {
                        class: match line.state {
                            StepState::Doing => "prog-log-mark spinning",
                            StepState::Ok => "prog-log-mark ok",
                            StepState::Fail => "prog-log-mark fail",
                        },
                        match line.state {
                            StepState::Doing => "⟳",
                            StepState::Ok => "✓",
                            StepState::Fail => "✕",
                        }
                    }
                    span { "{line.text}" }
                }
            }
        }
    }
}

pub fn light_dot(signal: Option<Signal>, big: bool) -> Element {
    let cls = if big {
        "status-dot status-dot-lg"
    } else {
        "status-dot"
    };
    let color = theme::signal_color(signal);
    rsx! { span { class: "{cls}", style: "--status-c:{color}" } }
}

fn panel_icon(p: Panel) -> &'static str {
    match p {
        Panel::Overview => "overview",
        Panel::Plan => "plan",
        Panel::Session => "session",
        Panel::Config => "config",
        Panel::Kb => "space",
    }
}

#[derive(Clone, PartialEq)]
pub struct SidebarProject {
    pub name: String,
    pub version: String,
    pub signal: Option<Signal>,
    pub unread: u32,
}

#[component]
pub fn Sidebar(
    in_project: bool,
    top_view: Option<TopView>,
    project: Option<SidebarProject>,
    cur: Panel,
    on_wall: EventHandler<()>,
    on_settings: EventHandler<()>,
    on_help: EventHandler<()>,
    on_nav: EventHandler<Panel>,
) -> Element {
    let settings_active = top_view == Some(TopView::Settings);
    let wall_active = !in_project && top_view.is_none();
    rsx! {
        aside { class: "sidebar app-sidebar",
            div { class: "sb-brand",
                div { class: "rail-logo", "B" }
                span { "Workbench" }
            }
            if let (true, Some(p)) = (in_project, project.as_ref()) {
                div { class: "pr-back", onclick: move |_| on_wall.call(()),
                    {icon("back")}
                    span { "项目墙" }
                }
                div { class: "pr-head",
                    div { class: "pr-head-name", title: "{p.name}", "{p.name}" }
                    div { class: "pr-head-meta",
                        span { "{p.version}" }
                        {light_dot(p.signal, false)}
                        if p.unread > 0 {
                            span { class: "pr-badge", title: "待评审 Issue 数量", "{p.unread}" }
                        }
                    }
                }
                nav { class: "pr-nav",
                    for pn in Panel::ALL {
                        div {
                            key: "{pn:?}",
                            class: "sidebar-item",
                            aria_current: if pn == cur { "page" },
                            onclick: move |_| on_nav.call(pn),
                            {icon(panel_icon(pn))}
                            span { "{pn.label()}" }
                        }
                    }
                }
            } else {
                nav { class: "pr-nav",
                    div {
                        class: "sidebar-item",
                        aria_current: if wall_active { "page" },
                        onclick: move |_| on_wall.call(()),
                        {icon("wall")}
                        span { "项目墙" }
                    }
                }
            }
            div { class: "spacer" }
            div { class: "sidebar-item", onclick: move |_| on_help.call(()),
                {icon("help")}
                span { "帮助" }
            }
            div {
                class: "sidebar-item",
                aria_current: if settings_active { "page" },
                onclick: move |_| on_settings.call(()),
                {icon("settings")}
                span { "设置" }
            }
        }
    }
}

#[component]
pub fn Toast(note: Option<String>, seq: u64) -> Element {
    // 按通知序号关闭，避免相同错误再次发生时被隐藏。
    let mut dismissed = use_signal(|| 0u64);
    let Some(text) = note else {
        return rsx! {};
    };
    if *dismissed.read() == seq {
        return rsx! {};
    }
    rsx! {
        div { class: "toast", role: "status",
            div { class: "toast-body", "{text}" }
            button {
                class: "toast-action",
                onclick: move |_| dismissed.set(seq),
                "关闭"
            }
        }
    }
}

/// 仅允许 HTTPS，避免仓库中的地址被解释为命令参数或本地文件。
pub fn open_in_browser(url: &str) {
    if !url.starts_with("https://") {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();
    // 统一使用隐藏窗口的命令启动器，避免 Windows 弹出控制台。
    #[cfg(target_os = "windows")]
    let _ = bw_engine::win_cmd::std_cmd("cmd")
        .args(["/C", "start", "", url])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}
