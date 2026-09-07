//! 项目内 · 配置。只留两块:开工工具映射、技能与 workflow。
//! 探活在项目墙 / 设置屏;节律在 Orca;对账没有人点。
//!
//! 版式走设计系统的「设置文法」:小节 + 一张分组,每行「标题 + 一句说明 +
//! 行尾控件」,不再画表格。

use crate::bridge::Bridge;
use crate::vm::{MappingVm, ProjectVm};
use bw::command::Command;
use bw::model::category_from_key;
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let (p, bridge) = (&p, &bridge);
    rsx! {
        section { "data-screen": "config",
            div { class: "page-head",
                div {
                    h1 { "配置" }
                    p { class: "page-desc", "这个项目的两件事:开工用什么工具、有哪些技能与 workflow。探活在项目墙 / 设置,节律在 Orca。" }
                }
            }
            {mapping_block(p, bridge)}
            {skill_block(p)}
        }
    }
}

// ── ① 开工工具映射 ─────────────────────────────────

fn mapping_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "section",
            div {
                h3 { class: "section-title", "开工工具映射" }
                p { class: "section-desc",
                    "开工照这里记的工具走,配了起不来的会当场报错、不会悄悄换成 Claude CLI;跟人走这台机器,不进仓。"
                }
            }
        }
        div { class: "set-group",
            for m in p.config.mappings.iter() {
                MappingRow {
                    key: "{m.category_key}",
                    m: m.clone(),
                    pid: p.id,
                    bridge: bridge.clone(),
                }
            }
        }
    }
}

/// 一行映射。**必须是组件**:它有自己的 `use_signal`,而它是在 `for` 循环里
/// 渲染的 —— 做成普通函数的话,hook 数量会随映射条数变,行与行的输入框内容
/// 会串位(改 A 类别却存到 B 类别上)。
#[component]
fn MappingRow(m: MappingVm, pid: bw::model::ProjectId, bridge: Bridge) -> Element {
    let mut tool = use_signal(|| m.tool.clone());
    let workflow = m.workflow.clone();
    let b = bridge.clone();
    let key = m.category_key.clone();
    let save = move |_| {
        let Some(cat) = category_from_key(&key) else {
            return;
        };
        b.cmd(Command::SaveToolMapping {
            project_id: pid,
            category: cat,
            tool: normalize_tool(&tool.read()),
            workflow: String::new(),
        });
    };
    rsx! {
        div { class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "{m.category_label}" }
                div { class: "set-desc", "workflow(产品默认):{workflow}" }
            }
            div { class: "set-ctl",
                select {
                    class: "input input-sm",
                    value: "{tool}",
                    onchange: move |e| tool.set(e.value()),
                    option { value: "Claude CLI", "Claude CLI" }
                    // Cursor 底座已通(打 cursor-agent);选了探不到就如实报错、
                    // 不退回 Claude —— 和 Claude CLI 同口径,不再灰。
                    option { value: "Cursor", "Cursor" }
                    option { value: "Open Design", "Open Design(本机网页内嵌)" }
                    option { value: "—", "—(未定)" }
                }
                button { class: "btn btn-secondary", onclick: save, "保存" }
            }
        }
    }
}

fn normalize_tool(label: &str) -> String {
    match label.trim() {
        "Claude CLI" => "claude_cli".into(),
        "Cursor" => "cursor".into(),
        "Open Design" => "open_design".into(),
        _ => String::new(),
    }
}

// ── ② 技能与 workflow ───────────────────────────────

fn skill_block(p: &ProjectVm) -> Element {
    rsx! {
        div { class: "section",
            div {
                h3 { class: "section-title", "技能与 workflow" }
                p { class: "section-desc",
                    "Workbench 自带 + 本仓 .claude/skills/,共 {p.config.skills.len()} 个;「用过几次」现算,扫活的 workflow 列聚合。"
                }
            }
        }
        if p.config.skills.is_empty() {
            div { class: "set-group",
                div { class: "empty", "一个都没有 —— Workbench 自带的那份没读出来,这不正常。" }
            }
        } else {
            div { class: "set-group",
                for s in p.config.skills.iter() {
                    div {
                        key: "{s.slug}",
                        class: if p.config.focus_skill == s.slug { "set-row sel" } else { "set-row" },
                        div { class: "set-text",
                            div { class: "set-title",
                                "{s.title}"
                                if s.title != s.slug {
                                    " "
                                    span { class: "mono hint", "{s.slug}" }
                                }
                            }
                            div { class: "set-desc", {desc_or_dash(&s.desc)} }
                        }
                        div { class: "set-ctl",
                            span {
                                class: if s.origin == "蒸馏" { "tag tag-success" } else { "tag tag-neutral" },
                                "{s.origin}"
                            }
                            span { class: "uses",
                                if s.uses == 0 { "还没用过" } else { "用过 {s.uses} 次" }
                            }
                        }
                    }
                }
            }
        }
        div { class: "hint",
            "workflow 的入口是一份 SKILL.md,写的是一整套做事流程,自己调度该用哪个 agent \
             —— 所以 workflow 和技能是同一样东西,不分两张表。导入按钮还没接:用户自己的技能放进\
             这个仓的 `.claude/skills/<目录名>/SKILL.md`,这里会扫成「项目自有」;\
             不要拷进 Workbench 资产目录。启用 / 停用也还没接。"
        }
    }
}

fn desc_or_dash(d: &str) -> String {
    if d.is_empty() {
        "—(SKILL.md 里没写 description)".into()
    } else {
        d.to_string()
    }
}
