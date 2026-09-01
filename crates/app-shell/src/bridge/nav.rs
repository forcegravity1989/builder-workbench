//! 界面内部的导航类型:去哪个入口、去哪个顶层屏、指南翻到哪一章。
//!
//! **这些都不经内核**。切入口、开抽屉、从项目墙跳到接入屏,全是纯本机导航,
//! 不改任何数据,所以它们不是 `Req`,而是各屏都拿得到的共享信号。放在桥这个
//! 模块下是因为深链(`BW_PANEL` / `BW_VIEW`)要用同一套枚举解析。

/// 深链要跳到哪。
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

/// 「跳到另一个入口」的口子。五入口之间切换是**纯本机导航**,不经内核 ——
/// 所以它不是一条 `Req`,而是一个各屏都拿得到的信号。屏里想跳(总览的
/// 通知里点一条跳会话)就 `use_context::<PanelNav>()`。
#[derive(Clone, Copy)]
pub struct PanelNav(pub dioxus::prelude::Signal<Panel>);

impl PanelNav {
    pub fn go(mut self, p: Panel) {
        use dioxus::prelude::WritableExt;
        self.0.set(p);
    }
}

/// 开工立刻盖住。点「开始本周」/ Start 时先立,等内核 `Vm.busy` 接上或收工再撤。
/// Orca iframe 是 WebView 原生层,只靠 `.busy-mask` 盖不住已经挂上的嵌页。
pub const STARTING_SESSION: &str = "正在开工,Orca 要几秒把会话拉起来。先别点嵌页。";

/// 拖拽 / 详情改状态:等远端写标签,不重拉 issue 名单。
pub const SWITCHING_STATUS: &str = "issue 状态切换中";

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

/// 指南抽屉开着还是收着。`None` = 收着。和 [`PanelNav`] 一样是纯本机导航,
/// 所以也走 context 不走 `Req` —— 项目墙环境条「怎么处理 →」也能打开。
/// 正文是编进二进制的产品指南,不再自写章节。
#[derive(Clone, Copy)]
pub struct GuideNav(pub dioxus::prelude::Signal<Option<&'static str>>);

impl GuideNav {
    pub fn open(mut self, chapter: &'static str) {
        use dioxus::prelude::WritableExt;
        self.0.set(Some(chapter));
    }
    pub fn close(mut self) {
        use dioxus::prelude::WritableExt;
        self.0.set(None);
    }
}

/// 顶层三屏里不依赖「打开某个项目」的那两个。
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
