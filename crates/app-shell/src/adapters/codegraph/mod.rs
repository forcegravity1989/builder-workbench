use std::path::Path;
use std::time::Duration;
use tokio::process::Command;

const FILES_TIMEOUT: Duration = Duration::from_secs(15);

const INIT_TIMEOUT: Duration = Duration::from_secs(120);

async fn run(mut cmd: Command, timeout: Duration) -> Result<Vec<u8>, String> {
    cmd.kill_on_drop(true);
    let out = match tokio::time::timeout(timeout, cmd.output()).await {
        Err(_) => {
            return Err(format!(
                "codegraph 超时（{} 秒），已停止",
                timeout.as_secs()
            ))
        }
        Ok(Err(e)) => return Err(format!("起 codegraph 子进程失败:{e}")),
        Ok(Ok(o)) => o,
    };
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if err.is_empty() {
            format!("codegraph 退出码 {:?}", out.status.code())
        } else {
            err
        });
    }
    Ok(out.stdout)
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Availability {
    NotInstalled,
    NotIndexed,
    Ready,
}

impl Availability {
    pub fn hint(&self) -> String {
        match self {
            Availability::NotInstalled => format!(
                "本机没装 codegraph。装:npm install --global @colbymchenry/codegraph@{}\n\
                 安装后点击「刷新」。",
                version()
            ),
            Availability::NotIndexed => "代码索引尚未建立，点击「刷新」创建索引。".into(),
            Availability::Ready => String::new(),
        }
    }
}

pub const VERSION_RAW: &str = include_str!("../../../../../scripts/codegraph-version");

pub fn version() -> &'static str {
    VERSION_RAW.trim()
}

/// Windows 的 npm 安装生成 .cmd，查找时需要识别 PATHEXT。
fn program() -> Result<String, String> {
    bw_engine::which_on_path("codegraph").ok_or_else(|| "本机路径里找不到 codegraph".to_string())
}

fn cmd() -> Result<Command, String> {
    Ok(bw_engine::tokio_cmd(program()?))
}

pub fn detect(workspace: &Path) -> Availability {
    if program().is_err() {
        return Availability::NotInstalled;
    }
    if !workspace.join(".codegraph").is_dir() {
        return Availability::NotIndexed;
    }
    Availability::Ready
}

pub async fn init_index(workspace: &Path) -> Result<(), String> {
    let mut c = cmd()?;
    c.args(["init"]).current_dir(workspace);
    run(c, INIT_TIMEOUT).await?;
    if !workspace.join(".codegraph").is_dir() {
        return Err("codegraph init 跑完了,但仓里还是没有 .codegraph/ 目录".into());
    }
    Ok(())
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FileRow {
    pub path: String,
    pub language: String,
    pub node_count: u64,
    pub size: u64,
}

pub async fn big_files(workspace: &Path, top: usize) -> Result<Vec<FileRow>, String> {
    let mut c = cmd()?;
    c.args(["files", "-j"]).current_dir(workspace);
    let stdout = run(c, FILES_TIMEOUT).await?;
    let text = String::from_utf8_lossy(&stdout);
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("codegraph 的输出不是 JSON:{e}"))?;
    // 顶层可能是数组,也可能包一层 `{"files": [...]}`。两种都认,认不出就如实报错。
    let arr = v
        .as_array()
        .or_else(|| v.get("files").and_then(|f| f.as_array()))
        .ok_or_else(|| "codegraph 的输出既不是数组也没有 files 字段".to_string())?;
    let mut rows: Vec<FileRow> = arr
        .iter()
        .map(|e| FileRow {
            path: e
                .get("path")
                .and_then(|p| p.as_str())
                .unwrap_or_default()
                .to_string(),
            language: e
                .get("language")
                .and_then(|p| p.as_str())
                .unwrap_or_default()
                .to_string(),
            node_count: e.get("nodeCount").and_then(|n| n.as_u64()).unwrap_or(0),
            size: e.get("size").and_then(|n| n.as_u64()).unwrap_or(0),
        })
        .collect();
    rows.sort_by_key(|r| std::cmp::Reverse(r.size));
    rows.truncate(top);
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_dot_dir_is_not_indexed_when_cli_present() {
        if program().is_err() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("bw-cg-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        let state = detect(&dir);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(state, Availability::NotIndexed);
    }

    #[test]
    fn not_installed_hint_names_the_package() {
        let h = Availability::NotInstalled.hint();
        assert!(h.contains("@colbymchenry/codegraph@"), "{h}");
        assert!(h.contains(version()), "{h}");
    }
}
