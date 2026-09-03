//! 运作活①评论里的版本计划段落。界面取「版本目标」和「每周进展」;
//! 纳入清单和读数快照留在 issue 评论里给人点开看。
//!
//! 多条评论从新到旧扫,同一段以最新一条为准。认不出标题就当没有,
//! 不猜正文。

/// 机器认的周初三个二级标题。agent 必须写这两个字,括号说明可以跟在后面。
pub const HEADING_GOAL: &str = "版本目标";
pub const HEADING_SCOPE: &str = "本周纳入";
pub const HEADING_READINGS: &str = "本周指标读数";
/// 周五收口。周初三标题评论不要带这一段;`validate_comment` 也不查它。
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

/// 运作活①评论现算出的版本目标 / 每周进展。键是 ISO 周**和** `bw:plan:` 版本名。
#[derive(Debug, Clone, Default)]
pub struct Ops1Notes {
    pub goals: std::collections::HashMap<String, String>,
    pub progress: std::collections::HashMap<String, String>,
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

/// `## 版本目标` 到下一个 `##` 的整段,保留换行。前后空行去掉。
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

impl super::App {
    /// 运作活①评论里解析出的版本目标与每周进展。键是 ISO 周**和** `bw:plan:`
    /// 版本名(有就各写一份),总览按版本名取,健康仍按本周取目标。读失败就空着,
    /// 不挡整屏。活与活互不依赖,评论两两并行拉。
    pub async fn week_goals_from_ops1(
        &self,
        project: &crate::model::Project,
        issues: &[crate::model::Issue],
    ) -> Ops1Notes {
        let current = crate::isoweek::current_week();
        let jobs: Vec<(String, String, u32)> = issues
            .iter()
            .filter(|i| crate::version::is_ops1_title(&i.title))
            .map(|i| {
                let week =
                    crate::isoweek::week_of_unix(i.created_at).unwrap_or_else(|| current.clone());
                (week, i.plan_version.clone(), i.id.iid())
            })
            .collect();
        let mut out = Ops1Notes::default();
        let mut i = 0;
        while i < jobs.len() {
            if i + 1 < jobs.len() {
                let (a, b) = tokio::join!(
                    super::issue_store::list_comments(self, project, jobs[i].2),
                    super::issue_store::list_comments(self, project, jobs[i + 1].2),
                );
                insert_notes(&mut out, &jobs[i].0, &jobs[i].1, a);
                insert_notes(&mut out, &jobs[i + 1].0, &jobs[i + 1].1, b);
                i += 2;
            } else {
                let a = super::issue_store::list_comments(self, project, jobs[i].2).await;
                insert_notes(&mut out, &jobs[i].0, &jobs[i].1, a);
                i += 1;
            }
        }
        out
    }
}

fn insert_notes(out: &mut Ops1Notes, week: &str, plan: &str, bodies: super::Result<Vec<String>>) {
    let Ok(bodies) = bodies else {
        return;
    };
    let parsed = parse_comments(&bodies);
    if let Some(goal) = parsed.goal {
        out.goals.insert(week.to_string(), goal.clone());
        if !plan.is_empty() && plan != week {
            out.goals.insert(plan.to_string(), goal);
        }
    }
    if let Some(progress) = parsed.progress {
        out.progress.insert(week.to_string(), progress.clone());
        if !plan.is_empty() && plan != week {
            out.progress.insert(plan.to_string(), progress);
        }
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
}
