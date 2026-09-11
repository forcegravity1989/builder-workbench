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
    let mut source = use_signal(|| None::<String>);
    let mut sort = use_signal(|| Sort::Uses);

    let open_slug = open.read().clone();
    if let Some(slug) = open_slug {
        if let Some(item) = items.iter().find(|s| s.slug == slug).cloned() {
            return detail(&item, move |_| open.set(None));
        }
        open.set(None);
    }

    // 过滤项就是卡片上那个来源标签本身(Workbench / 项目名),按出现顺序去重 ——
    // 不写「自带」「项目自有」这类分类词,列表和卡片说的是同一个名字。
    let mut sources: Vec<String> = Vec::new();
    for s in &items {
        let label = origin_label(s);
        if !sources.contains(&label) {
            sources.push(label);
        }
    }
    let picked = source.read().clone();

    let q = query.read().trim().to_lowercase();
    let mut filtered: Vec<&SkillVm> = items
        .iter()
        .filter(|s| picked.as_ref().is_none_or(|p| &origin_label(s) == p))
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

        div { class: "filterbar",
            div { class: "seg",
                label { class: "seg-opt",
                    input {
                        r#type: "radio",
                        name: "sk-origin",
                        checked: picked.is_none(),
                        onchange: move |_| source.set(None),
                    }
                    "全部"
                }
                for name in sources.clone() {
                    label { class: "seg-opt", key: "{name}",
                        input {
                            r#type: "radio",
                            name: "sk-origin",
                            checked: picked.as_deref() == Some(name.as_str()),
                            onchange: {
                                let name = name.clone();
                                move |_| source.set(Some(name.clone()))
                            },
                        }
                        "{name}"
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
                    option { value: "uses", "使用次数" }
                    option { value: "name", "名字" }
                    option { value: "origin", "来源" }
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
                        span { class: "uses mono", "{s.uses}" }
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
                    " · 用过 {s.uses} 次"
                }
            }
        }

        div { class: "tabs", role: "tablist",
            button { class: "tab", "aria-selected": "true", "概览" }
            button { class: "tab", "aria-selected": "false", "文件 · {s.file_count}" }
        }

        dl { class: "kv",
            dt { "开工注入" }
            dd {
                if s.injectable {
                    span { class: "tag tag-success", "会注入" }
                } else {
                    span { class: "tag tag-warning", "注入不了" }
                    // 判定留在详情页(列表上不再喊一遍),但只说结论不讲机制。
                    if s.origin == "项目自有" {
                        " 项目自己写的技能还接不进开工"
                    } else {
                        " 没有 workflow 指向它"
                    }
                }
            }
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
            div { class: "empty", "正文在这个仓的 .claude/skills/<名字>/SKILL.md" }
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

/// 来源只写名字:Workbench 自带的就是 `Workbench`,项目自有的就是那个项目名。
fn origin_label(s: &SkillVm) -> String {
    if !s.project.is_empty() {
        return s.project.clone();
    }
    match s.origin.as_str() {
        "Workbench 自带" => "Workbench".into(),
        other => other.to_string(),
    }
}

fn desc_or_dash(d: &str) -> String {
    if d.is_empty() {
        "—(SKILL.md 里没写 description)".into()
    } else {
        d.to_string()
    }
}
