//! 第一次接入时的仓探测:历史、自己的约定。写进「项目约定」正文当证据。
//! 不再往仓里摊模板。

use std::path::Path;

/// 接入探测:这张活要跑几步。全部现算,不问用户。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct BootstrapProbe {
    /// 仓是 Workbench 自己建的(根提交作者是 Workbench)—— 直推,不走 MR。
    pub owned: bool,
    /// 仓根已经有 README / CLAUDE.md / AGENTS.md —— 这个仓自己已经有一套约定了。
    ///
    /// **这条不触发铺底的任何一步。** 铺底只铺 `.bw/`(Workbench 自己的资产),
    /// 仓根一个字不写。要不要给这个项目写一份开发手册,是资产盘点(运作活②)
    /// 首次模式去问人的事 —— 那是在改人家的项目,得先问过。这条只是写进活的
    /// 正文当证据,顺带给将来那次盘点当输入。
    pub has_own_conventions: bool,
    /// 有历史(提交数 > 1、有标签、有 CHANGELOG)—— 触发资产盘点首次模式(打周标签)。
    pub has_history: bool,
    /// 写进这张活说明里的证据句子。评审的人不用猜这张活为什么跑了这几步。
    pub reasons: Vec<String>,
}

/// Workbench 自己 scaffold 出来的空仓,根提交作者就是这个名字。
const OWNED_AUTHOR: &str = "Builders' Workbench";

pub async fn probe(workspace: &Path) -> BootstrapProbe {
    let mut p = BootstrapProbe::default();
    if !crate::git::is_repo(workspace).await {
        p.reasons
            .push("这个目录还不是 git 仓,只写核心件、不提交".into());
        return p;
    }

    let author = crate::git::root_commit_author(workspace)
        .await
        .unwrap_or_default();
    p.owned = author == OWNED_AUTHOR;

    let commits = crate::git::commit_count(workspace).await.unwrap_or(0);
    let tags = crate::git::tags(workspace).await.unwrap_or_default();
    let has_changelog = ["CHANGELOG.md", "RELEASES.md", "CHANGELOG"]
        .iter()
        .any(|f| workspace.join(f).is_file());

    p.has_own_conventions = ["README.md", "CLAUDE.md", "AGENTS.md"]
        .iter()
        .any(|f| workspace.join(f).is_file());
    // 1 条提交 = Workbench 自己那次 scaffold,不算历史。
    p.has_history = commits > 1 || !tags.is_empty() || has_changelog;

    p.reasons.push(format!("仓有 {commits} 条提交"));
    p.reasons.push(format!("{} 个标签", tags.len()));
    if p.has_own_conventions {
        p.reasons
            .push("仓根已有 README / CLAUDE.md / AGENTS.md(这个仓自己有约定,铺底不碰)".into());
    }
    if has_changelog {
        p.reasons.push("仓根有 CHANGELOG / RELEASES".into());
    }
    p
}

#[cfg(test)]
mod bootstrap_list_tests {
    #[test]
    fn adopt_list_does_not_include_standard_toml() {
        let targets: Vec<&str> = crate::standard::CORE_TEMPLATES
            .iter()
            .map(|t| t.target)
            .collect();
        assert!(targets.is_empty(), "第一次接入不再摊 issue-policy");
    }
}
