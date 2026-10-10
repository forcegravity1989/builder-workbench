# intent — Connector 引导与安装

> **状态：草案，待人 gate。** 2026-10-10 由 `/goal`「参照 Codex、Claude 对 connector 的引入，做好引导和背后的安装逻辑」发起。实现与本篇同一 PR 提交，供 gate 时对照；人确认前不合入。
>
> **维护约定**：给判断「Builder 怎样让 Claude Code / Codex 用上外部服务」的人读。行为见 [spec.md](spec.md)，链状态见 [STATUS.md](STATUS.md)。命令与配置位置以两家 CLI 实测为据，记在 spec「依据」节；边界变化时改本篇，不把实现清单抄进正文。

## 用户与问题

被管项目的 Builder，本机装了 Claude Code 或 Codex，想让执行会话直接读写 Linear、Notion、Jira、Sentry、Figma 这类服务。这类接入在两家工具里都叫 connector，底层是 MCP 服务。

今天在 Workbench 里做不成这件事：

1. **入口只在单个仓库的设置里，而且只会读文件。** Orca 的「MCP Configs」按仓库列出四个候选文件，唯一的动作是建一份空 `.mcp.json` 再丢进编辑器，要人自己手写 JSON。
2. **读的位置和执行工具真正用的位置对不上。** 实测 Claude Code 2.1.280：「所有项目」写进 `~/.claude.json` 顶层，「仅本机本项目」写进 `~/.claude.json` 的项目节，「团队共享」写进仓库 `.mcp.json`；Codex 0.153 只写 `~/.codex/config.toml`。Orca 列的 `.claude.json`、`.claude/mcp.json` 两个仓内路径两家都不写，而两家的全局配置它一个都不看。所以人在终端里装好的 connector，在 Workbench 里看不见。
3. **装上不等于能用，界面不说。** 需要登录的服务装上后是「未登录」，地址错或服务不支持的会连不上。Orca 只显示「N servers」，不区分这三种情况。
4. **两家工具要分别装。** 同一个 Linear，Claude Code 和 Codex 各有一份配置、各登一次，命令写法也不同。

## 价值与依据

核心收益：Builder 在一处挑服务、选装给哪个执行工具，Workbench 替他拼出两家各自的正确命令，在看得见的终端里跑完，然后读回每个工具上的真实状态。

依据：Claude（桌面版 Connectors 目录）和 Codex（`codex mcp add` 后自动走 OAuth）都把「挑一个 → 装上 → 登录 → 看状态」做成一条路；Workbench 的执行会话就是这两个 CLI，接入它们自己的配置，会话里直接生效，不需要 BW 另存一份。2026-10-10 实测：8 个常用远程服务里 7 个在 Claude Code 中显示「需要登录」，可以走 OAuth；GitHub 官方远程服务报「不支持动态客户端注册」，必须带令牌，首版不进目录。价值效果尚无真实 Builder 读回，仍是假设。

## 目标体验

在设置里打开 Connector。列表每行一个服务，写着装在哪个执行工具上、每个工具上是已连接、要登录、连不上还是未检测。没有任何 connector 时，页面直接给推荐目录。

点「添加」，从目录里挑一个（或填自定义地址 / 命令），勾选装给 Claude Code、Codex 或两个都装，选「所有项目」或「仅当前项目」。确认页列出将要执行的命令，原样可见。点「安装」，命令填进页面内的终端，按回车依次执行；需要登录的服务会打开浏览器授权。终端结束后，列表自动重新检测并显示每个工具上的结果。

已装的行可以重新登录、重新检测、移除；移除前确认，移除也是跑对应工具的命令。

## 范围与边界

- **做**：执行工具全局与当前项目两级 connector 的统一列表；推荐目录与自定义添加；按工具拼装 `claude mcp …` / `codex mcp …` 命令并在可见终端执行；登录、移除；从两家 CLI 读回状态。
- **范围外**：BW 自存 connector 清单或令牌；代填密钥、请求头或环境变量；Claude 桌面版 / claude.ai 账号里的 connector；Cursor 等其他执行工具；connector 的启停开关与工具级权限；带令牌的服务进目录（含 GitHub 官方远程服务）；SSH 远端仓库上的安装。
- **相邻**：Orca 原生仓库设置里的「MCP Configs」保留，只读仓内文件；本特性不改它。被管仓库 `.mcp.json` 是仓库产物，写入后按 PR 评审，不由本特性直接提交。

## 成功判据与待决问题

**判据**：Builder 不手写配置文件，就能把一个推荐服务装给本机已有的执行工具，并在 Workbench 里看到每个工具上的真实状态；在终端里用 CLI 自己装的 connector 同样出现在列表里；杀进程重开后列表与状态从两家 CLI 重新读回，结果一致；未检测就显示未检测，不显示绿色。

**待决（需 gate）**：

1. 词表「Connector」改窄：从「外部工具与服务统称（含开工工具、仓库 CLI、Orca）」改为「执行工具接入外部服务的 MCP 服务」，与 Claude、Codex 用法一致。旧含义在 Electron 主干上已无界面承载。
2. 入口放在 Workbench 设置的「Connector」页，作为全局能力；当前项目范围跟随左栏选中的项目。
3. 推荐目录首版收 8 项（见 spec），都是 2026-10-10 实测在线、Claude Code 识别为可 OAuth 或免登录的官方地址；目录的增删由人定。
4. 「仅当前项目」对 Claude Code 写本机私有的项目节（`-s local`），不写仓库 `.mcp.json`；需要团队共享时由人自己在仓库里提交。Codex 只有全局一级。
