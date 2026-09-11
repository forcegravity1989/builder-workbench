// 打包占用命令队列，停止操作通过共享控制器直接中断。

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

pub struct PackCtl {
    cancel: AtomicBool,
    running: AtomicBool,
    child_pid: Mutex<Option<u32>>,
    workdir: Mutex<Option<PathBuf>>,
    version: Mutex<Option<String>>,
}

impl Default for PackCtl {
    fn default() -> Self {
        Self::new()
    }
}

impl PackCtl {
    pub fn new() -> Self {
        Self {
            cancel: AtomicBool::new(false),
            running: AtomicBool::new(false),
            child_pid: Mutex::new(None),
            workdir: Mutex::new(None),
            version: Mutex::new(None),
        }
    }

    pub fn begin(&self, workdir: PathBuf, version: String) {
        self.cancel.store(false, Ordering::SeqCst);
        self.running.store(true, Ordering::SeqCst);
        *lock(&self.child_pid) = None;
        *lock(&self.workdir) = Some(workdir);
        *lock(&self.version) = Some(version);
    }

    pub fn set_child(&self, pid: u32) {
        *lock(&self.child_pid) = Some(pid);
    }

    pub fn clear_child(&self) {
        *lock(&self.child_pid) = None;
    }

    pub fn finish(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.clear_child();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    pub fn in_flight(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn version(&self) -> Option<String> {
        lock(&self.version).clone()
    }

    pub fn abort(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Some(pid) = lock(&self.child_pid).take() {
            kill_process_tree(pid);
        }
        let workdir = lock(&self.workdir).clone();
        let version = lock(&self.version).clone();
        if let (Some(w), Some(v)) = (workdir, version) {
            cleanup_pack_intermediates(&w, &v);
        }
        self.running.store(false, Ordering::SeqCst);
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn cleanup_pack_intermediates(workdir: &Path, version: &str) {
    if version.is_empty()
        || version.contains("..")
        || version.contains('/')
        || version.contains('\\')
    {
        return;
    }
    let _ = std::fs::remove_dir_all(
        workdir
            .join(".bw")
            .join("release")
            .join("out")
            .join(version),
    );
    let tmp = std::env::temp_dir();
    let _ = std::fs::remove_dir_all(tmp.join(format!("bw-pack-verify-{version}")));
    let _ = std::fs::remove_file(tmp.join(format!("bw-pack-verify-{version}-setup.log")));
    let _ = std::fs::remove_dir_all(tmp.join(format!("bw-e2e-{version}")));
    let _ = std::fs::remove_file(tmp.join(format!("bw-e2e-{version}-setup.log")));
}

fn kill_process_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = bw_engine::win_cmd::std_cmd("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_removes_version_out_and_temp() {
        let root = std::env::temp_dir().join(format!("bw-pack-ctl-{}", std::process::id()));
        let version = "v0-test";
        let out = root.join(".bw").join("release").join("out").join(version);
        std::fs::create_dir_all(&out).unwrap();
        std::fs::write(out.join("x.exe"), b"x").unwrap();
        let tmp = std::env::temp_dir().join(format!("bw-pack-verify-{version}"));
        std::fs::create_dir_all(&tmp).unwrap();
        cleanup_pack_intermediates(&root, version);
        assert!(!out.exists());
        assert!(!tmp.exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn cleanup_skips_unsafe_version() {
        let root = std::env::temp_dir().join(format!("bw-pack-ctl-skip-{}", std::process::id()));
        let sneaky = root.join(".bw").join("release").join("out").join("keep");
        std::fs::create_dir_all(&sneaky).unwrap();
        cleanup_pack_intermediates(&root, "../keep");
        assert!(sneaky.exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn abort_sets_cancelled_and_clears_running() {
        let ctl = PackCtl::new();
        ctl.begin(std::env::temp_dir(), "v0.1".into());
        assert!(ctl.in_flight());
        ctl.abort();
        assert!(ctl.is_cancelled());
        assert!(!ctl.in_flight());
    }
}
