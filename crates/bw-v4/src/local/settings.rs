//! `asset_root/settings.toml` —— 全局本机设置。
//!
//! 替代旧的 `app_meta` 表里的 `workspaces_root` 键。今天只有这一个全局键;
//! `notify_seen` 是 per-project,住在项目注册表里([`super::registry`])。

use crate::repo::RepoFileError;
use std::path::Path;

const FILENAME: &str = "settings.toml";

/// 全局本机设置。
#[derive(Default, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    /// 工作区根目录。**本机设置,不进仓** —— 仓是给所有人共用的正本,
    /// 「我这台机器上项目放哪」只是这台机器的事。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspaces_root: Option<String>,
}

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
}
