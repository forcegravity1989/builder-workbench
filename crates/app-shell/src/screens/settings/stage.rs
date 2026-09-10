//! Stage 表:五个方法论阶段各挂哪个执行器 / 哪条 workflow / 会注入哪几份
//! AI Assets。执行器映射原来埋在 Connector 页底下、workflow 映射自成一节,
//! 同样五行同样形状 —— 合成一张表。见 spec.md §4。

use crate::bridge::Bridge;
use crate::vm::StageRowVm;
use bw::command::Command;
use bw::model::{category_from_key, ProjectId};
use dioxus::prelude::*;

#[component]
pub fn StagePage(rows: Vec<StageRowVm>, bridge: Bridge) -> Element {
    let mut open = use_signal(|| None::<String>);

    let open_key = open.read().clone();
    if let Some(key) = open_key {
        if let Some(row) = rows.iter().find(|r| r.category_key == key) {
            return detail(row, move |_| open.set(None));
        }
        open.set(None);
    }

    rsx! {
        div { class: "pane-head", h2 { "Stage" } }
        div { class: "tbl-wrap",
            table { class: "table", "data-list": "stage",
                thead {
                    tr {
                        th { style: "width:6%" }
                        th { style: "width:16%", "阶段" }
                        th { style: "width:22%", "执行器" }
                        th { style: "width:38%", "Workflow" }
                        th { style: "width:14%", "状态" }
                        th { style: "width:4%" }
                    }
                }
                tbody {
                    for row in rows {
                        StageRow {
                            key: "{row.category_key}",
                            row: row.clone(),
                            bridge: bridge.clone(),
                            open_detail: {
                                let key = row.category_key.clone();
                                move |_| open.set(Some(key.clone()))
                            },
                        }
                    }
                }
            }
        }
    }
}

/// 一行阶段映射。**必须是组件**:它有自己的 `use_signal`,而它是在 `for`
/// 循环里渲染的 —— 做成普通函数,行与行的下拉状态会串位。
#[component]
fn StageRow(row: StageRowVm, bridge: Bridge, open_detail: EventHandler<MouseEvent>) -> Element {
    let mut tool = use_signal(|| row.executor_tool.clone());
    let mut workflow = use_signal(|| row.workflow.clone());
    let key = row.category_key.clone();
    let save_tool = {
        let key = key.clone();
        move |_| {
            let Some(cat) = category_from_key(&key) else {
                return;
            };
            bridge.cmd(Command::SaveToolMapping {
                project_id: ProjectId::nil(),
                category: cat,
                tool: tool.read().clone(),
                workflow: String::new(),
            });
        }
    };
    let status_cls = match row.can_work {
        true => "status status-done",
        false => "status status-blocked",
    };
    let dot_cls = if row.can_work { "c-done" } else { "c-blocked" };
    rsx! {
        tr { key: "{row.category_key}",
            td { span { class: "dot {dot_cls}" } }
            td { class: "t-name", "{row.category_label}" }
            td {
                div { class: "row",
                    select {
                        class: "input input-sm",
                        value: "{tool}",
                        onchange: move |e| tool.set(e.value()),
                        option { value: "claude_cli", "Claude CLI" }
                        option { value: "cursor", "Cursor" }
                        option { value: "open_design", "Open Design" }
                        option { value: "", "—(未定)" }
                    }
                    button { class: "btn btn-secondary btn-icon", onclick: save_tool, title: "保存", "✓" }
                }
            }
            td {
                select {
                    class: "input input-sm",
                    value: "{workflow}",
                    onchange: move |e| workflow.set(e.value()),
                    for opt in &row.workflow_options {
                        option { key: "{opt.value}", value: "{opt.value}",
                            if opt.wired { "{opt.label}" } else { "{opt.label}(⚠ 接不上)" }
                        }
                    }
                }
            }
            td { span { class: "{status_cls}", span { class: "status-dot" } if row.can_work { "能开工" } else { "开不了工" } } }
            td { class: "rowbtn go", onclick: open_detail, "›" }
        }
    }
}

fn detail(row: &StageRowVm, back: impl FnMut(MouseEvent) + 'static) -> Element {
    rsx! {
        button { class: "backlink", onclick: back,
            svg { view_box: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.7",
                path { d: "M10 3 5 8l5 5" }
            }
            "Stage"
        }
        div { class: "dt-head",
            div { class: "dt-icon", "◧" }
            div { class: "grow",
                div { class: "dt-name", "{row.category_label}" }
                div { class: "dt-from", if row.can_work { "能开工" } else { "开不了工 —— 执行器探不到" } }
            }
        }
        h3 { class: "section-title", "开工时会拿到什么" }
        dl { class: "kv",
            dt { "执行器" }
            dd {
                "{row.executor_label}"
                if let Some(ok) = row.executor_ok {
                    " · "
                    if ok { "已找到" } else { "开不了工" }
                }
            }
            dt { "Workflow" }
            dd {
                {
                    row.workflow_options
                        .iter()
                        .find(|o| o.value == row.workflow)
                        .map(|o| o.label.clone())
                        .unwrap_or_else(|| row.workflow.clone())
                }
            }
            dt { "会注入的 AI Assets" }
            dd {
                if row.injects.is_empty() {
                    "没有"
                } else {
                    {row.injects.join(" · ")}
                }
            }
        }
        p { class: "hint",
            "Workflow 下拉里带 ⚠ 的选项是这个仓 .claude/skills/ 下自己写的 —— 选了也接不上:开工解析只认三个写死的名字。这是「用户怎么接入自己的 workflow」这个缺口的位置,真正的接入通道是内核改动,不在本特性范围。"
        }
    }
}
