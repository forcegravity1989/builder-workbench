use super::{AppError, Result};
use crate::model::{Issue, Project};
use std::path::{Path, PathBuf};

pub(super) struct IssueTree {
    pub path: PathBuf,
    pub branch: String,
    /// false 表示未创建独立分支；非 Git 目录和空仓均可能如此。
    pub isolated: bool,
}

pub(super) async fn provision_for(main: &Path, issue: &Issue) -> Result<IssueTree> {
    let branch = super::issue_store::work_branch(issue);
    if branch == bw_engine::workspace::PROJECT_BRANCH {
        return provision_project(main).await;
    }
    if branch == bw_engine::workspace::WEEK_PLAN_BRANCH {
        return provision_week_plan(main).await;
    }
    if branch == bw_engine::workspace::OPS_AUDIT_BRANCH {
        return provision_ops_audit(main).await;
    }
    provision(main, issue.number).await
}

async fn provision_week_plan(main: &Path) -> Result<IssueTree> {
    if !crate::git::is_repo(main).await || !crate::git::has_head(main).await {
        let branch = crate::git::current_branch(main)
            .await
            .unwrap_or_else(|_| "—(不是 git 仓或还没有提交)".into());
        return Ok(IssueTree {
            path: main.to_path_buf(),
            branch,
            isolated: false,
        });
    }
    let path = bw_engine::workspace::provision_week_plan_worktree(main)
        .await
        .map_err(|e| AppError::Exec(format!("给定版本计划开 worktree 没成:{e}")))?;
    Ok(IssueTree {
        path,
        branch: bw_engine::workspace::WEEK_PLAN_BRANCH.to_string(),
        isolated: true,
    })
}

async fn provision_ops_audit(main: &Path) -> Result<IssueTree> {
    if !crate::git::is_repo(main).await || !crate::git::has_head(main).await {
        let branch = crate::git::current_branch(main)
            .await
            .unwrap_or_else(|_| "—(不是 git 仓或还没有提交)".into());
        return Ok(IssueTree {
            path: main.to_path_buf(),
            branch,
            isolated: false,
        });
    }
    let path = bw_engine::workspace::provision_ops_audit_worktree(main)
        .await
        .map_err(|e| AppError::Exec(format!("给资产盘点开 worktree 没成:{e}")))?;
    Ok(IssueTree {
        path,
        branch: bw_engine::workspace::OPS_AUDIT_BRANCH.to_string(),
        isolated: true,
    })
}

/// 给此 Issue开(或接着用)一棵 worktree。
///
/// 不是 git 仓就退回主工作区,`isolated=false`;是 git 仓但开不出来就**如实
/// 报错**,不悄悄退回主工作区 —— 那等于把「两个 Issue撞车」的风险藏起来。
pub(super) async fn provision(main: &Path, number: u32) -> Result<IssueTree> {
    if !crate::git::is_repo(main).await {
        let branch = crate::git::current_branch(main)
            .await
            .unwrap_or_else(|_| "—(不是 git 仓)".into());
        return Ok(IssueTree {
            path: main.to_path_buf(),
            branch,
            isolated: false,
        });
    }
    // **一条提交都还没有的仓开不了 worktree** —— 没有 HEAD 就没有东西可以拿来
    // 开分支,git 会顶回来一句 `invalid reference: bw/issue-N`。刚建出来的空仓
    // 就是这样。这时候就地写,第一提交直接落在主分支上(写明的
    // 那条例外:新建的空仓首提交直推)。
    if !crate::git::has_head(main).await {
        let branch = crate::git::current_branch(main)
            .await
            .unwrap_or_else(|_| "—(读不出分支名)".into());
        return Ok(IssueTree {
            path: main.to_path_buf(),
            branch,
            isolated: false,
        });
    }
    let path = bw_engine::workspace::provision_issue_worktree(main, number)
        .await
        .map_err(|e| AppError::Exec(format!("Issue #{number} 的工作树创建失败：{e}")))?;
    Ok(IssueTree {
        path,
        branch: bw_engine::workspace::issue_branch(number),
        isolated: true,
    })
}

/// 给「项目约定」开(或接着用)常驻树,分支 `bw/project`。
///
/// 不是 git 仓 / 还没有 HEAD:就地写,`isolated=false`(空仓首提交那条例外)。
pub(super) async fn provision_project(main: &Path) -> Result<IssueTree> {
    if !crate::git::is_repo(main).await || !crate::git::has_head(main).await {
        let branch = crate::git::current_branch(main)
            .await
            .unwrap_or_else(|_| "—(不是 git 仓或还没有提交)".into());
        return Ok(IssueTree {
            path: main.to_path_buf(),
            branch,
            isolated: false,
        });
    }
    let path = bw_engine::workspace::provision_project_worktree(main)
        .await
        .map_err(|e| AppError::Exec(format!("给项目约定开 worktree 没成:{e}")))?;
    Ok(IssueTree {
        path,
        branch: bw_engine::workspace::PROJECT_BRANCH.to_string(),
        isolated: true,
    })
}

/// 工作树有未提交改动时保留并返回 false；成功删除返回 true。
pub(super) async fn remove_if_clean(main: &Path, tree: &Path) -> bool {
    if tree == main || !tree.is_dir() {
        return false;
    }
    match crate::git::is_dirty(tree).await {
        Ok(false) => {}
        // 脏的、或者连脏不脏都读不出来 —— 都不动它。
        _ => return false,
    }
    let Some(s) = tree.to_str() else { return false };
    if crate::git::worktree_remove(main, s).await.is_err() {
        return false;
    }
    true
}

/// 开 MR 的结果。`number == 0` = 没有 MR,`note` 说明为什么 —— 两件事永远一起
/// 走,界面上不会出现一个来历不明的空号。
pub(super) struct MrOutcome {
    pub number: u32,
    pub note: String,
}

impl MrOutcome {
    pub fn none(why: &str) -> MrOutcome {
        MrOutcome {
            number: 0,
            note: why.to_string(),
        }
    }
}

/// has_work 由调用方判断，表示分支是否存在可评审的改动。
pub(super) async fn push_and_open_mr(
    project: &Project,
    tree: &IssueTree,
    has_work: bool,
    title: &str,
    body: &str,
) -> MrOutcome {
    if !has_work {
        return MrOutcome::none("这条分支上没有可评审的改动,没开");
    }
    if !tree.isolated {
        return MrOutcome::none(
            "未创建独立分支，无法提交 MR（工作区不是 Git 仓库，或创建工作树时仓库尚无提交）；改动已保存在原工作区",
        );
    }
    if !project.has_remote() {
        return MrOutcome::none("这个项目还没挂远端,分支只在本机(合的时候直接 merge 这个分支)");
    }
    if let Err(e) = crate::git::push_branch(&tree.path, &tree.branch).await {
        return MrOutcome::none(&format!("推分支没成,原话:{e}"));
    }
    let remote = match bw_engine::remote::Remote::for_project(
        &project.provider,
        &project.remote_host,
        &project.remote_path,
    ) {
        Ok(r) => r,
        Err(e) => return MrOutcome::none(&format!("认不出远端类型:{e}")),
    };
    match remote
        .create_mr_on_branch(&tree.path, &tree.branch, title, body)
        .await
    {
        Ok(pr) => MrOutcome {
            number: pr.number(),
            note: format!("#{}", pr.number()),
        },
        Err(e) => MrOutcome::none(&format!("开 MR 没成,原话:{e}")),
    }
}
