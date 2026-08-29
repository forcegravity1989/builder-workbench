//! `bw-engine` —— V4 的能力底座:凡是要碰外部世界的都在这儿。
//!
//! 本机 Orca 的本地 pipe 客户端(会话开工,见 [`orca`])、工作区与 worktree 供给、
//! git 读数、GitHub / codehub 两个远端。**没有 UI,没有 SQL,也没有任何业务语义**
//! —— 它只知道「怎么开一棵树、怎么调一次本地 pipe、怎么读一次远端」。
//!
//! ## 它和 `bw-engine`(V3,见 v3 分支) 是什么关系
//!
//! 这是 2026-08-21 从 V3 底座**拷过来接管的**,不是复用。判据是
//! 用户拍板的一句话:V3 那一整个目录最终会被整体删掉,所以 V4 不能有任何一条
//! 依赖指向那边 —— 包括「只依赖 bw-engine(V3,见 v3 分支)」这种看起来很轻的耦合(它自己还依赖
//! `bw-core`(V3,见 v3 分支),V4 会顺着传递过去)。V3 已删,见 v3 分支。
//!
//! 拷过来的同时做了三件减法,所以这份比原来少了一半:
//!
//! 1. **断掉 `bw-core`(V3,见 v3 分支)**。原来四处用到它的 id 类型与 `PlaybookCtx`;现在底座只
//!    认裸 [`uuid::Uuid`],语义类型(`IssueId` 这些)留给上层各自包 —— 底座本来
//!    就不该知道一个 id 是「活」还是「会话」。
//! 2. **删掉只有 V3 用的出口**:仓文件解析(V4 自己在 `bw/src/repo/` 有一
//!    套)、`git log` 读数(V4 有 `bw/src/git.rs`)、`claude` 配置结构,以及
//!    十几个只被 V3 编排调用的远端函数。
//! 3. **删掉两条零调用死链**:`collect_count` 系(5 项)与 `create_mr`/`open_pr`
//!    系(4 项)。前者留下的 `time` 依赖也跟着退场。

#![forbid(unsafe_code)]

pub mod claude_bin;
pub mod codehub;
pub mod evidence;
pub mod github;
pub mod legacy_pty;
pub mod open_design;
pub mod orca;
pub mod remote;
pub mod win_cmd;
pub mod workspace;

// 根上只 re-export **真的被 `use bw_engine::{…}` 引到**的名字。其余类型仍然
// 可达(模块本身是 pub 的,如 `bw_engine::github::GithubError`),但不在根上再
// 列一遍 —— 这份清单是「底座对外承诺了什么」的说明书,混进一半死名字之后,
// 想改 `evidence` 的返回形状得先把十来个名字挨个 grep 一遍才敢下手,正是这次
// 拷贝想省掉的那笔账(评审抓的)。
pub use claude_bin::{resolve_claude_binary, which_on_path};
// headless 指挥器/测试的阻塞跑法(run_skill / MockInteractiveExecutor)还在用
// 这些名字 —— 桌面 ▶跑 不进 PTY,走 `orca`。trait/mock/plan 都在 `legacy_pty`。
pub use legacy_pty::interactive_cli::{
    build_resume_plan, build_startup_plan, InteractiveCliExecutor, InteractiveExecutor, LaunchPlan,
    MockInteractiveExecutor, PtyInput, TuiAgentConfig, CLAUDE, CURSOR,
};
pub use win_cmd::tokio_cmd;

/// 一次运行的上下文。
///
/// **这两个都是裸 UUID,不是语义类型** —— 底座不该知道一个 id 背后是项目还是
/// workflow,它只负责把这两个值原样带进日志和执行器。上层(`bw`)自己包成
/// `ProjectId` 这类类型,进来之前 `.uuid()` 一下即可。
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
