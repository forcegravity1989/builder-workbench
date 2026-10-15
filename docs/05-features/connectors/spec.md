# spec — 集成页三卡收敛（Connectors）

> **状态：草案，待人 gate；未实现。** 为什么做读 [intent.md](intent.md)，链状态与已知债读 [STATUS.md](STATUS.md)，可点样张 [prototype.html](prototype.html)（能切换改前 / 改后、平台、账户范围和每张卡的状态）。本篇描述一套目标行为，实现落点仅作建议，不代替实现设计。
>
> **维护约定**：给交互设计、实现者与验收者读。目标行为、状态口径或命令表变化时更新；不混写历史方案，不抄代码。

## 范围与入口

- **入口**：设置 → 集成（Integrations）。BW 桌面壳内本机运行时生效。
- **对象**：三张集成卡——代码托管组：GitHub（`gh`）、CodeHub（`codehub-cli`）；项目群组：WeLink（`welink-cli`）。改前为八张卡（上述两张 + GitLab、Bitbucket、Azure DevOps、Gitea、Linear、Jira），改后六张被收敛卡不再出现（去留见 intent 待决 1）。
- **原型覆盖**：改前 / 改后布局、macOS / Windows 平台、本机 / 远端账户范围、每张卡五种状态的组合切换，以及「安装」「登录」按钮把命令预填进卡片内终端的交互。原型限制：终端为演示假体，不真执行命令；远端 / WSL 场景以账户范围切换模拟。

## 完整用户旅程

**主旅程：把一张卡从缺办到通**（以 WeLink 为例，三卡同构）：

1. Builder 打开设置 → 集成。页面按「代码托管」「项目群」两组渲染三张卡，每张卡现查现报状态。
2. WeLink 卡显示**未安装**（`welink-cli` 不在 PATH），卡内给出说明与「安装」按钮。
3. 点「安装」。卡片展开内嵌终端，本平台安装命令（如 `npm install -g @welink/welink-cli`）已预填在终端输入行，光标在行尾。
4. 人按回车，命令在卡片内终端执行，输出滚动可见；人可看到安装进度与结果。
5. 命令进程退出后，卡片自动重新检查。装好后状态变**未登录**，卡内换出「登录」按钮。
6. 点「登录」，`welink-cli auth login` 预填进终端，人按回车执行；welink-cli 弹出扫码登录，人在手机上确认。
7. 命令结束后自动复查，状态变**已连接**，卡内显示已连接与账户范围行，不再给安装 / 登录按钮。

GitHub、CodeHub 同一模板：`gh auth login` 走设备码 / 浏览器流程，`codehub-cli auth login` 走内网认证，交互差异由 CLI 自己在终端里呈现，卡片不拦截。

**分支**：

- **已装未登录**：跳过安装步，直接从第 6 步开始。
- **远端或 WSL**：状态照常显示，但卡内只有状态与「重新检查」，没有「安装」「登录」按钮（在本机终端装远端没有意义）。
- **命令失败**：终端保留输出与退出码，人可改命令重试或点「重新检查」；状态如实保持原样，不假装成功。

## 行为规则与异常

### 状态口径（三卡统一，五态）

| 状态 | 含义 | 推导 |
|---|---|---|
| 检查中 | 探测进行中 | preflight 在途或刷新中 |
| 未安装 | CLI 不在 PATH | `detectCommandRuntime` 探不到可执行文件 |
| 未登录 | 已装，`auth status` 报未登录 | gh / codehub-cli / welink-cli 各自 `auth status` 读回 |
| 已连接 | 已装且已登录 | 同上；welink-cli 的 EXPIRED（自动刷新）算已连接（intent 待决 4） |
| 不可用 | 探测本身失败 | 本机 preflight 报错；远端 / WSL 范围下为远端读回失败或不可达 |

信号只能从探测推导；探测失败就是不可用，不给绿灯（铁律二）。远端 / WSL 范围下，其余四态照常显示（读数来自远端 Orca 服务器），只是操作区不给「安装」「登录」（见行为规则与 I09）。

### 命令表（按平台预填；本机实测口径）

| CLI | 平台 | 安装命令 | 登录命令 | 状态探测 |
|---|---|---|---|---|
| `gh` | macOS | `brew install gh` | `gh auth login` | `gh auth status` |
| `gh` | Windows | `winget install --id GitHub.cli` | `gh auth login` | `gh auth status` |
| `codehub-cli` | macOS / Windows | **内网补**（内网分发的独立二进制，命令与说明链接待内网确认） | `codehub-cli auth login` | `codehub-cli auth status` |
| `welink-cli` | macOS / Windows | `npm install -g @welink/welink-cli`（需内网 npm 源） | `welink-cli auth login`（扫码） | `welink-cli auth status` |

- 公共 npm 的同名 `welink-cli` 是京东前端脚手架，**不是** WeLink 的 CLI，不得作为安装命令（#323 已警示）。
- codehub-cli 安装命令未补齐前，卡内如实标注「安装命令待内网确认」，不塞猜测命令（待决 3）。

### 卡片模板与交互规则

- 三卡共用一个模板：图标、名称、一句话说明、状态徽标、账户范围行、按状态换出的操作区（说明文字 + 按钮 + 内嵌终端）。
- 「安装」按钮只在**未安装**且账户范围为本机时出现；「登录」按钮只在**未登录**且本机时出现；「重新检查」任何非检查中状态都可用。
- 命令预填进卡片内终端后**由人按回车执行**，应用不代跑；终端进程退出（无论成败）触发一次 preflight 强制刷新（复用现有 Re-check 的 force 通道）。
- 账户范围行沿用现有 Account scope 控件语义：本机显示本机口径，远端显示「Remote server: <名>」；远端时操作区不给安装 / 登录。
- 已连接卡不给多余操作，只留「重新检查」。

### 异常与边界

- **探测失败 / preflight 报错**：整卡显示不可用 + 「重新检查」，不拆分为单卡错误。
- **命令执行中再次点安装 / 登录**：终端已展开时按钮不重复开新终端；同卡同一时刻只有一条命令在跑。
- **杀进程重开**：状态重新探测，不缓存上次的绿灯（铁律一）。
- **i18n**：卡名与状态文案进五语词条；命令本身不翻译。

## 验收与衡量

验收点（稳定标识，真壳执行）：

| 点 | 场景 | 可观察结果 |
|---|---|---|
| I01 | 打开设置 → 集成 | 只见三张卡，按代码托管 / 项目群两组排列，六张旧卡不出现 |
| I02 | `gh` 未安装（本机） | GitHub 卡显示未安装；点「安装」，终端预填本平台安装命令 |
| I03 | `gh` 已装未登录 | 卡显示未登录；点「登录」，终端预填 `gh auth login` |
| I04 | `codehub-cli` 未安装 | CodeHub 卡显示未安装；安装命令按待决 3 口径如实展示 |
| I05 | `codehub-cli` 已装未登录 | 卡显示未登录（新增登录探测）；点「登录」预填 `codehub-cli auth login` |
| I06 | `welink-cli` 未安装 | WeLink 卡显示未安装；点「安装」预填 `npm install -g @welink/welink-cli` |
| I07 | `welink-cli` 已装未登录 | 卡显示未登录；点「登录」预填 `welink-cli auth login` |
| I08 | 卡内终端命令退出 | 自动复查，装好 / 登好后状态翻到下一态直至已连接 |
| I09 | 账户范围为远端 / WSL | 三卡只报状态与「重新检查」，无安装 / 登录按钮 |
| I10 | 三 CLI 已装已登录 | 三卡显示已连接；「重新检查」可强制刷新且读数一致 |

旅程（IJ01）：三 CLI 全缺的新机器 → 仅在集成页内依次安装、登录 → 三卡全部已连接；杀进程重开仍全部已连接。

衡量：intent 判据成立即值得用；运行成绩与证据记 [STATUS](STATUS.md)，不在此铺流水。

## 取舍与待决问题

**已放弃的选项**：

- *跳外部终端执行*——命令复制到系统终端跑，卡片只留「去终端」按钮。放弃：打断「页内办完」的目标，且无法感知命令结束自动复查。
- *BW 自建平行 provider 设置页*——不动 Orca 集成页，BW 另起一屏。放弃：与 Orca 设置重复，违背「先复用原生能力」的边界顺序。
- *应用代跑安装命令*——点安装直接执行。放弃：装什么、何时装由人决定，代跑越权且失败面大。

**成本 / 风险**：集成页组件是上游 Orca 文件（非 `workbench/` 叠层目录），改动沿 CodeHub 卡先例直改并记入 upstream 对照，上游同步时需人工核对冲突；welink-cli 安装依赖内网 npm 源配置，机器未配源时安装命令会失败，卡内说明需带源配置提示；内嵌 PTY 终端在设置页内的尺寸与焦点管理是新交互面。

**待决**：5 项见 [intent 待决](intent.md#成功判据与待决问题)，其中待决 2（终端形态）与待决 3（codehub-cli 安装命令口径）直接阻塞实现，需先拍板。

## 实现落点建议（非实现设计）

- 渲染：`src/renderer/src/components/settings/IntegrationsPane.tsx` 收敛布局与分组；以 `integration-card-shell.tsx` 为基础抽统一三卡模板；新增卡片内终端组件（复用 Orca 终端核的 PTY 能力，形态按待决 2）。
- 状态：`integrations-pane-status.ts` 增 `welinkStatus`，`CodeHubCliStatus` 补 `not-authenticated` / `connected`；`PreflightRefreshProvider` 增 `welink`。
- 主进程：`src/main/preflight/agent-detection.ts` 增 `welink-cli` 探测与三卡 `auth status` 读回（codehub 现只探 installed）。
- 类型：`src/preload/api/preflight-api.ts` 的 `PreflightStatus.codehub` 补 `authenticated`，新增 `welink`。
- i18n：五语词条新增 / 调整。
- 以上均为上游 Orca 原生文件，差异随 PR 记入 [ref/upstream.md](../../../ref/upstream.md) 对照。
