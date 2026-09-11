use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
};

use super::{
    filter_persistent_labels, label_prefix, Capped, IssueFilter, IssueState, IssueStateEvent,
    Milestone, PrOpened, RemoteError, RemoteIssue, RemoteProvider, RepoSummary,
};

#[derive(Default, Debug)]
pub struct MockState {
    issues: HashMap<u32, MockIssue>,
    /// 下一个 iid。从 1 起(0 不是合法 issue 号)。
    next_iid: u32,
    releases: Vec<String>,
}

impl MockState {
    fn next_iid(&mut self) -> u32 {
        self.next_iid += 1;
        self.next_iid
    }
}

#[derive(Default, Debug, Clone)]
struct MockIssue {
    iid: u32,
    title: String,
    /// `"opened"` / `"closed"`,与 codehub 原文一致(上层靠
    /// `eq_ignore_ascii_case("closed")` 判)。
    state: String,
    labels: Vec<String>,
    body: String,
    comments: Vec<String>,
    created_at: Option<String>,
    closed_at: Option<String>,
    assignee: Option<String>,
    author: Option<String>,
}

fn now_iso() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_default()
}

#[derive(Debug)]
pub(super) struct MockRemote {
    state: Arc<Mutex<MockState>>,
}

impl MockRemote {
    pub(super) fn new(state: Arc<Mutex<MockState>>) -> Self {
        Self { state }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, MockState> {
        self.state.lock().expect("mock state 未中毒")
    }

    fn missing(iid: u32) -> RemoteError {
        RemoteError::Mock(format!("issue #{iid} 不在"))
    }

    fn snapshot(i: &MockIssue, with_body: bool) -> RemoteIssue {
        RemoteIssue {
            iid: i.iid,
            number: i.iid,
            title: i.title.clone(),
            state: i.state.clone(),
            labels: i.labels.clone(),
            // 与真实接口一致，列表不带正文，单查才返回正文。
            body: if with_body {
                i.body.clone()
            } else {
                String::new()
            },
            created_at: i.created_at.clone(),
            closed_at: i.closed_at.clone(),
            assignee: i.assignee.clone(),
            author: i.author.clone(),
        }
    }
}

#[async_trait::async_trait]
impl RemoteProvider for MockRemote {
    fn kind(&self) -> &'static str {
        "mock"
    }

    /// MR 仅模拟成功结果，不持久化正文。
    async fn create_mr_on_branch(
        &self,
        _workspace: &Path,
        _branch: &str,
        _title: &str,
        _body: &str,
    ) -> Result<PrOpened, RemoteError> {
        Ok(PrOpened::Created(1))
    }

    async fn merge_mr(&self, _mr_number: u32) -> Result<(), RemoteError> {
        Ok(())
    }

    async fn open_mr_for_branch(&self, _branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(None)
    }

    async fn mr_for_branch(&self, _branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(None)
    }

    async fn create_issue(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
    ) -> Result<u32, RemoteError> {
        let mut s = self.lock();
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

    async fn create_issue_with_attachment(
        &self,
        title: &str,
        body: &str,
        labels: &[&str],
        _attachment: Option<&Path>,
    ) -> Result<u32, RemoteError> {
        self.create_issue(title, body, labels).await
    }

    async fn update_issue(
        &self,
        iid: u32,
        labels: Option<&[&str]>,
        state_event: Option<IssueStateEvent>,
    ) -> Result<(), RemoteError> {
        let mut s = self.lock();
        let i = s.issues.get_mut(&iid).ok_or_else(|| Self::missing(iid))?;
        if let Some(labels) = labels {
            // 替换命名空间内的标签；不带冒号的标签只添加。
            let prefixes: Vec<&str> = labels.iter().filter_map(|l| label_prefix(l)).collect();
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

    async fn list_issues(&self, filter: &IssueFilter) -> Result<Vec<RemoteIssue>, RemoteError> {
        let s = self.lock();
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
            if !filter
                .labels
                .iter()
                .all(|l| i.labels.iter().any(|x| x == l))
            {
                continue;
            }
            out.push(Self::snapshot(i, false));
        }
        out.sort_by_key(|r| r.iid);
        Ok(out)
    }

    async fn view_issue(&self, iid: u32) -> Result<RemoteIssue, RemoteError> {
        let s = self.lock();
        let i = s.issues.get(&iid).ok_or_else(|| Self::missing(iid))?;
        Ok(Self::snapshot(i, true))
    }

    async fn comment_issue(&self, iid: u32, body: &str) -> Result<(), RemoteError> {
        let mut s = self.lock();
        let i = s.issues.get_mut(&iid).ok_or_else(|| Self::missing(iid))?;
        i.comments.push(format!("【mock】{body}"));
        Ok(())
    }

    async fn list_issue_comments(&self, iid: u32) -> Result<Vec<String>, RemoteError> {
        let s = self.lock();
        let i = s.issues.get(&iid).ok_or_else(|| Self::missing(iid))?;
        Ok(i.comments.clone())
    }

    async fn set_issue_assignee(&self, iid: u32, assignee: &str) -> Result<(), RemoteError> {
        let mut s = self.lock();
        let i = s.issues.get_mut(&iid).ok_or_else(|| Self::missing(iid))?;
        i.assignee = if assignee.is_empty() {
            None
        } else {
            Some(assignee.to_string())
        };
        Ok(())
    }

    async fn edit_issue(&self, iid: u32, title: &str, body: &str) -> Result<(), RemoteError> {
        let mut s = self.lock();
        let i = s.issues.get_mut(&iid).ok_or_else(|| Self::missing(iid))?;
        i.title = title.to_string();
        i.body = body.to_string();
        Ok(())
    }

    async fn create_release(
        &self,
        tag: &str,
        _title: &str,
        _body: &str,
    ) -> Result<(), RemoteError> {
        let mut s = self.lock();
        if !s.releases.iter().any(|r| r == tag) {
            s.releases.push(tag.to_string());
        }
        Ok(())
    }

    async fn list_releases(&self) -> Result<Vec<String>, RemoteError> {
        Ok(self.lock().releases.clone())
    }

    async fn current_user(&self) -> Option<String> {
        None
    }

    async fn list_milestones(&self) -> Result<Vec<Milestone>, RemoteError> {
        Ok(Vec::new())
    }

    async fn rename_plan_label(&self, from_label: &str, to_label: &str) -> Result<(), RemoteError> {
        let mut s = self.lock();
        for i in s.issues.values_mut() {
            for l in &mut i.labels {
                if l == from_label {
                    *l = to_label.to_string();
                }
            }
        }
        Ok(())
    }

    // 不支持的统计返回错误，不能用空列表生成虚假的零值曲线。

    async fn merged_mr_times(&self) -> Result<Capped<String>, RemoteError> {
        Err(RemoteError::Mock("替身远端不产走势数据".into()))
    }

    async fn issue_times(&self) -> Result<Capped<(String, Option<String>)>, RemoteError> {
        Err(RemoteError::Mock("替身远端不产走势数据".into()))
    }

    async fn list_repos(&self, _limit: u32) -> Result<Vec<RepoSummary>, RemoteError> {
        Err(RemoteError::Mock("替身远端没有真仓可列".into()))
    }

    async fn probe_repo(&self, path: &str) -> Result<String, RemoteError> {
        Err(RemoteError::Mock(format!("替身远端探不了「{path}」")))
    }

    async fn fetch_project_toml(
        &self,
        _path: &str,
        _git_ref: &str,
    ) -> Result<Option<String>, RemoteError> {
        Ok(None)
    }

    async fn clone_repo(&self, path: &str, _dest: &Path) -> Result<(), RemoteError> {
        Err(RemoteError::Mock(format!("替身远端 clone 不了「{path}」")))
    }
}
