//! Orca 自己开一扇 wry 窗顶级打开 pairing URL,挂成主窗所属窗,对齐中栏格子。
//! WebView2 iframe 不画这张页;同窗子 HWND 会被主 WebView2 盖住。
//! tao 事件回调不在 Dioxus runtime 里,禁止再调 `dioxus::desktop::window()`。

use std::cell::{Cell, RefCell};
use std::time::Duration;

use dioxus::desktop::tao::dpi::{LogicalSize, PhysicalPosition, PhysicalSize};
use dioxus::desktop::tao::event::{Event, WindowEvent};
use dioxus::desktop::tao::window::WindowId;
use dioxus::desktop::wry::{WebView, WebViewBuilder};
use dioxus::desktop::{tao, WindowBuilder};
use dioxus::prelude::*;

#[cfg(windows)]
use dioxus::desktop::tao::platform::windows::{WindowBuilderExtWindows, WindowExtWindows};

struct Held {
    window: tao::window::Window,
    _webview: WebView,
}

#[derive(Clone, Copy)]
struct HostCss {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Clone, Copy)]
struct MainSnap {
    id: WindowId,
    #[cfg(windows)]
    hwnd: isize,
    inner: PhysicalPosition<i32>,
    outer: PhysicalPosition<i32>,
    scale: f64,
}

thread_local! {
    static PENDING: RefCell<Option<String>> = const { RefCell::new(None) };
    static HELD: RefCell<Option<Held>> = const { RefCell::new(None) };
    static HOST: RefCell<Option<HostCss>> = const { RefCell::new(None) };
    static MAIN: RefCell<Option<MainSnap>> = const { RefCell::new(None) };
    static HOOKED: Cell<bool> = const { Cell::new(false) };
    static OPENED: RefCell<Option<String>> = const { RefCell::new(None) };
}

const MEASURE_JS: &str = r#"
(() => {
  const el = document.getElementById('orca-host');
  if (!el) { dioxus.send(null); return; }
  const r = el.getBoundingClientRect();
  dioxus.send([r.x, r.y, r.width, r.height]);
})()
"#;

pub fn hide() {
    HOST.with(|h| *h.borrow_mut() = None);
    HELD.with(|h| {
        h.borrow_mut().take();
    });
    OPENED.with(|o| *o.borrow_mut() = None);
}

pub async fn show(url: &str) {
    hook();
    snapshot_main();
    let same = OPENED.with(|o| o.borrow().as_deref() == Some(url));
    if HELD.with(|h| h.borrow().is_some()) {
        if same {
            apply_cached();
            return;
        }
        // 地址换了:丢掉旧 WebView,下面重新 arm。格子还在,不用清 HOST。
        HELD.with(|h| {
            h.borrow_mut().take();
        });
    }
    // 先 arm PENDING:tao 事件回调一来就 create_overlay,WebView 就开始加载
    // pairing URL,和量 #orca-host 格子并行(原先后置 wait_host 的 ~640ms 是
    // 延迟来源)。窗建出来时 visible=false,要等下面量到格子 apply_cached
    // 才露出来——所以 WebView 在背后先加载,人对上时已是加载好的页。
    OPENED.with(|o| *o.borrow_mut() = Some(url.to_string()));
    PENDING.with(|p| *p.borrow_mut() = Some(url.to_string()));
    for _ in 0..60 {
        if HELD.with(|h| h.borrow().is_some()) {
            wait_host().await;
            apply_cached();
            return;
        }
        dioxus::desktop::window().window.request_redraw();
        tokio::time::sleep(Duration::from_millis(16)).await;
    }
}

pub async fn place() {
    snapshot_main();
    if HELD.with(|h| h.borrow().is_none()) {
        dioxus::desktop::window().window.request_redraw();
    }
    if measure_host().await.is_some() {
        apply_cached();
    }
}

async fn wait_host() {
    for _ in 0..40 {
        if measure_host().await.is_some() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(16)).await;
    }
}

fn snapshot_main() {
    let desktop = dioxus::desktop::window();
    let Ok(inner) = desktop.window.inner_position() else {
        return;
    };
    let Ok(outer) = desktop.window.outer_position() else {
        return;
    };
    MAIN.with(|m| {
        *m.borrow_mut() = Some(MainSnap {
            id: desktop.window.id(),
            #[cfg(windows)]
            hwnd: desktop.window.hwnd(),
            inner,
            outer,
            scale: desktop.window.scale_factor(),
        });
    });
}

fn hook() {
    if HOOKED.get() {
        return;
    }
    HOOKED.set(true);
    snapshot_main();
    dioxus::desktop::window().create_wry_event_handler(|event, target| {
        if let Some(url) = PENDING.with(|p| p.borrow_mut().take()) {
            create_overlay(&url, target);
        }
        let Event::WindowEvent {
            window_id,
            event: we,
            ..
        } = event
        else {
            return;
        };
        let overlay_id = HELD.with(|h| h.borrow().as_ref().map(|held| held.window.id()));
        if overlay_id == Some(*window_id) {
            return;
        }
        match we {
            WindowEvent::Moved(pos) => {
                MAIN.with(|m| {
                    if let Some(s) = m.borrow_mut().as_mut() {
                        if s.id != *window_id {
                            return;
                        }
                        s.inner.x = s.inner.x.saturating_add(pos.x.saturating_sub(s.outer.x));
                        s.inner.y = s.inner.y.saturating_add(pos.y.saturating_sub(s.outer.y));
                        s.outer = *pos;
                    }
                });
                apply_cached();
            }
            WindowEvent::Resized(_) => {
                HOST.with(|h| *h.borrow_mut() = None);
            }
            _ => {}
        }
    });
}

fn create_overlay<T>(url: &str, target: &tao::event_loop::EventLoopWindowTarget<T>) {
    if HELD.with(|h| h.borrow().is_some()) {
        return;
    }
    let mut builder = WindowBuilder::new()
        .with_title("Orca")
        .with_inner_size(LogicalSize::new(1200.0, 800.0))
        .with_visible(false);
    #[cfg(windows)]
    {
        if let Some(hwnd) = MAIN.with(|m| m.borrow().as_ref().map(|s| s.hwnd)) {
            builder = builder
                .with_owner_window(hwnd)
                .with_skip_taskbar(true)
                .with_undecorated_shadow(false);
        }
    }
    let window = match builder.build(target) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[BW_ORCA] window: {e}");
            return;
        }
    };
    // 先挂空白页再 load pairing:with_url(真地址) 会在事件回调里同步等
    // WebView2 拉完整页(人对过约 10s 白屏)。about:blank 建窗是瞬间的。
    match WebViewBuilder::new().with_url("about:blank").build(&window) {
        Ok(webview) => {
            let _ = webview.load_url(url);
            HELD.with(|h| {
                *h.borrow_mut() = Some(Held {
                    window,
                    _webview: webview,
                });
            });
            apply_cached();
        }
        Err(e) => eprintln!("[BW_ORCA] webview: {e}"),
    }
}

fn add_px(base: i32, offset: f64) -> i32 {
    let o = if offset.is_finite() {
        offset.round().clamp(i32::MIN as f64, i32::MAX as f64) as i32
    } else {
        0
    };
    base.saturating_add(o)
}

fn px_u32(v: f64) -> u32 {
    if !v.is_finite() || v < 1.0 {
        return 1;
    }
    v.min(u32::MAX as f64) as u32
}

fn apply_cached() {
    let Some(css) = HOST.with(|h| *h.borrow()) else {
        return;
    };
    let Some(main) = MAIN.with(|m| *m.borrow()) else {
        return;
    };
    HELD.with(|slot| {
        let held = slot.borrow();
        let Some(held) = held.as_ref() else {
            return;
        };
        held.window.set_decorations(false);
        held.window.set_always_on_top(false);
        #[cfg(windows)]
        {
            let _ = held.window.set_skip_taskbar(true);
            held.window.set_undecorated_shadow(false);
        }
        held.window.set_outer_position(PhysicalPosition::new(
            add_px(main.inner.x, css.x * main.scale),
            add_px(main.inner.y, css.y * main.scale),
        ));
        held.window.set_inner_size(PhysicalSize::new(
            px_u32(css.w * main.scale),
            px_u32(css.h * main.scale),
        ));
        held.window.set_visible(true);
    });
}

async fn measure_host() -> Option<HostCss> {
    let mut ev = document::eval(MEASURE_JS);
    let v: Option<Vec<f64>> = ev.recv().await.ok()?;
    let arr = v?;
    if arr.len() != 4 {
        return None;
    }
    let (x, y, w, h) = (arr[0], arr[1], arr[2], arr[3]);
    if w < 16.0 || h < 16.0 {
        return None;
    }
    let css = HostCss { x, y, w, h };
    HOST.with(|slot| *slot.borrow_mut() = Some(css));
    Some(css)
}
