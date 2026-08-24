//! codehub_trend_smoke —— 验 codehub 远端趋势两条线的数据通路。
//!
//! `cargo run -p v4-engine --example codehub_trend_smoke -- <host> <path>`
//! 打印「合入 MR 时刻数」+「issue 建立/关闭时刻数」。仓无 MR 时第一条 0、
//! 有 issue 时第二条非零,说明通路通(按周分桶在 `bw-v4::trend` 里,同 github)。

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (host, path) = match (args.get(1), args.get(2)) {
        (Some(h), Some(p)) => (h.clone(), p.clone()),
        _ => {
            eprintln!("usage: codehub_trend_smoke <host> <path>   (例: green z30026659/oh-my-hw-claudecode)");
            std::process::exit(2);
        }
    };
    let mrs = v4_engine::codehub::merged_mr_times(&host, &path)
        .await
        .unwrap_or_else(|e| {
            eprintln!("merged_mr_times 失败:{e}");
            Vec::new()
        });
    println!("合入 MR 时刻:{} 条", mrs.len());
    for t in mrs.iter().take(5) {
        println!("  {t}");
    }
    let issues = v4_engine::codehub::issue_times(&host, &path)
        .await
        .unwrap_or_else(|e| {
            eprintln!("issue_times 失败:{e}");
            Vec::new()
        });
    println!("issue 时序:{} 条", issues.len());
    for (c, cl) in issues.iter().take(5) {
        println!("  建 {c} · 关 {}", cl.as_deref().unwrap_or("(未关)"));
    }
}
