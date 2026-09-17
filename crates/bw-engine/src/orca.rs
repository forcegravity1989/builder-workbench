use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

const RPC_TIMEOUT: Duration = Duration::from_secs(45);
const ACTIVATE_TIMEOUT: Duration = Duration::from_secs(12);
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CreateSessionOutcome {
    Ready,
    HandleTimeout,
}

impl OrcaError {
    /// 渲染进程可能已启动 agent，但主进程尚未返回句柄；调用方需等待后再切树。
    pub fn is_terminal_handle_timeout(&self) -> bool {
        matches!(
            self,
            OrcaError::Rpc(s) if s.contains("Timed out waiting for terminal handle after creation")
        )
    }
}

/// 运行时 token 仅留内存，不能写入事件、会话文件或日志。
#[derive(Clone, Debug)]
pub struct OrcaRuntime {
    endpoint: String,
    auth_token: String,
    runtime_id: String,
    pid: Option<i64>,
}

pub fn diag_log_path() -> PathBuf {
    crate::dlog::log_path()
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
    pub fn log_tag(&self) -> String {
        format!(
            "runtimeId={} pid={} {}",
            self.runtime_id,
            self.pid.unwrap_or(0),
            self.endpoint
        )
    }
}

/// 读取本机运行时文件；缺端点或 token 时返回错误。
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
    crate::dlog!(ok, "orca", "connect ok · {}", rt.log_tag());
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

pub async fn reveal_tree(rt: &OrcaRuntime, worktree: &Path) -> Result<(), OrcaError> {
    activate_worktree(rt, worktree).await
}

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

pub async fn ensure_repo(rt: &OrcaRuntime, repo: &Path) -> Result<(), OrcaError> {
    match repo_present(rt, repo).await {
        Ok(true) => {
            crate::dlog!(ok, "orca", "repo present worktree={}", path_prefixed(repo));
            return Ok(());
        }
        Ok(false) => {
            crate::dlog!(
                ok,
                "orca",
                "repo missing, add worktree={}",
                path_prefixed(repo)
            );
        }
        Err(e) => {
            crate::dlog!(
                err,
                "orca",
                "repo show fail:{e} · {} · worktree={}",
                rt.log_tag(),
                path_prefixed(repo)
            );
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
    // 已登记的仓库不因可见性更新失败而中断；不要改变 Orca 的工作区根目录。
    let _ = publish_visibility(rt, repo).await;
    Ok(())
}

/// 新工作树尚未进入 Orca 扫描缓存时，需先刷新再按路径选择。
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
    // 空串按 Orca OptionalString 解析为 undefined，用于清除错误的扫描根。
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

#[derive(Clone, Debug)]
pub struct AutomationRow {
    pub name: String,
    pub project_id: String,
}

pub struct AutomationCreate<'a> {
    pub name: &'a str,
    pub prompt: &'a str,
    pub repo: &'a Path,
    pub workspace: &'a Path,
    pub reuse_session: bool,
    pub rrule: &'a str,
    pub timezone: &'a str,
    pub enabled: bool,
}

pub async fn repo_id(rt: &OrcaRuntime, repo: &Path) -> Result<String, OrcaError> {
    let shown = call(
        rt,
        "repo.show",
        json!({ "repo": path_prefixed(repo) }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    require_ok(&shown, "repo.show")?;
    shown
        .pointer("/result/repo/id")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| OrcaError::BadFrame("repo.show 回包没有 result.repo.id".into()))
}

pub async fn list_automations(rt: &OrcaRuntime) -> Result<Vec<AutomationRow>, OrcaError> {
    // 只看本机主机。不带 selector 时 Orca 会把 Local Windows 和 Orca Server
    // 的行都回过来,Web 端看起来像每种任务两份。
    let frame = call(
        rt,
        "automation.list",
        json!({ "selector": { "kind": "self" } }),
        ACTIVATE_TIMEOUT,
    )
    .await?;
    require_ok(&frame, "automation.list")?;
    let rows = frame
        .pointer("/result/automations")
        .or_else(|| frame.get("automations"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(rows
        .iter()
        .filter_map(|v| {
            let name = v.get("name")?.as_str()?.to_string();
            let project_id = v
                .get("projectId")
                .or_else(|| v.get("project_id"))
                .and_then(|p| p.as_str())
                .unwrap_or("")
                .to_string();
            Some(AutomationRow { name, project_id })
        })
        .collect())
}

pub async fn create_automation(
    rt: &OrcaRuntime,
    spec: &AutomationCreate<'_>,
) -> Result<(), OrcaError> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let params = json!({
        "name": spec.name,
        "prompt": spec.prompt,
        "agentId": "claude",
        "repo": path_prefixed(spec.repo),
        "workspace": path_prefixed(spec.workspace),
        "workspaceMode": "existing",
        "reuseSession": spec.reuse_session,
        "timezone": spec.timezone,
        "rrule": spec.rrule,
        "dtstart": now_ms,
        "enabled": spec.enabled,
        // 钉本机。不写的话 Web 目录会再挂一份 Orca Server,本地树在那边跑不了。
        "destination": { "selector": { "kind": "self" } },
    });
    let frame = call(rt, "automation.create", params, ACTIVATE_TIMEOUT).await?;
    require_ok(&frame, "automation.create")
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

pub async fn activate_worktree(rt: &OrcaRuntime, worktree: &Path) -> Result<(), OrcaError> {
    let params = json!({
        "worktree": path_prefixed(worktree),
        "notifyClients": true,
    });
    let frame = call(rt, "worktree.activate", params, ACTIVATE_TIMEOUT).await?;
    require_ok(&frame, "worktree.activate")
}

/// 由本层按执行工具拼装参数，调用方只提供用户提示词和系统提示词。
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
    crate::dlog!(
        ok,
        "orca",
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
    );
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
            crate::dlog!(
                err,
                "orca",
                "create rpc elapsed_ms={elapsed_ms} verdict=transport_err err={e}"
            );
            return Err(e);
        }
    };
    match require_ok(&frame, "terminal.createAgentSession") {
        Ok(()) => {
            crate::dlog!(
                ok,
                "orca",
                "create rpc elapsed_ms={elapsed_ms} verdict=ready"
            );
            Ok(CreateSessionOutcome::Ready)
        }
        Err(e) if e.is_terminal_handle_timeout() => {
            crate::dlog!(
                warn,
                "orca",
                "create rpc elapsed_ms={elapsed_ms} verdict=handle_timeout brief={e}"
            );
            Ok(CreateSessionOutcome::HandleTimeout)
        }
        Err(e) => {
            crate::dlog!(
                err,
                "orca",
                "create rpc elapsed_ms={elapsed_ms} verdict=rpc_error brief={e}"
            );
            Err(e)
        }
    }
}

/// 嵌入页地址独立于 RPC 连接；环境变量覆盖本机设置，仅允许 loopback。
pub fn web_embed_url(fallback: Option<&str>) -> Option<String> {
    let env = std::env::var("BW_ORCA_WEB_URL").ok();
    let raw = env.as_deref().or(fallback)?;
    let trimmed = raw.trim();
    if trimmed.is_empty() || !crate::open_design::looks_loopback_http(trimmed) {
        return None;
    }
    Some(pairing_as_query(trimmed))
}

/// WebView2 可能丢失 fragment，将配对参数同时放入 query。
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

/// 按 Claude 的路径编码查找最新会话 ID；找不到返回 None。
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

fn request_id() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = (std::process::id() as u64) ^ (now as u64).wrapping_mul(2654435761);
    format!("bw-{now:016x}-{rand:016x}")
}

/// Orca 要求 clientOperationId 为 13 位毫秒时间戳加 32 位十六进制串。
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

fn split_prompt_and_args(
    agent: &str,
    prompt: &str,
    system: &str,
    _worktree: &Path,
) -> (String, String) {
    if agent == "cursor" {
        // Cursor 参数同样经过 shell 引号处理。
        let system = flatten_for_argv(system);
        let mut parts = vec!["--force".into(), "--trust".into()];
        if !system.is_empty() {
            parts.push(shell_quote_single(&system));
        }
        (prompt.to_string(), parts.join(" "))
    } else {
        // 提示词作为完整参数加引号，防止 Orca 分词截断。
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
/// 两种形式均保持为一个参数，供 Orca 解析后重新加引号传给 Claude。
fn shell_quote_single(value: &str) -> String {
    #[cfg(windows)]
    {
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

/// cursor-agent 的路径编码：连续非字母数字字符替换为一个短横线。
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

/// Orca 信任标记只替换文件名非法字符，保留点号，与 cursor-agent 编码不同。
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

/// 按 cursor-agent 自身的路径编码写信任标记，避免与 Orca 的编码混用。
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

/// 日志保留参数名和工作区路径，提示词只记录长度。
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

/// 阻塞 RPC 自带 deadline；外层 timeout 无法终止已经运行的阻塞任务。
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
    let started = Instant::now();
    let handle =
        tokio::task::spawn_blocking(move || send_recv(&endpoint, &frame, &id_for_recv, timeout));
    let result: Result<Value, OrcaError> = match tokio::time::timeout(timeout, handle).await {
        Err(_) => Err(OrcaError::Timeout {
            method: method_for_err,
        }),
        Ok(Err(e)) => Err(OrcaError::Connect(e.to_string())),
        Ok(Ok(inner)) => inner,
    };
    let elapsed_ms = started.elapsed().as_millis();
    match &result {
        Ok(v) if v.get("ok").and_then(|o| o.as_bool()) == Some(true) => {
            crate::dlog!(ok, "orca", "rpc method={method} elapsed_ms={elapsed_ms} ok");
        }
        Ok(v) => {
            crate::dlog!(
                err,
                "orca",
                "rpc method={method} elapsed_ms={elapsed_ms} {}",
                error_brief(v, method)
            );
        }
        Err(e) => {
            crate::dlog!(
                err,
                "orca",
                "rpc method={method} elapsed_ms={elapsed_ms} err={e}"
            );
        }
    }
    result
}

/// 按行读取并匹配请求 ID，跳过 keepalive，不等待连接关闭。
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
    // 收到完整行后再解析 UTF-8，避免分块读取截断多字节字符。
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
        }
    }
    Err(OrcaError::BadFrame(format!(
        "没收到 id={id} 的回包(pipe 关了)"
    )))
}

fn require_ok(frame: &Value, method: &str) -> Result<(), OrcaError> {
    if frame.get("ok").and_then(|o| o.as_bool()) == Some(true) {
        return Ok(());
    }
    Err(OrcaError::Rpc(error_brief(frame, method)))
}

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

// Windows 使用命名管道，Unix 使用本地 socket。

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

    #[test]
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
