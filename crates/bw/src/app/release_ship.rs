//! 出包:pack → e2e,不打标签。
//!
//! 计划屏「出包」走这里。`CutRelease` / 「发版本」只建远端 Release,不拉脚本。
//! 脚本入口与 JSONL 见 ADR-0005。这一层只拉起、读 stdout、报 [`ProgressLine`],
//! 不在壳里 `CreateProcess`。

use super::{App, AppError, ProgressCase, ProgressLine, Result};
use crate::{command::Event, model::ProjectId};
use serde::Deserialize;
use std::{path::Path, process::Stdio, time::Duration};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};

/// 弹窗第一行。避开接入屏那几个 1/2/3,两边同时订广播也不会串行。
const STEP_PACK: u8 = 21;
/// 弹窗第二行。
const STEP_E2E: u8 = 22;
const PACK_REL: &str = ".bw/release/pack/pack.cmd";
const E2E_REL: &str = ".bw/release/e2e/e2e.cmd";

/// 出包含 release 编译 + ISCC + 静默装校验,验包装完还要点两屏。
const STAGE_TIMEOUT: Duration = Duration::from_secs(45 * 60);

impl App {
    pub(super) async fn pack_release(
        &mut self,
        project_id: ProjectId,
        version: String,
    ) -> Result<Vec<Event>> {
        let version = version.trim().to_string();
        if version.is_empty()
            || version.contains('(')
            || version.contains('\\')
            || version.contains('/')
        {
            return self.ship_refuse(STEP_PACK, "版本号不要空、不要带括号或路径分隔符");
        }
        let project = match self.project_of(project_id).await {
            Ok(p) => p,
            Err(e) => return self.ship_refuse(STEP_PACK, e.to_string()),
        };

        let workspace = match self.workspace_of(project_id).await {
            Ok(p) => p,
            Err(e) => return self.ship_refuse(STEP_PACK, e.to_string()),
        };
        if !workspace.is_dir() {
            return self.ship_refuse(
                STEP_PACK,
                format!("{} 还没有配工作区,出包需要一个真实的仓", project.slug),
            );
        }
        let pack_cmd = workspace.join(PACK_REL);
        let e2e_cmd = workspace.join(E2E_REL);
        if !pack_cmd.is_file() {
            return self.ship_refuse(
                STEP_PACK,
                format!(
                    "仓里没有出包入口 {}。按 ADR-0005 放到被管仓根下。",
                    pack_cmd.display()
                ),
            );
        }
        if !e2e_cmd.is_file() {
            return self.ship_refuse(
                STEP_PACK,
                format!(
                    "还缺验包入口 {}。先补上再出,免得出了包却不能验收。",
                    e2e_cmd.display()
                ),
            );
        }

        self.pack_ctl.begin(workspace.clone(), version.clone());
        let out = self
            .pack_release_run(&pack_cmd, &e2e_cmd, &version, &workspace)
            .await;
        self.pack_ctl.finish();
        out
    }

    async fn pack_release_run(
        &self,
        pack_cmd: &Path,
        e2e_cmd: &Path,
        version: &str,
        workspace: &Path,
    ) -> Result<Vec<Event>> {
        let pack = match self
            .run_ship_stage(STEP_PACK, "正在出包…", "出包", pack_cmd, version, workspace)
            .await
        {
            Ok(o) => o,
            Err(e) => return self.ship_stopped_or(STEP_PACK, version, e),
        };
        if self.pack_ctl.is_cancelled() {
            return self.ship_stopped(STEP_PACK, version);
        }
        if !pack.ok {
            let text = pack_fail_text(&pack);
            self.step(ProgressLine::fail(STEP_PACK, text.clone()));
            return Err(AppError::Refused(text));
        }
        self.step(ProgressLine::ok(
            STEP_PACK,
            pack.artifact_dir
                .clone()
                .unwrap_or_else(|| "出包好了".into()),
        ));

        let e2e = match self
            .run_ship_stage(STEP_E2E, "正在验包…", "验包", e2e_cmd, version, workspace)
            .await
        {
            Ok(o) => o,
            Err(e) => return self.ship_stopped_or(STEP_E2E, version, e),
        };
        if self.pack_ctl.is_cancelled() {
            return self.ship_stopped(STEP_E2E, version);
        }
        let e2e_text = e2e_done_text(&e2e);
        if !e2e.ok {
            self.step(ProgressLine::fail(STEP_E2E, e2e_text.clone()).with_cases(e2e.cases.clone()));
            return Err(AppError::Refused(if e2e.message.is_empty() {
                e2e_text
            } else {
                e2e.message
            }));
        }
        self.step(ProgressLine::ok(STEP_E2E, e2e_text).with_cases(e2e.cases));

        Ok(vec![Event::ReleasePacked {
            version: version.to_string(),
            artifact_dir: pack.artifact_dir.unwrap_or_default(),
            passed: e2e.passed.unwrap_or(0),
            total: e2e.total.unwrap_or(0),
        }])
    }

    fn ship_refuse(&self, step: u8, why: impl Into<String>) -> Result<Vec<Event>> {
        let why = why.into();
        self.step(ProgressLine::fail(step, why.clone()));
        Err(AppError::Refused(why))
    }

    fn ship_stopped(&self, step: u8, version: &str) -> Result<Vec<Event>> {
        self.step(ProgressLine::fail(step, "已停止"));
        Ok(vec![Event::ReleasePackStopped {
            version: version.to_string(),
        }])
    }

    fn ship_stopped_or(&self, step: u8, version: &str, err: AppError) -> Result<Vec<Event>> {
        if self.pack_ctl.is_cancelled() || err.to_string().contains("已停止") {
            self.ship_stopped(step, version)
        } else {
            Err(err)
        }
    }

    async fn run_ship_stage(
        &self,
        step: u8,
        start_text: &str,
        label: &str,
        cmd: &Path,
        version: &str,
        workdir: &Path,
    ) -> Result<StageOutcome> {
        if self.pack_ctl.is_cancelled() {
            return Err(AppError::Refused("已停止".into()));
        }
        self.step(ProgressLine::doing(step, start_text));
        match run_release_cmd(cmd, version, workdir, &self.pack_ctl, |msg| {
            self.step(ProgressLine::doing(step, msg));
        })
        .await
        {
            Ok(o) => Ok(o),
            Err(why) => {
                self.step(ProgressLine::fail(step, why.clone()));
                Err(AppError::Refused(format!("{label}没做成:{why}")))
            }
        }
    }
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct StageOutcome {
    ok: bool,
    message: String,
    artifact_dir: Option<String>,
    passed: Option<u32>,
    total: Option<u32>,
    cases: Vec<ProgressCase>,
}

#[derive(Debug, Deserialize)]
struct ProtocolCase {
    #[serde(default)]
    name: String,
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ProtocolLine {
    #[serde(default)]
    v: u32,
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    ok: Option<bool>,
    #[serde(default)]
    artifact_dir: Option<String>,
    #[serde(default)]
    passed: Option<u32>,
    #[serde(default)]
    total: Option<u32>,
    #[serde(default)]
    cases: Vec<ProtocolCase>,
}

#[derive(Debug, PartialEq, Eq)]
enum Parsed {
    Progress { message: String },
    Result(StageOutcome),
}

fn trim_line_ending(raw: &mut Vec<u8>) {
    while matches!(raw.last(), Some(&b'\n') | Some(&b'\r')) {
        raw.pop();
    }
}

/// 协议行是 UTF-8。Windows 上 cargo / ISCC / PowerShell 常往 stdout 漏 GBK 或 UTF-16,
/// 那些行当噪声丢掉,不能整段读失败(ADR-0005:stdout 只认 JSONL)。
fn decode_ship_line(raw: &[u8]) -> Option<String> {
    if raw.is_empty() {
        return None;
    }
    if let Ok(s) = std::str::from_utf8(raw) {
        return Some(s.to_string());
    }
    decode_utf16_le_json(raw)
}

fn decode_utf16_le_json(raw: &[u8]) -> Option<String> {
    let raw = if raw.len() >= 2 && raw[0] == 0xFF && raw[1] == 0xFE {
        &raw[2..]
    } else {
        raw
    };
    if raw.len() < 4 || raw.len() % 2 != 0 {
        return None;
    }
    if raw[1] != 0 || (raw[0] != b'{' && raw[0] != b'[') {
        return None;
    }
    let u16s: Vec<u16> = raw
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16(&u16s).ok()
}

fn parse_protocol_line(raw: &str) -> Option<Parsed> {
    let line: ProtocolLine = serde_json::from_str(raw.trim()).ok()?;
    if line.v != 0 && line.v != 1 {
        return None;
    }
    match line.kind.as_str() {
        "progress" => Some(Parsed::Progress {
            message: line
                .message
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "进行中…".into()),
        }),
        "result" => Some(Parsed::Result(StageOutcome {
            ok: line.ok.unwrap_or(false),
            message: line.message.unwrap_or_default(),
            artifact_dir: line.artifact_dir.filter(|s| !s.is_empty()),
            passed: line.passed,
            total: line.total,
            cases: line
                .cases
                .into_iter()
                .map(|c| ProgressCase {
                    name: c.name,
                    ok: c.ok,
                    message: c.message.unwrap_or_default(),
                })
                .collect(),
        })),
        _ => None,
    }
}

fn pack_fail_text(o: &StageOutcome) -> String {
    if o.message.is_empty() {
        "出包没过".into()
    } else {
        o.message.clone()
    }
}

fn e2e_done_text(o: &StageOutcome) -> String {
    match (o.passed, o.total) {
        (Some(p), Some(t)) => format!("{p}/{t}"),
        _ if o.message.is_empty() => "验包没打出结果".into(),
        _ => o.message.clone(),
    }
}

async fn run_release_cmd(
    cmd: &Path,
    version: &str,
    workdir: &Path,
    ctl: &super::PackCtl,
    mut on_progress: impl FnMut(String),
) -> std::result::Result<StageOutcome, String> {
    if ctl.is_cancelled() {
        return Err("已停止".into());
    }
    let mut child = bw_engine::tokio_cmd(cmd)
        .arg("--version")
        .arg(version)
        .arg("--workdir")
        .arg(workdir)
        .current_dir(workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("起不动 {}: {e}", cmd.display()))?;
    if let Some(pid) = child.id() {
        ctl.set_child(pid);
    }

    if let Some(mut err) = child.stderr.take() {
        tokio::spawn(async move {
            let mut sink = Vec::new();
            let _ = err.read_to_end(&mut sink).await;
        });
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "起了进程但拿不到标准输出".to_string())?;
    let read = async {
        let mut reader = BufReader::new(stdout);
        let mut raw = Vec::new();
        let mut outcome = StageOutcome::default();
        let mut saw_result = false;
        loop {
            raw.clear();
            let n = reader
                .read_until(b'\n', &mut raw)
                .await
                .map_err(|e| format!("读标准输出失败:{e}"))?;
            if n == 0 {
                break;
            }
            trim_line_ending(&mut raw);
            let Some(line) = decode_ship_line(&raw) else {
                continue;
            };
            match parse_protocol_line(&line) {
                Some(Parsed::Progress { message }) => on_progress(message),
                Some(Parsed::Result(o)) => {
                    outcome = o;
                    saw_result = true;
                }
                None => {}
            }
        }
        Ok::<_, String>((outcome, saw_result))
    };

    let (outcome, saw_result) = match tokio::time::timeout(STAGE_TIMEOUT, read).await {
        Err(_) => {
            let _ = child.kill().await;
            return Err(format!(
                "超过 {} 分钟还没打出结果",
                STAGE_TIMEOUT.as_secs() / 60
            ));
        }
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(e);
        }
        Ok(Ok(v)) => v,
    };

    let status = child
        .wait()
        .await
        .map_err(|e| format!("等进程结束失败:{e}"))?;
    ctl.clear_child();
    if ctl.is_cancelled() {
        return Err("已停止".into());
    }
    if !saw_result {
        return Err(format!("没有打出结果行(退出码 {status})"));
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_progress() {
        let p = parse_protocol_line(
            r#"{"v":1,"type":"progress","phase":"probe","message":"在找 ISCC.exe"}"#,
        );
        assert_eq!(
            p,
            Some(Parsed::Progress {
                message: "在找 ISCC.exe".into()
            })
        );
    }

    #[test]
    fn parse_pack_ok() {
        let p = parse_protocol_line(
            r#"{"v":1,"type":"result","ok":true,"artifact_dir":"D:\\proj\\.bw\\release\\out\\v0.1"}"#,
        );
        match p {
            Some(Parsed::Result(o)) => {
                assert!(o.ok);
                assert_eq!(
                    o.artifact_dir.as_deref(),
                    Some(r"D:\proj\.bw\release\out\v0.1")
                );
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parse_e2e_counts() {
        let p = parse_protocol_line(r#"{"v":1,"type":"result","ok":false,"passed":2,"total":3}"#);
        match p {
            Some(Parsed::Result(o)) => {
                assert!(!o.ok);
                assert_eq!(e2e_done_text(&o), "2/3");
                assert!(o.cases.is_empty());
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parse_e2e_cases() {
        let p = parse_protocol_line(
            r#"{"v":1,"type":"result","ok":false,"passed":1,"total":3,"cases":[{"name":"shell_launches","ok":true},{"name":"cu_settings","ok":false,"message":"timeout"},{"name":"cu_onboard","ok":false,"message":"未跑：上一条失败"}]}"#,
        );
        match p {
            Some(Parsed::Result(o)) => {
                assert_eq!(o.cases.len(), 3);
                assert!(o.cases[0].ok);
                assert!(!o.cases[1].ok);
                assert_eq!(o.cases[1].message, "timeout");
                assert!(o.cases[2].message.starts_with("未跑："));
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn ignore_noise() {
        assert_eq!(parse_protocol_line("Compiling app-shell"), None);
        assert_eq!(parse_protocol_line(""), None);
    }

    #[test]
    fn decode_skips_invalid_utf8() {
        assert_eq!(decode_ship_line(&[0xFF, 0xFE, 0x00]), None);
        assert_eq!(
            decode_ship_line(br#"{"v":1,"type":"progress","phase":"p","message":"hi"}"#).as_deref(),
            Some(r#"{"v":1,"type":"progress","phase":"p","message":"hi"}"#)
        );
    }

    #[test]
    fn decode_utf16_le_progress() {
        let text = r#"{"v":1,"type":"progress","phase":"p","message":"hi"}"#;
        let mut raw = vec![0xFF, 0xFE];
        for u in text.encode_utf16() {
            raw.extend_from_slice(&u.to_le_bytes());
        }
        assert_eq!(decode_ship_line(&raw).as_deref(), Some(text));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn spawn_fake_pack_cmd() {
        let dir = std::env::temp_dir().join(format!("bw-ship-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let cmd = dir.join("pack.cmd");
        std::fs::write(
            &cmd,
            "@echo off\r\necho {\"v\":1,\"type\":\"progress\",\"phase\":\"probe\",\"message\":\"hi\"}\r\necho {\"v\":1,\"type\":\"result\",\"ok\":true,\"artifact_dir\":\"C:\\\\out\"}\r\n",
        )
        .unwrap();
        let mut seen = Vec::new();
        let ctl = crate::app::PackCtl::new();
        let out = run_release_cmd(&cmd, "v0.1", &dir, &ctl, |m| seen.push(m))
            .await
            .unwrap();
        assert_eq!(seen, vec!["hi".to_string()]);
        assert!(out.ok);
        assert_eq!(out.artifact_dir.as_deref(), Some(r"C:\out"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn skip_invalid_utf8_line_then_result() {
        let dir = std::env::temp_dir().join(format!("bw-ship-bin-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let cmd = dir.join("pack.cmd");
        let mut body = b"@echo off\r\necho ".to_vec();
        body.push(0xFF);
        body.extend_from_slice(
            b"\r\necho {\"v\":1,\"type\":\"result\",\"ok\":true,\"artifact_dir\":\"C:\\\\out\"}\r\n",
        );
        std::fs::write(&cmd, body).unwrap();
        let ctl = crate::app::PackCtl::new();
        let out = run_release_cmd(&cmd, "v0.1", &dir, &ctl, |_| {})
            .await
            .unwrap();
        assert!(out.ok);
        assert_eq!(out.artifact_dir.as_deref(), Some(r"C:\out"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
