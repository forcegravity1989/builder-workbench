//! 项目内 · 计划。**结构照 `hifi/index.html` 的 `renderPlan` 排**:左栏 180px
//! 周列表 + 中栏工具条 / 周目标 / 进度条 / 六列看板,右侧 360px 详情抽屉。
//!
//! **所有列都能拖**,但几种拖不是一回事:
//!
//! - 拖进/拖出「待办池」是**排期**,直接生效(改的是这张活排在哪一周)。
//! - 拖进「进行中」是**开工**:确认之后发 ▶跑,并跳到会话屏。详情抽屉里那颗
//!   「▶ 开工」是同一条命令。
//! - 拖进评审中 / 已完成 / 阻塞是**状态动作**,松手弹确认框,确认了才真的发
//!   命令;状态机不允许的转移松手即弹回,连确认框都不弹。
//!
//! **拖进「已完成」= 合入并完成**:人把卡片拖过去,意思就是「这活我认了,合
//! 进去吧」,所以确认之后发的是「合入并完成」——先真的把 MR 合了,再结清;
//! 合不成就整条不算数。详情抽屉里那颗「✓ 点完成」发的是同一条命令,**两个入
//! 口不能一个合一个不合**。
//!
//! 作废要写原因,打取消标签并关掉远端 issue,不是拖进已完成。
//!
//! 卡面上没有按钮 —— 按钮全在右侧详情抽屉。同一个位置按状态互斥切换文案,
//! 不堆一排常驻按钮。

mod detail;
mod kanban;

use crate::bridge::{Bridge, Panel, PanelNav, Req};
use crate::chrome::progress_log;
use crate::vm::{CardItemVm, ProjectVm};
use bw::app::{ProgressLine, StepState};
use bw::command::Command;
use bw::model::{
    category_from_key, category_key, IssueId, IssueKind, IssueOrigin, IssueStatus, StageKind,
};
use dioxus::prelude::*;

use detail::DetailPanel;
use kanban::{board, PendingMove};

/// 「全部活」视图上的四个筛选器。纯界面过滤,不发命令。
#[derive(Clone, Default, PartialEq)]
struct Filters {
    category: String,
    version: String,
    origin: String,
    keyword: String,
}

impl Filters {
    fn keep(&self, c: &CardItemVm) -> bool {
        (self.category.is_empty() || c.category == self.category)
            && (self.version.is_empty() || c.version == self.version)
            && (self.origin.is_empty() || c.origin == self.origin)
            && (self.keyword.is_empty()
                || c.title
                    .to_lowercase()
                    .contains(&self.keyword.to_lowercase()))
    }
}

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let (p, bridge) = (&p, &bridge);
    let dragging = use_signal(|| None::<CardItemVm>);
    let mut pending = use_signal(|| None::<PendingMove>);
    let selected = use_signal(|| None::<IssueId>);
    let bounced = use_signal(String::new);
    let filters = use_signal(Filters::default);
    // 「合入并完成」要走远端合 MR + 拉仓 + 关 issue,两三秒。确认框不关,
    // 用和接入屏同一条进度通道,免得人以为没点上。
    let merge_log = use_signal(Vec::<ProgressLine>::new);
    let mut merging = use_signal(|| false);
    let new_issue = use_signal(|| None::<NewIssueDraft>);
    let release = use_signal(|| None::<ReleaseDraft>);
    let cancel_reason = use_signal(String::new);
    let nav = use_context::<PanelNav>();
    let prog = bridge.progress.clone();
    use_future(move || {
        let mut merge_log = merge_log;
        let mut rx = prog.subscribe();
        async move {
            while let Ok(line) = rx.recv().await {
                let mut rows = merge_log.write();
                match rows.iter().position(|r: &ProgressLine| r.step == line.step) {
                    Some(i) => rows[i] = line,
                    None => rows.push(line),
                }
            }
        }
    });
    use_effect(move || {
        let rows = merge_log.read().clone();
        if !*merging.peek() {
            return;
        }
        if rows.iter().any(|r| r.step == 3 && r.state == StepState::Ok) {
            merging.set(false);
            pending.set(None);
        }
    });

    rsx! {
        section {
            class: if selected.read().is_some() { "plan-grid has-detail" } else { "plan-grid" },
            style: "height:calc(100vh - 112px);",
            div { class: "plan-col", {week_rail(p, bridge)} }
            div { class: "plan-col plan-mid",
                {toolbar(p, bridge, new_issue, release)}
                if p.view_all {
                    {filter_bar(filters)}
                } else {
                    {week_head(p)}
                }
                {draft_confirm(p, bridge)}
                if !bounced.read().is_empty() {
                    div { class: "mr-banner", style: "margin:0 0 8px;color:var(--alert-deep);", "{bounced}" }
                }
                {board(p, Some(filters.read().clone()), bridge, dragging, pending, selected, bounced, nav)}
            }
            DetailPanel { p: p.clone(), selected, pending, bridge: bridge.clone() }
        }
        if let Some(pm) = pending.read().clone() {
            {confirm_dialog(pm, pending, merging, merge_log, cancel_reason, bridge, nav)}
        }
        if let Some(draft) = new_issue.read().clone() {
            {new_issue_dialog(p, draft, new_issue, bridge)}
        }
        if let Some(draft) = release.read().clone() {
            {release_dialog(draft, release, bridge)}
        }
    }
}

#[derive(Clone, PartialEq)]
struct NewIssueDraft {
    title: String,
    body: String,
    category: StageKind,
    kind: IssueKind,
    /// 运作活①或②。业务活不用。
    ops: OpsPick,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum OpsPick {
    WeekPlan,
    Audit,
}

#[derive(Clone, PartialEq)]
struct ReleaseDraft {
    project_id: bw::model::ProjectId,
    version: String,
    note: String,
    included: Vec<IssueId>,
}

// ── 左栏 ────────────────────────────────────────────

fn week_rail(p: &ProjectVm, bridge: &Bridge) -> Element {
    let b_all = bridge.clone();
    rsx! {
        div {
            class: if p.view_all { "plan-weekrow active" } else { "plan-weekrow" },
            onclick: move |_| b_all.send(Req::ViewAll(true)),
            "issue总览"
        }
        if p.weeks.is_empty() {
            div { class: "detail-empty",
                "还没有挂过周标签的活。周列表从 issue 的 bw:week 标签来,本周永远在。"
            }
        }
        for w in p.weeks.iter() {
            {week_row(w, p, bridge)}
        }
        div { class: "plan-versionsel",
            label { class: "label", "在研版本" }
            div { class: "mono", style: "font-size:13px;", "{p.card.current_version}" }
        }
    }
}

fn week_row(w: &crate::vm::WeekVm, p: &ProjectVm, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let week = w.week.clone();
    let active = !p.view_all && w.week == p.viewing_week;
    let is_current = w.week == p.current_week;
    rsx! {
        div {
            key: "{w.week}",
            class: if active { "plan-weekrow active" } else { "plan-weekrow" },
            onclick: move |_| b.send(Req::ViewWeek(week.clone())),
            span {
                "{w.week}"
                if is_current { " · 本周" }
            }
            span { class: "chip-muted", "{w.activity_count}" }
        }
    }
}

// ── 中栏顶部 ────────────────────────────────────────

fn toolbar(
    p: &ProjectVm,
    _bridge: &Bridge,
    mut new_issue: Signal<Option<NewIssueDraft>>,
    mut release: Signal<Option<ReleaseDraft>>,
) -> Element {
    let pid = p.id;
    let version = p.card.current_version_raw.clone();
    let done_ids: Vec<IssueId> = p
        .board
        .columns
        .iter()
        .find(|c| c.status == IssueStatus::Done)
        .map(|c| c.cards.iter().map(|x| x.id).collect())
        .unwrap_or_default();
    let title = if p.view_all {
        "issue总览".to_string()
    } else if p.viewing_week == p.current_week {
        format!("{} · 本周", p.viewing_week)
    } else {
        p.viewing_week.clone()
    };
    rsx! {
        div { class: "plan-toolbar",
            div { class: "left", "{title}" }
            div { class: "right",
                if !p.view_all {
                    button {
                        class: "btn btn-sm",
                        // 这一周真有完成的活才发得了版。版本号弹窗里默认可改。
                        disabled: done_ids.is_empty(),
                        onclick: move |_| release.set(Some(ReleaseDraft {
                            project_id: pid,
                            version: default_release_version(&version),
                            note: "本周完成的活".into(),
                            included: done_ids.clone(),
                        })),
                        "发版本"
                    }
                    button {
                        class: "btn btn-sm btn-primary",
                        onclick: move |_| new_issue.set(Some(NewIssueDraft {
                            title: String::new(),
                            body: String::new(),
                            category: StageKind::Prototype,
                            kind: IssueKind::Business,
                            ops: OpsPick::WeekPlan,
                        })),
                        "新建活"
                    }
                    // 高保真上这里还有一颗「预览 · 未合入」开关:看活自己的
                    // worktree 里那份还没合入的 .bw/metrics.toml 与 .bw/plan/。
                    // 还没接,做成明确的灰态,点不动 —— 不放一个点了没反应的开关。
                    label { class: "switch", title: "还没接:要去读活自己 worktree 里未合入的仓文件",
                        input { r#type: "checkbox", disabled: true }
                        " 预览 · 未合入"
                    }
                }
            }
        }
    }
}

fn week_head(p: &ProjectVm) -> Element {
    let w = p.weeks.iter().find(|w| w.week == p.viewing_week);
    let goal = w
        .and_then(|w| w.goal.clone())
        .unwrap_or_else(|| "(这一周还没写周目标)".into());
    // 这条进度条画在它正上方那个看板上,所以数的是看板的范围,不是本周。
    let c = &p.board_counts;
    rsx! {
        div { class: "goal-box", "{goal}" }
        div { class: "week-progress",
            div { style: "width:{c.pct(c.done)}%;background:var(--green);" }
            div { style: "width:{c.pct(c.review)}%;background:var(--amber);" }
            div { style: "width:{c.pct(c.doing)}%;background:var(--clay);" }
            div { style: "width:{c.pct(c.blocked)}%;background:var(--red);" }
            div { style: "width:{c.pct(c.todo)}%;background:#E4DDC8;" }
        }
        if !p.board_ops.is_empty() {
            div { class: "ops-chip-row",
                for o in p.board_ops.iter() {
                    span { key: "{o.title}", class: "chip chip-outline", title: "{o.note}",
                        "{o.title} · {o.status}"
                    }
                }
            }
        }
    }
}

fn filter_bar(mut filters: Signal<Filters>) -> Element {
    rsx! {
        div { class: "filter-bar",
            select {
                onchange: move |e| filters.write().category = e.value(),
                option { value: "", "类别 · 全部" }
                for c in bw::model::StageKind::ALL {
                    option { key: "{c:?}", value: "{c.label()}", "{c.label()}" }
                }
            }
            input {
                placeholder: "版本…",
                oninput: move |e| filters.write().version = e.value(),
            }
            select {
                onchange: move |e| filters.write().origin = e.value(),
                option { value: "", "来源 · 全部" }
                option { value: "人建", "人建" }
                option { value: "自动建", "自动建" }
                option { value: "agent 拆", "agent 拆" }
            }
            input {
                placeholder: "关键字…",
                oninput: move |e| filters.write().keyword = e.value(),
            }
        }
    }
}

/// 「开始本周」产出的草稿活标,等人确认。**确认之前一张活都没建** —— 草稿
/// 只在界面里活着,库里查不到。人点「先不建」就丢掉,不留痕。
fn draft_confirm(p: &ProjectVm, bridge: &Bridge) -> Element {
    if p.pending_drafts.is_empty() {
        return rsx! {};
    }
    let b_ok = bridge.clone();
    let b_no = bridge.clone();
    let pid = p.id;
    let week = p.viewing_week.clone();
    let titles = p.pending_drafts.clone();
    rsx! {
        div { class: "card", style: "padding:14px 16px;margin-bottom:10px;flex:none;",
            div { style: "font-size:12.5px;color:var(--ink-2);margin-bottom:8px;line-height:1.8;",
                "{week} 的运作活①已开工,下面是草稿活标。确认之前一张活都还没建。"
            }
            for t in titles.iter() {
                div { key: "{t}", style: "font-size:12.5px;padding:3px 0;", "· {t}" }
            }
            div { style: "display:flex;gap:8px;margin-top:10px;",
                button {
                    class: "btn btn-sm btn-primary",
                    onclick: move |_| b_ok.cmd(Command::ConfirmWeekDraft {
                        project_id: pid,
                        week: week.clone(),
                        titles: titles.clone(),
                    }),
                    "确认,按这些建活"
                }
                button {
                    class: "btn btn-sm",
                    onclick: move |_| b_no.send(Req::DropDrafts),
                    "先不建"
                }
            }
        }
    }
}

/// 弹窗默认号:认得出就自增一位,认不出就用在研号原样,人再改。
fn default_release_version(cur: &str) -> String {
    let next = next_version(cur);
    if next.is_empty() {
        cur.trim().to_string()
    } else {
        next
    }
}

/// `v0.3` → `v0.4`。**认不出格式就返回空**,不猜。
fn next_version(cur: &str) -> String {
    let t = cur.trim().trim_start_matches('v');
    let Some((head, tail)) = t.rsplit_once('.') else {
        return String::new();
    };
    match tail.parse::<u32>() {
        Ok(n) if !head.is_empty() => format!("v{head}.{}", n + 1),
        _ => String::new(),
    }
}

fn mapping_hint(p: &ProjectVm, category: StageKind) -> String {
    let key = category_key(category);
    match p.config.mappings.iter().find(|m| m.category_key == key) {
        Some(m) if !m.tool.is_empty() || !m.workflow.is_empty() => {
            let tool = if m.tool.is_empty() {
                "—"
            } else {
                m.tool.as_str()
            };
            let wf = if m.workflow.is_empty() {
                "—"
            } else {
                m.workflow.as_str()
            };
            format!("开工工具 {tool} · workflow {wf}（来自配置屏映射，创建后再改要去改仓里的 issue-policy）")
        }
        _ => "这个项目还没有类别映射。创建后工具是空的，去配置屏铺 issue-policy 或补一行映射。"
            .into(),
    }
}

fn release_dialog(
    draft: ReleaseDraft,
    mut release: Signal<Option<ReleaseDraft>>,
    bridge: &Bridge,
) -> Element {
    let b = bridge.clone();
    let version_ok = {
        let t = draft.version.trim();
        !t.is_empty() && !t.contains('(')
    };
    rsx! {
        div { class: "modal-backdrop",
            div { class: "modal", style: "max-width:440px;",
                h3 { "发版本" }
                div { class: "formrow",
                    label { class: "label", "版本号" }
                    input {
                        class: "input",
                        value: "{draft.version}",
                        placeholder: "例如 v0.2",
                        oninput: move |e| {
                            if let Some(d) = release.write().as_mut() {
                                d.version = e.value();
                            }
                        },
                    }
                }
                div { class: "formrow",
                    label { class: "label", "说明" }
                    textarea {
                        class: "textarea",
                        value: "{draft.note}",
                        oninput: move |e| {
                            if let Some(d) = release.write().as_mut() {
                                d.note = e.value();
                            }
                        },
                    }
                }
                div { class: "cfg-readonly-note",
                    "默认是在研号的下一位,可以改。确认后立刻在代码平台建 Release,再给本周已完成的活打发版标签。"
                }
                div { class: "modal-actions",
                    button { class: "btn", onclick: move |_| release.set(None), "取消" }
                    button {
                        class: "btn btn-primary",
                        disabled: !version_ok || draft.included.is_empty(),
                        onclick: move |_| {
                            let Some(d) = release.peek().clone() else { return };
                            let version = d.version.trim().to_string();
                            if version.is_empty() || version.contains('(') { return; }
                            b.cmd(Command::CutRelease {
                                project_id: d.project_id,
                                version,
                                note: d.note,
                                included: d.included,
                            });
                            release.set(None);
                        },
                        "确认 · 发版"
                    }
                }
            }
        }
    }
}

fn new_issue_dialog(
    p: &ProjectVm,
    draft: NewIssueDraft,
    mut new_issue: Signal<Option<NewIssueDraft>>,
    bridge: &Bridge,
) -> Element {
    let b = bridge.clone();
    let pid = p.id;
    let week = p.viewing_week.clone();
    let week_ops = week.clone();
    let week_create = week.clone();
    let is_ops = draft.kind == IssueKind::Ops;
    let hint = if is_ops {
        match draft.ops {
            OpsPick::WeekPlan => {
                "标题按本周幂等：本周已有「更新指标 + 制定本周计划」就拿回那张，不建第二张。剧本 week-planning。"
                    .into()
            }
            OpsPick::Audit => {
                "标题按本周幂等：本周已有「资产盘点」就拿回那张。剧本 asset-audit。类别锁成运作。"
                    .into()
            }
        }
    } else {
        mapping_hint(p, draft.category)
    };
    let title_ok = !draft.title.trim().is_empty();
    rsx! {
        div { class: "modal-backdrop",
            div { class: "modal", style: "max-width:480px;",
                h3 { "新建活" }
                div { class: "formrow",
                    label { class: "label", "种类" }
                    select {
                        class: "select",
                        onchange: move |e| {
                            let ops = e.value() == "ops";
                            if let Some(d) = new_issue.write().as_mut() {
                                d.kind = if ops { IssueKind::Ops } else { IssueKind::Business };
                                if ops && d.title.trim().is_empty() {
                                    d.title = match d.ops {
                                        OpsPick::WeekPlan => bw::app::ops1_title(&week_ops),
                                        OpsPick::Audit => bw::app::ops2_title(&week_ops),
                                    };
                                }
                            }
                        },
                        option { value: "business", selected: !is_ops, "业务活" }
                        option { value: "ops", selected: is_ops, "运作活" }
                    }
                }
                if is_ops {
                    div { class: "formrow",
                        label { class: "label", "哪一张" }
                        select {
                            class: "select",
                            onchange: move |e| {
                                let pick = if e.value() == "audit" {
                                    OpsPick::Audit
                                } else {
                                    OpsPick::WeekPlan
                                };
                                if let Some(d) = new_issue.write().as_mut() {
                                    d.ops = pick;
                                    d.title = match pick {
                                        OpsPick::WeekPlan => bw::app::ops1_title(&week),
                                        OpsPick::Audit => bw::app::ops2_title(&week),
                                    };
                                }
                            },
                            option { value: "week", selected: draft.ops == OpsPick::WeekPlan, "① 更新指标与周计划" }
                            option { value: "audit", selected: draft.ops == OpsPick::Audit, "② 资产盘点" }
                        }
                    }
                }
                div { class: "formrow",
                    label { class: "label", "标题" }
                    input {
                        class: "input",
                        value: "{draft.title}",
                        placeholder: "这张活要干什么",
                        oninput: move |e| {
                            if let Some(d) = new_issue.write().as_mut() {
                                d.title = e.value();
                            }
                        },
                    }
                }
                div { class: "formrow",
                    label { class: "label", "正文" }
                    textarea {
                        class: "textarea",
                        value: "{draft.body}",
                        placeholder: "这张活要做成什么、边界是什么。可空。",
                        oninput: move |e| {
                            if let Some(d) = new_issue.write().as_mut() {
                                d.body = e.value();
                            }
                        },
                    }
                }
                if !is_ops {
                    div { class: "formrow",
                        label { class: "label", "类别" }
                        select {
                            class: "select",
                            onchange: move |e| {
                                if let Some(c) = category_from_key(&e.value()) {
                                    if let Some(d) = new_issue.write().as_mut() {
                                        d.category = c;
                                    }
                                }
                            },
                            for c in StageKind::ALL {
                                option {
                                    key: "{category_key(c)}",
                                    value: "{category_key(c)}",
                                    selected: c == draft.category,
                                    "{c.label()}"
                                }
                            }
                        }
                    }
                }
                div { class: "cfg-readonly-note", "{hint}" }
                div { class: "modal-actions",
                    button { class: "btn", onclick: move |_| new_issue.set(None), "取消" }
                    button {
                        class: "btn btn-primary",
                        disabled: !title_ok,
                        onclick: move |_| {
                            let Some(d) = new_issue.peek().clone() else { return };
                            if d.title.trim().is_empty() { return; }
                            let ops = d.kind == IssueKind::Ops;
                            b.cmd(Command::CreateIssue {
                                project_id: pid,
                                title: d.title.trim().to_string(),
                                body: d.body.trim().to_string(),
                                category: if ops { None } else { Some(d.category) },
                                kind: d.kind,
                                origin: IssueOrigin::Human,
                                week_of: week_create.clone(),
                            });
                            new_issue.set(None);
                        },
                        "创建"
                    }
                }
            }
        }
    }
}

fn confirm_dialog(
    pm: PendingMove,
    mut pending: Signal<Option<PendingMove>>,
    mut merging: Signal<bool>,
    mut merge_log: Signal<Vec<ProgressLine>>,
    mut cancel_reason: Signal<String>,
    bridge: &Bridge,
    nav: PanelNav,
) -> Element {
    let b = bridge.clone();
    let pm2 = pm.clone();
    let busy = *merging.read();
    let failed = merge_log.read().iter().any(|r| r.state == StepState::Fail);
    let reason = cancel_reason.read().clone();
    let can_cancel = !reason.trim().is_empty();
    // 走到这里的一定是**状态动作或开工** —— 排期在松手那一刻就直接发命令了,
    // 不经过这个框(见本文件顶部的说明)。
    //
    // 拖进「进行中」= 开工:和详情抽屉「▶ 开工」同一条命令,确认后跳会话屏。
    // 拖进「已完成」= 合入并完成:和详情「✓ 点完成」同一条命令。
    let confirm = move |_| {
        if pm2.to == IssueStatus::Done {
            merge_log.write().clear();
            merging.set(true);
            b.cmd(Command::MergeAndSettle { id: pm2.id });
        } else if pm2.to == IssueStatus::InProgress {
            b.cmd(Command::RunIssue { id: pm2.id });
            pending.set(None);
            nav.go(Panel::Session);
        } else if pm2.to == IssueStatus::Cancelled {
            let why = cancel_reason.read().trim().to_string();
            if why.is_empty() {
                return;
            }
            b.cmd(Command::CancelIssue {
                id: pm2.id,
                reason: why,
            });
            cancel_reason.set(String::new());
            pending.set(None);
        } else {
            b.cmd(Command::TransitionIssue {
                id: pm2.id,
                to: pm2.to,
            });
            pending.set(None);
        }
    };
    rsx! {
        div { class: "modal-backdrop",
            div { class: "modal", style: "max-width:420px;",
                h3 { if pm.to == IssueStatus::InProgress { "开工确认" } else if pm.to == IssueStatus::Cancelled { "作废" } else { "确认一下" } }
                div { style: "font-size:13px;line-height:1.85;color:var(--ink-2);margin-bottom:8px;",
                    if pm.to == IssueStatus::InProgress {
                        "把「{pm.title}」开工。按这张活的开工工具起会话,然后跳到会话屏。"
                    } else if pm.to == IssueStatus::Cancelled {
                        "作废「{pm.title}」。这不是完成——打已取消标签并关掉远端 issue,原因写进评论。卡到「已取消」。"
                    } else {
                        "把「{pm.title}」从「{pm.from.label()}」移到「{pm.to.label()}」。"
                    }
                    if pm.to == IssueStatus::Done && pm.pr_number > 0 {
                        br {}
                        "这一下就是「人点完成」:先把 MR #{pm.pr_number} 合进主干,再把这张活\
                         结清 —— 只结这一次。合不成就整条不算数,活留在原地,可以重试。"
                    }
                    if pm.to == IssueStatus::Done && pm.pr_number == 0 {
                        br {}
                        "这一下就是「人点完成」——活会在这一刻结清,只结这一次。这张活没有 MR。"
                    }
                    if pm.to == IssueStatus::InReview {
                        br {}
                        "拖过来"
                        strong { "只改状态" }
                        ",不会提交、不会推分支、不会开 MR。要让别人有东西可评审,\
                         去会话屏点「提交并开 MR」。"
                    }
                }
                {progress_log(&merge_log.read())}
                if pm.to == IssueStatus::Cancelled {
                    textarea {
                        class: "textarea",
                        placeholder: "为什么作废,会写进这张 issue 的评论",
                        value: "{reason}",
                        oninput: move |e| cancel_reason.set(e.value()),
                    }
                }
                div { class: "modal-actions",
                    if busy && !failed {
                        button { class: "btn", disabled: true, "合入中…" }
                    } else if failed {
                        button { class: "btn btn-primary", onclick: move |_| {
                            merging.set(false);
                            pending.set(None);
                        }, "知道了" }
                    } else {
                        button { class: "btn", onclick: move |_| {
                            cancel_reason.set(String::new());
                            pending.set(None);
                        }, "算了" }
                        button {
                            class: "btn btn-primary",
                            disabled: pm.to == IssueStatus::Cancelled && !can_cancel,
                            onclick: confirm,
                            if pm.to == IssueStatus::InProgress { "开工" } else if pm.to == IssueStatus::Cancelled { "作废" } else { "确认" }
                        }
                    }
                }
            }
        }
    }
}
