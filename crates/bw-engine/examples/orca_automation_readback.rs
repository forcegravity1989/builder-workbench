use serde_json::json;
use std::path::PathBuf;

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
        let automations = rows
            .into_iter()
            .filter(|row| row.project_id == project_id)
            .map(|row| json!({ "name": row.name, "enabled": row.enabled }))
            .collect::<Vec<_>>();
        Ok::<_, String>(json!({
            "v": 1,
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
