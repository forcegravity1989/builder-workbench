//! 开工工具:映射保存与探活。
//!
//! 探不到就说探不到。**没接实现的工具返回「不知道」**,不报绿也不报红——项目墙
//! 那条「测一下」上,灰项和红项是两件不同的事。

use super::{App, AppError, Result};
use crate::command::{Event, ProbeResult};
use crate::local::Settings;
use crate::model::{category_key, Category, ProjectId};

impl App {
    /// 本机「我用什么工具」。只写 `asset_root/settings.toml`,不碰被管仓。
    /// `workflow` 是产品编译默认,命令里带着是为少改 Command 形状,这里不存。
    pub(super) async fn save_tool_mapping(
        &mut self,
        _project_id: ProjectId,
        category: Category,
        tool: String,
        _workflow: String,
    ) -> Result<Vec<Event>> {
        Settings::set_tool(&self.asset_root, category_key(category), &tool)?;
        Ok(vec![Event::ToolMappingSaved { category }])
    }

    /// 改工作区根目录。存 `app_meta`,进程内立刻生效。
    ///
    /// **已接入的项目一个都不动** —— 但这件事不是自动成立的:接入时没填仓路径的
    /// 项目,库里那一列是空的,`workspace_of` 每次都拿**当下**的根目录现拼
    /// (`<根目录>/<slug>`)。所以改根目录之前必须先把它们**钉死**:把各自当下
    /// 算出来的绝对路径写回库里。不钉的话,改一下根目录,已有项目就集体指到一个
    /// 空目录 —— 仓还在硬盘上,但 Workbench 全看不见了(健康变灰、文件树全空)。
    ///
    /// 钉死是一次性的:钉完之后它们和「根目录」再没有关系。**不搬目录** —— 真要
    /// 搬得先解决"仓里有没有没提交的改动、worktree 还开着没有",那是另一件事。
    pub(super) async fn set_workspaces_root(&mut self, path: String) -> Result<Vec<Event>> {
        let path = path.trim().to_string();
        if path.is_empty() {
            return Err(AppError::Refused("工作区根目录不能是空的".into()));
        }
        let p = std::path::PathBuf::from(&path);
        if !p.is_absolute() {
            return Err(AppError::Refused(format!(
                "「{path}」不是绝对路径 —— 相对路径会跟着进程从哪儿启动而变,填全路径"
            )));
        }
        // 建不出来就别存:存了等于把一个用不了的路径留给下一次接入。
        std::fs::create_dir_all(&p)
            .map_err(|e| AppError::Refused(format!("这个目录建不出来:{e}")))?;
        // 先钉死,再换根目录 —— 顺序反了就钉不出老路径了。
        let mut pinned = 0u32;
        for project in self.projects().await? {
            if project.workspace_path.trim().is_empty() {
                let here = self.workspaces_root.join(&project.slug);
                self.set_project_workspace_path(project.id, &here.display().to_string())
                    .await?;
                pinned += 1;
            }
        }
        self.set_workspaces_root_setting(&path).await?;
        self.workspaces_root = p;
        Ok(vec![Event::WorkspacesRootChanged { path, pinned }])
    }

    /// 改 Orca 网页地址(会话屏 iframe 打开的配对 URL)。只存本机设置,
    /// 不进仓。loopback 校验在**读侧**(`bw_engine::orca::web_embed_url` 用
    /// `looks_loopback_http`)——这里存什么不报错,非 loopback 在会话屏被如实
    /// 滤成空(人贴错看空就知道)。事件不带 URL 原文(配对 URL 带 token)。
    pub(super) async fn set_orca_web_url(&mut self, url: String) -> Result<Vec<Event>> {
        let url = url.trim().to_string();
        self.set_orca_web_url_setting(&url).await?;
        Ok(vec![Event::OrcaWebUrlChanged])
    }

    /// 改界面配色。只存本机设置;不认识的值当默认。
    pub(super) async fn set_theme(&mut self, theme: String) -> Result<Vec<Event>> {
        let theme = theme.trim().to_string();
        self.set_theme_setting(&theme).await?;
        Ok(vec![Event::ThemeChanged { theme }])
    }

    pub(super) async fn probe_tool(&mut self, name: String) -> Result<Vec<Event>> {
        let result = probe(&name).await;
        Ok(vec![Event::ToolProbed { name, result }])
    }

    /// 桌面宠物:Codex 内置宠物 → Clawd 宠物包。只碰 `~/.codex/pets/`,不碰 Clawd 的目录。
    pub(super) async fn export_codex_pets(&mut self) -> Result<Vec<Event>> {
        let out = tokio::task::spawn_blocking(bw_engine::clawd::export_codex_pets)
            .await
            .map_err(|e| AppError::Exec(format!("导出任务没跑完:{e}")))?
            .map_err(AppError::Exec)?;
        Ok(vec![Event::CodexPetsExported {
            pets_dir: out.pets_dir.display().to_string(),
            written: out.written,
            skipped: out.skipped,
            missing: out.missing,
        }])
    }
}

/// 活上记着的开工工具 → 真正要起的那个 CLI。
///
/// **开工必须照活上记的工具走,不许悄悄换。** 把这条写死了:
/// 「选了 Cursor 但探活失败 → 开工前置校验直接拒绝报错,**不悄悄退回 Claude
/// CLI** —— 静默换工具会让人以为在用一个工具、实际在用另一个」。这个函数在
/// 2026-08-21 之前不存在,四处开工点全是写死的 `&CLAUDE`,于是人在配置屏选了
/// 别的工具、卡面也挂着那个标签,跑起来的却始终是 claude —— 正是那条规矩要
/// 防的事,而且方向是最坏的那个(默默顶上,不报错)。
///
/// 空值按 Claude CLI 算:活是 Workbench 自己建的、还没配过映射时就是空的,
/// 这是默认不是「未知」。
pub fn agent_for(tool: &str) -> Result<&'static bw_engine::TuiAgentConfig> {
    match tool.trim() {
        "" | "claude_cli" => Ok(&bw_engine::CLAUDE),
        // 探活失败与「压根没接」由 `build_startup_plan` 按 `supported` 如实拒。
        "cursor" => Ok(&bw_engine::CURSOR),
        // 本机网页内嵌类,根本不是起一个终端子进程 —— 拿终端那条路去起它,
        // 起出来的一定不是人要的东西,所以这里直接拒,不往下走。
        // (内嵌视图在会话屏的「Open Design」标签里,经 `run_issue` 的 open_design
        // 分支打开;这条 agent_for 只服务终端类工具的 resume/attach。)
        "open_design" => Err(AppError::Exec(
            "这张活配的开工工具是 Open Design(本机网页内嵌类),不经过终端。\
             去会话屏的「Open Design」标签用内嵌视图干活;要换 Claude CLI 干这张活,\
             先在活详情里把开工工具改掉。"
                .into(),
        )),
        other => Err(AppError::Exec(format!(
            "活上记着的开工工具是「{other}」,Workbench 不认识它 —— 不猜、不拿别的工具顶上。\
             去配置屏的「类别 → 开工工具」里改掉,或者在活详情里改这一张。"
        ))),
    }
}

/// 活上记着的开工工具 → Orca 里要用的 agent 名(给 `orca::create_session` /
/// `reveal_tree`)。和 [`agent_for`] 同源 —— 都照活上记的工具走,不许悄悄换;
/// 只是这里返回的是 Orca 的 agent 名字符串,不是 PTY 那套 `TuiAgentConfig`。
/// Open Design 仍走 OD 分支,不打 Orca(这里拒,和 `agent_for` 一致)。探活失败
/// 仍拒绝开工,不退回 Claude。
pub fn orca_agent(tool: &str) -> Result<&'static str> {
    match tool.trim() {
        "" | "claude_cli" => Ok("claude"),
        // Orca 的 createAgentSession 预设名是 `cursor`(isTuiAgent);
        // `cursor-agent` 是启动二进制,打出去会被拒成 Unknown agent preset。
        "cursor" => Ok("cursor"),
        "open_design" => Err(AppError::Exec(
            "这张活配的开工工具是 Open Design(本机网页内嵌类),不经 Orca。\
             去会话屏的「Open Design」组件用内嵌视图干活。"
                .into(),
        )),
        other => Err(AppError::Exec(format!(
            "活上记着的开工工具是「{other}」,Workbench 不认识它 —— 不猜、不拿别的工具顶上。\
             去配置屏的「类别 → 开工工具」里改掉,或者在活详情里改这一张。"
        ))),
    }
}

async fn probe(name: &str) -> ProbeResult {
    match name {
        // Claude CLI 沿用既有的候选路径探测(Windows 上要认 `claude.cmd`)。
        "claude_cli" => match bw_engine::resolve_claude_binary(None) {
            Some(p) => ProbeResult::Found(p),
            None => ProbeResult::Missing("本机路径里找不到 claude".into()),
        },
        "cursor" => match version_of("agent", &["--version"]).await {
            Some(v) => ProbeResult::Found(v),
            None => ProbeResult::Missing("本机找不到 cursor 的 agent 二进制".into()),
        },
        "open_design" => match bw_engine::open_design::discover_web_url().await {
            Some(url) => ProbeResult::Found(format!("本机 Open Design 在听:{url}")),
            None => ProbeResult::Missing(
                "本机 Open Design 没起来,或没探到它的 web 端口(命名管道握手没拿到 loopback URL)"
                    .into(),
            ),
        },
        // 内部同事在做的群工具。留着位置,如实说「还没接」。
        "welink_cli" => ProbeResult::Unknown("welink-cli 还没接,探不出结果".into()),
        other => ProbeResult::Unknown(format!("没有 {other} 的探活实现")),
    }
}

async fn version_of(bin: &str, args: &[&str]) -> Option<String> {
    let out = bw_engine::tokio_cmd(bin)
        .args(args)
        .stdin(std::process::Stdio::null())
        .output()
        .await
        .ok()?;
    out.status.success().then(|| {
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::orca_agent;

    #[test]
    fn orca_preset_is_cursor_not_binary_name() {
        assert_eq!(orca_agent("claude_cli").unwrap(), "claude");
        assert_eq!(orca_agent("cursor").unwrap(), "cursor");
        assert!(orca_agent("open_design").is_err());
    }
}
