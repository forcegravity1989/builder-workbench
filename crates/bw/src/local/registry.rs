//! `asset_root/projects.toml` —— buddy 纳管的项目清单。
//!
//! 替代旧的 `project` 表(显示缓存 + 定位字段)+ `app_meta` 的 `notify_seen:*` 键。
//! 仓是正本,这里只是本机缓存:项目行的 name/provider/remote 在打开项目时从
//! `.bw/config/project.toml` 刷新。

use crate::derive::DerivedHealth;
use crate::model::{Project, ProjectId, Signal};
use crate::repo::RepoFileError;
use std::path::{Path, PathBuf};

/// 当前 UTC 秒。本地持久化文件里所有时间戳都是这一个刻度。
fn now_ts() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

/// 注册表文件名。
const FILENAME: &str = "projects.toml";

/// 一条项目注册项。比 [`Project`] 多两个本机字段:`notify_seen`(通知屏
/// 「读到哪了」)和 `cron_enabled`(定时到点要不要建活,缺省 true)。
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
    /// 通知屏「事件流读到哪个时间点」。`None` = 还没读过。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notify_seen: Option<i64>,
    /// 定时到点要不要自动建运作活②。缺省 true。
    #[serde(default = "default_true")]
    pub cron_enabled: bool,
}

fn default_true() -> bool {
    true
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
            notify_seen: None,
            cron_enabled: true,
        }
    }
}

impl ProjectEntry {
    /// 转回 [`Project`](领域模型)(丢掉本机扩展字段)。
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

/// 整份注册表文件。
#[derive(Default, serde::Serialize, serde::Deserialize)]
struct RegistryFile {
    #[serde(default)]
    projects: Vec<ProjectEntry>,
}

/// 项目注册表的读写。无状态:每次调用都读/写整个文件。文件小(几十条项目),
/// 全量读写比建索引便宜。
pub struct ProjectRegistry;

impl ProjectRegistry {
    fn path(asset_root: &Path) -> PathBuf {
        asset_root.join(FILENAME)
    }

    /// 读整份注册表。文件不存在 = 空表(不是错误)。
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

    /// 写整份注册表。父目录不存在就建。
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

    /// 按 slug 找。
    pub fn find_by_slug(
        asset_root: &Path,
        slug: &str,
    ) -> Result<Option<ProjectEntry>, RepoFileError> {
        Ok(Self::load(asset_root)?.into_iter().find(|e| e.slug == slug))
    }

    /// 按 id 找。
    pub fn find_by_id(
        asset_root: &Path,
        id: ProjectId,
    ) -> Result<Option<ProjectEntry>, RepoFileError> {
        Ok(Self::load(asset_root)?.into_iter().find(|e| e.id == id))
    }

    /// 按 slug 建项目;已存在同 slug 就原样返回既有行(幂等)。
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

    /// 删一个项目。返回删掉的会话条数(旧 store 返回 conversations 数,
    /// 这里返回 0——会话在 sessions 目录里,删项目时单独清)。
    pub fn remove(asset_root: &Path, id: ProjectId) -> Result<u64, RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        let before = entries.len();
        entries.retain(|e| e.id != id);
        let removed = before.saturating_sub(entries.len());
        Self::save(asset_root, &entries)?;
        Ok(removed as u64)
    }

    /// 改项目的定位字段(接入两卡、设置工作区)。
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

    /// 钉死某个项目的仓路径。
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

    /// 把现算出来的健康灯写进显示缓存。
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

    /// 写通知屏「读到哪了」。
    pub fn set_notify_seen(asset_root: &Path, id: ProjectId, at: i64) -> Result<(), RepoFileError> {
        let mut entries = Self::load(asset_root)?;
        for e in entries.iter_mut() {
            if e.id == id {
                e.notify_seen = Some(at);
                break;
            }
        }
        Self::save(asset_root, &entries)
    }

    /// 读通知屏「读到哪了」。
    pub fn get_notify_seen(asset_root: &Path, id: ProjectId) -> Option<i64> {
        Self::find_by_id(asset_root, id)
            .ok()
            .flatten()
            .and_then(|e| e.notify_seen)
    }
}
