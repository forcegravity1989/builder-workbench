//! `health_smoke` —— 健康判据(含指标见红)的读回证明。
//!
//! ```bash
//! cargo run -p bw-v4 --example health_smoke -- <仓路径> [周号]
//! ```
//!
//! 证明的是健康判据 + 「指标见红」真的是**纯现算**:输入全部来自仓文件与
//! git(周计划、`.bw/state/metrics-readings.jsonl` 的读数、`.bw/config/metrics.toml` 的
//! 目标、git 标签),不碰网络、不起采集脚本——同一个仓,谁跑、跑几遍、
//! 换哪台机器,都是同一个结果。
//!
//! 自己复算:`cat <仓>/.bw/state/metrics-readings.jsonl` 取本周读数,对照
//! `<仓>/.bw/config/metrics.toml` 里同名指标的 `target`,方向按 `≥ ≤ > < =`。

use bw::app::collect_health_inputs;
use bw::derive::derive_project_health;
use bw::isoweek;
use bw::model::{Project, ProjectId};
use std::path::PathBuf;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    // 起任何线程之前先把本机时区定住 —— 周是按本机时区算的。
    isoweek::init_local_offset();
    let args: Vec<String> = std::env::args().collect();
    let Some(ws) = args.get(1).map(PathBuf::from) else {
        eprintln!("用法:cargo run -p bw-v4 --example health_smoke -- <仓路径> [周号]");
        std::process::exit(2);
    };
    let week = args.get(2).cloned().unwrap_or_else(isoweek::current_week);

    println!("仓:{}", ws.display());
    println!("按哪一周判:{week}\n");

    // 只验「仓能算出来的那半」:issue 侧输入(周目标 / 运作活①)传空——它们
    // 的正本在远端 issue,不在仓文件;本烟测证明的是指标见红那条纯现算链。
    let project = Project {
        id: ProjectId::new(),
        slug: "health-smoke".into(),
        name: "health-smoke".into(),
        workspace_path: ws.display().to_string(),
        provider: String::new(),
        remote_host: String::new(),
        remote_path: String::new(),
        signal: None,
        weekly_signal: None,
        signal_derived_at: None,
        sort_order: 0.0,
        created_at: 0,
        updated_at: 0,
    };
    let inputs = collect_health_inputs(&project, &ws, &week, &[], None).await;
    println!("输入(全部现算,来源标在括号里):");
    println!("  本周有周目标      = {}(周计划文件)", inputs.has_week_goal);
    println!("  本周有提交        = {}(git)", inputs.committed_this_week);
    println!("  上周有提交        = {}(git)", inputs.committed_last_week);
    println!("  git 读得动        = {}", inputs.git_readable);
    println!("  运作活①还开着    = {}", inputs.ops1_open);
    println!(
        "  有指标读数        = {}(readings.jsonl)",
        inputs.has_metric_reading
    );
    println!(
        "  越线的指标        = {}(读数 × metrics.toml 目标)",
        if inputs.red_metrics.is_empty() {
            "无".to_string()
        } else {
            inputs.red_metrics.join(";")
        }
    );
    println!(
        "  上周有交付        = {}(git 合并 / 发版记录)",
        inputs.delivered_last_week
    );

    let health = derive_project_health(&inputs);
    println!("\n灯:{:?}", health.signal());
    println!("理由:");
    for r in health.reasons() {
        println!("  [{}] {}", if r.ok { "√" } else { "×" }, r.text);
    }
}
