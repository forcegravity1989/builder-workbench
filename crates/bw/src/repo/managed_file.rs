//! `.bw/state/managed.toml` —— 哪些文件是 buddy 铺下去的、什么版本、铺那一刻的内容
//! 指纹。规范对账的唯一权威记录。
//!
//! 为什么是一份清单而不是给每个被铺的文件配一个同名旁路文件:铺一次底就在
//! 仓里撒一地隐藏文件太脏。
//!
//! 对账判定:清单里没有这条、或有记录但磁盘没这个文件 → 缺;磁盘指纹与记录
//! 一致但记录的版本比 buddy 自带的旧 → 过期;磁盘指纹与记录不一致 → 人改过
//! (不看版本号);其余 → 一致。**人改过的一律不覆盖,只提示差异**。

use super::{parse_toml, read_to_string, write_file, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

pub const REL_PATH: &str = ".bw/state/managed.toml";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ManagedEntry {
    pub path: String,
    pub version: String,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ManagedFile {
    #[serde(default, rename = "file")]
    pub files: Vec<ManagedEntry>,
}

impl ManagedFile {
    pub fn entry(&self, path: &str) -> Option<&ManagedEntry> {
        self.files.iter().find(|f| f.path == path)
    }

    /// 铺底/升级时追加或更新一条。
    pub fn upsert(&mut self, entry: ManagedEntry) {
        match self.files.iter_mut().find(|f| f.path == entry.path) {
            Some(slot) => *slot = entry,
            None => self.files.push(entry),
        }
    }
}

/// 对账的四种结论。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Reconcile {
    /// 该有的件不在(没记录,或记录了但磁盘上没有)。
    Missing,
    /// 内容还是 buddy 铺的原样,但铺的时候用的是旧版规范。
    Stale,
    /// 人改过。不覆盖,只提示差异。
    HumanEdited,
    UpToDate,
}

/// 一个文件当前算什么状态。`disk` 为 `None` 表示磁盘上没有这个文件。
pub fn reconcile(
    entry: Option<&ManagedEntry>,
    disk: Option<&[u8]>,
    current_version: &str,
) -> Reconcile {
    let (Some(entry), Some(disk)) = (entry, disk) else {
        return Reconcile::Missing;
    };
    if fingerprint(disk) != entry.fingerprint {
        return Reconcile::HumanEdited;
    }
    if entry.version != current_version {
        return Reconcile::Stale;
    }
    Reconcile::UpToDate
}

/// `sha256:<64 位 hex>`。只在铺底/升级那一刻算一次。
pub fn fingerprint(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

/// 名片上「规范」那一格要显示的东西。从这份清单现算,不存第二份。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct LedgerSummary {
    /// 清单里**最低**的那个版本(最高说的是「最近铺过什么」,不是「还停在
    /// 哪一版」)。空 = 清单不存在或没有记录。
    pub version: String,
    /// 清单里登记着几份。
    pub managed: usize,
    /// 记录还在、磁盘上文件没了。
    pub missing: usize,
    /// 内容与记录对不上 = 人改过。
    pub human_edited: usize,
}

/// 现读现算名片摘要。只认清单里登记过的条目——`project.toml` 与 `metrics.toml`
/// 从来不进这份清单,名片也就不把它们算进「在管」。
pub fn summarize(workspace: &Path) -> LedgerSummary {
    let Ok(Some(file)) = read(workspace) else {
        return LedgerSummary::default();
    };
    let mut out = LedgerSummary {
        managed: file.files.len(),
        ..Default::default()
    };
    for e in &file.files {
        match std::fs::read(workspace.join(&e.path)) {
            Err(_) => out.missing += 1,
            Ok(disk) if fingerprint(&disk) != e.fingerprint => out.human_edited += 1,
            Ok(_) => {}
        }
        if out.version.is_empty() || version_lt(&e.version, &out.version) {
            out.version = e.version.clone();
        }
    }
    out
}

/// `a` 是不是比 `b` 低。按点分数字段比,比不出来(不是数字)就退回字符串比 ——
/// 退回这条真会用上:`5.10` 和 `5.8` 直接按字符串比会得出 `5.10` 更低,而实际
/// 这个仓的版本走的就是 5.8 → 5.9 → 5.10。
fn version_lt(a: &str, b: &str) -> bool {
    let nums = |v: &str| -> Option<Vec<u32>> { v.split('.').map(|p| p.parse().ok()).collect() };
    match (nums(a), nums(b)) {
        (Some(x), Some(y)) => x < y,
        _ => a < b,
    }
}

pub fn parse(raw: &str) -> Result<ManagedFile> {
    parse_toml(REL_PATH, raw)
}

pub fn read(workspace: &Path) -> Result<Option<ManagedFile>> {
    match read_to_string(workspace, REL_PATH)? {
        None => Ok(None),
        Some(raw) => parse(&raw).map(Some),
    }
}

pub fn write(workspace: &Path, f: &ManagedFile) -> Result<String> {
    let mut s = String::from(
        "# 铺底/升级时写:哪些文件是 buddy 管的、什么版本、铺下去那一刻的内容\n\
         # 指纹。下次升级前先比对指纹:变了 = 人手改过,不覆盖只提示差异。\n",
    );
    for e in &f.files {
        s.push_str("\n[[file]]\n");
        s.push_str(&format!("path        = {}\n", super::toml_string(&e.path)));
        s.push_str(&format!(
            "version     = {}\n",
            super::toml_string(&e.version)
        ));
        s.push_str(&format!(
            "fingerprint = {}\n",
            super::toml_string(&e.fingerprint)
        ));
    }
    write_file(workspace, REL_PATH, &s)?;
    Ok(s)
}
