use crate::bridge::{Bridge, Panel, PanelNav, Req, TopView};
use crate::vm::{AssetsVm, CodeGraphVm, KbFileVm, KbTab, ProjectVm, SkillVm};
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let nav = use_context::<PanelNav>();
    let mut top_view = use_context::<Signal<Option<TopView>>>();
    let (p, bridge) = (&p, &bridge);
    rsx! {
        section { "data-screen": "kb",
            div { class: "page-head",
                div {
                    h1 { "知识库" }
                    p { class: "page-desc",
                        "{p.kb.managed_count} 份项目配置文件"
                    }
                }
                div { class: "page-actions",
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| nav.go(Panel::Config),
                        "项目配置 →"
                    }
                }
            }
            div { class: "tabs", role: "tablist",
                for t in KbTab::ALL {
                    {tab_button(t, p.kb.tab == t, bridge)}
                }
            }
            match p.kb.tab {
                KbTab::Docs => docs_tab(p, bridge),
                KbTab::CodeGraph => codegraph_tab(p.kb.codegraph.as_ref(), bridge),
                KbTab::Assets => assets_tab(
                    p.kb.assets.as_ref(),
                    move |_| top_view.set(Some(TopView::Settings)),
                ),
            }
        }
    }
}

fn tab_button(t: KbTab, active: bool, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    rsx! {
        button {
            key: "{t:?}",
            class: "tab",
            role: "tab",
            aria_selected: if active { "true" },
            onclick: move |_| b.send(Req::KbTab(t)),
            "{t.label()}"
        }
    }
}

fn docs_tab(p: &ProjectVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "sp-layout",
            div { class: "sp-tree",
                if p.kb.groups.is_empty() {
                    div { class: "set-group",
                        div { class: "empty",
                            "暂无项目文档。"
                        }
                    }
                }
                for g in p.kb.groups.iter() {
                    div { key: "{g.title}",
                        div { class: "section",
                            div { h3 { class: "section-title", "{g.title}" } }
                            div { class: "section-tools", span { class: "hint mono", "{g.files.len()}" } }
                        }
                        div { class: "set-group",
                            for f in g.files.iter() {
                                {doc_row(f, p.kb.open_doc.as_ref().map(|(k, _)| k.as_str()), bridge)}
                            }
                        }
                    }
                }
            }
            div { class: "card sp-preview",
                match &p.kb.open_doc {
                    None => rsx! {
                        div { class: "empty",
                            "选择左侧文档查看内容。"

                        }
                    },
                    Some((path, body)) => rsx! {
                        div { class: "path", "{path}" }
                        {render_doc(path, body)}
                    },
                }
            }
        }
    }
}

fn doc_row(f: &KbFileVm, open: Option<&str>, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let rel = f.rel.clone();
    let active = open == Some(f.rel.as_str());
    rsx! {
        div {
            key: "{f.rel}",
            class: "set-row sp-doc",
            aria_current: if active { "page" },
            title: "{f.rel}",
            onclick: move |_| b.send(Req::OpenDoc(Some(rel.clone()))),
            div { class: "set-text", div { class: "set-title", "{f.label}" } }
            div { class: "set-ctl",
                if !f.badge.is_empty() {
                    span { class: "tag tag-neutral", "{f.badge}" }
                }
                span { class: "chev", "›" }
            }
        }
    }
}

fn codegraph_tab(cg: Option<&CodeGraphVm>, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let Some(cg) = cg else {
        return rsx! {
            div { class: "set-group",
                div { class: "empty",
                    "正在加载代码图…"
                }
            }
        };
    };
    rsx! {
        div { class: "section",
            div {
                h3 { class: "section-title", "大文件榜" }
                p { class: "section-desc", "按文件大小列出前 20 项" }
            }
            div { class: "section-tools",
                button {
                    class: "btn btn-secondary",
                    disabled: cg.state == "running",
                    onclick: move |_| b.send(Req::KbTab(KbTab::CodeGraph)),
                    if cg.state == "running" { "正在加载…" } else { "刷新" }
                }
            }
        }
        div { class: "set-group",
            if cg.state != "ready" {
                div { class: "empty prose", "{cg.hint}" }
            }
            if !cg.error.is_empty() {
                div { class: "empty mono text-danger prose", "{cg.error}" }
            }
            if cg.state == "ready" && cg.error.is_empty() && cg.rows.is_empty() {
                div { class: "empty", "—" }
            }
            for r in cg.rows.iter() {
                div { key: "{r.path}", class: "leaderboard-row",
                    span { class: "grow", "{r.path}" }
                    span { class: "hint",
                        "{r.language} · {r.nodes} 个符号 · {r.size} B"
                    }
                }
            }
        }
        div { class: "section",
            div {
                h3 { class: "section-title", "符号引用" }
                p { class: "section-desc", "尚未支持符号查询。" }
            }
        }
        div { class: "set-group",
            div { class: "set-row",
                div { class: "set-text",
                    div { class: "set-title", "查找调用者" }
                    div { class: "set-desc",
                        "静态分析可能无法识别动态调用。"
                    }
                }
                div { class: "set-ctl",
                    input { class: "input", disabled: true, placeholder: "尚未支持" }
                }
            }
        }
    }
}

fn assets_tab(a: Option<&AssetsVm>, open_settings: impl FnMut(MouseEvent) + 'static) -> Element {
    let Some(a) = a else {
        return rsx! {
            div { class: "set-group",
                div { class: "empty",
                    "正在加载资产…"
                }
            }
        };
    };
    let more = if a.artifacts.len() > ARTIFACT_ROWS {
        format!(",下面只列前 {ARTIFACT_ROWS} 个")
    } else {
        String::new()
    };
    rsx! {
        div { class: "section",
            div {
                h3 { class: "section-title", "技能与工作流" }
            }
        }
        div { class: "set-group",
            div { class: "set-row",
                div { class: "set-text",
                    div { class: "set-title", "Workbench 自带 + 所有接入项目的 .claude/skills/" }
                }
                div { class: "set-ctl",
                    button { class: "btn btn-secondary", onclick: open_settings, "去设置 · Skills →" }
                }
            }
        }

        div { class: "section",
            div {
                h3 { class: "section-title", "技能提炼" }
                p { class: "section-desc", "尚未支持。" }
            }
        }
        div { class: "set-group",
            if a.distilled.is_empty() {
                div { class: "empty", "暂无" }
            }
            for s in a.distilled.iter() {
                {skill_row(s)}
            }
        }

        div { class: "section",
            div {
                h3 { class: "section-title", "变更文件" }
                p { class: "section-desc",
                    "最近 200 次提交涉及 {a.artifacts.len()} 个文件{more}。"
                }
            }
        }
        div { class: "set-group",
            if a.artifacts.is_empty() {
                div { class: "empty", "暂无变更文件" }
            }
            for f in a.artifacts.iter().take(ARTIFACT_ROWS) {
                div { key: "{f.path}", class: "leaderboard-row",
                    span { class: "row-id", "{f.commit}" }
                    span { class: "grow", "{f.path}" }
                    if !f.issue.is_empty() {
                        span { class: "tag tag-neutral", "{f.issue}" }
                    }
                }
            }
        }

        div { class: "section",
            div {
                h3 { class: "section-title", "发版记录" }
                p { class: "section-desc", "Git 标签与远端发布记录" }
            }
        }
        div { class: "set-group",
            if a.releases.is_empty() {
                div { class: "empty", "暂无发版记录" }
            }
            for r in a.releases.iter() {
                div { key: "{r.version}", class: "leaderboard-row",
                    span { class: "lb-ver mono", "{r.version}" }
                    span { class: "lb-date hint", "{r.released_at}" }
                    span { class: "grow hint", "{r.note}" }
                    if !r.included.is_empty() {
                        span { class: "hint", "{r.included}" }
                    }
                    span { class: "tag tag-neutral", "{r.origin}" }
                }
            }
        }

        div { class: "section",
            div { h3 { class: "section-title", "仓库统计" } }
        }
        div { class: "set-group",
            if !a.error.is_empty() {
                div { class: "empty mono text-danger", "{a.error}" }
            }
            div { class: "repo-metric-grid",
                for (k, v) in a.repo_stats.iter() {
                    div { key: "{k}", class: "repo-metric-item",
                        div { class: "v mono", "{v}" }
                        div { class: "k", "{k}" }
                    }
                }
            }
        }
    }
}

const ARTIFACT_ROWS: usize = 60;

fn skill_row(s: &SkillVm) -> Element {
    rsx! {
        div { key: "{s.slug}", class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "{s.title}" }
            }
            div { class: "set-ctl",
                span { class: "tag tag-neutral", "{s.origin}" }
                span { class: "uses",
                    if s.uses == 0 { "还没用过" } else { "用过 {s.uses} 次" }
                }
            }
        }
    }
}

fn render_doc(path: &str, body: &str) -> Element {
    let is_md = std::path::Path::new(path)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("md"));
    if is_md {
        return render_markdown(body);
    }
    rsx! {
        pre { "{body}" }
    }
}

/// 项目文档不可信：过滤原始 HTML，去掉图片和链接标签，保留文本。
fn render_markdown(body: &str) -> Element {
    use pulldown_cmark::{Event, Tag, TagEnd};
    let mut opts = pulldown_cmark::Options::empty();
    opts.insert(pulldown_cmark::Options::ENABLE_TABLES);
    opts.insert(pulldown_cmark::Options::ENABLE_STRIKETHROUGH);
    let parser = pulldown_cmark::Parser::new_ext(body, opts).filter_map(|e| match e {
        Event::Html(_) => None,
        Event::InlineHtml(raw) => Some(Event::Text(raw)),
        Event::Start(Tag::Image { .. }) | Event::End(TagEnd::Image) => None,
        Event::Start(Tag::Link { .. }) | Event::End(TagEnd::Link) => None,
        other => Some(other),
    });
    let mut html = String::new();
    pulldown_cmark::html::push_html(&mut html, parser);
    rsx! {
        div { class: "doc", dangerous_inner_html: "{html}" }
    }
}
