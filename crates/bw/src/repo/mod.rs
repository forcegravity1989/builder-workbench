pub mod issue_policy_file;
pub mod managed_file;
pub mod metrics_file;
pub mod project_file;
pub mod readings_file;
pub mod standard_file;

use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum RepoFileError {
    #[error("读写 {path} 失败:{source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("解析 {path} 失败:{source}")]
    Parse {
        path: String,
        #[source]
        source: toml::de::Error,
    },
    #[error("{path} 格式不对:{why}")]
    Shape { path: String, why: String },
}

pub type Result<T> = std::result::Result<T, RepoFileError>;

pub(crate) fn read_to_string(workspace: &Path, rel: &str) -> Result<Option<String>> {
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

pub(crate) fn write_file(workspace: &Path, rel: &str, body: &str) -> Result<PathBuf> {
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

pub(crate) fn parse_toml<T: serde::de::DeserializeOwned>(rel: &str, raw: &str) -> Result<T> {
    toml::from_str(raw).map_err(|e| RepoFileError::Parse {
        path: rel.to_string(),
        source: e,
    })
}

pub fn toml_string(v: &str) -> String {
    let mut out = String::with_capacity(v.len() + 2);
    out.push('"');
    for c in v.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 || c as u32 == 0x7f => {
                out.push_str(&format!("\\u{:04X}", c as u32))
            }
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
