//! 顶层 · 设置。左栏搜索 + 分节(本机 / 能力),右边整页替换 —— 照抄 Claude
//! 桌面版设置面板。见 `docs/05-features/capability-panel/spec.md`。
//!
//! **本机**:目录、外观。**没有登录**——远端凭证在系统钥匙串、群登录态由用户
//! 自己在本机登好,Workbench 只探活。
//!
//! **能力**:Connector(装没装上,含 Orca)、Skills(全局一张表)、Stage(阶段
//! 用什么执行器 / 按什么 workflow / 会注入哪几份规范)、Plugins(vendor 进仓
//! 的两个业界技能库)、AI Assets(开工会给 agent 的规范)。这几张表本来长在
//! 项目内的配置屏 + 设置屏「工具探活」里,`Settings.tools` 没有项目维度、
//! 探活也不挂哪个项目——摆在这里才对。
//!
//! **工作区根目录可以在这里改**(存本机 settings.toml,立刻生效):它只决定
//! 「以后新接进来的项目默认落在哪」。已接入的项目各自记着自己的仓路径,一个都
//! 不会被牵着走 —— 不然改一下根目录,已有项目就集体找不到仓了。
//!
//! **数据目录是只读的**:进程起来之后落点已经定了,改它得重启,所以这里只如实
//! 显示,不给一个按不动的按钮。

mod assets;
mod connector;
mod plugins;
mod skills;
mod stage;

use crate::bridge::Bridge;
use crate::vm::Vm;
use bw::command::Command;
use dioxus::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Page {
    Dirs,
    Theme,
    Connector,
    Skills,
    Stage,
    Plugins,
    Assets,
}

#[component]
pub fn View(vm: Vm, bridge: Bridge, close: EventHandler<MouseEvent>) -> Element {
    let vm = &vm;
    let s = &vm.settings;
    let mut page = use_signal(|| Page::Dirs);
    let mut query = use_signal(String::new);
    let q = query.read().trim().to_lowercase();

    let nav_items: [(Page, &str, &str, Option<usize>); 7] = [
        (Page::Dirs, "本机", "目录", None),
        (Page::Theme, "本机", "外观", None),
        (
            Page::Connector,
            "能力",
            "Connector",
            Some(s.connectors.len()),
        ),
        (Page::Skills, "能力", "Skills", Some(s.skills.len())),
        (Page::Stage, "能力", "Stage", Some(s.stage.len())),
        (Page::Plugins, "能力", "Plugins", Some(s.plugins.len())),
        (Page::Assets, "能力", "AI Assets", Some(s.assets.len())),
    ];
    let visible = |label: &str| q.is_empty() || label.to_lowercase().contains(&q);

    rsx! {
        section { "data-screen": "settings",
            div { class: "page-head",
                div {
                    h1 { "设置" }
                }
                div { class: "page-actions",
                    button { class: "btn btn-secondary", onclick: close, "← 项目墙" }
                }
            }

            div { class: "st-shell",
                div { class: "st-nav",
                    input {
                        class: "input search",
                        r#type: "search",
                        placeholder: "搜索设置",
                        value: "{query}",
                        oninput: move |e| query.set(e.value()),
                    }
                    for sec in ["本机", "能力"] {
                        {
                            let items: Vec<_> = nav_items
                                .iter()
                                .filter(|(_, s, label, _)| *s == sec && visible(label))
                                .collect();
                            rsx! {
                                if !items.is_empty() {
                                    div { class: "st-sec", "{sec}" }
                                    for (p , _ , label , count) in items {
                                        button {
                                            key: "{label}",
                                            class: "sidebar-item",
                                            "aria-current": if *page.read() == *p { "page" } else { "false" },
                                            onclick: {
                                                let p = *p;
                                                move |_| page.set(p)
                                            },
                                            "{label}"
                                            if let Some(n) = count {
                                                span { class: "count", "{n}" }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                div { class: "st-body",
                    match *page.read() {
                        Page::Dirs => dirs_page(s, &bridge),
                        Page::Theme => theme_page(s, &bridge),
                        Page::Connector => rsx! {
                            connector::ConnectorPage {
                                items: s.connectors.clone(),
                                orca_web_url: s.orca_web_url.clone(),
                                bridge: bridge.clone(),
                            }
                        },
                        Page::Skills => rsx! {
                            skills::SkillsPage { items: s.skills.clone(), focus: s.focus_skill.clone() }
                        },
                        Page::Stage => rsx! {
                            stage::StagePage { rows: s.stage.clone(), bridge: bridge.clone() }
                        },
                        Page::Plugins => rsx! {
                            plugins::PluginsPage { items: s.plugins.clone() }
                        },
                        Page::Assets => assets::view(s),
                    }
                }
            }
        }
    }
}

fn dirs_page(s: &crate::vm::SettingsVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "pane-head", h2 { "目录" } }
        div { class: "set-group",
            RootRow { value: s.workspaces_root.clone(), bridge: bridge.clone() }
            {path_row("数据目录", &s.data_dir)}
        }
    }
}

fn theme_page(s: &crate::vm::SettingsVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "pane-head", h2 { "外观" } }
        div { class: "set-group",
            ThemeRow { value: s.theme.clone(), bridge: bridge.clone() }
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

fn path_row(label: &str, value: &str) -> Element {
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
