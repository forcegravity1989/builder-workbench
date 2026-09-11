//! 按日和指标名保存读数；同键更新，历史查询取时间窗内最后一个值。

use super::{RepoFileError, Result};
use crate::isoweek;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const REL: &str = ".bw/metrics/readings.jsonl";

/// 一行读数。`source` / `collected_at` 旧行可能没有。没有 `day` 的旧周键行不认。
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct MetricReading {
    #[serde(default)]
    pub day: String,
    pub name: String,
    pub value: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub collected_at: String,
}

/// 读指定 ISO 周收成的读数。一周多天时取日期最大的那天,那天多行取最后一行。
pub fn read_metric_readings(workspace: &Path, week: &str) -> Vec<MetricReading> {
    let mut latest: HashMap<String, MetricReading> = HashMap::new();
    for r in collapse_days(read_merged(workspace)) {
        if isoweek::week_of_ymd(&r.day).as_deref() != Some(week) {
            continue;
        }
        latest
            .entry(r.name.clone())
            .and_modify(|old| {
                if r.day > old.day {
                    *old = r.clone();
                }
            })
            .or_insert(r);
    }
    latest.into_values().collect()
}

/// 某指标在近 N 周里、每周最后一天读到的值。`None` = 那一周没有日行。
pub fn latest_values_for(workspace: &Path, name: &str, weeks: &[String]) -> Vec<Option<String>> {
    let days: Vec<MetricReading> = collapse_days(
        read_merged(workspace)
            .into_iter()
            .filter(|r| r.name == name && !r.value.is_empty()),
    );
    weeks
        .iter()
        .map(|w| {
            days.iter()
                .filter(|r| isoweek::week_of_ymd(&r.day).as_deref() == Some(w.as_str()))
                .max_by(|a, b| a.day.cmp(&b.day))
                .map(|r| r.value.clone())
        })
        .collect()
}

/// 某指标在近 N 个日历日里、当天那一行的值。`None` = 那一天没有日行。
pub fn latest_values_for_days(
    workspace: &Path,
    name: &str,
    days: &[String],
) -> Vec<Option<String>> {
    let rows: Vec<MetricReading> = collapse_days(
        read_merged(workspace)
            .into_iter()
            .filter(|r| r.name == name && !r.value.is_empty()),
    );
    days.iter()
        .map(|d| rows.iter().find(|r| r.day == *d).map(|r| r.value.clone()))
        .collect()
}

/// 同日同指标更新原值；workspace 必须是指标记录工作树，不能传主检出。
pub fn upsert_metric_reading(workspace: &Path, row: &MetricReading) -> Result<()> {
    if row.day.is_empty() || row.name.is_empty() {
        return Err(RepoFileError::Shape {
            path: REL.to_string(),
            why: "读数行缺 day 或 name,不写".into(),
        });
    }
    let mut rows = read_all(workspace);
    let mut found = false;
    for existing in &mut rows {
        if existing.name == row.name && existing.day == row.day {
            if existing.value == row.value && existing.source == row.source {
                return Ok(());
            }
            *existing = row.clone();
            found = true;
            break;
        }
    }
    if !found {
        rows.push(row.clone());
    }
    write_all(workspace, &rows)
}

/// 合并主检出的读数后删除其未提交文件，同日同指标以传入值覆盖。
pub fn absorb_main_readings(ledger: &Path, main: &Path) -> Result<bool> {
    let main_path = main.join(REL);
    if !main_path.is_file() {
        return Ok(false);
    }
    for row in read_all(main) {
        upsert_metric_reading(ledger, &row)?;
    }
    std::fs::remove_file(&main_path).map_err(|e| RepoFileError::Io {
        path: REL.to_string(),
        source: e,
    })?;
    Ok(true)
}

/// 同路径的普通目录不视为指标记录工作树。
pub fn ledger_dir_if_present(main: &Path) -> Option<PathBuf> {
    let dir = bw_engine::workspace::ledger_worktree_path(main)?;
    dir.join(".git").exists().then_some(dir)
}

fn read_merged(main: &Path) -> Vec<MetricReading> {
    let mut latest: HashMap<(String, String), MetricReading> = HashMap::new();
    for r in read_all(main) {
        if r.day.is_empty() || r.name.is_empty() {
            continue;
        }
        latest.insert((r.name.clone(), r.day.clone()), r);
    }
    if let Some(ledger) = ledger_dir_if_present(main) {
        for r in read_all(&ledger) {
            if r.day.is_empty() || r.name.is_empty() {
                continue;
            }
            latest.insert((r.name.clone(), r.day.clone()), r);
        }
    }
    latest.into_values().collect()
}

fn write_all(workspace: &Path, rows: &[MetricReading]) -> Result<()> {
    let path = workspace.join(REL);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| RepoFileError::Io {
            path: REL.to_string(),
            source: e,
        })?;
    }
    let mut body = String::new();
    for row in rows {
        let line = serde_json::to_string(row).map_err(|e| RepoFileError::Shape {
            path: REL.to_string(),
            why: format!("读数行序列化失败:{e}"),
        })?;
        body.push_str(&line);
        body.push('\n');
    }
    std::fs::write(&path, body).map_err(|e| RepoFileError::Io {
        path: REL.to_string(),
        source: e,
    })
}

fn collapse_days(rows: impl IntoIterator<Item = MetricReading>) -> Vec<MetricReading> {
    let mut latest: HashMap<(String, String), MetricReading> = HashMap::new();
    for r in rows {
        if r.day.is_empty() || r.name.is_empty() {
            continue;
        }
        latest.insert((r.name.clone(), r.day.clone()), r);
    }
    latest.into_values().collect()
}

fn read_all(workspace: &Path) -> Vec<MetricReading> {
    let path = workspace.join(REL);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<MetricReading>(l).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn last_day_in_week_wins_display() {
        let dir = std::env::temp_dir().join(format!("bw-readings-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let a = MetricReading {
            day: "2026-08-24".into(),
            name: "关注人数".into(),
            value: "3".into(),
            source: "script".into(),
            collected_at: "t1".into(),
        };
        let b = MetricReading {
            day: "2026-08-25".into(),
            value: "8".into(),
            collected_at: "t2".into(),
            ..a.clone()
        };
        upsert_metric_reading(&dir, &a).unwrap();
        upsert_metric_reading(&dir, &b).unwrap();
        let got = read_metric_readings(&dir, "2026-W35");
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].value, "8");
        let weeks = latest_values_for(&dir, "关注人数", &["2026-W34".into(), "2026-W35".into()]);
        assert_eq!(weeks, vec![None, Some("8".into())]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn same_day_upserts_not_appends() {
        let dir = std::env::temp_dir().join(format!("bw-readings-up-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let a = MetricReading {
            day: "2026-08-26".into(),
            name: "在线".into(),
            value: "1".into(),
            source: "script".into(),
            collected_at: "t1".into(),
        };
        upsert_metric_reading(&dir, &a).unwrap();
        upsert_metric_reading(
            &dir,
            &MetricReading {
                value: "9".into(),
                collected_at: "t2".into(),
                ..a.clone()
            },
        )
        .unwrap();
        let raw = std::fs::read_to_string(dir.join(REL)).unwrap();
        assert_eq!(raw.lines().filter(|l| !l.trim().is_empty()).count(), 1);
        assert!(raw.contains("\"value\":\"9\""));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn plain_directory_at_ledger_path_is_not_read_as_a_worktree() {
        let main = std::env::temp_dir().join(format!("bw-plain-ledger-{}", uuid::Uuid::new_v4()));
        let ledger = bw_engine::workspace::ledger_worktree_path(&main).unwrap();
        std::fs::create_dir_all(&ledger).unwrap();
        assert_eq!(ledger_dir_if_present(&main), None);
        std::fs::remove_dir_all(&main).unwrap();
    }
}
