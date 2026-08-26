//! 外壳骨架:图标轨 / 项目轨 / 顶栏 / 指南抽屉 / toast。
//!
//! 结构照 `docs/hifi/index.html` 的 `iconRailHTML` /
//! `projectRailHTML` / `topbarHTML` / `guideMarkupHTML` 搬,类名同名同义,
//! **不写行内样式**。
//!
//! 与原型的两处不同,都是「原型是演示、真壳没有这东西」造成的,如实改掉而不
//! 是照抄一个假的:
//!
//! - 原型顶栏右边是「演示数据 ✱ / 重置 / 头像」。真壳的数据来自本机库和项目
//!   仓,没有可重置的演示数据,也没有账号 —— 改成「数据来自哪个库文件」+
//!   一颗「刷新」(真的重算一遍 ViewModel)。头像先不放,放了就是装饰。
//! - 原型的 toast 2.6 秒自动消失。真壳这条位置放的是命令回执(建活成功、
//!   铺底失败的原话),自动消失等于把失败信息藏起来 —— 改成点 ✕ 才关。

pub mod sparkline;

use crate::bridge::{Bridge, Panel, Req, TopView};
use crate::theme;
use bw::model::Signal;
use dioxus::prelude::*;

/// 原型那套线性图标。内容是写死的常量,没有任何外部输入拼进去。
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

/// 长命令的「一步一句」回执,画出来。
///
/// **行由调用方自己收**(各屏一个信号,点按钮时清空),这里只管画 —— 谁在跑
/// 长命令、什么时候该清屏,是那一屏自己的事;放到这里来猜只会猜错。行按步号
/// 原地覆盖的规矩在收的那一侧,见 `bw::app::ProgressLine::step`。
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
    let cls = if big { "dot dot-lg" } else { "dot" };
    let color = theme::signal_color(signal);
    rsx! { span { class: "{cls}", style: "background:{color}" } }
}

/// 六个入口各自的图标名。原型里知识库那一格用的是 `space`(内部沿用旧命名)。
fn panel_icon(p: Panel) -> &'static str {
    match p {
        Panel::Overview => "overview",
        Panel::Plan => "plan",
        Panel::Session => "session",
        Panel::Notify => "notify",
        Panel::Config => "config",
        Panel::Kb => "space",
    }
}

#[component]
pub fn IconRail(
    in_project: bool,
    top_view: Option<TopView>,
    on_wall: EventHandler<()>,
    on_settings: EventHandler<()>,
) -> Element {
    let settings_active = top_view == Some(TopView::Settings);
    let wall_active = !in_project && top_view.is_none();
    rsx! {
        div { class: "iconrail",
            div { class: "rail-logo", "B" }
            if in_project {
                button {
                    class: "rail-btn",
                    title: "项目墙",
                    onclick: move |_| on_wall.call(()),
                    {icon("back")}
                }
            } else {
                button {
                    class: if wall_active { "rail-btn active" } else { "rail-btn" },
                    title: "项目墙",
                    onclick: move |_| on_wall.call(()),
                    {icon("wall")}
                }
            }
            div { class: "spacer" }
            button {
                class: if settings_active { "rail-btn active" } else { "rail-btn" },
                title: "设置",
                onclick: move |_| on_settings.call(()),
                {icon("settings")}
            }
        }
    }
}

#[component]
pub fn ProjectRail(
    name: String,
    version: String,
    signal: Option<Signal>,
    unread: u32,
    cur: Panel,
    on_wall: EventHandler<()>,
    on_nav: EventHandler<Panel>,
) -> Element {
    rsx! {
        div { class: "projectrail",
            div { class: "pr-back", onclick: move |_| on_wall.call(()),
                {icon("back")}
                span { "项目墙" }
            }
            div { class: "pr-head",
                div { class: "pr-head-name", title: "{name}", "{name}" }
                div { class: "pr-head-meta",
                    span { "{version}" }
                    {light_dot(signal, false)}
                }
            }
            nav { class: "pr-nav",
                for p in Panel::ALL {
                    div {
                        key: "{p:?}",
                        class: if p == cur { "pr-link active" } else { "pr-link" },
                        onclick: move |_| on_nav.call(p),
                        span { style: "width:15px;height:15px;display:flex;", {icon(panel_icon(p))} }
                        span { "{p.label()}" }
                        if p == Panel::Notify && unread > 0 {
                            span { class: "pr-badge", "{unread}" }
                        }
                    }
                }
            }
        }
    }
}

/// 顶栏。`source` 是「这一屏的数字从哪来」的实话 —— 原型那格写的是
/// 「演示数据 ✱」,真壳写数据目录名(asset_root 下 registry/设置/会话;数字用 codehub-cli/gh/cat 当场对、不靠库)。
#[component]
pub fn TopBar(title: String, project: Option<String>, source: String, bridge: Bridge) -> Element {
    let b = bridge.clone();
    rsx! {
        div { class: "topbar",
            div { class: "topbar-title",
                "{title}"
                if let Some(p) = project.as_ref() {
                    " · {p}"
                }
            }
            div { class: "spacer" }
            span { class: "demo-tag", title: "数据目录(registry/设置/会话);界面数字用 codehub-cli/gh/cat 当场对,不靠库", "{source}" }
            button {
                class: "btn btn-sm btn-ghost",
                onclick: move |_| b.send(Req::Refresh),
                "刷新"
            }
        }
    }
}

/// 侧栏指南就是仓里那份产品指南,编进二进制,不另写一套。
const GUIDE_HTML: &str = include_str!("../../../../docs/guide/v4-产品指南.html");

#[component]
pub fn GuideDrawer() -> Element {
    let guide = use_context::<crate::bridge::GuideNav>();
    if guide.0.read().is_none() {
        return rsx! {
            div { class: "guide-tab", onclick: move |_| guide.open("u0"), "指南" }
        };
    }
    rsx! {
        div { class: "guide-panel guide-panel-wide",
            div { class: "guide-panel-head",
                h3 { style: "font-size:15px;margin:0;", "产品指南" }
                button { class: "drawer-close", onclick: move |_| guide.close(), "✕" }
            }
            iframe { class: "guide-frame", srcdoc: GUIDE_HTML }
        }
    }
}

/// 命令回执。**不自动消失** —— 这里放的是「铺底失败,原话是……」这种话。
#[component]
pub fn Toast(note: Option<String>, seq: u64) -> Element {
    // **按第几条记,不按正文记**。按正文记的话,同一句失败第二次出现会被当成
    // 「已经关过的那条」直接不显示 —— 改完再点一次、又是同样的错,界面上什么
    // 都不弹,看起来像是成功了。
    let mut dismissed = use_signal(|| 0u64);
    let Some(text) = note else {
        return rsx! {};
    };
    if *dismissed.read() == seq {
        return rsx! {};
    }
    rsx! {
        div { class: "toast show",
            "{text}"
            span {
                class: "toast-x",
                style: "margin-left:auto;",
                onclick: move |_| dismissed.set(seq),
                "✕"
            }
        }
    }
}

/// 在系统默认浏览器里打开一个地址。
///
/// **只收 `https://` 开头的**:这个函数的入参最终来自仓里的 `origin`,那是文件
/// 内容,不该被当成命令。挡在这里,`open` 就不会被喂进一个 `-a`、`file://` 或者
/// 别的什么东西。打不开就静静算了 —— 为一个链接弹一句错不值。
pub fn open_in_browser(url: &str) {
    if !url.starts_with("https://") {
        return;
    }
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(url).spawn();
    // Windows 上开浏览器要经 `cmd /C start`,而这个壳是 GUI 进程 —— 直接
    // `Command::new("cmd")` 会闪一下黑窗。走底座那层就带上 `CREATE_NO_WINDOW`,
    // 和 git / codehub-cli 那些子进程同一个规矩。
    #[cfg(target_os = "windows")]
    let _ = bw_engine::win_cmd::std_cmd("cmd")
        .args(["/C", "start", "", url])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}
