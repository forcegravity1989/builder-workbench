//! 项目内 · 配置。能力(开工工具映射、技能与 workflow)搬去设置屏了 ——
//! 它们本来就是全局的,`Settings.tools` 没有项目维度,摆在项目屏里等于
//! 告诉人「这是这个项目的设置」,而它不是。这里只留真正跟项目走的三样:
//! 远端、项目群、节律。
//!
//! 版式走设计系统的「设置文法」:小节 + 一张分组,每行「标题 + 一句说明 +
//! 行尾控件」。

use crate::vm::ProjectVm;
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm) -> Element {
    let c = &p.config;
    rsx! {
        section { "data-screen": "config",
            div { class: "page-head",
                div {
                    h1 { "配置" }
                }
            }

            div { class: "section",
                div { h3 { class: "section-title", "远端" } }
            }
            div { class: "set-group",
                div { class: "set-row",
                    div { class: "set-text",
                        div { class: "set-title", "仓地址" }
                    }
                    div { class: "set-ctl",
                        span { class: "mono", "{c.remote}" }
                    }
                }
            }

            div { class: "section",
                div {
                    h3 { class: "section-title", "项目群" }
                }
            }
            div { class: "set-group",
                div { class: "set-row",
                    div { class: "set-text",
                        div { class: "set-title", "提供方 · 群号" }
                    }
                    div { class: "set-ctl",
                        span { class: "tag tag-neutral", "{c.chat_provider}" }
                        span { class: "mono", "{c.chat_group}" }
                    }
                }
                if !c.chat_events.is_empty() {
                    div { class: "set-row",
                        div { class: "set-text",
                            div { class: "set-title", "同步哪些事件" }
                        }
                        div { class: "set-ctl row-wrap",
                            for (label , on) in c.chat_events.iter() {
                                span {
                                    class: if *on { "tag tag-success" } else { "tag tag-neutral" },
                                    "{label}"
                                }
                            }
                        }
                    }
                }
            }

            div { class: "section",
                div {
                    h3 { class: "section-title", "节律" }
                }
            }
            div { class: "set-group",
                div { class: "set-row",
                    div { class: "set-text",
                        div { class: "set-title", "{c.cadence}" }
                    }
                }
                if !c.crons.is_empty() {
                    for row in c.crons.iter() {
                        div { class: "set-row", key: "{row.name}",
                            div { class: "set-text",
                                div { class: "set-title", "{row.name}" }
                                div { class: "set-desc", "{row.rule}" }
                            }
                            div { class: "set-ctl",
                                span { class: "tag tag-outline", "{row.trigger}" }
                                span { class: "mono", "{row.schedule}" }
                            }
                        }
                    }
                }
            }
        }
    }
}
