#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Panel {
    #[default]
    Overview,
    Plan,
    Session,
    Config,
    Kb,
}

impl Panel {
    pub fn parse(s: &str) -> Option<Panel> {
        Some(match s {
            "overview" => Panel::Overview,
            "plan" => Panel::Plan,
            "session" => Panel::Session,
            "config" => Panel::Config,
            "kb" => Panel::Kb,
            _ => return None,
        })
    }

    pub fn label(self) -> &'static str {
        match self {
            Panel::Overview => "总览",
            Panel::Plan => "计划",
            Panel::Session => "会话",
            Panel::Config => "配置",
            Panel::Kb => "知识库",
        }
    }

    pub const ALL: [Panel; 5] = [
        Panel::Overview,
        Panel::Plan,
        Panel::Session,
        Panel::Config,
        Panel::Kb,
    ];
}

#[derive(Clone, Copy)]
pub struct PanelNav(pub dioxus::prelude::Signal<Panel>);

impl PanelNav {
    pub fn go(mut self, p: Panel) {
        use dioxus::prelude::WritableExt;
        self.0.set(p);
    }
}

/// Orca iframe 使用 WebView 原生层，启动遮罩期间需卸载嵌页。
pub const STARTING_SESSION: &str = "正在启动 Orca 会话…";

pub const SWITCHING_STATUS: &str = "正在更新状态…";

pub const REPORTING_LOG: &str = "日志上传中";
pub const REPORTING: &str = "上报中";

#[derive(Clone, Copy)]
pub struct ChromeBusy(pub dioxus::prelude::Signal<Option<String>>);

impl ChromeBusy {
    pub fn set(mut self, msg: impl Into<String>) {
        use dioxus::prelude::WritableExt;
        self.0.set(Some(msg.into()));
    }

    pub fn clear(mut self) {
        use dioxus::prelude::WritableExt;
        self.0.set(None);
    }

    pub fn get(self) -> Option<String> {
        use dioxus::prelude::ReadableExt;
        self.0.read().clone()
    }
}

#[derive(Clone, Copy)]
// 章节 ID 用 String 而不是 &'static str：指南 HTML 可以热加载，目录是运行时
// 从磁盘文件里扫出来的，借不到 'static。
pub struct GuideNav(pub dioxus::prelude::Signal<Option<String>>);

impl GuideNav {
    pub fn open(mut self, chapter: impl Into<String>) {
        use dioxus::prelude::WritableExt;
        self.0.set(Some(chapter.into()));
    }
    pub fn close(mut self) {
        use dioxus::prelude::WritableExt;
        self.0.set(None);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HelpTab {
    Home,
    Guide,
    Report,
}

impl HelpTab {
    pub fn parse(s: &str) -> Option<HelpTab> {
        Some(match s {
            "home" => HelpTab::Home,
            "guide" => HelpTab::Guide,
            "report" => HelpTab::Report,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy)]
pub struct HelpNav(pub dioxus::prelude::Signal<Option<HelpTab>>);

impl HelpNav {
    pub fn open(mut self, tab: HelpTab) {
        use dioxus::prelude::WritableExt;
        self.0.set(Some(tab));
    }
    pub fn close(mut self) {
        use dioxus::prelude::WritableExt;
        self.0.set(None);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TopView {
    Onboard,
    Settings,
}

impl TopView {
    pub fn parse(s: &str) -> Option<TopView> {
        Some(match s {
            "onboard" => TopView::Onboard,
            "settings" => TopView::Settings,
            _ => return None,
        })
    }
}
