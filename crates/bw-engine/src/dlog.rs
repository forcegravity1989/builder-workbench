//! 诊断日志格式：[时间] [模块] [文件] [行] [级别] 正文。不能记录凭证或提示词。

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use time::{OffsetDateTime, UtcOffset};

static STATE: OnceLock<Mutex<LogState>> = OnceLock::new();

struct LogState {
    path: PathBuf,
    offset: UtcOffset,
}

pub fn log_path() -> PathBuf {
    ensure_state()
        .lock()
        .map(|s| s.path.clone())
        .unwrap_or_else(|_| resolve_path())
}

pub fn init() {
    let path = {
        let state = ensure_state();
        state
            .lock()
            .map(|s| s.path.clone())
            .unwrap_or_else(|_| resolve_path())
    };
    write(
        "ok",
        "boot",
        file!(),
        line!(),
        &format!(
            "对照日志 path={} via={} pid={}",
            path.display(),
            if launched_via_cargo() { "cargo" } else { "exe" },
            std::process::id()
        ),
    );
}

/// 写一行。`kind` 只认 `ok` / `err` / `warn`。
pub fn write(kind: &str, module: &str, file: &str, line: u32, msg: &str) {
    let file = file_name(file);
    let kind = match kind {
        "err" | "warn" => kind,
        _ => "ok",
    };
    let offset = ensure_state()
        .lock()
        .map(|s| s.offset)
        .unwrap_or(UtcOffset::UTC);
    let line_txt = format!(
        "[{}] [{module}] [{file}] [{line}] [{kind}] {msg}",
        timestamp(offset)
    );
    eprintln!("{line_txt}");
    let path = log_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{line_txt}");
    }
}

fn ensure_state() -> &'static Mutex<LogState> {
    STATE.get_or_init(|| {
        Mutex::new(LogState {
            path: resolve_path(),
            offset: UtcOffset::current_local_offset().unwrap_or(UtcOffset::UTC),
        })
    })
}

fn resolve_path() -> PathBuf {
    if let Ok(p) = std::env::var("BW_LOG") {
        let p = p.trim();
        if !p.is_empty() {
            return PathBuf::from(p);
        }
    }
    if launched_via_cargo() {
        return cwd().join("bw.log");
    }
    exe_project_dir().join("bw.log")
}

fn launched_via_cargo() -> bool {
    std::env::var_os("CARGO").is_some()
}

fn cwd() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn exe_project_dir() -> PathBuf {
    let Ok(exe) = std::env::current_exe() else {
        return cwd();
    };
    if let Some(root) = find_cargo_root(&exe) {
        return root;
    }
    exe.parent().map(|p| p.to_path_buf()).unwrap_or_else(cwd)
}

fn find_cargo_root(start: &Path) -> Option<PathBuf> {
    let mut dir = start.parent()?;
    for _ in 0..8 {
        if dir.join("Cargo.toml").is_file() {
            return Some(dir.to_path_buf());
        }
        dir = dir.parent()?;
    }
    None
}

fn file_name(file: &str) -> &str {
    file.rsplit(['/', '\\']).next().unwrap_or(file)
}

fn timestamp(offset: UtcOffset) -> String {
    let now = OffsetDateTime::now_utc().to_offset(offset);
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.millisecond()
    )
}

#[macro_export]
macro_rules! dlog {
    (ok, $module:expr, $($arg:tt)*) => {
        $crate::dlog::write("ok", $module, file!(), line!(), &format!($($arg)*))
    };
    (err, $module:expr, $($arg:tt)*) => {
        $crate::dlog::write("err", $module, file!(), line!(), &format!($($arg)*))
    };
    (warn, $module:expr, $($arg:tt)*) => {
        $crate::dlog::write("warn", $module, file!(), line!(), &format!($($arg)*))
    };
}

#[cfg(test)]
mod tests {
    use super::{file_name, find_cargo_root, launched_via_cargo};
    use std::path::Path;

    #[test]
    fn file_name_strips_crate_path() {
        assert_eq!(file_name("crates/bw-engine/src/orca.rs"), "orca.rs");
        assert_eq!(file_name(r"src\bridge\mod.rs"), "mod.rs");
        assert_eq!(file_name("issue.rs"), "issue.rs");
    }

    #[test]
    fn cargo_root_walks_off_target_debug() {
        let here = Path::new(env!("CARGO_MANIFEST_DIR"));
        let fake_exe = here.join("target").join("debug").join("bw-dev.exe");
        let root = find_cargo_root(&fake_exe).expect("should find workspace Cargo.toml");
        assert!(root.join("Cargo.toml").is_file());
    }

    #[test]
    fn cargo_run_sets_cargo_env() {
        assert!(launched_via_cargo());
    }
}
