//! AI Assets:只读一张表,答一件事——每份资产现在挂在哪几张真实的活上。
//! 不写「它是什么」,那是教育用户;不放色条 / 状态过滤(发起人当场否过,
//! 见 STATUS 十一轮)。见 spec.md §5。

use crate::vm::SettingsVm;
use dioxus::prelude::*;

pub(super) fn view(s: &SettingsVm) -> Element {
    rsx! {
        div { class: "pane-head", h2 { "AI Assets" } }

        if s.assets_open_project.is_empty() {
            p { class: "hint",
                "还没打开任何项目 —— 「现在哪几张活在用」要扫那个项目的 issue 列表,先打开一个项目再回来看。"
            }
        } else {
            p { class: "hint", "「现在哪几张活在用」扫的是当前打开的项目「{s.assets_open_project}」。" }
        }

        div { class: "tbl-wrap",
            table { class: "table",
                thead {
                    tr {
                        th { style: "width:26%", "Asset" }
                        th { style: "width:54%", "现在哪几张活在用" }
                        th { style: "width:20%", "来自" }
                    }
                }
                tbody {
                    if s.assets.is_empty() {
                        tr { td { colspan: "3", class: "empty", "暂无" } }
                    }
                    for a in &s.assets {
                        tr { key: "{a.slug}",
                            td { class: "t-name", "{a.name}" }
                            td { class: "t-sub",
                                if a.used_by_issues.is_empty() {
                                    if s.assets_open_project.is_empty() { "—" } else { "0 张" }
                                } else {
                                    {a.used_by_issues.join(" · ")}
                                }
                            }
                            td { span { class: "tag tag-neutral", "{a.source}" } }
                        }
                    }
                }
            }
        }
    }
}
