use super::worktree;
use super::{issue_store, App, AppError, ProgressLine, Result};
use crate::command::{Event, ProjectIntent, RemoteRef};
use crate::model::{codehub_alias_for_host, IssueStatus, Project, ProjectId};
use crate::repo::project_file::{self, ChatConfig};

impl App {
    pub(super) async fn create_project(
        &mut self,
        slug: String,
        intent: ProjectIntent,
        remote: RemoteRef,
        workspace_path: String,
    ) -> Result<Vec<Event>> {
        let requested = self.workspace_at(&slug, &workspace_path);
        if !requested.is_absolute() {
            return Err(AppError::Refused(format!(
                "本机仓路径必须是绝对路径:{}",
                requested.display()
            )));
        }

        // 同名但不同路径的仓库不能视为同一项目。
        if let Some(existing) = self.project_by_slug(&slug).await? {
            if !workspace_path.trim().is_empty() {
                let old = self.workspace_at(&existing.slug, &existing.workspace_path);
                if !same_workspace_path(&old, &requested) {
                    return Err(AppError::Refused(format!(
                        "项目名 {slug} 已经指向 {},不能再指到 {}",
                        old.display(),
                        requested.display()
                    )));
                }
            }
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

        self.fetch_repo(&requested, &remote).await?;
        let ws = dunce::canonicalize(&requested).map_err(|e| {
            AppError::Refused(format!("本机仓路径读不出来:{} ({e})", requested.display()))
        })?;
        let (remote, origin_warning) = resolve_remote_for_local_repo(&ws, remote).await?;
        if let Some(warning) = origin_warning {
            self.step(ProgressLine::fail(2, warning));
        }

        // 以实际仓库路径去重，避免多个项目争用同一组 worktree。
        for existing in self.projects().await? {
            let old = self.workspace_at(&existing.slug, &existing.workspace_path);
            if same_workspace_path(&old, &ws) {
                return Err(AppError::Refused(format!(
                    "这个本地仓已经作为「{}」接入了:{}",
                    existing.name,
                    ws.display()
                )));
            }
        }

        let id = ProjectId::new();
        let row = Project {
            id,
            slug: slug.clone(),
            name: intent.name.clone(),
            workspace_path: ws.display().to_string(),
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
        self.step(ProgressLine::ok(
            4,
            if adopted {
                "仓里本来就有名片,一个字没覆盖,只补了空着的字段。不重复开项目约定".to_string()
            } else {
                "名片只写在项目约定那棵树上,主检出不动".to_string()
            },
        ));

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
                            format!(
                                "Orca 默认自动化未全部就绪：{e}。处理上述原因后重新打开项目可重试"
                            ),
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

    async fn fetch_repo(&self, ws: &std::path::Path, remote: &RemoteRef) -> Result<()> {
        let shown = ws.display().to_string();
        if ws.join(".git").exists() {
            let origin = bw_engine::workspace::origin_remote_url(ws)
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
            let why = format!(
                "{shown} 不是 Git 仓。Workbench 不再用「新建项目」制造空目录;请选择已有 Git 仓,或从远端克隆。"
            );
            self.step(ProgressLine::fail(2, why.clone()));
            return Err(AppError::Refused(why));
        }

        self.step(ProgressLine::doing(
            2,
            format!("把 {} clone 到 {shown}…", remote.path),
        ));
        if let Some(parent) = ws.parent() {
            std::fs::create_dir_all(parent).map_err(|e| crate::repo::RepoFileError::Io {
                path: parent.display().to_string(),
                source: e,
            })?;
        }
        let _ = std::fs::remove_dir(ws); // 空目录才删得掉,正合适
        let got = match bw_engine::remote::Remote::for_host(&remote.provider, &remote.host) {
            Ok(r) => r
                .clone_repo(&remote.path, ws)
                .await
                .map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
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

    /// 移除本机项目记录，保留仓库和 worktree。
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

        let tree = worktree::provision_for(&ws, &issue).await?;
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

fn same_workspace_path(left: &std::path::Path, right: &std::path::Path) -> bool {
    match (dunce::canonicalize(left), dunce::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => comparable_path_text(left) == comparable_path_text(right),
    }
}

fn comparable_path_text(path: &std::path::Path) -> String {
    let text = path.to_string_lossy().replace('/', "\\");
    if cfg!(windows) {
        text.trim_end_matches('\\').to_ascii_lowercase()
    } else {
        text.trim_end_matches('\\').to_string()
    }
}

async fn resolve_remote_for_local_repo(
    ws: &std::path::Path,
    mut selected: RemoteRef,
) -> Result<(RemoteRef, Option<String>)> {
    selected.path = normalized_remote_path(&selected.path);
    let origin = bw_engine::workspace::origin_remote_url(ws)
        .await
        .map_err(|e| AppError::Exec(format!("读本地仓 origin 失败:{e}")))?;
    let parsed = origin
        .as_deref()
        .and_then(bw_engine::workspace::parse_git_remote_url);

    if selected.path.is_empty() {
        return Ok(match (origin.as_deref(), parsed) {
            (None, _) => (RemoteRef::default(), None),
            (Some(_), Some((host, path))) => match inferred_remote(&host, &path) {
                Some(remote) => (remote, None),
                None => (
                    RemoteRef::default(),
                    Some(format!(
                        "本地仓 origin 是 {host}/{path},但 Workbench 认不出这是 GitHub 还是 CodeHub;按纯本地项目接入,不会把 issue 发到远端"
                    )),
                ),
            },
            (Some(raw), None) => (
                RemoteRef::default(),
                Some(format!(
                    "本地仓 origin 解析不了:{raw};按纯本地项目接入,不会把 issue 发到远端"
                )),
            ),
        });
    }

    let Some((actual_host, actual_path)) = parsed else {
        return Err(AppError::Refused(format!(
            "选择了远端 {}/{},但本地仓没有可识别的 origin;为避免改错仓,没有继续",
            selected.host, selected.path
        )));
    };
    let same_host = if selected.provider == "github" {
        actual_host.eq_ignore_ascii_case("github.com")
    } else {
        codehub_host_matches(&selected.host, &actual_host)
    };
    let same_path = if selected.provider == "github" {
        actual_path.eq_ignore_ascii_case(&selected.path)
    } else {
        actual_path == selected.path
    };
    if !same_host || !same_path {
        return Err(AppError::Refused(format!(
            "所选远端是 {}/{},但本地仓 origin 是 {actual_host}/{actual_path};为避免 issue 与代码落到两个仓,没有继续",
            selected.host, selected.path
        )));
    }
    Ok((selected, None))
}

fn normalized_remote_path(path: &str) -> String {
    let path = path.trim().trim_end_matches('/');
    if path.to_ascii_lowercase().ends_with(".git") {
        path[..path.len() - 4].to_string()
    } else {
        path.to_string()
    }
}

fn inferred_remote(host: &str, path: &str) -> Option<RemoteRef> {
    if host.eq_ignore_ascii_case("github.com") {
        return Some(RemoteRef {
            provider: "github".into(),
            host: "github.com".into(),
            path: path.to_string(),
        });
    }
    let alias = codehub_alias_for_host(host)?;
    Some(RemoteRef {
        provider: "codehub".into(),
        host: alias.into(),
        path: path.to_string(),
    })
}

fn codehub_host_matches(alias: &str, actual: &str) -> bool {
    match codehub_alias_for_host(actual) {
        Some(zone) => zone == alias.trim(),
        None => actual.eq_ignore_ascii_case(alias.trim()),
    }
}

fn fill_if_blank(slot: &mut String, value: &str) {
    if slot.trim().is_empty() {
        *slot = value.to_string();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        codehub_host_matches, inferred_remote, normalized_remote_path, same_workspace_path,
    };
    use crate::model::{codehub_alias_for_host, codehub_alias_to_domain, codehub_aliases};

    #[test]
    fn infers_github_and_codehub_from_real_clone_hosts() {
        let github = inferred_remote("github.com", "openai/codex").unwrap();
        assert_eq!(github.provider, "github");
        assert_eq!(github.host, "github.com");
        assert_eq!(github.path, "openai/codex");

        let open = inferred_remote("szv-open.codehub.huawei.com", "team/repo").unwrap();
        assert_eq!(open.provider, "codehub");
        assert_eq!(open.host, "open");
        assert_eq!(open.path, "team/repo");

        let green = inferred_remote("codehub-dg-g.huawei.com", "team/repo").unwrap();
        assert_eq!(green.host, "green");
    }

    #[test]
    fn selected_codehub_zone_matches_its_api_and_ssh_hosts() {
        assert!(codehub_host_matches("open", "open.codehub.huawei.com"));
        assert!(codehub_host_matches("open", "szv-open.codehub.huawei.com"));
        assert!(codehub_host_matches("green", "codehub-g.huawei.com"));
        assert!(!codehub_host_matches(
            "yellow",
            "szv-open.codehub.huawei.com"
        ));
    }

    #[test]
    fn every_codehub_alias_round_trips_through_the_single_domain_table() {
        for alias in codehub_aliases() {
            assert_eq!(
                codehub_alias_for_host(codehub_alias_to_domain(alias)),
                Some(alias)
            );
        }
        assert_eq!(
            codehub_alias_for_host("codehub-dg-g.huawei.com"),
            Some("green")
        );
        assert_eq!(codehub_alias_for_host("gitlab.example.com"), None);
        assert_eq!(codehub_alias_for_host("rnd-gitlab-ca-g.huawei.com"), None);
        assert_eq!(codehub_alias_for_host("anything-config.huawei.com"), None);
    }

    #[test]
    fn selected_remote_path_drops_git_suffix_before_compare_and_storage() {
        assert_eq!(
            normalized_remote_path(" forcegravity1989/builder-workbench.git/ "),
            "forcegravity1989/builder-workbench"
        );
        assert_eq!(normalized_remote_path("team/repo.GIT"), "team/repo");
    }

    #[test]
    fn two_missing_workspace_paths_are_equal_only_when_the_paths_match() {
        let root = std::env::temp_dir().join(format!("bw-missing-paths-{}", uuid::Uuid::new_v4()));
        assert!(same_workspace_path(&root.join("same"), &root.join("same")));
        assert!(!same_workspace_path(&root.join("old"), &root.join("new")));
    }
}
