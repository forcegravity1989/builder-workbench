//! 设计系统:Builder 设计系统的样式表 + 壳层样式 + 两个 Rust 侧要用到的取值函数。
//!
//! **正本是 `docs/04-design-system/styles.css`**(token + 组件类,规范在同目录
//! `spec.md`),编译期原样拼进来,不复制一份;壳骨架与各屏版式在
//! `assets/shell.css`,只写设计系统没有的东西,取值一律 `var(--*)`。
//! 屏里一律写 `class`,不写带色号 / 字号的行内样式。
//!
//! 剩下这两件是 Rust 必须做的:把信号枚举翻成颜色变量名和中文标签。
//! **没数据是灰,不是绿** —— 这条在配色上也守住。

/// 整张样式表。挂在 `document::Style` 上,全局生效。
pub const GLOBAL_CSS: &str = concat!(
    include_str!("../../../../docs/04-design-system/styles.css"),
    "\n",
    include_str!("../../assets/shell.css"),
);

/// 三态信号 + Unknown 灰,取设计系统的语义 token,不另写一套色号。
pub fn signal_color(s: Option<bw::Signal>) -> &'static str {
    match s {
        Some(bw::Signal::Green) => "var(--color-success)",
        Some(bw::Signal::Amber) => "var(--color-warning)",
        Some(bw::Signal::Red) => "var(--color-danger)",
        Some(bw::Signal::Unknown) | None => "var(--color-neutral-400)",
    }
}

/// 高保真上健康那一栏用的词。项目墙的健康概览条用的也是这四个。
pub fn signal_label(s: Option<bw::Signal>) -> &'static str {
    match s {
        Some(bw::Signal::Green) => "平稳",
        Some(bw::Signal::Amber) => "需要关注",
        Some(bw::Signal::Red) => "阻塞",
        Some(bw::Signal::Unknown) | None => "无数据",
    }
}
