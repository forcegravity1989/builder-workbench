//! CodeHub remote — shell-out `codehub-cli`(Go CLI,GitLab v4 同构封装,默认
//! JSON 输出,token 存 OS keyring)。与 [`crate::github`] 对称:无状态自由
//! 函数 + `tokio::process` shell-out,**零 HTTP 依赖**。token 不管(keyring
//! 里 `auth login` 存好),`host`/`path` 按 project 的 `(remote_host,
//! remote_path)` 显式带 `-H`/`-p`——绿/黄/内源三 host 同名 path 也不会混,
//! 因为每次调用都带显式 host,不存在「猜 host」的歧义分支,也没有对应的
//! 错误类型(`CodehubError` 只认 NotInstalled/Command/Parse)。
//!
//! 不进 `Executor` 体系——`codehub-cli` 是 VCS 远端 API 客户端(对标 `gh`),
//! 不是 agent 执行器(对标 `claude`)。两种 shell-out 模式别混。

use crate::win_cmd::stderr_text;
use std::path::Path;
use std::process::Stdio;

#[derive(Debug, thiserror::Error)]
pub enum CodehubError {
    #[error("codehub-cli 未安装或不在 PATH")]
    NotInstalled,
    #[error("codehub-cli 失败:{0}")]
    Command(String),
    #[error("解析 codehub-cli 输出失败:{0}")]
    Parse(String),
}

/// One row of `codehub-cli project list --mine` — the parity of
/// [`crate::github::GithubRepoSummary`] for the「接入已有仓」picker. `path`
/// = `path_with_namespace`; `pushed_at` is populated from codehub's
/// `last_activity_at` field (codehub has no `pushedAt`; same semantic —
/// the repo's last real activity timestamp).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CodehubRepoSummary {
    pub path: String,
    pub visibility: String,
    pub default_branch: String,
    pub pushed_at: String,
    pub description: String,
}

fn spawn_err(e: std::io::Error) -> CodehubError {
    if e.kind() == std::io::ErrorKind::NotFound {
        CodehubError::NotInstalled
    } else {
        CodehubError::Command(e.to_string())
    }
}

/// `codehub-cli project view -p <path> -H <host>` → 一行人话详情
/// (`path · 可见性[ · 已归档] · 最近活跃`)。Read-only,零仓副作用。
pub async fn probe(host: &str, path: &str) -> Result<String, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(["project", "view", "-p", path, "-H", host])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project view JSON:{e}")))?;
    let pns = v["path_with_namespace"].as_str().unwrap_or(path);
    let vis = v["visibility"].as_str().unwrap_or("未知");
    let archived = v["archived"].as_bool().unwrap_or(false);
    let last = v["last_activity_at"].as_str().unwrap_or("未知");
    let arch = if archived { " · 已归档" } else { "" };
    Ok(format!("{pns} · {vis}{arch} · 最近活跃 {last}"))
}

/// `codehub-cli project view` 的默认分支。绿区建 Release 强制要 `--ref`,
/// 不传就 HTTP 422 `CH.00404131`。空则 `master`(内部仓常见,跟
/// [`create_mr_on_branch`] 同口径)。
async fn project_default_branch(host: &str, path: &str) -> Result<String, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(["project", "view", "-p", path, "-H", host])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project view JSON:{e}")))?;
    let b = v["default_branch"].as_str().unwrap_or("").trim();
    if b.is_empty() {
        Ok("master".to_string())
    } else {
        Ok(b.to_string())
    }
}

/// 在**已经推上去的分支**上开一个 MR —— `codehub-cli mr create` 就这一处实现。
///
/// 调用方各自准备分支的方式不同([`create_mr`] 走 `stage_commit_push`、
/// [`create_project_init_mr`] 先 checkout 再提交、V4 的规范铺底自己在 worktree
/// 里只提交点名的那几个文件),开 MR 这一步是同一段代码,只留一份。
///
/// `body` 与 `issue_number` 都由调用方给:**带不带 `Closes` / `--issue-nums`
/// 是调用方的决定**。V4 的活是本机号,和远端 issue 号没有对应关系,自作主张
/// 挂上去会把那个仓里毫不相干的一号活关掉。
///
/// target-branch = 项目默认分支,运行时从 `origin/HEAD` 解析(maas 是
/// `master`,别的项目可能是 `main`/`develop`)。`symbolic-ref` 在没设
/// `origin/HEAD` 的克隆上会非零退出且 stdout 为空,这时退回 `master` —— 基线
/// 猜错会由 codehub-cli 的「branch not found」如实报出来,不会假装成功。
pub async fn create_mr_on_branch(
    host: &str,
    path: &str,
    workspace: &Path,
    branch: &str,
    title: &str,
    body: &str,
    issue_number: Option<u32>,
) -> Result<crate::github::PrOpened, CodehubError> {
    let tgt = crate::win_cmd::tokio_cmd("git")
        .current_dir(workspace)
        .args(["symbolic-ref", "refs/remotes/origin/HEAD"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    let target = String::from_utf8_lossy(&tgt.stdout)
        .trim()
        .strip_prefix("refs/remotes/origin/")
        .unwrap_or("master")
        .to_string();
    // P7-7A parity: adopt an already-open MR for this branch if one exists.
    // A prior run (or a manual smoke) may have opened an MR that BW didn't
    // record — `mr create` would then fail "already exists". Read the real
    // iid back (never guessed, same honesty as github's `adopt_existing_pr`).
    // 读回失败(网络/权限)就落到下面的 `mr create`,由它如实报错。
    if let Ok(Some(iid)) = open_mr_for_branch(host, path, branch).await {
        return Ok(crate::github::PrOpened::Adopted(iid));
    }
    let issue_nums = issue_number.map(|n| format!("issue{n}"));
    let mut args: Vec<&str> = vec![
        "mr",
        "create",
        "-p",
        path,
        "-H",
        host,
        "--source-branch",
        branch,
        "--target-branch",
        &target,
        "--title",
        title,
        "--description",
        body,
    ];
    if let Some(nums) = issue_nums.as_deref() {
        args.push("--issue-nums");
        args.push(nums);
    }
    args.push("--jq");
    args.push(".iid");
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let iid = text
        .parse::<u32>()
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub MR iid:{text:?}")))?;
    Ok(crate::github::PrOpened::Created(iid))
}

/// `codehub-cli mr list --source-branch <branch> --state opened --jq .[0].iid`
/// → the iid of the first open MR sourced from `branch`, or `None` if no
/// such MR exists. Read-only, zero repo side effects. Used by the InReview
/// detection poller (V1 Issue2 Phase2a) to detect an MR the agent opened
/// in-session — buddy doesn't create it (the agent does), buddy just reads
/// it back (读回为证, not agent self-report).
///
/// Mirrors the existing `create_mr` adoption path's `mr list` call exactly
/// (same flags, same `--jq .[0].iid` extraction). `Ok(None)` = no open MR
/// for that branch — the honest "nothing to review yet" answer, not an
/// error.
pub async fn open_mr_for_branch(
    host: &str,
    path: &str,
    branch: &str,
) -> Result<Option<u32>, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "mr",
            "list",
            "-p",
            path,
            "-H",
            host,
            "--source-branch",
            branch,
            "--state",
            "opened",
            "--jq",
            ".[0].iid",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(None);
    }
    text.parse::<u32>()
        .map(Some)
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub MR iid:{text:?}")))
}

/// `codehub-cli mr merge <iid> --squash -y` — the codehub parity of
/// [`crate::github::merge_pr`]: the human验收 action that integrates the
/// source branch into the target. Squash-merges (matches github's `--squash`).
/// The caller ([`crate::Remote::merge_mr`] ← `MergeIssuePr`) settles the
/// Issue `Done` on `Ok` via the existing `TransitionIssue` InReview→Done path;
/// on `Err` the Issue stays `InReview` retryable — never reverse-settled,
/// never fabricated. **Only ever called from `MergeIssuePr` (a human click),
/// never from any run/executor path**.
pub async fn merge_mr(host: &str, path: &str, mr_iid: u32) -> Result<(), CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "mr",
            "merge",
            &mr_iid.to_string(),
            "-p",
            path,
            "-H",
            host,
            "--squash",
            "-y",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    let merge_stderr = stderr_text(&out);
    if !out.status.success() {
        return Err(CodehubError::Command(merge_stderr));
    }
    // 读回为证: codehub-cli mr merge 的退出码靠不住——2026-07-31 实测 403
    // (protected-branch / 无 merge 权限)时,首次调用可退出 0(error 只打到
    // stderr)、MR 实际没合(state 仍 "opened")。只信「MR state 真变 merged」
    // 才算成功,绝不假 Done。复跑 mr view 拿 state(`--jq .merged` 对未合 MR
    // 返 null,故用 `.state`)。
    let verify = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "mr",
            "view",
            &mr_iid.to_string(),
            "-p",
            path,
            "-H",
            host,
            "--jq",
            ".state",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !verify.status.success() {
        return Err(CodehubError::Command(format!(
            "merge 后读回 MR 状态失败:{} | merge stderr: {merge_stderr}",
            stderr_text(&verify)
        )));
    }
    let state = String::from_utf8_lossy(&verify.stdout)
        .trim()
        .trim_matches('"')
        .to_string();
    if state == "merged" {
        Ok(())
    } else {
        Err(CodehubError::Command(format!(
            "merge 未生效(MR state={state},应 merged):{merge_stderr}"
        )))
    }
}

/// Clone a codehub repo into `dest` over **SSH**. codehub 是局域网平台,HTTPS
/// `git clone` 经代理隧道被拦(实测 504);SSH 走 SSH key、不经代理、不要
/// token——开发者手敲 `git clone ssh://git@szv-open...:2222/.../maas.git` 就是
/// 这条路,常规、不特立独行。
///
/// SSH host(`szv-open.codehub.huawei.com:2222`)≠ API host
/// (`open.codehub.huawei.com`),不能从 (host,path) 手拼——从 `project view`
/// 的 `ssh_url_to_repo` 字段取准确地址(`--template` 出裸串;`--jq` 带引号且
/// 无 `-r`)。拿到后 raw `git clone`(codehub-cli 的 `repo clone` 对 SSH 输入
/// 是纯透传,无增益,故绕过)。
///
/// `GIT_SSH_COMMAND` 带 `accept-new`(首次 host key 自动接受写 known_hosts,
/// 免非交互卡死)+ `BatchMode=yes`(只走 key、不弹密码,密码会挂死非交互进程)。
pub async fn clone_repo(host: &str, path: &str, dest: &Path) -> Result<(), CodehubError> {
    // 1. 取 ssh_url(--template 出裸串,无引号)
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "project",
            "view",
            "-p",
            path,
            "-H",
            host,
            "--template",
            "{{.ssh_url_to_repo}}",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(format!(
            "取 ssh_url 失败(project view):{}",
            stderr_text(&out)
        )));
    }
    let ssh_url = String::from_utf8_lossy(&out.stdout).trim().to_string();
    // --template 对 null 字段输出 "<no value>";空/非 ssh:// 不喂给 git
    // (老仓/无 SSH 配置的仓 ssh_url_to_repo 会是空)。
    if !ssh_url.starts_with("ssh://") {
        return Err(CodehubError::Command(format!(
            "codehub 仓无 SSH clone 地址(ssh_url_to_repo 为空或老仓?):{ssh_url:?}"
        )));
    }
    // 2. raw git clone(SSH key 认证,不经代理)
    let out = crate::win_cmd::tokio_cmd("git")
        .args(["clone", &ssh_url, &dest.to_string_lossy()])
        .env(
            "GIT_SSH_COMMAND",
            "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

// ─────────────────────────────── 列仓 ───────────────────────────────
//
// `codehub-cli project list --mine` —— 接入屏「接入已有仓」那张列表的数据源,
// 对仗 `github::list_repos`(`gh repo list`)。无状态 shell-out,和本模块其余
// 函数一样;token 走 keyring(`auth login`),不从这里传。
//
// **「新建仓」两个平台都没有**:V4 的接入只有「接入已有仓」这一条路,建仓在
// 平台网页上做。原来这里写着一段 `project create --namespace-id …` 的说明,
// 而那个函数从来没被拷过来 —— 已删,不留一段指着空气的注释。

/// V2-② Intent UX: fetch `.bw/project.toml` from the remote without
/// cloning. Used by the creation flow after the user picks「接入已有仓」so
/// Intent can readonly-prefill later-comers. `Ok(None)` = file absent (404)
/// → first-comer; `Err` = network/auth/parse failure → UI stays editable and
/// does **not** pretend later-comer. Final trio/write gate still uses the
/// local file after clone.
pub async fn fetch_project_toml(
    host: &str,
    path: &str,
    git_ref: &str,
) -> Result<Option<String>, CodehubError> {
    let git_ref = if git_ref.trim().is_empty() {
        "main"
    } else {
        git_ref.trim()
    };
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "-H",
            host,
            "repo",
            "file",
            "raw",
            "-p",
            path,
            "--file-path",
            crate::github::PROJECT_FILE_REL_PATH,
            "--ref",
            git_ref,
            "--no-cache",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        let err = stderr_text(&out);
        let lower = err.to_lowercase();
        // **分支找不到**和**这个仓里没有这份文件**是两件事,但两边都是 404。
        // 前者是「没查成」(内部仓的默认分支常是 master,见 `create_mr_on_branch`
        // 的注释),后者才是「这个仓还没被接管过」。混成一个 `Ok(None)`,人就会
        // 看到「首来者,请填」然后一路盖掉仓里已有的名片。
        if lower.contains("branch not found") || lower.contains("ref not found") {
            return Err(CodehubError::Command(err));
        }
        if lower.contains("404") || lower.contains("not found") || lower.contains("does not exist")
        {
            return Ok(None);
        }
        return Err(CodehubError::Command(err));
    }
    Ok(Some(
        String::from_utf8_lossy(&out.stdout).trim().to_string(),
    ))
}

/// `codehub-cli -H <host> project list --mine --limit N --json` → 仓列表
/// (对仗 `gh repo list`)。Read-only,无副作用。解析
/// `path_with_namespace`/`visibility`/`default_branch`/`last_activity_at`/
/// `description` 成 [`CodehubRepoSummary`]。
pub async fn list_repos(host: &str, limit: u32) -> Result<Vec<CodehubRepoSummary>, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "-H",
            host,
            "project",
            "list",
            "--mine",
            "--limit",
            &limit.to_string(),
            "--json",
            "path_with_namespace,visibility,default_branch,last_activity_at,description",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let rows: Vec<CodehubRepoJson> = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project list JSON:{e}")))?;
    Ok(rows
        .into_iter()
        .map(|r| CodehubRepoSummary {
            path: r.path_with_namespace,
            visibility: r.visibility,
            default_branch: r.default_branch,
            pushed_at: r.last_activity_at,
            description: r.description.unwrap_or_default(),
        })
        .collect())
}

// ─────────────── JSON deserialization helpers ───────────────

#[derive(serde::Deserialize)]
struct CodehubRepoJson {
    path_with_namespace: String,
    visibility: String,
    #[serde(default)]
    default_branch: String,
    #[serde(default)]
    last_activity_at: String,
    #[serde(default)]
    description: Option<String>,
}

// ───────────────────────── issue + release ─────────────────────────
//
// V4 数据层:issue 的状态/排期/版本正本搬到 codehub issue + 标签。下面五个
// 函数都是 `codehub-cli issue/release` 子命令的无状态 shell-out,和本模块
// 其余函数同形(`-p <path> -H <host>` + `--jq` 选字段)。不碰 SQLite,不碰
// 调用方(加性)。
//
// body 旗标用 `--description`(V3 试用期实测;codehub-cli 的
// issue create 文档虽写 `--body/--body-file`,但 `--description` 是稳的那条)。
// labels 逗号拼成一条串;空切片不打 `--labels`(codehub 对空 label 会报错)。

/// `codehub-cli issue create -p <path> -H <host> --title <t> --description <body>
/// [--labels a,b,c] --jq .iid` → 新 issue 的 `iid`(项目内号,对标 github
/// issue number)。调它真开 issue,只在创建流调,绝不自动。
pub async fn create_issue(
    host: &str,
    path: &str,
    title: &str,
    body: &str,
    labels: &[&str],
) -> Result<u32, CodehubError> {
    let labels_csv = labels.join(",");
    let mut args: Vec<&str> = vec![
        "issue",
        "create",
        "-p",
        path,
        "-H",
        host,
        "--title",
        title,
        "--description",
        body,
    ];
    if !labels_csv.is_empty() {
        args.push("--labels");
        args.push(&labels_csv);
    }
    args.push("--jq");
    args.push(".iid");
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    text.parse::<u32>()
        .map_err(|_| CodehubError::Parse(format!("无法解析 codehub issue iid:{text:?}")))
}

/// `codehub-cli issue update <iid> -p <path> -H <host> [--labels a,b,c]
/// [--state-event close|reopen]`。`labels` 是 **namespace-replace** 语义:
/// 对每个入参 label 算前缀([`crate::remote::label_prefix`]),把 issue 现有
/// labels 里前缀命中的摘掉,再把入参全加上(裸 label 无前缀,只加不摘)。
/// 这样调 `update_issue(iid, Some(&["bw:status:inprogress"]), None)` 只换
/// `bw:status:*`,`bw:week:*`/`bw:released:*` 不动。
///
/// GitLab 的 issue update API 对 `labels` 是**全量替换**(传啥整张盖掉旧
/// 标签)——为了凑出 namespace-replace,得多 list 一次现有 labels,算出
/// 「(现有 - 前缀命中的)∪ 入参」的最终全量,再当 `--labels` 传进去。
/// `labels=None` 不动标签,`state_event=None` 不动状态。幂等: 对已关的
/// issue 再 close 是 no-op。
pub async fn update_issue(
    host: &str,
    path: &str,
    iid: u32,
    labels: Option<&[&str]>,
    state_event: Option<&str>,
) -> Result<(), CodehubError> {
    let iid_s = iid.to_string();
    // 1. 算最终全量 labels(GitLab 是全量替换,得现读再算 namespace-replace)
    let labels_csv: Option<String> = if let Some(lbls) = labels {
        if lbls.is_empty() {
            None
        } else {
            // 1a. list 现有 labels(codehub 的 labels 是对象数组 `[{name,color}]`,
            // 不是字符串数组——直接 `[.labels[]]` 会回对象、按 Vec<String> 解析炸,
            // 这里抽 .name;裸字符串 label 也兼容(`.name? // .`)。
            let view = crate::win_cmd::tokio_cmd("codehub-cli")
                .args([
                    "issue",
                    "view",
                    &iid_s,
                    "-p",
                    path,
                    "-H",
                    host,
                    "--jq",
                    "(.labels // []) | [.[] | (.name? // .)]",
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .await
                .map_err(spawn_err)?;
            if !view.status.success() {
                return Err(CodehubError::Command(stderr_text(&view)));
            }
            let text = String::from_utf8_lossy(&view.stdout).trim().to_string();
            let current: Vec<String> = if text.is_empty() || text == "null" {
                Vec::new()
            } else {
                serde_json::from_str(&text).map_err(|e| {
                    CodehubError::Parse(format!("无法解析 codehub issue view labels JSON:{e}"))
                })?
            };
            // 1b. 最终全量 = (现有 - 前缀命中的) ∪ 入参
            let input_prefixes: std::collections::HashSet<&str> = lbls
                .iter()
                .filter_map(|&l| crate::remote::label_prefix(l))
                .collect();
            let mut final_set: Vec<String> = current
                .iter()
                .filter(|c| match crate::remote::label_prefix(c) {
                    Some(p) => !input_prefixes.contains(p),
                    None => true,
                })
                .cloned()
                .collect();
            for l in crate::remote::filter_persistent_labels(lbls) {
                if !final_set.iter().any(|s| s == l) {
                    final_set.push(l.to_string());
                }
            }
            Some(final_set.join(","))
        }
    } else {
        None
    };
    // 1c. 发 update(空 csv 不打 --labels,codehub 对空 label 报错)
    let mut args: Vec<&str> = vec!["issue", "update", &iid_s, "-p", path, "-H", host];
    if let Some(csv) = labels_csv.as_deref() {
        if !csv.is_empty() {
            args.push("--labels");
            args.push(csv);
        }
    }
    if let Some(ev) = state_event {
        args.push("--state-event");
        args.push(ev);
    }
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

/// `codehub-cli issue list -p <path> -H <host> [--state opened|closed]
/// [--labels a,b,c] -l 0 --jq '[.[] | {iid, number, title, state, labels}]'`
/// → 只读 issue 列表。`-l 0` = 全量(同 V3 `list_open_issues` 的做法)。
/// `state=None` 两态都要。`labels` 取交集(必须带齐每一条)。`number` 取
/// GitLab 的全局 `id`,缺失时退回 `iid`(够用,不假装有另一个号)。
pub async fn list_issues(
    host: &str,
    path: &str,
    state: Option<&str>,
    labels: &[String],
) -> Result<Vec<crate::remote::RemoteIssue>, CodehubError> {
    let labels_csv = labels.join(",");
    let mut args: Vec<&str> = vec!["issue", "list", "-p", path, "-H", host];
    if let Some(s) = state {
        args.push("--state");
        args.push(s);
    }
    if !labels_csv.is_empty() {
        args.push("--labels");
        args.push(&labels_csv);
    }
    args.push("-l");
    args.push("0");
    args.push("--jq");
    // jq 投影成对象数组,字段名对齐 GitLab v4 issue payload:`iid`/`id`/
    // `title`/`state`/`labels`。`id` 缺失(GitLab 必有,但 codehub-cli 边缘
    // 情况下可能不回)时退回 `iid`,免得解析整张列表炸掉。
    //
    // `(. // [])` 兜 null:开着的 issue 为零时 codehub-cli 返 null,
    // 裸 `.[]` 会 jq 运行期失败(实测 2026-08-24:接入后铺底先查同标题开着的
    // 活,这里一炸就建不出新活、开不出 MR)。走势那对查询已经兜过,这里漏了。
    args.push(r#"(. // []) | [.[] | {iid: .iid, number: (.id // .iid), title: (.title // ""), state: (.state // ""), labels: ((.labels // []) | map(.name? // .)), created_at: (.created_at // null), closed_at: (.closed_at // null), assignee: .assignee, author: .author}]"#);
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let rows = parse_issue_list_json(&out.stdout)?;
    Ok(rows
        .into_iter()
        .map(|r| crate::remote::RemoteIssue {
            iid: r.iid,
            number: r.number,
            title: r.title,
            state: r.state,
            labels: r.labels,
            body: String::new(),
            created_at: r.created_at,
            closed_at: r.closed_at,
            assignee: person_name(r.assignee.as_ref()),
            author: person_name(r.author.as_ref()),
        })
        .collect())
}

/// `codehub-cli issue view <iid> -p <path> -H <host> --format json`
/// → 单条 issue 带正文。list_issues 不带正文,要正文走这条。
/// codehub-cli 的 `issue view --format json` 回 GitLab v4 issue payload,
/// 字段含 `iid`/`id`/`title`/`state`/`labels`/`description`(正文)。
pub async fn view_issue(
    host: &str,
    path: &str,
    iid: u32,
) -> Result<crate::remote::RemoteIssue, CodehubError> {
    let iid_s = iid.to_string();
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "issue", "view", &iid_s, "-p", path, "-H", host, "--format", "json",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let r: CodehubIssueViewJson = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub issue view JSON:{e}")))?;
    Ok(crate::remote::RemoteIssue {
        iid: r.iid,
        number: r.number,
        title: r.title,
        state: r.state,
        // codehub 的 labels 是对象数组 `[{name,color,...}]`(不是字符串数组),
        // 抽 `.name`;万一将来变字符串,也兼容。
        labels: r.labels.iter().map(label_name).collect(),
        body: r.body.unwrap_or_default(),
        created_at: r.created_at,
        closed_at: r.closed_at,
        assignee: person_name(r.assignee.as_ref()),
        author: person_name(r.author.as_ref()),
    })
}

/// codehub 的 label 既可能是对象 `{name: "..."}`(list/view 都返这种),也可能
/// 是裸字符串。抽名字;都取不到返空串(绝不 panic)。
fn label_name(v: &serde_json::Value) -> String {
    v.get("name")
        .and_then(|n| n.as_str())
        .map(|s| s.to_string())
        .or_else(|| v.as_str().map(|s| s.to_string()))
        .unwrap_or_default()
}

/// 从 codehub/GitLab 的 `assignee`/`author` 对象里取人名。codehub 用 `user_name`,
/// GitLab 用 `username`;两个都试,认不出返空串。`null`(未指派)= None。
fn person_name(v: Option<&serde_json::Value>) -> Option<String> {
    let v = v?;
    if v.is_null() {
        return None;
    }
    ["user_name", "username", "name"]
        .iter()
        .find_map(|k| v.get(k).and_then(|x| x.as_str()).filter(|s| !s.is_empty()))
        .map(|s| s.to_string())
}

#[derive(serde::Deserialize)]
struct CodehubIssueViewJson {
    iid: u32,
    #[serde(default)]
    number: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    state: String,
    /// codehub 返对象数组 `[{name,color}]`,用 Value 收、`label_name` 抽名字。
    #[serde(default)]
    labels: Vec<serde_json::Value>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    assignee: Option<serde_json::Value>,
    #[serde(default)]
    author: Option<serde_json::Value>,
}

/// 把 `issue list --jq` 的 stdout 收成行。空串 / `null` = 一张都没有,不是解析失败。
fn parse_issue_list_json(stdout: &[u8]) -> Result<Vec<CodehubIssueJson>, CodehubError> {
    let text = String::from_utf8_lossy(stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub issue list JSON:{e}")))
}

#[derive(serde::Deserialize)]
struct CodehubIssueJson {
    iid: u32,
    #[serde(default)]
    number: u32,
    #[serde(default)]
    title: String,
    #[serde(default)]
    state: String,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
    #[serde(default)]
    assignee: Option<serde_json::Value>,
    #[serde(default)]
    author: Option<serde_json::Value>,
}

/// `codehub-cli issue comment create <iid> -p <path> -H <host> --body <text>`
/// → 在 issue 上写一条评论(GitLab 的 issue note)。结构化产出挂评论,不动正文。
///
/// 子命令是 `issue comment create`(不是 `issue note create`——codehub-cli 没有
/// `note` 子命令,以前写成 `note` 会被当未知命令、`-p` 报「unknown shorthand
/// flag」,评论写不进去,bootstrap 在这步炸、后面的推 inreview 也走不到)。
pub async fn comment_issue(
    host: &str,
    path: &str,
    iid: u32,
    body: &str,
) -> Result<(), CodehubError> {
    let iid_s = iid.to_string();
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "issue", "comment", "create", &iid_s, "-p", path, "-H", host, "--body", body,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

/// `codehub-cli issue comment list <iid> -p <path> -H <host> -l 0 --sort asc`
/// → 旧的在前,系统备注丢掉。
pub async fn list_issue_comments(
    host: &str,
    path: &str,
    iid: u32,
) -> Result<Vec<String>, CodehubError> {
    let iid_s = iid.to_string();
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "issue",
            "comment",
            "list",
            &iid_s,
            "-p",
            path,
            "-H",
            host,
            "-l",
            "0",
            "--sort",
            "asc",
            "--jq",
            r#"(. // []) | [.[] | select((.system // false) | not) | .body // ""]"#,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let text = text.trim();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 issue 评论列表 JSON:{e}")))
}

/// `codehub-cli release create -p <path> -H <host> --tag-name <tag> --name <t>
/// --description <body> --ref <default_branch>` → 打 tag + 发版本。只在发版流调,
/// 绝不自动。tag 已存在时 codehub-cli 如实报错,不假装成功。
/// 旗标跟现行 CLI:`--title` / `--notes` / 位置参数 tag 都会被拒。
/// 绿区实例强制 `--ref`(分支/提交/tag),不传就 422 `CH.00404131`。
pub async fn create_release(
    host: &str,
    path: &str,
    tag: &str,
    title: &str,
    body: &str,
) -> Result<(), CodehubError> {
    let git_ref = project_default_branch(host, path).await?;
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "release",
            "create",
            "-p",
            path,
            "-H",
            host,
            "--tag-name",
            tag,
            "--name",
            title,
            "--description",
            body,
            "--ref",
            &git_ref,
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    Ok(())
}

/// `codehub-cli release list -p <path> -H <host> --jq '[.[] | .tag_name]'`
/// → 所有版本的 tag 串(只回 tag,正文/资源数留给上层另查)。`tag_name` 是
/// GitLab release payload 的字段名;codehub-cli 同构封装,沿用。
pub async fn list_releases(host: &str, path: &str) -> Result<Vec<String>, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "release",
            "list",
            "-p",
            path,
            "-H",
            host,
            "--jq",
            // 与 list_issues 同形:空仓返 null,裸 `.[]` 会炸。
            "(. // []) | [.[] | .tag_name]",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub release list JSON:{e}")))
}

// ─────────────────────── 走势图用:合入 MR / issue 时序 ───────────────────────
//
// 对仗 `crate::github` 的 `merged_pr_times` / `issue_times`:走势图要
// 按周分桶「每周合入的 PR」+「未处理 issue 周末存量」。codehub 那条以前只
// 走 GitHub,codehub 项目这两条线一直空(「尚无观测」)—— 补上。
//
// 与 github 那对同形:回 RFC3339 原文,**不在底座解析时间**,按周分桶是上层
// (`bw::trend`)的事。`-l 0` = 全量(同 `list_issues` 的做法,不截断)。

/// 已合并 MR 的合并时刻(RFC3339 原文),对仗 [`crate::github::merged_pr_times`]。
///
/// 复算:`codehub-cli -H <host> mr list -p <path> --state merged -l 0 --jq '[.[] | .merged_at]'`
pub async fn merged_mr_times(host: &str, path: &str) -> Result<Vec<String>, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "mr",
            "list",
            "-p",
            path,
            "-H",
            host,
            "--state",
            "merged",
            "-l",
            "0",
            "--jq",
            // `(. // [])` 兜 null:仓里没有已合并 MR 时 codehub-cli 返 null,不兜的话
            // `.[]` 迭代 null 会报错(实测)。
            "(. // []) | [.[] | .merged_at]",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    // merged_at 可能是 null(未合并的不会进 --state merged,但稳一手),flatten 掉。
    let v: Vec<Option<String>> = serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub mr merged_at JSON:{e}")))?;
    Ok(v.into_iter().flatten().collect())
}

/// 每张 issue 的建立时刻与关闭时刻(没关就是 None),对仗 [`crate::github::issue_times`]。
/// **不含 MR** —— codehub 的 issue list 本就把 MR 排除在外(同 GitLab)。
///
/// 复算:`codehub-cli -H <host> issue list -p <path> --state all -l 0 --jq '[.[] | {created_at: .created_at, closed_at: .closed_at}]'`
pub async fn issue_times(
    host: &str,
    path: &str,
) -> Result<Vec<(String, Option<String>)>, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args([
            "issue",
            "list",
            "-p",
            path,
            "-H",
            host,
            "--state",
            "all",
            "-l",
            "0",
            "--jq",
            "(. // []) | [.[] | {created_at: .created_at, closed_at: .closed_at}]",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if text.is_empty() || text == "null" {
        return Ok(Vec::new());
    }
    let v: Vec<CodehubIssueTimeJson> = serde_json::from_str(&text)
        .map_err(|e| CodehubError::Parse(format!("无法解析 codehub issue times JSON:{e}")))?;
    Ok(v.into_iter()
        .map(|r| (r.created_at.unwrap_or_default(), r.closed_at))
        .collect())
}

// ───────────────────────── 周标签 → 里程碑投影 ─────────────────────────
//
// codehub-cli 没有 milestone 子命令。走 `api`，路径必须带 `/api/v4`
//（不带会 302 到登录页）。只认标题整段等于 `YYYY-Www` 的里程碑，不碰
// 别人的 `5.8.0`。`week` 空 = 从里程碑摘下（`milestone_id=0`）。

/// 把一张 issue 挂到（或摘下）同名周里程碑。幂等：同名已在就复用。
pub async fn project_week(
    host: &str,
    path: &str,
    iid: u32,
    week: &str,
    start: &str,
    due: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    if week.is_empty() {
        return set_issue_milestone(host, &pid, iid, 0).await;
    }
    let mid = ensure_week_milestone(host, &pid, week, start, due).await?;
    set_issue_milestone(host, &pid, iid, mid).await
}

// ── 版本(自定义计划包)→ 里程碑 ──
// 周计划怎么存版本就怎么存:codehub milestone(title=版本名)+ `bw:plan:<name>`
// 标签。正本是标签,里程碑是 codehub 侧镜像。与发版号(bw:released:*)不同。

/// 建/复用一个版本里程碑,返回 mid。同名复用(不更新日期);找不到才建。
pub async fn ensure_plan_milestone(
    host: &str,
    path: &str,
    name: &str,
    start: &str,
    due: &str,
) -> Result<u64, CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    for m in milestone_rows(&listed) {
        if m["title"].as_str() == Some(name) {
            if let Some(id) = m["id"].as_u64() {
                return Ok(id);
            }
        }
    }
    let desc = format!("buddy 投影 · 正本是 bw:plan:{name}");
    let created = api_json(
        host,
        "POST",
        "/api/v4/projects/:id/milestones",
        &[
            ("id", pid.as_str()),
            ("title", name),
            ("start_date", start),
            ("due_date", due),
        ],
        &[("description", desc.as_str())],
    )
    .await?;
    created["id"]
        .as_u64()
        .ok_or_else(|| CodehubError::Parse(format!("新建版本里程碑没有 id:{created}")))
}

/// 把一张 issue 挂到**已存在**的版本里程碑（按标题找，不建、不更新日期）。
/// 找不到就如实空过 —— 正本是 `bw:plan:` 标签，里程碑只是 codehub 侧的镜像。
pub async fn project_plan(
    host: &str,
    path: &str,
    iid: u32,
    name: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    for m in milestone_rows(&listed) {
        if m["title"].as_str() == Some(name) {
            if let Some(id) = m["id"].as_u64() {
                return set_issue_milestone(host, &pid, iid, id).await;
            }
        }
    }
    Ok(())
}

/// 列出所有里程碑 (title, start, due)。跳过周格式(YYYY-Www)的,余下是版本。
pub async fn list_milestones(
    host: &str,
    path: &str,
) -> Result<Vec<(String, String, String)>, CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", pid.as_str())],
        &[],
    )
    .await?;
    Ok(milestone_rows(&listed)
        .iter()
        .filter_map(|m| {
            let title = m["title"].as_str()?.to_string();
            if is_week_title(&title) {
                return None;
            }
            let start = m["start_date"].as_str().unwrap_or("").to_string();
            let due = m["due_date"].as_str().unwrap_or("").to_string();
            Some((title, start, due))
        })
        .collect())
}

/// `YYYY-Www` 周格式?形如 2026-W35。
fn is_week_title(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 8
        && s[5..6].eq_ignore_ascii_case("W")
        && s[..4].chars().all(|c| c.is_ascii_digit())
        && s[6..].chars().all(|c| c.is_ascii_digit())
}

/// 改 issue 责任人。空 = 取消指派。先 username→userid,再 PUT `assignee_id`。
pub async fn set_issue_assignee(
    host: &str,
    path: &str,
    iid: u32,
    assignee: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let iid_s = iid.to_string();
    let endpoint = format!("/api/v4/projects/:id/issues/{iid_s}");
    if assignee.is_empty() {
        // 取消指派:assignee_id 传空串让 GitLab 清空(部分版本接受;不行就走
        // assignee_ids=[] raw JSON,先按这版)。
        api_json(
            host,
            "PUT",
            &endpoint,
            &[("id", pid.as_str()), ("assignee_id", "")],
            &[],
        )
        .await?;
        return Ok(());
    }
    let uid = user_id_by_username(host, assignee).await?.to_string();
    // GitLab v4 单指派用 assignee_id(单数,接受 int 字符串);assignee_ids 要数组,
    // codehub-cli --field 传成字符串会被忽略,故用单数。
    api_json(
        host,
        "PUT",
        &endpoint,
        &[("id", pid.as_str()), ("assignee_id", uid.as_str())],
        &[],
    )
    .await?;
    Ok(())
}

/// `GET /api/v4/users?username=<name>` → 第一个匹配的数字 id。认不出报错。
/// `GET /api/v4/user` → 当前登录用户名(给「我的」筛选用)。认不出返 None。
pub async fn current_user(host: &str) -> Option<String> {
    let v = api_json(host, "GET", "/api/v4/user", &[], &[]).await.ok()?;
    person_name(Some(&v)).or_else(|| {
        v.get("user_name")
            .and_then(|x| x.as_str())
            .or_else(|| v.get("username").and_then(|x| x.as_str()))
            .map(|s| s.to_string())
    })
}

async fn user_id_by_username(host: &str, username: &str) -> Result<u64, CodehubError> {
    let listed = api_json(host, "GET", "/api/v4/users", &[("username", username)], &[]).await?;
    let arr = listed
        .as_array()
        .ok_or_else(|| CodehubError::Parse(format!("users 查询不是数组:{listed}")))?;
    for u in arr {
        if let Some(id) = u["id"].as_u64() {
            return Ok(id);
        }
    }
    Err(CodehubError::Command(format!(
        "codehub 查不到用户名 {username}"
    )))
}

/// 改一张 issue 的标题与正文（GitLab v4 `title`/`description`）。
pub async fn edit_issue(
    host: &str,
    path: &str,
    iid: u32,
    title: &str,
    body: &str,
) -> Result<(), CodehubError> {
    let project_id = project_numeric_id(host, path).await?;
    let pid = project_id.to_string();
    let iid_s = iid.to_string();
    let endpoint = format!("/api/v4/projects/:id/issues/{iid_s}");
    api_json(
        host,
        "PUT",
        &endpoint,
        &[
            ("id", pid.as_str()),
            ("title", title),
            ("description", body),
        ],
        &[],
    )
    .await?;
    Ok(())
}

async fn project_numeric_id(host: &str, path: &str) -> Result<u64, CodehubError> {
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(["project", "view", "-p", path, "-H", host])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| CodehubError::Parse(format!("project view JSON:{e}")))?;
    v["id"]
        .as_u64()
        .ok_or_else(|| CodehubError::Parse("project view 没有数字 id".into()))
}

async fn ensure_week_milestone(
    host: &str,
    project_id: &str,
    week: &str,
    start: &str,
    due: &str,
) -> Result<u64, CodehubError> {
    let listed = api_json(
        host,
        "GET",
        "/api/v4/projects/:id/milestones",
        &[("id", project_id)],
        &[],
    )
    .await?;
    for m in milestone_rows(&listed) {
        if m["title"].as_str() == Some(week) {
            if let Some(id) = m["id"].as_u64() {
                return Ok(id);
            }
        }
    }
    let desc = format!("buddy 投影 · 正本是 bw:week:{week}");
    let created = api_json(
        host,
        "POST",
        "/api/v4/projects/:id/milestones",
        &[
            ("id", project_id),
            ("title", week),
            ("start_date", start),
            ("due_date", due),
        ],
        &[("description", desc.as_str())],
    )
    .await?;
    created["id"]
        .as_u64()
        .ok_or_else(|| CodehubError::Parse(format!("新建里程碑没有 id:{created}")))
}

async fn set_issue_milestone(
    host: &str,
    project_id: &str,
    iid: u32,
    milestone_id: u64,
) -> Result<(), CodehubError> {
    let iid_s = iid.to_string();
    let mid_s = milestone_id.to_string();
    api_json(
        host,
        "PUT",
        "/api/v4/projects/:id/issues/:issue_iid",
        &[
            ("id", project_id),
            ("issue_iid", iid_s.as_str()),
            ("milestone_id", mid_s.as_str()),
        ],
        &[],
    )
    .await?;
    Ok(())
}

async fn api_json(
    host: &str,
    method: &str,
    endpoint: &str,
    fields: &[(&str, &str)],
    raw_fields: &[(&str, &str)],
) -> Result<serde_json::Value, CodehubError> {
    let field_args: Vec<String> = fields.iter().map(|(k, v)| format!("{k}={v}")).collect();
    let raw_args: Vec<String> = raw_fields.iter().map(|(k, v)| format!("{k}={v}")).collect();
    let mut args = vec!["api", method, endpoint, "-H", host, "-f", "json"];
    for a in &field_args {
        args.push("--field");
        args.push(a);
    }
    for a in &raw_args {
        args.push("--raw-field");
        args.push(a);
    }
    let out = crate::win_cmd::tokio_cmd("codehub-cli")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(spawn_err)?;
    if !out.status.success() {
        return Err(CodehubError::Command(stderr_text(&out)));
    }
    unwrap_api_body(&out.stdout)
}

/// `codehub-cli api -f json` 包一层 `{body,status,statusCode}`；也兼容裸 JSON。
fn unwrap_api_body(stdout: &[u8]) -> Result<serde_json::Value, CodehubError> {
    let v: serde_json::Value =
        serde_json::from_slice(stdout).map_err(|e| CodehubError::Parse(format!("api JSON:{e}")))?;
    if let Some(code) = v.get("statusCode").and_then(|c| c.as_u64()) {
        if !(200..300).contains(&code) {
            return Err(CodehubError::Command(format!(
                "api {}: {}",
                v.get("status").and_then(|s| s.as_str()).unwrap_or("?"),
                v.get("body").map(|b| b.to_string()).unwrap_or_default()
            )));
        }
        return Ok(v.get("body").cloned().unwrap_or(serde_json::Value::Null));
    }
    Ok(v)
}

fn milestone_rows(body: &serde_json::Value) -> Vec<&serde_json::Value> {
    if let Some(arr) = body.get("milestones").and_then(|v| v.as_array()) {
        return arr.iter().collect();
    }
    if let Some(arr) = body.as_array() {
        return arr.iter().collect();
    }
    Vec::new()
}

#[derive(serde::Deserialize)]
struct CodehubIssueTimeJson {
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    closed_at: Option<String>,
}

#[cfg(test)]
mod parse_issue_list_json_tests {
    use super::parse_issue_list_json;

    #[test]
    fn empty_and_null_are_no_issues() {
        assert!(parse_issue_list_json(b"").unwrap().is_empty());
        assert!(parse_issue_list_json(b"null").unwrap().is_empty());
        assert!(parse_issue_list_json(b"[]").unwrap().is_empty());
    }

    #[test]
    fn one_row() {
        let rows = parse_issue_list_json(
            r#"[{"iid":5,"number":5,"title":"bootstrap v5.0","state":"closed","labels":[]}]"#
                .as_bytes(),
        )
        .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].iid, 5);
        assert_eq!(rows[0].title, "bootstrap v5.0");
    }
}

#[cfg(test)]
mod api_body_tests {
    use super::{milestone_rows, unwrap_api_body};

    #[test]
    fn unwraps_status_wrapper() {
        let v = unwrap_api_body(
            br#"{"body":{"id":50659,"title":"2026-W35"},"status":"201 Created","statusCode":201}"#,
        )
        .unwrap();
        assert_eq!(v["id"], 50659);
    }

    #[test]
    fn reads_wrapped_milestone_list() {
        let body = unwrap_api_body(
            br#"{"body":{"all":1,"milestones":[{"id":1,"title":"2026-W35"}]},"status":"200 OK","statusCode":200}"#,
        )
        .unwrap();
        let rows = milestone_rows(&body);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["title"], "2026-W35");
    }
}
