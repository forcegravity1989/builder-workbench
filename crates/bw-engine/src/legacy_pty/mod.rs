//! 封存的 PTY 旧实现(内嵌终端)。开工、接回、停止**不再走这里** —— 桌面壳
//! ▶跑改打 [`crate::orca`] 的本机 pipe。这一整包留下,是因为 `InteractiveExecutor`
//! trait + [`MockInteractiveExecutor`] + `LaunchPlan` / `build_startup_plan` /
//! `build_resume_plan` 还是 headless 指挥器与测试的阻塞跑法在用(没有界面渲染
//! 字节流,起 PTY 只会留一个没人读的子进程)。桌面 ▶跑 不准进 PTY;headless 阻塞
//! `run_skill` 可以留。
//!
//! 三个文件:`interactive_cli`(执行器 trait + mock + plan 构造)、`pty_backend`
//! (平台接缝:Windows conpty-oxide / macOS·Linux portable-pty)、`terminal_manager`
//! (集中管理:身份、channel、有界缓冲)。都不再被开工路径调用,只是还在编译。
//! 依赖(`conpty-oxide` / `portable-pty` / `nix`)留在 `Cargo.toml`,不为「封存」
//! 删编译 —— 封存不是删,是开工路径不调用。

pub mod interactive_cli;
pub mod pty_backend;
pub mod terminal_manager;
