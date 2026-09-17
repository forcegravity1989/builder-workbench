//! Read per-version planning JSON. Missing or invalid material is unknown; never fall back to comments.
use std::{collections::BTreeMap, path::Path};

pub fn read(workspace: &Path) -> BTreeMap<String, serde_json::Value> {
    let root = workspace.join(".bw/planning");
    let Ok(entries) = std::fs::read_dir(&root) else {
        return BTreeMap::new();
    };
    let mut plans = BTreeMap::new();
    for entry in entries.flatten() {
        let version = entry.file_name().to_string_lossy().into_owned();
        if version.is_empty()
            || !version
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
            || version.starts_with('.')
        {
            continue;
        }
        let file = entry.path().join("data.json");
        if file.exists() {
            plans.insert(version.clone(), serde_json::Value::Null);
        }

        let Ok(meta) = std::fs::metadata(&file) else {
            continue;
        };
        if meta.len() > 4 * 1024 * 1024 {
            continue;
        }
        let Ok(raw) = std::fs::read_to_string(&file) else {
            continue;
        };
        let Ok(value) =
            serde_json::from_str::<serde_json::Value>(raw.trim_start_matches('\u{feff}'))
        else {
            continue;
        };
        if value["version"].as_str() != Some(&version)
            || value["schema_version"].as_u64() != Some(2)
            || !value
                .pointer("/plan/goals")
                .is_some_and(serde_json::Value::is_array)
        {
            continue;
        }
        plans.insert(version, value);
    }
    plans
}
