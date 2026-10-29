# Codex 执行与会话反哺

> Codex 在 Windows 操作 BW 真壳或提取本次会话时读取对应部分。本文维护本工具的命令、格式与失败处理；验证规则与六项口径仍由 Skill 的交付约定和真实任务反馈定义。启动入口、Codex 记录格式或脚本变化时更新；不要求 Claude 加载 Codex 的细节。

## 启动与复验

1. 在任务 worktree 核对根目录、分支与 HEAD；抓取最新目标分支后按任务需要同步，保留未提交改动。先查已有真壳/开发服务及 lint、tsc、测试进程，核对命令行、目录与窗口，归属不明不关别人的实例。可复用且源码匹配的实例优先复用。
2. 本机真壳与本地 CI 严禁并发；测试 agent 与工作 agent 交接后顺序运行。先停本次重检查再起壳；先关本次壳和开发服务、确认退出再跑检查。CI 可降低 worker、逐个 TypeScript 项目串行，不把多核当作内存充裕。
3. 按项目 setup 准备已有依赖和 Electron runtime。已有安装时使用下列已由真实 Issue 验证过的入口，避免 `pnpm exec` 或前置依赖检查意外触发并发安装。缺依赖时明确处理一次 setup，不循环尝试不同路径。Windows 的 `dev:workbench` 含 POSIX 环境赋值，PowerShell 直接设置同样环境再调用原生 runner：

```powershell
$taskRoot = (git rev-parse --show-toplevel).Trim()
$env:WORKBENCH_SHELL = '1'
$env:VITE_WORKBENCH_SHELL = '1'
$env:ORCA_PRODUCT_NAME = 'Workbench'
$env:ORCA_DEV_USER_DATA_PATH = Join-Path $taskRoot '.bw/runtime/verification/profile'
$env:REMOTE_DEBUGGING_PORT = '9337' # 先查端口归属；被占用时选空闲端口
node config/scripts/run-electron-vite-dev.mjs
```

4. 记录 runner 输出的实际 Vite/CDP 地址、源码 SHA 与 profile。通过当前可用的 computer-use 工具检查窗口，先读该工具技能；允许使用 CDP 时，`http://127.0.0.1:9337/json/version` 可确认调试服务，连接后仍需核对窗口与工作树。不要把“端口已开”当成应用已加载。
5. 改 renderer 后沿用当前开发壳的热更新，先确认新代码已加载；main/preload、runner、依赖或持久化恢复验证需要重启。重启只停止本次 PID 及其开发服务，保留同一隔离 profile 和测试数据再运行上面入口。基线与修复保持相同数据/配置前提；需要修改前证据时先在未修改基线采集，不能用新代码截图补造旧结果。
6. 输出和 profile 留 `.bw/runtime/`，避免 `.scratch/` 内生成的脚本被全仓 lint 误扫。要后台启动时用 PowerShell `Start-Process -WindowStyle Hidden`，保存 PID/日志路径。验证结束及时关闭本次实例，不删除别人的 profile。Node 工具从当前 worktree 的真实安装解析；使用持久 Node REPL 时可用 `createRequire(<实际仓根>/package.json)` 加载 `playwright-core`，不反复猜包导出入口。

项目启动正源是 `package.json`、`config/scripts/run-electron-vite-dev.mjs`、`config/scripts/dev-workbench-env.mjs`；命令变化时查这些实际文件。低内存时 `pnpm run typecheck` 的 runner 会并行三个项目，改用现有 `typecheck:node`、`typecheck:cli`、`typecheck:web` 逐项运行；已安装工具优先直接调用，pnpm 的依赖预检触发安装时先停下。完整门禁放远端 CI 时，明确本地未执行范围。

## 会话反哺

原始记录优先从 `$CODEX_HOME/sessions` 找；未设时用用户目录的 `.codex/sessions`。按会话 ID 定位文件，不扫描所有正文；会话名可用桌面 `list_threads` 找 ID。不要读取凭据或用 BW PTY 测试捕获脚本冒充会话导出。

```powershell
$taskCodexHome = $env:CODEX_HOME
if (-not $taskCodexHome) { $taskCodexHome = Join-Path $env:USERPROFILE '.codex' }
rg --files (Join-Path $taskCodexHome 'sessions') -g '*会话ID*.jsonl'
node .claude/skills/workbench-start/scripts/codex-session-feedback.mjs extract --input 原始.jsonl --out 提取.json
```

提取脚本优先使用 `event_msg/item_completed` 的 `UserMessage`、`AgentMessage`；旧记录回退到带用户来源的 `response_item/message` 或 `event_msg/user_message`。同一条在不同存储表示里只取一次，保留真实重复发送供模型判断。AGENTS、环境注入、工具回显和子 agent 不当用户输入。正文不可读、格式损坏或历史截断时保留缺口，不能继续生成零值。

模型读取提取结果与实际 PR 评审后，写一个本地标注 JSON，再运行同一脚本的 `report` 子命令。标注包含 Issue/PR URL、方法版本、首次交付消息 ID、覆盖范围、逐条用户输入摘要/标签、模型提问标签、首次评审结论与证据、返工重新交付 ID；具体字段和合法标签运行 `schema` 查看。标注只做有原文的语义判断，不按关键词猜“该不该问”；去重需明确指向原消息，返工后的参与按交付阶段分开。

```powershell
node .claude/skills/workbench-start/scripts/codex-session-feedback.mjs schema
node .claude/skills/workbench-start/scripts/codex-session-feedback.mjs report --input 提取.json --annotations 标注.json --out 评论.md --json 指标.json
gh pr comment PR编号 --body-file 评论.md
```

先审阅生成的评论、核对目标 PR 与当前授权，再执行最后一条发布命令。重复运行时按评论中的稳定标记找到自己上次发布的评论并更新，不连续新发。评论只含六项计数、权限请求、必要用户输入摘要与覆盖范围，原文和提取产物留本地；人审前填待审，人审或返工后重跑并更新。不把脚本运行成功说成已证明下一条任务的 workflow 改善，也不把本地工具称为版本总览已接通。
