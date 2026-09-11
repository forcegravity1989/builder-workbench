use crate::bridge::{Bridge, Req};
use crate::chrome::progress_log;
use crate::vm::{RepoProbe, RepoRowVm, Vm};
use bw::app::ProgressLine;
use bw::command::{Command, ProjectIntent, RemoteRef};
use dioxus::prelude::*;

/// 下拉里最多画几行。检索是在**已经拉下来的那批**里过滤,不是再去问平台。
const DROPDOWN_CAP: usize = 30;

/// codehub-cli -H 接受区别名，而非网页域名。
const CODEHUB_ZONES: &[(&str, &str)] = &[("green", "绿区"), ("open", "内源"), ("yellow", "黄区")];

#[component]
pub fn View(vm: Vm, bridge: Bridge, close: EventHandler<MouseEvent>) -> Element {
    let (vm, bridge) = (&vm, &bridge);
    let mut step = use_signal(|| 1u8);
    let mut local_repo = use_signal(|| true);
    let github = use_signal(|| true);

    let mut name = use_signal(String::new);
    let mut brief = use_signal(String::new);
    let mut benchmark = use_signal(String::new);
    let mut north_star = use_signal(String::new);
    let slug = use_signal(String::new);
    let mut workspace = use_signal(String::new);
    let mut remote = use_signal(String::new);
    let root = vm.settings.workspaces_root.clone();
    let initial_parent = root.clone();
    // 克隆默认就落设置里的工作区根目录。界面展示的是父文件夹,提交时才补仓名。
    let mut clone_parent = use_signal(move || initial_parent);
    let host = use_signal(|| "open".to_string());

    // 接入期间 dispatch 被占用，通过独立广播显示进度。
    let mut log = use_signal(Vec::<ProgressLine>::new);
    // 回执序号变化表示本次命令已返回，包括失败。
    let mut submitted_at = use_signal(|| None::<u64>);
    let busy = *submitted_at.read() == Some(vm.note_seq);

    let prog = bridge.progress.clone();
    use_future(move || {
        let mut rx = prog.subscribe();
        async move {
            while let Ok(line) = rx.recv().await {
                let mut rows = log.write();
                match rows.iter().position(|r: &ProgressLine| r.step == line.step) {
                    Some(i) => rows[i] = line,
                    None => rows.push(line),
                }
            }
        }
    });

    let b = bridge.clone();
    let b_next = bridge.clone();
    let vm_seq = vm.note_seq;
    let vm_probed = vm.repos.picked.clone();
    // 从本地或远端仓读回来的名片。**人没动过的格子才用它** —— 见 `shown` / `pick`。
    let pf = vm.repos.prefill.clone().unwrap_or_default();
    let (pf_name, pf_brief, pf_bench, pf_star) = (
        pf.name.clone(),
        pf.brief.clone(),
        pf.benchmark.clone(),
        pf.north_star.clone(),
    );

    let submit = move |_| {
        log.write().clear();
        submitted_at.set(Some(vm_seq));
        let eff_name = pick(&name.read(), &pf_name);
        let s = if slug.read().trim().is_empty() {
            slugify(&eff_name)
        } else {
            slug.read().trim().to_string()
        };
        if s.is_empty() || eff_name.is_empty() {
            return;
        }
        let r = remote.read().trim().to_string();
        let gh = *github.read();
        let target = if *local_repo.read() {
            workspace.read().trim().to_string()
        } else {
            clone_target(&clone_parent.read(), &r)
        };
        b.cmd(Command::CreateProject {
            slug: s,
            intent: ProjectIntent {
                name: eff_name,
                brief: pick(&brief.read(), &pf_brief),
                benchmark: pick(&benchmark.read(), &pf_bench),
                north_star: pick(&north_star.read(), &pf_star),
                ..Default::default()
            },
            remote: if *local_repo.read() || r.is_empty() {
                RemoteRef::default()
            } else {
                RemoteRef {
                    provider: if gh {
                        "github".into()
                    } else {
                        "codehub".into()
                    },
                    host: if gh {
                        "github.com".into()
                    } else {
                        host.read().trim().to_string()
                    },
                    path: r,
                }
            },
            workspace_path: target,
        });
    };

    let can_next = if *local_repo.read() {
        !workspace.read().trim().is_empty()
    } else {
        !remote.read().trim().is_empty()
    };
    let at_addr = *step.read() == 1;
    let target_path = if *local_repo.read() {
        workspace.read().trim().to_string()
    } else {
        clone_target(&clone_parent.read(), &remote.read())
    };
    let probing = matches!(vm.repos.probe, RepoProbe::Loading);
    let zone = host.read().clone();

    rsx! {
        section {
            "data-screen": "onboard",
            div { class: "page-head",
                div {
                    h1 { "接入项目" }
                    p { class: "page-desc", "选择仓库，再确认项目基础信息。" }
                }
                div { class: "page-actions",
                    button { class: "btn btn-secondary", onclick: close, "← 项目墙" }
                }
            }

            div { class: "ob-steps",
                span { class: if at_addr { "ob-step active" } else { "ob-step done" }, "① 项目地址" }
                span { class: "ob-step-line" }
                span { class: if at_addr { "ob-step" } else { "ob-step active" }, "② 基础信息" }
            }

            div { class: "ob-cards",
                if at_addr {
                    div { class: "card ob-card",
                        h3 { "项目地址" }
                        div { class: "seg",
                            label { class: "seg-opt",
                                input {
                                    r#type: "radio",
                                    name: "ob-repo-kind",
                                    checked: *local_repo.read(),
                                    onchange: move |_| {
                                        local_repo.set(true);
                                        remote.set(String::new());
                                    },
                                }
                                "打开本地仓"
                            }
                            label { class: "seg-opt",
                                input {
                                    r#type: "radio",
                                    name: "ob-repo-kind",
                                    checked: !*local_repo.read(),
                                    onchange: move |_| {
                                        local_repo.set(false);
                                        workspace.set(String::new());
                                    },
                                }
                                "克隆远端仓"
                            }
                        }
                        if *local_repo.read() {
                            div { class: "field",
                                label { "本地 Git 仓" }
                                div { class: "row ob-path-row",
                                    input {
                                        class: "input mono", value: "{workspace}",
                                        placeholder: "/Users/you/projects/workbench",
                                        oninput: move |e| workspace.set(e.value()),
                                    }
                                    button {
                                        class: "btn btn-secondary",
                                        onclick: move |_| {
                                            if let Some(path) = rfd::FileDialog::new().pick_folder() {
                                                workspace.set(path.display().to_string());
                                            }
                                        },
                                        "浏览文件夹"
                                    }
                                }
                            }
                        } else {
                            {platform_pills(*github.read(), github, &zone, bridge)}
                            if !*github.read() {
                                div { class: "field",
                                    label { "哪个区" }
                                    {zone_pills(&zone, host, bridge)}
                                }
                            }
                            div { class: "field",
                                label { "远端仓" }
                                RepoField {
                                    vm: vm.clone(),
                                    bridge: bridge.clone(),
                                    github: *github.read(),
                                    host: host.read().clone(),
                                    remote,
                                }
                            }
                            div { class: "field",
                                label { "父文件夹" }
                                div { class: "row ob-path-row",
                                    input {
                                        class: "input mono", value: "{clone_parent}",
                                        placeholder: "{root}",
                                        oninput: move |e| clone_parent.set(e.value()),
                                    }
                                    button {
                                        class: "btn btn-secondary",
                                        onclick: move |_| {
                                            if let Some(parent) = rfd::FileDialog::new().pick_folder() {
                                                clone_parent.set(parent.display().to_string());
                                            }
                                        },
                                        "浏览文件夹"
                                    }
                                }
                            }
                        }
                    }

                    div { class: "ob-actions",
                        button {
                            class: "btn btn-primary",
                            disabled: !can_next,
                            title: if can_next { "" } else if *local_repo.read() { "先选择本地 Git 仓" } else { "先选择远端仓" },
                            onclick: move |_| {
                                if *local_repo.read() {
                                    b_next.send(Req::PickLocalRepo {
                                        path: workspace.read().trim().to_string(),
                                    });
                                } else {
                                    let addr = remote.read().trim().to_string();
                                    let asked = vm_probed.clone();
                                    if !addr.is_empty() && asked.as_deref() != Some(addr.as_str()) {
                                    b_next.send(Req::PickRepo {
                                        github: *github.read(),
                                        host: host.read().trim().to_string(),
                                        path: addr,
                                        // 手打的地址不知道默认分支,交给引擎兜底。
                                        git_ref: String::new(),
                                    });
                                    }
                                }
                                step.set(2);
                            },
                            "下一步:基础信息 →"
                        }
                    }
                } else {
                    div { class: "card ob-card",
                        h3 { "基础信息" }
                        div { class: "ob-note",
                            span { class: "mono", "{target_path}" }
                        }
                        {adopted_note(&vm.repos.probe)}
                        div { class: "field-2",
                            div { class: "field",
                                label { "项目名称" }
                                input {
                                    class: "input", value: "{shown(&name.read(), &pf.name)}",
                                    placeholder: "例如 WorkflowHub",
                                    oninput: move |e| name.set(e.value()),
                                }
                            }
                            div { class: "field",
                                label { "最像的对标" }
                                input {
                                    class: "input", value: "{shown(&benchmark.read(), &pf.benchmark)}",
                                    placeholder: "Linear",
                                    oninput: move |e| benchmark.set(e.value()),
                                }
                            }
                        }
                        div { class: "field",
                            label { "你想做什么" }
                            textarea {
                                class: "input", value: "{shown(&brief.read(), &pf.brief)}",
                                placeholder: "把 agent 会话里长出的工作流沉淀成可复用资产",
                                oninput: move |e| brief.set(e.value()),
                            }
                        }
                        div { class: "field",
                            label { "目标方向" }
                            textarea {
                                class: "input", value: "{shown(&north_star.read(), &pf.north_star)}",
                                placeholder: "每月通过工作流完成的 Issue 数",
                                oninput: move |e| north_star.set(e.value()),
                            }
                        }
                    }

                    {progress_log(&log.read())}

                    div { class: "ob-actions",
                        button {
                            class: "btn btn-secondary",
                            disabled: busy,
                            onclick: move |_| step.set(1),
                            "← 上一步"
                        }
                        button {
                            class: "btn btn-primary",
                            disabled: busy || probing,
                            onclick: submit,
                            if busy { "接入中…" } else if probing { "正在读取…" } else { "完成接入" }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn RepoField(
    vm: Vm,
    bridge: Bridge,
    github: bool,
    host: String,
    remote: Signal<String>,
) -> Element {
    let mut query = use_signal(String::new);
    let mut open = use_signal(|| false);
    let r = &vm.repos;

    let q = query.read().trim().to_lowercase();
    let shown_rows: Vec<RepoRowVm> = r
        .rows
        .iter()
        .filter(|row| {
            q.is_empty()
                || row.path.to_lowercase().contains(&q)
                || row.description.to_lowercase().contains(&q)
        })
        .take(DROPDOWN_CAP)
        .cloned()
        .collect();

    let b_list = bridge.clone();
    let b_focus = bridge.clone();
    let (gh_l, host_l) = (github, host.clone());
    let (gh_f, host_f) = (github, host.clone());
    let need_first_fetch = !r.asked && !r.loading;
    rsx! {
        div { class: "repo-combo",
            div { class: "repo-field",
                input {
                    class: "input mono",
                    value: "{remote}",
                    placeholder: "forcegravity1989/builder-workbench",
                    onfocus: move |_| {
                        open.set(true);
                        if need_first_fetch {
                            b_focus.send(Req::ListRepos { github: gh_f, host: host_f.clone() });
                        }
                    },
                    oninput: move |e| {
                        remote.set(e.value());
                        query.set(e.value());
                        open.set(true);
                    },
                    onblur: move |_| open.set(false),
                }
                button {
                    class: if r.loading { "repo-refresh spinning" } else { "repo-refresh" },
                    disabled: r.loading,
                    title: if github { "重新问一次 gh repo list" } else { "重新问一次 codehub-cli" },
                    // 阻止失焦，避免刷新按钮关闭下拉列表。
                    onmousedown: move |e| {
                        e.prevent_default();
                        open.set(true);
                        b_list.send(Req::ListRepos { github: gh_l, host: host_l.clone() });
                    },
                    "⟳"
                }
            }

            if let Some(e) = &r.error {
                div { class: "ob-note",
                    "列不出来：{e}"
                }
            } else if r.loading {
                div { class: "ob-note",
                    if github { "正在问 gh repo list…" } else { "正在问 codehub-cli…" }
                }
            } else if r.asked && r.rows.is_empty() {
                div { class: "ob-note", "没有列到仓，也可以直接输入地址。" }
            }

            if *open.read() && !r.rows.is_empty() {
                div { class: "repo-pop",
                    if shown_rows.is_empty() {
                        div { class: "empty",
                            "拉到了 {r.rows.len()} 个仓,没有匹配「{query}」的。"
                        }
                    } else {
                        for row in shown_rows.iter() {
                            {repo_option(row, &bridge, github, &host, remote, query, open)}
                        }
                    }
                }
            }
        }
    }
}

/// 使用 mousedown；blur 会在 click 前关闭列表。
#[allow(clippy::too_many_arguments)]
fn repo_option(
    row: &RepoRowVm,
    bridge: &Bridge,
    github: bool,
    host: &str,
    mut remote: Signal<String>,
    mut query: Signal<String>,
    mut open: Signal<bool>,
) -> Element {
    let b = bridge.clone();
    let (path, host2) = (row.path.clone(), host.to_string());
    let git_ref = row.default_branch.clone();
    rsx! {
        div {
            key: "{row.path}",
            class: "repo-opt",
            onmousedown: move |e| {
                e.prevent_default();
                remote.set(path.clone());
                // 已阻止默认失焦行为，选择后需显式关闭列表。
                open.set(false);
                // 检索词清掉:下次光标再进那格,看到的是整张列表,而不是被
                // 上一次选中的仓名筛得只剩一行。
                query.set(String::new());
                b.send(Req::PickRepo {
                    github,
                    host: host2.clone(),
                    path: path.clone(),
                    git_ref: git_ref.clone(),
                });
            },
            div { class: "row",
                span { class: "mono", "{row.path}" }
                if row.private { span { class: "tag tag-outline", "私有" } }
                if !row.default_branch.is_empty() {
                    span { class: "tag tag-outline mono", "{row.default_branch}" }
                }
            }
            if !row.description.is_empty() {
                div { class: "repo-opt-desc", "{row.description}" }
            }
        }
    }
}

fn adopted_note(probe: &RepoProbe) -> Element {
    rsx! {
        div { class: "ob-note",
            match probe {
                RepoProbe::NotAsked => rsx! {
                    "尚未读取项目名片。"
                },
                RepoProbe::Loading => rsx! { "正在读取项目名片…" },
                RepoProbe::Adopted => rsx! {
                    strong { "已发现 .bw/project.toml" }
                    "，基础信息已带入。"
                },
                RepoProbe::Absent => rsx! {
                    "未发现项目名片，请补全基础信息。"
                },
                RepoProbe::NoRepo(e) => rsx! {
                    strong { "找不到可用的 Git 仓：" }
                    "{e}"
                },
                RepoProbe::Failed(e) => rsx! {
                    strong { "项目名片读取失败：" }
                    "{e}"
                },
            }
        }
    }
}

fn clone_target(parent: &str, remote: &str) -> String {
    let name = remote
        .trim()
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim_end_matches(".git");
    if parent.trim().is_empty() || name.is_empty() {
        String::new()
    } else {
        std::path::Path::new(parent.trim())
            .join(name)
            .display()
            .to_string()
    }
}

/// 空白输入使用回显值；接入字段不支持显式清空。
fn pick(typed: &str, fallback: &str) -> String {
    let t = typed.trim();
    if t.is_empty() {
        fallback.trim().to_string()
    } else {
        t.to_string()
    }
}

/// 保留输入中的空格，避免输入时光标和内容跳动。
fn shown(typed: &str, fallback: &str) -> String {
    if typed.is_empty() {
        fallback.to_string()
    } else {
        typed.to_string()
    }
}

fn platform_pills(gh: bool, mut github: Signal<bool>, zone: &str, bridge: &Bridge) -> Element {
    let pills: Vec<Element> = [(false, "codehub"), (true, "GitHub")]
        .into_iter()
        .map(|(want_gh, label)| {
            let (b, z) = (bridge.clone(), zone.to_string());
            rsx! {
                label {
                    key: "{label}",
                    class: "seg-opt",
                    input {
                        r#type: "radio",
                        name: "ob-platform",
                        checked: gh == want_gh,
                        onchange: move |_| {
                            github.set(want_gh);
                            b.send(Req::ListRepos { github: want_gh, host: z.clone() });
                        },
                    }
                    "{label}"
                }
            }
        })
        .collect();
    rsx! { div { class: "seg", {pills.into_iter()} } }
}

fn zone_pills(zone: &str, mut host: Signal<String>, bridge: &Bridge) -> Element {
    let pills: Vec<Element> = CODEHUB_ZONES
        .iter()
        .copied()
        .map(|(key, label)| {
            let b = bridge.clone();
            rsx! {
                label {
                    key: "{key}",
                    class: "seg-opt",
                    input {
                        r#type: "radio",
                        name: "ob-zone",
                        checked: zone == key,
                        onchange: move |_| {
                            host.set(key.to_string());
                            b.send(Req::ListRepos { github: false, host: key.to_string() });
                        },
                    }
                    "{label}"
                }
            }
        })
        .collect();
    rsx! { div { class: "seg", {pills.into_iter()} } }
}

fn slugify(name: &str) -> String {
    let s: String = name
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let s = s.trim_matches('-').to_string();
    if s.chars().all(|c| c == '-') {
        String::new()
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::clone_target;

    #[test]
    fn clone_target_appends_repo_name_to_configured_parent() {
        let parent = std::env::temp_dir();
        let got = clone_target(
            &parent.display().to_string(),
            "forcegravity1989/builder-workbench.git",
        );
        assert_eq!(got, parent.join("builder-workbench").display().to_string());
    }
}
