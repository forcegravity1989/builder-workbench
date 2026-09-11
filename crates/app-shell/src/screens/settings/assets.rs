//! AI Assets:开工时 agent 会读到的规范。见 spec.md §5。

use crate::vm::SettingsVm;
use dioxus::prelude::*;

pub(super) fn view(s: &SettingsVm) -> Element {
    let opened = !s.assets_open_project.is_empty();
    rsx! {
        div { class: "pane-head", h2 { "AI Assets" } }

        div { class: "tbl-wrap",
            table { class: "table",
                thead {
                    tr {
                        th { style: "width:18%", "Asset" }
                        th { style: "width:42%", "说明" }
                        th { style: "width:28%", "引用此规范的 Issue" }
                        th { style: "width:12%", "来自" }
                    }
                }
                tbody {
                    if s.assets.is_empty() {
                        tr { td { colspan: "4", class: "empty", "暂无" } }
                    }
                    for a in &s.assets {
                        tr { key: "{a.slug}",
                            td { class: "t-name mono", "{a.name}" }
                            td { class: "t-sub", "{a.desc}" }
                            td { class: "t-sub",
                                if !a.used_by_issues.is_empty() {
                                    {a.used_by_issues.join(" · ")}
                                } else if opened {
                                    "0 张"
                                } else {
                                    "—"
                                }
                            }
                            td { span { class: "tag tag-neutral", "{a.source}" } }
                        }
                    }
                }
            }
        }
        if !opened {
            p { class: "hint", "打开项目后显示引用此规范的 Issue。" }
        }
    }
}
