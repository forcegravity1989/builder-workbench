//! Open Design 本机网页内嵌类工具的探活:命名管道(Windows)/ unix socket
//! (macOS·Linux)发 `{"type":"status"}` 握手,回包取 `result.url`(loopback http,
//! 端口每次启动随机,绝不写死)。也支持 `BW_OPEN_DESIGN_URL` env 直填。
//!
//! 不进 Executor 体系——这是本机资源发现,不是 agent 执行器。
//!
//! V3 那边有一份同步版(std 线程 + recv_timeout,
//! 因为命名管道 `CreateFile` 能无超时阻塞)。这份是 V4 的:`spawn_blocking`
//! 跑阻塞的管道 open+读写,外面套 `tokio::time::timeout`(400ms),不卡 async
//! 运行时。`#![forbid(unsafe_code)]` 是 bw-engine 的规矩,Windows 命名管道用
//! `std::fs::OpenOptions` + `share_mode` 打开,不走 unsafe。

use std::io::{Read, Write};
use std::time::Duration;

const QUERY_TIMEOUT: Duration = Duration::from_millis(400);
const STATUS_PAYLOAD: &[u8] = b"{\"type\":\"status\"}\n";

/// 探活并取 Open Design 的 loopback http url。探不到返 `None`(不 panic、不报错)。
/// 顺序:`BW_OPEN_DESIGN_URL` env(经 [`looks_loopback_http`] 校验)→ 管道/socket 握手。
pub async fn discover_web_url() -> Option<String> {
    if let Ok(raw) = std::env::var("BW_OPEN_DESIGN_URL") {
        let trimmed = raw.trim();
        if looks_loopback_http(trimmed) {
            return Some(trimmed.trim_end_matches('/').to_string());
        }
    }
    // 命名管道 `CreateFile` / `UnixStream::connect` 都可能无超时阻塞,
    // 丢到阻塞池里跑,外面套 400ms 硬超时;超时/打不开/读不出/解析失败都跳过。
    let handle = tokio::task::spawn_blocking(query_web_sidecar);
    tokio::time::timeout(QUERY_TIMEOUT, handle)
        .await
        .ok()?
        .ok()
        .flatten()
}

fn query_web_sidecar() -> Option<String> {
    for path in sidecar_status_paths() {
        if let Some(url) = query_status_path(&path) {
            return Some(url);
        }
    }
    None
}

fn sidecar_status_paths() -> Vec<String> {
    #[cfg(windows)]
    {
        // `\\.\pipe\open-design-{namespace}-web` —— 打包 Windows 用
        // `release-stable-win`(已实测与本机 OD 0.16.1 一致)。留两条兜底。
        [
            r"\\.\pipe\open-design-release-stable-win-web",
            r"\\.\pipe\open-design-default-web",
            r"\\.\pipe\open-design-stable-web",
        ]
        .into_iter()
        .map(str::to_string)
        .collect()
    }
    #[cfg(not(windows))]
    {
        // 打包 Mac:`release-stable`;打包 Linux:`release-stable-linux`。
        [
            "/tmp/open-design/ipc/release-stable/web.sock",
            "/tmp/open-design/ipc/release-stable-linux/web.sock",
            "/tmp/open-design/ipc/default/web.sock",
        ]
        .into_iter()
        .map(str::to_string)
        .collect()
    }
}

fn query_status_path(path: &str) -> Option<String> {
    let mut stream = open_duplex(path)?;
    stream.write_all(STATUS_PAYLOAD).ok()?;
    let _ = stream.flush();
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).ok()?;
    parse_status_url(&buf)
}

#[cfg(windows)]
fn open_duplex(path: &str) -> Option<std::fs::File> {
    use std::fs::OpenOptions;
    use std::os::windows::fs::OpenOptionsExt;
    const FILE_SHARE_READ: u32 = 0x1;
    const FILE_SHARE_WRITE: u32 = 0x2;
    OpenOptions::new()
        .read(true)
        .write(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .open(path)
        .ok()
}

#[cfg(not(windows))]
fn open_duplex(path: &str) -> Option<std::os::unix::net::UnixStream> {
    std::os::unix::net::UnixStream::connect(path)
        .ok()
        .inspect(|s| {
            let _ = s.set_read_timeout(Some(QUERY_TIMEOUT));
            let _ = s.set_write_timeout(Some(QUERY_TIMEOUT));
        })
}

fn parse_status_url(bytes: &[u8]) -> Option<String> {
    let v: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    if v.get("ok").and_then(|x| x.as_bool()) != Some(true) {
        return None;
    }
    let url = v
        .get("result")
        .and_then(|r| r.get("url"))
        .and_then(|u| u.as_str())?
        .trim();
    if looks_loopback_http(url) {
        Some(url.trim_end_matches('/').to_string())
    } else {
        None
    }
}

/// `http://127.0.0.1:<port>` 或 `http://localhost:<port>` 才放行。拒绝
/// userinfo(`@`)、缺端口、以及非 loopback 的 host。
pub(crate) fn looks_loopback_http(url: &str) -> bool {
    let rest = match url.trim().strip_prefix("http://") {
        Some(r) => r,
        None => return false,
    };
    // `@` 只禁在 authority(第一个 `/` 或 `#` 之前)。pairing hash 里可能有 `@`,
    // 整段扫描会把合法的 Orca web URL 误拒。
    let authority = rest.split(['/', '#']).next().unwrap_or("");
    if authority.contains('@') {
        return false;
    }
    let hostport = rest.split('/').next().unwrap_or("");
    let Some((host, port)) = hostport.rsplit_once(':') else {
        return false;
    };
    if port.is_empty() || !port.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    host == "127.0.0.1" || host.eq_ignore_ascii_case("localhost")
}

/// 把 `http://127.0.0.1:<port>` 拆成 (host, port)。非 loopback / 缺端口返 None。
fn loopback_host_port(url: &str) -> Option<(&str, u16)> {
    let rest = url.trim().strip_prefix("http://")?;
    if rest.contains('@') {
        return None;
    }
    let hostport = rest.split('/').next().unwrap_or("");
    let (host, port) = hostport.rsplit_once(':')?;
    if !(host == "127.0.0.1" || host.eq_ignore_ascii_case("localhost")) {
        return None;
    }
    Some((host, port.parse::<u16>().ok()?))
}

/// 给 OD 起一个 run,把 buddy 的系统提示词灌进去——让 OD 内部 spawn 的 AI
/// 知道自己处在 buddy 的管理下(身份 + 四铁律 + 本活挂的技能/references 指针)。
///
/// **OD 是独立的**:它有自己的 skill 体系(`skillId`,162 份),和 buddy 的
/// 技能文件(`--add-dir` 挂路径)不兼容——所以只灌 `systemPrompt` + `prompt`,
/// 不灌技能文件。技能指针/references 在 systemPrompt 文本里,OD 的 AI 能不能
/// 真读到那个路径是 best-effort(它在 OD 的进程上下文里,未必有 buddy 资产目录
/// 的访问权);读不到也不阻断,OD 仍按它自己的能力干。
///
/// 探不到 url、连不上、POST 失败一律返 `None`——不阻断开工(OD 仍内嵌在会话屏,
/// 只是没有灌提示词这步),如实降级。返回 runId 字符串(若 OD 回了)。
pub async fn start_run(base_url: &str, prompt: &str, system_prompt: &str) -> Option<String> {
    let (host, port) = loopback_host_port(base_url)?;
    let body = serde_json::json!({ "prompt": prompt, "systemPrompt": system_prompt }).to_string();
    let host = host.to_string();
    let req = format!(
        "POST /api/runs HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\n\
         Content-Length: {len}\r\nConnection: close\r\n\r\n{body}",
        len = body.len()
    );
    tokio::task::spawn_blocking(move || {
        use std::io::{Read, Write};
        let mut s = std::net::TcpStream::connect((host.as_str(), port)).ok()?;
        s.set_write_timeout(Some(QUERY_TIMEOUT)).ok()?;
        s.set_read_timeout(Some(QUERY_TIMEOUT)).ok()?;
        s.write_all(req.as_bytes()).ok()?;
        // 读完响应——只取 status line 确认发出去了;body 里的 runId 不强解析
        // (OD 的响应结构没定稿,best-effort)。
        let mut buf = Vec::with_capacity(256);
        s.read_to_end(&mut buf).ok()?;
        let text = String::from_utf8_lossy(&buf);
        // HTTP/1.1 200 才算 OD 收了;其余(连不上/4xx/5xx)如实 None。
        if text.starts_with("HTTP/1.1 2") {
            Some(text.split('\r').next().unwrap_or("").to_string())
        } else {
            None
        }
    })
    .await
    .ok()?
}

#[cfg(test)]
mod tests {
    use super::looks_loopback_http;

    #[test]
    fn pairing_hash_is_still_loopback() {
        assert!(looks_loopback_http(
            "http://127.0.0.1:6768/web-index.html#pairing=orca://pair?code=abc"
        ));
        assert!(looks_loopback_http(
            "http://127.0.0.1:6768/web-index.html#pairing=orca://pair?code=a@b"
        ));
        assert!(!looks_loopback_http(
            "http://user@127.0.0.1:6768/web-index.html"
        ));
        assert!(!looks_loopback_http(
            "http://example.com:6768/web-index.html"
        ));
    }
}
