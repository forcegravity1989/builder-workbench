//! 顶层 · 设置。本机相关的几件事:目录、Orca 配对地址、配色、各个开工工具在不在。
//!
//! 版式走设计系统的「设置文法」(`docs/04-design-system/components/settings.html`):
//! 页标题 + 一句说明,小节 + 一张分组,每行「标题 + 一句说明 + 行尾控件」。
//!
//! **没有登录**。V4 不管任何账号:远端凭证在系统钥匙串、群登录态由用户自己在
//! 本机登好,Workbench 只探活。
//!
//! **工作区根目录可以在这里改**(存本机 settings.toml,立刻生效):它只决定
//! 「以后新接进来的项目默认落在哪」。已接入的项目各自记着自己的仓路径,一个都
//! 不会被牵着走 —— 不然改一下根目录,已有项目就集体找不到仓了。
//!
//! **数据目录是只读的**:进程起来之后落点已经定了,改它得重启,所以这里只如实
//! 显示,不给一个按不动的按钮。

use crate::bridge::Bridge;
use crate::vm::{ToolProbeVm, Vm};
use bw::command::Command;
use dioxus::prelude::*;

#[component]
pub fn View(vm: Vm, bridge: Bridge, close: EventHandler<MouseEvent>) -> Element {
    let vm = &vm;
    let s = &vm.settings;
    rsx! {
        section {
            "data-screen": "settings",
            div { class: "page-head",
                div {
                    h1 { "设置" }
                    p { class: "page-desc",
                        "只管这台机器。没有登录 —— 远端凭证在系统钥匙串里,项目群的登录态由你自己在本机登好。"
                    }
                }
                div { class: "page-actions",
                    button { class: "btn btn-secondary", onclick: close, "← 项目墙" }
                }
            }

            div { class: "section",
                div { h3 { class: "section-title", "目录" } }
            }
            div { class: "set-group",
                RootRow { value: s.workspaces_root.clone(), bridge: bridge.clone() }
                {path_row(
                    "数据目录",
                    "注册表 / 设置 / 会话都在这下面,不是 SQLite 库;删掉能从仓和远端重建。",
                    &s.data_dir,
                )}
            }

            div { class: "section",
                div {
                    h3 { class: "section-title", "Orca" }
                    p { class: "section-desc", "开工会话在 Orca 里跑;这里只记它的网页配对地址,只认 loopback,不进仓。" }
                }
            }
            div { class: "set-group",
                OrcaRow { value: s.orca_web_url.clone(), bridge: bridge.clone() }
            }

            div { class: "section",
                div {
                    h3 { class: "section-title", "配色" }
                    p { class: "section-desc", "Builder 设计系统的两套配色,切换立刻生效,只存本机。" }
                }
            }
            div { class: "set-group",
                ThemeRow { value: s.theme.clone(), bridge: bridge.clone() }
            }

            div { class: "section",
                div {
                    h3 { class: "section-title", "工具探活" }
                    p { class: "section-desc", "灰是「这项探活还没接」,不是有问题;红才是本机路径里真的没找到。" }
                }
            }
            div { class: "set-group",
                for t in vm.env.iter() {
                    {probe_row(t)}
                }
            }
        }
    }
}

/// 工作区根目录:可改。填全路径,存本机设置,立刻生效。
#[component]
fn RootRow(value: String, bridge: Bridge) -> Element {
    // 输入框的初值取当前值;人改完点「保存」才发命令,边打字边存会把
    // 「D:\\pro」这种打了一半的路径也建成目录。
    let mut draft = use_signal(|| value.clone());
    let b = bridge.clone();
    rsx! {
        div { class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "工作区根目录" }
                div { class: "set-desc", "新接入的项目默认落在这里;已接入的各自记着仓路径,不会跟着搬。" }
            }
            div { class: "set-ctl",
                input {
                    class: "input mono",
                    value: "{draft}",
                    placeholder: "Windows 填 D:\\Workbench\\workspaces,macOS 填 /Users/你/projects",
                    oninput: move |e| draft.set(e.value()),
                }
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| b.cmd(Command::SetWorkspacesRoot { path: draft.read().clone() }),
                    "保存"
                }
            }
        }
    }
}

/// Orca 网页配对 URL:可改。安装版「给 web 配对」给的那条(带 token),
/// 存本机设置,不进仓。只认 loopback,非 loopback 在会话屏被如实滤成空。
#[component]
fn OrcaRow(value: String, bridge: Bridge) -> Element {
    let mut draft = use_signal(|| value.clone());
    let configured = !value.trim().is_empty();
    let b = bridge.clone();
    rsx! {
        div { class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "Orca 网页地址" }
                div { class: "set-desc",
                    if configured {
                        "从「给 web 配对 / Share this Orca server」复制 Open in browser 那条;官方包 6768、源码桌面 6769。"
                    } else {
                        "还没配,会话屏空着。从「给 web 配对 / Share this Orca server」复制 Open in browser 那条。"
                    }
                }
            }
            div { class: "set-ctl",
                input {
                    class: "input mono",
                    value: "{draft}",
                    placeholder: "http://127.0.0.1:6768/web-index.html#pairing=…",
                    oninput: move |e| draft.set(e.value()),
                }
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| b.cmd(Command::SetOrcaWebUrl { url: draft.read().clone() }),
                    "保存"
                }
            }
        }
    }
}

/// 配色:两张预览卡各自挂 `data-theme`,所以每张显示的都是自己那套 token。
#[component]
fn ThemeRow(value: String, bridge: Bridge) -> Element {
    let current = if value.is_empty() {
        "claude".to_string()
    } else {
        value
    };
    rsx! {
        div { class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "配色" }
                div { class: "set-desc", "Claude:象牙白底、赤陶强调;Apple:纯白底、系统蓝。" }
            }
            div { class: "set-ctl",
                for (key, label) in [("claude", "Claude"), ("apple", "Apple")] {
                    {theme_choice(key, label, current == key, bridge.clone())}
                }
            }
        }
    }
}

fn theme_choice(key: &'static str, label: &'static str, checked: bool, bridge: Bridge) -> Element {
    rsx! {
        label { class: "choice",
            input {
                r#type: "radio",
                name: "theme",
                checked,
                onchange: move |_| bridge.cmd(Command::SetTheme { theme: key.to_string() }),
            }
            span { class: "choice-pv", "data-theme": "{key}",
                span { class: "theme-pv",
                    span {}
                    span { class: "theme-pv-lines", i {} i {} i { class: "w-70" } }
                }
            }
            span { class: "choice-label", "{label}" }
        }
    }
}

fn path_row(label: &str, desc: &str, value: &str) -> Element {
    let full = value.trim();
    let shown = if full.is_empty() {
        "—".to_string()
    } else {
        middle_ellipsis(full, 48)
    };
    rsx! {
        div { class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "{label}" }
                div { class: "set-desc", "{desc}" }
            }
            div { class: "set-ctl",
                span { class: "path", title: "{full}", "{shown}" }
            }
        }
    }
}

/// 路径太长时留头留尾、省中间 —— 头尾都是人认路用的。
fn middle_ellipsis(s: &str, max: usize) -> String {
    let n = s.chars().count();
    if n <= max {
        return s.to_string();
    }
    let head = max / 2;
    let tail = max - head - 1;
    let a: String = s.chars().take(head).collect();
    let b: String = s.chars().skip(n - tail).collect();
    format!("{a}…{b}")
}

fn probe_row(t: &ToolProbeVm) -> Element {
    let (cls, state) = match t.ok {
        Some(true) => ("status status-done", "已找到"),
        Some(false) => ("status status-blocked", "没找到"),
        None => ("status status-todo", "还没接"),
    };
    rsx! {
        div { key: "{t.name}", class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "{t.label}" }
                div { class: "set-desc mono", "{t.detail}" }
            }
            div { class: "set-ctl",
                span { class: "{cls}", span { class: "status-dot" } "{state}" }
            }
        }
    }
}
