# spec — Connector（集成）卡片：GitHub、CodeHub、WeLink

> **状态：已认（2026-10-15），实现在内网。** 与 [intent.md](intent.md) 同批提交；裁决见 intent「已裁决」，可点样张 [prototype.html](prototype.html)（改前 / 改后、平台、状态位置、每张卡的状态都能切，支持 `#` 深链）。实现在内网完成，标「内网补」的格子由内网填。
>
> **维护约定**：给实现、验收本特性的人读。只写旅程、页面与卡片契约、状态口径、命令表、验收点、实现落点与取舍；为什么做读 intent，链状态读 [STATUS.md](STATUS.md)。命令随 CLI 版本变化时改 §5 并复测。

## 1. 旅程（IJ01）

| 时刻 | 你在哪 | 点什么 | 发生什么 | 手上多了什么 |
|---|---|---|---|---|
| 打开 | 设置 → 集成 | — | 预检在后台查三个 CLI；卡片先显示检查中 | 三张卡各自的状态 |
| 没装 | 某张卡「未安装」 | 「安装 X」 | 本平台安装命令填进卡片内终端，**人按回车**；命令结束自动重新检查 | 卡片变为未登录、已安装或已连接 |
| 本平台没有一行装法 | 同上 | 「安装说明」 | 打开说明页（内网补地址） | 自己装好后点「重新检查」 |
| 没登录 | 某张卡「未登录」 | 「登录」 | `<cli> auth login` 填进卡片内终端，按回车后按 CLI 提示授权（可能打开浏览器） | 卡片变为已连接 |
| CLI 不报登录状态 | 某张卡「已安装」 | 「登录」或「查看登录状态」 | 对应命令填进终端 | 终端里的登录结果 |
| 在别处装好的 | 任意卡 | 「重新检查」 | 重跑预检 | 卡片按真实状态刷新 |
| 用完终端 | 卡片内终端 | 「完成」 | 关终端、再查一次 | 卡片回到状态视图 |

IJ01 = 打开集成页 → GitHub 从未安装经安装、登录到已连接 → 杀进程重开仍是已连接。

## 2. 页面结构

| 壳 | 集成页 | 任务来源页 |
|---|---|---|
| Workbench 壳 | 页头「集成」，**不要副标题**（原生副标题点名了被隐藏的卡片）。**代码托管**：GitHub、CodeHub ／ **项目群**：WeLink。节下不写说明小字 | 只留 GitHub、CodeHub 两行；GitLab、Linear、Jira 三行隐藏（它们的「连接」把人带到被隐藏的卡片；裁决 5，可推后） |
| Orca 壳 | 不变（八张卡、原有两节与副标题） | 不变 |

- Workbench 壳隐藏的卡：GitLab、Bitbucket、Azure DevOps、Gitea、Linear、Jira。代码不删。
- 设置搜索目录同步：Workbench 壳去掉这六张卡的条目；加 WeLink 条目（标题「WeLink」，描述「项目群通知，通过 welink-cli」，关键词 `welink`、`welink-cli`、`项目群`、`通知`）。

## 3. 卡片契约（三卡共用）

```
┌───────────────────────────────────────────────┐
│ [图标] 名称                          [状态徽标] │  头部：名称 + 「通过 <cli> CLI。」
│        通过 <cli> CLI。                         │
├───────────────────────────────────────────────┤
│ 账户范围：Local Mac        [打开远程服务器]      │  原生账户范围行
│ <状态体：一句话 + 命令行 + 按钮组>               │  按 §4 状态切换
│ <或：卡片内终端 + 「完成」>                      │  点安装 / 登录后替换状态体
└───────────────────────────────────────────────┘
```

| 名称 | 图标 | 头部第二行 | 未安装时的一句话 |
|---|---|---|---|
| GitHub | GitHub 标 | 通过 gh CLI。 | 安装 GitHub CLI 以启用拉取请求、议题和检查。（原生） |
| CodeHub | 终端标（原生） | 通过 codehub-cli CLI。（zh 目录现缺 `codehubDescription`，补上） | 安装 codehub-cli 以读取 Issue、创建与合入 MR。 |
| WeLink | 内网补（缺省用消息气泡标） | 通过 welink-cli CLI。 | 安装 welink-cli 以向项目群发送通知。 |

- **账户范围行**：GitHub 已有；CodeHub、WeLink **新加**（原生 CodeHub 卡没有）。检查中也保留这一行，与原生一致。
- **按钮顺序**：主按钮（安装 / 登录）→「安装说明」或「了解更多」→「重新检查」。例外：「已安装」态是 登录 →「查看登录状态」→「重新检查」。
- **卡片内终端**：包原生 `OnboardingInlineCommandTerminal`，`forceHostRuntime`（总在本机桌面）；终端上方一行「命令已填入，按回车执行。」与「完成」按钮。每张卡一个终端实例，`worktreeId` 按卡区分。
- **WeLink 卡**是三卡共用模板的一条配置，与 GitHub、CodeHub 同在原生集成页里渲染，只在 Workbench 壳出现；不另做叠层组件，避免两套卡片实现。

## 4. 状态口径

| 徽标 | 判据（三卡相同，命令见 §5） | 状态体 |
|---|---|---|
| 检查中 | 预检进行中，或结果属于另一个上下文 | 只有账户范围行 |
| 未安装 | `<cli> --version` 找不到或退出非 0 | 一句话 + 命令行（本平台有命令时）+ 安装 / 安装说明 / 重新检查 |
| 未登录 | 登记为「报登录状态」的 CLI：`auth status` 退出非 0 | 「已安装，还没登录。」+ 登录命令行 + 登录 / 了解更多 / 重新检查 |
| 已安装 | 登记为「不报登录状态」的 CLI：已安装即止 | 「登录状态不自动检测。」+ 登录命令行 + 登录 / 查看登录状态 / 重新检查 |
| 已连接 | 已安装且 `auth status` 退出 0 | 只有账户范围行 |
| 不可用 | 预检出错；**`--version` 或 `auth status` 超时、无法启动** | 一句原因 + 重新检查 |

- 徽标颜色：已连接为绿，其余为提醒色；**探不出就不是绿色，也不说成未登录**。超时与启动失败归「不可用」，不得像现在的 `isGhAuthenticated` 那样一律当 false。
- 「报不报登录状态」是命令表里每个 CLI 的**静态登记**（§5），不在运行时猜：非 0 退出分不出「不支持」与「没登录」。
- **不给安装 / 登录按钮的情形**：预检上下文不是本机桌面时（`getLocalPreflightContext(state) !== undefined`：远端 Orca 服务器、WSL、项目执行运行时）。终端只在本机桌面运行，装了也改不了卡片读到的那台机器。这时命令行照常显示，按钮组前加一句「状态读自 <位置>，在那里运行这条命令。」（位置 = 远程服务器名 / WSL 发行版名）。

## 5. 命令表（一处登记，内网只改这张表）

| 项 | GitHub | CodeHub | WeLink |
|---|---|---|---|
| 安装检测 | `gh --version` | `codehub-cli --version`（内网核实退出 0） | `welink-cli --version`（内网核实退出 0） |
| 报登录状态 | 是 | 是（内网核实退出码与站点） | 否（内网核实后可改为是） |
| 登录状态 | `gh auth status`（预检已有） | `codehub-cli auth status` | 内网补 |
| 登录 | `gh auth login` | `codehub-cli auth login` | 内网补（预期 `welink-cli auth login`） |
| 安装 · macOS | `brew install gh` | 内网补 | 内网补 |
| 安装 · Windows | `winget install --id GitHub.cli -e` | 内网补 | 内网补 |
| 安装 · 其他 | 无（只给说明链接） | 内网补 | 内网补 |
| 安装说明链接 | https://cli.github.com | 内网补 | 内网补 |
| 了解更多链接 | https://cli.github.com/manual/gh_auth_login | 内网补 | 内网补 |

- 命令只填入终端、不代执行；人按回车。命令结束（OSC 133 `onCommandFinished`）、点「完成」或 shell 退出（`onTerminalExit`），都重新检查一次。
- Windows 固定用 PowerShell（`shellOverride: 'powershell.exe'`），避免默认终端是 Git Bash / WSL 时 `winget` 与引号不认。
- 终端在重新检查期间保持挂载：检查中不能把终端卸掉，否则输出丢失、命令被重新粘贴。
- **Windows 上 npm 装的 CLI 是 `.cmd` 垫片**：预检用的是普通 `execFile`（`src/main/ipc/preflight-command-exec.ts`），认不出垫片，会把装好的 `codehub-cli` / `welink-cli` 报成未安装。安装与登录探测要走能认垫片的执行器（`src/main/git/command-runner/command-exec-file.ts` 已处理）。
- `codehub-cli` 的站点可能来自 `CODEHUB_HOST` / `CODEHUB_TOKEN` 环境变量；从桌面启动的应用未必带这些变量，内网核实登录探测查的是哪个站点。
- **不要用公共 npm 的 `welink-cli`**（京东前端脚手架，命令名 `welink`）。

## 6. 验收点

| 点 | 判据 |
|---|---|
| I01 | Workbench 壳集成页只有「代码托管」GitHub、CodeHub 与「项目群」WeLink 三张卡，无副标题；Orca 壳仍是原八张 |
| I02 | 设置搜索「welink」能找到 WeLink 卡；搜索「gitlab」在 Workbench 壳找不到卡片条目；任务来源页只有 GitHub、CodeHub 两行 |
| I03 | 三个 CLI 都没装时，三张卡都是未安装，各自给本平台命令或说明链接 |
| I04 | 点「安装 X」，卡片内终端首行就是该命令，未执行；按回车装完后卡片自动变为未登录、已安装或已连接 |
| I05 | 未登录时点「登录」，终端填入 `auth login`；授权完成后卡片变已连接 |
| I06 | 在外部终端自己装好、登好，回到集成页点「重新检查」显示已连接 |
| I07 | 登记为不报登录状态的 CLI 装好后显示「已安装」、不显示已连接，并给「查看登录状态」 |
| I08 | 切到远端 Orca 服务器、或项目在 WSL 时，三张卡都不给安装 / 登录按钮，命令行与「状态读自 <位置>」一句仍在 |
| I09 | 终端打开时触发重新检查，终端不消失、命令不重复粘贴 |
| I10 | `auth status` 超时（如 CodeHub 站点不通）时卡片显示不可用，不显示未登录；杀进程重开状态与重开前一致 |

## 7. 实现落点（建议，内网实现时以实际代码为准）

| 改动 | 落点 | 说明 |
|---|---|---|
| WeLink 安装探测 | `src/main/preflight/agent-detection.ts` | 与 `codehub-cli` 并列加 `detectCommandRuntime('welink-cli', context)` |
| 登录探测 | 同上 | CodeHub 仿 `isGhAuthenticated` 跑 `auth status`，但超时 / 启动失败返回「未知」而不是 false；WeLink 按 §5 登记 |
| 状态类型 | `agent-detection.ts` 与 `src/preload/api/preflight-api.ts`（`PreflightStatus` 两处定义都要改） | 加 `welink`；`codehub` 加 `authenticated` |
| 前端状态 | `src/renderer/src/components/settings/integrations-pane-status.ts` | 加 `welinkStatus`、`PreflightRefreshProvider` 加 `'welink'`；CodeHub 状态从 `available / not-installed` 扩成与 GitHub 同一组 |
| 卡片模板 | `src/renderer/src/components/settings/cli-source-control-integration-cards.tsx` 等 | 按 §3 契约把 GitHub / CodeHub / WeLink 收成一个按配置渲染的通用卡；命令表单独一个文件 |
| 只留三张卡 | `IntegrationsPane.tsx`、`integrations-search.ts`、`TasksPane.tsx`，副标题在 `settings-setup-workflow-section-renderers.tsx` | 按 `isWorkbenchShell()`（`src/renderer/src/workbench/is-workbench-shell.ts`）分支 |
| **前置修复** | `src/renderer/src/workbench/workbench-terminal.css` | Workbench 皮肤把无标题终端上方透明标题条刷成卡片色，盖住终端首行，卡片内终端看着全空白。修法：`.pane-title-bar` 规则加 `:not([data-chromeless])`，`[data-native-file-drop-target='terminal']` 规则加 `:not(.pane-title-bar)` |
| 本地化 | `i18n/locales/en.json`、`zh.json`，`en-runtime-required.json` 重算 | 新文案进目录；状态徽标与 CodeHub 描述要有中文 |

**可参考的实现**：GitHub 侧已关闭的 PR #309（分支 `claude/connector-guided-install`，提交 11608368eb）在真壳里跑通了 §3–§5 的大部分契约。内网若能拿到，只参考这几个文件：`components/settings/IntegrationSetupTerminal.tsx`、`integration-setup-commands.ts`、`cli-integration-card-parts.tsx`、`codehub-integration-card.tsx`、`cli-source-control-integration-cards.tsx`、`workbench/workbench-terminal.css`；**不要**带 `workbench/connectors/`、`main/workbench/connectors-runtime.ts`、`shared/workbench/connectors*.ts`（已撤的 MCP 部分）。拿不到时以本节与 §3–§5 为准。

单测：预检加探测会改 `preflight-host-cli-status.test.ts` 的 mock 顺序，随行为维护；新增单测按 vitest 例数 ratchet 对冲。

## 8. 取舍

| 选项 | 结论 | 理由 |
|---|---|---|
| 保留 GitHub 卡「跳官网 / 摆命令」 | 不取（裁决 4） | 三卡同模板；原地装与登录真壳验证过 |
| 其他六张卡直接删代码 | 不取 | Orca 壳还在用；Workbench 壳隐藏即可，合并上游冲突小 |
| WeLink 做成叠层独立组件 | 不取 | 三卡一套模板，避免两套卡片实现 |
| 运行时猜 CLI 支不支持 `auth status` | 不取 | 非 0 退出分不出「不支持」与「没登录」，改为命令表静态登记 |
| 保留 PR #309 的「执行工具的外部服务」（MCP）一节 | 不取 | 用户 2026-10-10 简化方案 |

## 9. 依据（2026-10-10）

- 预检（`agent-detection.ts`）：`gh` / `glab` 查安装与登录，`codehub-cli` 只跑 `--version`（注释写明不探登录），没有 `welink-cli`；安装检测是 `<cmd> --version` 退出 0（`preflight-command-exec.ts`）。
- 原生集成页八张卡：评审提供商 GitHub、GitLab、CodeHub、Bitbucket、Azure DevOps、Gitea；任务提供商 Linear、Jira。GitHub 未安装只有跳官网按钮，未登录只摆命令文字；CodeHub 只有可用 / 不在 PATH 两态，没有账户范围行。
- `codehub-cli auth login` / `auth status` 见 [codehub-cli 用法](../../03-guide/codehub-cli.md)。
- `welink-cli` 在旧 Rust 主干的用途是项目群发消息（`im send-to-group`），名片 `[chat]` 段 `provider = "welink"`；旧主干记的安装命令 `npm i -g welink-cli` 指向公共 npm 的同名无关包，作废。
- PR #309（已关闭）在真壳里验证了：命令填进卡片内终端、远端 / WSL 不给按钮、重新检查时终端保持挂载、首行遮挡的 CSS 根因。
