//! projects.toml 保存本机项目定位和健康显示缓存。

use crate::derive::DerivedHealth;
use crate::model::{Project, ProjectId, Signal};
use crate::repo::RepoFileError;
use std::path::{Path, PathBuf};

fn now_ts() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

const FILENAME: &str = "projects.toml";

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct ProjectEntry {
    pub id: ProjectId,
    pub slug: String,
    pub name: String,
    pub workspace_path: String,
    pub provider: String,
    pub remote_host: String,
    pub remote_path: String,
    /// 健康灯显示缓存。`None` = 没数据 = Unknown 灰。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signal: Option<Signal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub weekly_signal: Option<Signal>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signal_derived_at: Option<i64>,
    #[serde(default)]
    pub sort_order: f64,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub updated_at: i64,
}

impl From<&Project> for ProjectEntry {
    fn from(p: &Project) -> Self {
        Self {
            id: p.id,
            slug: p.slug.clone(),
            name: p.name.clone(),
            workspace_path: p.workspace_path.clone(),
            provider: p.provider.clone(),
            remote_host: p.remote_host.clone(),
            remote_path: p.remote_path.clone(),
            signal: p.signal,
            weekly_signal: p.weekly_signal,
            signal_derived_at: p.signal_derived_at,
            sort_order: p.sort_order,
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}

impl ProjectEntry {
    pub fn to_project(&self) -> Project {
        Project {
            id: self.id,
            slug: self.slug.clone(),
            name: self.name.clone(),
            workspace_path: self.workspace_path.clone(),
            provider: self.provider.clone(),
            remote_host: self.remote_host.clone(),
            remote_path: self.remote_path.clone(),
            signal: self.signal,
            weekly_signal: self.weekly_signal,
            signal_derived_at: self.signal_derived_at,
            sort_order: self.sort_order,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

#[derive(Default, serde::Serialize, serde::Deserialize)]
struct RegistryFile {
    #[serde(default)]
    projects: Vec<ProjectEntry>,
}

pub struct ProjectRegistry;

impl ProjectRegistry {
    fn path(asset_root: &Path) -> PathBuf {
        asset_root.join(FILENAME)
    }

    pub fn load(asset_root: &Path) -> Result<Vec<ProjectEntry>, RepoFileError> {
        let path = Self::path(asset_root);
        match std::fs::read_to_string(&path) {
            Ok(raw) => {
                let file: RegistryFile =
                    toml::from_str(&raw).map_err(|e| RepoFileError::Parse {
                        path: FILENAME.into(),
                        source: e,
                    })?;
                Ok(file.projects)
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(e) => Err(RepoFileError::Io {
                path: FILENAME.into(),
                source: e,
            }),
        }
    }

    pub fn save(asset_root: &Path, entries: &[ProjectEntry]) -> Result<(), RepoFileError> {
        let file = RegistryFile {
            projects: entries.to_vec(),
        };
        let raw = toml::to_string_pretty(&file).map_err(|e| RepoFileError::Shape {
            path: FILENAME.into(),
            why: format!("序列化注册表失败:{e}"),
        })?;
        let path = Self::path(asset_root);
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

    pub fn find_by_slug(
        asset_root: &Path,
        slug: &str,
    ) -> Result<Option<ProjectEntry>, RepoFileError> {
        Ok(Self::load(asset_root)?.into_iter().find(|e| e.slug == slug))
    }

    pub fn find_by_id(
        asset_root: &Path,
        id: ProjectId,
    ) -> Result<Option<ProjectEntry>, RepoFileError> {
        Ok(Self::load(asset_root)?.into_iter().find(|e| e.id == id))
    }

    pub fn upsert(asset_root: &Path, p: &Project) -> Result<Project, RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        if let Some(existing) = entries.iter().find(|e| e.slug == p.slug) {
            return Ok(existing.to_project());
        }
        let ts = now_ts();
        let mut entry = ProjectEntry::from(p);
        entry.created_at = ts;
        entry.updated_at = ts;
        entries.push(entry);
        Self::save(asset_root, &entries)?;
        let mut out = p.clone();
        out.created_at = ts;
        out.updated_at = ts;
        out.signal = None;
        out.weekly_signal = None;
        out.signal_derived_at = None;
        Ok(out)
    }

    /// 只删除注册表条目；会话由调用方清理，返回计数当前固定为 0。
    pub fn remove(asset_root: &Path, id: ProjectId) -> Result<u64, RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        let before = entries.len();
        entries.retain(|e| e.id != id);
        let removed = before.saturating_sub(entries.len());
        Self::save(asset_root, &entries)?;
        Ok(removed as u64)
    }

    pub fn update_location(
        asset_root: &Path,
        id: ProjectId,
        name: &str,
        workspace_path: &str,
        provider: &str,
        remote_host: &str,
        remote_path: &str,
    ) -> Result<(), RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        let ts = now_ts();
        for e in entries.iter_mut() {
            if e.id == id {
                e.name = name.to_string();
                e.workspace_path = workspace_path.to_string();
                e.provider = provider.to_string();
                e.remote_host = remote_host.to_string();
                e.remote_path = remote_path.to_string();
                e.updated_at = ts;
                break;
            }
        }
        Self::save(asset_root, &entries)
    }

    pub fn set_workspace_path(
        asset_root: &Path,
        id: ProjectId,
        path: &str,
    ) -> Result<(), RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        let ts = now_ts();
        for e in entries.iter_mut() {
            if e.id == id {
                e.workspace_path = path.to_string();
                e.updated_at = ts;
                break;
            }
        }
        Self::save(asset_root, &entries)
    }

    pub fn cache_health(
        asset_root: &Path,
        id: ProjectId,
        health: &DerivedHealth,
    ) -> Result<(), RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        let ts = now_ts();
        for e in entries.iter_mut() {
            if e.id == id {
                e.signal = Some(health.signal());
                e.weekly_signal = Some(health.weekly_signal());
                e.signal_derived_at = Some(ts);
                e.updated_at = ts;
                break;
            }
        }
        Self::save(asset_root, &entries)
    }
}
