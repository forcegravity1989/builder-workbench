use std::path::{Path, PathBuf};

pub fn which_on_path(exe: &str) -> Option<String> {
    let path = std::env::var_os("PATH")?;
    let names = exe_file_names(exe);
    for dir in std::env::split_paths(&path) {
        for name in &names {
            let cand = dir.join(name);
            if cand.is_file() {
                return Some(cand.display().to_string());
            }
        }
    }
    None
}

#[cfg(windows)]
fn exe_file_names(exe: &str) -> Vec<String> {
    let raw = std::env::var("PATHEXT").unwrap_or_default();
    let raw = if raw.trim().is_empty() {
        ".COM;.EXE;.BAT;.CMD".to_string()
    } else {
        raw
    };
    let exts: Vec<&str> = raw
        .split(';')
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .collect();
    let upper = exe.to_ascii_uppercase();
    if exts
        .iter()
        .any(|e| upper.len() > e.len() && upper.ends_with(&e.to_ascii_uppercase()))
    {
        return vec![exe.to_string()];
    }
    let mut names: Vec<String> = exts.iter().map(|e| format!("{exe}{e}")).collect();
    names.push(exe.to_string());
    names
}

#[cfg(not(windows))]
fn exe_file_names(exe: &str) -> Vec<String> {
    vec![exe.to_string()]
}

/// 候选路径需包含 PATH，支持安装在自定义位置的 CLI。
pub fn claude_binary_candidates(explicit: Option<&str>) -> Vec<String> {
    let mut out = Vec::new();
    push_unique(&mut out, explicit.map(str::trim).filter(|s| !s.is_empty()));
    if let Ok(env) = std::env::var("BW_CLAUDE_BIN") {
        push_unique(&mut out, Some(env.trim()).filter(|s| !s.is_empty()));
    }
    if let Some(p) = npm_claude_exe() {
        push_owned(&mut out, p.to_string_lossy().into_owned());
    }
    if let Some(p) = npm_claude_cmd() {
        push_owned(&mut out, p.to_string_lossy().into_owned());
    }
    push_unique(&mut out, which_on_path("claude").as_deref());
    out
}

/// First candidate that is a real file. `None` → caller falls back to `"claude"`.
pub fn resolve_claude_binary(explicit: Option<&str>) -> Option<String> {
    claude_binary_candidates(explicit)
        .into_iter()
        .find(|c| Path::new(c).is_file())
}

fn npm_root() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|a| a.join("npm"))
}

fn npm_claude_exe() -> Option<PathBuf> {
    Some(
        npm_root()?
            .join("node_modules")
            .join("@anthropic-ai")
            .join("claude-code")
            .join("bin")
            .join("claude.exe"),
    )
}

fn npm_claude_cmd() -> Option<PathBuf> {
    Some(npm_root()?.join("claude.cmd"))
}

fn push_unique(out: &mut Vec<String>, value: Option<&str>) {
    if let Some(v) = value {
        push_owned(out, v.to_string());
    }
}

fn push_owned(out: &mut Vec<String>, value: String) {
    if !out.iter().any(|x| x == &value) {
        out.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_put_explicit_first() {
        let got = claude_binary_candidates(Some(r"D:\tools\claude.exe"));
        assert_eq!(
            got.first().map(String::as_str),
            Some(r"D:\tools\claude.exe")
        );
    }

    #[test]
    fn candidates_skip_blank_explicit() {
        let got = claude_binary_candidates(Some("   "));
        assert!(got.iter().all(|c| !c.trim().is_empty()));
    }
}
