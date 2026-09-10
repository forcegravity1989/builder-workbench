//! `onboard_smoke` —— 「完成接入」那一下到底做了什么的读回证据。
//!
//! ```bash
//! cargo run -p bw --example onboard_smoke -- <工作目录> [owner/repo]
//! ```
//!
//! 给了 `owner/repo` 才跑真 clone 那一档(要 `gh auth login` 过);不给就只跑
//! 不碰网络的四档。不碰 claude、不碰网关。工作目录每次跑之前会被清空。
//!
//! 五档,每档都是「接入」会遇到的一种真实局面:
//!
//! 1. 人自己 clone 在工作区之外的本地仓 → 直接使用,路径原样登记
//! 2. 目录里已经是个 git 仓 → 直接用,顺带把 origin 报出来
//! 3. 目录里有东西、又不是 git 仓 → **弹回**,而且库里不许留下半个项目
//! 4. 同一个 slug 再接一次 → 幂等,不建第二行
//! 5. 填了远端、目录不在 → 真 clone 下来,HEAD 能读回
//! 6. 每一档接完都自动建了那张「项目约定」的活,而且**它最远只到评审中**
//! 7. 从工作台移走一个项目:库里干干净净,**仓一个字节都不动**
//! 8. **成熟仓**(自己已经有 CLAUDE.md / AGENTS.md / README):铺底不许盖掉它们
//!
//! 第 3 档是这个例子最要紧的一条:V4 没有「删项目」这条命令,接入中途失败要是
//! 在库里留了一行,那一行就永远赖在项目墙上了。

use bw::app::{App, ProgressLine};
use bw::command::{Command, ProjectIntent, RemoteRef};
use std::path::{Path, PathBuf};
use std::sync::Arc;

fn say(step: &str, detail: &str) {
    println!("[ONBOARD_SMOKE] {step}:{detail}");
}

fn intent(n: &str) -> ProjectIntent {
    ProjectIntent {
        name: n.to_string(),
        ..Default::default()
    }
}

async fn git(dir: &Path, args: &[&str]) {
    tokio::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .await
        .expect("跑 git");
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    bw::isoweek::init_local_offset();
    let mut args = std::env::args().skip(1);
    let root = PathBuf::from(args.next().unwrap_or_else(|| {
        eprintln!("用法:cargo run -p bw --example onboard_smoke -- <工作目录> [owner/repo]");
        std::process::exit(2);
    }));
    let real_repo = args.next();
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root)?;

    let workspaces = root.join("workspaces");
    std::fs::create_dir_all(&workspaces)?;
    let (prog_tx, mut prog_rx) = tokio::sync::broadcast::channel::<ProgressLine>(64);
    let mut app = App::new(
        workspaces.clone(),
        Arc::new(bw_engine::MockInteractiveExecutor),
    )
    .with_asset_root(workspaces.join(".bw-assets"))
    .with_progress(prog_tx);

    // 每一档跑完就把这一档报的进度行倒出来 —— 界面上看到的就是这些。
    let drain = |label: &str, rx: &mut tokio::sync::broadcast::Receiver<ProgressLine>| {
        while let Ok(l) = rx.try_recv() {
            println!(
                "[ONBOARD_SMOKE]   {label} 进度 · 第{}步 {:?} {}",
                l.step, l.state, l.text
            );
        }
    };

    // ── 1 · 工作区之外的本地仓 ──────────────────────────────
    let external = root.join("people-cloned-it-here");
    std::fs::create_dir_all(&external)?;
    git(&external, &["init", "-q"]).await;
    app.dispatch(Command::CreateProject {
        slug: "no-remote".into(),
        intent: intent("没远端的项目"),
        remote: RemoteRef::default(),
        workspace_path: external.display().to_string(),
    })
    .await?;
    drain("档1", &mut prog_rx);
    say(
        "档 1 · 是否直接使用自选目录",
        &format!(
            "{}",
            app.project_by_slug("no-remote")
                .await?
                .map(|p| p.workspace_path == external.display().to_string())
                .unwrap_or(false)
        ),
    );

    // ── 2 · 目录里已经是个 git 仓 ────────────────────────────
    let already = workspaces.join("already");
    std::fs::create_dir_all(&already)?;
    git(&already, &["init", "-q"]).await;
    git(
        &already,
        &["remote", "add", "origin", "https://example.com/a/b.git"],
    )
    .await;
    app.dispatch(Command::CreateProject {
        slug: "already".into(),
        intent: intent("本机已有仓"),
        remote: RemoteRef::default(),
        workspace_path: String::new(),
    })
    .await?;
    drain("档2", &mut prog_rx);
    say(
        "档 2 · 那个仓被动过吗",
        &format!(
            "{}(.git 还在,没被 clone 覆盖)",
            already.join(".git").is_dir()
        ),
    );

    // ── 3 · 目录里有东西、又不是 git 仓 ───────────────────────
    let junk = workspaces.join("junk");
    std::fs::create_dir_all(&junk)?;
    std::fs::write(junk.join("别人的文件.txt"), "不许动我")?;
    let refused = app
        .dispatch(Command::CreateProject {
            slug: "junk".into(),
            intent: intent("撞上别人目录"),
            remote: RemoteRef {
                provider: "github".into(),
                host: "github.com".into(),
                path: "someone/else".into(),
            },
            workspace_path: String::new(),
        })
        .await;
    drain("档3", &mut prog_rx);
    say("档 3 · 弹回了吗", &format!("{refused:?}"));
    say(
        "档 3 · 库里留下项目了吗",
        &format!(
            "{:?}(该是 None —— 留下就删不掉了)",
            app.project_by_slug("junk").await?.map(|p| p.slug)
        ),
    );
    say(
        "档 3 · 别人的文件还在吗",
        &format!("{}", junk.join("别人的文件.txt").is_file()),
    );

    // ── 4 · 幂等 ────────────────────────────────────────────
    let before = app.projects().await?.len();
    app.dispatch(Command::CreateProject {
        slug: "no-remote".into(),
        intent: intent("再接一次"),
        remote: RemoteRef::default(),
        workspace_path: external.display().to_string(),
    })
    .await?;
    drain("档4", &mut prog_rx);
    say(
        "档 4 · 项目条数",
        &format!(
            "接之前 {before} → 接之后 {}(该一样)",
            app.projects().await?.len()
        ),
    );

    // ── 6 · 接入自动建的那张「项目约定」活 ────────────────────
    // 第 0 站:接入完 Workbench 自己建一张轻量活「项目约定」。这里读回它
    // 真的建了、而且**状态最远只到评审中** —— 自动建的活绝不
    // 自动完成,这条是铁律。
    for slug in ["no-remote", "already"] {
        let pid = app.project_by_slug(slug).await?.unwrap().id;
        let rows = app.issues(pid).await.unwrap_or_default();
        let shown: Vec<String> = rows
            .iter()
            .map(|i| {
                format!(
                    "#{} 「{}」 来源={:?} 状态={:?}",
                    i.number, i.title, i.origin, i.status
                )
            })
            .collect();
        say(
            &format!("档 6 · {slug} 接完自动建的活"),
            &format!("{} 张:{}", rows.len(), shown.join(" | ")),
        );
        say(
            &format!("档 6 · {slug} 有没有活被推到「完成」"),
            &format!(
                "{}(该是 false —— 自动建的活绝不自动完成)",
                rows.iter()
                    .any(|i| i.status == bw::model::IssueStatus::Done)
            ),
        );
    }

    // ── 8 · 成熟仓不许被盖 ──────────────────────────────────
    // workbench 自己就是这种仓:根目录有一份人写了很久的 CLAUDE.md。
    // 接入不写仓根。盖掉就是事故。
    let mature = workspaces.join("mature");
    std::fs::create_dir_all(&mature)?;
    git(&mature, &["init", "-q"]).await;
    std::fs::write(
        mature.join("CLAUDE.md"),
        "# 人写了很久的 CLAUDE.md\n别动我\n",
    )?;
    std::fs::write(mature.join("AGENTS.md"), "# 人写的 AGENTS.md\n也别动我\n")?;
    std::fs::write(mature.join("README.md"), "# 人写的 README\n")?;
    // 有构建文件,才验得了「怎么建怎么测」那一节是真探出来的还是编的。
    std::fs::write(
        mature.join("Cargo.toml"),
        "[package]\nname = \"mature\"\nversion = \"0.1.0\"\n",
    )?;
    std::fs::create_dir_all(mature.join("src"))?;
    std::fs::write(mature.join("src/lib.rs"), "")?;
    git(&mature, &["add", "-A"]).await;
    git(
        &mature,
        &[
            "-c",
            "user.email=t@t",
            "-c",
            "user.name=t",
            "commit",
            "-q",
            "-m",
            "init",
        ],
    )
    .await;
    app.dispatch(Command::CreateProject {
        slug: "mature".into(),
        intent: intent("成熟仓"),
        remote: RemoteRef::default(),
        workspace_path: String::new(),
    })
    .await?;
    drain("档8", &mut prog_rx);
    for f in ["CLAUDE.md", "AGENTS.md", "README.md"] {
        let body = std::fs::read_to_string(mature.join(f)).unwrap_or_default();
        say(
            &format!("档 8 · 主检出的 {f}"),
            &format!(
                "首行「{}」· 还是人写的那份={}",
                body.lines().next().unwrap_or("(空)"),
                body.contains("人写")
            ),
        );
    }

    // ── 9 · 名片没在主检出里留一份「未跟踪的双胞胎」 ──────────
    // 接入那一步为了让界面立刻有东西看,把名片写进主检出;铺底又把同一份提交
    // 进分支。两份都留着的话,人合完 MR 一 `git pull`,git 会一句
    // 「untracked working tree files would be overwritten by merge」顶回来,
    // 拉不动。所以提交成功之后主检出那份要没了 —— 正本在分支上。
    let twin = mature.join(bw::repo::project_file::REL_PATH);
    let on_branch = std::process::Command::new("git")
        .args([
            "-C",
            mature.to_str().unwrap(),
            "show",
            "bw/issue-1:.bw/project.toml",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    say(
        "档 9 · 名片",
        &format!(
            "主检出里还留着吗={}(该是 false)· 分支上有吗={}(该是 true)",
            twin.exists(),
            on_branch
        ),
    );

    // ── 10 · 接项目时,仓根一个字都不写 ──────────────────────
    // 这条是第 0 站的边界:Workbench 只铺**自己的**资产,全在 `.bw/` 底下。仓根的
    // `AGENTS.md` / `CLAUDE.md` 是这个项目自己的文件 —— 要不要写开发手册是
    // 项目自己的事,接项目和一个字都不写仓根。
    // 接项目的时候 Workbench 才刚 clone 完,既没读过这个仓,也没人问过人家愿不愿意。
    for (label, ws) in [
        ("成熟仓", mature.clone()),
        ("空仓", workspaces.join("no-remote")),
    ] {
        // 分支上写了什么最能说明问题 —— 主检出可能本来就有人写的那几份。
        // 活的 worktree 落在仓根下 `.bw/worktrees/issue-1`(新路径);旧平级兄弟
        // 不再建。这里照底座的路径函数找那棵树,找不到就回退看主检出。
        let tree = bw_engine::workspace::issue_worktree_path(&ws, 1).unwrap_or_else(|| ws.clone());
        let look = if tree.is_dir() { tree } else { ws.clone() };
        let listed = std::fs::read_dir(&look)
            .map(|d| {
                let mut v: Vec<String> = d
                    .flatten()
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .filter(|n| n.ends_with(".md") || n.ends_with(".toml"))
                    .collect();
                v.sort();
                v
            })
            .unwrap_or_default();
        say(
            &format!("档 10 · {label}的仓根,铺底之后有哪些 .md/.toml"),
            &format!(
                "{listed:?} · 有 Workbench 写的 AGENTS.md/CLAUDE.md={}(该是 false)",
                ["AGENTS.md", "CLAUDE.md"].iter().any(|f| {
                    std::fs::read_to_string(look.join(f))
                        .map(|t| t.contains("bw:managed"))
                        .unwrap_or(false)
                })
            ),
        );
    }
    say(
        "档 10 · 成熟仓里人写的那三份",
        &format!(
            "AGENTS.md 还是人写的={} · CLAUDE.md 还是人写的={} · README 还是人写的={}",
            std::fs::read_to_string(mature.join("AGENTS.md"))
                .unwrap_or_default()
                .contains("人写的"),
            std::fs::read_to_string(mature.join("CLAUDE.md"))
                .unwrap_or_default()
                .contains("人写"),
            std::fs::read_to_string(mature.join("README.md"))
                .unwrap_or_default()
                .contains("人写的")
        ),
    );

    // ── 7 · 从工作台移走 ────────────────────────────────────
    // 项目卡右上角那个 ×。只动库,绝不动仓 —— 这条要能读回来,不然「移走」
    // 就成了「删掉我的代码」。
    let gone = app.project_by_slug("already").await?.unwrap().id;
    let ws_before = already.join(".git").is_dir();
    let ev = app
        .dispatch(Command::RemoveProject { project_id: gone })
        .await?;
    say("档 7 · 移走的回执", &format!("{ev:?}"));
    say(
        "档 7 · 库里还有它吗",
        &format!(
            "项目={:?} · 活={} 张(都该是空)",
            app.project_by_slug("already").await?.map(|p| p.slug),
            app.issues(gone).await.unwrap_or_default().len()
        ),
    );
    say(
        "档 7 · 仓还在吗",
        &format!(
            "移走前 .git={ws_before} → 移走后 .git={} · 目录还在={}",
            already.join(".git").is_dir(),
            already.is_dir()
        ),
    );

    // ── 5 · 真 clone ────────────────────────────────────────
    match real_repo {
        None => say("档 5 · 真 clone", "没给 owner/repo,跳过"),
        Some(slug_path) => {
            let name = slug_path.rsplit('/').next().unwrap_or("cloned").to_string();
            let r = app
                .dispatch(Command::CreateProject {
                    slug: name.clone(),
                    intent: intent(&name),
                    remote: RemoteRef {
                        provider: "github".into(),
                        host: "github.com".into(),
                        path: slug_path.clone(),
                    },
                    workspace_path: String::new(),
                })
                .await;
            drain("档5", &mut prog_rx);
            say("档 5 · 接入结果", &format!("{r:?}"));
            let ws = workspaces.join(&name);
            say(
                "档 5 · clone 下来了吗",
                &format!(
                    ".git={} · .bw/project.toml={}",
                    ws.join(".git").is_dir(),
                    ws.join(".bw/project.toml").is_file()
                ),
            );
            let head = tokio::process::Command::new("git")
                .args(["log", "-1", "--oneline"])
                .current_dir(&ws)
                .output()
                .await?;
            say(
                "档 5 · 仓里最新一条提交",
                String::from_utf8_lossy(&head.stdout).trim(),
            );
        }
    }
    Ok(())
}
