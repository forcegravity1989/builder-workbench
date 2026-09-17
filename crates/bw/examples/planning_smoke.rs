//! Actual Skill deployment and JSON consumer check. No remote or model is invoked.
use bw::{
    app::App,
    model::{Project, ProjectId},
};
use std::{path::PathBuf, sync::Arc};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(std::env::args().nth(1).ok_or("output directory required")?);
    let app = App::new(
        root.join("workspaces"),
        Arc::new(bw_engine::MockInteractiveExecutor),
    )
    .with_asset_root(root.join("assets"));
    let skills = app.ensure_skill_assets().ok_or("asset deployment failed")?;
    let mut deployed = Vec::new();
    for item in bw::standard::skills::sidecars() {
        let file = skills.join(&item.rel);
        assert_eq!(std::fs::read_to_string(&file)?, item.raw);
        deployed.push(item.rel);
    }
    let workspace = root.join("repo");
    std::fs::create_dir_all(&workspace)?;
    for args in [
        &["init"][..],
        &["config", "user.name", "Planning fixture"],
        &["config", "user.email", "fixture@example.invalid"],
        &["commit", "--allow-empty", "-m", "fixture"],
    ] {
        let status = std::process::Command::new("git")
            .args(args)
            .current_dir(&workspace)
            .output()?;
        assert!(status.status.success());
    }
    let project = Project {
        id: ProjectId::nil(),
        slug: "fixture".into(),
        name: "fixture".into(),
        workspace_path: workspace.display().to_string(),
        provider: "github".into(),
        remote_host: "".into(),
        remote_path: "".into(),
        signal: None,
        weekly_signal: None,
        signal_derived_at: None,
        sort_order: 0.0,
        created_at: 0,
        updated_at: 0,
    };
    let mut data: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(
        skills.join("week-planning/assets/data-template.json"),
    )?)?;
    data["version"] = "v0.4".into();
    data["plan"]["goals"] = serde_json::json!([{"title":"Archived result"}]);
    data["previous_version"] = serde_json::json!({"version":"v0.3"});
    data["summary"]["progress"] = "Prior result 2/3".into();
    data["progress_updates"] = serde_json::json!([{"text":"Current execution 1/2"}]);
    let file = workspace.join(".bw/planning/v0.4/data.json");
    std::fs::create_dir_all(file.parent().unwrap())?;
    std::fs::write(&file, serde_json::to_vec_pretty(&data)?)?;
    let notes = app.version_plan_notes(&project).await;
    assert_eq!(notes.goals["v0.4"], "- Archived result");
    assert_eq!(notes.progress["v0.3"], "Prior result 2/3");
    assert_eq!(notes.progress["v0.4"], "Current execution 1/2");
    let tree = bw_engine::workspace::provision_week_plan_worktree(&workspace).await?;
    let draft = tree.join(".bw/planning/v0.4/data.json");
    std::fs::create_dir_all(draft.parent().unwrap())?;
    data["plan"]["goals"][0]["title"] = "Edited draft".into();
    std::fs::write(&draft, serde_json::to_vec_pretty(&data)?)?;
    assert_eq!(
        app.version_plan_notes(&project).await.goals["v0.4"],
        "- Edited draft"
    );
    std::fs::write(&draft, b"invalid")?;
    assert!(!app
        .version_plan_notes(&project)
        .await
        .goals
        .contains_key("v0.4"));
    std::fs::write(&draft, serde_json::to_vec_pretty(&data)?)?;
    std::fs::write(
        root.join("deployment.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"deployed":deployed,"skills":skills,"workspace":workspace,"json_reader":"archive and registered draft; malformed draft is unknown","prior_progress_version":"v0.3"}),
        )?,
    )?;
    println!("{}", skills.join("week-planning").display());
    Ok(())
}
