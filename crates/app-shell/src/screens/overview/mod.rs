//! 项目内 · 总览。**结构照 `hifi/index.html` 的 `renderOverview` 排**:七块
//! 竖排,名片与健康并排在第一块的左右两栏。
//!
//! 每一块的数字都是现算的:名片来自 `PROJECT.md` / `.bw/config/project.toml`,健康来
//! 自仓文件与 git 的三条判据,指标定义来自 `.bw/config/metrics.toml`、读数来自
//! `.bw/state/metrics-readings.jsonl`,发版记录来自 git 标签 + 远端 Release。**没有读数就说
//! 无数据,不显示 0**。

use crate::bridge::{Bridge, ChromeBusy, Panel, PanelNav, Req, STARTING_SESSION};
use crate::chrome::light_dot;
use crate::vm::{MetricCardVm, ProjectVm, StandardCell};
use bw::command::{Command, ProjectIntent};
use bw::model::ProjectId;
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    // 名片是不是正在编辑。草稿含名片 + 在研版本 + 项目群,纯本机,没确认前不发命令。
    let nav = use_context::<PanelNav>();
    let start_busy = use_context::<ChromeBusy>();
    let editing = use_signal(|| false);
    let draft = use_signal(CardDraft::default);

    rsx! {
        section { class: "ov-stack",
            // 本周还没有运作活①才给「开始本周」。做完(含已完成)不再冒出来。
            // 还开着时只指路去会话屏,再点一次会重建一张同名活。
            if !p.week_started {
                {start_banner(&p, &bridge, nav, start_busy)}
            } else if let Some(st) = p.ops1_status.clone() {
                {running_banner(st, nav)}
            }
            {card_and_health(&p, &bridge, editing, draft)}
            {north_star_block(&p, &bridge)}
            // 本周计划进度紧跟北极星:第一眼要能看全「这项目是什么 · 顶层目标
            // 是什么 · 这周在往那个目标上推什么」。滞后/引领两层是展开看的细节,
            // 排在后面。
            {week_block(&p)}
            {metric_row_block("滞后性指标", &p.metrics.lagging, p.metrics.note.as_deref(), &bridge, p.metrics.collected, p.id)}
            {metric_row_block("引领性指标", &p.metrics.leading, None, &bridge, p.metrics.collected, p.id)}
            {repo_block(&p, &bridge)}
            {version_block(&p)}
        }
    }
}

fn start_banner(p: &ProjectVm, bridge: &Bridge, nav: PanelNav, busy: ChromeBusy) -> Element {
    let b = bridge.clone();
    let (pid, week) = (p.id, p.current_week.clone());
    rsx! {
        div { class: "ov-banner",
            span { "本周({p.current_week})还没开始「更新指标 + 制定本周计划」" }
            button {
                class: "btn btn-primary btn-sm",
                onclick: move |_| {
                    // 先立遮罩再切会话:iframe 一挂就是原生层,后到的 HTML 遮罩盖不住。
                    busy.set(STARTING_SESSION);
                    b.cmd(Command::StartWeekPlanning {
                        project_id: pid,
                        week: week.clone(),
                    });
                    // 剩下的在会话屏里发生(复盘上周 → 更新指标 → 聊出本周),
                    // 人点完这一下就该看到那场会话,不是留在总览上猜。
                    nav.go(Panel::Session);
                },
                "开始本周"
            }
        }
    }
}

/// 运作活①还开着:横幅只指路,不再给「开始本周」。
fn running_banner(status: String, nav: PanelNav) -> Element {
    rsx! {
        div { class: "ov-banner",
            span {
                "运作活①(更新指标 + 制定本周计划)已开工 · {status}。去会话屏接着聊。"
            }
            button {
                class: "btn btn-sm",
                onclick: move |_| nav.go(Panel::Session),
                "去会话屏"
            }
        }
    }
}

/// 总览「编辑」一份草稿。仓文件仍是 `PROJECT.md` + `project.toml` 两份。
#[derive(Clone, Default)]
struct CardDraft {
    brief: String,
    benchmark: String,
    north: String,
    version: String,
    chat_provider: String,
    chat_group: String,
    /// 五件群通知事件各开不开,顺序按 [`bw::chat::NotifyEvent::ALL`]。
    notify: Vec<bool>,
}

impl CardDraft {
    fn from_project(p: &ProjectVm) -> Self {
        let ev = &p.config.chat_events;
        // `ev` 为空(没配群)= 默认全开;配了就按表里的勾。
        let on = |i: usize| ev.get(i).map(|(_, o)| *o).unwrap_or(ev.is_empty());
        let provider = if p.config.chat_provider == "未配" {
            String::new()
        } else {
            p.config.chat_provider.clone()
        };
        let group = if p.config.chat_group == "—" {
            String::new()
        } else {
            p.config.chat_group.clone()
        };
        Self {
            brief: p.card.brief.clone(),
            benchmark: p.card.benchmark.clone(),
            north: p.card.north_star.clone(),
            version: p.card.current_version_raw.clone(),
            chat_provider: provider,
            chat_group: group,
            notify: bw::chat::NotifyEvent::ALL
                .iter()
                .enumerate()
                .map(|(i, _)| on(i))
                .collect(),
        }
    }

    fn notify_keys(&self) -> Vec<String> {
        bw::chat::NotifyEvent::ALL
            .iter()
            .zip(self.notify.iter().chain(std::iter::repeat(&false)))
            .filter(|(_, on)| **on)
            .map(|(e, _)| e.key().to_string())
            .collect()
    }
}

// ── ① 名片 + 健康(并排两栏)────────────────────────────

fn card_and_health(
    p: &ProjectVm,
    bridge: &Bridge,
    mut editing: Signal<bool>,
    mut draft: Signal<CardDraft>,
) -> Element {
    let c = &p.card;
    let is_editing = *editing.read();
    let b_edit = bridge.clone();
    let b_pull = bridge.clone();
    let pid = p.id;
    let name = p.name.clone();

    let start_edit = {
        let seed = CardDraft::from_project(p);
        move |_| {
            draft.set(seed.clone());
            editing.set(true);
        }
    };

    rsx! {
        div { class: "card ov-block ov-block1",
            div { class: "info",
                div { class: "charter-name", "{name}" }
                if is_editing {
                    div { class: "formrow",
                        label { class: "label", "想做什么" }
                        textarea {
                            class: "textarea",
                            value: "{draft.read().brief}",
                            oninput: move |e| draft.write().brief = e.value(),
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "最像的对标" }
                        input {
                            class: "input",
                            value: "{draft.read().benchmark}",
                            oninput: move |e| draft.write().benchmark = e.value(),
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "三个月长成什么样(北极星)" }
                        textarea {
                            class: "textarea",
                            value: "{draft.read().north}",
                            oninput: move |e| draft.write().north = e.value(),
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "在研版本" }
                        input {
                            class: "input mono",
                            value: "{draft.read().version}",
                            oninput: move |e| draft.write().version = e.value(),
                        }
                    }
                    div { class: "formrow",
                        label { class: "label", "项目群" }
                        select {
                            class: "select",
                            value: "{draft.read().chat_provider}",
                            onchange: move |e| draft.write().chat_provider = e.value(),
                            option { value: "", "不配" }
                            option { value: "welink", "WeLink" }
                        }
                    }
                    if !draft.read().chat_provider.is_empty() {
                        div { class: "formrow",
                            label { class: "label", "群号" }
                            input {
                                class: "input mono",
                                value: "{draft.read().chat_group}",
                                oninput: move |e| draft.write().chat_group = e.value(),
                            }
                        }
                        div { class: "formrow",
                            label { class: "label", "同步哪些通知" }
                            div { style: "display:flex;gap:14px;flex-wrap:wrap;font-size:12px;",
                                for (i, ev) in bw::chat::NotifyEvent::ALL.iter().enumerate() {
                                    label {
                                        input {
                                            r#type: "checkbox",
                                            checked: draft.read().notify.get(i).copied().unwrap_or(false),
                                            oninput: move |e| {
                                                if let Some(slot) = draft.write().notify.get_mut(i) {
                                                    *slot = e.checked();
                                                }
                                            },
                                        }
                                        " {ev.label()}"
                                    }
                                }
                            }
                        }
                    }
                    div { style: "display:flex;gap:8px;justify-content:flex-end;",
                        button {
                            class: "btn btn-sm",
                            onclick: move |_| editing.set(false),
                            "取消"
                        }
                        button {
                            class: "btn btn-sm btn-primary",
                            onclick: move |_| {
                                let d = draft.read().clone();
                                let chat_notify = d.notify_keys();
                                b_edit.cmd(Command::EditProjectCard {
                                    project_id: pid,
                                    intent: ProjectIntent {
                                        name: name.clone(),
                                        brief: d.brief,
                                        benchmark: d.benchmark,
                                        north_star: d.north,
                                        current_version: d.version.trim().to_string(),
                                        chat_provider: d.chat_provider.clone(),
                                        chat_group: d.chat_group.trim().to_string(),
                                        chat_notify,
                                    },
                                });
                                editing.set(false);
                            },
                            "保存 · 建一张活提 MR"
                        }
                    }
                } else {
                    {charter_line("想做什么", &c.brief)}
                    {charter_line("对标", &c.benchmark)}
                    {charter_line("北极星", &c.north_star)}
                    {charter_line("在研版本", &c.current_version)}
                    {charter_line("项目群", &c.chat)}
                    div { class: "charter-meta",
                        span { class: "mono", "{c.remote}" }
                        match &c.standard {
                            StandardCell::Label(v) => rsx! { span { "规范 {v}" } },
                            _ => rsx! { span { "规范 —" } },
                        }
                        span { style: "margin-left:auto;display:flex;gap:6px;",
                            // 人在网页上直接合了 MR 时,Workbench 是不知道的 ——
                            // 工作区会一直停在旧提交,而界面照常显示旧内容。
                            // 这颗按钮是补那一下的唯一入口。
                            button {
                                class: "btn btn-sm",
                                title: "把工作区的主检出快进到远端最新(git pull --ff-only)",
                                onclick: move |_| b_pull.cmd(Command::PullWorkspace { project_id: pid }),
                                "↻ 拉到最新"
                            }
                            button { class: "btn btn-sm", onclick: start_edit, "编辑" }
                        }
                    }
                }
                {card_mr_banner(p, bridge)}
            }
            div { class: "health",
                div { class: "health-big",
                    {light_dot(p.health.signal, true)}
                    span { class: "health-word", "{crate::theme::signal_label(p.health.signal)}" }
                }
                if p.health.reasons.is_empty() {
                    div { class: "detail-empty", "还没有任何真实数据 —— 灰不是绿。" }
                } else {
                    div { class: "health-reasons",
                        for (i, (ok, text)) in p.health.reasons.iter().enumerate() {
                            div { key: "{i}", class: "health-reason",
                                span { class: "mark", {if *ok { "✓" } else { "○" }} }
                                span { "{text}" }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn charter_line(k: &str, v: &str) -> Element {
    rsx! {
        div { class: "charter-line",
            span { class: "k", "{k}" }
            "{v}"
        }
    }
}

/// 名片是仓文件,改它一律走分支 + MR。改完到合入之间这条横幅一直在。
fn card_mr_banner(p: &ProjectVm, bridge: &Bridge) -> Element {
    let Some(mr) = p.card_mr.as_ref() else {
        return rsx! {};
    };
    let b = bridge.clone();
    let id = mr.issue_id;
    let pr = if mr.pr_number > 0 {
        format!("MR !{}", mr.pr_number)
    } else {
        "还没提 MR".to_string()
    };
    rsx! {
        div { class: "mr-banner",
            span { "项目信息改动在 #{mr.number}「{mr.status}」· {pr}" }
            if mr.mergeable {
                if let Some(id) = id {
                    if mr.has_open_mr {
                        button {
                            class: "btn btn-sm btn-primary",
                            onclick: move |_| b.cmd(Command::MergeAndSettle { id }),
                            "合入并完成"
                        }
                    } else {
                        button {
                            class: "btn btn-sm btn-primary",
                            onclick: move |_| b.cmd(Command::TransitionIssue {
                                id,
                                to: bw::model::IssueStatus::Done,
                            }),
                            "完成(无开着的 MR)"
                        }
                    }
                }
            }
        }
    }
}

// ── ②③④ 指标 ────────────────────────────────────────

fn north_star_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    rsx! {
        div { class: "card ov-block",
            div { class: "repo-metric-head",
                div { class: "ov-block-title", "北极星" }
                // 一颗按钮采三层。**不在打开总览时自动跑** —— 一次要起好几个
                // 采集脚本(还可能各自连远端),不该在每次进项目、每次重绘时发生。
                button {
                    class: "btn btn-sm",
                    onclick: move |_| b.send(Req::CollectMetrics),
                    {if p.metrics.collected { "↻ 重新采集" } else { "↻ 采一次指标" }}
                }
            }
            // 读不动和还没有是两件事:读不动就整块灰 + 原话,**不猜、不用旧值顶上**。
            if let Some(e) = p.metrics.error.as_ref() {
                div { class: "detail-empty", style: "color:var(--alert-deep);", "指标文件读不了:{e}" }
            } else {
                match p.metrics.north_star.as_ref() {
                    Some(m) => metric_card(m, true, p.id, bridge),
                    None => rsx! { div { class: "detail-empty", "还没定北极星。" } },
                }
            }
        }
    }
}

fn metric_row_block(
    title: &str,
    cards: &[MetricCardVm],
    note: Option<&str>,
    bridge: &Bridge,
    collected: bool,
    pid: ProjectId,
) -> Element {
    let b = bridge.clone();
    rsx! {
        div { class: "card ov-block",
            div { class: "repo-metric-head",
                div { class: "ov-block-title", "{title}" }
                // 和北极星、代码仓级同一颗按钮、同一条命令。采一次三层一起跑,
                // 不在打开总览时自动跑。
                button {
                    class: "btn btn-sm",
                    onclick: move |_| b.send(Req::CollectMetrics),
                    {if collected { "↻ 重新采集" } else { "↻ 采一次指标" }}
                }
            }
            if let Some(n) = note {
                div { class: "detail-empty", "{n}" }
            }
            if cards.is_empty() && note.is_none() {
                div { class: "detail-empty", "这一档还没有指标。" }
            }
            if !cards.is_empty() && !collected {
                div { class: "detail-empty",
                    "还没采过。点上面那颗按钮会现算近四周,每张卡固定一块折线 —— 不自动跑。"
                }
            }
            div { class: "ov-row",
                for m in cards.iter() {
                    {metric_card(m, false, pid, bridge)}
                }
            }
        }
    }
}

fn metric_series(m: &MetricCardVm) -> crate::chrome::sparkline::Series {
    crate::chrome::sparkline::Series {
        label: String::new(),
        points: m
            .trend
            .iter()
            .map(|(w, v)| {
                (
                    w.split_once("-W")
                        .map_or_else(|| w.clone(), |(_, n)| format!("W{n}")),
                    *v,
                )
            })
            .collect(),
        color: "var(--clay)",
    }
}

/// 相对上周:取序列里最后两个已知数。只有一个点或解不出数就写「—」。
fn vs_last_week(trend: &[(String, Option<f64>)]) -> String {
    let known: Vec<f64> = trend.iter().filter_map(|(_, v)| *v).collect();
    match known.as_slice() {
        [.., prev, cur] => {
            let d = cur - prev;
            if d.abs() < f64::EPSILON {
                "相对上周 持平".into()
            } else if d > 0.0 {
                format!("相对上周 +{}", fmt_delta(d))
            } else {
                format!("相对上周 {}", fmt_delta(d))
            }
        }
        _ => "相对上周 —".into(),
    }
}

fn fmt_delta(v: f64) -> String {
    if (v - v.round()).abs() < 0.05 {
        format!("{}", v.round() as i64)
    } else {
        format!("{v:.1}")
    }
}

/// 指标卡。**没读数走灰卡** —— 灰卡上写的是「无观测 · Unknown ≠ 绿」,
/// 不是一个 0。折线始终占一块:没点就写「尚无观测」,一个点也画。
fn metric_card(m: &MetricCardVm, big: bool, pid: ProjectId, bridge: &Bridge) -> Element {
    let name_cls = if big { "mcard-name big" } else { "mcard-name" };
    let value_cls = if big {
        "mcard-value big"
    } else {
        "mcard-value"
    };
    let target = if m.target.is_empty() {
        "目标未设".to_string()
    } else {
        format!("目标 {}", m.target)
    };
    // 脚本采到的现值优先;手填以流水为准(记下当天立刻能看见)。
    let shown = if m.manual {
        m.reading.as_ref().or(m.collected.as_ref())
    } else {
        m.collected.as_ref().or(m.reading.as_ref())
    };
    let Some(reading) = shown else {
        let cls = if big {
            "mcard gray north"
        } else {
            "mcard gray"
        };
        return rsx! {
            div { key: "{m.id}", class: "{cls}", title: "{m.def}",
                div { class: "mcard-head",
                    span { class: "{name_cls}", "{m.name}" }
                    if m.manual {
                        span { class: "chip badge-manual", "手填" }
                    }
                }
                div { class: "mcard-value-row",
                    span { class: "{value_cls}", style: "color:var(--ink-4);", "—" }
                    span { class: "mcard-delta", "{vs_last_week(&m.trend)}" }
                    span { class: "mcard-target", "{target}" }
                }
                if m.collect_error.is_empty() {
                    div { class: "mcard-sub", "无观测 · Unknown ≠ 绿(还没采到过这条读数)" }
                } else {
                    // **没采到就说没采到,并且把原话端出来** —— 不写 0。
                    div { class: "mcard-sub", style: "color:var(--alert-deep);", "{m.collect_error}" }
                }
                {crate::chrome::sparkline::trend_chart(&metric_series(m))}
                if m.manual {
                    ManualFill {
                        pid,
                        name: m.name.clone(),
                        current: String::new(),
                        bridge: bridge.clone(),
                    }
                }
            }
        };
    };
    let dot_color = if m.manual {
        "var(--amber)"
    } else {
        "var(--green)"
    };
    let cls = if big { "mcard north" } else { "mcard" };
    rsx! {
        div { key: "{m.id}", class: "{cls}", title: "{m.def}",
            div { class: "mcard-head",
                span { class: "dot", style: "background:{dot_color};" }
                span { class: "{name_cls}", "{m.name}" }
                if m.manual {
                    span { class: "chip badge-manual", "手填" }
                } else if !m.class.is_empty() {
                    span { class: "chip", "{m.class}" }
                }
            }
            div { class: "mcard-value-row",
                span { class: "{value_cls}", "{reading}" }
                span { class: "mcard-delta", "{vs_last_week(&m.trend)}" }
                span { class: "mcard-target", "{target}" }
            }
            if !m.collect_error.is_empty() {
                div { class: "mcard-sub", style: "color:var(--alert-deep);", "{m.collect_error}" }
            } else if !m.source.is_empty() || !m.collected_at.is_empty() {
                div { class: "mcard-sub", "来源 {m.source} · 采于 {m.collected_at}" }
            }
            {crate::chrome::sparkline::trend_chart(&metric_series(m))}
            if m.manual {
                ManualFill {
                    pid,
                    name: m.name.clone(),
                    current: reading.clone(),
                    bridge: bridge.clone(),
                }
            }
            if !m.driving.is_empty() {
                div { class: "mcard-driven",
                    for t in m.driving.iter() {
                        span { key: "{t}", class: "chip", "{t}" }
                    }
                }
            }
        }
    }
}

#[component]
fn ManualFill(pid: ProjectId, name: String, current: String, bridge: Bridge) -> Element {
    let mut draft = use_signal(|| current);
    let b = bridge.clone();
    rsx! {
        div { class: "mcard-fill",
            input {
                class: "input",
                value: "{draft}",
                placeholder: "今天这个数",
                oninput: move |e| draft.set(e.value()),
            }
            button {
                class: "btn btn-sm btn-primary",
                disabled: draft.read().trim().is_empty(),
                onclick: move |_| {
                    let v = draft.read().trim().to_string();
                    if v.is_empty() {
                        return;
                    }
                    b.cmd(Command::RecordManualMetric {
                        project_id: pid,
                        name: name.clone(),
                        value: v,
                    });
                },
                "记下"
            }
        }
    }
}

/// 近四周三条走势。**每个点都是现算的** —— 能采到今天的数就能采到过去任意
/// 一周的,所以第一次采集就有完整四周,不用先攒。
fn trend_row(s: &crate::vm::RepoStatsVm) -> Element {
    use crate::chrome::sparkline::{trend_chart, Series};
    if s.trend.is_empty() {
        return rsx! {};
    }
    // `2026-W34` → `W34`,四个点的小图放不下全称。
    let x = |p: &crate::vm::TrendPointVm| {
        p.week
            .split_once("-W")
            .map_or(p.week.clone(), |(_, w)| format!("W{w}"))
    };
    // 一张表定三条线,不是抄三遍 —— 抄三遍的话加第四条线时最省事的做法是复制
    // 前两条,而前两条恰好…… 现在三条都吃 `Option`,复制也不会把「采不到」写成 0。
    //
    // **PR 以远端为准,不再画本机的合并提交数**:同一件事两个口径摆在一起,
    // 读的人分不清该信哪个(squash 合的 PR 本机没有合并提交,本机 `git pull`
    // 产生的合并提交又不对应任何 PR)。合没合入看远端,那个造不了假。
    type Pick = fn(&crate::vm::TrendPointVm) -> Option<f64>;
    const LINES: [(&str, Pick, &str); 3] = [
        ("每周提交", |p| p.commits.map(|n| n as f64), "var(--clay)"),
        (
            "每周合入的 PR(远端)",
            |p| p.merged_prs.map(|n| n as f64),
            "var(--green)",
        ),
        (
            "未处理 issue(远端 · 周末存量)",
            |p| p.open_issues.map(|n| n as f64),
            "var(--amber)",
        ),
    ];
    rsx! {
        div { class: "trend-row",
            for (label, pick, color) in LINES {
                {trend_chart(&Series {
                    label: label.into(),
                    points: s.trend.iter().map(|p| (x(p), pick(p))).collect(),
                    color,
                })}
            }
        }
        if !s.git_note.is_empty() {
            div { class: "cfg-readonly-note", "{s.git_note}" }
        }
        if !s.trend_note.is_empty() {
            div { class: "cfg-readonly-note", "{s.trend_note}" }
        }
    }
}

// ── ⑤ 项目指标 · 代码仓级 ────────────────────────────

fn repo_block(p: &ProjectVm, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    rsx! {
        div { class: "card ov-block",
            div { class: "repo-metric-head",
                h3 { "项目指标 · 代码仓级" }
                button {
                    class: "btn btn-sm",
                    onclick: move |_| b.send(Req::CollectRepoStats),
                    {if p.repo_stats.is_some() { "↻ 重新采集" } else { "↻ 立即采集" }}
                }
            }
            match p.repo_stats.as_ref() {
                None => rsx! {
                    div { class: "detail-empty",
                        "还没采过。采一次要在项目仓里跑好几条 git —— 所以不在每次\
                         打开时自动跑,点上面那颗按钮才采。"
                    }
                },
                Some(s) if !s.error.is_empty() => rsx! {
                    div { class: "detail-empty", style: "color:var(--alert-deep);", "{s.error}" }
                },
                Some(s) => rsx! {
                    // 静态那几个数压成一行小字 —— 它们是「此刻的存量」,没有走势
                    // 可言,不值得一人占一张卡片。
                    div { class: "repo-metric-line",
                        // 分隔点包在同一个带 key 的节点里 —— Dioxus 只认块里
                        // 第一个节点上的 key,拆成两个平级节点会被判 deprecated。
                        for (i, (v, k, _)) in s.items.iter().enumerate() {
                            span { key: "{k}",
                                if i > 0 {
                                    span { class: "sep", "·" }
                                }
                                "{k} "
                                b { class: "mono", "{v}" }
                            }
                        }
                        span { class: "sep", "·" }
                        span { class: "chip chip-gray", "全部来自 git" }
                    }
                    {trend_row(s)}
                },
            }
        }
    }
}

// ── ⑥ 本周计划进度 ──────────────────────────────────

fn week_block(p: &ProjectVm) -> Element {
    let w = p.weeks.iter().find(|w| w.week == p.current_week);
    let goal = w
        .and_then(|w| w.goal.clone())
        .unwrap_or_else(|| "(本周尚无计划)".into());
    let c = &p.week_counts;
    rsx! {
        div { class: "card ov-block",
            div { class: "ov-block-title", "本周计划进度" }
            div { class: "week-goal",
                b { "{p.current_week}" }
                " · {goal}"
            }
            div { class: "week-progress",
                div { style: "width:{c.pct(c.done)}%;background:var(--green);" }
                div { style: "width:{c.pct(c.review)}%;background:var(--amber);" }
                div { style: "width:{c.pct(c.doing)}%;background:var(--clay);" }
                div { style: "width:{c.pct(c.blocked)}%;background:var(--red);" }
                div { style: "width:{c.pct(c.todo)}%;background:#E4DDC8;" }
            }
            div { class: "week-counts",
                span { "待办 " b { "{c.todo}" } }
                span { "进行中 " b { "{c.doing}" } }
                span { "评审中 " b { "{c.review}" } }
                span { "完成 " b { "{c.done}" } }
                if c.blocked > 0 {
                    span { style: "color:var(--alert-deep);", "阻塞 " b { "{c.blocked}" } }
                }
            }
            if !p.ops.is_empty() {
                div { class: "ops-chip-row",
                    for o in p.ops.iter() {
                        span { key: "{o.title}", class: "chip chip-outline", title: "{o.note}",
                            "{o.title} · {o.status}"
                        }
                    }
                }
            }
        }
    }
}

// ── ⑦ 在研版本与发版记录 ────────────────────────────

fn version_block(p: &ProjectVm) -> Element {
    rsx! {
        div { class: "card ov-block",
            div { class: "ov-block-title", "发版记录" }
            div { class: "version-cols",
                div { class: "version-col",
                    div { class: "k", "已发版次数" }
                    div { class: "v mono", "{p.releases.len()}" }
                }
            }
            if p.releases.is_empty() {
                div { class: "detail-empty",
                    "还没有发过版。次数优先读远端 Release,读不到再看本机 git 标签。"
                }
            }
            for r in p.releases.iter() {
                div { key: "{r.version}", class: "release-line",
                    "{r.version} · {r.released_at}"
                    if !r.note.is_empty() {
                        " · {r.note}"
                    }
                    if !r.included.is_empty() {
                        " · 含 {r.included}"
                    }
                    if r.origin != "human" {
                        span { class: "chip chip-gray", style: "margin-left:5px;", "{r.origin}" }
                    }
                }
            }
        }
    }
}
