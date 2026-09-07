//! 项目内 · 配置。只留两块:开工工具映射、技能与 workflow。
//! 探活在项目墙 / 设置屏;节律在 Orca;对账没有人点。

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
            {mapping_block(p, bridge)}
            {skill_block(p)}
        }
    }
}

// ── ① 开工工具映射 ─────────────────────────────────

fn mapping_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "card cfg-section",
            div { class: "cfg-section-head", h3 { "开工工具映射" } }
            div { class: "tbl-wrap",
                table { class: "table",
                    thead {
                        tr {
                            th { "类别" }
                            th { "开工工具(本机)" }
                            th { "workflow(产品默认)" }
                            th { "" }
                        }
                    }
                    tbody {
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
            div { class: "hint",
                "开工工具跟人走这台机器,写本机 settings,不进仓。workflow 是产品默认,不能改。"
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
        tr {
            td { "{m.category_label}" }
            td {
                select {
                    class: "input input-sm",
                    value: "{tool}",
                    onchange: move |e| tool.set(e.value()),
                    option { value: "Claude CLI", "Claude CLI" }
                    // Cursor 底座已通(打 cursor-agent);选了探不到就如实报错、
                    // 不退回 Claude —— 和 Claude CLI 同口径,不再灰。
                    option { value: "Cursor", "Cursor" }
                    option {
                        value: "Open Design",
                        "Open Design(本机网页内嵌,开工开会话屏 OD 标签)"
                    }
                    option { value: "—", "—(未定)" }
                }
                div { class: "hint",
                    "开工会照这一列记的工具走,"
                    strong { "不会悄悄拿 Claude CLI 顶上" }
                    " —— 配了起不来的工具,▶开工 会当场如实报错。"
                }
            }
            td { "{workflow}" }
            td { button { class: "btn btn-secondary", onclick: save, "保存" } }
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
        div { class: "card cfg-section",
            div { class: "cfg-section-head",
                h3 { "技能与 workflow" }
                span { class: "hint",
                    "Workbench 自带 + 本仓 .claude/skills/,共 {p.config.skills.len()} 个"
                }
            }
            if p.config.skills.is_empty() {
                div { class: "empty", "一个都没有 —— Workbench 自带的那份没读出来,这不正常。" }
            } else {
                div { class: "tbl-wrap",
                    table { class: "table",
                        thead {
                            tr {
                                th { "名称" }
                                th { "来源" }
                                th { "一句话" }
                                th { "用过几次" }
                            }
                        }
                        tbody {
                            for s in p.config.skills.iter() {
                                tr {
                                    key: "{s.slug}",
                                    class: if p.config.focus_skill == s.slug { "sel" } else { "" },
                                    td {
                                        "{s.title}"
                                        if s.title != s.slug {
                                            div { class: "hint", "{s.slug}" }
                                        }
                                    }
                                    td {
                                        span {
                                            class: if s.origin == "蒸馏" { "tag tag-success" } else { "tag tag-neutral" },
                                            "{s.origin}"
                                        }
                                    }
                                    td { class: "text-muted", {desc_or_dash(&s.desc)} }
                                    td { class: "mono",
                                        if s.uses == 0 { "—(还没被任何活用过)" } else { "{s.uses}" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            div { class: "hint",
                "workflow 的入口是一份 SKILL.md,写的是一整套做事流程,自己调度该用哪个 agent \
                 —— 所以 V4 里 workflow 和技能是同一样东西,不分两张表。「用过几次」现算:\
                 扫活的 workflow 列聚合,没有战绩表。导入按钮还没接:用户自己的技能放进\
                 这个仓的 `.claude/skills/<目录名>/SKILL.md`,这里会扫成「项目自有」。\
                 不要拷进 Workbench 资产目录(那是自带剧本摊出来的)。启用/停用也还没接。"
            }
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
