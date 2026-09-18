//! bw 集成测试共享的临时目录工具。

use std::path::{Path, PathBuf};

/// 测试临时目录。Drop 时回收——断言失败（panic 展开）也不把目录留在 temp 里，
/// 所以测试体不再手动 `remove_dir_all`。
pub struct TempDir(PathBuf);

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

impl std::ops::Deref for TempDir {
    type Target = Path;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl AsRef<Path> for TempDir {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

pub fn tempdir(tag: &str) -> TempDir {
    let path = std::env::temp_dir().join(format!("bw-test-{tag}-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&path).unwrap();
    TempDir(path)
}
