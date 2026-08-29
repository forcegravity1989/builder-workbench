//! 运作活①评论里的周计划段落。界面取「周目标」这一段(一句或一段都算);
//! 纳入清单和读数快照留在 issue 评论里给人点开看。
//!
//! 多条评论从新到旧扫,同一段以最新一条为准。认不出标题就当没有,
//! 不猜正文。

/// 机器认的三个二级标题。agent 必须写这两个字,括号说明可以跟在后面。
pub const HEADING_GOAL: &str = "周目标";
pub const HEADING_SCOPE: &str = "本周纳入";
pub const HEADING_READINGS: &str = "本周指标读数";

/// 旧评论用过的标题,只在读的时候认,新写的不许再用。
const GOAL_ALIASES: &[&str] = &["周目标", "本周目标"];

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WeekComment {
    /// `## 周目标` 到下一个二级标题之间的正文。没有或解析不到 = `None`。
    pub goal: Option<String>,
}

/// `bodies` 旧的在前。同一段以最新一条为准。
pub fn parse_comments(bodies: &[String]) -> WeekComment {
    let mut goal = None;
    for body in bodies.iter().rev() {
        if goal.is_none() {
            goal = section_text(body, GOAL_ALIASES);
        }
        if goal.is_some() {
            break;
        }
    }
    WeekComment { goal }
}

/// 挂评论之前的格式检查。只认规范标题,不认别名。
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

/// `## 周目标` 到下一个 `##` 的整段,保留换行。前后空行去掉。
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

const OPS1_PREFIX: &str = "更新指标 + 制定本周计划 ";

impl super::App {
    /// 各周运作活①评论里解析出的周目标这一段。读失败的周就空着,不挡整屏。
    pub async fn week_goals_from_ops1(
        &self,
        project: &crate::model::Project,
        issues: &[crate::model::Issue],
    ) -> std::collections::HashMap<String, String> {
        let mut out = std::collections::HashMap::new();
        for i in issues {
            let Some(week) = i.title.strip_prefix(OPS1_PREFIX).map(str::trim) else {
                continue;
            };
            let week = if i.week_of.is_empty() {
                week.to_string()
            } else {
                i.week_of.clone()
            };
            let Ok(bodies) = super::issue_store::list_comments(self, project, i.id.iid()).await
            else {
                continue;
            };
            if let Some(goal) = parse_comments(&bodies).goal {
                out.insert(week, goal);
            }
        }
        out
    }
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
        assert!(validate_comment("## 周目标\n一句话\n").is_err());
        assert!(
            validate_comment("## 周目标\n一句话\n## 本周纳入\n- #2\n## 本周指标读数\n快照").is_ok()
        );
    }

    #[test]
    fn empty_goal_section_is_none() {
        assert!(parse_comments(&["## 周目标\n\n## 本周纳入\n".into()])
            .goal
            .is_none());
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
}
