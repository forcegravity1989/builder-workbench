//! Workbench MVP 桌面壳 —— 五入口 + 顶层三屏。
//!
//! 一条规矩:**这个 crate 只渲染和转发意图,它自己什么都不算**。健康是什么
//! 颜色、活能不能转到那一列、指标有没有读数,全部由内核算好塞进 ViewModel。
//! 壳里不该出现第二套判断逻辑,更不该在命令失败时自己造一个成功的样子。
//!
//! 深链(启动即打读回证据,和旧壳同一套机制):
//!
//! ```bash
//! BW_DB=<数据目录> BW_OPEN=<项目> BW_PANEL=overview|plan|session|config|kb ./bw-dev
//! BW_VIEW=onboard|settings ./bw-dev
//! ```

#![forbid(unsafe_code)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod adapters;
mod bridge;
mod chrome;
mod screens;
mod theme;
mod vm;

use bridge::{Bridge, ChromeBusy, DeepLink, Panel, Req, TopView};
use dioxus::prelude::*;

/// Windows WebView2 启动参数。字面必须带上 wry 默认那几条,否则回退。
/// `BW_CDP_PORT` 是纯数字才追加调试口,没设与今天完全一样。
#[cfg(windows)]
fn windows_browser_args() -> String {
    let base =
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,LocalNetworkAccessChecks \
         --unsafely-treat-insecure-origin-as-secure=http://dioxus.index.html";
    match std::env::var("BW_CDP_PORT") {
        Ok(p) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => {
            bw_engine::dlog!(ok, "boot", "[BW_CDP] port={p}");
            format!("{base} --remote-debugging-port={p} --remote-allow-origins=*")
        }
        Ok(p) => {
            bw_engine::dlog!(warn, "boot", "[BW_CDP] ignored={p:?}");
            base.to_string()
        }
        Err(_) => {
            bw_engine::dlog!(ok, "boot", "[BW_CDP] unset");
            base.to_string()
        }
    }
}

fn main() {
    // 起任何线程之前先把本机时区定住 —— 周是按本机时区算的。
    bw::isoweek::init_local_offset();
    bw_engine::dlog::init();
    let deep_link = bridge::read_deep_link();
    let builder = dioxus::desktop::WindowBuilder::new()
        .with_title("Builders' Workbench")
        .with_inner_size(dioxus::desktop::LogicalSize::new(1440.0, 920.0));

    let cfg = dioxus::desktop::Config::new().with_window(builder);
    // Windows:wry 默认的拖放处理器会让 WebView2 屏蔽页面内的拖放,计划屏那
    // 六列就拖不动了。必须关掉。
    #[cfg(windows)]
    let cfg = cfg.with_disable_drag_drop_handler(true);
    // iframe 嵌 Orca / OD。新版 Orca SPA boot 调 crypto.randomUUID,只在
    // Secure Context 有;父页 http://dioxus.index.html 默认不算 secure,子
    // iframe 跟着不算 → 白屏。把该 origin 当 secure 对待。走
    // with_windows_browser_args(透传 wry additional_browser_args),不走
    // WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS —— wry 设了显式默认 args 会盖掉
    // env。必须带上 wry 默认那几条,否则回退;LocalNetworkAccessChecks 是
    // iframe 嵌 loopback 要关的。验包设 BW_CDP_PORT 才开调试口。
    #[cfg(windows)]
    let cfg = cfg.with_windows_browser_args(windows_browser_args());

    LAUNCH_DEEP_LINK.with(|c| *c.borrow_mut() = Some(deep_link));
    dioxus::LaunchBuilder::new().with_cfg(cfg).launch(Root);
}

thread_local! {
    static LAUNCH_DEEP_LINK: std::cell::RefCell<Option<DeepLink>> = const { std::cell::RefCell::new(None) };
}

#[component]
fn GlobalChrome() -> Element {
    rsx! {
        document::Title { "Builders' Workbench" }
        document::Style { {theme::GLOBAL_CSS} }
    }
}

#[component]
fn Root() -> Element {
    let deep_link = use_hook(|| {
        LAUNCH_DEEP_LINK
            .with(|c| c.borrow_mut().take())
            .unwrap_or_default()
    });
    let initial_panel = deep_link.panel;
    let initial_view = deep_link.view;
    let bridge = use_context_provider(move || bridge::spawn(deep_link));

    let mut vm = use_signal(vm::Vm::default);
    let nav = use_context_provider(move || bridge::PanelNav(Signal::new(initial_panel)));
    use_context_provider(|| bridge::GuideNav(Signal::new(None)));
    let chrome_busy = use_context_provider(|| ChromeBusy(Signal::new(None)));
    let mut panel = nav.0;
    let mut top_view = use_signal(move || initial_view);
    // 项目内的屏偶尔要跳去顶层设置(比如知识库资产页签指去 Skills)。设置屏
    // 不是 `Panel`,`PanelNav` 帮不上忙,所以另外经 context 把这颗信号递下去。
    use_context_provider(|| top_view);

    // 订阅内核推过来的 ViewModel。
    use_future({
        let rx = bridge.vm.clone();
        move || {
            let mut rx = rx.clone();
            async move {
                loop {
                    if rx.changed().await.is_err() {
                        break;
                    }
                    let next = rx.borrow_and_update().clone();
                    vm.set(next);
                }
            }
        }
    });

    // 打开了一个项目 → 顶层屏(接入 / 设置)让位。
    //
    // **顶层屏是外壳自己的一个信号,内核不知道它存在**:接入完内核把 `open`
    // 设上了,项目其实已经在下面开好了,可人眼前还是那张接入卡 —— 看起来就像
    // 「点了没跳转」。这个 effect 就是把这两边接起来的那根线。
    let mut last_open = use_signal(|| None::<bw::model::ProjectId>);
    use_effect(move || {
        let now = vm.read().open.as_ref().map(|p| p.id);
        // 用 peek 读上一次的值:这里只是拿它比一比,不该因此再订阅一遍自己。
        if now.is_some() && now != *last_open.peek() {
            top_view.set(None);
        }
        last_open.set(now);
    });

    // 点开工先立的遮罩,等内核 Vm.busy 接上;内核撤了也跟着撤。
    let mut prev_kernel_busy = use_signal(|| false);
    use_effect(move || {
        let now = vm.read().busy.clone();
        let had = *prev_kernel_busy.peek();
        if let Some(msg) = now.clone() {
            chrome_busy.set(msg);
        } else if had {
            chrome_busy.clear();
        }
        prev_kernel_busy.set(now.is_some());
    });

    let v = vm.read().clone();

    if let Some(fatal) = &v.fatal {
        return rsx! {
            GlobalChrome {}
            div { class: "app-root is-centered", lang: "zh", "data-theme": "claude",
                div { class: "card fatal",
                    h3 { "起不来" }
                    "{fatal}"
                }
            }
        };
    }

    if !v.ready {
        return rsx! {
            GlobalChrome {}
            div { class: "app-root is-centered", lang: "zh", "data-theme": "claude",
                "正在读本机数据……"
            }
        };
    }

    let cur = *panel.read();
    let tv = *top_view.read();
    // 配色是本机设置;空 = 设计系统默认给壳的 Claude 板。
    let theme = if v.settings.theme.is_empty() {
        "claude".to_string()
    } else {
        v.settings.theme.clone()
    };
    let project = v.open.clone();
    let in_project = project.is_some() && tv.is_none();
    let b_rail = bridge.clone();
    let sidebar_project = project.as_ref().map(|p| chrome::SidebarProject {
        name: p.name.clone(),
        version: if p.card.current_version.is_empty() {
            "—".to_string()
        } else {
            p.card.current_version.clone()
        },
        signal: p.health.signal,
        unread: p.notify.unread,
    });

    rsx! {
        GlobalChrome {}
        // 设计系统的配色 + 中文排版层都挂在根上(见 theme 模块头注)。
        div { class: "app-root", lang: "zh", "data-theme": "{theme}",
            chrome::Sidebar {
                in_project,
                top_view: tv,
                project: sidebar_project,
                cur,
                on_wall: move |_| {
                    top_view.set(None);
                    b_rail.send(Req::Open(None));
                },
                on_settings: move |_| top_view.set(Some(TopView::Settings)),
                on_nav: move |p: bridge::Panel| panel.set(p),
            }
            div { class: "main",
                // 仓文件读不动的实话。**不退回默认值假装文件不存在**。
                // key 按索引,不按警告文本:同一条警告被两处推过(如 issues() 在
                // build_project 与 build_vm 各失败一次)时,文本相同、按文本
                // key 会撞 → dioxus "keyed siblings must each have a unique key" 崩。
                for (i, w) in v.warnings.iter().enumerate() {
                    div { key: "{i}", class: "warnbar", "{w}" }
                }
                // 会话屏的布局由 .content 自己摆 —— session-mode 三栏网格已随
                // PTY 封存删掉(终端不挂这里了,会话屏只剩 Orca/OD 两组件)。
                div {
                    class: "content",
                    {body(tv, cur, &v, &project, &bridge, top_view)}
                }
            }
            chrome::GuideDrawer { bridge: bridge.clone() }
            if let Some(msg) = {
                let chrome_msg = chrome_busy.get();
                v.busy.clone().or(chrome_msg)
            } {
                div { class: "busy-mask",
                    div { class: "busy-card",
                        div { class: "busy-spin" }
                        "{msg}"
                    }
                }
            }
            chrome::Toast { note: v.note.clone(), seq: v.note_seq }
        }
    }
}

/// 内容区分发:顶层三屏 / 项目内六屏。PTY 已封存,终端不再挂在屏外。
fn body(
    tv: Option<TopView>,
    cur: Panel,
    v: &vm::Vm,
    project: &Option<vm::ProjectVm>,
    bridge: &Bridge,
    mut top_view: Signal<Option<TopView>>,
) -> Element {
    if let Some(t) = tv {
        let close = move |_| top_view.set(None);
        return match t {
            TopView::Onboard => rsx! {
                screens::onboard::View { vm: v.clone(), bridge: bridge.clone(), close }
            },
            TopView::Settings => rsx! {
                screens::settings::View { vm: v.clone(), bridge: bridge.clone(), close }
            },
        };
    }
    let Some(p) = project.clone() else {
        let b = bridge.clone();
        return rsx! {
            screens::wall::View {
                vm: v.clone(),
                bridge: b,
                go_top: move |t| top_view.set(Some(t)),
            }
        };
    };
    rsx! {
        {screens::route(cur, &p, bridge)}
    }
}

#[cfg(all(test, windows))]
mod windows_args_tests {
    #[test]
    fn no_port_keeps_old_args() {
        std::env::remove_var("BW_CDP_PORT");
        let a = super::windows_browser_args();
        assert!(a.contains("LocalNetworkAccessChecks"));
        assert!(!a.contains("remote-debugging-port"));
    }
}
