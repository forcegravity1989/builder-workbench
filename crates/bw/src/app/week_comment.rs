pub const HEADING_GOAL: &str = "版本目标";
pub const HEADING_SCOPE: &str = "本周纳入";
pub const HEADING_READINGS: &str = "本周指标读数";
pub const HEADING_PROGRESS: &str = "每周进展";

/// 旧评论用过的标题,只在读的时候认,新写的不许再用。
const GOAL_ALIASES: &[&str] = &["版本目标", "周目标", "本周目标"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WeekComment {
    /// `## 版本目标` 到下一个二级标题之间的正文。没有或解析不到 = `None`。
    pub goal: Option<String>,
    /// `## 每周进展` 到下一个二级标题之间的正文。没有或解析不到 = `None`。
    pub progress: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Ops1Notes {
    pub goals: std::collections::HashMap<String, String>,
    pub progress: std::collections::HashMap<String, String>,
}

impl Ops1Notes {
    /// 优先版本名,没有再回退本周。两个都空 = `None`。
    pub fn goal_for(&self, version: &str, week: &str) -> Option<&str> {
        if !version.is_empty() {
            if let Some(g) = self.goals.get(version) {
                return Some(g.as_str());
            }
        }
        if !week.is_empty() {
            return self.goals.get(week).map(String::as_str);
        }
        None
    }
}

/// `bodies` 旧的在前。同一段以最新一条为准;目标和进展各自取最新,不必同条。
pub fn parse_comments(bodies: &[String]) -> WeekComment {
    let mut goal = None;
    let mut progress = None;
    for body in bodies.iter().rev() {
        if goal.is_none() {
            goal = section_text(body, GOAL_ALIASES);
        }
        if progress.is_none() {
            progress = section_text(body, &[HEADING_PROGRESS]);
        }
        if goal.is_some() && progress.is_some() {
            break;
        }
    }
    WeekComment { goal, progress }
}

pub fn render_week_plan_comment(included: &[u32]) -> String {
    let goal = "（未填写）";
    let mut scope = String::new();
    if included.is_empty() {
        scope.push_str("本周暂无纳入");
    } else {
        for iid in included {
            scope.push_str(&format!("- #{iid}\n"));
        }
        if scope.ends_with('\n') {
            scope.pop();
        }
    }
    format!("## {HEADING_GOAL}\n{goal}\n\n## {HEADING_SCOPE}\n{scope}\n\n## {HEADING_READINGS}\n")
}

pub fn validate_comment(body: &str) -> Result<(), Vec<String>> {
    let mut errs = Vec::new();
    if !has_heading(body, HEADING_GOAL) {
        errs.push(format!("缺二级标题 `## {HEADING_GOAL}`"));
    } else if section_text(body, &[HEADING_GOAL]).is_none() {
        errs.push(format!("`## {HEADING_GOAL}` 下面要有内容,不能空着"));
    }
    if !has_heading(body, HEADING_SCOPE) {
        errs.push(format!("缺二级标题 `## {HEADING_SCOPE}`"));
    }
    if !has_heading(body, HEADING_READINGS) {
        errs.push(format!("缺二级标题 `## {HEADING_READINGS}`"));
    }
    if errs.is_empty() {
        Ok(())
    } else {
        Err(errs)
    }
}

fn has_heading(body: &str, name: &str) -> bool {
    body.lines().any(|l| heading_matches(l, name))
}

fn heading_matches(line: &str, name: &str) -> bool {
    let t = line.trim();
    let rest = t.strip_prefix("##").map(str::trim).unwrap_or("");
    if rest.is_empty() {
        return false;
    }
    rest == name
        || rest.starts_with(&format!("{name}("))
        || rest.starts_with(&format!("{name}（"))
        || rest.starts_with(&format!("{name} "))
}

fn section_text(body: &str, names: &[&str]) -> Option<String> {
    let mut lines = body.lines();
    loop {
        let line = lines.next()?;
        if names.iter().any(|n| heading_matches(line, n)) {
            break;
        }
    }
    let mut buf = Vec::new();
    for line in lines {
        if line.trim().starts_with("##") {
            break;
        }
        buf.push(line);
    }
    while buf.first().is_some_and(|l| l.trim().is_empty()) {
        buf.remove(0);
    }
    while buf.last().is_some_and(|l| l.trim().is_empty()) {
        buf.pop();
    }
    if buf.iter().all(|l| l.trim().is_empty()) {
        None
    } else {
        Some(buf.join("\n"))
    }
}

/// 该版本所有 `## 每周进展`,新的在前。多周 / 多次登记都留着。
#[cfg(test)]
fn all_progress_text(bodies: &[String]) -> Option<String> {
    let mut parts = Vec::new();
    for body in bodies.iter().rev() {
        if let Some((label, text)) = progress_block(body) {
            parts.push(format!("{label}\n{text}"));
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n\n"))
    }
}

#[cfg(test)]
fn progress_block(body: &str) -> Option<(String, String)> {
    let mut lines = body.lines();
    let label = loop {
        let line = lines.next()?;
        if heading_matches(line, HEADING_PROGRESS) {
            let rest = line.trim().trim_start_matches('#').trim();
            let suffix = rest
                .strip_prefix(HEADING_PROGRESS)
                .unwrap_or("")
                .trim()
                .to_string();
            break if suffix.is_empty() {
                HEADING_PROGRESS.to_string()
            } else {
                suffix
            };
        }
    };
    let mut buf = Vec::new();
    for line in lines {
        if line.trim().starts_with("##") {
            break;
        }
        buf.push(line);
    }
    while buf.first().is_some_and(|l| l.trim().is_empty()) {
        buf.remove(0);
    }
    while buf.last().is_some_and(|l| l.trim().is_empty()) {
        buf.pop();
    }
    if buf.iter().all(|l| l.trim().is_empty()) {
        return None;
    }
    Some((label, buf.join("\n")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn newest_goal_wins() {
        let old = "## 周目标\n\n旧的一句。\n\n## 本周纳入\n\n- #1\n\n## 本周指标读数\n\n快照";
        let new = "## 周目标\n\n市场 skill 太多,本周打磨出若干精品 skill。\n\n## 本周纳入\n\n- 新拆:精品 skill 打磨\n\n## 本周指标读数\n\n(快照)";
        let p = parse_comments(&[old.into(), new.into()]);
        assert_eq!(
            p.goal.as_deref(),
            Some("市场 skill 太多,本周打磨出若干精品 skill。")
        );
    }

    #[test]
    fn alias_本周目标_still_reads() {
        let body = "## 本周目标(人定,2026-W35)\n\n市场 skill 太多,本周打磨出若干精品 skill。\n";
        assert_eq!(
            parse_comments(&[body.into()]).goal.as_deref(),
            Some("市场 skill 太多,本周打磨出若干精品 skill。")
        );
    }

    #[test]
    fn validate_requires_three_headings() {
        assert!(validate_comment("## 版本目标\n一句话\n").is_err());
        assert!(
            validate_comment("## 版本目标\n一句话\n## 本周纳入\n- #2\n## 本周指标读数\n快照")
                .is_ok()
        );
    }

    #[test]
    fn empty_goal_section_is_none() {
        assert!(parse_comments(&["## 周目标\n\n## 本周纳入\n".into()])
            .goal
            .is_none());
    }

    #[test]
    fn newest_progress_wins_independently() {
        let plan = "## 版本目标\n\n推到能演示。\n\n## 本周纳入\n- #2\n\n## 本周指标读数\n快照";
        let old = "## 每周进展 2026-W35\n\n旧的一句。";
        let new = "## 每周进展 2026-W36\n\n合入了会话屏,发版还没动。";
        let p = parse_comments(&[plan.into(), old.into(), new.into()]);
        assert_eq!(p.goal.as_deref(), Some("推到能演示。"));
        assert_eq!(p.progress.as_deref(), Some("合入了会话屏,发版还没动。"));
        assert_eq!(
            all_progress_text(&[plan.into(), old.into(), new.into()]).as_deref(),
            Some("2026-W36\n合入了会话屏,发版还没动。\n\n2026-W35\n旧的一句。")
        );
    }

    #[test]
    fn monday_comment_has_no_progress() {
        let body = "## 版本目标\n一句话\n## 本周纳入\n- #2\n## 本周指标读数\n快照";
        let p = parse_comments(&[body.into()]);
        assert_eq!(p.goal.as_deref(), Some("一句话"));
        assert!(p.progress.is_none());
    }

    #[test]
    fn multiline_goal_keeps_the_whole_section() {
        let body =
            "## 周目标\n\n本周清共性小问题,催熟通知。\n- 通知:#4\n- 会话:#1\n\n## 本周纳入\n- #4\n";
        assert_eq!(
            parse_comments(&[body.into()]).goal.as_deref(),
            Some("本周清共性小问题,催熟通知。\n- 通知:#4\n- 会话:#1")
        );
    }

    #[test]
    fn render_create_version_comment() {
        let empty = render_week_plan_comment(&[]);
        assert!(validate_comment(&empty).is_ok());
        assert_eq!(parse_comments(&[empty]).goal.as_deref(), Some("（未填写）"));
        let body = render_week_plan_comment(&[12, 15]);
        assert!(validate_comment(&body).is_ok());
        assert!(body.contains("- #12"));
        assert!(body.contains("- #15"));
        assert_eq!(parse_comments(&[body]).goal.as_deref(), Some("（未填写）"));
    }
}
