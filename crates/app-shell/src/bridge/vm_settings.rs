//! 设置屏「能力」一节的五张表:Connector / Skills / Category / Plugins /
//! AI Assets。全部全局(不挂哪个项目),见
//! `docs/05-features/capability-panel/spec.md`。
//!
//! 「谁用到」「哪个工作类别读哪份 reference」这类判据都是纯展示口径,拼在这一层,
//! 不下沉进 `bw` —— `bw::app::ref_wanted_for` 是唯一例外:它是真正决定注入
//! 什么的判据,这里复用它而不是另抄一份,免得两处各改一次、迟早改漏。

use crate::vm::*;
use bw::app::App;
use bw::model::StageKind;
use std::path::Path;

use super::vm_build::tool_label;
use super::vm_panels::skill_list;

pub(super) struct Capabilities {
    pub connectors: Vec<ConnectorVm>,
    pub skills: Vec<SkillVm>,
    pub stage: Vec<StageRowVm>,
    pub plugins: Vec<PluginVm>,
    pub assets: Vec<AssetRowVm>,
    pub assets_open_project: String,
}

/// `open` 提供当前项目的路径、Issue 和名称；无项目时不统计引用关系。
/// Skills 引用计数、Category 的项目 workflow 选项和 AI Assets 引用列表依赖它。
#[allow(clippy::too_many_arguments)]
pub(super) fn build(
    app: &App,
    settings: Option<&bw::local::Settings>,
    env: &[ToolProbeVm],
    projects: &[ProjectCardVm],
    orca_web_url: &str,
    clawd: &ClawdProbeVm,
    open: Option<(&Path, &[bw::Issue], &str)>,
) -> Capabilities {
    let tool_of = |cat: StageKind| -> String {
        let key = bw::model::category_key(cat);
        settings
            .and_then(|s| s.tools.get(key))
            .cloned()
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| bw::defaults::default_tool(cat).to_string())
    };

    Capabilities {
        connectors: build_connectors(env, &tool_of, projects, orca_web_url, clawd),
        skills: build_skills(open, projects),
        stage: build_stage(env, &tool_of, open),
        plugins: build_plugins(app),
        assets: build_assets(app, open),
        assets_open_project: open
            .map(|(_, _, name)| name.to_string())
            .unwrap_or_default(),
    }
}

// ── Connector ──────────────────────────────────────────────────────────

fn build_connectors(
    env: &[ToolProbeVm],
    tool_of: &dyn Fn(StageKind) -> String,
    projects: &[ProjectCardVm],
    orca_web_url: &str,
    clawd: &ClawdProbeVm,
) -> Vec<ConnectorVm> {
    // 类别 → 有效工具,反过来聚合成「工具 → 哪几类活用它」。
    let mut executor_users: std::collections::HashMap<String, Vec<String>> = Default::default();
    for cat in StageKind::ALL {
        executor_users
            .entry(tool_of(cat))
            .or_default()
            .push(cat.label().to_string());
    }
    let remote_users = |provider: &str| -> Vec<String> {
        projects
            .iter()
            .filter(|p| p.remote_provider == provider)
            .map(|p| p.name.clone())
            .collect()
    };
    let chat_users = |provider: &str| -> Vec<String> {
        projects
            .iter()
            .filter(|p| p.chat_provider == provider)
            .map(|p| p.name.clone())
            .collect()
    };
    let find = |name: &str| env.iter().find(|t| t.name == name);

    let mut out = Vec::with_capacity(7);
    for (key, kind, users) in [
        (
            "claude_cli",
            ConnectorKind::Executor,
            executor_users.remove("claude_cli").unwrap_or_default(),
        ),
        (
            "cursor",
            ConnectorKind::Executor,
            executor_users.remove("cursor").unwrap_or_default(),
        ),
        (
            "open_design",
            ConnectorKind::Executor,
            executor_users.remove("open_design").unwrap_or_default(),
        ),
        ("gh", ConnectorKind::Remote, remote_users("github")),
        ("codehub", ConnectorKind::Remote, remote_users("codehub")),
        ("welink_cli", ConnectorKind::Chat, chat_users("welink")),
    ] {
        let Some(t) = find(key) else { continue };
        let has_users = !users.is_empty();
        let status = match t.ok {
            Some(true) => ConnectorStatus::Found,
            Some(false) if has_users => ConnectorStatus::Blocked,
            Some(false) => ConnectorStatus::Idle,
            None => ConnectorStatus::NotProbed,
        };
        out.push(ConnectorVm {
            key: key.to_string(),
            name: t.label.clone(),
            kind,
            status,
            detail: t.detail.clone(),
            used_by: users,
        });
    }

    // Orca:没有探活实现,只有「配了 / 没配」;不经网页地址也能开工,所以
    // 「用到它」是它作为会话宿主的本职,不看别的映射。
    let configured = !orca_web_url.trim().is_empty();
    out.push(ConnectorVm {
        key: "orca".into(),
        name: "Orca".into(),
        kind: ConnectorKind::Host,
        status: if configured {
            ConnectorStatus::ConfiguredNoProbe
        } else {
            ConnectorStatus::Unconfigured
        },
        detail: if configured {
            "已配置网页配对地址；Orca 尚不支持连接检测。".into()
        } else {
            "还没填网页配对地址(设置 · Connector · Orca)".into()
        },
        used_by: vec!["执行会话与定时任务".into()],
    });

    // Clawd on Desk:三样分开报(装 / 跑 / 注册),状态只取「现在推得出去吗」这一层。
    let (status, detail) = clawd_row(clawd);
    out.push(ConnectorVm {
        key: "clawd".into(),
        name: "Clawd on Desk".into(),
        kind: ConnectorKind::Companion,
        status,
        detail,
        used_by: vec!["活开跑 / 到待评审 / 阻塞时推一条状态".into()],
    });

    out
}

/// 装没装 / 跑没跑 / 注册没注册 → 一行状态 + 一句人话。没装不是红:没人非用它不可。
fn clawd_row(c: &ClawdProbeVm) -> (ConnectorStatus, String) {
    let installed = match &c.installed {
        Some(s) => format!("装在 {s}"),
        None => "没认出装在哪".to_string(),
    };
    match (&c.running, c.registered) {
        (Ok(port), Some(true)) => (
            ConnectorStatus::Found,
            format!("在跑(端口 {port})· 已注册 Workbench · {installed}"),
        ),
        (Ok(port), Some(false)) => (
            ConnectorStatus::Unconfigured,
            format!("在跑(端口 {port}),但它的「设置 → Agents」里还没注册 Workbench · {installed}"),
        ),
        (Ok(port), None) => (
            ConnectorStatus::Unconfigured,
            format!("在跑(端口 {port});读不到它的设置文件,注册状态不知道 · {installed}"),
        ),
        (Err(why), _) => (ConnectorStatus::Idle, format!("没在跑({why})· {installed}")),
    }
}

// ── Skills ─────────────────────────────────────────────────────────────

/// 全局的一张表:Workbench 自带 + 所有接入项目各自的 `.claude/skills/`。
/// 用量只对**当前打开的那个项目**现算(`skill_list` 要跑一遍那个项目的
/// issue 列表);没打开项目、或技能属于另一个没打开的项目时,`uses` 是
/// `0` —— 不是「真的没用过」,是「这一轮没有它的活列表可扫」,同一份
/// 妥协在 `ConfigVm` 时代就存在,不是本特性引入的新缺口。
fn build_skills(
    open: Option<(&Path, &[bw::Issue], &str)>,
    projects: &[ProjectCardVm],
) -> Vec<SkillVm> {
    let open_ws = open.map(|(ws, _, _)| ws);
    let open_name = open.map(|(_, _, name)| name).unwrap_or_default();
    let usage = open
        .map(|(_, issues, _)| bw::app::workflow_usage(issues))
        .unwrap_or_default();
    let mut out = skill_list(open_ws, open_name, &usage);
    for p in projects {
        if p.workspace_path.is_empty() {
            continue; // 还没接实体仓路径的名片(比如注册表里的占位行),不编一个假扫描
        }
        if open_ws == Some(Path::new(&p.workspace_path)) {
            continue; // 已经在 skill_list(open_ws, ...) 里了
        }
        for local in scan_project_skills(Path::new(&p.workspace_path), &p.name) {
            if out.iter().any(|s| s.slug == local.slug) {
                continue;
            }
            out.push(local);
        }
    }
    out.sort_by(|a, b| b.uses.cmp(&a.uses).then(a.slug.cmp(&b.slug)));
    out
}

/// 没打开的项目:只扫目录列名字,不算用量(算用量要那个项目的 issue 列表,
/// 现取要额外一次远端查询,划不来 —— 和 `card_stub` 不重刷别的卡同一个道理)。
/// 调用方保证 `ws` 不是空路径 —— 空路径 `.join` 出来是相对路径,会扫到进程
/// 当前目录,答非所问。
fn scan_project_skills(ws: &Path, project_name: &str) -> Vec<SkillVm> {
    let Ok(dir) = std::fs::read_dir(ws.join(".claude/skills")) else {
        return Vec::new();
    };
    dir.flatten()
        .filter(|e| e.path().join("SKILL.md").is_file())
        .map(|e| {
            let slug = e.file_name().to_string_lossy().to_string();
            SkillVm {
                title: slug.clone(),
                origin: "项目自有".into(),
                desc: super::vm_panels::skill_desc(&e.path().join("SKILL.md")),
                byline: "Created by you".into(),
                project: project_name.to_string(),
                injectable: false,
                file_count: 1,
                uses: 0,
                slug,
            }
        })
        .collect()
}

// ── Category ───────────────────────────────────────────────────────────

fn build_stage(
    env: &[ToolProbeVm],
    tool_of: &dyn Fn(StageKind) -> String,
    open: Option<(&Path, &[bw::Issue], &str)>,
) -> Vec<StageRowVm> {
    let project_workflows: Vec<String> = open
        .map(|(ws, _, _)| {
            std::fs::read_dir(ws.join(".claude/skills"))
                .map(|dir| {
                    dir.flatten()
                        .filter(|e| e.path().join("SKILL.md").is_file())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect()
                })
                .unwrap_or_default()
        })
        .unwrap_or_default();

    StageKind::ALL
        .iter()
        .map(|&cat| {
            let tool = tool_of(cat);
            let executor_ok = env.iter().find(|t| t.name == tool).and_then(|t| t.ok);
            let workflow = bw::defaults::default_workflow(cat).to_string();
            let mut workflow_options = vec![StageWorkflowOption {
                value: if workflow.is_empty() {
                    String::new()
                } else {
                    workflow.clone()
                },
                label: if workflow.is_empty() {
                    "—(产品默认无)".into()
                } else {
                    workflow.clone()
                },
                wired: bw::app::skill_slug(&workflow).is_some(),
            }];
            for w in &project_workflows {
                if workflow_options.iter().any(|o| &o.value == w) {
                    continue;
                }
                workflow_options.push(StageWorkflowOption {
                    value: w.clone(),
                    label: w.clone(),
                    wired: bw::app::skill_slug(w).is_some(),
                });
            }
            let injects: Vec<String> = bw::standard::system_prompt::references()
                .into_iter()
                .filter(|pack| bw::app::ref_wanted_for(Some(cat), "", pack.slug))
                .map(|pack| pack.desc.to_string())
                .collect();
            StageRowVm {
                category_key: bw::model::category_key(cat).to_string(),
                category_label: cat.label().to_string(),
                executor_label: tool_label(&tool).to_string(),
                executor_tool: tool,
                executor_ok,
                // 存机读值(可能是空串),不是展示用的「—(产品默认无)」——
                // 这个值要跟 `workflow_options` 里的 `value` 对得上,`<select>`
                // 才能选中正确的那一项;展示用哪一份靠 `workflow_options` 现查。
                workflow,
                workflow_options,
                can_work: executor_ok == Some(true),
                injects,
            }
        })
        .collect()
}

// ── Plugins ────────────────────────────────────────────────────────────

/// 仓里 vendor 了两个业界技能库,正本是 `standard/vendor/README.md` 那张表 ——
/// 没有第三份、也没有自动发现机制(不做 Discover / 市场),所以上游 / 版本 /
/// 许可这几项如实抄那张表;技能数与分组现扫磁盘,不会因为文档没更新而报错。
fn build_plugins(app: &App) -> Vec<PluginVm> {
    let Some(vendor_root) = app.ensure_vendor_assets() else {
        return Vec::new();
    };
    const MATTPOCOCK_CATEGORIES: [&str; 6] = [
        "engineering",
        "productivity",
        "personal",
        "misc",
        "deprecated",
        "in-progress",
    ];
    let mattpocock_used_by: Vec<String> = StageKind::ALL
        .iter()
        .filter(|&&c| bw::defaults::default_workflow(c) == "mattpocock-skills")
        .map(|c| c.label().to_string())
        .collect();

    vec![
        {
            let (skill_count, groups) = scan_vendor_categories(
                &vendor_root.join("mattpocock-skills/skills"),
                &MATTPOCOCK_CATEGORIES,
            );
            PluginVm {
                slug: "mattpocock-skills".into(),
                name: "mattpocock-skills".into(),
                upstream: "https://github.com/mattpocock/skills".into(),
                version: "1.2.0".into(),
                license: "MIT · Copyright (c) 2026 Matt Pocock".into(),
                skill_count,
                used_by: mattpocock_used_by,
                groups,
            }
        },
        {
            let (skill_count, groups) =
                scan_vendor_flat(&vendor_root.join("mohit-pm-claude-skills/skills"));
            PluginVm {
                slug: "mohit-pm-claude-skills".into(),
                name: "mohit-pm-claude-skills".into(),
                upstream: "https://github.com/mohitagw15856/pm-claude-skills".into(),
                version: "main@f508142(2026-08-04)".into(),
                license: "MIT · Copyright (c) 2026 Mohit Aggarwal".into(),
                skill_count,
                used_by: Vec::new(),
                groups,
            }
        },
    ]
}

fn read_dir_names(dir: &Path) -> Vec<String> {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = rd
        .flatten()
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

fn scan_vendor_categories(base: &Path, categories: &[&str]) -> (usize, Vec<PluginSkillGroup>) {
    let mut total = 0;
    let groups = categories
        .iter()
        .map(|cat| {
            let skills = read_dir_names(&base.join(cat));
            total += skills.len();
            PluginSkillGroup {
                name: (*cat).to_string(),
                skills,
            }
        })
        .collect();
    (total, groups)
}

fn scan_vendor_flat(base: &Path) -> (usize, Vec<PluginSkillGroup>) {
    let skills = read_dir_names(base);
    let count = skills.len();
    (
        count,
        vec![PluginSkillGroup {
            name: "全部".into(),
            skills,
        }],
    )
}

// ── AI Assets ──────────────────────────────────────────────────────────

/// 只读一张表:项目自己的 `AGENTS.md`(固定一行)+ Workbench 按类别注入的
/// references(`standard::system_prompt::references()`,今天 4 份)。「现在
/// 哪几张活在用」只对当前打开的项目现算 —— 没打开就老实空着。
fn build_assets(app: &App, open: Option<(&Path, &[bw::Issue], &str)>) -> Vec<AssetRowVm> {
    let mut out = vec![AssetRowVm {
        slug: "agents-md".into(),
        name: "AGENTS.md".into(),
        desc: "这个仓自己的开发与维护规矩,提示词写一句「动手前读」".into(),
        source: "项目".into(),
        used_by_issues: open
            .map(|(_, issues, _)| issues.iter().map(|i| format!("#{}", i.number)).collect())
            .unwrap_or_default(),
    }];

    // 只有摊到磁盘上、`app.ensure_prompt_assets()` 才知道路径;这里不用它来
    // 判「派发没派发」(四份都编在二进制里,恒为已派发,那个色条已经被否),
    // 只是复用同一份口径去问「这张活会不会读到它」。
    let _ = app.ensure_prompt_assets();
    for pack in bw::standard::system_prompt::references() {
        let used_by_issues = open
            .map(|(_, issues, _)| {
                issues
                    .iter()
                    .filter(|i| bw::app::ref_wanted_for(i.category, &i.workflow, pack.slug))
                    .map(|i| format!("#{}", i.number))
                    .collect()
            })
            .unwrap_or_default();
        out.push(AssetRowVm {
            slug: pack.slug.to_string(),
            name: pack.rel.clone(),
            desc: pack.desc.to_string(),
            source: "Workbench".into(),
            used_by_issues,
        });
    }
    out
}
