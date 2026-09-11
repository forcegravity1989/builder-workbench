pub mod bootstrap;
pub mod skills;
pub mod system_prompt;

pub struct Template {
    pub target: &'static str,
    pub body: &'static str,
    pub note: &'static str,
}

pub const ISSUE_POLICY_TMPL: &str =
    include_str!("../../../../standard/templates/issue-policy.toml.tmpl");

#[allow(dead_code)]
pub const METRICS_TMPL: &str = include_str!("../../../../standard/templates/metrics.toml.tmpl");

/// 第一次接入不再往仓里摊模板。开工工具跟人走本机,节律是产品默认。
/// `ISSUE_POLICY_TMPL` 只给残留文件解析 / 测试用。
pub const CORE_TEMPLATES: &[Template] = &[];

/// 未提供值的占位符原样保留，便于发现遗漏。
pub fn render(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("{{{{{k}}}}}"), v);
    }
    out
}
