//! 仓文件解析器的读回。用的样例就是详细设计 02 篇 §2.5 里那几份文件原文
//! ——解析器认不认得设计稿给的格式,是这一层唯一要证明的事。
//!
//! 刀5:week_plan_file 和 release_file 已从 bw 删掉(搬到 app-shell),
//! 这两个解析器的测试也跟着搬走了。这里只剩还在 bw 里的仓文件解析器。

use bw::isoweek;
use bw::model::StageKind;
use bw::repo::{issue_policy_file, managed_file, project_file};

#[test]
fn iso_week_math_round_trips() {
    assert!(isoweek::starts_on_monday("2026-W34"));
    assert_eq!(
        isoweek::iso_week_of(isoweek::week_start("2026-W34").unwrap()),
        "2026-W34"
    );
    assert_eq!(
        isoweek::previous_week("2026-W34").as_deref(),
        Some("2026-W33")
    );
    assert_eq!(
        isoweek::previous_week("2026-W01").as_deref(),
        Some("2025-W52")
    );
    assert!(isoweek::week_start("2026-W99").is_none(), "假周号不该被认");
    assert!(isoweek::week_start("不是周").is_none());
}

#[test]
fn issue_policy_round_trips_and_maps_categories() {
    let raw = r#"
schema_version = 1

[[tool]]
name = "claude_cli"
kind = "terminal"
probe = "path_candidates"
capabilities = ["inject_skills", "resume", "hooks"]

[[mapping]]
category = "build"
tool     = "claude_cli"
workflow = "mattpocock-skills"

[review]
who_can_merge  = "repo_write"
require_pr_for = ["code", "docs"]

[cadence]
ops2_trigger  = "scheduled"
ops2_schedule = "fri 20:00"
"#;
    let f = issue_policy_file::parse(raw).unwrap();
    assert_eq!(f.tools.len(), 1);
    assert_eq!(f.tool("claude_cli").unwrap().kind, "terminal");
    let m = f.mapping_for(StageKind::Build).unwrap();
    assert_eq!(m.tool, "claude_cli");
    assert_eq!(m.workflow, "mattpocock-skills");
    assert!(
        f.mapping_for(StageKind::Growth).is_none(),
        "没配的类别就是没配,不替用户挑一个"
    );
    // 渲染出来的还认得回去。
    let again = issue_policy_file::parse(&issue_policy_file::render(&f)).unwrap();
    assert_eq!(again.mappings, f.mappings);
    assert_eq!(again.tools, f.tools);
}

#[test]
fn unknown_key_fails_loudly() {
    let err = project_file::parse("name = \"x\"\nnot_a_real_key = 1\n");
    assert!(err.is_err(), "键名写错要当场报错,不能静默丢掉");
}

#[test]
fn managed_reconcile_tells_the_four_cases_apart() {
    use managed_file::Reconcile;
    let body = b"hello";
    let entry = managed_file::ManagedEntry {
        path: "AGENTS.md".into(),
        version: "4.0".into(),
        fingerprint: managed_file::fingerprint(body),
    };
    assert_eq!(
        managed_file::reconcile(Some(&entry), Some(body), "4.0"),
        Reconcile::UpToDate
    );
    assert_eq!(
        managed_file::reconcile(Some(&entry), Some(body), "4.1"),
        Reconcile::Stale
    );
    assert_eq!(
        managed_file::reconcile(Some(&entry), Some("人改过了".as_bytes()), "4.0"),
        Reconcile::HumanEdited
    );
    assert_eq!(
        managed_file::reconcile(None, Some(body), "4.0"),
        Reconcile::Missing
    );
    assert_eq!(
        managed_file::reconcile(Some(&entry), None, "4.0"),
        Reconcile::Missing
    );
}

#[test]
fn project_file_chat_section_is_optional() {
    let without = project_file::parse("name = \"WorkflowHub\"\n").unwrap();
    assert!(
        without.chat.is_none(),
        "不配群 = 整段不写,不是写一个空 provider"
    );
    let with = project_file::parse(
        "name = \"WorkflowHub\"\ncurrent_version = \"v0.3\"\n\n[chat]\nprovider = \"welink\"\ngroup_id = \"638201\"\nnotify = [\"review\"]\n",
    )
    .unwrap();
    assert_eq!(with.chat.as_ref().unwrap().group_id, "638201");
    assert_eq!(with.current_version, "v0.3");
    let again = project_file::parse(&project_file::render(&with)).unwrap();
    assert_eq!(again, with, "渲染出来的还认得回去");
}

fn tempdir(tag: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("bw-repo-test-{tag}"));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// 接入页的「想做什么 / 北极星」是多行输入框。粘一段带换行、带引号的文字
/// 进去,写出来的 TOML 必须还读得回来 —— 读不回来的表现是「这个项目什么都
/// 没有」,而不是一句报错。
#[test]
fn a_multiline_brief_survives_a_write_read_round_trip() {
    let dir = tempdir("toml-escape");
    let f = project_file::ProjectFile {
        name: "带\"引号\"的项目".into(),
        kind: String::new(),
        brief: "第一行\n第二行\t带制表符\n还有一个反斜杠 \\".into(),
        benchmark: "Linear".into(),
        opportunity: "北极星\n也是多行的".into(),
        standard_version: "4.0".into(),
        current_version: "v0.1".into(),
        chat: None,
    };
    project_file::write(&dir, &f).expect("写得出去");
    let back = project_file::read(&dir).expect("读得回来").expect("文件在");
    assert_eq!(back.name, f.name);
    assert_eq!(back.brief, f.brief);
    assert_eq!(back.opportunity, f.opportunity);
}
