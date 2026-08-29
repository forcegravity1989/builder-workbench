//! `.bw/config/issue-policy.toml` —— 活的约定:「类别→工具→workflow」三列映射、节律、
//! 看板列文案。
//!
//! 这份文件**不入库**。配置屏、▶开工、定时判据每次现读现解析。
//!
//! **开工工具的探活与接法不在这份文件里**——那是适配模块的事(`app/tools.rs`
//! 的 `probe` 与 `agent_for`、壳的 `probe_env`)。这里只说「哪个类别默认用哪个
//! 工具」,工具本身怎么找、怎么起,由代码回答。

use super::{parse_toml, read_to_string, write_file, Result};
use crate::model::{category_from_key, Category};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const REL_PATH: &str = ".bw/config/issue-policy.toml";

/// 一行三列映射:类别 → 默认开工工具 → 默认 workflow。
/// `workflow` 空 = 这个类别没有默认 workflow,开工时现挑。
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CategoryMapping {
    pub category: String,
    pub tool: String,
    #[serde(default)]
    pub workflow: String,
}

impl CategoryMapping {
    /// 认得出的类别键才返回 `Some`。认不出就是文件里写了个不懂的类别,
    /// 调用方按「没有映射」处理,不猜。
    pub fn category(&self) -> Option<Category> {
        category_from_key(&self.category)
    }
}

/// 节律。运作活①永远人触发,不在这里配;②到点自动建活。
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Cadence {
    /// 形如 `"fri 20:00"`。判据是「本周有没有这张活」,不查任何定时表。
    #[serde(default)]
    pub ops2_schedule: String,
}

/// 看板前两列的标题。
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
    #[serde(default, rename = "mapping")]
    pub mappings: Vec<CategoryMapping>,
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

/// 配置屏改完映射保存时写回。整份重写,所以人手加的注释会掉——配置屏保存前
/// 会提示这一点,和指标文件同一条已知代价。
pub fn write(workspace: &Path, f: &IssuePolicyFile) -> Result<String> {
    let body = render(f);
    write_file(workspace, REL_PATH, &body)?;
    Ok(body)
}

pub fn render(f: &IssuePolicyFile) -> String {
    let q = |s: &str| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""));
    let mut s = String::new();
    s.push_str("# 三列映射:活的类别 → 默认开工工具 → 默认 workflow(空 = 开工时现挑)。\n");
    s.push_str("# 工具的探活与接法在 Workbench 的适配模块里,不在这份文件配。\n");
    for m in &f.mappings {
        s.push_str("\n[[mapping]]\n");
        s.push_str(&format!("category = {}\n", q(&m.category)));
        s.push_str(&format!("tool     = {}\n", q(&m.tool)));
        s.push_str(&format!("workflow = {}\n", q(&m.workflow)));
    }
    if let Some(c) = &f.cadence {
        s.push_str("\n# 运作活②「资产盘点」到点自动建活;运作活①永远人触发。\n");
        s.push_str("[cadence]\n");
        s.push_str(&format!("ops2_schedule = {}\n", q(&c.ops2_schedule)));
    }
    if let Some(k) = &f.kanban {
        s.push_str("\n# 看板前两列的标题。\n");
        s.push_str("[kanban]\n");
        s.push_str(&format!("pool_label = {}\n", q(&k.pool_label)));
        s.push_str(&format!("todo_label = {}\n", q(&k.todo_label)));
    }
    s
}
