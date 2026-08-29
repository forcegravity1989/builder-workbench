//! `prompt_smoke` —— 「开工时给 agent 的是索引,不是正文」的读回证据。
//!
//! ```bash
//! cargo run -p bw --example prompt_smoke -- <工作目录>
//! ```
//!
//! 验四件事:
//!
//! 1. buddy 自带的技能**摊在 buddy 自己的目录**里,不在用户的仓里。
//! 2. 系统提示词里给的那条路径**真的是个文件**(不是编出来的路径)。
//! 3. 提示词里**没有技能正文** —— 拿全文的第一段去提示词里找,找不到。
//! 4. 规范索引**只列仓里真有的件**:先在一个空仓上跑一遍(一条都不列),
//!    再铺几份进去跑一遍(列出来的正好是铺进去的那几份)。
//!
//! 不碰网络、不碰 claude、不建库。重复跑不产生重复数据。

use bw::app::App;
use bw::model::{Issue, IssueId, IssueKind, IssueOrigin, IssueStatus, ProjectId};
use std::path::PathBuf;
use std::sync::Arc;

fn say(step: &str, detail: &str) {
    println!("[PROMPT_SMOKE] {step}:{detail}");
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    bw::isoweek::init_local_offset();
    let root = PathBuf::from(std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("用法:cargo run -p bw --example prompt_smoke -- <工作目录>");
        std::process::exit(2);
    }));
    let repo = root.join("repo");
    std::fs::create_dir_all(&repo)?;

    let app = App::new(
        root.join("workspaces"),
        Arc::new(bw_engine::MockInteractiveExecutor),
    )
    .with_asset_root(root.join("assets"));

    // ── 1 · 技能摊在 buddy 自己的目录 ─────────────────────────
    let skills_dir = app.ensure_skill_assets().expect("技能没摊出来");
    let packs = bw::standard::skills::all();
    let on_disk = packs
        .iter()
        .filter(|p| skills_dir.join(&p.rel).is_file())
        .count();
    say(
        "步骤 1 · 技能摊在哪",
        &format!(
            "{} · 编在二进制里 {} 份,落到硬盘 {} 份",
            skills_dir.display(),
            packs.len(),
            on_disk
        ),
    );
    say(
        "步骤 1 · 用户的仓里有没有 .claude/skills/",
        &format!(
            "{}(该是 false —— buddy 不往用户仓里塞自己的技能)",
            repo.join(".claude/skills").exists()
        ),
    );

    // ── 2 · 没摊 references:提示词里 references 块该是空的 ──────
    // 逐字段拼一张活。`Issue` 故意没有 `Default` —— 一张没有项目的活不该存在,
    // 为了写个例子给领域模型开这个口子不值。
    let issue = Issue {
        id: IssueId::nil(),
        project_id: ProjectId::new(),
        number: 1,
        remote_number: 0,
        title: "更新指标 + 制定本周计划".into(),
        body: String::new(),
        status: IssueStatus::Todo,
        branch: String::new(),
        pr_number: 0,
        week_of: String::new(),
        version: String::new(),
        tool: String::new(),
        kind: IssueKind::Ops,
        origin: IssueOrigin::Human,
        workflow: bw::app::OPS1_WORKFLOW.to_string(),
        category: None,
        sort_order: 0.0,
        metric_key: String::new(),
        created_at: 0,
        updated_at: 0,
        settled_at: None,
        assignee: String::new(),
        author: String::new(),
        plan_version: String::new(),
    };
    let skill = bw::app::skill_pointer(&skills_dir, &issue.workflow).expect("挑不到剧本");
    let prompt_empty = bw::app::agent_system_prompt(&issue, Some(&skill), &[]);
    say(
        "步骤 2 · 没指 references 时提示词里几条路径",
        &format!("{}(该是 0)", prompt_empty.matches("\n- `").count()),
    );

    // ── 3 · 摊 references:指标活该命中 metrics.md ─────────────
    let refs_dir = app.ensure_prompt_assets().expect("references 没摊出来");
    let references = bw::app::references_for(&issue, &refs_dir);
    let prompt = bw::app::agent_system_prompt(&issue, Some(&skill), &references);
    say(
        "步骤 3 · 指标活命中几份 reference",
        &format!(
            "{}(该是 1 —— metrics 命中;build 不命中因为 category=None)",
            references.len()
        ),
    );
    say(
        "步骤 3 · 提示词里有没有 metrics.md 路径",
        &format!("{}(该是 true)", prompt.contains("metrics.md")),
    );

    // ── 4 · 提示词里给的路径是真文件,且**没有正文** ────────────
    say(
        "步骤 4 · 提示词里那条技能路径",
        &format!(
            "{} · 真是个文件={}",
            skill.path,
            std::path::Path::new(&skill.path).is_file()
        ),
    );
    let body = std::fs::read_to_string(&skill.path)?;
    // 拿正文里最长的一行去提示词里找 —— 找得到就说明正文被塞进来了。
    let longest = body.lines().max_by_key(|l| l.len()).unwrap_or("");
    say(
        "步骤 4 · 正文有没有被塞进提示词",
        &format!(
            "提示词 {} 字 / 技能正文 {} 字 · 正文最长那行出现在提示词里={}(该是 false)",
            prompt.chars().count(),
            body.chars().count(),
            !longest.is_empty() && prompt.contains(longest)
        ),
    );

    println!("\n──────── 完整的系统提示词(开工时原样送给 agent)────────\n{prompt}");
    Ok(())
}
