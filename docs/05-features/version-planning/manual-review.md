# 从计划页签走周一屏

> 在本分支启动 Workbench，打开已接入项目，进入计划页签。版本材料保存在独立 bw/week-plan；功能改动与计划归档 PR 分开。

## 本机启动

```powershell
pnpm run dev:workbench
```

保持窗口可见（不要设 `ORCA_BACKGROUND_LAUNCH=1`）。打开项目后进入计划页签：右侧原生三屏读写 JSON；若左侧 `bw/week-plan` 会话是空的或接回的旧会话，关掉后再进一次，让它新开 Claude 以注入 SYSTEM + week-planning。

规划工作目录是项目 `.bw/worktrees/week-plan`，分支 `bw/week-plan`。已有草稿会恢复。不要运行 `planning.py start`。

手动诊断读写：

```powershell
python standard/skills/week-planning/scripts/planning.py --workspace <规划工作树绝对路径> --version <版本> read
```

## 实战顺序

1. 核对第一屏目标、指标读数、真实 Issue 进展；主动补版本报告，缺事实再问人。
2. 模型和 Builder 拟定本版 SMART 目标，提醒存量 Issue 是否纳入，整理风险与前序结果摘要。
3. 带会议版给 Leader，现场修改目标并记录核心决定；会后提供链接或手工纪要，消化后继续同份目标。
4. 拆解/复用任务 Issue，规范标题、Bug/Feature、版本与工作类别标签、正文；读回编号链接后确认最终计划。
5. 会话按项目门禁提计划归档 PR，Leader 审核。不要合入功能 PR 来代替计划审核，也不自动关闭 Issue。

## 仍需现场材料

当前会话列表接口仍可能缺标题；缺失正常留空，不伪造。会议链接转写脚本和纪要规范使用项目实际配置，缺失时先保留现场记录/用户手填纪要。
