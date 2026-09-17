# 从 PR 分支走 BW 自身的周一屏

> 在功能分支启动 BW，打开已接入的 workbench 项目，从 Orca 原“定版本计划（Workbench）”任务起会话。版本材料保存在独立 bw/week-plan，功能 PR 与计划归档 PR 分开。

## 本机启动

开发目录：`E:/zhuyu/code/builder-workbench/.bw/worktrees/version-planning`，分支 `codex/version-planning`。

```powershell
Set-Location E:/zhuyu/code/builder-workbench/.bw/worktrees/version-planning
cargo run -p app-shell
```

保持 Orca 打开，在 BW 打开 workbench 项目。BW 会摊开完整 Skill，并创建或更新原“定版本计划（Workbench）”自动化；保留原定时、启用状态和 provider。新建任务默认未启用，首用点 Orca 的“立即运行”，需要长期定时再开启。无需把本文粘成第二份自动化提示词。

本机真实规划工作目录：`E:/zhuyu/code/builder-workbench/.bw/worktrees/week-plan`，分支 `bw/week-plan`；已有 v0.4 草稿会恢复，目标仍由这次会话讨论形成。此前填写的结果材料原样保留。若用户决定另开版本，Skill 初始化空 default 后再定版号，不重置旧稿。

Skill 会运行已分发的 planning.py start 并在会话浏览器打开完整 URL。手动诊断也可以运行：

```powershell
python E:/zhuyu/code/builder-workbench/.bw/worktrees/version-planning/standard/skills/week-planning/scripts/planning.py --workspace E:/zhuyu/code/builder-workbench/.bw/worktrees/week-plan --version v0.4 start
```

## 实战顺序

1. 核对第一屏目标、指标读数、真实 Issue 进展；主动补版本报告，缺事实再问人。
2. 模型和 Builder 拟定本版 SMART 目标，提醒存量 Issue 是否纳入，整理风险与前序结果摘要。
3. 带会议版给 Leader，现场修改目标并记录核心决定；会后提供链接或手工纪要，消化后继续同份目标。
4. 拆解/复用任务 Issue，规范标题、Bug/Feature、版本与工作类别标签、正文；读回编号链接后确认最终计划。
5. 会话按项目门禁提计划归档 PR，Leader 审核。不要合入功能 PR 来代替计划审核，也不自动关闭 Issue。

## 仍需现场材料

当前 Orca 公共 CLI 只有工作树/当前终端列表，未找到历史 Cursor/Claude 会话列表接口；会话标题缺失正常留空，不伪造。会议链接转写脚本和纪要规范使用项目实际配置，缺失时先保留现场记录/用户手填纪要。这两项不伪装成已经自动采集。
