//! 一个外部能力一个适配模块。
//!
//! 每个目录里必须有一份 `README.md`,固定三段:**借自哪个项目/文件**、
//! **借了什么**、**没借什么**。这样以后持续借鉴也不会变成散弹式修改。
//!
//! 已经开出来的:
//!
//! - [`claude_cli`] —— Claude CLI 开工工具(声明 + 探活)
//! - [`codegraph`] —— 代码图子进程(探活三态 + 大文件榜)
//!
//! 终端不挂在壳上:开工走 Orca 本地 pipe,字节流在 Orca 里,Workbench 壳不渲染
//! 终端(旧 xterm.js + PTY 字节桥整包已删)。
//!
//! Cursor 与 Open Design 不单开适配模块:前者是开工工具声明+探活(见
//! `bw::app::tools`、`.bw/config/issue-policy.toml`),后者走会话屏内嵌(见
//! architecture 模块 8/9)。
//!
//! **项目群不在这里**:它是内核那一层的能力(通知同步、周计划拉群历史都在
//! 用例里发生,不是界面动作),正本在 `bw::chat`。这里曾经放过一份只有
//! trait 的占位,C 刀真实现落地后已经删掉 —— 不留两份接口。

pub mod claude_cli;
pub mod codegraph;
