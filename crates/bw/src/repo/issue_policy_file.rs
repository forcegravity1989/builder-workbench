//! `.bw/issue-policy.toml` —— **残留格式**。产品不读、不写、不铺。
//! 解析只给测试和对账认得出旧文件;每周资产盘点整份删掉。

use super::{parse_toml, read_to_string, Result};
use crate::model::{category_from_key, Category};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const REL_PATH: &str = ".bw/issue-policy.toml";

/// 一个开工工具的声明。`kind` 是**接法类型**(终端类 / 本机网页内嵌类),
/// 和 `[[mapping]]` 里的 `category`(活的类别标签)是两件事,字段名特意分开。
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ToolDecl {
    pub name: String,
    /// `"terminal"` | `"web_embed"`
    pub kind: String,
    /// 怎么探活:`"path_candidates"` | `"version_cmd"` | `"socket"`
    pub probe: String,
    #[serde(default)]
    pub version_cmd: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

/// 一行三列映射:类别 → 默认开工工具 → 默认 workflow。
/// `workflow` 空 = 这个类别没有默认 workflow,开工时从鱼塘挑。
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CategoryMapping {
    pub category: String,
    pub tool: String,
    #[serde(default)]
    pub workflow: String,
}

impl CategoryMapping {
    /// 认得出的类别键才返回 `Some`。认不出就是文件里写了个 Workbench 不懂的类别,
    /// 调用方按「没有映射」处理,不猜。
    pub fn category(&self) -> Option<Category> {
        category_from_key(&self.category)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ReviewPolicy {
    /// 不存角色表,一句话表达权限:谁有仓写权限谁能点合入。
    #[serde(default)]
    pub who_can_merge: String,
    #[serde(default)]
    pub require_pr_for: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Cadence {
    /// 运作活①「更新指标与制定周计划」:`"manual"`,判据 = 当前周没有周计划文件。
    #[serde(default)]
    pub ops1_trigger: String,
    /// 运作活②「资产盘点」:`"scheduled"`。
    #[serde(default)]
    pub ops2_trigger: String,
    /// 形如 `"fri 20:00"`。判据是「本周有没有这张活」,不查任何定时表。
    #[serde(default)]
    pub ops2_schedule: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct KanbanLabels {
    #[serde(default)]
    pub pool_label: String,
    #[serde(default)]
    pub todo_label: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct IssuePolicyFile {
    #[serde(default)]
    pub schema_version: u32,
    #[serde(default, rename = "tool")]
    pub tools: Vec<ToolDecl>,
    #[serde(default, rename = "mapping")]
    pub mappings: Vec<CategoryMapping>,
    #[serde(default)]
    pub review: Option<ReviewPolicy>,
    #[serde(default)]
    pub cadence: Option<Cadence>,
    #[serde(default)]
    pub kanban: Option<KanbanLabels>,
}

impl IssuePolicyFile {
    /// 某个类别的默认工具与 workflow。没配这个类别就返回 `None`——调用方
    /// 如实留空,不替用户挑一个。
    pub fn mapping_for(&self, category: Category) -> Option<&CategoryMapping> {
        self.mappings
            .iter()
            .find(|m| m.category() == Some(category))
    }

    pub fn tool(&self, name: &str) -> Option<&ToolDecl> {
        self.tools.iter().find(|t| t.name == name)
    }
}

pub fn parse(raw: &str) -> Result<IssuePolicyFile> {
    parse_toml(REL_PATH, raw)
}

pub fn read(workspace: &Path) -> Result<Option<IssuePolicyFile>> {
    match read_to_string(workspace, REL_PATH)? {
        None => Ok(None),
        Some(raw) => parse(&raw).map(Some),
    }
}
