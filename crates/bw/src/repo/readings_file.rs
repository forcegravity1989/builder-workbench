//! `.bw/metrics/readings.jsonl` —— 不可回溯(B)与手填(C)的只追加读数流水。
//!
//! 一行一个 JSON 对象。记账键是**日历日**(`YYYY-MM-DD`),和 V3 `observation.ts`
//! 对齐,迁过去一行对一天。不改已有行;同一天同一指标采多次,读的时候**最后
//! 一行为准**。展示按 ISO 周收:那一周里日期最大的一天。文件不存在 / 某行
//! 坏掉 / 没有 `day` = 那一行当没看见,不把整份打成失败。

use super::{RepoFileError, Result};
use crate::isoweek;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;

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
    for r in collapse_days(read_all(workspace)) {
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
        read_all(workspace)
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

/// 追加一行。父目录不存在就建。失败把原因给人,不写 0、不改旧行。
pub fn append_metric_reading(workspace: &Path, row: &MetricReading) -> Result<()> {
    let path = workspace.join(REL);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| RepoFileError::Io {
            path: REL.to_string(),
            source: e,
        })?;
    }
    let mut line = serde_json::to_string(row).map_err(|e| RepoFileError::Shape {
        path: REL.to_string(),
        why: format!("读数行序列化失败:{e}"),
    })?;
    line.push('\n');
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| RepoFileError::Io {
            path: REL.to_string(),
            source: e,
        })?;
    f.write_all(line.as_bytes()).map_err(|e| RepoFileError::Io {
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
        append_metric_reading(&dir, &a).unwrap();
        append_metric_reading(&dir, &b).unwrap();
        let got = read_metric_readings(&dir, "2026-W35");
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].value, "8");
        let weeks = latest_values_for(&dir, "关注人数", &["2026-W34".into(), "2026-W35".into()]);
        assert_eq!(weeks, vec![None, Some("8".into())]);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
