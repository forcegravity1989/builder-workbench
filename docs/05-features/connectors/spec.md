# spec — Connector 引导与安装

> **状态：草案，待人 gate。** 与 [intent.md](intent.md) 同批提交。没有单独原型：实现与本篇同一 PR，真壳截图在 PR 验证报告里，申请按「原型豁免」以真壳为对照。
>
> **维护约定**：给实现、验收本特性的人读。只写旅程、状态口径、命令契约与依据；为什么做读 intent，链状态读 [STATUS.md](STATUS.md)。命令或配置位置随两家 CLI 版本变化时改「依据」节并复测。

## 1. 旅程

| 时刻 | 你在哪 | 点什么 | 发生什么 | 手上多了什么 |
|---|---|---|---|---|
| 第一次 | 设置 → Connector | — | 后台读两家 CLI 的配置与状态；一个都没有时直接显示推荐目录 | 本机执行工具上已有的 connector 一览 |
| 挑服务 | 推荐目录 | 某张卡，或「自定义」 | 打开添加面板，带出名称、地址、是否要登录 | — |
| 选装到哪 | 添加面板 | 勾 Claude Code / Codex；选「所有项目」或「仅当前项目」 | 本机没探到的工具不能勾；Codex 只有「所有项目」 | 下方实时列出将要执行的命令 |
| 安装 | 添加面板 | 「安装」 | 可见终端依次执行命令；需要登录的会打开浏览器 | 终端里每条命令的原始输出 |
| 读回 | 终端结束 | — | 自动重新检测，列表刷新 | 每个工具上的状态 |
| 补登录 | 列表某行 | 「登录」 | 可见终端执行该工具的登录命令 | 状态变为已连接（或如实报错） |
| 移除 | 列表某行 | 「移除」→ 确认 | 对装了它的每个工具执行移除命令；确认语提示写在仓库 `.mcp.json` 的会改动仓库文件 | 该行消失 |

## 2. 列表与状态口径

一行一个名称，按名称合并两家工具。行内每个工具一枚状态，只从该工具 CLI 的输出推导：

| 状态 | Claude Code 来源（`claude mcp list`） | Codex 来源（`codex mcp list --json`） |
|---|---|---|
| 已连接 | `✔ Connected` | —（Codex CLI 不探连通，见下） |
| 要登录 | `! Needs authentication` | `auth_status = not_logged_in` |
| 连不上 | `✘ Failed to connect — <原因>`，原因原样显示 | — |
| 待批准 | `⏸ Pending approval`（仓库 `.mcp.json` 未批准） | — |
| 已登录 | — | `auth_status = o_auth` 或 `bearer_token` |
| 无需登录 | — | `auth_status = unsupported` |
| 已停用 | — | `enabled = false` |
| 未检测 | CLI 未装、超时或输出认不出 | 同左 |

- 「已连接」只给 Claude Code 实测连通的行；Codex 的「已登录 / 无需登录」是配置态，不画成绿色。认不出的输出一律「未检测」，不猜。
- 「连不上」的原因在行下原样显示一行；某个工具本机没有或整体读不到时，列表上方写一句原因，该工具不出状态。
- 当前项目 = 左栏选中的本机项目（SSH 仓库不算）。两家的列表命令都在它的目录下执行，所以 Claude Code 的「仅当前项目」和仓库共享两级只在选中该项目时出现；没有选中项目时在用户主目录执行，只有「所有项目」一级。
- 不显示范围列：两家 CLI 的列表输出不带范围，界面不另读配置文件去补。
- 检测在进入页面与点「重新检测」时进行；两家并行，单家超时 30 秒；安装、登录、移除的终端每条命令结束后再检测一次。

## 3. 添加面板

- **目录项**带固定名称与地址，名称可改（不得与已有同名，同名时提示改名或先移除）。
- **自定义**二选一：远程地址（`https://`，可选 SSE）或本机命令（命令 + 参数，空格分隔，支持引号）。不提供请求头、环境变量、令牌输入。
- **装给谁**：只列本机探到的执行工具；都没探到时面板只显示「本机没有 Claude Code 或 Codex」和两家官方安装命令。
- **范围**：只在有当前项目时出现。「所有项目」→ Claude `-s user`；「仅 <项目名>」→ Claude `-s local`。Codex 不区分范围，选了 Codex 时注明「Codex 只有所有项目一级」。
- 有当前项目时，所有命令先切到它的目录再执行（安装、登录、移除都是），这样 local 级的增删与登录找得到对象。
- **命令预览**随选择实时更新，与终端实际执行的字符串完全一致。

## 4. 命令契约

| 动作 | Claude Code | Codex |
|---|---|---|
| 添加远程 | `claude mcp add --transport http -s <scope> <name> <url>`（SSE 用 `--transport sse`） | `codex mcp add <name> --url <url>`（检测到 OAuth 会直接进入登录） |
| 添加本机命令 | `claude mcp add -s <scope> <name> -- <command> [args…]` | `codex mcp add <name> -- <command> [args…]` |
| 登录 | `claude mcp login <name>` | `codex mcp login <name>` |
| 移除 | `claude mcp remove <name>`（不带范围，从名称所在那一级移除） | `codex mcp remove <name>` |
| 读状态 | `claude mcp list` | `codex mcp list --json` |

- 安装需要登录的远程服务：Claude 依次跑 add 与 login；Codex 只跑 add。
- 名称只允许 `A–Z a–z 0–9 _ -`，地址只允许 `http(s)://`；不合规不拼命令。参数按目标平台 shell 规则加引号。
- 读状态在后台非交互执行；安装、登录、移除在可见终端执行，因为两家都可能要浏览器授权并等待回调。命令由界面填入终端，人按回车才执行。
- 前一条失败就不跑后一条：POSIX shell 用 `&&`，Windows 固定用 PowerShell，以 `$LASTEXITCODE` 串联。

## 5. 推荐目录（首版 8 项）

| 名称 | 地址 | 登录 |
|---|---|---|
| linear | `https://mcp.linear.app/mcp` | OAuth |
| notion | `https://mcp.notion.com/mcp` | OAuth |
| atlassian | `https://mcp.atlassian.com/v1/mcp` | OAuth |
| sentry | `https://mcp.sentry.dev/mcp` | OAuth |
| figma | `https://mcp.figma.com/mcp` | OAuth |
| vercel | `https://mcp.vercel.com` | OAuth |
| supabase | `https://mcp.supabase.com/mcp` | OAuth |
| context7 | `https://mcp.context7.com/mcp` | 免登录 |

## 6. 验收点

| 点 | 判据 |
|---|---|
| C-01 | 终端里用 `claude mcp add -s user` 与 `codex mcp add` 装的 connector，进页面即出现在同一行，各自状态正确 |
| C-02 | 目录装 context7 给两家后，Claude 显示已连接，Codex 显示无需登录或要登录（按 CLI 原样） |
| C-03 | 目录装 linear 给 Claude，未完成浏览器授权时显示要登录；点「登录」完成后显示已连接 |
| C-04 | 本机只装了一家工具时，另一家不可勾选；都没装时显示安装指引 |
| C-05 | 「仅当前项目」装给 Claude 后，切到另一个项目该行不出现 |
| C-06 | 移除后两家 CLI 读回都不再有该名称 |
| C-07 | 杀进程重开，列表与状态与重开前一致 |
| C-08 | CLI 超时或输出认不出时显示未检测，不显示已连接 |

## 7. 依据（2026-10-10 实测）

- Claude Code 2.1.280：`-s user` 写 `$CLAUDE_CONFIG_DIR/.claude.json` 顶层 `mcpServers`；`-s local` 写同文件 `projects[<路径>].mcpServers`；`-s project` 写仓库 `.mcp.json`。`claude mcp list` 输出 `名称: 目标 - ✔ Connected / ! Needs authentication / ✘ Failed to connect — 原因`，8 个服务约 6.5 秒。
- Codex 0.153.4：`codex mcp add` 只写 `$CODEX_HOME/config.toml` 的 `[mcp_servers.<名称>]`，无范围参数；远程地址检测到 OAuth 会打印授权地址并阻塞等待回调。`codex mcp list --json` 给出 `name / enabled / transport.type / auth_status`，不探连通。
- 推荐目录 8 个地址均响应 MCP 初始化请求（context7 200，其余 401 带 `WWW-Authenticate`）；Claude Code 健康检查对其余 7 项报「需要登录」。GitHub 官方远程服务报「不支持动态客户端注册」，需要令牌，未进目录。
