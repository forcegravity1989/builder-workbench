use super::HealthReason;
use crate::model::Signal;

/// 仅由 derive_project_health 产生，外部不能直接构造。
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DerivedHealth {
    signal: Signal,
    reasons: Vec<HealthReason>,
}

pub(super) fn mint(signal: Signal, reasons: Vec<HealthReason>) -> DerivedHealth {
    DerivedHealth { signal, reasons }
}

impl DerivedHealth {
    pub fn signal(&self) -> Signal {
        self.signal
    }

    pub fn weekly_signal(&self) -> Signal {
        self.signal
    }

    pub fn reasons(&self) -> &[HealthReason] {
        &self.reasons
    }
}
