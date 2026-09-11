pub mod config;
pub mod kb;
pub mod onboard;
pub mod overview;
pub mod plan;
pub mod session;
pub mod settings;
pub mod wall;

use crate::bridge::{Bridge, Panel};
use crate::vm::ProjectVm;
use dioxus::prelude::*;

/// 各屏必须以组件挂载，确保 hook 状态属于各自作用域。
pub fn route(panel: Panel, project: &ProjectVm, bridge: &Bridge) -> Element {
    let p = project.clone();
    let b = bridge.clone();
    match panel {
        Panel::Overview => rsx! { overview::View { p, bridge: b } },
        Panel::Plan => rsx! { plan::View { p, bridge: b } },
        Panel::Session => rsx! { session::View { p, bridge: b } },
        Panel::Config => rsx! { config::View { p } },
        Panel::Kb => rsx! { kb::View { p, bridge: b } },
    }
}
