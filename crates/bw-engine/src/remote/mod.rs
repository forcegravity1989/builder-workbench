mod codehub;
mod github;
mod mock;

pub use mock::MockState;

use std::{
    path::Path,
    sync::{Arc, Mutex},
};

pub const PROJECT_FILE_REL_PATH: &str = ".bw/project.toml";

/// 区分本次创建与复用的 PR/MR，避免失败清理时删除既有请求。
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

#[derive(Debug, thiserror::Error)]
pub enum RemoteError {
    #[error("{cli} 未安装或不在 PATH")]
    NotInstalled { cli: &'static str },
    #[error("{0}")]
    Cli(String),
    #[error("未知 provider(既非 github 也非 codehub):{0}")]
    UnknownProvider(String),
    #[error("mock:{0}")]
    Mock(String),
}

/// 远端 open/closed 状态，与 Workbench 的工作状态区分。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IssueState {
    Open,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IssueStateEvent {
    Close,
    Reopen,
}

/// state 为 None 时查询全部状态；labels 取交集。
#[derive(Clone, Debug, Default)]
pub struct IssueFilter {
    pub state: Option<IssueState>,
    pub labels: Vec<String>,
}

/// iid 是项目内号，number 是平台全局号；GitHub 中两者相同。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteIssue {
    pub iid: u32,
    pub number: u32,
    pub title: String,
    pub state: String,
    pub labels: Vec<String>,
    pub body: String,
    pub created_at: Option<String>,
    pub closed_at: Option<String>,
    pub assignee: Option<String>,
    pub author: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RepoSummary {
    /// `"owner/repo"`(github)/ `"org/repo"`(codehub)。
    pub path: String,
    /// 私有仓。codehub 只有明写 `private` 才算私有,拿不准就是 `false`(不画锁)。
    pub private: bool,
    pub description: String,
    /// 默认分支名(如 `main`);空 = 空仓无提交这类边缘情况下拿不到,如实留白。
    pub default_branch: String,
    /// 最近一次 push 的 ISO8601 时刻;空 = 远端未回,不臆造一个时间。
    pub pushed_at: String,
}

pub type Milestone = (String, String, String, String);

/// truncated 表示可能达到查询上限，调用方不得将结果视为完整统计。
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

pub(crate) fn is_empty_namespace_label(label: &str) -> bool {
    label.rsplit_once(':').is_some_and(|(_, v)| v.is_empty())
}

pub(crate) fn filter_persistent_labels<'a>(labels: &'a [&'a str]) -> impl Iterator<Item = &'a str> {
    labels
        .iter()
        .copied()
        .filter(|l| !is_empty_namespace_label(l))
}

/// 平台差异由各实现处理；接口仅使用通用参数和返回值。
#[async_trait::async_trait]
pub trait RemoteProvider: Send + Sync + std::fmt::Debug {
    /// 平台名称仅用于日志与错误信息，调用方不据此分派业务。
    fn kind(&self) -> &'static str;

    /// 分支须已推送；不自动追加关闭 issue 的关键字，完成由用户决定。
    async fn create_mr_on_branch(
        &self,
        workspace: &Path,
        branch: &str,
        title: &str,
        body: &str,
    ) -> Result<PrOpened, RemoteError>;

    /// 合入失败返回错误，调用方不得继续标记完成。
    async fn merge_mr(&self, mr_number: u32) -> Result<(), RemoteError>;

    async fn open_mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError>;

    async fn mr_for_branch(&self, branch: &str) -> Result<Option<u32>, RemoteError>;

    /// 返回远端项目内 issue 编号，标题、正文和标签原样传入。
    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<u32, RemoteError>;

    /// 平台无附件能力时忽略附件，不能报告为已上传。
    async fn create_issue_with_attachment(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
        attachment: Option<&Path>,
    ) -> Result<u32, RemoteError>;

    /// 按入参标签的命名空间替换旧值；裸标签只添加。
    async fn update_issue(
        &self,
        iid: u32,
        labels: Option<&[&str]>,
        state_event: Option<IssueStateEvent>,
    ) -> Result<(), RemoteError>;

    /// 列表不带正文，详情通过 view_issue 单独查询。
    async fn list_issues(&self, filter: &IssueFilter) -> Result<Vec<RemoteIssue>, RemoteError>;

    async fn view_issue(&self, iid: u32) -> Result<RemoteIssue, RemoteError>;

    async fn comment_issue(&self, iid: u32, body: &str) -> Result<(), RemoteError>;

    async fn list_issue_comments(&self, iid: u32) -> Result<Vec<String>, RemoteError>;

    async fn set_issue_assignee(&self, iid: u32, assignee: &str) -> Result<(), RemoteError>;

    async fn edit_issue(&self, iid: u32, title: &str, body: &str) -> Result<(), RemoteError>;

    /// 关闭统一使用 update_issue，避免各实现出现不同语义。
    async fn close_issue(&self, iid: u32) -> Result<(), RemoteError> {
        self.update_issue(iid, None, Some(IssueStateEvent::Close))
            .await
    }

    async fn create_release(&self, tag: &str, title: &str, body: &str) -> Result<(), RemoteError>;

    async fn list_releases(&self) -> Result<Vec<String>, RemoteError>;

    async fn current_user(&self) -> Option<String>;

    // 里程碑是可选的远端镜像，不支持时默认不执行。

    async fn list_milestones(&self) -> Result<Vec<Milestone>, RemoteError> {
        Ok(Vec::new())
    }

    async fn ensure_plan_milestone(
        &self,
        name: &str,
        start: &str,
        due: &str,
    ) -> Result<u64, RemoteError> {
        let _ = (name, start, due);
        Ok(0)
    }

    async fn project_plan(&self, iid: u32, name: &str) -> Result<(), RemoteError> {
        let _ = (iid, name);
        Ok(())
    }

    async fn clear_issue_milestone(&self, iid: u32) -> Result<(), RemoteError> {
        let _ = iid;
        Ok(())
    }

    async fn delete_plan_milestone(&self, name: &str) -> Result<(), RemoteError> {
        let _ = name;
        Ok(())
    }

    async fn rename_plan_milestone(&self, from: &str, to: &str) -> Result<(), RemoteError> {
        let _ = (from, to);
        Ok(())
    }

    async fn rename_plan_label(&self, from_label: &str, to_label: &str) -> Result<(), RemoteError> {
        let _ = (from_label, to_label);
        Ok(())
    }

    /// 已合入 MR 的合入时刻(RFC3339 原文),全史一趟。
    async fn merged_mr_times(&self) -> Result<Capped<String>, RemoteError>;

    /// 每张 issue 的 `(建立时刻, 关闭时刻)`(RFC3339 原文),全史一趟。开着的
    /// 第二项是 `None`。「某时刻还开着多少」= 建过的减去关掉的,所以它天然可回溯。
    async fn issue_times(&self) -> Result<Capped<(String, Option<String>)>, RemoteError>;

    async fn list_repos(&self, limit: u32) -> Result<Vec<RepoSummary>, RemoteError>;

    /// 区分仓库不存在与仓库内没有项目约定文件。
    async fn probe_repo(&self, path: &str) -> Result<String, RemoteError>;

    /// 返回项目文件原文，由上层解析；None 表示文件不存在。
    async fn fetch_project_toml(
        &self,
        path: &str,
        git_ref: &str,
    ) -> Result<Option<String>, RemoteError>;

    async fn clone_repo(&self, path: &str, dest: &Path) -> Result<(), RemoteError>;
}

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

    pub fn for_host(provider: &str, host: &str) -> Result<Self, RemoteError> {
        Self::for_project(provider, host, "")
    }

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
