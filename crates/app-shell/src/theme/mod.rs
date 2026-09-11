pub const GLOBAL_CSS: &str = concat!(
    include_str!("../../../../docs/04-design-system/styles.css"),
    "\n",
    include_str!("../../assets/shell.css"),
);

pub fn signal_color(s: Option<bw::Signal>) -> &'static str {
    match s {
        Some(bw::Signal::Green) => "var(--color-success)",
        Some(bw::Signal::Amber) => "var(--color-warning)",
        Some(bw::Signal::Red) => "var(--color-danger)",
        Some(bw::Signal::Unknown) | None => "var(--color-neutral-400)",
    }
}

pub fn signal_label(s: Option<bw::Signal>) -> &'static str {
    match s {
        Some(bw::Signal::Green) => "平稳",
        Some(bw::Signal::Amber) => "需要关注",
        Some(bw::Signal::Red) => "异常",
        Some(bw::Signal::Unknown) | None => "无数据",
    }
}
