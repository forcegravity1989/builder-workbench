//! 计划屏、指标、会话、配置、知识库这几块的 ViewModel 拼装。
//!
//! 从 `vm_build.rs` 拆出来的下半截 —— 拆的理由只有一个:单文件超过 600 行的
//! 软目标了(`scripts/guard-file-lines.sh` 会提醒)。上半截管「一个项目整体
//! 长什么样」,这半截管「各块面板长什么样」。

use crate::vm::*;
use bw::model::{IssueStatus, Project, ProjectId};
use bw::repo::project_file;
use std::path::Path;

use super::vm_build::{card_item, remote_label, tool_label};

/// 四列看板(合并后)。列内分段;段按原始状态算。
///
/// `week` 传 `None` = 左栏「全部」:未排周的未动手活进待办列·未排期段,其余按状态。
/// `week` 传某一周 = 只显示打了那一周 `bw:week` 的活;待办列只「待开始」段(已排期本周),
/// 不显示未排期。版本(`bw:plan:*`)排期的活在「全部」里也算已排期。
pub(super) fn build_board(issues: &[bw::Issue], week: Option<&str>, plan: Option<&str>) -> BoardVm {
    let in_week = |i: &bw::Issue| match week {
        None => true,
        Some(w) => i.week_of == w,
    };
    let in_plan = |i: &bw::Issue| match plan {
        None => true,
        Some(p) => i.plan_version == p,
    };
    // 已排期 = 排进了某一周或某个版本(任一非空)。未排期 = 都空。
    let scheduled = |i: &bw::Issue| !i.week_of.is_empty() || !i.plan_version.is_empty();

    // 待办列:未排期(Backlog 或 Todo 但 week_of/plan_version 都空,仅全部)
    // + 已排期(Todo 且排进了周/版本)。周视图只已排期段,名「待开始」。
    // 新建 issue 默认打 bw:status:todo 但 week_of 空 —— 它是 Todo 但未排期,
    // 归未排期段,不能靠 status==Backlog 漏掉。
    let backlog_cards: Vec<_> = issues
        .iter()
        .filter(|i| {
            week.is_none()
                && in_plan(i)
                && !scheduled(i)
                && matches!(i.status, IssueStatus::Backlog | IssueStatus::Todo)
        })
        .map(card_item)
        .collect();
    let todo_cards: Vec<_> = issues
        .iter()
        .filter(|i| scheduled(i) && in_week(i) && in_plan(i) && i.status == IssueStatus::Todo)
        .map(card_item)
        .collect();
    let todo_segs = if week.is_some() || plan.is_some() {
        vec![ColumnSegVm {
            key: "assigned".into(),
            label: String::new(),
            statuses: vec![IssueStatus::Todo],
            count: todo_cards.len() as u32,
            cards: todo_cards.clone(),
        }]
    } else {
        vec![
            ColumnSegVm {
                key: "unassigned".into(),
                label: "未排期".into(),
                statuses: vec![IssueStatus::Backlog, IssueStatus::Todo],
                count: backlog_cards.len() as u32,
                cards: backlog_cards.clone(),
            },
            ColumnSegVm {
                key: "assigned".into(),
                label: "已排期".into(),
                statuses: vec![IssueStatus::Todo],
                count: todo_cards.len() as u32,
                cards: todo_cards.clone(),
            },
        ]
    };
    let todo_cards_all = {
        let mut v = backlog_cards.clone();
        v.extend(todo_cards.clone());
        v
    };

    let doing_cards: Vec<_> = issues
        .iter()
        .filter(|i| in_week(i) && in_plan(i) && i.status == IssueStatus::InProgress)
        .map(card_item)
        .collect();
    let review_cards: Vec<_> = issues
        .iter()
        .filter(|i| in_week(i) && in_plan(i) && i.status == IssueStatus::InReview)
        .map(card_item)
        .collect();
    let blocked_cards: Vec<_> = issues
        .iter()
        .filter(|i| in_week(i) && in_plan(i) && i.status == IssueStatus::Blocked)
        .map(card_item)
        .collect();
    let done_cards: Vec<_> = issues
        .iter()
        .filter(|i| in_week(i) && in_plan(i) && i.status == IssueStatus::Done)
        .map(card_item)
        .collect();
    let cancelled_cards: Vec<_> = issues
        .iter()
        .filter(|i| in_week(i) && in_plan(i) && i.status == IssueStatus::Cancelled)
        .map(card_item)
        .collect();

    let pending_all = {
        let mut v = review_cards.clone();
        v.extend(blocked_cards.clone());
        v
    };
    let done_all = {
        let mut v = done_cards.clone();
        v.extend(cancelled_cards.clone());
        v
    };

    let columns = vec![
        ColumnVm {
            status: IssueStatus::Todo,
            title: "待办".into(),
            cards: todo_cards_all,
            segments: todo_segs,
        },
        ColumnVm {
            status: IssueStatus::InProgress,
            title: "进行中".into(),
            cards: doing_cards.clone(),
            segments: vec![ColumnSegVm {
                key: "doing".into(),
                label: String::new(),
                statuses: vec![IssueStatus::InProgress],
                count: doing_cards.len() as u32,
                cards: doing_cards.clone(),
            }],
        },
        ColumnVm {
            status: IssueStatus::InReview,
            title: "待处理".into(),
            cards: pending_all,
            segments: vec![
                ColumnSegVm {
                    key: "review".into(),
                    label: "待评审".into(),
                    statuses: vec![IssueStatus::InReview],
                    count: review_cards.len() as u32,
                    cards: review_cards.clone(),
                },
                ColumnSegVm {
                    key: "blocked".into(),
                    label: "阻塞".into(),
                    statuses: vec![IssueStatus::Blocked],
                    count: blocked_cards.len() as u32,
                    cards: blocked_cards.clone(),
                },
            ],
        },
        ColumnVm {
            status: IssueStatus::Done,
            title: "已完成".into(),
            cards: done_all,
            segments: vec![
                ColumnSegVm {
                    key: "done".into(),
                    label: "完成".into(),
                    statuses: vec![IssueStatus::Done],
                    count: done_cards.len() as u32,
                    cards: done_cards.clone(),
                },
                ColumnSegVm {
                    key: "cancelled".into(),
                    label: "拒绝".into(),
                    statuses: vec![IssueStatus::Cancelled],
                    count: cancelled_cards.len() as u32,
                    cards: cancelled_cards.clone(),
                },
            ],
        },
    ];
    BoardVm {
        columns,
        pool_label: "待办池 · 未排进任何一周".into(),
        todo_label: "待办 · 已排进本周,等开工".into(),
    }
}

/// 周列表从 issues 的 `bw:week:*` 标签取(刀6:不再扫 `.bw/plan/` 目录 ——
/// 那个文件没人写了,扫到也是旧的)。本周永远在列表里(置顶)。新的在前。
pub(super) fn build_weeks(
    issues: &[bw::Issue],
    current_week: &str,
    goals: &std::collections::HashMap<String, String>,
) -> Vec<WeekVm> {
    let mut weeks: Vec<WeekVm> = Vec::new();
    let push = |weeks: &mut Vec<WeekVm>, w: &str| {
        if !w.is_empty() && !weeks.iter().any(|x| x.week == w) {
            weeks.push(WeekVm {
                week: w.to_string(),
                goal: goals.get(w).cloned(),
                activity_count: 0,
            });
        }
    };
    for i in issues {
        push(&mut weeks, &i.week_of);
    }
    push(&mut weeks, current_week);
    for w in &mut weeks {
        w.activity_count = issues.iter().filter(|i| i.week_of == w.week).count() as u32;
    }
    // 新的在前;没有未来周,本周自然置顶。
    weeks.sort_by(|a, b| b.week.cmp(&a.week));
    weeks
}

/// 手填还没跑过采集时,折线直接从流水按周收。一周取日期最大的一天。
fn trend_from_readings(ws: &Path, name: &str) -> Vec<(String, Option<f64>)> {
    let mut weeks = Vec::new();
    let mut w = bw::isoweek::current_week();
    for _ in 0..4 {
        weeks.push(w.clone());
        let Some(prev) = bw::isoweek::previous_week(&w) else {
            break;
        };
        w = prev;
    }
    weeks.reverse();
    let values = bw::repo::readings_file::latest_values_for(ws, name, &weeks);
    weeks
        .into_iter()
        .zip(values)
        .map(|(week, v)| (week, v.and_then(|s| s.parse::<f64>().ok())))
        .collect()
}

/// 指标卡:定义来自 `.bw/metrics.toml`,读数来自仓 `.bw/metrics/readings.jsonl`
/// (刀6:不再读周计划文件的「本周指标读数」段)。**没有读数就显示「无数据」,
/// 不显示 0**。
pub(super) fn build_metrics(
    ws: &Path,
    issues: &[bw::Issue],
    collected: &[bw::app::collect::MetricReadout],
    readings: &[bw::app::MetricReading],
    collected_once: bool,
) -> MetricsVm {
    // **「还没有」和「读不动」是两件事,不能混成一句「没有指标」。**
    // 混了会让人以为文件不存在、去写一份新的,而实际上仓里躺着一份格式不对
    // 的正本(比如 V3 的旧格式),写新的只会又叠一层。
    let m = match bw::repo::metrics_file::read(ws) {
        Ok(Some(m)) => m,
        Ok(None) => {
            return MetricsVm {
                collected: collected_once,
                note: Some("这个项目还没有 .bw/metrics.toml,指标是空的(不是 0)".into()),
                ..Default::default()
            }
        }
        Err(e) => {
            return MetricsVm {
                collected: collected_once,
                error: Some(e.to_string()),
                ..Default::default()
            }
        }
    };
    // 精确按名字对,不用 contains:指标名互为前缀时会认错,空名字会命中第一条。
    let reading_of = |name: &str| -> Option<&bw::app::MetricReading> {
        if name.trim().is_empty() {
            return None;
        }
        readings.iter().find(|r| r.name.trim() == name.trim())
    };
    let driving_of = |key: &str| -> Vec<String> {
        issues
            .iter()
            .filter(|i| i.metric_key == key)
            .map(|i| i.title.clone())
            .collect()
    };
    // `.bw/metrics.toml` 里的指标没有单独的 id 字段 —— 名字就是它的键。
    // `issue.metric_key` 存的因此是指标的名字。
    // `target` / `def` / 采集方式来自指标定义文件;读数来自
    // `.bw/metrics/readings.jsonl`。两边各是各的正本,这里只是拼到同一张卡上。
    // 采到的现值与走势来自「采一次指标」那一下(`ui.metrics`),不在这里跑
    // ——起脚本要几百毫秒到几秒,每重拼一次 ViewModel 都跑一遍会把界面按住。
    let readout_of = |name: &str| collected.iter().find(|r| r.name.trim() == name.trim());
    let mk = |name: &str, def: &str, target: &str, plan: &bw::repo::metrics_file::CollectPlan| {
        MetricCardVm {
            id: name.to_string(),
            name: name.to_string(),
            reading: reading_of(name).map(|r| r.value.clone()),
            target: target.to_string(),
            def: def.to_string(),
            manual: plan.is_manual(),
            source: reading_of(name)
                .map(|r| r.source.clone())
                .unwrap_or_default(),
            collected_at: reading_of(name)
                .map(|r| r.collected_at.clone())
                .unwrap_or_default(),
            driving: driving_of(name),
            class: class_label(plan.class()).to_string(),
            collected: readout_of(name).and_then(|r| r.current.clone()),
            trend: {
                let from_run = readout_of(name).map(|r| {
                    r.points
                        .iter()
                        .map(|p| {
                            (
                                p.week.clone(),
                                p.value.as_ref().and_then(|v| v.parse::<f64>().ok()),
                            )
                        })
                        .collect::<Vec<_>>()
                });
                match from_run {
                    Some(t) if t.iter().any(|(_, v)| v.is_some()) => t,
                    _ if plan.is_manual() => trend_from_readings(ws, name),
                    Some(t) => t,
                    None => Vec::new(),
                }
            },
            collect_error: readout_of(name)
                .map(|r| r.error.clone())
                .unwrap_or_default(),
        }
    };

    MetricsVm {
        collected: collected_once,
        error: None,
        // 北极星没有 target 字段 —— 它的目标就是它自己那句定义。
        // 北极星可以缺席:刚接入、还没定指标的项目就是这样。**不摆空卡。**
        north_star: m
            .north_star
            .as_ref()
            .map(|n| mk(&n.name, &n.def, "", &n.collect)),
        lagging: m
            .lagging
            .iter()
            .map(|d| mk(&d.name, &d.def, &d.target, &d.collect))
            .collect(),
        leading: m
            .leading
            .iter()
            .map(|d| mk(&d.name, &d.def, &d.target, &d.collect))
            .collect(),
        note: None,
    }
}

pub(super) async fn build_sessions(
    app: &bw::app::App,
    id: ProjectId,
    issues: &[bw::Issue],
) -> Vec<SessionVm> {
    app.conversations(id)
        .await
        .unwrap_or_default()
        .into_iter()
        .filter_map(|c| {
            let issue = issues.iter().find(|i| i.id == c.issue_id)?;
            Some(SessionVm {
                issue_id: c.issue_id,
                conversation_id: c.id,
                issue_number: issue.number,
                issue_title: issue.title.clone(),
                issue_status: issue.status.label().to_string(),
                branch: c.branch_name,
                workspace_path: c.workspace_path,
                session_id: c.claude_session_id,
                // PTY 已封存,没真进程信号 —— live 如实是 false,不假绿。
                live: false,
            })
        })
        .collect()
}

/// 会话屏两个组件要的那点状态:页签 + 开工工具 + OD iframe 的 src/gen +
/// Orca 网页地址。两个页签常驻,不依赖「先选中一场会话」——左列表已经删了,
/// 没选中也要能切 Orca / Open Design,否则点页签会被 `Default` 打回 Orca。
pub(super) fn build_workbench(
    sessions: &[SessionVm],
    issues: &[bw::Issue],
    open: Option<bw::model::IssueId>,
    tab: SessionTab,
    od_src: &str,
    od_gen: u64,
    orca_web_url: &str,
) -> WorkbenchVm {
    let s = open.and_then(|id| sessions.iter().find(|s| s.issue_id == id));
    let issue = s.and_then(|s| issues.iter().find(|i| i.id == s.issue_id));
    let tool = issue.map(|i| i.tool.clone()).unwrap_or_default();
    WorkbenchVm {
        tab,
        tool,
        od_src: od_src.to_string(),
        od_gen,
        orca_web_url: orca_web_url.to_string(),
    }
}

/// 配置屏。`tools`(环境条)从外部传:它在 `gather` 里探一次,不再每次重切
/// 都重探(OD 管道 400ms + PATH 扫)——原来这条是 `probe_env` 第二遍的来源。
pub(super) fn build_config(
    ws: &Path,
    settings: Option<&bw::local::Settings>,
    project: &Project,
    // 名片文件由上层读一次(而且是走 `read_or_warn`,文件坏了会说话)。这里
    // **不再自己读一遍** —— 自己读的那条路 `.ok()` 会把解析错误吞掉,表现成
    // 「项目群未配」,而真相是文件里有一行写错了。
    file: &project_file::ProjectFile,
    issues: &[bw::Issue],
    env: &[ToolProbeVm],
) -> ConfigVm {
    let usage = bw::app::workflow_usage(issues);
    let mappings = bw::model::StageKind::ALL
        .iter()
        .map(|cat| {
            let key = bw::model::category_key(*cat);
            let tool = settings
                .and_then(|s| s.tools.get(key))
                .cloned()
                .filter(|t| !t.trim().is_empty())
                .unwrap_or_else(|| bw::defaults::default_tool(*cat).to_string());
            let workflow = bw::defaults::default_workflow(*cat).to_string();
            MappingVm {
                category_key: key.to_string(),
                category_label: cat.label().to_string(),
                tool: tool_label(&tool).into(),
                workflow: if workflow.is_empty() {
                    "—(产品默认无)".into()
                } else {
                    workflow
                },
            }
        })
        .collect();

    let skills = skill_list(ws, &usage);
    let ops2 = bw::defaults::DEFAULT_OPS2_SCHEDULE;

    ConfigVm {
        mappings,
        skills,
        focus_skill: String::new(),
        tools: env.to_vec(),
        remote: remote_label(project),
        cadence: format!("产品默认 · 运作活② {ops2}"),
        crons: build_crons(),
        chat_provider: chat_provider(file.chat.as_ref()),
        chat_group: chat_group(file.chat.as_ref()),
        chat_events: chat_events(file.chat.as_ref()),
        chat: chat_label(ws),
    }
}

/// SKILL.md 头里的 `description:`。**读不到就空着**,不替它写一句。
/// 这个项目能用到的技能清单。配置屏和知识库资产页签用的是同一份 —— 原来两处
/// 各扫一遍目录、各拼一遍 `SkillVm`,改一处忘一处。
///
/// 三个来源,`origin` 如实标出来自哪:
///
/// - **Workbench 自带**:编在二进制里的四份(全是运作剧本)。
///   它们摊在 Workbench 自己的资产目录,**不复制进用户的仓** —— 用户的
///   `.gitignore` 怎么写不该由 Workbench 决定(见 `bw::standard::skills`)。
/// - **项目自有**:这个仓自己的 `.claude/skills/`,扫目录得到。
/// - **不在册**:活上挂了这个名字,两处都找不到包。用量是真的,包确实没有。
pub(super) fn skill_list(ws: &Path, usage: &[(String, u32)]) -> Vec<SkillVm> {
    let used = |slug: &str| -> u32 {
        usage
            .iter()
            .filter(|(w, _)| w == slug || bw::app::skill_slug(w) == Some(slug))
            .map(|(_, n)| *n)
            .sum()
    };

    let mut skills: Vec<SkillVm> = bw::standard::skills::all()
        .into_iter()
        .map(|p| SkillVm {
            uses: used(p.slug),
            title: bw::app::workflow_label(p.slug)
                .unwrap_or(p.slug)
                .to_string(),
            origin: "Workbench 自带".into(),
            desc: p.desc.to_string(),
            slug: p.slug.to_string(),
        })
        .collect();

    // 项目自己的技能包。同名的以项目那份为准 —— 仓里那份才是这个仓真正会用的。
    if let Ok(dir) = std::fs::read_dir(ws.join(".claude/skills")) {
        for e in dir
            .flatten()
            .filter(|e| e.path().join("SKILL.md").is_file())
        {
            let slug = e.file_name().to_string_lossy().to_string();
            skills.retain(|s| s.slug != slug);
            skills.push(SkillVm {
                uses: used(&slug),
                title: slug.clone(),
                origin: "项目自有".into(),
                desc: skill_desc(&e.path().join("SKILL.md")),
                slug,
            });
        }
    }

    // 活上挂了名字、两处都没有包的,如实列出来,不假装它存在。
    for (w, n) in usage {
        if bw::app::skill_slug(w).is_some() {
            continue;
        }
        if !skills.iter().any(|s| &s.slug == w) {
            skills.push(SkillVm {
                slug: w.clone(),
                title: format!("{w}(找不到这个包)"),
                uses: *n,
                origin: "不在册".into(),
                desc: String::new(),
            });
        }
    }

    skills.sort_by(|a, b| b.uses.cmp(&a.uses).then(a.slug.cmp(&b.slug)));
    skills
}

pub(super) fn skill_desc(path: &Path) -> String {
    let Ok(raw) = std::fs::read_to_string(path) else {
        return String::new();
    };
    raw.lines()
        .take(20)
        .find_map(|l| l.strip_prefix("description:"))
        .map(|v| v.trim().trim_matches('"').to_string())
        .unwrap_or_default()
}

/// 定时那张表。**没有定时表** —— 判据写在这里,让人知道它到底看什么。
fn build_crons() -> Vec<CronVm> {
    vec![
        CronVm {
            name: "B 类指标采集".into(),
            trigger: "到点自动采".into(),
            schedule: "daily 20:00".into(),
            rule: "今天还没采过".into(),
        },
        CronVm {
            name: "更新指标与制定版本计划".into(),
            trigger: "人触发".into(),
            schedule: "—".into(),
            rule: "本周还没有运作活①「更新指标 + 制定版本计划」".into(),
        },
        CronVm {
            name: "资产盘点".into(),
            trigger: "到点自动建".into(),
            schedule: bw::defaults::DEFAULT_OPS2_SCHEDULE.into(),
            rule: "本周还没有这张活(不查任何定时表)".into(),
        },
    ]
}

fn chat_provider(chat: Option<&project_file::ChatConfig>) -> String {
    chat.map(|c| c.provider.clone())
        .unwrap_or_else(|| "未配".into())
}

fn chat_group(chat: Option<&project_file::ChatConfig>) -> String {
    chat.map(|c| c.group_id.clone())
        .filter(|g| !g.is_empty())
        .unwrap_or_else(|| "—".into())
}

/// 同步哪些事件。`notify` 没写 = 用默认五件;写成空列表 = 明确要求安静。
/// 顺序按 [`bw::chat::NotifyEvent::ALL`],稳定不跳。
fn chat_events(chat: Option<&project_file::ChatConfig>) -> Vec<(String, bool)> {
    use bw::chat::NotifyEvent;
    let on: Vec<String> = match chat {
        None => return Vec::new(),
        Some(c) => c.notify.clone().unwrap_or_else(|| {
            NotifyEvent::ALL
                .iter()
                .map(|e| e.key().to_string())
                .collect()
        }),
    };
    NotifyEvent::ALL
        .iter()
        .map(|e| (e.label().to_string(), on.iter().any(|x| x == e.key())))
        .collect()
}

/// 项目群一行话。没配就明说没配 —— 没配群不是错,是诚实状态。
fn chat_label(ws: &Path) -> String {
    let Some(cfg) = project_file::read(ws)
        .ok()
        .flatten()
        .and_then(|f| f.chat)
        .filter(|c| !c.provider.trim().is_empty() && c.provider.trim() != "none")
    else {
        return "—(没配项目群。配了就在 .bw/project.toml 里加一段 [chat])".into();
    };
    // 整行没写 = 默认那五样;写了空数组 = 静音,如实说「一件都不发」。
    let notify = match &cfg.notify {
        None => bw::chat::NotifyEvent::ALL
            .iter()
            .map(|e| e.label())
            .collect::<Vec<_>>()
            .join(" / "),
        Some(list) if list.is_empty() => "一件都不发(静音)".to_string(),
        Some(list) => list
            .iter()
            .map(|e| bw::chat::event_label(e))
            .collect::<Vec<_>>()
            .join(" / "),
    };
    format!(
        "{} · 群 {} · 同步 {notify}",
        cfg.provider,
        blank_dash(&cfg.group_id)
    )
}

fn blank_dash(s: &str) -> &str {
    if s.trim().is_empty() {
        "—"
    } else {
        s
    }
}

/// A/B/C 三类的人话标签。**这三个词是给人看的正本** —— 代码里那个枚举叫什么
/// 不重要,界面上永远说「可回溯 / 不可回溯 / 手填」。
fn class_label(c: bw::repo::metrics_file::MetricClass) -> &'static str {
    use bw::repo::metrics_file::MetricClass as C;
    match c {
        C::Retro => "可回溯",
        C::PointInTime => "不可回溯",
        C::Manual => "手填",
    }
}
