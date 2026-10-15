# spec — 集成页三卡收敛（Connectors）

> **状态：草案，待人 gate；未实现。** 为什么做读 [intent.md](intent.md)，链状态与已知债读 [STATUS.md](STATUS.md)，可点样张 [prototype.html](prototype.html)（能切换改前 / 改后、平台、账户范围和每张卡的状态）。本篇描述一套目标行为，实现落点仅作建议，不代替实现设计。
>
> **维护约定**：给交互设计、实现者与验收者读。目标行为、状态口径或命令表变化时更新；不混写历史方案，不抄代码。

## 范围与入口

- **入口**：设置 → 集成（Integrations）。BW 桌面壳内本机运行时生效。
- **对象**：三张集成卡——代码托管组：GitHub（`gh`）、CodeHub（`codehub-cli`）；项目群组：WeLink（`welink-cli`）。改前为八张卡，改后六张被收敛卡不再出现（去留见 intent 待决 1）。
- **设计原则**：全部动作拼装 Orca 现有能力——检测用现有 preflight，安装按钮照现有外链模式，「打开终端」复用开发屏（Orca 主工作区）现有终端页签；不新造交互组件。
- **原型覆盖**：改前 / 改后布局、macOS / Windows 平台、本机 / 远端账户范围、每张卡各状态的组合切换，以及「打开终端」弹出终端页签的演示。原型限制：终端为演示假体，不真执行命令；远端 / WSL 场景以账户范围切换模拟。

## 完整用户旅程

**主旅程：把一张卡从缺办到通**（以 WeLink 为例，三卡同构）：

1. Builder 打开设置 → 集成。页面按「代码托管」「项目群」两组渲染三张卡，每张卡现查现报状态。
2. WeLink 卡显示**未安装**，卡内「安装」按钮跳安装说明链接，人按说明自己装。
3. 装完回卡上点「重新检查」，状态翻**未登录**。
4. 点「打开终端」。开发屏新建（或聚焦）一个终端页签，人在其中执行 `welink-cli auth login`，按 CLI 自己的提示完成登录。
5. 回到集成页点「重新检查」，状态翻**已连接**，卡内不再给安装 / 打开终端按钮。

GitHub、CodeHub 同一模板：`gh auth login`、`codehub-cli auth login` 的交互流程由各 CLI 在终端里自己呈现，卡片不拦截、不代跑。

**分支**：

- **已装未登录**：从第 4 步开始。
- **远端或 WSL**：状态照常显示，但没有「安装」「打开终端」按钮（在本机终端装远端没有意义）。
- **登录失败 / 中断**：终端留在开发屏，人可重试；卡上状态如实保持，刷新靠「重新检查」。

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

### 登录命令与安装说明（本机实测口径）

| CLI | 登录命令（人在终端执行） | 安装说明链接 |
|---|---|---|
| `gh` | `gh auth login` | https://cli.github.com （现有行为） |
| `codehub-cli` | `codehub-cli auth login` | **内网补**（内网分发二进制，链接待内网确认） |
| `welink-cli` | `welink-cli auth login`（扫码） | **内网补**（本机经内网 npm 源 `npm install -g @welink/welink-cli` 装成，可作说明底稿；公共 npm 同名包是京东脚手架，不可用，#323 已警示） |

- 安装说明链接未补齐前，codehub / welink 卡的安装按钮按 intent 待决 2 的拍板口径处理，不塞猜测链接。
- 命令本身不翻译，由人在终端执行。

### 卡片模板与交互规则

- 三卡共用现有 `IntegrationCardShell` 模板：图标、名称、一句话说明、状态徽标、账户范围行（现有 `ProviderHostScopeControl`）、按状态换出的操作区。
- 「安装」按钮只在**未安装**且账户范围为本机时出现，跳安装说明链接（照 GitHub / GitLab 卡现有 `openUrl` 模式）。
- 「打开终端」按钮只在**未登录**且本机时出现：在开发屏新建或聚焦一个终端页签（复用现有终端页签创建能力），不预填、不代跑；卡内同时照现有 GitHub 卡把登录命令摆成文字供人对照。
- 「重新检查」沿用现有 Re-check 按钮，任何非 checking 状态可用。
- 已连接卡不给安装 / 打开终端，只留「重新检查」。

### 异常与边界

- **探测不可得**：整卡显示 unavailable + 「重新检查」，沿用现有口径，不拆分单卡错误。
- **杀进程重开**：状态重新探测，不缓存上次的绿灯（铁律一）。
- **i18n**：卡名、状态与按钮文案进五语词条；命令与链接不翻译。

## 验收与衡量

验收点（稳定标识，真壳执行）：

| 点 | 场景 | 可观察结果 |
|---|---|---|
| I01 | 打开设置 → 集成 | 只见三张卡，按代码托管 / 项目群两组排列，六张旧卡不出现 |
| I02 | `gh` 未安装（本机） | GitHub 卡显示未安装；「安装」按钮跳 cli.github.com（现有行为保持） |
| I03 | `gh` 已装未登录 | 卡显示未登录；点「打开终端」在开发屏开出终端页签 |
| I04 | `codehub-cli` 未安装 | CodeHub 卡显示未安装；安装按钮按待决 2 口径如实呈现 |
| I05 | `codehub-cli` 已装未登录 | 卡显示未登录（新增登录探测）；「打开终端」可用 |
| I06 | `welink-cli` 未安装 | WeLink 卡显示未安装；安装按钮按待决 2 口径如实呈现 |
| I07 | `welink-cli` 已装未登录 | 卡显示未登录；「打开终端」可用 |
| I08 | 终端内完成登录后点「重新检查」 | 状态翻已连接 |
| I09 | 账户范围为远端 / WSL | 三卡只报状态与「重新检查」，无安装 / 打开终端按钮 |
| I10 | 三 CLI 已装已登录 | 三卡显示已连接；「重新检查」读数一致 |

旅程（IJ01）：三 CLI 全缺的新机器 → 从集成页看全状态、按按钮指引装好登好 → 「重新检查」三卡全部已连接；杀进程重开仍全部已连接。

衡量：intent 判据成立即值得用；运行成绩与证据记 [STATUS](STATUS.md)，不在此铺流水。

## 取舍与待决问题

**已放弃的选项**：

- *卡片内嵌终端 + 命令预填 + 自动复查*——issue 初稿的设想。放弃：为设置页新造终端交互面，超出「拼装现有能力」的边界；开发屏终端页签已覆盖登录场景，复查用现有 Re-check 由人触发。
- *跳外部系统终端*——放弃：开发屏终端页签就是现成能力，无需另开系统窗口。
- *应用代跑安装 / 登录*——放弃：装什么、何时装由人决定，代跑越权且失败面大。

**成本 / 风险**：集成页组件是上游 Orca 文件（非 `workbench/` 叠层目录），改动沿 CodeHub 卡先例直改并记入 upstream 对照，上游同步时需人工核对冲突；codehub / welink 安装说明链接依赖内网补齐。

**待决**：4 项见 [intent 待决](intent.md#成功判据与待决问题)；实现阻塞项为待决 2（安装说明链接口径）。

## 实现落点建议（非实现设计）

- 渲染：`src/renderer/src/components/settings/IntegrationsPane.tsx` 收敛为三卡 + 分组标题；`cli-source-control-integration-cards.tsx` 增 `WeLinkIntegrationCard`（照 `GitHubIntegrationCard` 抄改）、`CodeHubIntegrationCard` 补 not-authenticated 分支（照 gh 卡）。
- 状态：`source-control-preflight-card-status.ts` / `integrations-pane-status.ts` 增 `welinkStatus`；`CodeHubCliStatus` 补 `not-authenticated` / `connected`。
- 主进程：`src/main/preflight/agent-detection.ts` 增 `welink-cli` 探测与 codehub / welink 的 `auth status` 读回（照 gh 现成模式）。
- 打开终端：复用现有终端页签创建能力（`src/renderer/src/store/terminals/terminal-tab-creation.ts` / `ui:createTerminal` 通道），具体接线实现时定。
- 类型：`src/preload/api/preflight-api.ts` 的 `PreflightStatus.codehub` 补 `authenticated`，新增 `welink`。
- i18n：五语词条新增 / 调整。
- 以上均为上游 Orca 原生文件，差异随 PR 记入 [ref/upstream.md](../../../ref/upstream.md) 对照。
