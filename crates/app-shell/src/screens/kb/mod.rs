//! 项目内 · 知识库。页标题 + 三个页签(知识 / 代码图 / 资产),版式走设计
//! 系统的「设置文法」:小节 + 分组,每行标题 + 一句说明 + 行尾控件。
//!
//! 四条如实:
//!
//! 1. **没有索引表**。库里只有四张表,这一屏的每个数字都是打开时现扫仓目录、
//!    现走 git、现解析仓文件得来的。
//! 2. **代码图装了才亮**。没装 codegraph 就整块灰,并且说清下一步该跑什么;
//!    不猜、不给一个空榜冒充「这个仓没有大文件」。
//! 3. **页标题只报数,不对账**。对账是配置屏那颗按钮的事 ——
//!    对账要读一遍全部核心件并逐份比对指纹,不能每次打开知识库都跑一次。
//! 4. **只读**。改文档一律走活 + MR,这一屏不提供编辑框。

use crate::bridge::{Bridge, Panel, PanelNav, Req};
use crate::vm::{AssetsVm, CodeGraphVm, KbFileVm, KbTab, ProjectVm, SkillVm};
use dioxus::prelude::*;

#[component]
pub fn View(p: ProjectVm, bridge: Bridge) -> Element {
    let nav = use_context::<PanelNav>();
    let (p, bridge) = (&p, &bridge);
    rsx! {
        section { "data-screen": "kb",
            div { class: "page-head",
                div {
                    h1 { "知识库" }
                    p { class: "page-desc",
                        "仓里有 {p.kb.managed_count} 份 .bw 规范件。这里的数字都是打开时现扫仓、现走 git 得来的,没有索引表;只读,改文档走活 + MR。"
                    }
                }
                div { class: "page-actions",
                    button {
                        class: "btn btn-secondary",
                        onclick: move |_| nav.go(Panel::Config),
                        "去配置屏对账 →"
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
                KbTab::Assets => assets_tab(p.kb.assets.as_ref(), bridge),
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

// ── 知识页签 ─────────────────────────────────────────────

fn docs_tab(p: &ProjectVm, bridge: &Bridge) -> Element {
    rsx! {
        div { class: "sp-layout",
            div { class: "sp-tree",
                if p.kb.groups.is_empty() {
                    div { class: "set-group",
                        div { class: "empty",
                            "这个仓还没有管理体系。第一次纳入时那张规范铺底合进默认分支之后才会有。"
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
                            "点左边一份文档看内容。"
                            br {}
                            "树不是扫全仓扫出来的 —— 是按规范的几大类去固定路径找,找到才列。"
                            br {}
                            "标了「回填」的周文件是从 git 历史补出来的,和人写的同目录同格式。"
                        }
                    },
                    Some((path, body)) => rsx! {
                        div { class: "path", "{path}" }
                        {render_markdown(body)}
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

// ── 代码图页签 ───────────────────────────────────────────

fn codegraph_tab(cg: Option<&CodeGraphVm>, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let Some(cg) = cg else {
        return rsx! {
            div { class: "set-group",
                div { class: "empty",
                    "点一下上面的「代码图」页签就现跑一次。"
                    br {}
                    "每次都是新的子进程调用,不缓存 —— 数字永远是此刻的仓,不是上次的。"
                }
            }
        };
    };
    rsx! {
        div { class: "section",
            div {
                h3 { class: "section-title", "大文件榜" }
                p { class: "section-desc", "codegraph files -j,按体积排序取前 20 · 状态 {cg.state}" }
            }
            div { class: "section-tools",
                button {
                    class: "btn btn-secondary",
                    disabled: cg.state == "running",
                    onclick: move |_| b.send(Req::KbTab(KbTab::CodeGraph)),
                    if cg.state == "running" { "正在跑…" } else { "重新跑一次" }
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
                h3 { class: "section-title", "符号 → 调用者 / 影响面" }
                p { class: "section-desc", "还没接:要走 codegraph 的符号索引。灰在这里,不放一个查了没结果的输入框。" }
            }
        }
        div { class: "set-group",
            div { class: "set-row",
                div { class: "set-text",
                    div { class: "set-title", "按符号名查它被谁调用" }
                    div { class: "set-desc",
                        "只摆原始数字,不下结论:零调用者不等于死代码 —— 这个仓大量用 dyn Trait 动态派发,调用关系本来就查不全。"
                    }
                }
                div { class: "set-ctl",
                    input { class: "input", disabled: true, placeholder: "还没接" }
                }
            }
        }
    }
}

// ── 资产页签 ─────────────────────────────────────────────

fn assets_tab(a: Option<&AssetsVm>, bridge: &Bridge) -> Element {
    let b = bridge.clone();
    let Some(a) = a else {
        return rsx! {
            div { class: "set-group",
                div { class: "empty",
                    "点一下上面的「资产」页签就现扫一次。"
                    br {}
                    "五个区块全部现算:列 Workbench 自带的技能 + 扫本仓 .claude/skills/、\
                     走 git log、发版记录扫 git 标签 + 远端 Release。没有登记表可查。"
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
                h3 { class: "section-title", "技能与 workflow" }
                p { class: "section-desc",
                    "Workbench 自带的(摊在 Workbench 自己的资产目录,不进你的仓)+ 本仓 .claude/skills/ 自有的;「用过几次」按活挂的 workflow 现算,没有胜率。"
                }
            }
            div { class: "section-tools",
                button {
                    class: "btn btn-secondary",
                    onclick: move |_| b.send(Req::KbTab(KbTab::Assets)),
                    "重新扫一次"
                }
            }
        }
        div { class: "set-group",
            if a.skills.is_empty() {
                div { class: "empty", "暂无" }
            }
            for s in a.skills.iter() {
                {skill_row(s)}
            }
        }

        div { class: "section",
            div {
                h3 { class: "section-title", "蒸馏出来的技能" }
                p { class: "section-desc", "把做完的活蒸馏成技能这颗按钮还没建,所以这里现在恒为空 —— 不放占位数据。" }
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
                h3 { class: "section-title", "产物登记" }
                p { class: "section-desc",
                    "没有登记表 —— git log --name-only 就是登记表。扫最近 200 个提交,每个文件记最近碰它的那一次,一共 {a.artifacts.len()} 个文件{more}。"
                }
            }
        }
        div { class: "set-group",
            if a.artifacts.is_empty() {
                div { class: "empty", "暂无登记产物" }
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
                p { class: "section-desc", "扫 git 标签 + 远端 Release,库里没有版本表。" }
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
            div { h3 { class: "section-title", "仓统计" } }
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

/// 产物区块最多列多少行。再多人也读不完,而且每行都是一个 DOM 节点。
/// **列不下的要说出来** —— 说明里带总数和这个上限。
const ARTIFACT_ROWS: usize = 60;

fn skill_row(s: &SkillVm) -> Element {
    rsx! {
        div { key: "{s.slug}", class: "set-row",
            div { class: "set-text",
                div { class: "set-title", "{s.title}" }
                if !s.desc.is_empty() {
                    div { class: "set-desc", "{s.desc}" }
                }
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

/// 纯 Rust CommonMark 渲染。不联网、不加载外部样式。
///
/// 这些 Markdown 来自项目仓的 `docs/` —— agent 天天在往里写东西的地方,
/// 所以三样东西一律不放过去:
///
/// 1. **内嵌的原始 HTML**。一份带 `<img src=x onerror=…>` 的文档打开就在桌面壳
///    的 WebView 里执行 JS。HTML 块整块丢掉,行内 HTML 降级成纯文本 ——
///    让人看得见原文写了什么,但它不再是标签。
/// 2. **图片**。markdown 原生的 `![](https://…)` 一样会让 WebView 去外部主机取
///    图,「不联网」那句话照样变成假话。整块丢掉,`alt` 文字留着。
/// 3. **链接**。降级成纯文本 —— 这是一个只读文档预览,不是浏览器;而且
///    `[点我](javascript:…)` 渲染出来就是一颗能点的雷。
fn render_markdown(body: &str) -> Element {
    use pulldown_cmark::{Event, Tag, TagEnd};
    let mut opts = pulldown_cmark::Options::empty();
    opts.insert(pulldown_cmark::Options::ENABLE_TABLES);
    opts.insert(pulldown_cmark::Options::ENABLE_STRIKETHROUGH);
    let parser = pulldown_cmark::Parser::new_ext(body, opts).filter_map(|e| match e {
        Event::Html(_) => None,
        Event::InlineHtml(raw) => Some(Event::Text(raw)),
        // 丢掉 Start/End 这一对,中间的 alt / 链接文字照常留下来当正文。
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
