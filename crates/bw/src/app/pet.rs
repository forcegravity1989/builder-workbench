//! 桌面宠物的现算:一堆 Issue → 宠物该是什么样,以及发给 Clawd on Desk 的报文。
//!
//! 只认标签正本,不看会话文件、不猜 agent 在想什么:阻塞 > 待评审 > 进行中 > 没活撤卡。
//! 这是派生视图,不改任何状态;报文发不出去由上层静默。协议字面量(state / event)
//! 来自 Clawd 自定义 agent 协议,它的主题必须有这个 state,没有的话它回 400。

use crate::model::{Issue, IssueStatus, ProjectId};
use std::path::Path;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PetState {
    /// 有 Issue 在进行中:AI 在跑。
    Working,
    /// 有 Issue 待评审:该你点了。Clawd 里这一档是 `attention`(开心 / 举手)。
    Attention,
    /// 有 Issue 阻塞:卡住了。
    Error,
}

impl PetState {
    /// Clawd 自定义 agent 协议的 `state` / `event` 字面量。
    pub const fn wire(self) -> (&'static str, &'static str) {
        match self {
            PetState::Working => ("working", "PreToolUse"),
            PetState::Attention => ("attention", "Stop"),
            PetState::Error => ("error", "PostToolUseFailure"),
        }
    }

    pub const fn label(self) -> &'static str {
        match self {
            PetState::Working => "在跑",
            PetState::Attention => "该你了",
            PetState::Error => "卡住了",
        }
    }
}

/// 这一刻宠物该是什么样。`PartialEq` 就是「要不要重发」的判据:同样的报告不发第二遍。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PetReport {
    pub state: PetState,
    /// 代表这一档的那张活(同档里最近动过的),给 Clawd 会话标题用。
    pub number: u32,
    pub title: String,
    /// 同档一共几张。
    pub count: usize,
}

const PRIORITY: [(IssueStatus, PetState); 3] = [
    (IssueStatus::Blocked, PetState::Error),
    (IssueStatus::InReview, PetState::Attention),
    (IssueStatus::InProgress, PetState::Working),
];

/// 阻塞 > 待评审 > 进行中;都没有 → `None`(撤卡)。
pub fn derive(issues: &[Issue]) -> Option<PetReport> {
    for (status, state) in PRIORITY {
        let mut hits: Vec<&Issue> = issues.iter().filter(|i| i.status == status).collect();
        if hits.is_empty() {
            continue;
        }
        hits.sort_by_key(|i| std::cmp::Reverse((i.updated_at, i.number)));
        let top = hits[0];
        return Some(PetReport {
            state,
            number: top.number,
            title: top.title.clone(),
            count: hits.len(),
        });
    }
    None
}

/// 一个项目一条 Clawd 会话;Clawd 自己会再加上 agent_id 前缀,不会和别的应用撞。
/// 桥上要不要发:同项目同报告不发第二遍;换了项目或报告变了就发。第一次观察到
/// 「没活」也发一次 `SessionEnd`——上一个进程可能给 Clawd 留了张卡,重启后必须撤掉
/// (杀进程重开要收敛到同一个样子)。
pub fn should_send(
    prev: Option<&(ProjectId, Option<PetReport>)>,
    pid: ProjectId,
    next: &Option<PetReport>,
) -> bool {
    !matches!(prev, Some((p, r)) if *p == pid && r == next)
}

pub fn session_id(slug: &str) -> String {
    format!("bw:{slug}")
}

/// Clawd 会话卡上的标题(它截 80 字)。
pub fn session_title(r: &PetReport) -> String {
    let title: String = r.title.trim().chars().take(48).collect();
    let head = if r.number > 0 {
        format!("#{} {title}", r.number)
    } else {
        title
    };
    if r.count > 1 {
        format!("{head} · {}(还有 {} 张)", r.state.label(), r.count - 1)
    } else {
        format!("{head} · {}", r.state.label())
    }
}

/// 要 POST 的报文。只带生命周期元数据,不带正文、不带提示词。
pub fn payload(agent_id: &str, slug: &str, cwd: &Path, r: &PetReport) -> String {
    let (state, event) = r.state.wire();
    serde_json::json!({
        "agent_id": agent_id,
        "session_id": session_id(slug),
        "state": state,
        "event": event,
        "session_title": session_title(r),
        "cwd": cwd.display().to_string(),
    })
    .to_string()
}

/// 没活了:`SessionEnd` 让 Clawd 撤掉这张会话卡,而不是留一张发呆的。
pub fn end_payload(agent_id: &str, slug: &str) -> String {
    serde_json::json!({
        "agent_id": agent_id,
        "session_id": session_id(slug),
        "state": "idle",
        "event": "SessionEnd",
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{IssueId, IssueKind, IssueOrigin};

    fn issue(number: u32, status: IssueStatus, updated_at: i64) -> Issue {
        let id = IssueId::nil();
        Issue {
            id,
            project_id: id.project_id(),
            number,
            remote_number: number,
            title: format!("活 {number}"),
            body: String::new(),
            status,
            branch: String::new(),
            pr_number: 0,
            has_open_mr: false,
            week_of: String::new(),
            version: String::new(),
            tool: String::new(),
            kind: IssueKind::Business,
            origin: IssueOrigin::Human,
            workflow: String::new(),
            category: None,
            sort_order: number as f64,
            metric_key: String::new(),
            created_at: 0,
            updated_at,
            settled_at: None,
            assignee: String::new(),
            author: String::new(),
            plan_versions: Vec::new(),
        }
    }

    #[test]
    fn blocked_beats_review_beats_in_progress() {
        let all = vec![
            issue(1, IssueStatus::InProgress, 10),
            issue(2, IssueStatus::InReview, 20),
            issue(3, IssueStatus::Blocked, 5),
            issue(4, IssueStatus::Todo, 99),
        ];
        let r = derive(&all).unwrap();
        assert_eq!(r.state, PetState::Error);
        assert_eq!(r.number, 3);
        let r = derive(&all[..2]).unwrap();
        assert_eq!(r.state, PetState::Attention);
        assert_eq!(r.number, 2);
        let r = derive(&all[..1]).unwrap();
        assert_eq!(r.state, PetState::Working);
        assert_eq!((r.number, r.count), (1, 1));
    }

    #[test]
    fn no_live_work_means_withdraw_not_idle_card() {
        assert_eq!(derive(&[]), None);
        assert_eq!(
            derive(&[
                issue(1, IssueStatus::Todo, 1),
                issue(2, IssueStatus::Done, 2)
            ]),
            None
        );
    }

    #[test]
    fn representative_is_most_recently_updated_in_the_bucket() {
        let all = vec![
            issue(7, IssueStatus::InProgress, 100),
            issue(8, IssueStatus::InProgress, 300),
            issue(9, IssueStatus::InProgress, 200),
        ];
        let r = derive(&all).unwrap();
        assert_eq!((r.number, r.count), (8, 3));
        assert_eq!(session_title(&r), "#8 活 8 · 在跑(还有 2 张)");
    }

    #[test]
    fn same_facts_same_report_so_no_resend() {
        let a = derive(&[issue(1, IssueStatus::InReview, 5)]).unwrap();
        let b = derive(&[issue(1, IssueStatus::InReview, 5)]).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn send_policy_dedupes_per_project_but_always_speaks_on_first_observation() {
        let pid = IssueId::nil().project_id();
        let working = derive(&[issue(1, IssueStatus::InProgress, 1)]);
        // 第一次观察:有活要发,没活也要发(撤上个进程留下的卡)。
        assert!(should_send(None, pid, &working));
        assert!(should_send(None, pid, &None));
        // 同项目同报告不发;报告变了发;没活了发一次撤卡,再没活不再发。
        let prev = (pid, working.clone());
        assert!(!should_send(Some(&prev), pid, &working));
        assert!(should_send(
            Some(&prev),
            pid,
            &derive(&[issue(1, IssueStatus::InReview, 1)])
        ));
        assert!(should_send(Some(&prev), pid, &None));
        assert!(!should_send(Some(&(pid, None)), pid, &None));
    }

    #[test]
    fn payload_carries_the_four_required_fields_and_nothing_secret() {
        let r = derive(&[issue(12, IssueStatus::InProgress, 1)]).unwrap();
        let body = payload(
            "custom-bw-dev-cece75161037",
            "workbench",
            Path::new("/w/bw"),
            &r,
        );
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["agent_id"], "custom-bw-dev-cece75161037");
        assert_eq!(v["session_id"], "bw:workbench");
        assert_eq!(v["state"], "working");
        assert_eq!(v["event"], "PreToolUse");
        assert_eq!(v["session_title"], "#12 活 12 · 在跑");
        assert_eq!(v["cwd"], "/w/bw");
        assert!(v.get("body").is_none());
        let end: serde_json::Value =
            serde_json::from_str(&end_payload("custom-bw-dev-cece75161037", "workbench")).unwrap();
        assert_eq!(end["event"], "SessionEnd");
        assert_eq!(end["state"], "idle");
    }
}
