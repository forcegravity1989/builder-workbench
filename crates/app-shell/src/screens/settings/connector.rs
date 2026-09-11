//! Connector 列表 + 详情。上位词:Workbench 连出去用的一切外部东西 ——
//! 开工执行器、远端臂、群通知、会话宿主 Orca。**不是** V3 那份
//! `.bw/connectors.toml`。见 spec.md §2。

use crate::bridge::{Bridge, Req};
use crate::vm::{ConnectorKind, ConnectorStatus, ConnectorVm};
use bw::command::Command;
use dioxus::prelude::*;

#[component]
pub fn ConnectorPage(items: Vec<ConnectorVm>, orca_web_url: String, bridge: Bridge) -> Element {
    let mut open = use_signal(|| None::<String>);
    let mut query = use_signal(String::new);
    let mut kind = use_signal(|| None::<ConnectorKind>);

    let open_key = open.read().clone();
    if let Some(key) = open_key {
        if let Some(item) = items.iter().find(|c| c.key == key) {
            return detail(item, orca_web_url, bridge.clone(), move |_| open.set(None));
        }
        open.set(None);
    }

    let q = query.read().trim().to_lowercase();
    let filtered: Vec<&ConnectorVm> = items
        .iter()
        .filter(|c| kind.read().is_none_or(|k| k == c.kind))
        .filter(|c| q.is_empty() || c.name.to_lowercase().contains(&q))
        .collect();

    let mut counts = [0usize; 4];
    for c in &items {
        counts[ConnectorKind::ALL
            .iter()
            .position(|k| *k == c.kind)
            .unwrap()] += 1;
    }
    let mut bucket = [0usize; 4]; // done / blocked / unset / idle
    for c in &items {
        match c.status {
            ConnectorStatus::Found => bucket[0] += 1,
            ConnectorStatus::Blocked => bucket[1] += 1,
            ConnectorStatus::Unconfigured | ConnectorStatus::ConfiguredNoProbe => bucket[2] += 1,
            ConnectorStatus::Idle | ConnectorStatus::NotProbed => bucket[3] += 1,
        }
    }
    let total = items.len().max(1) as f32;
    let pct = |n: usize| n as f32 * 100.0 / total;

    rsx! {
        div { class: "pane-head",
            h2 { "Connector" }
            input {
                class: "input search",
                r#type: "search",
                placeholder: "搜 connector",
                value: "{query}",
                oninput: move |e| query.set(e.value()),
            }
            button {
                class: "btn btn-secondary",
                onclick: {
                    let b = bridge.clone();
                    move |_| b.send(Req::Refresh)
                },
                "重新探活"
            }
        }

        div { class: "bar",
            i { class: "c-done", style: "width:{pct(bucket[0])}%" }
            i { class: "c-blocked", style: "width:{pct(bucket[1])}%" }
            i { class: "c-unset", style: "width:{pct(bucket[2])}%" }
            i { class: "c-idle", style: "width:{pct(bucket[3])}%" }
        }
        div { class: "bar-key",
            span { i { class: "dot c-done" } "已找到 " b { "{bucket[0]}" } }
            span { i { class: "dot c-blocked" } "开不了工 " b { "{bucket[1]}" } }
            span { i { class: "dot c-unset" } "还没配 " b { "{bucket[2]}" } }
            span { i { class: "dot c-idle" } "还没用上 " b { "{bucket[3]}" } }
        }

        div { class: "filterbar",
            div { class: "seg",
                label { class: "seg-opt",
                    input {
                        r#type: "radio",
                        name: "conn-kind",
                        checked: kind.read().is_none(),
                        onchange: move |_| kind.set(None),
                    }
                    "全部"
                }
                for k in ConnectorKind::ALL {
                    label { class: "seg-opt", key: "{k.label()}",
                        input {
                            r#type: "radio",
                            name: "conn-kind",
                            checked: *kind.read() == Some(k),
                            onchange: move |_| kind.set(Some(k)),
                        }
                        "{k.label()} {counts[ConnectorKind::ALL.iter().position(|x| *x == k).unwrap()]}"
                    }
                }
            }
        }

        div { class: "tbl-wrap",
            table { class: "table",
                thead {
                    tr {
                        th { style: "width:6%" }
                        th { style: "width:30%", "Connector" }
                        th { style: "width:16%", "类型" }
                        th { style: "width:44%", "谁用到" }
                        th { style: "width:4%" }
                    }
                }
                tbody {
                    if filtered.is_empty() {
                        tr { td { colspan: "5", class: "empty", "没有匹配的 connector" } }
                    }
                    for c in filtered {
                        tr {
                            key: "{c.key}",
                            class: "rowbtn",
                            tabindex: "0",
                            role: "button",
                            onclick: {
                                let key = c.key.clone();
                                move |_| open.set(Some(key.clone()))
                            },
                            td { span { class: "dot {c.status.dot_class()}", title: "{c.status.label()}" } }
                            td { class: "t-name", "{c.name}" }
                            td { span { class: "tag tag-outline", "{c.kind.label()}" } }
                            td { class: "t-sub",
                                if c.used_by.is_empty() { "没有类别用到" } else { {c.used_by.join(" · ")} }
                            }
                            td { class: "go", "›" }
                        }
                    }
                }
            }
        }
    }
}

fn detail(
    c: &ConnectorVm,
    orca_web_url: String,
    bridge: Bridge,
    back: impl FnMut(MouseEvent) + 'static,
) -> Element {
    let info = connector_info(&c.key);
    rsx! {
        button { class: "backlink", onclick: back,
            svg { view_box: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.7",
                path { d: "M10 3 5 8l5 5" }
            }
            "Connector"
        }
        div { class: "dt-head",
            div { class: "dt-icon", "◆" }
            div { class: "grow",
                div { class: "dt-name", "{c.name}" }
                div { class: "dt-from", "{c.kind.label()} · {c.detail}" }
            }
            div { class: "dt-act",
                span { class: "status {status_cls(c.status)}",
                    span { class: "status-dot" }
                    "{c.status.label()}"
                }
                if c.key != "orca" {
                    button {
                        class: "btn btn-secondary",
                        onclick: {
                            let b = bridge.clone();
                            move |_| b.send(Req::Refresh)
                        },
                        "重新探活"
                    }
                }
            }
        }

        h3 { class: "section-title", "它给 Workbench 供什么" }
        ul { class: "dt-list",
            for s in &info.supplies { li { "{s}" } }
        }

        if !c.used_by.is_empty() {
            dl { class: "kv",
                dt { "谁用到" }
                dd { {c.used_by.join(" · ")} }
            }
        }

        if c.key == "orca" {
            h3 { class: "section-title", "网页配对地址" }
            OrcaUrlRow { value: orca_web_url.clone(), bridge: bridge.clone() }
        } else {
            h3 { class: "section-title", "怎么装" }
            {install_block(&info)}
        }
    }
}

/// Orca 网页配对 URL:安装版「给 web 配对」给的那条(带 token),存本机设置,
/// 不进仓。只认 loopback,非 loopback 在会话屏被如实滤成空。
#[component]
fn OrcaUrlRow(value: String, bridge: Bridge) -> Element {
    let mut draft = use_signal(|| value.clone());
    rsx! {
        div { class: "set-group",
            div { class: "set-row",
                div { class: "set-ctl",
                    input {
                        class: "input mono",
                        value: "{draft}",
                        placeholder: "http://127.0.0.1:6768/web-index.html#pairing=…",
                        oninput: move |e| draft.set(e.value()),
                    }
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| bridge.cmd(Command::SetOrcaWebUrl { url: draft.read().clone() }),
                        "保存"
                    }
                }
            }
        }
    }
}

fn status_cls(s: ConnectorStatus) -> &'static str {
    match s {
        ConnectorStatus::Found => "status-done",
        ConnectorStatus::Blocked => "status-blocked",
        _ => "status-todo",
    }
}

struct ConnectorInfo {
    supplies: Vec<&'static str>,
    install: Install,
}

enum Install {
    Commands(Vec<&'static str>),
    /// 仓里没记、我也没有可靠出处的,如实说没记 + 判据,**不编一条猜的包名**。
    Undocumented(&'static str),
    RunIt(&'static str),
}

fn install_block(info: &ConnectorInfo) -> Element {
    match &info.install {
        Install::Commands(cmds) => rsx! {
            for cmd in cmds {
                div { class: "install", code { "{cmd}" } }
            }
        },
        Install::Undocumented(criterion) => rsx! {
            div { class: "todo-note", "装法仓里没记。判据:{criterion}" }
        },
        Install::RunIt(how) => rsx! {
            div { class: "todo-note", "{how}" }
        },
    }
}

fn connector_info(key: &str) -> ConnectorInfo {
    match key {
        "claude_cli" => ConnectorInfo {
            supplies: vec![
                "开工起交互式会话",
                "一次性系统提示词注入",
                "BW_CLAUDE_MAX_BUDGET_USD 控预算",
                "BW_CLAUDE_BIN 换位置",
            ],
            install: Install::Commands(vec![
                "npm install -g @anthropic-ai/claude-code",
                "curl -fsSL https://claude.ai/install.sh | bash",
            ]),
        },
        "cursor" => ConnectorInfo {
            supplies: vec!["开工起交互式会话(选了就当真,探不到当场报错,不悄悄退回 Claude CLI)"],
            install: Install::Commands(vec!["curl https://cursor.com/install -fsS | bash"]),
        },
        "open_design" => ConnectorInfo {
            supplies: vec![
                "原型类活的内嵌网页",
                "探活是管道握手拿 loopback 首页,超时 400ms",
                "不解析会话地址、不自动开跑",
            ],
            install: Install::RunIt("本机服务,不装 —— 起它,再点「重新探活」。"),
        },
        "gh" => ConnectorInfo {
            supplies: vec![
                "读 issue 列表与详情",
                "开 PR 与按分支反查",
                "合入后读回状态(只信真变 MERGED)",
            ],
            install: Install::Commands(vec![
                "brew install gh",
                "winget install --id GitHub.cli",
                "gh auth login",
            ]),
        },
        "codehub" => ConnectorInfo {
            supplies: vec!["远端另一家,和 gh 同形两条路(读活、开 MR、读回状态)"],
            install: Install::Undocumented("PATH 上有 codehub-cli 这个名字"),
        },
        "welink_cli" => ConnectorInfo {
            supplies: vec!["项目群通知,配在名片的 chat 段,只在开 MR 时发"],
            install: Install::Commands(vec!["npm i -g welink-cli", "welink-cli auth login"]),
        },
        "orca" => ConnectorInfo {
            supplies: vec![
                "开工会话真正跑的地方(走本机管道,不经网页地址,所以地址没配不挡开工)",
                "三条运作节律的钟",
                "网页配对地址只认 loopback、带 token,绝不进仓与日志",
            ],
            install: Install::RunIt("装 Orca 本体,再在下面填一条网页配对地址。"),
        },
        _ => ConnectorInfo {
            supplies: vec![],
            install: Install::Undocumented("PATH 上有这个名字"),
        },
    }
}
