# spec — 集成页三卡收敛（Connectors）

> **状态：设计已经人 gate（2026-10-15），实现随 #323 交付。** 为什么做读 [intent.md](intent.md)，链状态与已知债读 [STATUS.md](STATUS.md)，可点样张 [prototype.html](prototype.html)（能切换改前 / 改后、平台、账户范围和每张卡的状态）。本篇描述目标行为与实现口径；真壳验收证据以 [STATUS](STATUS.md) 为准。
>
> **维护约定**：给交互设计、实现者与验收者读。目标行为、状态口径或命令表变化时更新；不混写历史方案，不抄代码。

## 范围与入口

- **入口**：设置 → 集成（Integrations）。BW 桌面壳内本机运行时生效。
- **对象**：三张集成卡——代码托管组：GitHub（`gh`）、CodeHub（`codehub-cli`）；项目群组：WeLink（`welink-cli`）。改前为八张卡，改后六张被收敛卡不再出现（去留见 intent 待决 1）。
- **设计原则**：全部动作拼装 Orca 现有能力——检测用现有 preflight，安装入口照现有模式（gh 外链 / welink 命令注入），「登录」复用开发屏（Orca 主工作区）现有终端页签与启动命令投递，把命令注入终端而不让人敲；不新造交互组件。
- **原型覆盖**：改前 / 改后布局、macOS / Windows 平台、本机 / 远端账户范围、每张卡各状态的组合切换，以及安装 / 登录命令注入终端页签的演示。原型限制：终端为演示假体，不真执行命令；远端 / WSL 场景以账户范围切换模拟。

## 完整用户旅程

**主旅程：把一张卡从缺办到通**（以 WeLink 为例）：

1. Builder 打开设置 → 集成。页面按「代码托管」「项目群」两组渲染三张卡，每张卡现查现报状态。
2. WeLink 卡显示**未安装**。点「安装」，开发屏新建一个终端页签，安装命令已注入执行（命令见下表，含内网 registry 参数，自包含、不依赖机器 npm 源配置），人看输出确认装完。
3. 回卡上点「重新检查」，状态翻**未登录**。
4. 点「登录」。开发屏终端页签里 `welink-cli auth login` 已注入执行，WeLink 弹出扫码，人在手机上确认。
5. 回到集成页点「重新检查」，状态翻**已连接**，卡内不再给安装 / 登录按钮。

GitHub、CodeHub 的登录同一模板：`gh auth login`（设备码 / 浏览器流程）、`codehub-cli auth login`（内网认证）注入终端后，交互流程由各 CLI 自己呈现，卡片不拦截。GitHub 的安装保持现有外链行为（跳 cli.github.com，人按官方说明装）；CodeHub 安装口径待内网补（intent 待决 2）。

**分支**：

- **已装未登录**：从第 4 步开始。
- **远端运行时**：状态照常显示，但没有「安装」「登录」按钮——往本机终端注入命令装不了远端机器。WSL 工作树不在此列：开发屏新终端页签本就自动进入该工作树的项目级 WSL 发行版，注入照常可用。
- **命令失败 / 中断**：终端留在开发屏，输出与退出码可见，人可在终端里重试；卡上状态如实保持，刷新靠「重新检查」。

## 行为规则与异常

### 状态口径（沿用现有 `CliProviderCardState`，不新造）

| 状态 | 含义 | 推导 |
|---|---|---|
| checking | 探测进行中 | preflight 在途或刷新中 |
| not-installed | CLI 不在 PATH | 现有 `detectCommandRuntime` 探不到可执行文件 |
| not-authenticated | 已装，`auth status` 报未登录 | gh / codehub-cli / welink-cli 各自 `auth status` 读回（codehub、welink 为本次补齐，照 gh 现成模式） |
| connected | 已装且已登录 | 同上；welink-cli 的 EXPIRED（自动刷新）算 connected（intent 待决 3） |
| unavailable | 状态在当前运行时不可得 | 现有 unavailable 口径（探测本身失败或运行时不支持） |

信号只能从探测推导；探测不可得就是 unavailable，不给绿灯（铁律二）。

### 命令表（注入终端的命令；welink 安装为人确认的权威口径）

| CLI | 安装 | 登录（注入执行） | 状态探测 |
|---|---|---|---|
| `gh` | 外链 https://cli.github.com （现有行为，人按官方说明装） | `gh auth login` | `gh auth status` |
| `codehub-cli` | **内网补**（内网分发二进制，命令或链接待内网确认；补齐前如实占位，不塞猜测） | `codehub-cli auth login` | `codehub-cli auth status` |
| `welink-cli` | `npm install -g @welink/welink-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false` | `welink-cli auth login`（扫码） | `welink-cli auth status` |

- welink 安装命令自带内网 registry 与 `--strict-ssl=false`，机器无需预配 npm 源；公共 npm 的同名 `welink-cli` 是京东前端脚手架，不可用（#323 已警示）。
- 命令本身不翻译；注入的是卡上可见的那一条命令，人不手敲。

### 卡片模板与交互规则

- 三卡共用现有 `IntegrationCardShell` 模板：图标、名称、一句话说明、状态徽标、账户范围行（现有 `ProviderHostScopeControl`）、按状态换出的操作区；命令照现有 GitHub 卡摆成文字行，人看得到按钮会注入什么。
- 「安装」按钮只在**未安装**且账户范围为本机时出现：gh 跳外链（现有 `openUrl` 模式）；welink 在开发屏新建终端页签并注入安装命令执行。
- 「登录」按钮只在**未登录**且本机时出现：在开发屏新建终端页签并注入 `auth login` 执行（复用现有终端页签创建与启动命令投递，见实现落点）。
- 点按钮即授权执行卡上可见的那一条命令；命令开始后的交互（扫码、设备码、进度）由 CLI 在终端里自己呈现，人可随时在终端里中断或重试。
- 「重新检查」沿用现有 Re-check 按钮，任何非 checking 状态可用；命令结束**不**自动触发复查，由人点。
- 已连接卡不给安装 / 登录，只留「重新检查」。

### 异常与边界

- **探测不可得**：整卡显示 unavailable + 「重新检查」，沿用现有口径，不拆分单卡错误。
- **杀进程重开**：状态重新探测，不缓存上次的绿灯（铁律一）。
- **i18n**：卡名、状态与按钮文案进英文词条（照 CodeHub 卡先例，其余语言经 `translate` 的 defaultValue 回退）；命令与链接不翻译。

## 验收与衡量

验收点（稳定标识，真壳执行）：

| 点 | 场景 | 可观察结果 |
|---|---|---|
| I01 | 打开设置 → 集成 | 只见三张卡，按代码托管 / 项目群两组排列，六张旧卡不出现 |
| I02 | `gh` 未安装（本机） | GitHub 卡显示未安装；「安装」跳 cli.github.com（现有行为保持） |
| I03 | `gh` 已装未登录 | 卡显示未登录；点「登录」开发屏开出终端页签，`gh auth login` 已注入执行 |
| I04 | `codehub-cli` 未安装 | CodeHub 卡显示未安装；安装入口按待决 2 口径如实呈现 |
| I05 | `codehub-cli` 已装未登录 | 卡显示未登录（新增登录探测）；「登录」注入 `codehub-cli auth login` |
| I06 | `welink-cli` 未安装 | WeLink 卡显示未安装；点「安装」终端页签注入 npm 安装命令（含 registry 参数）执行 |
| I07 | `welink-cli` 已装未登录 | 卡显示未登录；点「登录」注入 `welink-cli auth login`，扫码由 CLI 呈现 |
| I08 | 终端内完成登录后点「重新检查」 | 状态翻已连接 |
| I09 | 账户范围为远端运行时 | 三卡只报状态与「重新检查」，无安装 / 登录按钮（WSL 工作树仍属本机范围，按钮保留） |
| I10 | 三 CLI 已装已登录 | 三卡显示已连接；「重新检查」读数一致 |

旅程（IJ01）：三 CLI 全缺的新机器 → 从集成页看全状态、按按钮指引装好登好（全程不手敲命令）→ 「重新检查」三卡全部已连接；杀进程重开仍全部已连接。

衡量：intent 判据成立即值得用；运行成绩与证据记 [STATUS](STATUS.md)，不在此铺流水。

## 取舍与待决问题

**已放弃的选项**：

- *卡片内嵌终端 + 命令退出自动复查*——issue 初稿的设想。放弃：为设置页新造终端交互面；命令改注入开发屏真实终端页签（现有启动命令投递），复查用现有 Re-check 由人触发。
- *命令摆成文字让人自己敲*——现状。放弃：点按钮注入执行，人不敲命令（人拍板 2026-10-15）。
- *跳外部系统终端*——放弃：开发屏终端页签就是现成能力，无需另开系统窗口。
- *应用后台代跑命令*——放弃：按钮只注入卡上可见的那一条命令到终端，人在终端里看着它跑、可中断，不做无终端的后台执行。

**成本 / 风险**：集成页组件是上游 Orca 文件（非 `workbench/` 叠层目录），改动沿 CodeHub 卡先例直改并记入 upstream 对照，上游同步时需人工核对冲突；codehub-cli 安装口径依赖内网补齐。

**待决**：4 项见 [intent 待决](intent.md#成功判据与待决问题)；实现阻塞项为待决 2（codehub-cli 安装口径）。

## 实现落点建议（非实现设计）

- 渲染：`src/renderer/src/components/settings/IntegrationsPane.tsx` 收敛为三卡 + 分组标题；CodeHub / WeLink 两卡落在 BW 自有文件 `bw-cli-integration-cards.tsx`（CodeHub 补 not-authenticated 分支照 gh 卡、WeLink 照 GitHub 卡抄改；上游卡模块 `cli-source-control-integration-cards.tsx` 受 max-lines 预算约束，BW 卡不进），注入助手在 `cli-command-injection.ts`，经 barrel `source-control-integration-cards.tsx` 一并导出。
- 状态：`source-control-preflight-card-status.ts` / `integrations-pane-status.ts` 增 `welinkStatus`；`CodeHubCliStatus` 补 `not-authenticated` / `connected`。
- 主进程：`src/main/preflight/agent-detection.ts` 增 `welink-cli` 探测与 codehub / welink 的 `auth status` 读回（照 gh 现成模式）。
- 命令注入：复用终端 store 现成机制——`createTab(worktreeId, undefined, undefined, { pendingStartup: { command } })` 建页签并投递启动命令，随后 `setActiveTabType('terminal')` + `setActiveTab` 把人带到该页签；本机 PTY 的启动命令由主进程写入并回车提交（agent TUI 启动同款路径，`delivery: 'terminal-paste'` 是 SSH 远端的渲染层粘贴通道，本机注入用不到）。
- 类型：`src/preload/api/preflight-api.ts` 的 `PreflightStatus.codehub` 补 `authenticated`，新增 `welink`。
- i18n：英文词条新增 / 调整（`en.json`，照 CodeHub 卡先例；其余语言走 defaultValue 回退）。
- 以上均为上游 Orca 原生文件，差异随 PR 记入 [ref/upstream.md](../../../ref/upstream.md) 对照。
