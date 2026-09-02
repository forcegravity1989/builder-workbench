//! 项目内 · 配置。开工工具映射 / 技能与 workflow / 项目群 + 工具探活 / 定时,
//! 四大块,都是真表格。(高保真里还有一张「连接器」表,2026-08-21 按指标采集
//! 的新设计整块退场 —— V4 没有任何采集在消费 `.bw/connectors.toml`,显示一个
//! 没人用的东西比不显示更糟。)
//!
//! 三条如实:
//!
//! 1. **「用过几次」是现算的** —— 扫活的 workflow 列聚合,没有战绩表可查。
//! 2. **技能清单没有登记表** —— Workbench 自带的那四份编在二进制里(摊在 Workbench
//!    自己的资产目录,不复制进用户的仓),项目自有的扫仓里 `.claude/skills/`
//!    得到,同名以仓里那份为准。高保真把「workflow」和「skill」分成两张表,
//!    V4 里它们是同一样东西(workflow = SOP 类技能包),所以合成一张,不假装
//!    有两套。
//! 3. **定时那张表没有「下次触发」列** —— 判据是「本周有没有这张活」,不查
//!    任何定时表,所以那一列写的是判据本身。

use crate::bridge::Bridge;
use crate::vm::{MappingVm, ProjectVm, StandardCell};
use bw::command::Command;
use bw::model::category_from_key;
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let (p, bridge) = (&p, &bridge);
    rsx! {
        section {
            {mapping_block(p, bridge)}
            {skill_block(p)}
            div { class: "cfg-pair",
                {probe_block(p, bridge)}
                {cron_block(p)}
            }
            StandardBlock { p: p.clone(), bridge: bridge.clone() }
        }
    }
}

// ── ① 开工工具映射 ─────────────────────────────────

fn mapping_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "cfg-section",
            div { class: "cfg-section-head", h3 { "开工工具映射" } }
            if p.config.mappings.is_empty() {
                div { class: "detail-empty",
                    "这个项目还没有 .bw/config/issue-policy.toml。接入时的规范铺底合进默认分支之后才会有。"
                }
            } else {
                div { class: "tbl-wrap",
                    table { class: "tbl",
                        thead {
                            tr {
                                th { "类别" }
                                th { "开工工具" }
                                th { "workflow" }
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
            }
            div { class: "cfg-readonly-note",
                "建一张活的时候,类别决定它默认用哪个工具、挂哪个 workflow。正本是仓里的 \
                 .bw/config/issue-policy.toml —— 点「保存」就是改那份文件。"
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
    let mut workflow = use_signal(|| m.workflow.clone());
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
            workflow: workflow.read().trim().to_string(),
        });
    };
    rsx! {
        tr {
            td { "{m.category_label}" }
            td {
                select {
                    class: "select-sm",
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
                div { class: "cfg-readonly-note",
                    "开工会照这一列记的工具走,"
                    strong { "不会悄悄拿 Claude CLI 顶上" }
                    " —— 配了起不来的工具,▶开工 会当场如实报错。"
                }
            }
            td {
                input {
                    class: "input",
                    style: "min-width:200px;",
                    value: "{workflow}",
                    placeholder: "workflow / 技能包名,留空 = 无默认",
                    oninput: move |e| workflow.set(e.value()),
                }
            }
            td { button { class: "btn btn-sm btn-primary", onclick: save, "保存" } }
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
        div { class: "cfg-section",
            div { class: "cfg-section-head",
                h3 { "技能与 workflow" }
                span { style: "font-size:11.5px;color:var(--ink-3);",
                    "Workbench 自带 + 本仓 .claude/skills/,共 {p.config.skills.len()} 个"
                }
            }
            if p.config.skills.is_empty() {
                div { class: "detail-empty", "一个都没有 —— Workbench 自带的那份没读出来,这不正常。" }
            } else {
                div { class: "tbl-wrap",
                    table { class: "tbl",
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
                                            div { style: "font-size:11px;color:var(--ink-3);", "{s.slug}" }
                                        }
                                    }
                                    td {
                                        span {
                                            class: if s.origin == "蒸馏" { "chip chip-green" } else { "chip chip-gray" },
                                            "{s.origin}"
                                        }
                                    }
                                    td { style: "color:var(--ink-2);", {desc_or_dash(&s.desc)} }
                                    td { class: "mono",
                                        if s.uses == 0 { "—(还没被任何活用过)" } else { "{s.uses}" }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            div { class: "cfg-readonly-note",
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

// ── ③ 开工工具探活 ────────────────────────────────
//
// 项目群改到总览名片一起编。这里只留探活,免得 ProbeTool 又没入口。

fn probe_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    let c = &p.config;
    rsx! {
        div { class: "cfg-section",
            div { class: "cfg-section-head", h3 { "开工工具探活" } }
            div { style: "font-size:11.5px;color:var(--ink-3);margin-bottom:8px;",
                "远端仓 {c.remote}"
            }
            div { style: "display:flex;gap:8px;flex-wrap:wrap;",
                for t in c.tools.iter() {
                    {probe_chip(&t.name, &t.label, t.ok, &t.detail, bridge)}
                }
            }
            div { class: "cfg-readonly-note",
                "项目群和在研版本在总览名片里改,跟四字段一张活、一次 MR。"
            }
        }
    }
}

fn probe_chip(name: &str, label: &str, ok: Option<bool>, detail: &str, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let n = name.to_string();
    let color = match ok {
        Some(true) => "var(--green)",
        Some(false) => "var(--red)",
        None => "var(--gray)",
    };
    rsx! {
        button {
            key: "{name}",
            class: "btn btn-sm",
            title: "{detail}",
            onclick: move |_| b.cmd(Command::ProbeTool { name: n.clone() }),
            span { class: "dot", style: "background:{color};margin-right:6px;" }
            "{label} · 测一下"
        }
    }
}

// ── ④ 定时 ──────────────────────────────────────────

fn cron_block(p: &ProjectVm) -> Element {
    rsx! {
        div { class: "cfg-section",
            div { class: "cfg-section-head", h3 { "定时" } }
            if p.config.crons.is_empty() {
                div { class: "detail-empty", "{p.config.cadence}" }
            } else {
                div { class: "tbl-wrap",
                    table { class: "tbl",
                        thead { tr { th { "运作活" } th { "怎么触发" } th { "节律" } th { "判据" } } }
                        tbody {
                            for c in p.config.crons.iter() {
                                tr { key: "{c.name}",
                                    td { "{c.name}" }
                                    td { span { class: "chip", "{c.trigger}" } }
                                    td { class: "mono", "{c.schedule}" }
                                    td { style: "color:var(--ink-2);", "{c.rule}" }
                                }
                            }
                        }
                    }
                }
            }
            div { class: "cfg-readonly-note",
                strong { "没有定时表" }
                ",所以没有「下次触发时间」这一列。到点只会自动"
                strong { "建" }
                "活,绝不自动推进 —— 自动建出来的活一样停在待办,「完成」永远由人点。"
            }
        }
    }
}

// ── ⑤ 规范件对账 ────────────────────────────────────

/// 对账是**纯读**的:只回报缺 / 过期 / 人改过,不动仓、不建活。
/// 写仓只发生在接入那一次规范铺底。在研版本去总览名片里改。
#[component]
fn StandardBlock(p: ProjectVm, bridge: Bridge) -> Element {
    let (p, bridge) = (&p, &bridge);
    let b_rec = bridge.clone();
    let pid = p.id;
    let std_ver = match &p.card.standard {
        // 读不动时只写「—」:黄条已经在说「读不出来」,这里再断言「没铺过」就是假话。
        StandardCell::Unreadable => "—".to_string(),
        StandardCell::NeverLaid => "—(这个仓还没铺过规范件)".to_string(),
        StandardCell::Label(s) => s.clone(),
    };
    rsx! {
        div { class: "cfg-section",
            div { class: "cfg-section-head",
                h3 { "规范件" }
                div { style: "display:flex;gap:8px;",
                    button {
                        class: "btn btn-sm",
                        onclick: move |_| b_rec.cmd(Command::ReconcileStandard { project_id: pid }),
                        "对一遍账"
                    }
                }
            }
            div { class: "settings-list",
                div { class: "settings-row",
                    div { div { class: "k", "规范版本" } div { class: "v", "{std_ver}" } }
                }
            }
            div { class: "cfg-readonly-note",
                "对账只看不改:缺哪几份、哪几份过期了、哪几份被人手改过,结果显示在页脚回执里。\
                 在研版本和项目群在总览名片里改。指标正文跟运作活①会话走,不预铺空壳。"
            }
        }
    }
}
