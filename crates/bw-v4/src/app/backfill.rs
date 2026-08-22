//! 老项目历史回填 —— 运作活②「资产盘点」的首次模式(`mode=first`)。
//!
//! 刀5(2026-08-22)迁完:不再写 `.bw/plan/*.md` 周计划文件、不再写
//! `.bw/releases.md` 发版记录行。历史发版改在远端建 codehub/GitHub Release
//! (按 git 标签,幂等);回填报告挂 ops② 首次 issue 的评论(如实报「回填了
//! N 个历史发版、M 个历史周」)。agent 读文本补名片那半仍留给站⑥(不碰)。
//!
//! 四条防伪规则,每一条都是预研里真踩出来的:
//!
//! 1. **合入按双亲结构判定**(`git log --merges`),不按提交消息里的文字匹配。
//! 2. **没有标签就诚实留空**,绝不拿提交日期倒推一个版本号出来。
//! 3. **周目标不倒推**。历史周当时没写过周目标,回填就说「未发现」。
//! 4. **回填的东西不点灯**。历史发版只解释过去,健康灯的判据一条都不读它们。

use super::{issue_store, App, Result};
use crate::command::Event;
use crate::isoweek;
use crate::model::ProjectId;
use v4_engine::remote::Remote;

/// 往前最多回填多少周。两年 —— 再往前的周文件对今天的管理没有帮助,只是把
/// `.bw/plan/` 撑大。扫到就停,不是"扫不动",这一条如实写进回填报告。
const MAX_WEEKS: usize = 104;

impl App {
    pub(super) async fn backfill_history(&mut self, project_id: ProjectId) -> Result<Vec<Event>> {
        let ws = self.workspace_of(project_id).await?;
        if !crate::git::is_repo(&ws).await {
            return Ok(vec![Event::HistoryBackfilled {
                project_id,
                weeks: Vec::new(),
                releases: Vec::new(),
                note: "这个目录不是 git 仓,没有历史可回填".into(),
            }]);
        }

        let Some(first) = crate::git::first_commit_date(&ws).await else {
            return Ok(vec![Event::HistoryBackfilled {
                project_id,
                weeks: Vec::new(),
                releases: Vec::new(),
                note: "仓里一条提交都没有,没有历史可回填".into(),
            }]);
        };

        // ── 历史周(只统计,不写文件)──────────────────────────────
        let current = isoweek::current_week();
        let mut week =
            time::Date::parse(&first, &time::format_description::well_known::Iso8601::DATE)
                .map(isoweek::iso_week_of)
                .unwrap_or_else(|_| current.clone());

        let mut chain = Vec::new();
        while week != current {
            let this = week.clone();
            let Some(next) = isoweek::next_week(&this) else {
                break;
            };
            chain.push(this);
            week = next;
            if chain.len() > 4000 {
                break;
            }
        }
        let truncated = chain.len() > MAX_WEEKS;
        let skipped_old = chain.len().saturating_sub(MAX_WEEKS);
        if truncated {
            chain.drain(..skipped_old);
        }

        // 只统计哪些周有提交(不写文件)。
        let (all_stats, unreadable) = match crate::git::week_stats_many(&ws, &chain).await {
            Ok(m) => (m, 0usize),
            Err(_) => (Default::default(), chain.len()),
        };
        let mut weeks = Vec::new();
        for this in &chain {
            if let Some(stats) = all_stats.get(this) {
                if stats.commits > 0 {
                    weeks.push(this.clone());
                }
            }
        }

        // ── 历史发版(在远端建 Release,按 git 标签幂等)──────────────
        let project = self.project_of(project_id).await?;
        let existing: Vec<String> = if project.has_remote() {
            match Remote::for_project(
                &project.provider,
                &project.remote_host,
                &project.remote_path,
            ) {
                Ok(r) => r.list_releases().await.unwrap_or_default(),
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };
        let mut releases = Vec::new();
        if project.has_remote() {
            let remote = Remote::for_project(
                &project.provider,
                &project.remote_host,
                &project.remote_path,
            )
            .map_err(|e| super::AppError::Exec(format!("认不出远端类型:{e}")))?;
            for (tag, _date) in crate::git::tags_with_dates(&ws).await {
                if existing.contains(&tag) {
                    continue;
                }
                // 在远端建 Release(tag = title,空 note)。幂等:已存在的跳过。
                if remote
                    .create_release(&tag, &tag, "回填自 git 标签")
                    .await
                    .is_ok()
                {
                    releases.push(tag);
                }
            }
        }

        let mut note = match (weeks.len(), releases.len()) {
            (0, 0) => "没有可回填的东西:历史周都有提交但没文件可写,标签也都在远端了".to_string(),
            (w, r) => format!("回填了 {w} 个历史周(只统计不写文件)、{r} 个历史发版(远端 Release)"),
        };
        if truncated {
            note.push_str(&format!(
                ";只补了最近 {MAX_WEEKS} 周,更早的 {skipped_old} 周没扫"
            ));
        }
        if unreadable > 0 {
            note.push_str(&format!(";另有 {unreadable} 周的 git 记录读不出来,跳过了"));
        }

        // 回填报告挂 ops② 首次 issue 的评论(如果那张活在)。
        let ops2_title = format!("资产盘点 {}", current);
        if let Ok(Some(ops2)) = issue_store::find_open_by_title(&project, &ops2_title).await {
            let _ = issue_store::comment(&project, ops2.id.iid(), &note).await;
        }

        Ok(vec![Event::HistoryBackfilled {
            project_id,
            weeks,
            releases,
            note,
        }])
    }
}
