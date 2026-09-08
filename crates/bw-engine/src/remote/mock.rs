//! 替身远端 —— 给 headless 指挥器/测试用的第三个派生。
//!
//! **不碰 codehub、不碰 `gh`、不碰网关**;issue/release 全套在内存里走完,产出
//! **自我标注**(issue 正文与评论都带【mock】字样,不冒充真远端)。状态持在
//! `Arc<Mutex<MockState>>` 里,经 `App` 注入的 factory 拿到的是**同一个** Arc ——
//! 这样「建活 → 列活 → 改状态 → 关」一整圈共享同一份状态,和真远端一次会话连续
//! 操作的行为一致。

use std::{
    collections::HashMap,
    path::Path,
    sync::{Arc, Mutex},
};

use super::{
    filter_persistent_labels, label_prefix, Capped, IssueFilter, IssueState, IssueStateEvent,
    Milestone, PrOpened, RemoteError, RemoteIssue, RemoteProvider, RepoSummary,
};

/// 替身远端持的内存状态。`pub` 是为了让 `real_demo_v4` / 测试能
/// `Arc::new(Mutex::new(MockState::default()))` 注入共享的那一份;字段不暴露 ——
/// 状态只经 [`super::Remote`] 的方法读写。
#[derive(Default, Debug)]
pub struct MockState {
    issues: HashMap<u32, MockIssue>,
    /// 下一个 iid。从 1 起(0 不是合法 issue 号)。
    next_iid: u32,
    /// 已发的 release tag 集合。按版本号幂等(同 tag 不重复加)。
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
    /// 建活时刻的 RFC3339 串。建时填,事件流「建了活」那条靠它进得来。
    created_at: Option<String>,
    /// 关闭时刻的 RFC3339 串。关时填(= `settled_at` 的近似正本)。
    closed_at: Option<String>,
    assignee: Option<String>,
    author: Option<String>,
}

/// 当前 UTC 时刻的 RFC3339 串。与两个真实现同形:远端 issue 的
/// `created_at`/`closed_at` 都是 RFC3339 原文,上层自己解析。
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
            // 与两个真实现一致:list 不带正文,要正文的走 view_issue。
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

    // ── MR:替身不开真 MR ──

    /// 回一个假号,让调用方那条「MR 已开」的流程走得下去;正文不存 —— 替身的
    /// 使命是验证 issue 全链路,MR 只到「不崩」为止。
    async fn create_mr_on_branch(
        &self,
        _workspace: &Path,
        _branch: &str,
        _title: &str,
        _body: &str,
    ) -> Result<PrOpened, RemoteError> {
        Ok(PrOpened::Created(1))
    }

    /// 没有真 MR,合入就是 no-op 成功(不崩,也不记账到别处)。
    async fn merge_mr(&self, _mr_number: u32) -> Result<(), RemoteError> {
        Ok(())
    }

    /// 不开真 MR,所以「有没有开着的 MR」如实回 `None`。
    async fn open_mr_for_branch(&self, _branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(None)
    }

    async fn mr_for_branch(&self, _branch: &str) -> Result<Option<u32>, RemoteError> {
        Ok(None)
    }

    // ── issue ──

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

    /// 替身只记正文 —— 附件没地方放,如实忽略。
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
            // 与两个真实现同一套 namespace-replace:入参前缀命中的现有 label
            // 摘掉,入参再全加上(去重)。裸 label(无冒号)只加不摘。
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
            // 取交集:issue 必须带齐入参里的每一条 label。
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

    // ── 版本 ──

    /// 幂等 —— 同 tag 不重复加。真远端 tag 已存在会如实报错,这里不报(替身没有
    /// 「远端真有这个 tag」这条运行时错,幂等更利于指挥器重跑不产生重复数据)。
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

    // ── 里程碑:替身不投(基类默认实现就是不投),只有标签改名要跟着动 ──

    async fn list_milestones(&self) -> Result<Vec<Milestone>, RemoteError> {
        Ok(Vec::new())
    }

    /// 替身里把 issue 上已打的那张标一起改掉 —— 不然改完版本名,列活时那些活
    /// 会凭空掉出这个版本。
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

    // ── 走势:替身不产走势数据 ──
    //
    // **如实报「没这东西」,不返空列表** —— 空列表会被上层老老实实分桶成一条
    // 全 0 的线,那是假数据;报错则让走势图留白并写清为什么。

    async fn merged_mr_times(&self) -> Result<Capped<String>, RemoteError> {
        Err(RemoteError::Mock("替身远端不产走势数据".into()))
    }

    async fn issue_times(&self) -> Result<Capped<(String, Option<String>)>, RemoteError> {
        Err(RemoteError::Mock("替身远端不产走势数据".into()))
    }

    // ── 主机级:替身没有真平台可问 ──
    //
    // 这几条不在替身的使命里(它验的是 issue 全链路)。**如实报「替身没有」**,
    // 不返一个空列表冒充「你名下没有仓」。

    async fn list_repos(&self, _limit: u32) -> Result<Vec<RepoSummary>, RemoteError> {
        Err(RemoteError::Mock("替身远端没有真仓可列".into()))
    }

    async fn probe_repo(&self, path: &str) -> Result<String, RemoteError> {
        Err(RemoteError::Mock(format!("替身远端探不了「{path}」")))
    }

    /// 替身仓里确实没有名片 —— 这条 `None` 是真的,不是「没查成」。
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
