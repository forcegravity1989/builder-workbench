//! 指标定义仅接受 schema_version = 2；不自动迁移旧格式。

use super::RepoFileError;
use super::{parse_toml, read_to_string, Result};
use serde::Deserialize;
use std::path::Path;

pub const REL_PATH: &str = ".bw/metrics.toml";

pub const SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MetricClass {
    Retro,
    PointInTime,
    Manual,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
pub struct CollectPlan {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub run: Vec<String>,
    #[serde(default)]
    pub retro: bool,
}

impl CollectPlan {
    pub fn class(&self) -> MetricClass {
        match self.kind.trim() {
            "script" if self.retro => MetricClass::Retro,
            "script" => MetricClass::PointInTime,
            _ => MetricClass::Manual,
        }
    }

    pub fn is_manual(&self) -> bool {
        self.class() == MetricClass::Manual
    }

    pub fn runnable(&self) -> bool {
        !self.is_manual() && !self.run.is_empty()
    }
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
pub struct MetricDef {
    pub name: String,
    #[serde(default)]
    pub def: String,
    #[serde(default)]
    pub target: String,
    #[serde(default)]
    pub feature: String,
    #[serde(default)]
    pub leads: String,
    #[serde(default)]
    pub collect: CollectPlan,
}

#[derive(Debug, Clone, Default, Deserialize, PartialEq, Eq)]
pub struct MetricsFile {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default)]
    pub north_star: Option<MetricDef>,
    #[serde(default)]
    pub lagging: Vec<MetricDef>,
    #[serde(default)]
    pub leading: Vec<MetricDef>,
}

impl MetricsFile {
    pub fn all(&self) -> Vec<&MetricDef> {
        self.north_star
            .iter()
            .chain(self.lagging.iter())
            .chain(self.leading.iter())
            .collect()
    }
}

pub fn read(workspace: &Path) -> Result<Option<MetricsFile>> {
    let Some(raw) = read_to_string(workspace, REL_PATH)? else {
        return Ok(None);
    };
    let file = parse_toml::<MetricsFile>(REL_PATH, &raw)?;
    if file.schema_version != SCHEMA_VERSION {
        return Err(RepoFileError::Shape {
            path: REL_PATH.into(),
            why: format!(
                "这份指标文件是旧格式(schema_version = {},当前是 {})。\
                 旧格式里那几种采集方式从来没有实现过,不做迁移 —— \
                 请通过「更新指标与版本计划」重新定义指标。",
                file.schema_version, SCHEMA_VERSION
            ),
        });
    }
    Ok(Some(file))
}
