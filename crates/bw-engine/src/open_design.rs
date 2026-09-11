use std::io::{Read, Write};
use std::time::Duration;

const QUERY_TIMEOUT: Duration = Duration::from_millis(400);
const STATUS_PAYLOAD: &[u8] = b"{\"type\":\"status\"}\n";

/// 优先使用环境变量，否则查询本机管道或 socket；仅接受 loopback URL。
pub async fn discover_web_url() -> Option<String> {
    if let Ok(raw) = std::env::var("BW_OPEN_DESIGN_URL") {
        let trimmed = raw.trim();
        if looks_loopback_http(trimmed) {
            return Some(trimmed.trim_end_matches('/').to_string());
        }
    }
    // 管道连接可能阻塞，放入阻塞线程池并限制等待时间。
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
        // 与 Open Design 安装包的管道 namespace 一致。
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

/// 仅允许带端口的本机 HTTP 地址，拒绝 authority 中的用户凭证。
pub(crate) fn looks_loopback_http(url: &str) -> bool {
    let rest = match url.trim().strip_prefix("http://") {
        Some(r) => r,
        None => return false,
    };
    // 只检查 authority；配对参数中的 @ 不属于用户凭证。
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
        let mut buf = Vec::with_capacity(256);
        s.read_to_end(&mut buf).ok()?;
        let text = String::from_utf8_lossy(&buf);
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
