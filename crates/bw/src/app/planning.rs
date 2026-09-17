use super::week_comment::Ops1Notes;

impl super::App {
    /// Drafts in the registered planning tree and archived project files are revisions of one JSON source.
    pub async fn version_plan_notes(&self, project: &crate::model::Project) -> Ops1Notes {
        let main = self.workspace_at(&project.slug, &project.workspace_path);
        let mut files = crate::repo::planning_file::read(&main);
        if let Some(tree) = bw_engine::workspace::week_plan_worktree_path(&main) {
            if tree.join(".git").exists()
                && crate::git::current_branch(&tree)
                    .await
                    .is_ok_and(|b| b == bw_engine::workspace::WEEK_PLAN_BRANCH)
            {
                files.extend(crate::repo::planning_file::read(&tree));
            }
        }
        notes_from_files(&files)
    }
}

fn notes_from_files(files: &std::collections::BTreeMap<String, serde_json::Value>) -> Ops1Notes {
    let mut notes = Ops1Notes::default();
    // Execution updates belong to this version. A later retrospective supersedes them below.
    for (version, data) in files {
        let updates: Vec<&str> = data
            .get("progress_updates")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .rev()
            .filter_map(|entry| entry.get("text")?.as_str().filter(|s| !s.trim().is_empty()))
            .collect();
        if !updates.is_empty() {
            notes.progress.insert(version.clone(), updates.join("\n\n"));
        }
    }
    for (version, data) in files {
        let lines: Vec<String> = data
            .pointer("/plan/goals")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|goal| {
                let title = goal.get("title")?.as_str()?.trim();
                if title.is_empty() {
                    return None;
                }
                Some(format!("- {title}"))
            })
            .collect();
        if !lines.is_empty() {
            notes.goals.insert(version.clone(), lines.join("\n"));
        }
        if let (Some(previous), Some(progress)) = (
            data.pointer("/previous_version/version")
                .and_then(serde_json::Value::as_str),
            data.pointer("/summary/progress")
                .and_then(serde_json::Value::as_str)
                .filter(|s| !s.trim().is_empty()),
        ) {
            // A later planning screen summarizes the prior version, not the version being proposed.
            notes
                .progress
                .insert(previous.to_string(), progress.to_string());
        }
    }
    notes
}
