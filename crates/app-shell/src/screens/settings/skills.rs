//! Skills 列表 + 详情。全局一张表:Workbench 自带 + 所有接入项目各自的
//! `.claude/skills/`。见 spec.md §3。

use crate::vm::SkillVm;
use dioxus::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Sort {
    Uses,
    Name,
    Origin,
}

#[component]
pub fn SkillsPage(items: Vec<SkillVm>, focus: String) -> Element {
    let mut open = use_signal(|| (!focus.is_empty()).then_some(focus.clone()));
    let mut query = use_signal(String::new);
    let mut origin = use_signal(|| None::<&'static str>);
    let mut sort = use_signal(|| Sort::Uses);

    let open_slug = open.read().clone();
    if let Some(slug) = open_slug {
        if let Some(item) = items.iter().find(|s| s.slug == slug).cloned() {
            return detail(&item, move |_| open.set(None));
        }
        open.set(None);
    }

    let q = query.read().trim().to_lowercase();
    let mut filtered: Vec<&SkillVm> = items
        .iter()
        .filter(|s| origin.read().is_none_or(|o| s.origin == o))
        .filter(|s| {
            q.is_empty()
                || s.title.to_lowercase().contains(&q)
                || s.slug.to_lowercase().contains(&q)
        })
        .collect();
    match *sort.read() {
        Sort::Uses => filtered.sort_by_key(|s| std::cmp::Reverse(s.uses)),
        Sort::Name => filtered.sort_by(|a, b| a.title.cmp(&b.title)),
        Sort::Origin => {
            filtered.sort_by(|a, b| a.origin.cmp(&b.origin).then(a.title.cmp(&b.title)))
        }
    }

    let matured = items.iter().filter(|s| s.uses > 0).count();
    let untouched = items.iter().filter(|s| s.uses == 0).count();

    rsx! {
        div { class: "pane-head",
            h2 { "Skills" }
            input {
                class: "input search",
                r#type: "search",
                placeholder: "搜技能",
                value: "{query}",
                oninput: move |e| query.set(e.value()),
            }
        }

        div { class: "bar-key",
            span { i { class: "dot c-done" } "用过 " b { "{matured}" } }
            span { i { class: "dot c-idle" } "还没用过 " b { "{untouched}" } }
        }

        div { class: "filterbar",
            div { class: "seg",
                label { class: "seg-opt",
                    input {
                        r#type: "radio",
                        name: "sk-origin",
                        checked: origin.read().is_none(),
                        onchange: move |_| origin.set(None),
                    }
                    "全部"
                }
                for (key , label) in [("Workbench 自带", "Workbench 自带"), ("项目自有", "项目自有")] {
                    label { class: "seg-opt", key: "{key}",
                        input {
                            r#type: "radio",
                            name: "sk-origin",
                            checked: *origin.read() == Some(key),
                            onchange: move |_| origin.set(Some(key)),
                        }
                        "{label}"
                    }
                }
            }
            div { class: "right",
                select {
                    class: "input input-sm",
                    onchange: move |e| {
                        sort.set(match e.value().as_str() {
                            "name" => Sort::Name,
                            "origin" => Sort::Origin,
                            _ => Sort::Uses,
                        });
                    },
                    option { value: "uses", "按用过几次" }
                    option { value: "name", "按名字" }
                    option { value: "origin", "按来源" }
                }
            }
        }

        div { class: "cards",
            if filtered.is_empty() {
                div { class: "empty", "没有匹配的技能" }
            }
            for s in filtered {
                div {
                    key: "{s.slug}",
                    class: "card skill-card",
                    onclick: {
                        let slug = s.slug.clone();
                        move |_| open.set(Some(slug.clone()))
                    },
                    div { class: "card-title",
                        "{s.title}"
                        if s.title != s.slug {
                            span { class: "mono hint", "{s.slug}" }
                        }
                    }
                    if !s.byline.is_empty() {
                        div { class: "card-byline", "{s.byline}" }
                    }
                    p { class: "card-body", {desc_or_dash(&s.desc)} }
                    div { class: "card-meta",
                        span {
                            class: if s.origin == "Workbench 自带" { "tag tag-success" } else { "tag tag-neutral" },
                            "{origin_label(s)}"
                        }
                        if !s.injectable && s.origin == "项目自有" {
                            span { class: "tag tag-warning", "注入不了" }
                        }
                        span { class: "uses",
                            if s.uses == 0 { "还没用过" } else { "用过 {s.uses} 次" }
                        }
                    }
                }
            }
        }
    }
}

fn detail(s: &SkillVm, back: impl FnMut(MouseEvent) + 'static) -> Element {
    let builtin = bw::standard::skills::all()
        .into_iter()
        .find(|p| p.slug == s.slug);
    let sidecars: Vec<_> = bw::standard::skills::sidecars()
        .into_iter()
        .filter(|p| p.slug == s.slug)
        .collect();

    rsx! {
        button { class: "backlink", onclick: back,
            svg { view_box: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.7",
                path { d: "M10 3 5 8l5 5" }
            }
            "Skills"
        }
        div { class: "dt-head",
            div { class: "dt-icon", "▤" }
            div { class: "grow",
                div { class: "dt-name", "{s.title}" }
                div { class: "dt-from",
                    "{origin_label(s)}"
                    if !s.byline.is_empty() { " · {s.byline}" }
                    " · "
                    if s.uses == 0 { "还没用过" } else { "用过 {s.uses} 次" }
                }
            }
        }

        div { class: "tabs", role: "tablist",
            button { class: "tab", "aria-selected": "true", "概览" }
            button { class: "tab", "aria-selected": "false", "文件 · {s.file_count}" }
        }

        h3 { class: "section-title", "概览" }
        dl { class: "kv",
            dt { "能不能注入" }
            dd {
                if s.injectable {
                    span { class: "tag tag-success", "会注入" }
                } else {
                    span { class: "tag tag-warning", "注入不了" }
                }
            }
            dt { "为什么" }
            dd {
                if s.injectable {
                    "workflow 名字命中了 skill_slug 的硬编码表,开工会指到这份文件。"
                } else if s.origin == "项目自有" {
                    "skill_pointer 的路径只拼 Workbench 自己的资产目录,项目自有的今天无论挂什么名字都够不到 —— 见 intent.md ⑪,接入通道待另开一件。"
                } else {
                    "skill_slug 今天只认三个名字(week-planning / asset-audit / mattpocock-skills),这份编进了二进制却没有 workflow 名字指向它。"
                }
            }
            dt { "正文" }
            dd { "提示词里只给名字 + 一句话 + 完整路径,正文按需读,不塞进提示词正文。" }
        }

        h3 { class: "section-title", "文件 · {s.file_count}" }
        {file_browser(builtin.as_ref().map(|p| p.raw), &sidecars)}
    }
}

fn file_browser(
    entry_raw: Option<&'static str>,
    sidecars: &[bw::standard::skills::SkillPack],
) -> Element {
    let Some(entry) = entry_raw else {
        return rsx! {
            div { class: "todo-note",
                "这是项目自有的技能,正文在这个仓的 .claude/skills/<slug>/SKILL.md —— 设置屏不重复渲染被管仓的文件,打开那个仓自己看。"
            }
        };
    };
    rsx! {
        div { class: "files",
            div { class: "files-list",
                button { class: "file-item", "aria-current": "true", "SKILL.md" }
                for sc in sidecars {
                    button { class: "file-item", key: "{sc.rel}", "{sc.rel}" }
                }
            }
            div { class: "files-body",
                div { class: "files-bar",
                    span { class: "files-path", "SKILL.md" }
                }
                div { class: "files-text",
                    pre { "{entry}" }
                }
            }
        }
    }
}

/// 「项目自有」标出来自哪个仓 —— 这是全局一张表,光写「项目自有」答不了
/// 「哪个项目」。
fn origin_label(s: &SkillVm) -> String {
    if s.project.is_empty() {
        s.origin.clone()
    } else {
        format!("{} · {}", s.origin, s.project)
    }
}

fn desc_or_dash(d: &str) -> String {
    if d.is_empty() {
        "—(SKILL.md 里没写 description)".into()
    } else {
        d.to_string()
    }
}
