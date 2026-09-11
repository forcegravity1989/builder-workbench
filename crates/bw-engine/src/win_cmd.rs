//! Windows GUI 应用启动控制台子进程时隐藏窗口；.cmd 通过 cmd.exe 执行。

use std::ffi::OsStr;
use std::path::Path;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn is_windows_script(program: impl AsRef<OsStr>) -> bool {
    Path::new(program.as_ref())
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("cmd") || e.eq_ignore_ascii_case("bat"))
}

pub fn tokio_cmd(program: impl AsRef<OsStr>) -> tokio::process::Command {
    #[cfg(windows)]
    {
        let mut cmd = if is_windows_script(&program) {
            let mut cmd = tokio::process::Command::new("cmd.exe");
            cmd.arg("/c");
            cmd.arg(program);
            cmd
        } else {
            tokio::process::Command::new(program)
        };
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        tokio::process::Command::new(program)
    }
}

pub fn std_cmd(program: impl AsRef<OsStr>) -> std::process::Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = if is_windows_script(&program) {
            let mut cmd = std::process::Command::new("cmd.exe");
            cmd.arg("/c");
            cmd.arg(program);
            cmd
        } else {
            std::process::Command::new(program)
        };
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(program)
    }
}

pub fn stderr_text(o: &std::process::Output) -> String {
    String::from_utf8_lossy(&o.stderr).trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_ext_is_cmd_or_bat() {
        assert!(is_windows_script(
            r"C:\Users\x\AppData\Roaming\npm\claude.cmd"
        ));
        assert!(is_windows_script("run.BAT"));
        assert!(!is_windows_script(
            r"C:\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe"
        ));
        assert!(!is_windows_script("claude"));
    }
}
