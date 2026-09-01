//! 规范铺底(运作活③)与规范对账。
//!
//! 只做**第 1 步**:Workbench 自己把核心件写进项目仓、记指纹,在**这张活自己的
//! worktree 和分支上**提交,推上去,开一个 MR 等人合。
//!
//! **就这一步,没有第二步。** 仓根一个字不写 —— `AGENTS.md` / `CLAUDE.md` 是
//! 项目自己的文件,给它们写内容等于「建议改造人家的项目」,那要先读懂这个仓、
//! 先问过人,归资产盘点(运作活②)首次模式的子技能 `project-handbook`。
//! 老仓历史要出现在计划屏:给已有 issue 打周标签,需要周目标再补运作活①。
//! 探测到了什么如实写进这张活的正文,没跑就是没跑。
//!
//! **技能不往用户仓里复制**(2026-08-20 改):Workbench 自带那四份摊在自己的资产
//! 目录,开工时只把名字、一句话和完整路径写进系统提示词,正文让 agent 按需读。
//!
//! **不在主检出上动手**。写文件、提交、开分支全在
//! [`worktree`](super::worktree) 供给的那棵树里发生,人自己的工作目录一个字节
//! 都不会被碰;两张活同时在跑也不会撞在一起。

use super::worktree;
use super::{issue_store, App, AppError, ProgressLine, Result};
use crate::command::Event;
use crate::model::{Issue, IssueOrigin, IssueStatus, ProjectId};
use crate::repo::managed_file::{self, Reconcile};
use crate::repo::project_file;
use crate::standard;
use crate::standard::bootstrap::{self as boot, BootstrapVars};

impl App {
    /// 接入自动跑。`all` 今天没有分别,配置屏不再二次铺底。
    pub(super) async fn run_standard_bootstrap(
        &mut self,
        project_id: ProjectId,
        all: bool,
    ) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let project = self
            .project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))?;
        let file = project_file::read(&ws)?.unwrap_or_default();

        let probe = boot::probe(&ws).await;
        // 幂等键是标题,所以标题**只能是「规范铺底 v<版本>」**,不能随探测结果
        // 变。之前把探测结果拼进标题,而第一次铺底自己写了几份件、
        // 提交之后第二次探测结论就变了 —— 标题跟着变,幂等失效,重跑多建一张
        // 活。探测到了什么写进正文,不写进标题。
        let title = boot::issue_title();
        let body = format!(
            "探测结果:{}。\n\n本次要跑的步骤:{}\
             \n\n本次执行:写核心件(Workbench 自己写,不起 agent)。\
             \n\n还没跑的步骤如实列在这里,不假装做过:{}",
            probe.reasons.join("、"),
            boot::planned_steps(&probe),
            pending_steps(&probe)
        );

        self.step(ProgressLine::doing(
            5,
            "规范铺底:建活、开一棵这张活自己的树…",
        ));
        let (issue_id, _, _) = self
            .create_ops_issue(
                project_id,
                title,
                body.clone(),
                super::OPS3_WORKFLOW,
                IssueOrigin::Auto,
                String::new(),
            )
            .await?;

        let remote = if project.has_remote() {
            format!("{} · `{}`", project.provider, project.remote_path)
        } else {
            "—(还没挂远端)".to_string()
        };
        // 名片四格可能是空的(接入时人没填)。渲染进模板时补一句「(还没填)」——
        // 留空的话文件里就是一节空标题,看不出是没填还是漏渲染了。
        let or_blank = |v: &str| {
            if v.trim().is_empty() {
                "(还没填)".to_string()
            } else {
                v.trim().to_string()
            }
        };
        let vars = BootstrapVars {
            name: file.name.clone(),
            brief: or_blank(&file.brief),
            benchmark: or_blank(&file.benchmark),
            north_star: or_blank(&file.opportunity),
            remote,
            owner: "—(单人项目,Builder 本人)".into(),
            current_version: if file.current_version.is_empty() {
                "v0.1".into()
            } else {
                file.current_version.clone()
            },
            chat: super::project::chat_label(&file.chat),
            // 这两节从**主检出**探 —— 那才是这个仓完整的样子;活自己的 worktree
            // 这会儿还没建出来,而且就算建了内容也一样。
        };
        // 这张活自己的一棵树、自己的一个分支。人的主检出不动。
        let issue = self.issue_or_err(issue_id).await?;
        let tree = worktree::provision(&ws, issue.number).await?;
        self.step(ProgressLine::doing(5, "规范铺底:往那棵树里写规范骨架…"));
        let mut report = boot::write_core_files(&tree.path, &vars, all)?;

        // **名片也得进这个 MR。** 接入那一步把 `.bw/project.toml` 写在人的主
        // 检出里(得先有它,PROJECT.md 才渲染得出项目名),但铺底是在**这张活
        // 自己的树**上提交的 —— 不把它复制过来,人的工作目录里就永远挂着一份
        // 没提交的 `.bw/`,而仓里到今天都没有名片。「仓是正本、换台机器拉下来
        // 就有」这句话就是从这里开始不成立的。
        //
        // 树没隔出来的时候(不是 git 仓、或者空仓)`tree.path` 就是主检出,
        // 再写一遍是同一份内容;进 `written` 是为了让它被提交。
        project_file::write(&tree.path, &file)?;
        report.written.push(project_file::REL_PATH.to_string());
        // 接入写在主检出上的那份只是为了当场能渲染。正本走这张活的 MR,
        // 主检出上留下未提交的名片会挡「拉到最新」。
        if tree.isolated {
            let _ = super::plan::salvage_main_checkout_dirt(&ws).await;
        }

        // 只提交这次真写下去的那些件,不用 `add -A`:这棵树是干净的检出,但
        // 规矩就是规矩 —— 提交里出现的每一个文件都该是 Workbench 自己写的。
        let outcome = crate::git::commit_paths(
            &tree.path,
            &report.written,
            &format!("docs(bw): 规范铺底 v{} · 核心件", standard::version()),
        )
        .await
        .unwrap_or_default();
        let committed = outcome.committed;

        // 仓的 .gitignore 拒收的件属于本机检出,不属于分支 —— 放一份到主工作
        // 区,否则技能包只存在于这一张活的 worktree 里,下一张活开新树就读不到
        // 剧本了。已经有同名文件就不覆盖。
        let mirrored = if tree.isolated {
            worktree::mirror_ignored(&ws, &tree.path, &outcome.refused)
        } else {
            Vec::new()
        };

        // 推分支 + 开 MR。没挂远端、没隔出树、或者压根没提交出东西,就都不做
        // ——如实记下为什么没有 MR,不摆一个空号。
        self.step(ProgressLine::doing(5, "规范铺底:提交、推分支、开 MR…"));
        let mr = worktree::push_and_open_mr(
            &project,
            &tree,
            committed,
            &format!("规范铺底 v{} · 核心件", standard::version()),
            concat!(
                "Workbench 的「规范铺底」写下的核心件。合入之后这个项目就有管理体系的正本了。\n\n",
                "这些件全是 Workbench 自己写的,没有起 agent。"
            ),
        )
        .await;

        // 跳过的件如实写进这张活的说明,评审的人不用猜为什么少了一份。
        // 注意是**从头拼一遍再整体覆盖**,不是往现有正文后面追加 —— 建活是按
        // 标题幂等的,重跑会拿到同一张活,追加就会把「跳过的件」滚成两份。
        let mut b = body;
        b.push_str(&format!(
            "\n\n干活的地方:`{}`\n分支:`{}`",
            tree.path.display(),
            tree.branch
        ));
        if !tree.isolated {
            b.push_str("\n(这个工作区不是 git 仓,开不了 worktree,是就地写的)");
        }
        if !report.skipped.is_empty() {
            b.push_str("\n\n跳过的件:\n");
            for (path, why) in &report.skipped {
                b.push_str(&format!("- `{path}`:{why}\n"));
            }
        }
        // 仓里已经有、但不是 Workbench 铺的件。**必须显眼地说一声** —— 界面会把它们
        // 当正本读,而它们的来路 Workbench 一无所知。
        if !report.preexisting.is_empty() {
            b.push_str(
                "\n\n⚠️ 仓里本来就有这几份件,不是 Workbench 铺的,这次也没碰它们 —— \
                 但界面会把它们当正本读(指标卡、健康判据都从这里来)。\
                 请确认它们确实属于这个项目、格式也还作数;不作数就先删掉,\
                 走到那一站时 Workbench 会铺一份干净的:\n",
            );
            for path in &report.preexisting {
                b.push_str(&format!("- `{path}`\n"));
            }
        }
        if !outcome.refused.is_empty() {
            b.push_str(
                "\n\n写下去了但没进版本控制的件(这个仓的 .gitignore 忽略了它们,\
                 Workbench 不用 -f 顶回去 —— 那是项目自己的决定)。它们属于本机检出,\
                 不属于分支,合 MR 不会带上:\n",
            );
            // 一条路径只出现一次,后面跟它的下落 —— 三份互相重复的清单谁都不会看。
            for path in &outcome.refused {
                let disposition = match mirrored.iter().find(|(p, _)| p == path).map(|(_, m)| m) {
                    Some(worktree::Mirrored::Copied) => "已放进你的工作目录".to_string(),
                    Some(worktree::Mirrored::Kept) => {
                        "你的工作目录里已经有同名文件,没覆盖".to_string()
                    }
                    Some(worktree::Mirrored::Failed(why)) => {
                        format!("没能放进你的工作目录,原话:{why}")
                    }
                    None => "只在这张活的目录里".to_string(),
                };
                b.push_str(&format!("- `{path}` —— {disposition}\n"));
            }
        }
        b.push_str(&format!("\n\nMR:{}", mr.note));
        b.push_str(
            "\n\n合入之前这些件只在这条分支上,主检出里还没有 —— 所以在你合上它之前,\
             定时(节律)、类别→工具的映射、规范对账都还读不到它们。",
        );
        // 刀3:issue 正文在创建时就写了,这里把详细报告写进评论(结构化产出挂评论)。
        let project = self
            .project(project_id)
            .await?
            .ok_or_else(|| AppError::NoSuchProject(project_id.uuid().to_string()))?;
        issue_store::comment(self, &project, issue_id.iid(), &b).await?;
        // 没有本地 issue 表了,branch 和 pr_number 不再缓存。branch 由 issue 号决定
        // (bw/issue-<号>),MR 号在合入时由 open_mr_for_branch 现查。
        let _ = issue.pr_number;
        if committed && tree.isolated {
            drop_untracked_twin(&ws, &tree.path, project_file::REL_PATH).await;
        }

        self.step(if committed {
            ProgressLine::ok(
                5,
                format!(
                    "规范铺底:写了 {} 个规范件,提交在分支 {} 上 · MR:{}",
                    report.written.len(),
                    tree.branch,
                    mr.note
                ),
            )
        } else if report.written.is_empty() {
            // 一个件都没写下去 = 重跑,件本来就在。
            ProgressLine::ok(5, "规范铺底:件本来就都在,这次没写也没提交")
        } else {
            // **写下去了却没提交出来**。这不是「件都在了」—— 说成那样就是在
            // 骗人。多半是这个工作区压根不是 git 仓(接入时没填远端,只建了个
            // 空目录),件真在硬盘上,只是没进版本控制。
            ProgressLine::ok(
                5,
                format!(
                    "规范铺底:写了 {} 个规范件到 {},但没提交(这个工作区不是 git 仓或者提交被拒)· MR:{}",
                    report.written.len(),
                    tree.path.display(),
                    mr.note
                ),
            )
        });

        let mut events = vec![Event::StandardBootstrapped {
            project_id,
            issue_id,
            files: report.written,
            committed,
        }];
        // 真提交出东西了才推「评审中」—— 该人看一眼了。什么都没写下去的时候
        // 原地不动,不假装干过活。**最远只到评审中**,「完成」永远由人点。
        //
        // 判据用「MR 开着」(`mr.number > 0`)而不是「这次新提交了」(`committed`):
        // 重跑幂等恢复时,件上次已提交过、这次 `committed=0`,但 MR 开着(新建或
        // 复用上次的)——这种活也该在评审中,不该因为「这次没新提交」就卡在 todo。
        // `committed` 但 MR 没开成(推/开 MR 失败)的,不算「交出去评审」,不推。
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

    /// 纯读的对账:缺 / 过期 / 人改过。不建活、不写仓。
    pub(super) async fn reconcile_standard(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        let managed = managed_file::read(&ws)?.unwrap_or_default();
        let version = standard::version();

        let mut missing = Vec::new();
        let mut stale = Vec::new();
        let mut human_edited = Vec::new();

        // 只对账**铺进用户仓的规范件**。技能包不在这张表里 —— 它们住在
        // Workbench 自己的资产目录,不进用户的仓,自然也没有「人手改过没有」这
        // 个问题(见 `standard::skills`)。
        for t in standard::CORE_TEMPLATES {
            let target = t.target.to_string();
            let disk = std::fs::read(ws.join(&target)).ok();
            match managed_file::reconcile(managed.entry(&target), disk.as_deref(), version) {
                Reconcile::Missing => missing.push(target),
                Reconcile::Stale => stale.push(target),
                Reconcile::HumanEdited => human_edited.push(target),
                Reconcile::UpToDate => {}
            }
        }

        Ok(vec![Event::StandardReconciled {
            project_id,
            missing,
            stale,
            human_edited,
        }])
    }
}

/// 名片进了分支之后,**把主检出里那份没跟踪的同名文件删掉**。
///
/// 接入那一步为了让界面立刻有东西看,把名片写进了主检出;铺底又把同一份写进
/// 分支。两份内容一样,但主检出那份是**未跟踪**的 —— 等人合了 MR 再 `git pull`,
/// git 会一句 `untracked working tree files would be overwritten by merge` 顶回来,
/// 拉不动。这不是理论风险,是必然发生。
///
/// 三道闸:只在真提交了、只在文件确实没被 git 跟踪、只在两份内容逐字相同的时候
/// 删。人自己动过那份就留着 —— 那时候两边不一样,该让人自己看见冲突。
async fn drop_untracked_twin(main: &std::path::Path, tree: &std::path::Path, rel: &str) {
    let here = main.join(rel);
    let Ok(mine) = std::fs::read(&here) else {
        return;
    };
    match std::fs::read(tree.join(rel)) {
        Ok(theirs) if theirs == mine => {}
        _ => return,
    }
    if crate::git::is_tracked(main, rel).await {
        return;
    }
    let _ = std::fs::remove_file(&here);
}

fn pending_steps(probe: &boot::BootstrapProbe) -> String {
    let mut v = Vec::new();
    if probe.has_history {
        v.push("资产盘点首次模式:能对上已有 v0.x 的活打 bw:plan:v0.x(需要对版本目标再补一张运作活①,评论写明补记)");
    }
    if probe.has_own_conventions {
        v.push(
            "资产盘点首次模式:提议给这个项目写一份开发手册(仓根 `AGENTS.md`)\
             —— 那是在改你的项目,得先问过你才写,不在接项目这一步做",
        );
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
/// 不硬编码在 `format!` 里:改身份/铁律 = 改那份 md + 抬 `standard/VERSION`,
/// 规范对账测得出落后(以前塞在 `base_prompt` 的 `format!` 里,改=改代码,不可对账)。
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
/// 起手三份:`metrics`(指标活,workflow=更新指标与周计划)、`build`(改仓类活,
/// 类别=构建/优化/运维)、`week-plan-comment`(运作活①评论格式)。其余按实践长。
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
    match slug {
        // 指标活:更新指标与周计划
        "metrics" | "week-plan-comment" => issue.workflow == super::ops::OPS1_WORKFLOW,
        // 改仓类活:构建 / 优化 / 运维
        "build" => matches!(
            issue.category,
            Some(
                crate::model::StageKind::Build
                    | crate::model::StageKind::Optimize
                    | crate::model::StageKind::Ops
            )
        ),
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
