use super::{parse_toml, read_to_string, write_file, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub const REL_PATH: &str = ".bw/project.toml";

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ChatConfig {
    pub provider: String,
    pub group_id: String,
    /// None 使用默认事件集合；空数组关闭全部通知。事件名见 NotifyEvent。
    #[serde(default)]
    pub notify: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectFile {
    pub name: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub brief: String,
    #[serde(default)]
    pub benchmark: String,
    #[serde(default)]
    pub opportunity: String,
    /// 旧仓里的规范版本镜像。新写入不再写这一行。
    #[serde(default)]
    pub standard_version: String,
    #[serde(default)]
    pub chat: Option<ChatConfig>,
}

pub fn parse(raw: &str) -> Result<ProjectFile> {
    let mut kept = String::new();
    for line in raw.lines() {
        let t = line.trim_start();
        if let Some(rest) = t.strip_prefix("current_version") {
            if rest.trim_start().starts_with('=') {
                continue;
            }
        }
        kept.push_str(line);
        kept.push('\n');
    }
    parse_toml(REL_PATH, &kept)
}

pub fn read(workspace: &Path) -> Result<Option<ProjectFile>> {
    match read_to_string(workspace, REL_PATH)? {
        None => Ok(None),
        Some(raw) => parse(&raw).map(Some),
    }
}

pub fn write(workspace: &Path, file: &ProjectFile) -> Result<String> {
    let body = render(file);
    write_file(workspace, REL_PATH, &body)?;
    Ok(body)
}

pub fn render(f: &ProjectFile) -> String {
    let mut s = String::new();
    s.push_str(&format!("name = {}\n", quote(&f.name)));
    s.push_str(&format!("kind = {}\n", quote(&f.kind)));
    s.push_str(&format!("brief = {}\n", quote(&f.brief)));
    s.push_str(&format!("benchmark = {}\n", quote(&f.benchmark)));
    s.push_str(&format!("opportunity = {}\n", quote(&f.opportunity)));
    if !f.standard_version.is_empty() {
        s.push_str(&format!(
            "standard_version = {}\n",
            quote(&f.standard_version)
        ));
    }
    match &f.chat {
        None => {
            s.push_str("\n# 项目群没配。配了就在这里加一段 [chat](提供方 / 群号 / 同步哪些\n");
            s.push_str("# 事件),总览名片会显示群名与「通知同步中」。\n");
        }
        Some(c) => {
            s.push_str("\n[chat]\n");
            s.push_str(&format!("provider = {}\n", quote(&c.provider)));
            s.push_str(&format!("group_id = {}\n", quote(&c.group_id)));
            if let Some(notify) = &c.notify {
                let items: Vec<String> = notify.iter().map(|n| quote(n)).collect();
                s.push_str(&format!("notify = [{}]\n", items.join(", ")));
            }
        }
    }
    s
}

fn quote(s: &str) -> String {
    super::toml_string(s)
}
