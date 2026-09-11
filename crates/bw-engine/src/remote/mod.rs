//! 远端 —— 一个基类,两个派生。
//!
//! 「远端」是一件事:一个仓,能读写它的 issue、开合它的 MR、发它的版本。
//! [`RemoteProvider`] 是这件事的**基类**(接口),它一个字都不提 GitHub 和
//! codehub;[`github::GithubRemote`] 与 [`codehub::CodehubRemote`] 是两个**派生**
//! 实现,各自把接口翻译成自己那条 CLI 的方言,再加一个 [`mock::MockRemote`]
//! 当 headless 指挥器/测试的替身。调用方经 [`Remote`] 拿到一个基类对象,只调
//! 方法,**永远不知道背后是哪一个**。
//!
//! ## 两条线为什么必须隔离
//!
//! 两个平台的 CLI 方言差得很远,而且各自还在变:字段名(`gh` 的 issue 只有复数
//! `assignees`,GitLab 那边是单数 `assignee` 对象)、状态原文(`"OPEN"` vs
//! `"opened"`)、有没有某个旗标(`--attachment` 只有 codehub 有)、里程碑投不
//! 投。这些**都不该翻过墙**。以前它们翻过:`codehub.rs` 反过来 `use` 了
//! `github::PrOpened`,分支名和 git 地址这些跟平台无关的东西也住在 `github.rs`
//! 里,于是半个仓为了拿一个分支名要 `use bw_engine::github`;调用方(走势、接入
//! 流、clone)自己写 `if github { … } else { … }`,同一段统计数学抄了两遍。结果
//! 是改一边很容易碰坏另一边,而两边的差异也没人守得住。
//!
//! 现在的隔离靠三件事,前两件是编译器管的,不靠自觉:
//!
//! 1. **两臂是本模块的私有子模块**(`mod github;` / `mod codehub;`,不是 `pub`)。
//!    `bw_engine::github::…` 这条路径不再存在 —— 外面拿不到,也就绕不过基类。
//! 2. **基类不认识派生**:[`RemoteError`] 不再内嵌两个平台各自的错误类型,只留
//!    provider 中立的形状;两臂各自把自家错误翻成它。
//! 3. **两臂互不相识**:`github.rs` 里不许出现 codehub,反之亦然;共用的东西
//!    (如 [`PrOpened`])住在这份基类里。`scripts/guard-remote-isolation.sh` 守这条。
//!
//! 平台无关的东西一律不放两臂:分支名与 git 远端地址在 [`crate::workspace`],
//! 名片路径与 [`PrOpened`] 在这里。

mod codehub;
mod github;
mod mock;

pub use mock::MockState;

use std::{
    path::Path,
    sync::{Arc, Mutex},
};

/// 项目名片在仓里的相对路径。底座只拿它拼远端 API 的 URL,**不解析这份文件**
/// —— 解析是上层的事(`bw` 有自己的一份)。
pub const PROJECT_FILE_REL_PATH: &str = ".bw/project.toml";

/// P7-7A: distinguishes a brand-new PR from one `open_pr` merely *adopted*
/// because the executor already opened it itself (executors are allowed
/// `gh pr create` — only `gh pr merge` is disallowed,`claude_cli.rs`'s
/// `--disallowedTools`). Both carry a **real, read-back** PR number — the
/// `Adopted` case is never guessed or constructed, it comes from a fresh
/// `gh pr view` on the branch. Callers that don't care about the distinction
/// can match `Created(n) | Adopted(n) => n`; `run_issue_now` uses it to emit
/// an honest toast ("已提 PR" vs "已认领队友提的 PR") instead of blurring the
/// two into one message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PrOpened {
    Created(u32),
    Adopted(u32),
}

impl PrOpened {
    pub fn number(self) -> u32 {
        match self {
            PrOpened::Created(n) | PrOpened::Adopted(n) => n,
        }
    }
}

/// 远端出的错。**provider 中立** —— 基类不认识 `GithubError` / `CodehubError`
/// 这两个派生类的类型(它们是私有的),两臂各自把自家错误翻成这里的形状。
/// 谁也别在这上面按 provider 分支:要分平台就说明抽象没抽对。
#[derive(Debug, thiserror::Error)]
pub enum RemoteError {
    /// 那条 CLI 没装、或者不在 PATH。`cli` 是命令名(`gh` / `codehub-cli`),
    /// 人一看就知道该去装哪个。
    #[error("{cli} 未安装或不在 PATH")]
    NotInstalled { cli: &'static str },
    /// CLI 报的错,`0` 是**它的原话**,一个字不改地端给人看 —— 多半是没登录、
    /// 地址错、或者权限不够,这三件事人看原话就知道该干嘛。
    #[error("{0}")]
    Cli(String),
    /// [`Remote::for_project`] 收到一个既非 `github` 也非 `codehub` 的 provider
    /// 串 —— 这是配置错,不是哪个平台的运行时错,所以独立一条,不冒充别人。
    #[error("未知 provider(既非 github 也非 codehub):{0}")]
    UnknownProvider(String),
    /// mock 远端的运行时错。只用来如实回「找不到这张 issue」这类 —— mock 的全部
    /// 状态在内存里,正常路径不会报错;报错只可能是调用方拿了一个不存在的 iid,
    /// 那是调用方错,如实弹回,不静默。
    #[error("mock:{0}")]
    Mock(String),
}

// ─────────────── issue 远端正本:provider 中立的 DTO ───────────────
//
// issue 的状态/排期/版本正本在 codehub/GitHub 的 issue + 标签,本地零库。下面
// 这些类型是**基类的词汇表**:两个派生各自构造同一个 [`RemoteIssue`],接口只
// 透传 `labels: &[&str]`,**不硬编词表**(状态 `bw:status:*` / 排期 `bw:plan:*` /
// 发版 `bw:released:*` / 类别 `bw:category:*` 都是调用方的事)。`IssueState` 故意
// 不碰 bw 的 `IssueStatus`(那是活的完整生命周期状态机,这里只是远端 issue 的
// 开/关二态)。

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
/// 结清」这两条靠它们进得来。不归一化成时间戳,解析是上层的事。
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
    /// 责任人。`None` = 未指派/认不出。正本在远端。
    pub assignee: Option<String>,
    /// 提出人。`None` = 认不出。正本在远端。
    pub author: Option<String>,
}

/// 一个仓的只读概要(接入流「列我账号下的仓」用)。**两个平台各自的字段形状
/// 不一样**(github 是 `owner` + `repo` + 布尔 `private`,codehub 是一个 `path`
/// 加 `visibility` 字符串),归一化在各自那一臂里做完 —— 界面拿到的永远是这一份。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoSummary {
    /// `"owner/repo"`(github)/ `"org/repo"`(codehub)。
    pub path: String,
    /// 私有仓。codehub 只有明写 `private` 才算私有,拿不准就是 `false`(不画锁)。
    pub private: bool,
    /// 仓描述原文;空串 = 仓本身没填(真实状态),不是「没取到」。
    pub description: String,
    /// 默认分支名(如 `main`);空 = 空仓无提交这类边缘情况下拿不到,如实留白。
    pub default_branch: String,
    /// 最近一次 push 的 ISO8601 时刻;空 = 远端未回,不臆造一个时间。
    pub pushed_at: String,
}

/// 一个版本里程碑:`(标题, 起, 止, 建立时刻)`。每个标题都是一个版本。
pub type Milestone = (String, String, String, String);

/// 一趟拉回来的时序读数,外加**这趟可能没拉全**的标记。
///
/// `truncated=true` 的意思是「拿回来的条数正好顶到那条 CLI 的上限」——**这时候
/// 宁可整条线不画,也不端一个少算的数出去**。判不判、怎么说,是调用方的事;
/// 底座只如实报「顶到了」。`gh` 有 1000 条上限,`codehub-cli -l 0` 全量拉,所以
/// codehub 那臂恒 `false` —— 这不是特殊照顾,是它真的没截。
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Capped<T> {
    pub rows: Vec<T>,
    pub truncated: bool,
}

/// 算一个 label 的 namespace 前缀(不含末尾冒号):`bw:status:todo` →
/// `Some("bw:status")`,`bug`(无冒号)→ `None`。只做字符串切分,**不硬编
/// `bw:*` 词表**。调 `update_issue` 时用它实现 namespace-replace 语义:
/// 把 issue 现有 labels 里、前缀落在入参前缀集合中的摘掉,再把入参全加上
/// (裸 label 无前缀,只加不摘)。两个派生各自实现里 list 一次现有 labels 再算
/// (github 无 set-absolute 旗标、codehub 是全量替换,都得多 list 一次换取
/// namespace 语义)。
pub(crate) fn label_prefix(label: &str) -> Option<&str> {
    label.rsplit_once(':').map(|(p, _)| p)
}

/// `bw:week:` 这种「前缀在、值空」= 只摘这个命名空间,不加回去。
/// 排期移回待办池走这条,避免留下一张空的 `bw:week:` 标签。
pub(crate) fn is_empty_namespace_label(label: &str) -> bool {
    label.rsplit_once(':').is_some_and(|(_, v)| v.is_empty())
}

/// 写入时跳过空后缀标签(它们只贡献 [`label_prefix`] 用来摘旧值)。
/// 三个实现加标签都走这里,改一处即可。
pub(crate) fn filter_persistent_labels<'a>(labels: &'a [&'a str]) -> impl Iterator<Item = &'a str> {
    labels
        .iter()
        .copied()
        .filter(|l| !is_empty_namespace_label(l))
}

// ─────────────── 基类 ───────────────

/// 一个远端仓能干的全部事情 —— **基类**。
///
/// 三条规矩,加派生实现时照着守:
///
/// 1. **接口里不许出现平台名**。参数、返回值、错误一律是本模块的中立类型;
///    某个平台特有的旗标(codehub 的 `--attachment`)在实现里消化掉,别往上冒。
/// 2. **不支持就如实不做,不假装**。里程碑投影只有 codehub 有,GitHub 那臂
///    返回空/`Ok(())`(默认实现就是这个),**不是**报错、更不是伪造一个 mid。
/// 3. **原话不加工**。CLI 报错原样进 [`RemoteError::Cli`],别翻译、别吞。
#[async_trait::async_trait]
pub trait RemoteProvider: Send + Sync + std::fmt::Debug {
    /// 这一臂是谁 —— `"github"` / `"codehub"` / `"mock"`。**只给日志和错误文案
    /// 用**;调用方拿它去分支就等于把耦合搬回去了,别这么干。
    fn kind(&self) -> &'static str;

    // ── MR ──

    /// 在**已经推上去的分支**上开 PR/MR —— 不替调用方 `git add -A` 提交,分支上
    /// 有什么就提什么;正文也由调用方给,**不自动挂 `Closes #<n>`**(活是本机连
    /// 续号,和远端 issue 号没有对应关系,拼一句 `Closes #3` 会去关掉那个仓里毫
    /// 不相干的第 3 号 issue)。**绝不合入** —— 合入永远是人点的那一下。
    async fn create_mr_on_branch(
        &self,
        workspace: &Path,
        branch: &str,
        title: &str,
        body: &str,
    ) -> Result<PrOpened, RemoteError>;

    /// 合入开着的那个 MR(squash)。两个调用方语义不同:`MergeIssuePr` 是**人的
    /// 验收动作**(一键合入 → 调用方结清 Done),出错时活停在待评审可重试,绝不
    /// 伪造、绝不反向结清;`.bw/project.toml` 那个配置 MR 才自动合(名片是配置不
    /// 是活,自动合它不破坏「完成永不自动」)。
    async fn merge_mr(&self, mr_number: u32) -> Result<(), RemoteError>;

    /// 读回这条分支上**开着的** MR 号 —— 待评审检测靠它(读回为证:Workbench 自己
    /// 问远端,不听 agent 自报)。`Ok(None)` = 还没有,如实回。只读,零副作用。
    async fn open_mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError>;

    /// 同上但查全状态(含已合入)。详情展示 / 已合入待关 issue 用。
    async fn mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError>;

    // ── issue ──

    /// 在远端仓里**真开一个 issue**,回它的项目内号(`iid`)。title/body/labels
    /// 原样透传;labels 空 = 不挂标签。只在创建流调,绝不自动。
    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<u32, RemoteError>;

    /// 建 issue 并可附一份本机文件。有对等能力的臂真附;没有的**忽略附件**
    /// (正文里应写清文件在哪),不报错也不假装附上了。
    async fn create_issue_with_attachment(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
        attachment: Option<&Path>,
    ) -> Result<u32, RemoteError>;

    /// 改一张远端 issue 的标签和/或状态。`labels` 走 **namespace-replace** 语义:
    /// 入参每个 label 的前缀([`label_prefix`])命中的现有 label 被摘掉,入参再全
    /// 加上(裸 label 无前缀,只加不摘)。`labels=None` 不动标签,`state_event=None`
    /// 不动状态;两者都 `None` 是 no-op。
    async fn update_issue(
        &self,
        iid: u32,
        labels: Option<&[&str]>,
        state_event: Option<IssueStateEvent>,
    ) -> Result<(), RemoteError>;

    /// 按状态/标签过滤读回 issue 列表(读回为证)。`filter.state=None` 两态都要;
    /// `filter.labels` 取交集。不带正文 —— 要正文走 [`Self::view_issue`]。无副作用。
    async fn list_issues(&self, filter: &IssueFilter) -> Result<Vec<RemoteIssue>, RemoteError>;

    /// 单查一张远端 issue(**带正文**)。找不到返回 `Err`。
    async fn view_issue(&self, iid: u32) -> Result<RemoteIssue, RemoteError>;

    /// 在 issue 上写一条评论(结构化产出挂评论,不动正文)。
    async fn comment_issue(&self, iid: u32, body: &str) -> Result<(), RemoteError>;

    /// 读 issue 评论正文,旧的在前。系统备注不进。
    async fn list_issue_comments(&self, iid: u32) -> Result<Vec<String>, RemoteError>;

    /// 改 issue 责任人。空串 = 取消指派。
    async fn set_issue_assignee(&self, iid: u32, assignee: &str) -> Result<(), RemoteError>;

    /// 改 issue 标题与正文。
    async fn edit_issue(&self, iid: u32, title: &str, body: &str) -> Result<(), RemoteError>;

    /// 关一张远端 issue。**没有第二条 shell-out 路径** —— 就是
    /// `update_issue(iid, None, Close)`,所以派生类不许改写它。幂等:关一张已关的
    /// issue 是 no-op 成功,不报错。
    async fn close_issue(&self, iid: u32) -> Result<(), RemoteError> {
        self.update_issue(iid, None, Some(IssueStateEvent::Close))
            .await
    }

    // ── 版本 ──

    /// 在远端仓里发一个版本(release)—— 打 tag + 带 title/body。只在发版流调,
    /// 绝不自动。tag 已存在时远端如实报错,不假装成功。
    async fn create_release(&self, tag: &str, title: &str, body: &str) -> Result<(), RemoteError>;

    /// 读回远端仓里所有版本的 tag 列表(走势图/发版回顾要的真数)。无副作用。
    async fn list_releases(&self) -> Result<Vec<String>, RemoteError>;

    /// 当前登录用户名(给「我的」筛选用)。认不出返 `None`。
    async fn current_user(&self) -> Option<String>;

    // ── 版本里程碑投影 ──
    //
    // 只有 codehub 这一臂真投(`bw:plan:<名>` 之外顺带镜像一个同名里程碑,**不当
    // 正本**,失败不回滚标签)。别的臂**如实不投**:下面这些默认实现就是「不投」,
    // 派生类不需要写空壳,也不会因为忘了写而报错。

    /// 列出所有里程碑。不投的臂返空。
    async fn list_milestones(&self) -> Result<Vec<Milestone>, RemoteError> {
        Ok(Vec::new())
    }

    /// 建/复用一个版本里程碑,返回 mid。不投的臂**诚实返 0**,不伪造。
    async fn ensure_plan_milestone(
        &self,
        name: &str,
        start: &str,
        due: &str,
    ) -> Result<u64, RemoteError> {
        let _ = (name, start, due);
        Ok(0)
    }

    /// 把 issue 挂到已存在的版本里程碑(best-effort 镜像)。
    async fn project_plan(&self, iid: u32, name: &str) -> Result<(), RemoteError> {
        let _ = (iid, name);
        Ok(())
    }

    /// 从里程碑摘下(镜像)。
    async fn clear_issue_milestone(&self, iid: u32) -> Result<(), RemoteError> {
        let _ = iid;
        Ok(())
    }

    /// 按标题删版本里程碑。找不到当成功。
    async fn delete_plan_milestone(&self, name: &str) -> Result<(), RemoteError> {
        let _ = name;
        Ok(())
    }

    /// 改版本里程碑标题。
    async fn rename_plan_milestone(&self, from: &str, to: &str) -> Result<(), RemoteError> {
        let _ = (from, to);
        Ok(())
    }

    /// 改 `bw:plan:` 标签定义名。
    async fn rename_plan_label(&self, from_label: &str, to_label: &str) -> Result<(), RemoteError> {
        let _ = (from_label, to_label);
        Ok(())
    }

    // ── 走势时序 ──
    //
    // **一趟拉全、上层按窗分桶**,不按周去查(逐窗查会把全史遍历次数乘上窗数)。
    // 分桶的数学在 `bw::trend` 里**只有一份** —— 两个平台回的是同一种原文时刻,
    // 没有任何理由抄两遍。

    /// 已合入 MR 的合入时刻(RFC3339 原文),全史一趟。
    async fn merged_mr_times(&self) -> Result<Capped<String>, RemoteError>;

    /// 每张 issue 的 `(建立时刻, 关闭时刻)`(RFC3339 原文),全史一趟。开着的
    /// 第二项是 `None`。「某时刻还开着多少」= 建过的减去关掉的,所以它天然可回溯。
    async fn issue_times(&self) -> Result<Capped<(String, Option<String>)>, RemoteError>;

    // ── 主机级(接入流:仓还没定下来,所以 path 是参数不是 self)──

    /// 列「我账号下的仓」。列不出来把 CLI 原话端回去 —— 多半是没装、没登录、或
    /// 者区/域名填错,这三件事人一看原话就知道该干嘛。
    async fn list_repos(&self, limit: u32) -> Result<Vec<RepoSummary>, RemoteError>;

    /// 探一个仓在不在(接入流用它把「仓不存在」和「仓在、只是没接管过」分开 ——
    /// 地址敲错一个字母和没接管过在平台那边是同一个 404)。回一句可见性/状态原文。
    async fn probe_repo(&self, path: &str) -> Result<String, RemoteError>;

    /// 读某个仓远端的 `.bw/project.toml` **原文**。`Ok(None)` = 平台说没这份文件。
    /// 底座**不解析**它(不认识业务文件格式),解析是上层的事。
    async fn fetch_project_toml(
        &self,
        path: &str,
        git_ref: &str,
    ) -> Result<Option<String>, RemoteError>;

    /// 把仓 clone 到 `dest`。clone 自己会建目录。
    async fn clone_repo(&self, path: &str, dest: &Path) -> Result<(), RemoteError>;
}

// ─────────────── 门面 ───────────────

/// 调用方手里的远端句柄 —— 一个基类对象。
///
/// 拿法:[`Remote::for_project`](绑定到某个项目的仓)或 [`Remote::for_host`]
/// (接入流,仓还没选)。**不许 `match` 它**:它没有变体可以 match,这正是重点。
/// 想按平台做不同的事,说明该在 [`RemoteProvider`] 上加一个方法。
#[derive(Clone)]
pub struct Remote(Arc<dyn RemoteProvider>);

impl std::ops::Deref for Remote {
    type Target = dyn RemoteProvider;
    fn deref(&self) -> &Self::Target {
        &*self.0
    }
}

impl std::fmt::Debug for Remote {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Remote({})", self.0.kind())
    }
}

impl Remote {
    /// 从项目存的那三元组(`provider` / `remote_host` / `remote_path`)造一个。
    /// `provider="github"`(或存量行的空串)→ GitHub 臂;`"codehub"` → codehub 臂;
    /// `"mock"` → 一份**新建的** mock 状态(无 factory 注入时的兜底,适合单发测试;
    /// 指挥器要跨调用共享状态走 [`Remote::mock`])。认不出的 provider ⇒ `Err`。
    ///
    /// 调用方在此之前先判 `remote_path` 空不空(那是诚实的「没挂远端」),空路径
    /// 走到这里是调用方的 bug,不是一个安静的 `Ok`。
    pub fn for_project(provider: &str, host: &str, path: &str) -> Result<Self, RemoteError> {
        let path = path.trim();
        match provider.trim() {
            "github" | "" => Ok(Self(Arc::new(github::GithubRemote::new(path)))),
            "codehub" => Ok(Self(Arc::new(codehub::CodehubRemote::new(
                host.trim(),
                path,
            )))),
            "mock" => Ok(Self::mock(Arc::new(Mutex::new(MockState::default())))),
            other => Err(RemoteError::UnknownProvider(other.to_string())),
        }
    }

    /// 接入流用:仓还没选定,只知道去哪个平台/哪个区问。主机级那几个方法
    /// (`list_repos` / `probe_repo` / `fetch_project_toml` / `clone_repo`)把仓
    /// 路径当参数收,所以这里绑一个空仓路径没问题;仓级方法别拿这个句柄调。
    pub fn for_host(provider: &str, host: &str) -> Result<Self, RemoteError> {
        Self::for_project(provider, host, "")
    }

    /// 用**共享的**那份 mock 状态造一个替身远端。`App` 的 `remote_factory` 注入
    /// 同一个 `Arc`,「建活 → 列活 → 改状态 → 关」一整圈才共享同一份状态,和真远
    /// 端一次会话连续操作的行为一致。
    pub fn mock(state: Arc<Mutex<MockState>>) -> Self {
        Self(Arc::new(mock::MockRemote::new(state)))
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
