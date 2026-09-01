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
//! (Orca 只回自己的 `terminal.handle`),所以 Workbench 不编 id —— 没 id 才
//! create;去会话和再开工接回都只切树,不 `ensure`(Orca 的 ensure 是
//! `--resume` 再开一扇,树上已有的窗切过去就能看见)。
//! web 配对码 Workbench 自己拿不到(Orca 只在桌面 IPC / `orca serve` 里发,
//! 没开本地 pipe 的 RPC),由人从 Orca 桌面「给 web 配对」拿到 URL 贴进
//! 设置屏或 `BW_ORCA_WEB_URL`;本机 pipe 的开工不靠 pairing,靠
//! runtime.json 的 authToken。

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

/// 创建的超时(create 本身要起一个 agent,穿刺 20–45s)。
const RPC_TIMEOUT: Duration = Duration::from_secs(45);
/// 切树不该等 agent 拉起。官方包偶发慢回,12s 内没切过去就报,别空等 45s。
const ACTIVATE_TIMEOUT: Duration = Duration::from_secs(12);
/// 句柄超时后先停几秒再收 id / 切树,给渲染进程把 Claude 拉完。
pub const HANDLE_TIMEOUT_SETTLE: Duration = Duration::from_secs(5);

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

/// `createAgentSession` 的结果。句柄超时窗已经在,调用方要先 settle 再切树。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateSessionOutcome {
    Ready,
    HandleTimeout,
}

impl OrcaError {
    /// Orca 渲染进程已经建了 tab / 拉起 agent,主进程 10 秒没把句柄交回。
    /// 回包是失败,活已经起来了 —— 当 HandleTimeout,调用方先 settle 再切树。
    pub fn is_terminal_handle_timeout(&self) -> bool {
        matches!(
            self,
            OrcaError::Rpc(s) if s.contains("Timed out waiting for terminal handle after creation")
        )
    }
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

/// 开工对照日志落哪。默认 `%TEMP%/bw-orca.log`;`BW_ORCA_LOG` 覆盖。
pub fn diag_log_path() -> PathBuf {
    std::env::var("BW_ORCA_LOG")
        .ok()
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| std::env::temp_dir().join("bw-orca.log"))
}

/// 对照日志:stderr + 文件各一行。不写 token / pairing / 提示词正文。
pub fn diag(msg: &str) {
    let line = format!("[BW_ORCA] {msg}");
    eprintln!("{line}");
    let path = diag_log_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let _ = writeln!(f, "{ms} {line}");
    }
}

fn text_stats(s: &str) -> (usize, usize, usize) {
    (
        s.chars().count(),
        s.len(),
        s.as_bytes().iter().filter(|&&b| b == b'\n').count(),
    )
}

fn preview(s: &str, n: usize) -> String {
    s.chars()
        .take(n)
        .collect::<String>()
        .replace('\n', "\\n")
        .replace('\r', "\\r")
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
    let rt = OrcaRuntime {
        endpoint,
        auth_token,
        runtime_id,
        pid,
    };
    diag(&format!("connect ok · {}", rt.log_tag()));
    Ok(rt)
}

/// Orca `terminal.ensureAgentSession` 的 agent 枚举只收可 resume 的 TUI
/// (`claude` / `codex` / …)。Workbench 会发出去的只有 `claude` 和 `cursor`;
/// **`cursor` 不在名单里**,硬打 ensure 会被 Zod 拒成
/// `invalid_argument · Invalid input`。Cursor 接回改走 [`activate_worktree`]。
/// create 的预设名也是 `cursor`,不是二进制名 `cursor-agent`。
pub fn agent_supports_ensure(agent: &str) -> bool {
    matches!(agent, "claude")
}

/// 去会话 / 再开工接回:只切树。Orca 自己记着树上有哪些窗,切过去主窗口
/// 就是那些 TUI。不打 `ensureAgentSession` —— 那条是 `--resume` 再开一扇。
pub async fn reveal_tree(rt: &OrcaRuntime, worktree: &Path) -> Result<(), OrcaError> {
    activate_worktree(rt, worktree).await
}

/// Orca 是否已经认这份仓。问 `repo.show`,不落盘。问不成把错交出去,
/// 调用方自己决定挡不挡进项目。
pub async fn repo_present(rt: &OrcaRuntime, repo: &Path) -> Result<bool, OrcaError> {
    let shown = call(
        rt,
        "repo.show",
        json!({ "repo": path_prefixed(repo) }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    Ok(require_ok(&shown, "repo.show").is_ok())
}

/// 让 Orca 认得这份被管仓。人纳入 Workbench 时不该再去 Orca 里手加
/// `workspaces/xx`。先 `repo.show`,已有则原样返回;没有才 `repo.add`,
/// 再把外部 worktree 设成可见,`.bw/worktrees/issue-N` 才能被 `path:` 选到。
pub async fn ensure_repo(rt: &OrcaRuntime, repo: &Path) -> Result<(), OrcaError> {
    match repo_present(rt, repo).await {
        Ok(true) => {
            diag(&format!("repo present worktree={}", path_prefixed(repo)));
            return Ok(());
        }
        Ok(false) => {
            diag(&format!(
                "repo missing, add worktree={}",
                path_prefixed(repo)
            ));
        }
        Err(e) => {
            diag(&format!(
                "repo show fail:{e} · {} · worktree={}",
                rt.log_tag(),
                path_prefixed(repo)
            ));
            return Err(e);
        }
    }
    let path = repo.display().to_string();
    let added = call(
        rt,
        "repo.add",
        json!({ "path": path, "kind": "git" }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    require_ok(&added, "repo.add")?;
    // 仓已经在了,visibility 改不成也不挡接入。不改 worktreeBasePath ——
    // 写成 `.bw/worktrees` 会被 Orca 当成自己的工作区根,新树一出现就开空窗。
    let _ = publish_visibility(rt, repo).await;
    Ok(())
}

/// 刚 `git worktree add` 完,Orca 的扫描缓存(30s)还是打开项目时那份,
/// `path:<新树>` 会 `selector_not_found`。再写一次 `worktreeBasePath` 会刷掉
/// 扫描(Orca 只在这个字段再写时 invalidate)。**不是 `repo.add`**。
/// 只回写 Orca 已有的值(我们误写成 `.bw/worktrees` 的清掉),不把扫描根改成 Workbench 目录。
pub async fn refresh_worktrees(rt: &OrcaRuntime, repo: &Path) -> Result<(), OrcaError> {
    let shown = call(
        rt,
        "repo.show",
        json!({ "repo": path_prefixed(repo) }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    require_ok(&shown, "repo.show")?;
    let current = shown
        .pointer("/result/repo/worktreeBasePath")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    // 上一刀误把扫描根写成 Workbench 目录;空串经 Orca OptionalString 变 undefined,清掉误写。
    let base = if current == ".bw/worktrees" {
        ""
    } else {
        current
    };
    let updated = call(
        rt,
        "repo.update",
        json!({
            "repo": path_prefixed(repo),
            "updates": {
                "externalWorktreeVisibility": "show",
                "worktreeBasePath": base
            }
        }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    require_ok(&updated, "repo.update")
}

async fn publish_visibility(rt: &OrcaRuntime, repo: &Path) -> Result<(), OrcaError> {
    let updated = call(
        rt,
        "repo.update",
        json!({
            "repo": path_prefixed(repo),
            "updates": { "externalWorktreeVisibility": "show" }
        }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    require_ok(&updated, "repo.update")
}

/// 把配对网页 / 桌面切到这棵 worktree。不 resume agent。去会话、create
/// 成功后跟网页、再开工接回都走这条。
pub async fn activate_worktree(rt: &OrcaRuntime, worktree: &Path) -> Result<(), OrcaError> {
    let params = json!({
        "worktree": path_prefixed(worktree),
        "notifyClients": true,
    });
    let frame = call(rt, "worktree.activate", params, ACTIVATE_TIMEOUT).await?;
    require_ok(&frame, "worktree.activate")
}

/// 在 Orca 里给这张活开一场新会话。`prompt` 是用户话(活标题+正文),
/// `system` 是 Workbench 渲染的系统提示词。**调用方不要自己拼 flag** —— 内部按
/// agent 分流:
/// - Claude:系统提示词压成单行进 `agentArgs` 的 `--append-system-prompt`
///   (必须加引号,否则 Orca 拆 token 后只剩 You);标题+正文也挂在同一条启动
///   命令上当位置参数;后面跟上 `--dangerously-skip-permissions` 和
///   `--disallowedTools 'Bash(gh pr merge)'`(和 PTY `LaunchPlan` 同一套,
///   不另起通道)。不走句柄回来之后的 `auto-submit` —— Windows 上 Orca
///   把多行 `agentArgs` 打进 shell,每个换行是 Enter,启动变慢并撞 10 秒句柄
///   超时,窗在词不在。
/// - Cursor(`cursor` 预设,二进制才是 cursor-agent):没有 `--append-system-prompt`。
///   `agentArgs` 和 Claude 同一套拼法:一条单行,值用 `shell_quote_single`
///   (`--force --trust '<压成单行的系统提示词>'`)。Orca 的 cwd 已是这棵树,
///   不再另塞 `--workspace`。标题+正文走 Orca `prompt` + `auto-submit`。
///   create 前仍写 cursor-agent 认的 `.workspace-trusted`(Orca 预写的 slug
///   对不上 `.bw` 路径)。
///
/// web 端会把 focused 改成 background,这是 Orca 行为,Workbench 仍传 focused。
pub async fn create_session(
    rt: &OrcaRuntime,
    worktree: &Path,
    agent: &str,
    prompt: &str,
    system: &str,
) -> Result<CreateSessionOutcome, OrcaError> {
    let (prompt, agent_args) = split_prompt_and_args(agent, prompt, system, worktree);
    let (p_chars, p_bytes, p_nl) = text_stats(&prompt);
    let (s_chars, s_bytes, s_nl) = text_stats(system);
    let (a_chars, a_bytes, a_nl) = text_stats(&agent_args);
    let orca_prompt = !prompt.is_empty();
    let system_via = if agent == "cursor" {
        "agentArgs-positional"
    } else {
        "agentArgs"
    };
    let yolo = agent_args.contains("--dangerously-skip-permissions")
        || agent_args.contains("--force")
        || agent_args.contains("--yolo");
    let workspace_arg = cursor_workspace_arg(worktree);
    let cursor_trust = if agent == "cursor" {
        ensure_cursor_workspace_trusted(worktree)
    } else {
        "-".into()
    };
    diag(&format!(
        "create begin agent={agent} system_via={system_via} orca_prompt={orca_prompt} \
         worktree={} workspace_arg={workspace_arg} cursor_trust={cursor_trust} \
         prompt_chars={p_chars} \
         prompt_bytes={p_bytes} prompt_nl={p_nl} \
         system_chars={s_chars} system_bytes={s_bytes} system_nl={s_nl} \
         agent_args_chars={a_chars} agent_args_bytes={a_bytes} agent_args_nl={a_nl} \
         agent_args_sent={} yolo={yolo} agent_cmd={} prompt_preview={} \
         system_preview={} · {}",
        path_prefixed(worktree),
        !agent_args.is_empty(),
        redact_agent_cmd(&agent_args),
        preview(&prompt, 48),
        preview(system, 32),
        rt.log_tag()
    ));
    let mut params = json!({
        "clientOperationId": client_operation_id(),
        "worktree": path_prefixed(worktree),
        "agent": agent,
        "presentation": "focused",
    });
    if orca_prompt {
        params["prompt"] = json!(prompt);
        params["promptDelivery"] = json!("auto-submit");
    }
    if !agent_args.is_empty() {
        params["agentArgs"] = json!(agent_args);
    }
    let started = Instant::now();
    let frame = call(rt, "terminal.createAgentSession", params, RPC_TIMEOUT).await;
    let elapsed_ms = started.elapsed().as_millis();
    let frame = match frame {
        Ok(f) => f,
        Err(e) => {
            diag(&format!(
                "create rpc elapsed_ms={elapsed_ms} verdict=transport_err err={e}"
            ));
            return Err(e);
        }
    };
    match require_ok(&frame, "terminal.createAgentSession") {
        Ok(()) => {
            diag(&format!("create rpc elapsed_ms={elapsed_ms} verdict=ready"));
            Ok(CreateSessionOutcome::Ready)
        }
        // 渲染进程已经建了 tab,句柄没交回。不立刻切树,调用方先 settle。
        Err(e) if e.is_terminal_handle_timeout() => {
            diag(&format!(
                "create rpc elapsed_ms={elapsed_ms} verdict=handle_timeout brief={e}"
            ));
            Ok(CreateSessionOutcome::HandleTimeout)
        }
        Err(e) => {
            diag(&format!(
                "create rpc elapsed_ms={elapsed_ms} verdict=rpc_error brief={e}"
            ));
            Err(e)
        }
    }
}

/// 给会话屏 iframe 的 loopback。**不依赖 `connect()`** —— 人把安装版
/// 「给 web 配对」的完整 URL 贴进设置屏(存本机 `settings.toml`),或开发期
/// 塞 `BW_ORCA_WEB_URL` 覆盖;启动 Workbench 后原样打开。**先 env 后 `fallback`**
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

/// 按 agent 分流:返回 (Orca `prompt` 字段, `agentArgs` 字符串)。
fn split_prompt_and_args(
    agent: &str,
    prompt: &str,
    system: &str,
    _worktree: &Path,
) -> (String, String) {
    if agent == "cursor" {
        // 和 Claude 同一条路:一条单行交给 Orca,值用 shell_quote_single。
        // Orca 拆 token 再重引号(穿刺过)。旗标是 --force --trust;
        // 系统提示词是位置参数。cwd 已是 worktree,不另传 --workspace。
        // 标题+正文留在 Orca prompt,走 auto-submit。
        let system = flatten_for_argv(system);
        let mut parts = vec!["--force".into(), "--trust".into()];
        if !system.is_empty() {
            parts.push(shell_quote_single(&system));
        }
        (prompt.to_string(), parts.join(" "))
    } else {
        // Claude:启动命令一条单行。系统提示词 `--append-system-prompt`,
        // 标题+正文当位置参数。必须 shell 加引号,否则 Orca 拆 token 后只剩 You。
        // 裸换行压成空格:Orca 在 Windows 上把 agentArgs 打进 shell,换行=Enter。
        // 权限旗标和 PTY `build_startup_plan` 同一套,不另拼 LaunchPlan。
        let system = flatten_for_argv(system);
        let prompt = flatten_for_argv(prompt);
        let mut parts = Vec::new();
        if !system.is_empty() {
            parts.push(format!(
                "--append-system-prompt {}",
                shell_quote_single(&system)
            ));
        }
        if !prompt.is_empty() {
            parts.push(shell_quote_single(&prompt));
        }
        parts.push("--dangerously-skip-permissions".into());
        parts.push(format!(
            "--disallowedTools {}",
            shell_quote_single("Bash(gh pr merge)")
        ));
        (String::new(), parts.join(" "))
    }
}

/// 启动命令不能带裸换行(Windows shell 里就是 Enter)。空白压成单空格,语义不变。
fn flatten_for_argv(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
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

/// cursor-agent 认的项目目录名:非字母数字一段收成一个 `-`。
/// `D:\...\bridge\.bw\worktrees\issue-46` →
/// `D-builders-workbench-workspaces-bridge-bw-worktrees-issue-46`
fn cursor_agent_project_slug(abs: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in abs.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            dash = false;
        } else if !dash {
            out.push('-');
            dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

/// Orca `markCursorWorkspaceTrusted` 用的目录名:只把 `\ / : * ? " < > |` 收成
/// `-`,`.` 留下 → `...-bridge-.bw-worktrees-...`。cursor-agent 不认这份。
fn orca_cursor_project_slug(abs: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in abs.chars() {
        if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
            if !dash {
                out.push('-');
                dash = true;
            }
        } else {
            out.push(c);
            dash = false;
        }
    }
    out.trim_matches('-').to_string()
}

fn cursor_home() -> Option<PathBuf> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()
        .filter(|s| !s.is_empty())
        .map(|h| PathBuf::from(h).join(".cursor"))
}

/// 开工前写 cursor-agent 会查的 `.workspace-trusted`。Orca 自己也会预写,但
/// slug 对不上;人点 Trust 之后盘上会出现两份同路径、不同目录名的标记。
fn ensure_cursor_workspace_trusted(worktree: &Path) -> String {
    let abs = cursor_workspace_arg(worktree);
    let Some(home) = cursor_home() else {
        return "home=missing".into();
    };
    let projects = home.join("projects");
    let slugs = [
        ("agent", cursor_agent_project_slug(&abs)),
        ("orca", orca_cursor_project_slug(&abs)),
    ];
    let mut parts = Vec::new();
    for (kind, slug) in slugs {
        if slug.is_empty() {
            parts.push(format!("{kind}=empty"));
            continue;
        }
        let dir = projects.join(&slug);
        let file = dir.join(".workspace-trusted");
        if file.exists() {
            parts.push(format!("{kind}={slug}:exists"));
            continue;
        }
        if let Err(e) = std::fs::create_dir_all(&dir) {
            parts.push(format!("{kind}={slug}:mkdir_err={e}"));
            continue;
        }
        let body = json!({
            "trustedAt": SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0),
            "workspacePath": abs,
        });
        match std::fs::write(&file, format!("{body}\n")) {
            Ok(()) => parts.push(format!("{kind}={slug}:wrote")),
            Err(e) => parts.push(format!("{kind}={slug}:write_err={e}")),
        }
    }
    parts.join(" ")
}

/// `--workspace` 用的绝对路径:能 canonicalize 就用(去掉 Windows `\\?\`),
/// 斜杠在 Windows 上收成 `\`,和人在终端里贴的一致。
fn cursor_workspace_arg(worktree: &Path) -> String {
    let raw = worktree
        .canonicalize()
        .ok()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| worktree.display().to_string());
    let raw = raw
        .strip_prefix(r"\\?\")
        .or_else(|| raw.strip_prefix("//?/"))
        .unwrap_or(&raw);
    if cfg!(windows) {
        raw.replace('/', "\\")
    } else {
        raw.to_string()
    }
}

/// 对照日志用:旗标和 `--workspace` 路径原样留下,最后一段引号里的系统提示词
/// 只报字数,不写正文。
fn redact_agent_cmd(args: &str) -> String {
    if args.is_empty() {
        return "-".into();
    }
    for sep in [" \"", " '"] {
        if let Some(start) = args.rfind(sep) {
            let head = &args[..start];
            let q = sep.chars().last().unwrap();
            let inner = args[start + 2..]
                .strip_suffix(q)
                .unwrap_or(&args[start + 2..]);
            return format!("{head} {q}<system {} chars>{q}", inner.chars().count());
        }
    }
    args.to_string()
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
        agent_supports_ensure, claude_project_slug, client_operation_id, cursor_agent_project_slug,
        looks_session_id, orca_cursor_project_slug, pairing_as_query, split_prompt_and_args,
        OrcaError,
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
    fn handle_timeout_rpc_counts_as_side_effect_ok() {
        let e = OrcaError::Rpc(
            "terminal.createAgentSession · code=runtime_error · Timed out waiting for terminal handle after creation"
                .into(),
        );
        assert!(e.is_terminal_handle_timeout());
        assert!(
            !OrcaError::Rpc("agent_session_operation_invalid".into()).is_terminal_handle_timeout()
        );
        assert!(!OrcaError::Timeout {
            method: "terminal.createAgentSession".into()
        }
        .is_terminal_handle_timeout());
    }

    #[test]
    fn cursor_trust_slug_drops_dot_in_bw_orca_keeps_it() {
        let p = r"D:\builders-workbench\workspaces\bridge\.bw\worktrees\issue-46";
        assert_eq!(
            cursor_agent_project_slug(p),
            "D-builders-workbench-workspaces-bridge-bw-worktrees-issue-46"
        );
        assert_eq!(
            orca_cursor_project_slug(p),
            "D-builders-workbench-workspaces-bridge-.bw-worktrees-issue-46"
        );
    }

    fn cursor_agent_cannot_ensure_claude_can() {
        assert!(agent_supports_ensure("claude"));
        assert!(!agent_supports_ensure("cursor"));
        assert!(!agent_supports_ensure(""));
    }

    #[test]
    fn cursor_force_trust_system_as_positional_body_stays_on_prompt() {
        let tree = Path::new(r"D:\builders-workbench\workspaces\bridge\.bw\worktrees\issue-44");
        let (prompt, args) = split_prompt_and_args(
            "cursor",
            "#1 title\n\nbody line",
            "You are Workbench.\nRule 1.",
            tree,
        );
        assert_eq!(prompt, "#1 title\n\nbody line");
        assert!(
            args.starts_with("--force --trust '"),
            "和 Claude 同一套单引号: {args}"
        );
        assert!(!args.contains("--workspace"));
        assert!(!args.contains('\n'));
        assert!(args.contains("You are Workbench."));
        assert!(args.contains("Rule 1."));
        assert!(!args.contains("#1 title"));
        assert!(!args.contains("--append-system-prompt"));
        assert!(!args.contains("--dangerously-skip-permissions"));
    }

    #[test]
    fn claude_puts_system_and_body_on_one_line_startup() {
        let (prompt, args) = split_prompt_and_args(
            "claude",
            "#1 title\n\nbody line",
            "You are Workbench.\nRule 1.",
            Path::new("/tmp/unused"),
        );
        assert!(
            prompt.is_empty(),
            "Claude 不走 Orca auto-submit,避免和启动命令重复"
        );
        assert!(!args.contains('\n'));
        assert!(args.contains("--append-system-prompt"));
        assert!(args.contains("You are Workbench."));
        assert!(args.contains("#1 title"));
        assert!(args.contains("body line"));
        assert!(args.contains("--dangerously-skip-permissions"));
        assert!(args.contains("--disallowedTools"));
        assert!(args.contains("Bash(gh pr merge)"));
    }

    #[test]
    fn text_stats_count_newlines_and_preview_strips_breaks() {
        let (chars, bytes, nl) = super::text_stats("你是\nWorkbench");
        assert_eq!(nl, 1);
        assert!(chars > 0 && bytes > 0);
        assert_eq!(super::preview("a\nb\rc", 8), "a\\nb\\rc");
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
