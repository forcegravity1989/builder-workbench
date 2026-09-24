//! 本机 Clawd on Desk(桌面宠物)客户端。
//!
//! Workbench 不自建宠物,只把「活的状态」推给本机已装的 Clawd on Desk
//! (rullerzhou-afk/clawd-on-desk)。它给非 agent 应用的唯一接口是「自定义
//! HTTP agent」:人在它的「设置 → Agents」里注册 Workbench 的可执行文件,它按
//! 可执行文件路径算出一个稳定的 `custom-…` id;之后应用往
//! `http://127.0.0.1:<端口>/state` POST 状态。端口每次启动可能变,写在
//! `~/.clawd/runtime.json`。协议正本:该仓 `docs/guides/custom-agent-http.md`。
//!
//! 边界:只报状态、不管审批(v1 自定义 agent 没有 `/permission`);它没开就当离线,
//! 静默不重试;不写它的任何文件(注册记录在它的 prefs 里,只读)。这层只搬字节,
//! 不知道什么是 Issue —— 状态由上层现算。

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::Value;
use sha2::{Digest, Sha256};

pub const APP_ID: &str = "clawd-on-desk";
/// 上游只在这五个端口里挑第一个空闲的;文件里的端口不在范围内就当坏文件。
pub const PORT_RANGE: std::ops::RangeInclusive<u16> = 23333..=23337;
/// 上游 hook 自己用 100ms;跨进程放宽到 300ms,超过就当它没在听。
pub const POST_TIMEOUT: Duration = Duration::from_millis(300);
pub const STATE_PATH: &str = "/state";

#[derive(Debug, thiserror::Error)]
pub enum ClawdError {
    #[error("Clawd 没在跑(读不到 {0})")]
    NotRunning(String),
    #[error("Clawd 运行时文件形状不对:{0}")]
    BadRuntime(String),
    #[error("连不上 Clawd 127.0.0.1:{port}:{why}")]
    Connect { port: u16, why: String },
    #[error("等 Clawd 回包超时")]
    Timeout,
    #[error("Clawd 回包不是 HTTP:{0}")]
    BadResponse(String),
}

fn home_dir() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    if home.trim().is_empty() {
        return None;
    }
    Some(PathBuf::from(home))
}

/// `~/.clawd`;`BW_CLAWD_DIR` 可覆盖(E2E 用假目录,不碰真宠物)。
pub fn clawd_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("BW_CLAWD_DIR") {
        if !p.trim().is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    Some(home_dir()?.join(".clawd"))
}

pub fn runtime_path() -> Option<PathBuf> {
    Some(clawd_dir()?.join("runtime.json"))
}

/// Clawd 在跑时写的运行时身份。`owner_pid` 是 1.1 起才有的字段,旧版没有。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Runtime {
    pub port: u16,
    pub owner_pid: Option<u32>,
}

pub fn read_runtime() -> Result<Runtime, ClawdError> {
    let path = runtime_path().ok_or_else(|| ClawdError::NotRunning("没有 HOME".into()))?;
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| ClawdError::NotRunning(format!("{}:{e}", path.display())))?;
    parse_runtime(&raw)
}

pub fn parse_runtime(raw: &str) -> Result<Runtime, ClawdError> {
    let v: Value = serde_json::from_str(raw)
        .map_err(|e| ClawdError::BadRuntime(format!("不是合法 JSON:{e}")))?;
    if v.get("app").and_then(Value::as_str) != Some(APP_ID) {
        return Err(ClawdError::BadRuntime("app 不是 clawd-on-desk".into()));
    }
    let port = v
        .get("port")
        .and_then(Value::as_u64)
        .and_then(|p| u16::try_from(p).ok())
        .filter(|p| PORT_RANGE.contains(p))
        .ok_or_else(|| ClawdError::BadRuntime("port 不在 23333–23337".into()))?;
    let owner_pid = v
        .get("ownerPid")
        .and_then(Value::as_u64)
        .and_then(|p| u32::try_from(p).ok());
    Ok(Runtime { port, owner_pid })
}

/// 上游 `custom-applications.js` 的 `applicationName`:文件名去扩展名,`-` / `_` /
/// 空白连串换成一个空格,去首尾;空了就叫 "Custom application"。
/// Node 的 `path.basename`:win32 认 `/` 和 `\`,posix 只认 `/`。
fn basename(exe: &str, windows: bool) -> &str {
    let cut = if windows {
        exe.rfind(['/', '\\'])
    } else {
        exe.rfind('/')
    };
    match cut {
        Some(i) => &exe[i + 1..],
        None => exe,
    }
}

/// Node 的 `basename(p, extname(p))`:去掉最后一个 `.` 起的扩展名,开头的 `.` 不算。
fn stem(base: &str) -> &str {
    match base.rfind('.') {
        Some(i) if i > 0 => &base[..i],
        _ => base,
    }
}

fn application_name_str(exe: &str, windows: bool) -> String {
    let words: Vec<&str> = stem(basename(exe, windows))
        .split(|c: char| c == '-' || c == '_' || c.is_whitespace())
        .filter(|w| !w.is_empty())
        .collect();
    if words.is_empty() {
        "Custom application".to_string()
    } else {
        words.join(" ")
    }
}

/// 上游 `applicationId`:`custom-<slug>-<sha256(路径)前 12 位>`。slug = 名字小写、
/// 非 `[a-z0-9]` 连串换 `-`、去首尾 `-`、截 32;哈希键是可执行文件路径原串,
/// Windows 先转小写。与它逐字节一致,人才不用把 id 抄来抄去。
pub fn agent_id_for(exe: &Path) -> String {
    agent_id_for_platform(&exe.to_string_lossy(), cfg!(windows))
}

fn agent_id_for_platform(exe: &str, windows: bool) -> String {
    let name = application_name_str(exe, windows);
    let mut slug = String::new();
    let mut dash = false;
    for ch in name.to_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            dash = false;
        } else if !dash && !slug.is_empty() {
            slug.push('-');
            dash = true;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    // 上游先去首尾 `-` 再截 32,所以截完可能又剩一个尾 `-`;照抄,不"修正"。
    let slug: String = slug.chars().take(32).collect();
    let slug = if slug.is_empty() {
        "app".to_string()
    } else {
        slug
    };
    let key = if windows {
        exe.to_lowercase()
    } else {
        exe.to_string()
    };
    let digest = Sha256::digest(key.as_bytes());
    let hex: String = digest.iter().map(|b| format!("{b:02x}")).collect();
    format!("custom-{slug}-{}", &hex[..12])
}

/// Clawd(Electron)的 userData 目录里的 `clawd-prefs.json`:Windows `%APPDATA%\clawd-on-desk`,
/// macOS `~/Library/Application Support/clawd-on-desk`,Linux `$XDG_CONFIG_HOME|~/.config/clawd-on-desk`。
/// `BW_CLAWD_PREFS` 可覆盖。只读。
pub fn prefs_path() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("BW_CLAWD_PREFS") {
        if !p.trim().is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    let dir = if cfg!(windows) {
        PathBuf::from(std::env::var("APPDATA").ok()?).join(APP_ID)
    } else if cfg!(target_os = "macos") {
        home_dir()?
            .join("Library")
            .join("Application Support")
            .join(APP_ID)
    } else {
        std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| s.starts_with('/'))
            .map(PathBuf::from)
            .or_else(|| Some(home_dir()?.join(".config")))?
            .join(APP_ID)
    };
    Some(dir.join("clawd-prefs.json"))
}

/// 注册没注册:prefs 顶层 `customApplications[].id` 里有没有这串。
/// `None` = prefs 读不到或不是 JSON(没装过 / 没启动过 / 目录不同),**不是**「没注册」。
pub fn registered(agent_id: &str) -> Option<bool> {
    let raw = std::fs::read_to_string(prefs_path()?).ok()?;
    registered_in(&raw, agent_id)
}

pub fn registered_in(prefs_json: &str, agent_id: &str) -> Option<bool> {
    let v: Value = serde_json::from_str(prefs_json).ok()?;
    let apps = v
        .get("customApplications")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    Some(
        apps.iter()
            .any(|a| a.get("id").and_then(Value::as_str) == Some(agent_id)),
    )
}

/// 装没装。只认得出的地方才报;认不出返 `None`(不装绿也不装红)。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Installed {
    pub path: PathBuf,
    /// macOS 从 app bundle 的 Info.plist 读;Windows / Linux 读不到版本号,如实 `None`。
    pub version: Option<String>,
}

pub fn installed() -> Option<Installed> {
    if let Ok(p) = std::env::var("BW_CLAWD_APP") {
        if !p.trim().is_empty() {
            let path = PathBuf::from(p);
            return path.exists().then_some(Installed {
                path,
                version: None,
            });
        }
    }
    if cfg!(target_os = "macos") {
        let mut bases = vec![PathBuf::from("/Applications")];
        if let Some(h) = home_dir() {
            bases.push(h.join("Applications"));
        }
        for base in bases {
            let app = base.join("Clawd on Desk.app");
            if app.is_dir() {
                let plist = std::fs::read_to_string(app.join("Contents").join("Info.plist")).ok();
                return Some(Installed {
                    path: app,
                    version: plist.as_deref().and_then(plist_short_version),
                });
            }
        }
        return None;
    }
    if cfg!(windows) {
        // electron-builder 的 NSIS 默认按用户装到 %LOCALAPPDATA%\Programs\<产品名>;
        // 全机安装才落 %PROGRAMFILES%。人改过目录就认不出——如实「没认出」,不是「没装」。
        let mut candidates = Vec::new();
        if let Ok(v) = std::env::var("LOCALAPPDATA") {
            for dir in ["Clawd on Desk", "clawd-on-desk"] {
                candidates.push(PathBuf::from(&v).join("Programs").join(dir));
            }
        }
        if let Ok(v) = std::env::var("PROGRAMFILES") {
            candidates.push(PathBuf::from(v).join("Clawd on Desk"));
        }
        for dir in candidates {
            let exe = dir.join("Clawd on Desk.exe");
            if exe.is_file() {
                return Some(Installed {
                    path: exe,
                    version: None,
                });
            }
        }
    }
    None
}

fn plist_short_version(plist: &str) -> Option<String> {
    let key = "<key>CFBundleShortVersionString</key>";
    let at = plist.find(key)? + key.len();
    let rest = &plist[at..];
    let start = rest.find("<string>")? + "<string>".len();
    let end = rest[start..].find("</string>")? + start;
    let v = rest[start..end].trim();
    (!v.is_empty()).then(|| v.to_string())
}

/// 探活三样分开取,不合成一个「好坏」——卡在哪一步一眼看得出。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Probe {
    /// Workbench 自己这个可执行文件;人在 Clawd 里加发现路径时要指向它所在目录。
    pub exe: PathBuf,
    pub agent_id: String,
    pub installed: Option<Installed>,
    pub running: Result<Runtime, String>,
    pub registered: Option<bool>,
    pub prefs_path: Option<PathBuf>,
}

pub fn probe() -> Probe {
    let exe = std::env::current_exe().unwrap_or_default();
    // 读不到自己的路径就没有 id 可算——空串,上层据此不发、不让人去注册一串假的。
    let agent_id = if exe.as_os_str().is_empty() {
        String::new()
    } else {
        agent_id_for(&exe)
    };
    Probe {
        installed: installed(),
        running: read_runtime().map_err(|e| e.to_string()),
        registered: registered(&agent_id),
        prefs_path: prefs_path(),
        exe,
        agent_id,
    }
}

/// 裸 HTTP/1.1 POST 一条 JSON 到 `/state`,只等到状态行。上游要求:loopback、
/// 一个 Host、一个 `application/json` 的 Content-Type、不带 Origin ——
/// 都在这里写死。返回 HTTP 状态码(200 收下 / 204 没注册或被关 / 4xx 报文不对)。
pub async fn post_state(port: u16, body: &str) -> Result<u16, ClawdError> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let fut = async {
        let mut s = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .map_err(|e| ClawdError::Connect {
                port,
                why: e.to_string(),
            })?;
        let req = format!(
            "POST {STATE_PATH} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        s.write_all(req.as_bytes())
            .await
            .map_err(|e| ClawdError::Connect {
                port,
                why: e.to_string(),
            })?;
        let mut got = Vec::new();
        let mut buf = [0u8; 256];
        loop {
            let n = s.read(&mut buf).await.map_err(|e| ClawdError::Connect {
                port,
                why: e.to_string(),
            })?;
            if n == 0 {
                break;
            }
            got.extend_from_slice(&buf[..n]);
            if got.windows(2).any(|w| w == b"\r\n") {
                break;
            }
        }
        parse_status_line(&got)
    };
    match tokio::time::timeout(POST_TIMEOUT, fut).await {
        Ok(r) => r,
        Err(_) => Err(ClawdError::Timeout),
    }
}

fn parse_status_line(bytes: &[u8]) -> Result<u16, ClawdError> {
    let text = String::from_utf8_lossy(bytes);
    let line = text.lines().next().unwrap_or("").trim();
    let mut parts = line.split_whitespace();
    let proto = parts.next().unwrap_or("");
    let code = parts.next().and_then(|c| c.parse::<u16>().ok());
    match (proto.starts_with("HTTP/"), code) {
        (true, Some(c)) => Ok(c),
        _ => Err(ClawdError::BadResponse(line.chars().take(80).collect())),
    }
}

/// 读运行时文件拿端口再发。没在跑 / 超时 / 连不上都是 `Err`,调用方静默即可。
pub async fn send(body: &str) -> Result<u16, ClawdError> {
    let rt = read_runtime()?;
    post_state(rt.port, body).await
}

// ── Codex 宠物包 → Clawd ────────────────────────────────────────────────────

/// Codex CLI 内置八只宠物(`codex-rs/tui/src/pets/catalog.rs`)。它们的图集不在 Codex 仓里,
/// 是 Codex 首次使用时从 CDN 下到本机缓存的。
pub const CODEX_BUILTIN_PETS: [(&str, &str, &str); 8] = [
    ("codex", "Codex", "The original Codex companion"),
    ("dewey", "Dewey", "A tidy duck for calm workspace days"),
    ("fireball", "Fireball", "Hot path energy for fast iteration"),
    ("rocky", "Rocky", "A steady rock when the diff gets large"),
    ("seedy", "Seedy", "Small green shoots for new ideas"),
    ("stacky", "Stacky", "A balanced stack for deep work"),
    ("bsod", "BSOD", "A tiny blue-screen gremlin"),
    ("null-signal", "Null Signal", "Quiet signal from the void"),
];

/// `$CODEX_HOME`,缺省 `~/.codex`。
pub fn codex_home() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("CODEX_HOME") {
        if !p.trim().is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    Some(home_dir()?.join(".codex"))
}

/// Codex 缓存内置图集的位置(`asset_pack.rs`:`cache/tui-pets/v1/assets/<id>-spritesheet-v4.webp`)。
/// Clawd 与 Codex 都认的自定义宠物包目录是 `$CODEX_HOME/pets/<目录>/pet.json + 图`。
fn codex_builtin_cache_dir_in(codex_home: &Path) -> PathBuf {
    codex_home
        .join("cache")
        .join("tui-pets")
        .join("v1")
        .join("assets")
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CodexPetsExport {
    pub pets_dir: PathBuf,
    /// 这次新写出来的包(目录名)。
    pub written: Vec<String>,
    /// 目录里已有 `pet.json`,一个字没动。
    pub skipped: Vec<String>,
    /// 本机 Codex 没缓存这张图(在 Codex 里没选过它),没得可复制。
    pub missing: Vec<String>,
}

/// 把本机 Codex 已缓存的内置宠物图集配上 manifest,复制成 `~/.codex/pets/codex-<id>/`
/// 的宠物包 —— Clawd 启动 / 刷新主题时会自己把这个目录里的包转成主题。
/// **本机复制,不分发**:没缓存的一律 `missing`,不去 CDN 下。已有的包不覆盖。
pub fn export_codex_pets() -> Result<CodexPetsExport, String> {
    let home = codex_home().ok_or("没有 HOME,定位不到 Codex 目录")?;
    export_codex_pets_in(&home)
}

/// 同上,`codex_home` 由调用方给(测试用临时目录,不碰进程环境变量)。
pub fn export_codex_pets_in(codex_home: &Path) -> Result<CodexPetsExport, String> {
    let cache = codex_builtin_cache_dir_in(codex_home);
    let pets_dir = codex_home.join("pets");
    let mut out = CodexPetsExport {
        pets_dir: pets_dir.clone(),
        ..Default::default()
    };
    for (id, display, desc) in CODEX_BUILTIN_PETS {
        let src = cache.join(format!("{id}-spritesheet-v4.webp"));
        if !src.is_file() {
            out.missing.push(id.to_string());
            continue;
        }
        let pkg = format!("codex-{id}");
        let dir = pets_dir.join(&pkg);
        if dir.join("pet.json").is_file() {
            out.skipped.push(pkg);
            continue;
        }
        std::fs::create_dir_all(&dir).map_err(|e| format!("建不出 {}:{e}", dir.display()))?;
        std::fs::copy(&src, dir.join("spritesheet.webp"))
            .map_err(|e| format!("复制 {} 失败:{e}", src.display()))?;
        let manifest = serde_json::json!({
            "id": pkg,
            "displayName": format!("{display}(Codex)"),
            "description": desc,
            "spritesheetPath": "spritesheet.webp",
        });
        std::fs::write(
            dir.join("pet.json"),
            format!(
                "{}\n",
                serde_json::to_string_pretty(&manifest).unwrap_or_default()
            ),
        )
        .map_err(|e| format!("写 {} 失败:{e}", dir.join("pet.json").display()))?;
        out.written.push(pkg);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 期望值用上游 `custom-applications.js` 的 Node 实现算出(2026-09-24,clawd 1.1.0)。
    #[test]
    fn agent_id_matches_upstream_algorithm() {
        assert_eq!(
            agent_id_for_platform(
                "/Applications/Builders Workbench.app/Contents/MacOS/bw-dev",
                false
            ),
            "custom-bw-dev-cece75161037"
        );
        assert_eq!(
            agent_id_for_platform("C:\\Program Files\\Builders Workbench\\bw-dev.exe", true),
            "custom-bw-dev-2f251fbdf568"
        );
    }

    #[test]
    fn application_name_follows_upstream_normalization() {
        assert_eq!(application_name_str("/x/bw-dev.exe", false), "bw dev");
        assert_eq!(
            application_name_str("/x/my__cool-app", false),
            "my cool app"
        );
        assert_eq!(application_name_str("/x/---", false), "Custom application");
        assert_eq!(application_name_str("C:\\x\\bw-dev.exe", true), "bw dev");
        assert_eq!(application_name_str("/x/.hidden", false), ".hidden");
    }

    #[test]
    fn runtime_file_must_carry_identity_and_port_in_range() {
        let ok = parse_runtime(r#"{"app":"clawd-on-desk","port":23334,"ownerPid":42}"#).unwrap();
        assert_eq!(
            ok,
            Runtime {
                port: 23334,
                owner_pid: Some(42)
            }
        );
        assert!(parse_runtime(r#"{"app":"other","port":23334}"#).is_err());
        assert!(parse_runtime(r#"{"app":"clawd-on-desk","port":8080}"#).is_err());
        assert!(parse_runtime("not json").is_err());
        let legacy = parse_runtime(r#"{"app":"clawd-on-desk","port":23333}"#).unwrap();
        assert_eq!(legacy.owner_pid, None);
    }

    #[test]
    fn registration_is_read_from_prefs_custom_applications() {
        let prefs =
            r#"{"customApplications":[{"id":"custom-bw-dev-cece75161037","name":"bw dev"}]}"#;
        assert_eq!(
            registered_in(prefs, "custom-bw-dev-cece75161037"),
            Some(true)
        );
        assert_eq!(
            registered_in(prefs, "custom-other-000000000000"),
            Some(false)
        );
        assert_eq!(
            registered_in("{}", "custom-bw-dev-cece75161037"),
            Some(false)
        );
        assert_eq!(registered_in("nope", "custom-bw-dev-cece75161037"), None);
    }

    #[test]
    fn status_line_parsing() {
        assert_eq!(parse_status_line(b"HTTP/1.1 200 ok\r\n").unwrap(), 200);
        assert_eq!(
            parse_status_line(b"HTTP/1.1 204 No Content\r\n\r\n").unwrap(),
            204
        );
        assert!(parse_status_line(b"garbage").is_err());
    }

    #[test]
    fn plist_version_extraction() {
        let plist = "<key>CFBundleShortVersionString</key>\n\t<string>1.1.0</string>";
        assert_eq!(plist_short_version(plist).as_deref(), Some("1.1.0"));
        assert_eq!(
            plist_short_version("<key>Other</key><string>x</string>"),
            None
        );
    }

    #[tokio::test]
    async fn post_state_talks_plain_http_and_returns_status() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut s, _) = listener.accept().await.unwrap();
            let mut buf = vec![0u8; 2048];
            let n = s.read(&mut buf).await.unwrap();
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            s.write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n")
                .await
                .unwrap();
            req
        });
        let code = post_state(port, r#"{"agent_id":"x"}"#).await.unwrap();
        assert_eq!(code, 204);
        let req = server.await.unwrap();
        assert!(req.starts_with("POST /state HTTP/1.1\r\n"));
        assert!(req.contains("Host: 127.0.0.1:"));
        assert!(req.contains("Content-Type: application/json\r\n"));
        assert!(!req.to_lowercase().contains("origin:"));
        assert!(req.ends_with(r#"{"agent_id":"x"}"#));
    }

    #[tokio::test]
    async fn post_state_refused_port_is_an_error_not_a_hang() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let started = std::time::Instant::now();
        assert!(post_state(port, "{}").await.is_err());
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn export_copies_only_cached_builtins_and_never_overwrites() {
        let tmp = std::env::temp_dir().join(format!("bw-clawd-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        let cache = tmp.join("cache").join("tui-pets").join("v1").join("assets");
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("dewey-spritesheet-v4.webp"), b"RIFF....WEBP").unwrap();
        let pets = tmp.join("pets");
        std::fs::create_dir_all(pets.join("codex-seedy")).unwrap();
        std::fs::write(pets.join("codex-seedy").join("pet.json"), "{}").unwrap();
        std::fs::write(cache.join("seedy-spritesheet-v4.webp"), b"RIFF....WEBP").unwrap();
        let out = export_codex_pets_in(&tmp).unwrap();
        assert_eq!(out.written, vec!["codex-dewey".to_string()]);
        assert_eq!(out.skipped, vec!["codex-seedy".to_string()]);
        assert_eq!(out.missing.len(), 6);
        let manifest: Value = serde_json::from_str(
            &std::fs::read_to_string(pets.join("codex-dewey").join("pet.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["id"], "codex-dewey");
        assert_eq!(manifest["spritesheetPath"], "spritesheet.webp");
        assert!(pets.join("codex-dewey").join("spritesheet.webp").is_file());
        assert_eq!(
            std::fs::read_to_string(pets.join("codex-seedy").join("pet.json")).unwrap(),
            "{}"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
