//! 本地持久化形状的读回:不再有 SQLite,全部是本地文件。
//!
//! 这不是「补测试当交付物」——它是 §2.4 第 3 组验收读回的可执行版本,跑在
//! CI 里,免得哪次改悄悄把 SQLite 加回来。

use bw::local::{ProjectRegistry, SessionStore, Settings};
use bw::model::{Conversation, ConversationId, IssueId, Project, ProjectId};
use std::path::PathBuf;

fn tmp_asset_root(name: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!("bw-test-{name}"));
    let _ = std::fs::remove_dir_all(&path);
    std::fs::create_dir_all(&path).unwrap();
    path
}

#[tokio::test]
async fn registry_starts_empty() {
    let root = tmp_asset_root("empty-registry");
    let entries = ProjectRegistry::load(&root).unwrap();
    assert!(entries.is_empty(), "新建的 asset 目录,注册表应该是空的");
    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn registry_upsert_and_find() {
    let root = tmp_asset_root("upsert");
    let p = Project {
        id: ProjectId::new(),
        slug: "test-proj".into(),
        name: "Test".into(),
        workspace_path: String::new(),
        provider: "github".into(),
        remote_host: String::new(),
        remote_path: "owner/repo".into(),
        signal: None,
        weekly_signal: None,
        signal_derived_at: None,
        sort_order: 0.0,
        created_at: 0,
        updated_at: 0,
    };
    let created = ProjectRegistry::upsert(&root, &p).unwrap();
    assert_eq!(created.slug, "test-proj");

    // 幂等:再 upsert 同 slug 拿回同一条。
    let again = ProjectRegistry::upsert(&root, &p).unwrap();
    assert_eq!(again.id, created.id);

    // 按 slug 找得到。
    let found = ProjectRegistry::find_by_slug(&root, "test-proj").unwrap();
    assert!(found.is_some());

    // 按 id 找得到。
    let found = ProjectRegistry::find_by_id(&root, created.id).unwrap();
    assert!(found.is_some());

    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn settings_roundtrip() {
    let root = tmp_asset_root("settings");
    assert!(Settings::get_workspaces_root(&root).is_none());
    Settings::set_workspaces_root(&root, "/tmp/work").unwrap();
    assert_eq!(
        Settings::get_workspaces_root(&root).as_deref(),
        Some("/tmp/work")
    );
    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn sessions_append_only() {
    let root = tmp_asset_root("sessions");
    let pid = ProjectId::new();
    let iid = 42u32;
    let issue_id = IssueId::from_remote(pid, iid);
    let conv = Conversation {
        id: ConversationId::new(),
        project_id: pid,
        issue_id,
        claude_session_id: String::new(),
        workspace_path: "/tmp/ws".into(),
        branch_name: "bw/issue-42".into(),
        created_at: 100,
        last_opened_at: 100,
    };
    SessionStore::append(&root, "test-proj", &conv).unwrap();

    // 读回来。
    let read = SessionStore::read(&root, "test-proj", iid).unwrap();
    assert!(read.is_some());
    assert_eq!(read.unwrap().branch_name, "bw/issue-42");

    // 再追加一条(session_id 更新走 append-only,不改旧行)。SessionStart hook
    // 收下 id 之后也是再 append 一行,读到的是最新的那条。
    let conv2 = Conversation {
        id: conv.id,
        project_id: pid,
        issue_id,
        claude_session_id: "claude-xyz".into(),
        workspace_path: conv.workspace_path.clone(),
        branch_name: conv.branch_name.clone(),
        created_at: conv.created_at,
        last_opened_at: 999,
    };
    SessionStore::append(&root, "test-proj", &conv2).unwrap();
    let read = SessionStore::read(&root, "test-proj", iid).unwrap();
    let conv = read.unwrap();
    assert_eq!(conv.claude_session_id, "claude-xyz");
    assert_eq!(conv.last_opened_at, 999, "读到的是最后一条(最新的状态)");

    // 文件里应该有两行(append-only)。
    let path = root.join("sessions/test-proj/42.jsonl");
    let raw = std::fs::read_to_string(&path).unwrap();
    let lines: Vec<&str> = raw.lines().filter(|l| !l.is_empty()).collect();
    assert_eq!(lines.len(), 2, "append-only 应该有两行记录");

    let _ = std::fs::remove_dir_all(&root);
}

#[tokio::test]
async fn no_sqlite_files_anywhere() {
    let root = tmp_asset_root("no-sqlite");
    // 跑一遍所有操作,确认不产生 .db 文件。
    let p = Project {
        id: ProjectId::new(),
        slug: "no-sqlite".into(),
        name: "No SQLite".into(),
        workspace_path: String::new(),
        provider: String::new(),
        remote_host: String::new(),
        remote_path: String::new(),
        signal: None,
        weekly_signal: None,
        signal_derived_at: None,
        sort_order: 0.0,
        created_at: 0,
        updated_at: 0,
    };
    ProjectRegistry::upsert(&root, &p).unwrap();
    Settings::set_workspaces_root(&root, "/tmp").unwrap();
    let conv = Conversation {
        id: ConversationId::new(),
        project_id: p.id,
        issue_id: IssueId::from_remote(p.id, 1),
        claude_session_id: String::new(),
        workspace_path: String::new(),
        branch_name: String::new(),
        created_at: 0,
        last_opened_at: 0,
    };
    SessionStore::append(&root, "no-sqlite", &conv).unwrap();

    // 没有任何 .db 文件。
    fn has_db(dir: &std::path::Path) -> bool {
        if !dir.is_dir() {
            return false;
        }
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            let path = entry.path();
            if path.is_dir() {
                if has_db(&path) {
                    return true;
                }
            } else if path.extension().is_some_and(|e| e == "db") {
                return true;
            }
        }
        false
    }
    assert!(!has_db(&root), "asset 目录里不该有任何 .db 文件");

    let _ = std::fs::remove_dir_all(&root);
}
