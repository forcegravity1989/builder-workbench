//! 本机 Orca 的本地 pipe 客户端(会话开工)。对标 [`crate::open_design`]:
//! 本机资源发现 + 薄 RPC 客户端,不进 [`crate::legacy_pty`] 的 Executor 体系,
//! 不新 crate。token 只活在 [`OrcaRuntime`] 内存 —— 不落盘、不进 Event、不进
//! jsonl、不进日志原文(日志只打 method / runtimeId / pid / worktree)。
//!
//! 协议(与 `.scratch/orca-rpc-smoke.cjs` 同语义,照抄不发明):本地
//! named-pipe(Windows)/ unix socket(macOS·Linux)发一行 JSON
//! `{id, authToken, method, params}`,`\n` 分隔;跳过 `{_keepalive:true}`;
//! 按 id 匹配回包;看 `ok`。Windows 管道 open / read 可能阻塞,走 `spawn_blocking`
//! 加超时(学 [`crate::open_design`]);`#![forbid(unsafe_code)]` 仍守,Windows 命名
//! 管道用 `OpenOptions` 加 `share_mode`,不走 unsafe。
//!
//! 接口一次定住,不跟着穿刺脚本改形状。create 不回 Claude session id
//! (Orca 只回自己的 `terminal.handle`),所以 buddy 不编 id —— 再开工有
//! Claude id 走 ensure,没有就 create;去会话一律先切树,有 id 再尽量
//! ensure(见 `app::issue::run_issue` / `app::session::reopen_session`)。
//! web 配对码 buddy 自己拿不到(Orca 只在桌面 IPC / `orca serve` 里发,
//! 没开本地 pipe 的 RPC),由人从 Orca 桌面「给 web 配对」拿到 URL 贴进
//! 设置屏或 `BW_ORCA_WEB_URL`;本机 pipe 的开工不靠 pairing,靠
//! runtime.json 的 authToken。

use std::io::{Read, Write};
use std::path::Path;
use std::time::{Duration, Instant};

use serde_json::{json, Value};

/// 创建/再开工 ensure 的超时(create 本身要起一个 agent,穿刺 20–45s)。
const RPC_TIMEOUT: Duration = Duration::from_secs(45);
/// 切树不该等 agent 拉起。官方包偶发慢回,12s 内没切过去就报,别空等 45s。
const ACTIVATE_TIMEOUT: Duration = Duration::from_secs(12);
/// 去会话点回那条 tab 是加分项。短等即可;失败仍算跳成功(树已经在)。
const REVEAL_ENSURE_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Debug, thiserror::Error)]
pub enum OrcaError {
    #[error("本机没找到 Orca 运行时元数据({0})—— Orca 没开吗?")]
    NoRuntime(String),
    #[error("Orca 运行时里没有本地 pipe(named-pipe / unix)传输")]
    NoLocalTransport,
    #[error("Orca 运行时里没有 authToken —— Orca 没开,或刚重启还没写好")]
    NoAuthToken,
    #[error("连 Orca 本地 pipe 没成:{0}")]
    Connect(String),
    #[error("等 Orca 回包超时({method})")]
    Timeout { method: String },
    #[error("Orca 回了错:{0}")]
    Rpc(String),
    #[error("Orca 回包不是合法 JSON / 形状不对:{0}")]
    BadFrame(String),
}

/// 本机 Orca 运行时:本地 pipe 端点 + 一次性 token(只活在内存)。clone 只在
/// 内存流转;token 不落盘、不进 Event/jsonl/日志。
#[derive(Clone, Debug)]
pub struct OrcaRuntime {
    endpoint: String,
    auth_token: String,
    runtime_id: String,
    pid: Option<i64>,
}

impl OrcaRuntime {
    /// 给日志打的一行人话(只含 runtimeId / pid / endpoint,绝不带 token)。
    pub fn log_tag(&self) -> String {
        format!(
            "runtimeId={} pid={} {}",
            self.runtime_id,
            self.pid.unwrap_or(0),
            self.endpoint
        )
    }
}

/// 读本机 `orca-runtime.json`,取本地 pipe 端点 + authToken。没有文件 / 没有
/// 本地 pipe / 没有 token → 人话错误(Orca 没开),不 panic。`ORCA_USER_DATA_PATH`
/// 可覆盖用户数据目录(测试用)。
pub fn connect() -> Result<OrcaRuntime, OrcaError> {
    let dir = user_data_dir();
    let meta_path = dir.join("orca-runtime.json");
    let raw = std::fs::read_to_string(&meta_path)
        .map_err(|e| OrcaError::NoRuntime(format!("{}:{}", meta_path.display(), e)))?;
    let meta: Value = serde_json::from_str(&raw)
        .map_err(|e| OrcaError::BadFrame(format!("runtime.json 不是合法 JSON:{e}")))?;
    let transports = meta.get("transports").and_then(|t| t.as_array());
    let transport = transports.and_then(|arr| {
        arr.iter().find(|t| {
            matches!(
                t.get("kind").and_then(|k| k.as_str()),
                Some("named-pipe") | Some("unix")
            )
        })
    });
    let endpoint = transport
        .and_then(|t| t.get("endpoint"))
        .and_then(|e| e.as_str())
        .ok_or(OrcaError::NoLocalTransport)?
        .to_string();
    let auth_token = meta
        .get("authToken")
        .and_then(|t| t.as_str())
        .filter(|s| !s.is_empty())
        .ok_or(OrcaError::NoAuthToken)?
        .to_string();
    let runtime_id = meta
        .get("runtimeId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let pid = meta.get("pid").and_then(|v| v.as_i64());
    Ok(OrcaRuntime {
        endpoint,
        auth_token,
        runtime_id,
        pid,
    })
}

/// Orca `terminal.ensureAgentSession` 的 agent 枚举只收可 resume 的 TUI
/// (`claude` / `codex` / …)。buddy 会发出去的只有 `claude` 和 `cursor`;
/// **`cursor` 不在名单里**,硬打 ensure 会被 Zod 拒成
/// `invalid_argument · Invalid input`。Cursor 接回改走 [`activate_worktree`]。
/// create 的预设名也是 `cursor`,不是二进制名 `cursor-agent`。
pub fn agent_supports_ensure(agent: &str) -> bool {
    matches!(agent, "claude")
}

/// 再开工接回上一场。Claude 走 `ensureAgentSession`(resume + focused);
/// Cursor 等不能 resume 的只 [`activate_worktree`]。去会话请走 [`reveal_tree`]:
/// 那边先切树,ensure 失败不算跳失败。
pub async fn focus_session(
    rt: &OrcaRuntime,
    worktree: &Path,
    agent: &str,
    session_id: &str,
) -> Result<(), OrcaError> {
    if agent_supports_ensure(agent) {
        ensure_session(rt, worktree, agent, session_id).await
    } else {
        activate_worktree(rt, worktree).await
    }
}

/// 去会话:先把 Orca 切到这棵树。有 Claude session id 再尽量点回那条 tab。
/// **切树成功就算成功**——树上有几扇窗、是否正好落到 issue 那条,是其次。
/// ensure 失败或超时只打日志,不把整次跳转打成失败。
pub async fn reveal_tree(
    rt: &OrcaRuntime,
    worktree: &Path,
    session_id: &str,
) -> Result<(), OrcaError> {
    activate_worktree(rt, worktree).await?;
    if session_id.is_empty() {
        return Ok(());
    }
    if let Err(e) =
        ensure_session_timed(rt, worktree, "claude", session_id, REVEAL_ENSURE_TIMEOUT).await
    {
        eprintln!(
            "[BW_ORCA] 树已切过去,点回那条会话没跟上:{e} · {} · worktree={}",
            rt.log_tag(),
            worktree.display()
        );
    }
    Ok(())
}

/// 把一张已有 Claude 会话在 Orca 桌面里点出来(焦点落到那条 agent tab)。
/// `session_id` 是 Claude jsonl 的 session id(会话行里记的),Orca 要显式指定
/// —— 它不会按 worktree+agent 自己找。没 id 就别调这条(走 [`create_session`])。
pub async fn ensure_session(
    rt: &OrcaRuntime,
    worktree: &Path,
    agent: &str,
    session_id: &str,
) -> Result<(), OrcaError> {
    ensure_session_timed(rt, worktree, agent, session_id, RPC_TIMEOUT).await
}

async fn ensure_session_timed(
    rt: &OrcaRuntime,
    worktree: &Path,
    agent: &str,
    session_id: &str,
    timeout: Duration,
) -> Result<(), OrcaError> {
    let params = json!({
        "kind": "explicit",
        "worktree": path_prefixed(worktree),
        "agent": agent,
        "providerSession": { "key": "session_id", "id": session_id },
        "presentation": "focused",
    });
    let frame = call(rt, "terminal.ensureAgentSession", params, timeout).await?;
    require_ok(&frame, "terminal.ensureAgentSession")
}

/// 把配对网页 / 桌面切到这棵 worktree。不 resume agent。去会话必走;
/// Cursor 的 ▶开工 接回也走这条(Orca 不支持 `cursor` 的 ensure)。
pub async fn activate_worktree(rt: &OrcaRuntime, worktree: &Path) -> Result<(), OrcaError> {
    let params = json!({
        "worktree": path_prefixed(worktree),
        "notifyClients": true,
    });
    let frame = call(rt, "worktree.activate", params, ACTIVATE_TIMEOUT).await?;
    require_ok(&frame, "worktree.activate")
}

/// 在 Orca 里给这张活开一场新会话并把首条用户话发出去。`prompt` 是用户话
/// (活标题+正文),不是系统提示词;`system` 是 buddy 渲染的系统提示词。
/// `promptDelivery = "auto-submit"`(开工要真发出去;穿刺 draft/submit 都通,
/// 产品走 submit)。web 端会把 focused 改成 background,这是 Orca 行为,buddy 仍
/// 传 focused。**调用方不要自己拼 flag** —— 内部按 agent 分流:
/// - Claude:`agentArgs = --append-system-prompt '<system>'`(必须加引号,否则
///   Orca 拆 token 后只剩 You 进系统提示词,后半截被当用户话发出 —— 穿刺踩过)。
/// - Cursor(`cursor` 预设,二进制才是 cursor-agent):没有系统提示词开关,
///   把 system 拼在 prompt 最前面。
pub async fn create_session(
    rt: &OrcaRuntime,
    worktree: &Path,
    agent: &str,
    prompt: &str,
    system: &str,
) -> Result<(), OrcaError> {
    let (prompt, agent_args) = split_prompt_and_args(agent, prompt, system);
    let mut params = json!({
        "clientOperationId": client_operation_id(),
        "worktree": path_prefixed(worktree),
        "agent": agent,
        "prompt": prompt,
        "promptDelivery": "auto-submit",
        "presentation": "focused",
    });
    if !agent_args.is_empty() {
        params["agentArgs"] = json!(agent_args);
    }
    let frame = call(rt, "terminal.createAgentSession", params, RPC_TIMEOUT).await?;
    require_ok(&frame, "terminal.createAgentSession")
}

/// 给会话屏 iframe 的 loopback。**不依赖 `connect()`** —— 人把安装版
/// 「给 web 配对」的完整 URL 贴进设置屏(存本机 `settings.toml`),或开发期
/// 塞 `BW_ORCA_WEB_URL` 覆盖;启动 buddy 后原样打开。**先 env 后 `fallback`**
/// (fallback 是壳从本机设置读出来喂进来的),都只过 `looks_loopback_http`,
/// 不拼会话深链、不 postMessage。没设 / 不是 loopback → `None`。pipe 开工
/// 不读这个。**只认一份**(env 或设置),不在壳和这里各开一条嵌页。
pub fn web_embed_url(fallback: Option<&str>) -> Option<String> {
    let env = std::env::var("BW_ORCA_WEB_URL").ok();
    let raw = env.as_deref().or(fallback)?;
    let trimmed = raw.trim();
    if trimmed.is_empty() || !crate::open_design::looks_loopback_http(trimmed) {
        return None;
    }
    Some(pairing_as_query(trimmed))
}

/// WebView2 部分导航会丢 `#fragment`。配对码只在 hash 里就签不上。
/// Orca 认 `?pairing=`(和 `#pairing=` 同一套读法),只搬家不改 code。
fn pairing_as_query(url: &str) -> String {
    let Some((base, frag)) = url.split_once('#') else {
        return url.to_string();
    };
    let Some(pairing) = frag.strip_prefix("pairing=") else {
        return url.to_string();
    };
    if base.contains("pairing=") {
        return url.to_string();
    }
    if base.contains('?') {
        format!("{base}&pairing={pairing}")
    } else {
        format!("{base}?pairing={pairing}")
    }
}

/// 读本机 Claude jsonl,找这棵 worktree 上**最新**一条 session id。不编 id。
/// 路径编码和 Claude Code 一样:非字母数字改成 `-`
/// (`D:\foo\bar` → `~/.claude/projects/D--foo-bar/<uuid>.jsonl`)。
pub fn session_id_for_worktree(worktree: &Path) -> Option<String> {
    let dir = claude_project_dir(worktree)?;
    let mut newest: Option<(std::time::SystemTime, String)> = None;
    let entries = std::fs::read_dir(&dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if !looks_session_id(stem) {
            continue;
        }
        let mtime = entry.metadata().ok().and_then(|m| m.modified().ok())?;
        match &newest {
            Some((t, _)) if *t >= mtime => {}
            _ => newest = Some((mtime, stem.to_string())),
        }
    }
    newest.map(|(_, id)| id)
}

/// 开工刚 create 完,jsonl 可能还没落到盘。短等几次,有就返回,没有就 `None`(不编)。
pub async fn wait_session_id_for_worktree(worktree: &Path) -> Option<String> {
    if let Some(id) = session_id_for_worktree(worktree) {
        return Some(id);
    }
    for _ in 0..20 {
        tokio::time::sleep(Duration::from_millis(400)).await;
        if let Some(id) = session_id_for_worktree(worktree) {
            return Some(id);
        }
    }
    None
}

// ── 内部 ───────────────────────────────────────────────────────────────

fn user_data_dir() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("ORCA_USER_DATA_PATH") {
        return std::path::PathBuf::from(p);
    }
    #[cfg(windows)]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        std::path::PathBuf::from(appdata).join("orca")
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        std::path::PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("orca")
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let xdg = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .filter(|s| s.starts_with('/'));
        xdg.map(std::path::PathBuf::from)
            .unwrap_or_else(|| {
                let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
                std::path::PathBuf::from(home).join(".config")
            })
            .join("orca")
    }
}

/// JSON-RPC 帧的 `id`(按回包匹配)。Orca 不解析这个形状。
fn request_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = (std::process::id() as u64) ^ (now as u64).wrapping_mul(2654435761);
    format!("bw-{now:016x}-{rand:016x}")
}

/// `createAgentSession` 的 `clientOperationId`。Orca 源码要求
/// `/^(\d{13})-[0-9a-f]{32}$/`(毫秒时间戳 + 32 hex),对不上直接
/// `agent_session_operation_invalid`,工作树已经开了、Claude 会话不会建。
/// 穿刺烟测 `.scratch/orca-rpc-smoke.cjs` 的 `operationId()` 就是这个形状;
/// 以前误把 RPC `id` 的 `bw-hex-hex` 填进来了。
fn client_operation_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let ts = now % 10_000_000_000_000;
    let nonce = (std::process::id() as u128)
        .wrapping_shl(64)
        .wrapping_add(now.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    format!("{ts:013}-{nonce:032x}")
}

/// `path: <worktree 绝对路径>`。Orca 用这个前缀认 worktree(穿刺已人眼过)。
fn path_prefixed(worktree: &Path) -> String {
    format!("path:{}", worktree.display())
}

fn claude_home() -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("CLAUDE_CONFIG_DIR") {
        if !p.trim().is_empty() {
            return Some(std::path::PathBuf::from(p));
        }
    }
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(std::path::PathBuf::from(home).join(".claude"))
}

fn claude_project_slug(worktree: &Path) -> String {
    worktree
        .display()
        .to_string()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

fn claude_project_dir(worktree: &Path) -> Option<std::path::PathBuf> {
    Some(
        claude_home()?
            .join("projects")
            .join(claude_project_slug(worktree)),
    )
}

fn looks_session_id(stem: &str) -> bool {
    let s = stem.trim();
    (32..80).contains(&s.len()) && s.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// 按 agent 分流:返回 (真正发出去的 prompt, agentArgs 字符串)。
fn split_prompt_and_args(agent: &str, prompt: &str, system: &str) -> (String, String) {
    if agent == "cursor" {
        // Cursor 没有系统提示词开关 —— 把 system 拼在 prompt 最前面。
        let combined = if system.is_empty() {
            prompt.to_string()
        } else {
            format!("{system}\n\n{prompt}")
        };
        (combined, String::new())
    } else {
        // Claude(默认):agentArgs = --append-system-prompt '<system>'。
        // 必须 shell 加引号,否则 Orca 拆 token 后只剩 You 进系统提示词。
        let agent_args = if system.is_empty() {
            String::new()
        } else {
            format!("--append-system-prompt {}", shell_quote_single(system))
        };
        (prompt.to_string(), agent_args)
    }
}

/// 把一个值用单引号包起来给 Orca 的 shell 拆 token 用。Windows 用 PowerShell
/// 风格(内部 `'` 写成 `''`);Unix 用 POSIX sh 风格(内部 `'` 写成 `'\''`)。
/// 两种都把整段变成一个 token,Orca 拆完再重引号传给 claude(穿刺已人眼过)。
fn shell_quote_single(value: &str) -> String {
    #[cfg(windows)]
    {
        // PowerShell:单引号串,内部单引号加倍。
        let mut out = String::with_capacity(value.len() + 2);
        out.push('\'');
        for c in value.chars() {
            if c == '\'' {
                out.push_str("''");
            } else {
                out.push(c);
            }
        }
        out.push('\'');
        out
    }
    #[cfg(not(windows))]
    {
        // POSIX sh:单引号串,内部单引号写成 '\''。
        let mut out = String::with_capacity(value.len() + 2);
        out.push('\'');
        for c in value.chars() {
            if c == '\'' {
                out.push_str("'\\''");
            } else {
                out.push(c);
            }
        }
        out.push('\'');
        out
    }
}

/// 一次本地 pipe RPC。`spawn_blocking` 跑阻塞的 open+读写,外面套 `timeout`
/// (学 `open_design`)。阻塞任务自带 deadline,超时自退,不靠外层 cancel。
async fn call(
    rt: &OrcaRuntime,
    method: &str,
    params: Value,
    timeout: Duration,
) -> Result<Value, OrcaError> {
    let id = request_id();
    let frame = json!({
        "id": id,
        "authToken": rt.auth_token,
        "method": method,
        "params": params,
    });
    let endpoint = rt.endpoint.clone();
    let id_for_recv = id.clone();
    let method_for_err = method.to_string();
    let handle =
        tokio::task::spawn_blocking(move || send_recv(&endpoint, &frame, &id_for_recv, timeout));
    // 三层 peel:Elapsed(外层 timeout)→ JoinError(spawn_blocking)→ OrcaError(任务内)。
    tokio::time::timeout(timeout, handle)
        .await
        .map_err(|_| OrcaError::Timeout {
            method: method_for_err,
        })?
        .map_err(|e| OrcaError::Connect(e.to_string()))?
}

/// 同步:开 pipe → 发一行 JSON → 增量读、按行解析,跳过 keepalive,取 id 匹配的
/// 回包(拿到就 drop stream 关连接,不等 pipe close)。带 deadline,超时自退。
fn send_recv(
    endpoint: &str,
    frame: &Value,
    id: &str,
    timeout: Duration,
) -> Result<Value, OrcaError> {
    let deadline = Instant::now() + timeout;
    let method = frame
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    let mut stream = open_duplex(endpoint)
        .ok_or_else(|| OrcaError::Connect(format!("打不开本地 pipe:{endpoint}")))?;
    let line = format!(
        "{}\n",
        serde_json::to_string(frame).map_err(|e| OrcaError::BadFrame(e.to_string()))?
    );
    stream
        .write_all(line.as_bytes())
        .map_err(|e| OrcaError::Connect(format!("写 pipe 没成:{e}")))?;
    let _ = stream.flush();
    // 按字节 b'\n' 切行、再整行 from_slice 解析 —— 不在每次读上做 from_utf8_lossy:
    // 多字节 UTF-8 被一次 8K 读的边界劈开时,lossy 会把残缺字节换成 U+FFFD 永久进
    // 缓冲,整行 JSON 坏掉、命中的回包被跳过 → BadFrame/Timeout。b'\n'(0x0A) 在
    // UTF-8 里绝不会作为续接字节出现,按字节切行不会劈开多字节字符。
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        if Instant::now() >= deadline {
            return Err(OrcaError::Timeout { method });
        }
        let n = stream
            .read(&mut chunk)
            .map_err(|e| OrcaError::Connect(format!("读 pipe 没成:{e}")))?;
        if n == 0 {
            break; // pipe 关了
        }
        buf.extend_from_slice(&chunk[..n]);
        // 把已经完整的行逐条取出来解析。
        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buf.drain(..pos).collect(); // 行字节(不含 \n)
            buf.drain(..1); // 丢掉那个 \n
            if line.iter().all(|&b| b.is_ascii_whitespace()) {
                continue;
            }
            let v: Value = match serde_json::from_slice(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if v.get("_keepalive") == Some(&Value::Bool(true)) {
                continue;
            }
            if v.get("id").and_then(|x| x.as_str()) == Some(id) {
                return Ok(v);
            }
            // 别人的 id / 无 id 帧:跳过。
        }
    }
    Err(OrcaError::BadFrame(format!(
        "没收到 id={id} 的回包(pipe 关了)"
    )))
}

/// 看回包 `ok` 是不是 true。失败把 Orca 的 **code** + 一行 message 带出来
/// (`agent_session_operation_invalid` / `legacy_required` / 别的),给
/// `IssueRan.summary` 和 stderr 露给人 —— 连上了但被拒也走这条,不只是连不上。
fn require_ok(frame: &Value, method: &str) -> Result<(), OrcaError> {
    if frame.get("ok").and_then(|o| o.as_bool()) == Some(true) {
        return Ok(());
    }
    Err(OrcaError::Rpc(error_brief(frame, method)))
}

/// 从失败回包拆 `method · code=<code> · <一行 message>`。code 可能在顶层、
/// 可能在 `error` 对象里;找不到就不写那一段(不编)。**不带 token / pairing**。
fn error_brief(frame: &Value, method: &str) -> String {
    let err = frame.get("error");
    let code = frame
        .get("code")
        .or_else(|| err.and_then(|e| e.get("code")))
        .and_then(|c| c.as_str())
        .map(|c| c.to_string());
    let msg = err
        .and_then(|e| e.get("message"))
        .or(err)
        .or_else(|| frame.get("message"));
    let one_line = match msg.and_then(|v| v.as_str()) {
        Some(s) => s.split_whitespace().collect::<Vec<_>>().join(" "),
        None => msg.map(|v| v.to_string()).unwrap_or_default(),
    };
    let mut brief = method.to_string();
    if let Some(c) = code {
        brief.push_str(&format!(" · code={c}"));
    }
    if !one_line.is_empty() {
        brief.push_str(&format!(" · {one_line}"));
    }
    brief
}

// ── 平台管道接缝(抄 open_design,forbid unsafe) ─────────────────────────
//
// Windows:`std::fs::File` 没有 read 超时,无数据时 `read` 会阻塞 —— 上面的
// deadline 在那次阻塞里没法醒来;真碰上 Orca 挂住不回,外层 `tokio::timeout`
// 照样返 Timeout,阻塞任务会留到 pipe 关了才退(罕见,与 `open_design` 同口径)。
// 正常路径 RPC 回包到了 `read` 就返,deadline 立刻过。

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
            // 短读超时:让上面的 deadline 循环能定期醒来检查,不在无数据时永远阻塞。
            let _ = s.set_read_timeout(Some(Duration::from_millis(500)));
            let _ = s.set_write_timeout(Some(Duration::from_millis(500)));
        })
}

#[cfg(test)]
mod tests {
    use super::{
        agent_supports_ensure, claude_project_slug, client_operation_id, looks_session_id,
        pairing_as_query, split_prompt_and_args,
    };
    use std::path::Path;

    #[test]
    fn claude_slug_matches_known_workbench_tree() {
        let p = Path::new(r"D:\builders-workbench\workspaces\workbench-issue-1");
        assert_eq!(
            claude_project_slug(p),
            "D--builders-workbench-workspaces-workbench-issue-1"
        );
    }

    #[test]
    fn session_id_shape() {
        assert!(looks_session_id("6340093e-ba66-40e8-8b09-26373b33354a"));
        assert!(!looks_session_id("notes"));
        assert!(!looks_session_id(""));
    }

    #[test]
    fn client_operation_id_matches_orca_pattern() {
        let id = client_operation_id();
        assert_eq!(id.len(), 46);
        assert_eq!(id.as_bytes()[13], b'-');
        assert!(id[..13].chars().all(|c| c.is_ascii_digit()));
        assert!(id[14..].chars().all(|c| matches!(c, '0'..='9' | 'a'..='f')));
    }

    #[test]
    fn cursor_agent_cannot_ensure_claude_can() {
        assert!(agent_supports_ensure("claude"));
        assert!(!agent_supports_ensure("cursor"));
        assert!(!agent_supports_ensure(""));
    }

    #[test]
    fn cursor_preset_splices_system_into_prompt() {
        let (prompt, args) = split_prompt_and_args("cursor", "do the work", "You are buddy.");
        assert_eq!(prompt, "You are buddy.\n\ndo the work");
        assert!(args.is_empty());
        let (p2, a2) = split_prompt_and_args("claude", "do the work", "You are buddy.");
        assert_eq!(p2, "do the work");
        assert!(a2.contains("--append-system-prompt"));
    }

    #[test]
    fn pairing_hash_moves_to_query() {
        assert_eq!(
            pairing_as_query("http://127.0.0.1:6769/web-index.html#pairing=orca://pair?code=abc"),
            "http://127.0.0.1:6769/web-index.html?pairing=orca://pair?code=abc"
        );
        assert_eq!(
            pairing_as_query("http://127.0.0.1:6769/web?x=1#pairing=abc"),
            "http://127.0.0.1:6769/web?x=1&pairing=abc"
        );
        assert_eq!(
            pairing_as_query("http://127.0.0.1:6769/web-index.html?pairing=already"),
            "http://127.0.0.1:6769/web-index.html?pairing=already"
        );
    }
}
