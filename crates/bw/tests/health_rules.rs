//! 健康灯的判定规则。这几条是产品铁律,不是可选行为:
//! **没数据是灰,不是绿,也不是红。**

use bw::derive::{derive_project_health, HealthInputs};
use bw::model::Signal;

fn all_good() -> HealthInputs {
    HealthInputs {
        has_week_goal: true,
        ops1_open: true,
        committed_this_week: true,
        committed_last_week: true,
        git_readable: true,
        has_metric_reading: true,
        red_metrics: Vec::new(),
        delivered_last_week: true,
    }
}

#[test]
fn no_data_at_all_is_grey_not_red() {
    // 刚接入、还没配工作区的项目:git 根本读不动,零提交说明不了任何事。
    let s = derive_project_health(&HealthInputs::empty()).signal();
    assert_eq!(
        s,
        Signal::Unknown,
        "没数据必须是灰;红是在替用户断言项目停了"
    );
}

#[test]
fn no_data_at_all_is_not_green() {
    assert_ne!(
        derive_project_health(&HealthInputs::empty()).signal(),
        Signal::Green
    );
}

#[test]
fn two_silent_weeks_in_a_readable_repo_is_red() {
    let inputs = HealthInputs {
        git_readable: true,
        ..HealthInputs::empty()
    };
    assert_eq!(derive_project_health(&inputs).signal(), Signal::Red);
}

#[test]
fn a_red_metric_beats_three_green_judgements() {
    let inputs = HealthInputs {
        red_metrics: vec!["「每周合入的 PR 数」现值 1,目标 ≥5".into()],
        ..all_good()
    };
    let health = derive_project_health(&inputs);
    assert_eq!(
        health.signal(),
        Signal::Red,
        "指标越线不能被「三条判据都齐了」吞掉"
    );
    // 红的理由必须第一眼说清是哪条指标越线,不给一个孤零零的颜色。
    let first = &health.reasons()[0];
    assert!(!first.ok);
    assert!(first.text.contains("指标越线"), "理由是:{}", first.text);
    assert!(first.text.contains("每周合入的 PR 数"));
}

#[test]
fn three_judgements_all_true_is_green() {
    assert_eq!(derive_project_health(&all_good()).signal(), Signal::Green);
}

#[test]
fn ops1_open_without_goal_text_is_not_on_track() {
    let inputs = HealthInputs {
        ops1_open: true,
        committed_this_week: true,
        git_readable: true,
        ..HealthInputs::empty()
    };
    let h = derive_project_health(&inputs);
    assert!(!h.reasons()[0].ok);
    assert!(
        h.reasons()[0].text.contains("还没写进"),
        "got {}",
        h.reasons()[0].text
    );
}
