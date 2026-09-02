//! 出包:pack → e2e,不打标签。
//!
//! 计划屏「出包」走这里。`CutRelease` / 「发版本」只建远端 Release,不拉脚本。
//! 脚本入口与 JSONL 见 ADR-0005。这一层只拉起、读 stdout、报 [`ProgressLine`],
//! 不在壳里 `CreateProcess`。

use super::{App, AppError, ProgressLine, Result};
use crate::command::Event;
use crate::model::ProjectId;
use serde::Deserialize;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
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

        let pack = self
            .run_ship_stage(
                STEP_PACK,
                "正在出包…",
                "出包",
                &pack_cmd,
                &version,
                &workspace,
            )
            .await?;
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

        let e2e = self
            .run_ship_stage(
                STEP_E2E,
                "正在验包…",
                "验包",
                &e2e_cmd,
                &version,
                &workspace,
            )
            .await?;
        let e2e_text = e2e_done_text(&e2e);
        if !e2e.ok {
            self.step(ProgressLine::fail(STEP_E2E, e2e_text.clone()));
            return Err(AppError::Refused(if e2e.message.is_empty() {
                e2e_text
            } else {
                e2e.message
            }));
        }
        self.step(ProgressLine::ok(STEP_E2E, e2e_text));

        Ok(vec![Event::ReleasePacked {
            version,
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

    async fn run_ship_stage(
        &self,
        step: u8,
        start_text: &str,
        label: &str,
        cmd: &Path,
        version: &str,
        workdir: &Path,
    ) -> Result<StageOutcome> {
        self.step(ProgressLine::doing(step, start_text));
        match run_release_cmd(cmd, version, workdir, |msg| {
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
}

#[derive(Debug, PartialEq, Eq)]
enum Parsed {
    Progress { message: String },
    Result(StageOutcome),
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
    mut on_progress: impl FnMut(String),
) -> std::result::Result<StageOutcome, String> {
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
        let mut reader = BufReader::new(stdout).lines();
        let mut outcome = StageOutcome::default();
        let mut saw_result = false;
        while let Some(line) = reader
            .next_line()
            .await
            .map_err(|e| format!("读标准输出失败:{e}"))?
        {
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
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn ignore_noise() {
        assert_eq!(parse_protocol_line("Compiling app-shell"), None);
        assert_eq!(parse_protocol_line(""), None);
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
        let out = run_release_cmd(&cmd, "v0.1", &dir, |m| seen.push(m))
            .await
            .unwrap();
        assert_eq!(seen, vec!["hi".to_string()]);
        assert!(out.ok);
        assert_eq!(out.artifact_dir.as_deref(), Some(r"C:\out"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
