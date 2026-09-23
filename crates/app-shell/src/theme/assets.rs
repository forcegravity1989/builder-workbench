//! 前端资源（全局 CSS 与产品指南 HTML）的运行时加载与热加载。
//!
//! 仓内资源在编译期仍内嵌进二进制（`EMBEDDED_*`），保证磁盘上没有副本也能跑；
//! 运行时优先读磁盘上的同名文件，读到就用磁盘版本。于是改样式、改指南不必重编
//! Rust，存盘后壳自己重载。
//!
//! 目录解析顺序（先命中先用）：
//!   1. `BW_UI_DIR` 环境变量 —— 显式指定，开发时指向仓内目录最方便
//!   2. 可执行文件同级的 `ui/` —— 安装包把这份摊在程序目录，改起来最直观
//!   3. 都没有 —— 全部用内嵌版本，热加载不启用（不起监听线程）
//!
//! 三个文件按名认：`styles.css`、`shell.css`、`guide.html`。缺哪个就用哪个的
//! 内嵌版本，不因为少一个文件整块退回。

use dioxus::prelude::document;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};

/// 编译期内嵌：设计系统 token 与壳样式，运行时拼成一份全局 CSS。
const EMBEDDED_STYLES_CSS: &str = include_str!("../../../../docs/04-design-system/styles.css");
const EMBEDDED_SHELL_CSS: &str = include_str!("../../assets/shell.css");
/// 编译期内嵌：帮助里的产品指南整页 HTML。
const EMBEDDED_GUIDE_HTML: &str = include_str!("../../../../docs/03-guide/v4-产品指南.html");

/// 磁盘上的文件名。改名要同步出包脚本摊的那份（pack/BuildersWorkbench.iss）。
const STYLES_FILE: &str = "styles.css";
const SHELL_FILE: &str = "shell.css";
const GUIDE_FILE: &str = "guide.html";

/// 轮询间隔。热加载是给人改样式看的，半秒够快，也不至于空转烧 CPU。
const POLL: Duration = Duration::from_millis(500);

/// 解析出的资源目录，进程内只算一次。
fn ui_dir() -> Option<&'static Path> {
    static DIR: OnceLock<Option<PathBuf>> = OnceLock::new();
    DIR.get_or_init(resolve_ui_dir).as_deref()
}

fn resolve_ui_dir() -> Option<PathBuf> {
    if let Ok(raw) = std::env::var("BW_UI_DIR") {
        let p = PathBuf::from(&raw);
        if p.is_dir() {
            return Some(p);
        }
        // 显式指定却不可用要出声：静默退回内嵌会让人以为「改了没生效」。
        bw_engine::dlog!(warn, "ui", "[BW_UI] BW_UI_DIR 不是目录，忽略:{raw}");
    }
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
    {
        let p = dir.join("ui");
        if p.is_dir() {
            return Some(p);
        }
    }
    None
}

/// 启动时打一行，说明热加载到底有没有启用、读的是哪个目录。
pub fn log_boot() {
    match ui_dir() {
        Some(d) => bw_engine::dlog!(ok, "ui", "[BW_UI] hot=on dir={}", d.display()),
        None => bw_engine::dlog!(
            ok,
            "ui",
            "[BW_UI] hot=off（没有 BW_UI_DIR，也没有 exe 同级 ui/）"
        ),
    }
}

fn read_or_embedded(dir: &Path, name: &str, embedded: &str) -> String {
    match std::fs::read_to_string(dir.join(name)) {
        // 空文件当没写：一个误触的清空不该把整个界面变成裸 HTML。
        Ok(s) if !s.trim().is_empty() => s,
        Ok(_) => {
            bw_engine::dlog!(warn, "ui", "[BW_UI] {name} 是空的，用内嵌版本");
            embedded.to_string()
        }
        Err(_) => embedded.to_string(),
    }
}

fn read(name: &str, embedded: &str) -> String {
    match ui_dir() {
        Some(d) => read_or_embedded(d, name, embedded),
        None => embedded.to_string(),
    }
}

/// 全局 CSS：设计系统在前、壳样式在后，后者可覆盖前者。
fn global_css() -> String {
    let styles = read(STYLES_FILE, EMBEDDED_STYLES_CSS);
    let shell = read(SHELL_FILE, EMBEDDED_SHELL_CSS);
    format!("{styles}\n{shell}")
}

/// head 里那个装全局 CSS 的 `<style>` 的 id。
const CSS_ELEMENT_ID: &str = "bw-ui-css";

/// 把当前 CSS 灌进 head 里固定 id 的 `<style>`，没有就建一个。
///
/// 这里不用 `document::Style`：它靠 `use_hook` 只在首渲染插一次，之后改 props
/// 不再反映到 head（dioxus-document 0.7.9 的文档原话），而热加载要的正是
/// 「之后还能改」。自己管一个元素，每次重载原地换内容。
pub fn apply_css() {
    let css = serde_json::to_string(&global_css()).unwrap_or_else(|_| "\"\"".to_string());
    let id = serde_json::to_string(CSS_ELEMENT_ID).unwrap_or_else(|_| "\"\"".to_string());
    // CSS 走 JSON 字面量嵌进脚本，引号、反斜杠、换行都由序列化器负责转义。
    let js = format!(
        r#"(function () {{
  var el = document.getElementById({id});
  if (!el) {{
    el = document.createElement('style');
    el.id = {id};
    document.head.appendChild(el);
  }}
  el.textContent = {css};
}})();"#
    );
    document::eval(&js);
}

/// 产品指南整页 HTML。
pub fn guide_html() -> String {
    read(GUIDE_FILE, EMBEDDED_GUIDE_HTML)
}

/// 三个文件的大小与修改时间。任一项变了就算这轮有改动。
fn snapshot(dir: &Path) -> Vec<(SystemTime, u64)> {
    [STYLES_FILE, SHELL_FILE, GUIDE_FILE]
        .iter()
        .map(|name| {
            let md = std::fs::metadata(dir.join(name)).ok();
            let mtime = md.as_ref().and_then(|m| m.modified().ok());
            let len = md.as_ref().map(|m| m.len()).unwrap_or(0);
            // 文件不存在时 mtime 取 UNIX_EPOCH，和「刚被删掉」区分得开。
            (mtime.unwrap_or(SystemTime::UNIX_EPOCH), len)
        })
        .collect()
}

/// 起一个轮询任务，资源有变就往通道里发一次。没有资源目录时返回 `None`，
/// 调用方据此不起监听——热加载关着的时候不该有后台线程。
pub fn watch() -> Option<tokio::sync::mpsc::Receiver<()>> {
    let dir = ui_dir()?.to_path_buf();
    let (tx, rx) = tokio::sync::mpsc::channel(4);
    tokio::spawn(async move {
        let mut last = snapshot(&dir);
        loop {
            tokio::time::sleep(POLL).await;
            let now = snapshot(&dir);
            if now != last {
                last = now;
                bw_engine::dlog!(ok, "ui", "[BW_UI] 资源有变，重载");
                // 接收端没了（窗口关了）就收工，别空转。
                if tx.send(()).await.is_err() {
                    break;
                }
            }
        }
    });
    Some(rx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_css_is_not_empty() {
        // 内嵌兜底是最后一道保险，空了说明 include_str! 指错了文件。
        assert!(EMBEDDED_STYLES_CSS.contains("--color-"));
        assert!(EMBEDDED_SHELL_CSS.contains(".app-root"));
        assert!(EMBEDDED_GUIDE_HTML.contains("data-screen="));
    }

    #[test]
    fn missing_file_falls_back_to_embedded() {
        let dir = std::env::temp_dir().join("bw-ui-assets-test-missing");
        let _ = std::fs::create_dir_all(&dir);
        assert_eq!(
            read_or_embedded(&dir, "nope.css", "fallback"),
            "fallback".to_string()
        );
    }

    #[test]
    fn blank_file_falls_back_to_embedded() {
        let dir = std::env::temp_dir().join("bw-ui-assets-test-blank");
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("blank.css"), "   \n").unwrap();
        assert_eq!(
            read_or_embedded(&dir, "blank.css", "fallback"),
            "fallback".to_string()
        );
    }

    #[test]
    fn disk_file_wins_over_embedded() {
        let dir = std::env::temp_dir().join("bw-ui-assets-test-hit");
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("hit.css"), ".x{color:red}").unwrap();
        assert_eq!(
            read_or_embedded(&dir, "hit.css", "fallback"),
            ".x{color:red}".to_string()
        );
    }

    #[test]
    fn snapshot_notices_content_change() {
        let dir = std::env::temp_dir().join("bw-ui-assets-test-watch");
        let _ = std::fs::create_dir_all(&dir);
        let before = snapshot(&dir);
        std::fs::write(dir.join(SHELL_FILE), ".app-root{color:red}").unwrap();
        assert_ne!(before, snapshot(&dir));
    }
}
