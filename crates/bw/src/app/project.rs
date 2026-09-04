//! 接入项目、改项目信息(名片 + 在研版本 + 项目群)。
//!
//! 正本是 `.bw/project.toml`,**不落库**——`project`
//! 表只有定位与显示缓存。改这些就是改仓文件,得走一张轻量活与一次 MR,
//! 不是直接 UPDATE 一行。

use super::worktree;
use super::{issue_store, App, AppError, ProgressLine, Result};
use crate::command::{Event, ProjectIntent, RemoteRef};
use crate::model::{IssueStatus, Project, ProjectId};
use crate::repo::project_file::{self, ChatConfig};

impl App {
    pub(super) async fn create_project(
        &mut self,
        slug: String,
        intent: ProjectIntent,
        remote: RemoteRef,
        workspace_path: String,
    ) -> Result<Vec<Event>> {
        // 幂等:同名项目已存在就原样返回,不建第二行。
        if let Some(existing) = self.project_by_slug(&slug).await? {
            self.step(ProgressLine::ok(
                1,
                format!("库里已经有 {slug} 这个项目了,没重复建"),
            ));
            return Ok(vec![Event::ProjectCreated {
                id: existing.id,
                slug,
                adopted: true,
            }]);
        }

        // **先把仓弄到手,再建项目行。** 反过来的话,clone 失败会在库里留下
        // 一个指向空目录的项目 —— 而 V4 没有「删项目」这条命令,那一行就永远
        // 赖在项目墙上了。
        let ws = self.workspace_at(&slug, &workspace_path);
        self.fetch_repo(&ws, &remote).await?;

        let id = ProjectId::new();
        let row = Project {
            id,
            slug: slug.clone(),
            name: intent.name.clone(),
            workspace_path: workspace_path.clone(),
            provider: remote.provider.clone(),
            remote_host: remote.host.clone(),
            remote_path: remote.path.clone(),
            signal: None,
            weekly_signal: None,
            signal_derived_at: None,
            sort_order: 0.0,
            created_at: 0,
            updated_at: 0,
        };
        let row = self.upsert_project(&row).await?;
        self.step(ProgressLine::ok(3, format!("项目 {slug} 已落库")));

        // 磁盘上的名片只用来补空字段(seed),不拿来判断「已经接入」。
        // 跳过建车只认:默认分支 HEAD 已有名片,或已经开着项目约定/残留旧标题。
        self.step(ProgressLine::doing(4, "读仓里的名片(.bw/project.toml)…"));
        let existing = project_file::read(&ws)?;
        let in_head = crate::git::path_in_head(&ws, project_file::REL_PATH).await;
        let open_charter = issue_store::find_open_charter(self, &row).await?.is_some();
        let adopted = in_head || open_charter;
        let mut file = existing.unwrap_or_default();
        fill_if_blank(&mut file.name, &intent.name);
        fill_if_blank(&mut file.brief, &intent.brief);
        fill_if_blank(&mut file.benchmark, &intent.benchmark);
        fill_if_blank(&mut file.opportunity, &intent.north_star);
        // **不写主检出**。第一次接入的名片只落在「项目约定」那棵树上。
        self.step(ProgressLine::ok(
            4,
            if adopted {
                "仓里本来就有名片,一个字没覆盖,只补了空着的字段。不重复开项目约定".to_string()
            } else {
                "名片只写在项目约定那棵树上,主检出不动".to_string()
            },
        ));

        // 仓里已经有名片,或已经开着项目约定 / 残留铺底 / 残留改名片,不再建第二张。
        let mut events = vec![Event::ProjectCreated {
            id: row.id,
            slug,
            adopted,
        }];
        if adopted {
            self.step(ProgressLine::ok(5, "仓里已有项目信息,跳过项目约定"));
        } else {
            match self.run_standard_bootstrap(row.id, &file).await {
                Ok(more) => events.extend(more),
                Err(e) => self.step(ProgressLine::fail(
                    5,
                    format!("项目约定没写成:{e} —— 项目已经接进来了。总览横幅会提示还没合入"),
                )),
            }
        }
        // 纳入时替人把仓登记进 Orca。Orca 没开不推翻接入;
        // 接入后会进项目,那一次不是 Open,所以没打上要人退回项目墙再点进来。
        if self.pty_enabled {
            match bw_engine::orca::connect() {
                Ok(rt) => match bw_engine::orca::ensure_repo(&rt, &ws).await {
                    Ok(()) => match self.ensure_orca_automations(&rt, &ws).await {
                        Ok(()) => self.step(ProgressLine::ok(
                            6,
                            "Orca 认得这个仓,三条运作自动化已写入(默认关)",
                        )),
                        Err(e) => self.step(ProgressLine::fail(
                            6,
                            format!("Orca 定时没打上:{e} —— 退回项目墙再点进来会再打"),
                        )),
                    },
                    Err(e) => self.step(ProgressLine::fail(
                        6,
                        format!("Orca 还没记下这个仓:{e} —— 退回项目墙再点进来会再打"),
                    )),
                },
                Err(_) => self.step(ProgressLine::fail(
                    6,
                    "Orca 没开,仓没登记 —— 退回项目墙再点进来会再打",
                )),
            }
        }
        Ok(events)
    }

    /// 把仓弄到本机。接入这一步真正花时间的就是它。
    ///
    /// 四种局面,每种都如实说清楚,**一种都不许静悄悄地当成成功**:
    ///
    /// - 目录里已经是个 git 仓 → 直接用,顺带把它的 origin 报出来给人核对
    /// - 目录不在或是空的 + 填了远端 → `gh repo clone` / codehub clone
    /// - 目录不在或是空的 + 没填远端 → 建个空目录,并说明这是个空仓
    /// - 目录里有东西、又不是 git 仓 → **弹回**,既不敢往里 clone,也不敢
    ///   把别人的目录当成这个项目的仓
    async fn fetch_repo(&self, ws: &std::path::Path, remote: &RemoteRef) -> Result<()> {
        let shown = ws.display().to_string();
        if ws.join(".git").exists() {
            let origin = bw_engine::github::origin_remote_url(ws)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| "没配 origin".into());
            self.step(ProgressLine::ok(
                2,
                format!("本机已经有这个仓,直接用:{shown}(origin = {origin})"),
            ));
            return Ok(());
        }

        let occupied = std::fs::read_dir(ws)
            .map(|mut d| d.next().is_some())
            .unwrap_or(false);
        if occupied {
            let why = format!(
                "{shown} 里已经有东西了,又不是个 git 仓 —— 不敢往里 clone,也不敢当成这个项目的仓。换个路径,或者先把它清空。"
            );
            self.step(ProgressLine::fail(2, why.clone()));
            return Err(AppError::Refused(why));
        }

        if remote.path.trim().is_empty() {
            std::fs::create_dir_all(ws).map_err(|e| crate::repo::RepoFileError::Io {
                path: shown.clone(),
                source: e,
            })?;
            self.step(ProgressLine::ok(
                2,
                format!("没填远端地址,先建了个空目录当仓:{shown}"),
            ));
            return Ok(());
        }

        self.step(ProgressLine::doing(
            2,
            format!("把 {} clone 到 {shown}…", remote.path),
        ));
        // clone 自己会建目录。先建出来的话 gh 会因为「目标目录已存在」拒绝。
        if let Some(parent) = ws.parent() {
            std::fs::create_dir_all(parent).map_err(|e| crate::repo::RepoFileError::Io {
                path: parent.display().to_string(),
                source: e,
            })?;
        }
        let _ = std::fs::remove_dir(ws); // 空目录才删得掉,正合适
        let got = if remote.provider == "codehub" {
            bw_engine::codehub::clone_repo(&remote.host, &remote.path, ws)
                .await
                .map_err(|e| e.to_string())
        } else {
            match remote.path.split_once('/') {
                Some((owner, repo)) => bw_engine::github::clone_repo(owner, repo, ws)
                    .await
                    .map(|_| ())
                    .map_err(|e| e.to_string()),
                None => Err(format!(
                    "「{}」不是 owner/repo 的样子,clone 不了",
                    remote.path
                )),
            }
        };
        match got {
            Ok(()) => {
                let head = crate::git::head_sha(ws)
                    .await
                    .map(|h| h.chars().take(7).collect::<String>())
                    .unwrap_or_default();
                self.step(ProgressLine::ok(
                    2,
                    if head.is_empty() {
                        format!("clone 好了:{shown}")
                    } else {
                        format!("clone 好了:{shown}(当前提交 {head})")
                    },
                ));
                Ok(())
            }
            Err(e) => {
                let why = format!("clone 没成:{e}");
                self.step(ProgressLine::fail(2, why.clone()));
                Err(AppError::Refused(why))
            }
        }
    }

    /// 把一个项目从工作台上移走。
    ///
    /// **只动库,不动仓**:仓里是真实的劳动成果,活自己的 worktree 也是 ——
    /// 「我不想在工作台上看见它了」不构成删掉它们的授权。回执里如实报出仓
    /// 还在哪儿,人真要删自己去删。
    pub(super) async fn remove_project(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let project = self
            .project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))?;
        let ws = self.workspace_of(project_id).await?;
        let issues = self.remove_project_entry(project_id).await?;
        Ok(vec![Event::ProjectRemoved {
            slug: project.slug,
            issues,
            workspace: ws.display().to_string(),
        }])
    }

    pub(super) async fn edit_project_card(
        &mut self,
        project_id: ProjectId,
        intent: ProjectIntent,
    ) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let project = self
            .project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))?;

        // 项目约定常驻车:开着的「项目约定」/ 残留「编辑项目名片」/ 残留铺底
        // 接着写;没有就建一张「项目约定」。主检出不动。
        let issue = match issue_store::find_open_charter(self, &project).await? {
            Some(existing) => existing,
            None => {
                issue_store::create(
                    self,
                    &project,
                    issue_store::CHARTER_TITLE,
                    "项目信息改动:名片四字段 / 在研版本 / 项目群。改的是 \
                     .bw/project.toml,等人评审合入。",
                    crate::model::IssueKind::Light,
                    "",
                    &[],
                )
                .await?
            }
        };

        let tree = if issue.title == issue_store::CHARTER_TITLE {
            worktree::provision_project(&ws).await?
        } else {
            worktree::provision(&ws, issue.number).await?
        };
        let mut file = project_file::read(&tree.path)?.unwrap_or_default();
        file.name = intent.name.clone();
        file.brief = intent.brief.clone();
        file.benchmark = intent.benchmark.clone();
        file.opportunity = intent.north_star.clone();
        file.chat = if intent.chat_provider.is_empty() || intent.chat_provider == "none" {
            None
        } else {
            Some(ChatConfig {
                provider: intent.chat_provider.clone(),
                group_id: intent.chat_group.clone(),
                notify: Some(intent.chat_notify.clone()),
            })
        };
        project_file::write(&tree.path, &file)?;

        // 库里的名字是项目墙的显示缓存,跟着改一次。
        self.update_project_location(
            project_id,
            &intent.name,
            &project.workspace_path,
            &project.provider,
            &project.remote_host,
            &project.remote_path,
        )
        .await?;

        let base = crate::git::head_sha(&ws).await.unwrap_or_default();
        let title = format!("#{} {}", issue.number, issue.title);
        crate::git::commit_all(&tree.path, &title).await?;
        let commits = if base.is_empty() {
            0
        } else {
            crate::git::commits_ahead_of(&tree.path, &base)
                .await
                .unwrap_or(0)
        };
        let mr = worktree::push_and_open_mr(
            &project,
            &tree,
            commits > 0,
            &title,
            "项目信息改动,等人评审合入。",
        )
        .await;

        let mut events = vec![Event::ProjectCardEditPending { issue_id: issue.id }];
        // 新建轻量活是待办池。状态机不许待办池直接进评审中,要先到进行中
        // (规范铺底同一条跳法)。只在 MR 真开着时推——没交出评审就不假装在审。
        if mr.number > 0 && issue.status != IssueStatus::InReview {
            if issue.status.can_transition_to(IssueStatus::InProgress) {
                events.extend(
                    self.transition_issue(issue.id, IssueStatus::InProgress)
                        .await?,
                );
            }
            events.extend(
                self.transition_issue(issue.id, IssueStatus::InReview)
                    .await?,
            );
        }
        events.push(Event::IssueSubmitted {
            id: issue.id,
            branch: tree.branch.clone(),
            commits,
            pr_number: mr.number,
            note: mr.note,
        });
        Ok(events)
    }
}

/// 只在原来是空的时候填 —— 人手写过的一个字都不动。
fn fill_if_blank(slot: &mut String, value: &str) {
    if slot.trim().is_empty() {
        *slot = value.to_string();
    }
}
