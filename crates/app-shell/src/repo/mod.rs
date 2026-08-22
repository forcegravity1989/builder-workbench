//! app-shell 的仓文件解析器:周计划与发版记录。
//!
//! 这两个解析器从 `bw-v4` 整份搬来(刀5:bw-v4 内核不再读写它们,只剩 UI
//! 显示要用)。它们解析的是仓内的真实正本(`.bw/plan/*.md` / `.bw/releases.md`),
//! 不是本机缓存。共用的基础函数(`read_to_string` / `write_file` /
//! `RepoFileError`)也复制了一份(bw-v4 那边是 `pub(crate)`,app-shell 不在
//! 同一个 crate)。
//!
//! **写侧函数(render / append_row / write / replace_table 等)在这里是死代码**
//! —— app-shell 只读不写,写正本是 kernel(agent 会话 / backfill)的事。
//! 保留它们是因为这份文件是从 bw-v4 原样搬来的,删写侧只读侧也可能跟着坏;
//! 等 V4 稳定后再按需清理。模块级 `#[allow(dead_code)]` 压住这批警告。

#![allow(dead_code)]

pub mod release_file;
pub mod week_plan_file;

use std::path::{Path, PathBuf};

/// 仓文件读写的统一错误(与 `bw_v4::repo::RepoFileError` 同构)。
pub use bw_v4::repo::RepoFileError;

pub type Result<T> = std::result::Result<T, RepoFileError>;

/// 读一个仓内文件;不存在返回 `Ok(None)`。
pub fn read_to_string(workspace: &Path, rel: &str) -> Result<Option<String>> {
    let path = workspace.join(rel);
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(RepoFileError::Io {
            path: rel.to_string(),
            source: e,
        }),
    }
}

/// 往仓里写一个文件,父目录不存在就建。
pub fn write_file(workspace: &Path, rel: &str, body: &str) -> Result<PathBuf> {
    let path = workspace.join(rel);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| RepoFileError::Io {
            path: rel.to_string(),
            source: e,
        })?;
    }
    std::fs::write(&path, body).map_err(|e| RepoFileError::Io {
        path: rel.to_string(),
        source: e,
    })?;
    Ok(path)
}
