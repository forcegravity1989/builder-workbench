//! `asset_root/settings.toml` —— 全局本机设置。
//!
//! 替代旧的 `app_meta` 表里的 `workspaces_root` 键。今天三个全局键:
//! 工作区根目录 + Orca 网页地址(配对 URL,带 token,**只在本地**,不进仓/Event
//! 原文/日志)+ 本机开工工具(类别 → 工具,跟人走这台机器,不进被管仓)。

use crate::repo::RepoFileError;
use std::collections::BTreeMap;
use std::path::Path;

const FILENAME: &str = "settings.toml";

/// 全局本机设置。
#[derive(Default, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    /// 工作区根目录。**本机设置,不进仓** —— 仓是给所有人共用的正本,
    /// 「我这台机器上项目放哪」只是这台机器的事。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspaces_root: Option<String>,
    /// Orca 网页配对 URL(安装版「给 web 配对」给的那条,带 token)。
    /// **本机设置,绝不进仓 / Event 原文 / 日志** —— 是这台机器看 Orca web 用的,
    /// 换台机器就失效。读侧 [`crate`] 不校验;会话屏 `web_embed_url` 用
    /// `looks_loopback_http` 过滤,非 loopback 如实滤成空。空 = 没配,会话屏空着。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orca_web_url: Option<String>,
    /// 本机「我用什么工具」:类别键(`prototype` / `build` / …)→ 工具 id。
    /// **跟人走这台机器**,不进被管仓。空 = 还没选过,读侧回退残留映射或产品默认。
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub tools: BTreeMap<String, String>,
    /// 界面配色:`claude`(默认)或 `apple`,对应设计系统的两套 token。
    /// **本机设置,不进仓**。空 / 不认识的值按默认。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
}

/// 设计系统里有的配色名。壳只认这两个,别的一律当默认。
pub const THEMES: [&str; 2] = ["claude", "apple"];

impl Settings {
    /// 读设置。文件不存在 = 全部默认值(不是错误)。
    pub fn load(asset_root: &Path) -> Result<Self, RepoFileError> {
        let path = asset_root.join(FILENAME);
        match std::fs::read_to_string(&path) {
            Ok(raw) => {
                let s: Self = toml::from_str(&raw).map_err(|e| RepoFileError::Parse {
                    path: FILENAME.into(),
                    source: e,
                })?;
                Ok(s)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(RepoFileError::Io {
                path: FILENAME.into(),
                source: e,
            }),
        }
    }

    /// 写设置。父目录不存在就建。
    pub fn save(asset_root: &Path, settings: &Self) -> Result<(), RepoFileError> {
        let raw = toml::to_string_pretty(settings).map_err(|e| RepoFileError::Shape {
            path: FILENAME.into(),
            why: format!("序列化设置失败:{e}"),
        })?;
        let path = asset_root.join(FILENAME);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| RepoFileError::Io {
                path: FILENAME.into(),
                source: e,
            })?;
        }
        std::fs::write(&path, &raw).map_err(|e| RepoFileError::Io {
            path: FILENAME.into(),
            source: e,
        })?;
        Ok(())
    }

    /// 读 `workspaces_root`。
    pub fn get_workspaces_root(asset_root: &Path) -> Option<String> {
        Self::load(asset_root)
            .ok()
            .and_then(|s| s.workspaces_root)
            .filter(|s| !s.trim().is_empty())
    }

    /// 写 `workspaces_root`。
    pub fn set_workspaces_root(asset_root: &Path, path: &str) -> Result<(), RepoFileError> {
        let mut s = Self::load(asset_root).unwrap_or_default();
        s.workspaces_root = Some(path.to_string());
        Self::save(asset_root, &s)
    }

    /// 读 `orca_web_url`(已 trim、空当无)。
    pub fn get_orca_web_url(asset_root: &Path) -> Option<String> {
        Self::load(asset_root)
            .ok()
            .and_then(|s| s.orca_web_url)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }

    /// 写 `orca_web_url`。空串 = 清掉(没配)。
    pub fn set_orca_web_url(asset_root: &Path, url: &str) -> Result<(), RepoFileError> {
        let mut s = Self::load(asset_root).unwrap_or_default();
        let url = url.trim();
        s.orca_web_url = if url.is_empty() {
            None
        } else {
            Some(url.to_string())
        };
        Self::save(asset_root, &s)
    }

    /// 读 `theme`。不在 [`THEMES`] 里的值当没设。
    pub fn get_theme(asset_root: &Path) -> Option<String> {
        Self::load(asset_root)
            .ok()
            .and_then(|s| s.theme)
            .map(|t| t.trim().to_string())
            .filter(|t| THEMES.contains(&t.as_str()))
    }

    /// 写 `theme`。不在 [`THEMES`] 里的值 = 清掉(回默认)。
    pub fn set_theme(asset_root: &Path, theme: &str) -> Result<(), RepoFileError> {
        let mut s = Self::load(asset_root).unwrap_or_default();
        let theme = theme.trim();
        s.theme = THEMES.contains(&theme).then(|| theme.to_string());
        Self::save(asset_root, &s)
    }

    /// 读某一类的本机开工工具。没有 / 空 = `None`(读侧再回退残留或产品默认)。
    pub fn get_tool(asset_root: &Path, category_key: &str) -> Option<String> {
        Self::load(asset_root)
            .ok()
            .and_then(|s| s.tools.get(category_key).cloned())
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
    }

    /// 写某一类的本机开工工具。空串 = 清掉,下次回退残留或产品默认。
    pub fn set_tool(
        asset_root: &Path,
        category_key: &str,
        tool: &str,
    ) -> Result<(), RepoFileError> {
        let mut s = Self::load(asset_root).unwrap_or_default();
        let tool = tool.trim();
        if tool.is_empty() {
            s.tools.remove(category_key);
        } else {
            s.tools.insert(category_key.to_string(), tool.to_string());
        }
        Self::save(asset_root, &s)
    }
}
