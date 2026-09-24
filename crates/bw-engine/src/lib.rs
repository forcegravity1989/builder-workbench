//! 本机工具、远端平台与 Git 工作树的接口。

#![forbid(unsafe_code)]

pub mod claude_bin;
pub mod clawd;
pub mod dlog;
pub mod evidence;
pub mod legacy_pty;
pub mod open_design;
pub mod orca;
pub mod remote;
pub mod win_cmd;
pub mod workspace;

pub use claude_bin::{resolve_claude_binary, which_on_path};
pub use legacy_pty::interactive_cli::{
    build_resume_plan, build_startup_plan, InteractiveCliExecutor, InteractiveExecutor, LaunchPlan,
    MockInteractiveExecutor, PtyInput, TuiAgentConfig, CLAUDE, CURSOR,
};
pub use win_cmd::tokio_cmd;

/// 底座使用通用 UUID；其业务含义由调用方定义。
#[derive(Clone, Copy, Debug)]
pub struct RunCtx {
    pub project: uuid::Uuid,
    pub workflow: uuid::Uuid,
}

#[derive(Debug, thiserror::Error)]
pub enum ExecError {
    #[error("executor failed: {0}")]
    Failed(String),
}
