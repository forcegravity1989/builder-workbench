mod sealed;
pub mod target;

pub use sealed::DerivedHealth;

use crate::model::Signal;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HealthInputs {
    pub has_week_goal: bool,
    pub ops1_open: bool,
    pub committed_this_week: bool,
    pub committed_last_week: bool,
    /// Git 读取失败时为 false，不能将失败解释为连续零提交。
    pub git_readable: bool,
    pub has_metric_reading: bool,
    /// 未达到目标的指标及读数；无法解析的目标或读数不计入。
    pub red_metrics: Vec<String>,
    pub delivered_last_week: bool,
}

impl HealthInputs {
    pub fn empty() -> Self {
        Self {
            has_week_goal: false,
            ops1_open: false,
            committed_this_week: false,
            committed_last_week: false,
            git_readable: false,
            has_metric_reading: false,
            red_metrics: Vec::new(),
            delivered_last_week: false,
        }
    }

    fn on_track(&self) -> bool {
        self.has_week_goal && self.committed_this_week
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HealthReason {
    pub ok: bool,
    pub text: String,
}

pub fn derive_project_health(inputs: &HealthInputs) -> DerivedHealth {
    let (a, b, c) = (
        inputs.on_track(),
        inputs.has_metric_reading,
        inputs.delivered_last_week,
    );

    let stalled = inputs.git_readable && !inputs.committed_this_week && !inputs.committed_last_week;
    let metric_breached = !inputs.red_metrics.is_empty();
    let signal = if metric_breached || stalled {
        Signal::Red
    } else if a && b && c {
        Signal::Green
    } else if !a && !b && !c {
        Signal::Unknown
    } else {
        Signal::Amber
    };

    let mut reasons = Vec::new();
    if metric_breached {
        reasons.push(HealthReason {
            ok: false,
            text: format!("指标未达目标：{}", inputs.red_metrics.join(";")),
        });
    }
    reasons.extend([
        HealthReason {
            ok: a,
            text: if a {
                "本周已有版本目标和代码提交".into()
            } else if !inputs.has_week_goal && inputs.ops1_open {
                "本周版本目标尚未填写".into()
            } else if !inputs.has_week_goal {
                "尚未读取到本周版本目标".into()
            } else {
                "本周已有版本目标，尚无代码提交".into()
            },
        },
        HealthReason {
            ok: b,
            text: if b {
                "本周或上周有指标读数".into()
            } else {
                "最近两周都没有记过指标读数".into()
            },
        },
        HealthReason {
            ok: c,
            text: if c {
                "上周有合入或发版".into()
            } else {
                "上周既没有合入也没有发版".into()
            },
        },
    ]);

    sealed::mint(signal, reasons)
}
