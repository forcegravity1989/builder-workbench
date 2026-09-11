//! 本机数据使用 TOML/JSONL 文件，保存在 asset_root 下。

pub mod registry;
pub mod sessions;
pub mod settings;

pub use registry::{ProjectEntry, ProjectRegistry};
pub use sessions::SessionStore;
pub use settings::Settings;
