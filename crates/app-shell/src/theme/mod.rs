mod assets;

pub use assets::{apply_css, guide_html, log_boot as log_ui_boot, watch as watch_ui_assets};

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
