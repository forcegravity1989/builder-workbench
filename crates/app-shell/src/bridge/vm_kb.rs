use crate::vm::*;
use std::path::Path;

const PLAN_DIR: &str = ".bw/plan";
const RELEASES_PATH: &str = ".bw/releases.md";

pub(super) fn managed_paths(ws: &Path) -> Vec<String> {
    [
        ".bw/project.toml",
        ".bw/issue-policy.toml",
        ".bw/metrics.toml",
        ".bw/PROJECT.md",
    ]
    .into_iter()
    .filter(|rel| ws.join(rel).is_file())
    .map(|rel| rel.to_string())
    .collect()
}

const HEAD_BYTES: usize = 512;

fn read_head(path: &Path) -> String {
    use std::io::Read;
    let Ok(mut f) = std::fs::File::open(path) else {
        return String::new();
    };
    let mut buf = vec![0u8; HEAD_BYTES];
    let n = f.read(&mut buf).unwrap_or(0);
    buf.truncate(n);
    // 截断可能切在半个汉字上,按有损转换 —— 这段只用来找一行 ASCII 标记。
    String::from_utf8_lossy(&buf).into_owned()
}

pub(super) fn build_kb(ws: &Path, tab: KbTab, open: Option<&str>) -> KbVm {
    let managed_count = managed_paths(ws).len();
    let mut groups = Vec::new();

    let mut charter = Vec::new();
    for (rel, label) in [("AGENTS.md", "开发手册")] {
        if ws.join(rel).is_file() {
            charter.push(KbFileVm {
                rel: rel.into(),
                label: format!("{rel} · {label}"),
                badge: String::new(),
            });
        }
    }
    push_group(&mut groups, "开发规范", charter);

    let mut spec = Vec::new();
    for (rel, label) in [
        (".bw/project.toml", "项目名片"),
        (".bw/metrics.toml", "指标"),
        (".bw/issue-policy.toml", "旧开工约定（已停用）"),
        (".bw/standard.toml", "旧规范版本（已停用）"),
        (".bw/managed.toml", "旧文件校验记录（已停用）"),
        (".bw/PROJECT.md", "旧项目名片（已停用）"),
    ] {
        if ws.join(rel).is_file() {
            spec.push(KbFileVm {
                rel: rel.into(),
                label: format!("{rel} · {label}"),
                badge: String::new(),
            });
        }
    }
    push_group(&mut groups, "项目配置文件", spec);

    let mut weeks: Vec<KbFileVm> = std::fs::read_dir(ws.join(PLAN_DIR))
        .map(|d| {
            d.flatten()
                .filter(|e| e.path().extension().is_some_and(|x| x == "md"))
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let rel = format!("{}/{name}", PLAN_DIR);
                    let backfilled = read_head(&e.path())
                        .lines()
                        .take(12)
                        .any(|l| l.trim() == "origin: backfill");
                    KbFileVm {
                        label: name.trim_end_matches(".md").to_string(),
                        rel,
                        badge: if backfilled {
                            "回填".into()
                        } else {
                            String::new()
                        },
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    weeks.sort_by(|a, b| b.label.cmp(&a.label));
    push_group(&mut groups, "周计划", weeks);

    let mut rel_files = Vec::new();
    if ws.join(RELEASES_PATH).is_file() {
        rel_files.push(KbFileVm {
            rel: RELEASES_PATH.into(),
            label: "发版记录".into(),
            badge: String::new(),
        });
    }
    push_group(&mut groups, "发版记录", rel_files);

    for (dir, title) in [(".bw/decisions", "决策记录"), (".bw/design", "设计产物")] {
        let mut files: Vec<KbFileVm> = std::fs::read_dir(ws.join(dir))
            .map(|d| {
                d.flatten()
                    .filter(|e| e.path().extension().is_some_and(|x| x == "md"))
                    .map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        KbFileVm {
                            label: name.trim_end_matches(".md").to_string(),
                            rel: format!("{dir}/{name}"),
                            badge: String::new(),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();
        files.sort_by(|a, b| a.label.cmp(&b.label));
        push_group(&mut groups, title, files);
    }

    KbVm {
        tab,
        open_doc: open.and_then(|rel| {
            std::fs::read_to_string(ws.join(rel))
                .map(|body| (rel.to_string(), body))
                .or_else(|e| Ok::<_, std::io::Error>((rel.to_string(), format!("读取失败:{e}"))))
                .ok()
        }),
        groups,
        managed_count,
        codegraph: None,
        assets: None,
    }
}

fn push_group(out: &mut Vec<KbGroupVm>, title: &str, files: Vec<KbFileVm>) {
    if files.is_empty() {
        return;
    }
    out.push(KbGroupVm {
        title: title.to_string(),
        files,
    });
}

pub(super) async fn build_codegraph(ws: &Path) -> CodeGraphVm {
    use crate::adapters::codegraph::{big_files, detect, init_index, Availability};
    let state = detect(ws);
    if state == Availability::NotInstalled {
        return CodeGraphVm {
            state: "not_installed".into(),
            hint: state.hint(),
            ..CodeGraphVm::default()
        };
    }
    if state == Availability::NotIndexed {
        if let Err(e) = init_index(ws).await {
            return CodeGraphVm {
                state: "not_indexed".into(),
                hint: Availability::NotIndexed.hint(),
                error: e,
                ..CodeGraphVm::default()
            };
        }
    }
    match big_files(ws, 20).await {
        Ok(rows) => CodeGraphVm {
            state: "ready".into(),
            rows: rows
                .into_iter()
                .map(|r| CodeFileVm {
                    path: r.path,
                    language: r.language,
                    nodes: r.node_count,
                    size: r.size,
                })
                .collect(),
            ..CodeGraphVm::default()
        },
        Err(e) => CodeGraphVm {
            state: "ready".into(),
            error: e,
            ..CodeGraphVm::default()
        },
    }
}

pub(super) async fn build_assets(ws: &Path, releases: Vec<ReleaseVm>) -> AssetsVm {
    let artifacts = bw::git::artifacts(ws, 200)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|a| ArtifactVm {
            path: a.path,
            commit: a.commit,
            subject: a.subject,
            issue: a.issue_number.map(|n| format!("#{n}")).unwrap_or_default(),
        })
        .collect();

    let (repo_stats, error) = match bw_engine::evidence::collect(&ws.display().to_string()).await {
        Ok(e) => (
            vec![
                ("提交数".to_string(), e.commit_count.to_string()),
                ("跟踪的文件".to_string(), e.tracked_files.to_string()),
                ("没提交的改动".to_string(), e.dirty_paths.to_string()),
                ("docs/ 下的 .md".to_string(), e.docs_files.to_string()),
            ],
            String::new(),
        ),
        Err(e) => (Vec::new(), format!("读不到仓统计:{e}")),
    };

    AssetsVm {
        distilled: Vec::new(),
        artifacts,
        releases,
        repo_stats,
        error,
    }
}
