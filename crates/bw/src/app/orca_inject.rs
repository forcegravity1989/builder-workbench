use super::{bootstrap, App};
use std::path::Path;

pub const AUTO_WEEK_PLAN: &str = "定版本计划（Workbench）";
pub const AUTO_OPS_AUDIT: &str = "资产盘点（Workbench）";
pub const AUTO_COLLECT_B: &str = "每日指标采集（Workbench）";

const TZ: &str = "Asia/Shanghai";
const RRULE_WEEK_PLAN: &str = "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0";
const RRULE_OPS_AUDIT: &str = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=15;BYMINUTE=0";
const RRULE_COLLECT_B: &str = "FREQ=DAILY;BYHOUR=20;BYMINUTE=0";

struct Spec {
    name: &'static str,
    rrule: &'static str,
    reuse_session: bool,
    workspace: Result<std::path::PathBuf, String>,
    prompt: Result<String, String>,
}

impl App {
    /// `ensure_repo` 成功后逐项补齐默认自动化；单项失败不阻断其他任务。
    /// 汇总失败交给调用方，只有全部成功才缓存，处理原因后下次打开可重试。
    pub async fn ensure_orca_automations(
        &self,
        rt: &bw_engine::orca::OrcaRuntime,
        ws: &Path,
    ) -> Result<(), String> {
        let week_plan = bw_engine::workspace::provision_week_plan_worktree(ws)
            .await
            .map_err(|e| format!("开不出定版本计划树:{e}"));
        let ops_audit = bw_engine::workspace::provision_ops_audit_worktree(ws)
            .await
            .map_err(|e| format!("开不出资产盘点树:{e}"));
        let ledger = bw_engine::workspace::provision_ledger_worktree(ws)
            .await
            .map_err(|e| format!("开不出账本树:{e}"));
        let _ = bw_engine::orca::refresh_worktrees(rt, ws).await;

        let skills = self
            .ensure_skill_assets()
            .ok_or_else(|| "技能没摊到本机资产目录".to_string())?;
        let refs = self.ensure_prompt_assets();
        self.ensure_vendor_assets();

        let specs = [
            Spec {
                name: AUTO_WEEK_PLAN,
                rrule: RRULE_WEEK_PLAN,
                reuse_session: false,
                workspace: week_plan.clone(),
                prompt: week_plan
                    .as_ref()
                    .map_err(Clone::clone)
                    .and_then(|path| planning_prompt(ws, path, &skills, refs.as_deref())),
            },
            Spec {
                name: AUTO_OPS_AUDIT,
                rrule: RRULE_OPS_AUDIT,
                reuse_session: false,
                workspace: ops_audit,
                prompt: ops_prompt(
                    "资产盘点",
                    bw_engine::workspace::OPS_AUDIT_BRANCH,
                    super::OPS2_WORKFLOW,
                    &skills,
                    refs.as_deref(),
                    "说明写 mode: weekly。有开着的「资产盘点」本周这张就接着做,不要另建一张。",
                ),
            },
            Spec {
                name: AUTO_COLLECT_B,
                rrule: RRULE_COLLECT_B,
                reuse_session: true,
                workspace: ledger.clone(),
                prompt: ledger.map(|path| collect_prompt(ws, &path)),
            },
        ];

        let repo_id = bw_engine::orca::repo_id(rt, ws)
            .await
            .map_err(|e| e.to_string())?;
        let existing = bw_engine::orca::list_automations(rt)
            .await
            .map_err(|e| e.to_string())?;

        let mut failures = Vec::new();
        for spec in specs {
            let prepared = spec
                .workspace
                .and_then(|workspace| spec.prompt.map(|prompt| (workspace, prompt)));
            let (workspace, prompt) = match prepared {
                Ok(prepared) => prepared,
                Err(e) => {
                    failures.push(format!("{}：{e}", spec.name));
                    continue;
                }
            };
            if let Some(current) = existing
                .iter()
                .find(|a| a.name == spec.name && a.project_id == repo_id)
            {
                if spec.name == AUTO_WEEK_PLAN {
                    if let Err(e) = bw_engine::orca::update_planning_automation(
                        rt,
                        &current.id,
                        &prompt,
                        &workspace,
                    )
                    .await
                    {
                        failures.push(format!("{}：{e}", spec.name));
                    }
                }
                continue;
            }
            if let Err(e) = bw_engine::orca::create_automation(
                rt,
                &bw_engine::orca::AutomationCreate {
                    name: spec.name,
                    prompt: &prompt,
                    repo: ws,
                    workspace: &workspace,
                    reuse_session: spec.reuse_session,
                    rrule: spec.rrule,
                    timezone: TZ,
                    enabled: false,
                },
            )
            .await
            {
                failures.push(format!("{}：{e}", spec.name));
                continue;
            }
            bw_engine::dlog!(ok, "orca", "automation injected name={}", spec.name);
        }
        if failures.is_empty() {
            Ok(())
        } else {
            Err(failures.join("；"))
        }
    }
}

fn planning_prompt(
    main: &Path,
    workspace: &Path,
    skills: &Path,
    refs: Option<&Path>,
) -> Result<String, String> {
    let mut prompt = ops_prompt("版本计划", bw_engine::workspace::WEEK_PLAN_BRANCH,
        super::OPS1_WORKFLOW, skills, refs,
        "使用周一屏核对结果、拟定目标、会议评审、拆任务并提交计划 PR。已有计划就恢复，不退出；允许持续保存草稿，保存不是人确认。目标和总结只写版本 JSON，不再双写目标评论。")?;
    prompt.push_str(&format!(
        "\n项目主工作目录：`{}`。本次规划工作目录：`{}`，预期分支 `bw/week-plan`。\n\
         所有命令显式指向规划工作目录；宿主默认 cwd 不同也直接使用上述路径。先检查已有 `.bw/planning/*/data.json`；恢复未完成版本，版号不明确时问 Builder，无数据时初始化 default，不预填当前版目标。\n\
         运行 Skill 的 `scripts/planning.py --workspace <上述规划目录> --version <恢复的版本> start`，在本会话浏览器打开它返回的完整 URL。服务由 Skill 管理，不要求浏览器授权文件。\n\
         历史目标先读上版已确认 JSON 的 plan.goals，首次缺历史才查旧计划 Issue 评论。先核对第一项事实，逐屏和 Builder 共建。\n",
        main.display(), workspace.display()));
    Ok(prompt)
}

fn ops_prompt(
    role: &str,
    branch: &str,
    workflow: &str,
    skills_dir: &Path,
    refs_dir: Option<&Path>,
    extra: &str,
) -> Result<String, String> {
    let skill = bootstrap::skill_pointer(skills_dir, workflow)
        .ok_or_else(|| format!("摊好的技能里没有 {workflow}"))?;
    let refs = refs_dir
        .map(|d| refs_for_workflow(workflow, d))
        .unwrap_or_default();
    let mut s = format!(
        "你是 Workbench 的{role}。工作目录已经是常驻树,分支 `{branch}`。\
         仓文件只改这里,有真改动再开 MR。不要写主检出。不要把此 Issue 标为完成。\n\n{extra}\n\n\
         剧本是 `{}`:{}\n开工前读:`{}`。它自己会说要不要再读别的。\n",
        skill.name, skill.desc, skill.path
    );
    if !refs.is_empty() {
        s.push_str("\n还要读这几份规范(正文自己按需读):\n");
        for r in refs {
            s.push_str(&format!("- `{}` —— {}\n", r.path, r.desc));
        }
    }
    s.push_str(
        "\n版本、在研、本周进展到跑的时候现读远端和仓,不要用注入时的旧数。\
         建不建 issue 听剧本;标题幂等,有开着的同名就接着用。\n",
    );
    Ok(s)
}

fn refs_for_workflow(workflow: &str, refs_dir: &Path) -> Vec<bootstrap::ReferencePointer> {
    let issue = crate::model::Issue {
        id: crate::model::IssueId::nil(),
        project_id: crate::model::ProjectId::nil(),
        number: 0,
        remote_number: 0,
        title: String::new(),
        body: String::new(),
        status: crate::model::IssueStatus::Todo,
        branch: String::new(),
        pr_number: 0,
        has_open_mr: false,
        week_of: String::new(),
        version: String::new(),
        tool: String::new(),
        kind: crate::model::IssueKind::Ops,
        origin: crate::model::IssueOrigin::Auto,
        workflow: workflow.into(),
        category: None,
        sort_order: 0.0,
        metric_key: String::new(),
        created_at: 0,
        updated_at: 0,
        settled_at: None,
        assignee: String::new(),
        author: String::new(),
        plan_versions: Vec::new(),
    };
    bootstrap::references_for(&issue, refs_dir)
}

fn collect_prompt(main: &Path, ledger: &Path) -> String {
    format!(
        "只采 B 类指标(不可回溯、当下值)。读主仓的 `.bw/metrics.toml` 和脚本,主仓在:\n`{}`\n\
         只往本树 `.bw/metrics/readings.jsonl` 写今天一行(当天覆盖)。本树是:\n`{}`\n\
         失败不写 0,旧行留着。写完提交到本分支 `bw/ledger`,不要开 MR,不要建 issue,不要改别的文件。\n",
        main.display(),
        ledger.display()
    )
}
