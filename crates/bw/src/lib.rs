//! Workbench 内核：领域模型、仓文件、命令和派生数据。

#![forbid(unsafe_code)]

pub mod app;
pub mod chat;
pub mod command;
pub mod defaults;
pub mod derive;
pub mod git;
pub mod isoweek;
pub mod local;
pub mod model;
pub mod repo;
pub mod standard;
pub mod trend;
pub mod version;

pub use command::{Command, Event};
pub use model::{Issue, IssueKind, IssueOrigin, IssueStatus, Project, Signal};
