//! 独立读回 Orca 里某仓的自动化：名称、开关、执行目录、更新时间与提示词全文。
//! 只走 automation.list / automation.show 读回通道，不写任何配置。
use serde_json::{json, Value};
use std::path::PathBuf;

fn detail(row_id: &str, shown: &Value) -> Value {
    let automation = shown.pointer("/result/automation");
    let workspace_id = automation
        .and_then(|a| a.get("workspaceId"))
        .and_then(Value::as_str)
        .unwrap_or("");
    // Orca workspaceId 形如 <repoId>::<执行目录路径>；没有分隔符时整体按路径处理。
    let workspace = workspace_id
        .split_once("::")
        .map_or(workspace_id, |(_, path)| path);
    json!({
        "id": row_id,
        "workspace": workspace,
        "updatedAt": automation
            .and_then(|a| a.get("updatedAt"))
            .cloned()
            .unwrap_or(Value::Null),
        "prompt": automation
            .and_then(|a| a.get("prompt"))
            .and_then(Value::as_str)
            .unwrap_or(""),
    })
}

#[tokio::main]
async fn main() {
    let Some(repo) = std::env::args_os().nth(1).map(PathBuf::from) else {
        eprintln!("usage: orca_automation_readback <repo>");
        std::process::exit(2);
    };
    let result = async {
        let runtime = bw_engine::orca::connect().map_err(|e| e.to_string())?;
        let project_id = bw_engine::orca::repo_id(&runtime, &repo)
            .await
            .map_err(|e| e.to_string())?;
        let rows = bw_engine::orca::list_automations(&runtime)
            .await
            .map_err(|e| e.to_string())?;
        let mut automations = Vec::new();
        for row in rows.into_iter().filter(|row| row.project_id == project_id) {
            let shown = bw_engine::orca::automation_show(&runtime, &row.id)
                .await
                .map_err(|e| e.to_string())?;
            let mut entry = detail(&row.id, &shown);
            entry["name"] = json!(row.name);
            entry["enabled"] = json!(row.enabled);
            automations.push(entry);
        }
        Ok::<_, String>(json!({
            "v": 2,
            "repo": repo,
            "projectId": project_id,
            "automations": automations,
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
