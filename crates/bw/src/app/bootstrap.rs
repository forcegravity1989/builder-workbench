//! 第一次接入:建「项目约定」,只写 `.bw/project.toml`(外加 `.bw/.gitignore`
//! 忽略 `worktrees/`),落在常驻分支 `bw/project` 上,开 MR 等人合。
//!
//! **不铺 issue-policy,不写主检出。** 开工工具跟人走本机 settings;周五盘点
//! 是产品默认。仓根一个字不写。探测到了什么如实写进这张活的正文。
//!
//! 不是 git 仓 / 还没有 HEAD:就地写(空仓首提交那条例外)。

use super::worktree;
use super::{issue_store, App, AppError, ProgressLine, Result};
use crate::command::Event;
use crate::model::{Issue, IssueStatus, ProjectId};
use crate::repo::project_file::{self, ProjectFile};
use crate::standard;
use crate::standard::bootstrap::{self as boot};

impl App {
    /// 只在第一次纳入时跑。默认分支已有名片、或已经开着项目约定类活,整段跳过。
    pub(super) async fn run_standard_bootstrap(
        &mut self,
        project_id: ProjectId,
        seed: &ProjectFile,
    ) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        if crate::git::path_in_head(&ws, project_file::REL_PATH).await {
            self.step(ProgressLine::ok(
                5,
                "项目约定:默认分支已有名片,这次不建活也不开 MR",
            ));
            return Ok(vec![]);
        }
        let project = self
            .project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))?;
        if issue_store::find_open_charter(self, &project)
            .await?
            .is_some()
        {
            self.step(ProgressLine::ok(
                5,
                "项目约定:已有开着的约定/残留铺底/残留改名片,不重复建。合入之前总览会提示",
            ));
            return Ok(vec![]);
        }

        let probe = boot::probe(&ws).await;
        let body = format!(
            "第一次接入:写 `.bw/project.toml`(项目名片)。探测结果:{}。\n\n\
             还没跑的步骤如实列在这里,不假装做过:{}",
            probe.reasons.join("、"),
            pending_steps(&probe)
        );

        self.step(ProgressLine::doing(5, "项目约定:建活、开常驻树…"));
        let created = self
            .create_issue(
                project_id,
                issue_store::CHARTER_TITLE.to_string(),
                body.clone(),
                None,
                crate::model::IssueKind::Light,
                crate::model::IssueOrigin::Human,
                String::new(),
                String::new(),
            )
            .await?;
        let issue_id = created
            .iter()
            .find_map(|e| match e {
                Event::IssueCreated { id, .. } => Some(*id),
                _ => None,
            })
            .ok_or_else(|| AppError::Refused("项目约定没建出来".into()))?;

        let issue = self.issue_or_err(issue_id).await?;
        let tree = worktree::provision_project(&ws).await?;
        self.step(ProgressLine::doing(5, "项目约定:往常驻树里写名片…"));
        project_file::write(&tree.path, seed)?;
        let mut written = vec![project_file::REL_PATH.to_string()];
        if ensure_bw_gitignore(&tree.path) {
            written.push(".bw/.gitignore".into());
        }

        let outcome = crate::git::commit_paths(&tree.path, &written, "docs(bw): 项目约定 · 名片")
            .await
            .unwrap_or_default();
        let committed = outcome.committed;

        self.step(ProgressLine::doing(5, "项目约定:提交、推分支、开 MR…"));
        let mr = worktree::push_and_open_mr(
            &project,
            &tree,
            committed,
            issue_store::CHARTER_TITLE,
            concat!(
                "第一次接入写下的项目名片。合入之后这个仓就被管过了。\n\n",
                "这些件全是 Workbench 自己写的,没有起 agent。开工工具跟人走本机,不进仓。"
            ),
        )
        .await;

        let mut b = body;
        b.push_str(&format!(
            "\n\n干活的地方:`{}`\n分支:`{}`",
            tree.path.display(),
            tree.branch
        ));
        if !tree.isolated {
            b.push_str("\n(这个工作区不是 git 仓,或还没有第一条提交,是就地写的)");
        }
        b.push_str(&format!("\n\n写了: {}\nMR:{}", written.join("、"), mr.note));
        b.push_str("\n\n合入之前名片只在这条分支上。开工工具跟人走本机,不进仓。");
        let project = self
            .project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))?;
        issue_store::comment(self, &project, issue_id.iid(), &b).await?;

        self.step(if committed {
            ProgressLine::ok(
                5,
                format!(
                    "项目约定:写了 {} 个件,提交在分支 {} 上 · MR:{}",
                    written.len(),
                    tree.branch,
                    mr.note
                ),
            )
        } else {
            ProgressLine::ok(
                5,
                format!(
                    "项目约定:写了 {} 个件到 {},但没提交(不是 git 仓或者提交被拒)· MR:{}",
                    written.len(),
                    tree.path.display(),
                    mr.note
                ),
            )
        });

        let mut events = created;
        events.push(Event::StandardBootstrapped {
            project_id,
            issue_id,
            files: written,
            committed,
        });
        if mr.number > 0 && issue.status.can_transition_to(IssueStatus::InProgress) {
            events.extend(
                self.transition_issue(issue_id, IssueStatus::InProgress)
                    .await?,
            );
            events.extend(
                self.transition_issue(issue_id, IssueStatus::InReview)
                    .await?,
            );
        }
        Ok(events)
    }

    /// 纯读的对账:该有的件在不在。不建活、不写仓。
    pub(super) async fn reconcile_standard(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let mut missing = Vec::new();
        if !ws.join(project_file::REL_PATH).is_file() {
            missing.push(project_file::REL_PATH.to_string());
        }
        Ok(vec![Event::StandardReconciled {
            project_id,
            missing,
            stale: Vec::new(),
            human_edited: Vec::new(),
        }])
    }
}

/// 常驻树上补 `.bw/.gitignore` 里的 `worktrees/`,不写主检出。已有这一行就不动。
fn ensure_bw_gitignore(tree: &std::path::Path) -> bool {
    let path = tree.join(".bw").join(".gitignore");
    let line = "worktrees/";
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    if existing.lines().any(|l| l.trim() == line) {
        return false;
    }
    let mut text = existing;
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(line);
    text.push('\n');
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, text).is_ok()
}

fn pending_steps(probe: &boot::BootstrapProbe) -> String {
    let mut v = Vec::new();
    if probe.has_history {
        v.push("这个仓接入前已有历史;未分配的活由人排进 v0.x,不自动打标");
    }
    if probe.has_own_conventions {
        v.push("仓根已有 README / AGENTS.md / CLAUDE.md,接项目时一个字没动");
    }
    if v.is_empty() {
        "无 —— 这个仓没有历史,写核心件就是全部".into()
    } else {
        v.join(";")
    }
}

/// ▶开工 时注入给 agent 的系统提示词。**渐进式加载**:提示词里只放索引,
/// 正文让 agent 自己按需读。
///
/// 主提示词是外置的 `standard/system-prompt/SYSTEM.md.tmpl`(身份 + 四铁律 +
/// 读项目规范件的指引),`{{...}}` 占位在这里渲染:活的信息、本活要读的
/// references 阶段规范、本活挂的技能。**正文一律不塞进提示词** —— references
/// 和技能都只给「一句话 + 完整路径」,agent 按需自己读,和主提示词同一套规矩。
///
/// 不硬编码在 `format!` 里:改身份/铁律 = 改那份 md(以前塞在 `base_prompt`
/// 的 `format!` 里,改=改代码,人审得读 Rust)。
pub fn agent_system_prompt(
    issue: &Issue,
    skill: Option<&SkillPointer>,
    references: &[ReferencePointer],
    version_context: &str,
) -> String {
    let number = issue.number.to_string();
    let category = issue.category.map(|c| c.label()).unwrap_or("—(没定类别)");
    let workflow = if issue.workflow.is_empty() {
        "—(没挂 workflow)"
    } else {
        issue.workflow.as_str()
    };
    let refs = references_block(references);
    let skill_str = skill_block(skill);
    standard::render(
        standard::system_prompt::SYSTEM_PROMPT_TMPL,
        &[
            ("number", number.as_str()),
            ("title", issue.title.as_str()),
            ("category", category),
            ("workflow", workflow),
            ("references", refs.as_str()),
            ("skill", skill_str.as_str()),
            ("version_context", version_context),
        ],
    )
}

/// 指给 agent 的一份阶段规范:名字、一句话、**完整路径**。正文不在这里。
pub struct ReferencePointer {
    pub name: String,
    pub desc: String,
    pub path: String,
}

/// 这张活要读哪几份阶段规范 references。按活的类别/workflow 匹配,只返**硬盘
/// 上真存在**的那几份(文件不在就如实不指,不编路径)。
///
/// 已派发:`metrics` / `week-plan-comment`(运作活①)、`build`(改仓类 + 运作活②)、
/// `bw-assets`(运作活②)。其余按实践长。对照表在 architecture 模块 4。
pub fn references_for(issue: &Issue, refs_dir: &std::path::Path) -> Vec<ReferencePointer> {
    let mut out = vec![];
    for pack in standard::system_prompt::references() {
        if want_ref(issue, pack.slug) {
            let path = refs_dir.join(&pack.rel);
            if path.is_file() {
                out.push(ReferencePointer {
                    name: pack.slug.to_string(),
                    desc: pack.desc.to_string(),
                    path: path.display().to_string(),
                });
            }
        }
    }
    out
}

/// 这份 reference 要不要给这张活。
fn want_ref(issue: &Issue, slug: &str) -> bool {
    let ops2 = issue.workflow == super::ops::OPS2_WORKFLOW;
    match slug {
        // 指标活:更新指标与周计划。② 升格式时 skill 会再指过去,这里不预注入。
        "metrics" | "week-plan-comment" => issue.workflow == super::ops::OPS1_WORKFLOW,
        // 改仓类活:构建 / 优化 / 运维;运作活②改 `.bw` 也是改仓。
        "build" => {
            ops2 || matches!(
                issue.category,
                Some(
                    crate::model::StageKind::Build
                        | crate::model::StageKind::Optimize
                        | crate::model::StageKind::Ops
                )
            )
        }
        "bw-assets" => ops2,
        _ => false,
    }
}

fn references_block(references: &[ReferencePointer]) -> String {
    if references.is_empty() {
        return String::new();
    }
    let mut s = String::from(
        "\n\n干这件活,开工前还要读这几份 Workbench 规范(正文自己按需读,路径在 Workbench 资产目录):\n",
    );
    for r in references {
        s.push_str(&format!("- `{}` —— {}\n", r.path, r.desc));
    }
    s
}

fn skill_block(skill: Option<&SkillPointer>) -> String {
    match skill {
        Some(s) => format!(
            "\n\n这件活挂的剧本是 `{}`:{}\n开工前读它:`{}`。它自己会说要不要再读别的,\
             照它说的读,别把整个技能库翻一遍。\n",
            s.name, s.desc, s.path
        ),
        None => String::new(),
    }
}

/// 指给 agent 的一份技能:名字、一句话、**完整路径**。正文不在这里。
pub struct SkillPointer {
    pub name: String,
    pub desc: String,
    pub path: String,
}

/// 这张活挂的那一份技能在哪。文件不在硬盘上就返回 `None`,调用方如实少一段。
///
/// 找的是 **Workbench 自己的技能目录**(`App::skills_dir`),不是用户的仓 ——
/// 用户仓里从来就不该有 Workbench 的技能副本。
pub fn skill_pointer(skills_dir: &std::path::Path, workflow: &str) -> Option<SkillPointer> {
    let slug = super::ops::skill_slug(workflow)?;
    let pack = standard::skills::all()
        .into_iter()
        .find(|p| p.slug == slug)?;
    let path = skills_dir.join(&pack.rel);
    if !path.is_file() {
        return None;
    }
    Some(SkillPointer {
        name: pack.slug.to_string(),
        desc: pack.desc.to_string(),
        path: path.display().to_string(),
    })
}

/// 把 Workbench 的技能目录加进 CLI 的可读目录 —— 它在 agent 的工作目录外面。
///
/// 提示词里给的是绝对路径,不加这一句,CLI 那边读不读得到取决于它当天的权限
/// 策略;显式声明一句,别赌。
pub(crate) fn allow_skills_dir(plan: &mut bw_engine::LaunchPlan, dir: &std::path::Path) {
    plan.args.push("--add-dir".to_string());
    plan.args.push(dir.display().to_string());
}

#[cfg(test)]
mod want_ref_tests {
    use super::want_ref;
    use crate::model::{Issue, IssueId, IssueKind, IssueOrigin, IssueStatus, ProjectId, StageKind};

    fn issue(workflow: &str, category: Option<StageKind>) -> Issue {
        Issue {
            id: IssueId::nil(),
            project_id: ProjectId::nil(),
            number: 0,
            remote_number: 0,
            title: String::new(),
            body: String::new(),
            status: IssueStatus::Todo,
            branch: String::new(),
            pr_number: 0,
            has_open_mr: false,
            week_of: String::new(),
            version: String::new(),
            tool: String::new(),
            kind: IssueKind::Ops,
            origin: IssueOrigin::Auto,
            workflow: workflow.into(),
            category,
            sort_order: 0.0,
            metric_key: String::new(),
            created_at: 0,
            updated_at: 0,
            settled_at: None,
            assignee: String::new(),
            author: String::new(),
            plan_version: String::new(),
        }
    }

    #[test]
    fn ops2_gets_bw_assets_and_build() {
        let i = issue(crate::app::OPS2_WORKFLOW, None);
        assert!(want_ref(&i, "bw-assets"));
        assert!(want_ref(&i, "build"));
        assert!(!want_ref(&i, "metrics"));
        assert!(!want_ref(&i, "week-plan-comment"));
    }

    #[test]
    fn ops1_gets_metrics_not_bw_assets() {
        let i = issue(crate::app::OPS1_WORKFLOW, None);
        assert!(want_ref(&i, "metrics"));
        assert!(want_ref(&i, "week-plan-comment"));
        assert!(!want_ref(&i, "bw-assets"));
        assert!(!want_ref(&i, "build"));
    }

    #[test]
    fn build_category_gets_build_ref() {
        let i = issue("", Some(StageKind::Build));
        assert!(want_ref(&i, "build"));
        assert!(!want_ref(&i, "bw-assets"));
    }
}
