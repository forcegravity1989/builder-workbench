//! 本地持久化:V4 不再用 SQLite,全部落在 `asset_root` 下的文件里。
//!
//! 三件东西:
//!
//! - [`registry`] —— `asset_root/projects.toml`,buddy 纳管的项目清单。每条
//!   记着项目的定位字段(slug / workspace_path / provider / remote_*)、显示
//!   缓存(健康灯)与本机设置(`cron_enabled`)。替代旧的 `project` 表。
//! - [`settings`] —— `asset_root/settings.toml`,全局本机设置。今天只有
//!   `workspaces_root`(替代 `app_meta` 的 `workspaces_root` 键)。
//! - [`sessions`] —— `asset_root/sessions/<slug>/<iid>.jsonl`,append-only
//!   会话记录。每行一条 JSON,按 issue 号路由。替代旧的 `claude_conversation`
//!   表。
//!
//! **仓是正本**:这里的东西全是本机过程数据与显示缓存,不在任何一个用户项目
//! 的仓里。删掉 `asset_root` 不会丢任何劳动成果 —— 项目还在远端,仓还在硬盘上,
//! 重新接入就回来了。

pub mod registry;
pub mod sessions;
pub mod settings;

pub use registry::{ProjectEntry, ProjectRegistry};
pub use sessions::SessionStore;
pub use settings::Settings;
