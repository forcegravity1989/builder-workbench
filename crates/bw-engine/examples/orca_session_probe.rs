//! 在指定工作树用 BW 开工同款 RPC（terminal.createAgentSession）启动一个真实
//! Orca 会话，并等待该工作树出现新的 Claude 会话文件后读回其路径。
//! 系统提示词携带调用方给的归属标记，E2E 据此只清理自己启动的进程。
use serde_json::json;
use std::path::PathBuf;
use std::time::{Duration, Instant};

#[tokio::main]
async fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let (Some(worktree), Some(marker)) = (argv.first(), argv.get(1)) else {
        eprintln!("usage: orca_session_probe <worktree> <marker> [timeout_secs]");
        std::process::exit(2);
    };
    let worktree = PathBuf::from(worktree);
    let timeout_secs: u64 = argv
        .get(2)
        .and_then(|v| v.parse().ok())
        .unwrap_or(150)
        .clamp(10, 1800);
    let result = async {
        let runtime = bw_engine::orca::connect().map_err(|e| e.to_string())?;
        let baseline = bw_engine::orca::session_ids_for_worktree(&worktree);
        let outcome = bw_engine::orca::create_session(
            &runtime,
            &worktree,
            "claude",
            "这是 Workbench E2E 探针会话。请只回复 ok；不要读写任何文件，不要执行任何命令，然后原地等待。",
            &format!("{marker} 这是 Workbench E2E 探针会话的系统提示，不承载任务内容。"),
        )
        .await
        .map_err(|e| e.to_string())?;
        let started = Instant::now();
        let mut session_id = None;
        while started.elapsed() < Duration::from_secs(timeout_secs) {
            session_id = bw_engine::orca::session_ids_for_worktree(&worktree)
                .into_iter()
                .rev()
                .find(|id| !baseline.contains(id));
            if session_id.is_some() {
                break;
            }
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        let session_id = session_id
            .ok_or_else(|| format!("{timeout_secs} 秒内工作树没有出现新的会话文件"))?;
        let jsonl = bw_engine::orca::claude_project_dir(&worktree)
            .map(|dir| dir.join(format!("{session_id}.jsonl")))
            .ok_or("无法定位 Claude 项目目录")?;
        if !jsonl.is_file() {
            return Err(format!("会话文件不存在：{}", jsonl.display()));
        }
        Ok::<_, String>(json!({
            "v": 1,
            "worktree": worktree,
            "outcome": match outcome {
                bw_engine::orca::CreateSessionOutcome::Ready => "ready",
                bw_engine::orca::CreateSessionOutcome::HandleTimeout => "handle-timeout",
            },
            "sessionId": session_id,
            "jsonlPath": jsonl,
            "baselineSessionCount": baseline.len(),
            "waitedSecs": started.elapsed().as_secs(),
        }))
    }
    .await;
    match result {
        Ok(value) => println!("{value}"),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
