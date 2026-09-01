//! Provider-neutral remote-repo dispatch — a thin enum hiding whether a
//! project's remote is GitHub (`gh` CLI) or CodeHub (`codehub-cli`). Call
//! sites ask [`Remote::for_project`] once, then call methods on the returned
//! [`Remote`]; the provider branch lives here (one `match` per method),
//! not scattered across N call sites in `app-shell`.
//!
//! Both arms are wired: GitHub delegates to [`crate::github`] (`gh`), CodeHub
//! delegates to [`crate::codehub`] (`codehub-cli`). The type + dispatch shape
//! landed in P2 with only the GitHub arm filled; P3 filled the CodeHub arm
//! with real `codehub-cli` shell-outs — no `CodehubUnwired` variant remains
//! (call sites never match on `Remote`; they call methods, so adding a
//! provider means filling the arm here, not revisiting N call sites in
//! `app-shell`).

use crate::codehub::{self, CodehubError};
use crate::github::{self, GithubError};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, thiserror::Error)]
pub enum RemoteError {
    #[error(transparent)]
    Github(#[from] GithubError),
    #[error(transparent)]
    Codehub(#[from] CodehubError),
    /// `for_project` 收到一个既非 `github` 也非 `codehub` 的 provider 串——配置
    /// 错(不是 github/codehub 侧的运行时错),独立 variant,不冒充 GithubError。
    #[error("未知 provider(既非 github 也非 codehub):{0}")]
    UnknownProvider(String),
    /// `Mock` 远端的运行时错。只用来如实回「找不到这张 issue」这类——mock 的
    /// 全部状态在内存里,正常路径不会报错;报错只可能是调用方拿了一个不存在的
    /// iid,那是调用方错,如实弹回,不静默。
    #[error("mock:{0}")]
    Mock(String),
}

/// A project's remote repo, provider-dispatched. Build via
/// [`Remote::for_project`] (from a project's `provider`/`remote_host`/
/// `remote_path`) or directly when a connector's `config` already carries a
/// github `owner/repo`. Never matched at call sites — call methods.
pub enum Remote {
    /// `"owner/repo"`. `github.com` is implied — `gh` is github.com-global and
    /// never takes a host param, so the stored `remote_host="github.com"` is
    /// carried for symmetry/Enterprise-future but unused by every github call.
    Github(String),
    /// `host` = 区的**别名**(`green` / `open`(内源) / `yellow`),就是
    /// `codehub-cli -H` 收的那个值,**不是域名** —— 拿它直接拼网页地址会得到一
    /// 个打不开的链接,要先过 `bw::model::codehub_alias_to_domain` 那张表。
    /// `path` 是 `"org/repo"`。
    /// Stateless today: every method re-passes `host`/`path` to the matching
    /// `codehub::xxx` shell-out (P3 wired all three arms). A future stateful
    /// `CodehubClient { host, path }` holding a resolved `project_id` would
    /// save the per-call `project view`, but the arms work as-is without it.
    Codehub { host: String, path: String },
    /// In-memory mock —— 给 headless 指挥器/测试用的远端替身。**不碰 codehub、
    /// 不碰 `gh`、不碰网关**;issue/release 全套在内存里走完,产出**自我标注**
    /// (issue 正文与评论都带【mock】字样,不冒充真 codehub)。状态持在
    /// `Arc<Mutex<MockState>>` 里,经 `App` 注入的 factory 拿到的是**同一个**
    /// Arc —— 这样「建活 → 列活 → 改状态 → 关」一整圈共享同一份状态,和真
    /// 远端一次会话连续操作的行为一致。`Remote::for_project("mock", …)` 也会回
    /// 一个 `Mock`,但那是**新建一份**状态(无 factory 注入时的兜底,适合单发
    /// 测试;指挥器走 factory 注入共享的那份)。
    Mock(Arc<Mutex<MockState>>),
}

// ─────────────── V4 mock 远端:内存状态 ───────────────

/// `Remote::Mock` 持的内存状态。`pub` 是为了让 `real_demo_v4` / 测试能 `Arc::new
/// (MockState::default())` 注入共享的那一份;字段不暴露 —— 状态只经
/// [`Remote`] 的方法读写。
#[derive(Default, Debug)]
pub struct MockState {
    issues: HashMap<u32, MockIssue>,
    /// 下一个 iid。从 1 起(0 不是合法 issue 号)。
    next_iid: u32,
    /// 已发的 release tag 集合。按版本号幂等(同 tag 不重复加)。
    releases: Vec<String>,
}

#[derive(Default, Debug, Clone)]
struct MockIssue {
    iid: u32,
    title: String,
    /// `"opened"` / `"closed"`,与 codehub 原文一致(`issue_from_remote` 靠
    /// `eq_ignore_ascii_case("closed")` 判)。
    state: String,
    labels: Vec<String>,
    body: String,
    comments: Vec<String>,
    /// 建活时刻的 RFC3339 串。建时填,事件流「建了活」那条靠它进得来。
    created_at: Option<String>,
    /// 关闭时刻的 RFC3339 串。关时填(= `settled_at` 的近似正本)。
    closed_at: Option<String>,
    /// 责任人(mock 用)。`None` = 未指派。
    assignee: Option<String>,
    /// 提出人(mock 用)。`None` = 认不出。
    author: Option<String>,
}

impl MockState {
    fn next_iid(&mut self) -> u32 {
        self.next_iid += 1;
        self.next_iid
    }
}

// ─────────────── V4 issue 远端正本:辅助类型 ───────────────
//
// V4 数据层把 issue 的状态/排期/版本从本地 SQLite 搬到 codehub/GitHub issue +
// 标签(正本在远端,本地只是缓存)。下面这些类型是 provider 无关的 DTO,两实现
// 各自构造同一个 [`RemoteIssue`],trait 只透传 `labels: &[&str]`,**不硬编词表**
// (状态 `bw:status:*` / 周 `bw:week:*` / 发版 `bw:released:*` / 种类 `bw:kind:*`
// 都是调用方的事)。`IssueState` 故意不碰 bw 的 `IssueStatus`(那是活的完整
// 生命周期状态机,这里只是远端 issue 的开/关二态)。

/// 远端 issue 的状态过滤值。**只指远端 issue 自身的 open/closed**,和 bw
/// `IssueStatus` 那套完整生命周期状态机不是一回事——别混。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IssueState {
    Open,
    Closed,
}

/// 对 issue 做的一次状态动作(关闭/重开)。对应 codehub 的
/// `issue update --state-event close|reopen`、github 的 `gh issue close|reopen`。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IssueStateEvent {
    Close,
    Reopen,
}

/// `list_issues` 的过滤条件:`state=None` 不过滤(两态都要),`labels` 取交集
/// (issue 必须带齐这里列的每一条 label)。空 `labels` = 不按 label 过滤。
#[derive(Clone, Debug, Default)]
pub struct IssueFilter {
    pub state: Option<IssueState>,
    pub labels: Vec<String>,
}

/// 一条远端 issue 的只读快照。`iid` = 项目内号(codehub/GitLab 的 `iid`);
/// `number` = 全局号(codehub 的 `id`,github 无 `iid`,`number` 即 issue 号,
/// 此时 `iid == number`)。`state` 是远端原文(codehub `"opened"`/`"closed"`、
/// github `"OPEN"`/`"CLOSED"`),**不归一化**——归一化是上层的事,底座只透传。
/// `body` 是 issue 正文;`list_issues` 不带正文(填空串),`view_issue` 单查带正文。
/// `created_at`/`closed_at` 是远端原文(RFC3339),取不到 `None` —— 事件流「建/
/// 结清」这两条靠它们进得来(刀3-fix:以前 `issue_from_remote` 写死 0/None,
/// 事件流恒空)。不归一化成时间戳,解析是上层的事。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteIssue {
    pub iid: u32,
    pub number: u32,
    pub title: String,
    pub state: String,
    pub labels: Vec<String>,
    pub body: String,
    /// 建活时刻(RFC3339)。gh `createdAt` / codehub `created_at`。
    pub created_at: Option<String>,
    /// 关闭时刻(RFC3339)。gh `closedAt` / codehub `closed_at`。开着 = `None`。
    pub closed_at: Option<String>,
    /// 责任人(codehub issue assignee)。`None` = 未指派/认不出。正本在远端。
    pub assignee: Option<String>,
    /// 提出人(codehub issue author)。`None` = 认不出。正本在远端。
    pub author: Option<String>,
}

/// 算一个 label 的 namespace 前缀(不含末尾冒号):`bw:status:todo` →
/// `Some("bw:status")`,`bug`(无冒号)→ `None`。只做字符串切分,**不硬编
/// `bw:*` 词表**。调 `update_issue` 时用它实现 namespace-replace 语义:
/// 把 issue 现有 labels 里、前缀落在入参前缀集合中的摘掉,再把入参全加上
/// (裸 label 无前缀,只加不摘)。两 provider 各自实现里 list 一次现有
/// labels 再算(github 无 set-absolute 旗标、codehub 是全量替换,都得多
/// list 一次换取 namespace 语义)。
pub(crate) fn label_prefix(label: &str) -> Option<&str> {
    label.rsplit_once(':').map(|(p, _)| p)
}

/// `bw:week:` 这种「前缀在、值空」= 只摘这个命名空间,不加回去。
/// 排期移回待办池走这条,避免留下一张空的 `bw:week:` 标签。
pub(crate) fn is_empty_namespace_label(label: &str) -> bool {
    label.rsplit_once(':').is_some_and(|(_, v)| v.is_empty())
}

/// 写入时跳过空后缀标签(它们只贡献 [`label_prefix`] 用来摘旧值)。
/// codehub / github / mock 三臂加标签都走这里,改一处即可。
pub(crate) fn filter_persistent_labels<'a>(labels: &'a [&'a str]) -> impl Iterator<Item = &'a str> {
    labels
        .iter()
        .copied()
        .filter(|l| !is_empty_namespace_label(l))
}

/// 当前 UTC 时刻的 RFC3339 串(mock 用)。与真 provider 同形:远端 issue 的
/// `created_at`/`closed_at` 都是 RFC3339 原文,上层 `issue_from_remote` 解析。
fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

impl Remote {
    /// Factory from a project's stored identity triple. `provider="github"`
    /// (or the legacy `""` default — pre-C16 存量行) → `Remote::Github(path)`;
    /// `provider="codehub"` → `Remote::Codehub { host, path }`. An unknown
    /// `provider` ⇒ `Err`. Callers gate on an empty `remote_path` *before*
    /// this (the honest no-remote case); reaching here with an empty path is
    /// a caller bug, not a quiet `Ok`.
    pub fn for_project(provider: &str, host: &str, path: &str) -> Result<Self, RemoteError> {
        let path = path.trim();
        match provider.trim() {
            "github" | "" => Ok(Remote::Github(path.to_string())),
            "codehub" => Ok(Remote::Codehub {
                host: host.trim().to_string(),
                path: path.to_string(),
            }),
            // 兜底:无 factory 注入时的 mock。**新建一份状态**,适合单发测试;
            // 指挥器/需要跨调用共享状态的测试走 `App` 的 remote_factory 注入
            // 同一个 Arc —— 这条路返回的 Arc 是独占的,建活之后再 list 拿不到。
            "mock" => Ok(Remote::Mock(Arc::new(Mutex::new(MockState::default())))),
            other => Err(RemoteError::UnknownProvider(other.to_string())),
        }
    }

    /// 在**已经推上去的分支**上开 PR/MR —— 和 [`Self::create_mr`] 的区别是:
    /// 这里不替调用方 `git add -A` 提交,分支上有什么就提什么;正文也由调用方
    /// 给,**不自动挂 `Closes #<n>`**。
    ///
    /// V4 走的是这条:活是本机连续号,和远端 issue 号没有对应关系,拼一句
    /// `Closes #3` 会去关掉那个仓里毫不相干的第 3 号 issue;而且规范铺底只
    /// 提交自己写下去的那几个文件,`add -A` 会把人手上没写完的改动一起打包。
    /// **绝不合入** —— 合入永远是人点的那一下。
    pub async fn create_mr_on_branch(
        &self,
        workspace: &Path,
        branch: &str,
        title: &str,
        body: &str,
    ) -> Result<github::PrOpened, RemoteError> {
        match self {
            Remote::Github(_) => {
                Ok(github::create_pr_on_branch(workspace, branch, title, body).await?)
            }
            Remote::Codehub { host, path } => Ok(codehub::create_mr_on_branch(
                host, path, workspace, branch, title, body,
            )
            .await?),
            // Mock:不开真 MR。回一个假号,让调用方的那条「MR 已开」流程走得下去;
            // body 不存 —— mock 的使命是验证 issue 全链路,MR 只到「不崩」为止。
            Remote::Mock(_) => Ok(github::PrOpened::Created(1)),
        }
    }

    /// Merge the open PR/MR. Github: `gh pr merge --squash`; codehub:
    /// `codehub-cli mr merge <iid> --squash -y`. Two call sites with different
    /// human/auto semantics: `MergeIssuePr` — the **human验收** action
    /// (one-click merge → caller settles `Done`); on `Err` the Issue stays
    /// `InReview` retryable, never fabricated, never reverse-settled.
    /// `write_project_toml_pr` — the **auto-merge** of a `.bw/config/project.toml`
    /// config PR (project.toml is configuration, not an Issue, so auto-merging
    /// it doesn't break "Done 永不自动"; issue PRs are never auto-merged —
    /// that path is unchanged). Bug③ (2026-07-30): before this, `MergeIssuePr`
    /// crashed `gh pr merge` on codehub remotes.
    pub async fn merge_mr(&self, pr_number: u32) -> Result<(), RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::merge_pr(r, pr_number).await?),
            Remote::Codehub { host, path } => Ok(codehub::merge_mr(host, path, pr_number).await?),
            // Mock:没有真 MR,合入就是 no-op 成功(不崩,不记账到别处)。
            Remote::Mock(_) => Ok(()),
        }
    }

    /// V1 Issue2 Phase2a: read back whether an open PR/MR exists for the
    /// issue's `bw/issue-<n>` branch — the InReview detection poller's
    /// query (读回为证: Workbench checks the remote itself, not agent self-report).
    /// Github: `gh pr list --head <branch> --state open` (delegates to
    /// [`github::open_pr_for_branch`]); codehub: `codehub-cli mr list
    /// --source-branch <branch> --state opened` (delegates to
    /// [`codehub::open_mr_for_branch`]). `Ok(None)` = no open PR/MR — the
    /// honest "nothing to review yet" answer. Read-only, zero side effects.
    pub async fn open_mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::open_pr_for_branch(r, branch).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::open_mr_for_branch(host, path, branch).await?)
            }
            // Mock:不开真 MR,所以「有没有开着的 MR」如实回 None。
            Remote::Mock(_) => Ok(None),
        }
    }

    /// 同 `open_mr_for_branch` 但查 all 状态(含已合入)。详情展示 / 已合入待关 issue 用。
    pub async fn mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::pr_for_branch(r, branch).await?),
            Remote::Codehub { host, path } => Ok(codehub::mr_for_branch(host, path, branch).await?),
            Remote::Mock(_) => Ok(None),
        }
    }

    // ─────────────── V4 issue 远端正本:issue 存取 ───────────────
    //
    // 六个方法都只做 provider 分发(github→`gh`、codehub→`codehub-cli`),不碰
    // SQLite、不改 store、不重写 app 层调用方——加性。词表(bw:status:* 等)
    // 由调用方塞进 `labels`,实现只透传、不硬编。

    /// 在远端仓里**真开一个 issue**,回它的项目内号(`iid`)。title/body/labels
    /// 原样透传;labels 空 = 不挂标签。调它会真在 codehub/github 仓里建一条
    /// issue,只在创建流调,绝不自动(「自动建活」建的也是本地活,远端正本
    /// 得人点)。对应 `gh issue create` / `codehub-cli issue create`。
    pub async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<u32, RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::create_issue(r, title, body, labels).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::create_issue(host, path, title, body, labels).await?)
            }
            Remote::Mock(state) => {
                let mut s = state.lock().expect("mock state 未中毒");
                let iid = s.next_iid();
                s.issues.insert(
                    iid,
                    MockIssue {
                        iid,
                        title: title.to_string(),
                        state: "opened".into(),
                        labels: labels.iter().map(|l| l.to_string()).collect(),
                        body: format!("【mock】{body}"),
                        comments: Vec::new(),
                        created_at: Some(now_iso()),
                        closed_at: None,
                        assignee: None,
                        author: None,
                    },
                );
                Ok(iid)
            }
        }
    }

    /// 改一张远端 issue 的标签和/或状态。`labels` 走 **namespace-replace**
    /// 语义:入参每个 label 的前缀([`label_prefix`]:`bw:status:todo` →
    /// `bw:status`)命中的现有 label 被摘掉,入参再全加上(裸 label 无前缀,
    /// 只加不摘)。调 `update_issue(iid, Some(&["bw:status:inprogress"]), None)`
    /// 只换 `bw:status:*`,`bw:week:*`/`bw:released:*` 不动。`labels=None`
    /// 不动标签,`state_event=None` 不动状态;两者都 `None` 是 no-op(直接
    /// `Ok(())`,不发调用)。两 provider 各自 list 一次现有 labels 再算
    /// (github 无 set-absolute 旗标、codehub 是全量替换,都得多 list 一次
    /// 换取 namespace 语义),实现细节留在各自的 `github.rs`/`codehub.rs`。
    pub async fn update_issue(
        &self,
        iid: u32,
        labels: Option<&[&str]>,
        state_event: Option<IssueStateEvent>,
    ) -> Result<(), RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::update_issue(r, iid, labels, state_event).await?),
            Remote::Codehub { host, path } => {
                let ev = state_event.map(|e| match e {
                    IssueStateEvent::Close => "close",
                    IssueStateEvent::Reopen => "reopen",
                });
                Ok(codehub::update_issue(host, path, iid, labels, ev).await?)
            }
            Remote::Mock(state) => {
                let mut s = state.lock().expect("mock state 未中毒");
                let i = s
                    .issues
                    .get_mut(&iid)
                    .ok_or_else(|| RemoteError::Mock(format!("issue #{iid} 不在")))?;
                if let Some(labels) = labels {
                    // 与真 provider 同一套 namespace-replace:入参前缀命中的现有
                    // label 摘掉,入参再全加上(去重)。裸 label(无冒号)只加不摘。
                    let prefixes: Vec<&str> =
                        labels.iter().filter_map(|l| label_prefix(l)).collect();
                    i.labels.retain(|x| match label_prefix(x) {
                        None => true,
                        Some(p) => !prefixes.contains(&p),
                    });
                    for l in filter_persistent_labels(labels) {
                        if !i.labels.iter().any(|x| x == l) {
                            i.labels.push(l.to_string());
                        }
                    }
                }
                if let Some(ev) = state_event {
                    match ev {
                        IssueStateEvent::Close => {
                            i.state = "closed".into();
                            if i.closed_at.is_none() {
                                i.closed_at = Some(now_iso());
                            }
                        }
                        IssueStateEvent::Reopen => {
                            i.state = "opened".into();
                        }
                    }
                }
                Ok(())
            }
        }
    }

    /// 按状态/标签过滤,读回一张只读的 issue 列表(读回为证: Workbench 直接问远端,
    /// 不靠谁自报)。`filter.state=None` 两态都要;`filter.labels` 取交集。对应
    /// `gh issue list --state --label --json` / `codehub-cli issue list --state
    /// --labels --jq`。无副作用。
    pub async fn list_issues(&self, filter: &IssueFilter) -> Result<Vec<RemoteIssue>, RemoteError> {
        match self {
            Remote::Github(r) => {
                let state = filter.state.map(|s| match s {
                    IssueState::Open => "open",
                    IssueState::Closed => "closed",
                });
                Ok(github::list_issues(r, state, &filter.labels).await?)
            }
            Remote::Codehub { host, path } => {
                let state = filter.state.map(|s| match s {
                    IssueState::Open => "opened",
                    IssueState::Closed => "closed",
                });
                Ok(codehub::list_issues(host, path, state, &filter.labels).await?)
            }
            Remote::Mock(state) => {
                let s = state.lock().expect("mock state 未中毒");
                let want_state = filter.state.map(|st| match st {
                    IssueState::Open => "opened",
                    IssueState::Closed => "closed",
                });
                let mut out = Vec::new();
                for i in s.issues.values() {
                    if let Some(ws) = want_state {
                        if i.state != ws {
                            continue;
                        }
                    }
                    // 取交集:issue 必须带齐入参里的每一条 label。
                    if !filter
                        .labels
                        .iter()
                        .all(|l| i.labels.iter().any(|x| x == l))
                    {
                        continue;
                    }
                    out.push(RemoteIssue {
                        iid: i.iid,
                        number: i.iid,
                        title: i.title.clone(),
                        state: i.state.clone(),
                        labels: i.labels.clone(),
                        // 与真 provider 一致:list 不带正文,要正文的走 view_issue。
                        body: String::new(),
                        created_at: i.created_at.clone(),
                        closed_at: i.closed_at.clone(),
                        assignee: i.assignee.clone(),
                        author: i.author.clone(),
                    });
                }
                out.sort_by_key(|r| r.iid);
                Ok(out)
            }
        }
    }

    /// 关一张远端 issue —— `update_issue(iid, None, Some(Close))` 的便捷封装,
    /// 没有第二条 shell-out 路径。codehub 走 `--state-event close`,github 走
    /// `gh issue close`。幂等:关一张已关的 issue 是 no-op 成功,不报错。
    pub async fn close_issue(&self, iid: u32) -> Result<(), RemoteError> {
        self.update_issue(iid, None, Some(IssueStateEvent::Close))
            .await
    }

    /// 单查一张远端 issue(带正文)。`list_issues` 的 `RemoteIssue` 不带正文,
    /// 要正文的调用方(如 run_issue 读 issue body)走这条。对应
    /// `gh issue view <n> --json title,body,state,labels` /
    /// `codehub-cli issue view <iid> --format json`。找不到返回 `Err`。
    pub async fn view_issue(&self, iid: u32) -> Result<RemoteIssue, RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::view_issue(r, iid).await?),
            Remote::Codehub { host, path } => Ok(codehub::view_issue(host, path, iid).await?),
            Remote::Mock(state) => {
                let s = state.lock().expect("mock state 未中毒");
                let i = s
                    .issues
                    .get(&iid)
                    .ok_or_else(|| RemoteError::Mock(format!("issue #{iid} 不在")))?;
                Ok(RemoteIssue {
                    iid: i.iid,
                    number: i.iid,
                    title: i.title.clone(),
                    state: i.state.clone(),
                    labels: i.labels.clone(),
                    body: i.body.clone(),
                    created_at: i.created_at.clone(),
                    closed_at: i.closed_at.clone(),
                    assignee: i.assignee.clone(),
                    author: i.author.clone(),
                })
            }
        }
    }

    /// 在 issue 上写一条评论(结构化产出挂评论,不动正文)。对应
    /// `gh issue comment <n> --repo <r> --body <text>` /
    /// `codehub-cli issue note create <iid> -p <path> -H <host> --body <text>`。
    pub async fn comment_issue(&self, iid: u32, body: &str) -> Result<(), RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::comment_issue(r, iid, body).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::comment_issue(host, path, iid, body).await?)
            }
            Remote::Mock(state) => {
                let mut s = state.lock().expect("mock state 未中毒");
                let i = s
                    .issues
                    .get_mut(&iid)
                    .ok_or_else(|| RemoteError::Mock(format!("issue #{iid} 不在")))?;
                i.comments.push(format!("【mock】{body}"));
                Ok(())
            }
        }
    }

    /// 读 issue 评论正文,旧的在前。系统备注不进。
    pub async fn list_issue_comments(&self, iid: u32) -> Result<Vec<String>, RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::list_issue_comments(r, iid).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::list_issue_comments(host, path, iid).await?)
            }
            Remote::Mock(state) => {
                let s = state.lock().expect("mock state 未中毒");
                let i = s
                    .issues
                    .get(&iid)
                    .ok_or_else(|| RemoteError::Mock(format!("issue #{iid} 不在")))?;
                Ok(i.comments.clone())
            }
        }
    }

    /// 在远端仓里发一个版本(release)——打 tag + 带 title/body。对应
    /// `gh release create <tag> --title --notes` /
    /// `codehub-cli release create --tag-name --name --description --ref`。
    /// codehub 的 `--ref` 取 `project view` 默认分支;GitHub 的 `gh` 自己打,不传。
    /// 只在发版流调,绝不自动。tag 已存在时远端如实报错,不假装成功。
    pub async fn create_release(
        &self,
        tag: &str,
        title: &str,
        body: &str,
    ) -> Result<(), RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::create_release(r, tag, title, body).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::create_release(host, path, tag, title, body).await?)
            }
            // Mock:幂等 —— 同 tag 不重复加。真远端 tag 已存在会如实报错,这里不
            // 报错(mock 没有「远端真有这个 tag」的运行时错这条,幂等更利于
            // 指挥器重跑不产生重复数据)。
            Remote::Mock(state) => {
                let mut s = state.lock().expect("mock state 未中毒");
                if !s.releases.iter().any(|r| r == tag) {
                    s.releases.push(tag.to_string());
                }
                Ok(())
            }
        }
    }

    /// 读回远端仓里所有版本的 tag 列表(读回为证: 走势图/发版回顾要的真数)。
    /// 对应 `gh release list --json tagName` / `codehub-cli release list --jq`。
    /// 只回 tag 串,正文/资源数留给上层另查。无副作用。
    pub async fn list_releases(&self) -> Result<Vec<String>, RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::list_releases(r).await?),
            Remote::Codehub { host, path } => Ok(codehub::list_releases(host, path).await?),
            Remote::Mock(state) => {
                let s = state.lock().expect("mock state 未中毒");
                Ok(s.releases.clone())
            }
        }
    }

    /// 周标签的投影：codehub 建/复用标题=`week` 的里程碑并挂上 issue。
    /// `week` 空 = 从里程碑摘下。不当正本。GitHub 臂诚实不投。
    pub async fn project_week(
        &self,
        iid: u32,
        week: &str,
        start: &str,
        due: &str,
    ) -> Result<(), RemoteError> {
        match self {
            Remote::Codehub { host, path } => {
                Ok(codehub::project_week(host, path, iid, week, start, due).await?)
            }
            Remote::Github(_) | Remote::Mock(_) => Ok(()),
        }
    }

    /// 当前登录用户名(给「我的」筛选用)。认不出返 None。
    pub async fn current_user(&self) -> Option<String> {
        match self {
            Remote::Codehub { host, .. } => codehub::current_user(host).await,
            Remote::Github(r) => github::current_user(r).await.ok(),
            Remote::Mock(_) => None,
        }
    }

    /// 列出所有里程碑 (title, start, due)。左栏版本组用:扫一遍,标题不是
    /// 周格式的就是自定义版本。GitHub/mock 不投(返空)。
    pub async fn list_milestones(
        &self,
        path: &str,
    ) -> Result<Vec<(String, String, String)>, RemoteError> {
        match self {
            Remote::Codehub { host, .. } => Ok(codehub::list_milestones(host, path).await?),
            Remote::Github(_) | Remote::Mock(_) => Ok(Vec::new()),
        }
    }

    /// 建/复用一个版本里程碑,返回 mid。GitHub 臂诚实不投(返 0)。
    pub async fn ensure_plan_milestone(
        &self,
        path: &str,
        name: &str,
        start: &str,
        due: &str,
    ) -> Result<u64, RemoteError> {
        match self {
            Remote::Codehub { host, .. } => {
                Ok(codehub::ensure_plan_milestone(host, path, name, start, due).await?)
            }
            Remote::Github(_) | Remote::Mock(_) => Ok(0),
        }
    }

    /// 把 issue 挂到已存在的版本里程碑(best-effort 镜像)。GitHub/mock 不投。
    pub async fn project_plan(&self, iid: u32, path: &str, name: &str) -> Result<(), RemoteError> {
        match self {
            Remote::Codehub { host, .. } => Ok(codehub::project_plan(host, path, iid, name).await?),
            Remote::Github(_) | Remote::Mock(_) => Ok(()),
        }
    }

    /// 从里程碑摘下(镜像)。GitHub/mock 不投。
    pub async fn clear_issue_milestone(&self, iid: u32) -> Result<(), RemoteError> {
        match self {
            Remote::Codehub { host, path } => {
                Ok(codehub::clear_issue_milestone(host, path, iid).await?)
            }
            Remote::Github(_) | Remote::Mock(_) => Ok(()),
        }
    }

    /// 按标题删版本里程碑。找不到当成功。GitHub/mock 不投。
    pub async fn delete_plan_milestone(&self, path: &str, name: &str) -> Result<(), RemoteError> {
        match self {
            Remote::Codehub { host, .. } => {
                Ok(codehub::delete_plan_milestone(host, path, name).await?)
            }
            Remote::Github(_) | Remote::Mock(_) => Ok(()),
        }
    }

    /// 改 issue 责任人。空串 = 取消指派。
    pub async fn set_issue_assignee(&self, iid: u32, assignee: &str) -> Result<(), RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::set_issue_assignee(r, iid, assignee).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::set_issue_assignee(host, path, iid, assignee).await?)
            }
            Remote::Mock(state) => {
                let mut s = state.lock().expect("mock state 未中毒");
                let i = s
                    .issues
                    .get_mut(&iid)
                    .ok_or_else(|| RemoteError::Mock(format!("issue #{iid} 不在")))?;
                i.assignee = if assignee.is_empty() {
                    None
                } else {
                    Some(assignee.to_string())
                };
                Ok(())
            }
        }
    }

    /// 改 issue 标题与正文。
    pub async fn edit_issue(&self, iid: u32, title: &str, body: &str) -> Result<(), RemoteError> {
        match self {
            Remote::Github(r) => Ok(github::edit_issue(r, iid, title, body).await?),
            Remote::Codehub { host, path } => {
                Ok(codehub::edit_issue(host, path, iid, title, body).await?)
            }
            Remote::Mock(state) => {
                let mut s = state.lock().expect("mock state 未中毒");
                let i = s
                    .issues
                    .get_mut(&iid)
                    .ok_or_else(|| RemoteError::Mock(format!("issue #{iid} 不在")))?;
                i.title = title.to_string();
                i.body = body.to_string();
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{filter_persistent_labels, is_empty_namespace_label, label_prefix};

    #[test]
    fn empty_week_label_is_empty_namespace() {
        assert_eq!(label_prefix("bw:week:"), Some("bw:week"));
        assert!(is_empty_namespace_label("bw:week:"));
        assert!(!is_empty_namespace_label("bw:week:2026-W35"));
        assert_eq!(
            filter_persistent_labels(&["bw:week:", "bw:status:todo"]).collect::<Vec<_>>(),
            vec!["bw:status:todo"]
        );
    }
}
