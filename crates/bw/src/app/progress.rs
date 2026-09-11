#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StepState {
    Doing,
    Ok,
    /// 单步失败不一定代表整个命令失败，最终结果由命令返回值决定。
    Fail,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProgressCase {
    pub name: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProgressLine {
    /// 同一步的进度原地替换，不追加重复行。
    pub step: u8,
    pub state: StepState,
    pub text: String,
    pub cases: Vec<ProgressCase>,
}

impl ProgressLine {
    pub fn doing(step: u8, text: impl Into<String>) -> Self {
        Self {
            step,
            state: StepState::Doing,
            text: text.into(),
            cases: Vec::new(),
        }
    }
    pub fn ok(step: u8, text: impl Into<String>) -> Self {
        Self {
            step,
            state: StepState::Ok,
            text: text.into(),
            cases: Vec::new(),
        }
    }
    pub fn fail(step: u8, text: impl Into<String>) -> Self {
        Self {
            step,
            state: StepState::Fail,
            text: text.into(),
            cases: Vec::new(),
        }
    }

    pub fn with_cases(mut self, cases: Vec<ProgressCase>) -> Self {
        self.cases = cases;
        self
    }
}
