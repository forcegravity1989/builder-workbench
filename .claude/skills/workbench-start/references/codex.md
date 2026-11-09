# Codex 执行与会话反哺

> Codex 在 Windows 验证 BW、发布截图或提取会话时按需读取。本文维护工具入口、命令与失败处理；验证规则和六项口径分别归交付约定与真实任务反馈。启动入口、记录格式或脚本变化时更新，不要求 Claude 加载本工具细节。

## 真壳验证

先核对任务 worktree、分支、HEAD 与未提交改动，按需同步目标分支。首次、换机器或环境记录失效时先运行交付约定的 `prepare`，它从公共 Git 目录定位主 checkout，检查本机工具、原生 profile 与项目登记并保存忽略的记录；同机事实保留，异机信息不套用。记录是观察结果，不覆盖启动配置；`prepare` 和 `dev` 都沿用原生 `ORCA_DEV_USER_DATA_PATH` 或默认 profile。查明现有真壳、开发服务及重检查进程归属，保留他人的实例；低内存宿主真壳与本地 CI 串行，其他宿主按已确认资源安排。

按交付约定先复用稳定 dev 环境；已有匹配实例直接操作，不重复启动。需要启动时使用下列 dev 入口：它沿用原 runner 与持久 `workbench-dev` profile（Windows 默认 `%APPDATA%/workbench-dev`），保留已纳入的 BW 项目、版本和会话。自定义 profile 沿用已确认的 `ORCA_DEV_USER_DATA_PATH`，不每条 Issue 换空目录；后台启动 helper 使用 `Start-Process -WindowStyle Hidden`。开启 CDP 前先查端口归属，启动后核对实际 Vite/CDP 地址、窗口与源码；通过 computer-use 时先读对应工具技能。

```powershell
$taskRoot = (git rev-parse --show-toplevel).Trim()
node .claude/skills/workbench-start/scripts/run-bw-verification.mjs dev --root $taskRoot
```

需要一次性隔离或自动回归时，用 `tests/e2e/helpers/workbench-app.ts` 管理真实 Electron、HOME/profile、测试仓及清理。沿用已有用例；临时场景放 `.bw/runtime/verification/<issue>/`，引用该 fixture 与现有 global-setup/global-teardown，不复制启动实现：

```powershell
# 已有冒烟只证明其原判据；Issue 用本次标准路径和断言替换 grep/config。
node .claude/skills/workbench-start/scripts/run-bw-verification.mjs --root $taskRoot --grep 'BW project settings:'
node .claude/skills/workbench-start/scripts/run-bw-verification.mjs --root $taskRoot --config .bw/runtime/verification/issue-编号/playwright.config.ts --grep '本次用例'
```

隔离包装只串起现有构建与已安装 Playwright，单 worker、可见但不抢焦点；源码或产物指纹变化就重建 E2E，匹配才复用，阶段耗时记 `.bw/runtime/verification/last-run.json`。缺依赖时按项目 setup 处理一次，不用 `pnpm exec` 重复安装；锁冲突先核对 PID。

由测试 agent 从基线到修复复用同一场景文件、数据前提和截图位置；工作 agent 提供设计与判据，不另写一套临时用例重复探路。场景失败先检查当前页面、真实控件名称和遮挡，再修正标准路径；修改路径后补跑基线，不能跳过独立复验。源码修改后重新运行包装脚本，不手设 `SKIP_BUILD=1` 沿用不明产物。

dev renderer 热更新须确认加载；main/preload、依赖或持久化验证重启已获授权的本次实例，保留同一 profile 与项目数据。不能关闭仍由其他任务使用的实例。产物与截图留 `.bw/runtime/`。

运行入口正源为 `package.json` 与 `config/scripts/run-electron-vite-{dev,build}.mjs`。完整门禁串行执行；低内存时已有 `typecheck:node`、`typecheck:cli`、`typecheck:web` 分项运行，完整 CI 放远端时说明本地范围。

## 截图发布与读回

准备 manifest，例如 `{"files":[{"file":"before-plan.jpg","name":"before.jpg"},{"file":"after-plan.jpg","name":"after.jpg"}]}`。`file` 相对 manifest 所在目录或为绝对路径；`name` 为证据树中的唯一图片名。

```powershell
node .claude/skills/workbench-start/scripts/publish-pr-evidence.mjs publish --root $taskRoot --repo OWNER/REPO --branch shots/本任务分支 --manifest .bw/runtime/verification/图片清单.json --out .bw/runtime/verification/图片结果.json --push
# 在已获授权的 PR 写入验证评论后，检查 GitHub 实际渲染的图片地址。
node .claude/skills/workbench-start/scripts/publish-pr-evidence.mjs check --comment 'https://github.com/OWNER/REPO/pull/编号#issuecomment-评论ID' --out .bw/runtime/verification/评论图片检查.json
```

省略 `--push` 只准备本地证据提交。脚本不切分支、不改工作区或索引；仅收录清单图片，二进制 NUL 构树，生成钉 SHA 的 GitHub raw 地址。推送后读回图片格式和内容指纹，评论后再查渲染图片，失败时修原报告再交付。

## 会话反哺

原始记录从 `$CODEX_HOME/sessions` 找；未设置时用用户目录 `.codex/sessions`，已归档则查同一根的 `archived_sessions`。按会话 ID 定位文件，不扫描所有正文；会话名用桌面 `list_threads` 找 ID。不要读凭据或用 BW PTY 捕获脚本冒充会话导出。

```powershell
$taskCodexHome = $env:CODEX_HOME
if (-not $taskCodexHome) { $taskCodexHome = Join-Path $env:USERPROFILE '.codex' }
rg --files (Join-Path $taskCodexHome 'sessions') (Join-Path $taskCodexHome 'archived_sessions') -g '*会话ID*.jsonl'
node .claude/skills/workbench-start/scripts/codex-session-feedback.mjs extract --input 原始.jsonl --out 提取.json
node .claude/skills/workbench-start/scripts/codex-session-feedback.mjs schema
```

提取优先用 `event_msg/item_completed` 的 UserMessage/AgentMessage，旧记录回退到有用户来源的 response_item 或旧事件。存储镜像只取一次，真实重复发送留给模型判断；AGENTS、环境注入、工具回显和子 agent 不算人的输入。正文不可读、损坏或截断保留缺口，不能生成零值。

模型结合对应提问、实际 PR 评审和重新交付，逐条更新本地标注 JSON。字段与合法标签由 `schema` 给出。会话包含多次连续交付时，用 `taskStartId` 和 `taskEndId` 限定本次范围，两端都包含在内。完整覆盖须核对范围内的全部用户输入，原始提取有缺口时保留未知。交错、跨会话或仅在 GitHub 留下的评审，如果脚本无法关联到本次消息证据，相应指标保持未知。首次交付引用真正完成回执，区分正常问答、范围纠正、证据补修和代码返工。人工权限确认按实际询问批次另计，沙箱自动审核无需人工回答时不计。

同一 Issue 已有一份进入版本总览的报告时，其他独立交付在标注中设置 `prOnly: true`。脚本把 PR 复盘标记放在首行，版本总览继续从首行为 Issue 标记的报告读取。两种报告都可按 `ai-workflow` 筛选。

```powershell
node .claude/skills/workbench-start/scripts/codex-session-feedback.mjs report --input 提取.json --annotations 标注.json --out 评论.md --json 指标.json
# 首次发布。已有反馈评论时按开头两行的标记核对作者和 ID，再 PATCH 同一评论。
gh pr comment PR编号 --body-file 评论.md
@{body=(Get-Content 评论.md -Raw)} | ConvertTo-Json | Set-Content 更新.json -Encoding utf8
gh api --method PATCH repos/OWNER/REPO/issues/comments/评论ID --input 更新.json
# 读回脚本评论，核对 bw-workflow-report:v1 和指标覆盖。符合筛选条件时添加标签并读回。
gh pr edit PR编号 --add-label ai-workflow
gh pr view PR编号 --json labels,comments
```

`report` 会重读原始来源核对用户输入。新增输入后重跑 `extract`、标注和 `report`，按当前授权发布或更新原评论。补历史时若标记缺失或有歧义，先读正文核对具体指标评论，避免覆盖验证 Review。标签缺失时按仓库授权补建。发布后读回正文和标签，脚本通过只证明本次计数与协议。
