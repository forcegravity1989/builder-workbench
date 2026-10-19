# spec — 集成页三卡收敛（Connectors）

> **状态：设计已经人 gate（2026-10-15），实现随 #323 交付。** 为什么做读 [intent.md](intent.md)，链状态与已知债读 [STATUS.md](STATUS.md)，可点样张 [prototype.html](prototype.html)（能切换改前 / 改后、平台、账户范围和每张卡的状态）。本篇描述目标行为与实现口径；真壳验收证据以 [STATUS](STATUS.md) 为准。
>
> **维护约定**：给交互设计、实现者与验收者读。目标行为、状态口径或命令表变化时更新；不混写历史方案，不抄代码。

## 范围与入口

- **入口**：设置 → 集成（Integrations）。BW 桌面壳内本机运行时生效。
- **对象**：四张集成卡——代码托管组：GitHub（`gh`）、CodeHub（`codehub-cli`）；项目群组：WeLink（`welink-cli`）；构建组：CloudBuild（`cb`，#366 增补 2026-10-19）。改前为八张卡，改后六张被收敛卡不再出现（去留见 intent 待决 1）。
- **设计原则**：全部动作拼装 Orca 现有能力——检测用现有 preflight，安装入口 gh 保持外链、welink / codehub 由应用后台执行自包含命令（2026-10-16 真壳反馈拍板），「登录」复用上游 `OnboardingInlineCommandTerminal` 在卡内嵌终端里粘贴命令、人按回车执行（2026-10-19 拍板翻转，见取舍区）；不新造交互组件。
- **原型覆盖**：改前 / 改后布局、macOS / Windows 平台、本机 / 远端账户范围、每张卡各状态的组合切换，以及安装 / 登录卡内终端的演示。原型限制：终端为演示假体，不真执行命令；远端 / WSL 场景以账户范围切换模拟。

## 完整用户旅程

**主旅程：把一张卡从缺办到通**（以 WeLink 为例）：

1. Builder 打开设置 → 集成。页面按「代码托管」「项目群」「构建」三组渲染四张卡，每张卡现查现报状态。
2. WeLink 卡显示**未安装**。点「安装」，应用后台执行安装命令（命令见下表，含内网 registry 参数，自包含、不依赖机器 npm 源配置），卡上持续显示**安装中**，不开前台会话、不占会话栏；装完弹完成通知并自动复查，装失败弹失败通知（带原因与输出尾部）。
3. 复查后状态翻**未登录**。
4. 点「登录」。卡内展开内嵌终端（上游 `OnboardingInlineCommandTerminal`，临时终端域、不挂接入的项目工作树），`welink-cli auth login` 已粘贴在提示符上，人按回车执行，WeLink 弹出扫码，人在手机上确认。
5. 登录命令结束（OSC 133;D 报告）后卡自动复查，状态翻**已连接**，卡内不再给安装 / 登录按钮；人也可随时点「重新检查」。

GitHub、CodeHub、CloudBuild 的登录同一模板：`gh auth login`（设备码 / 浏览器流程）、`codehub-cli auth login --all`（内网认证；`--all` 登录全部主机，真壳实测不带会报错，2026-10-19）、`cb login`（CloudBuild，凭据自管在 `~/.cloudbuild/`）粘贴进卡内终端后，交互流程由各 CLI 自己呈现，卡片不拦截。GitHub 的安装保持现有外链行为（跳 cli.github.com，人按官方说明装）；CodeHub 安装按钮与 WeLink 同款——应用后台执行命令表的自包含 npm 命令（口径人确认 2026-10-16）；CloudBuild 安装同按钮但命令为**两步**（见命令表，人指定 2026-10-19）。

**分支**：

- **已装未登录**：从第 4 步开始。
- **远端运行时**：状态照常显示，但没有「安装」「登录」按钮——本机后台装不了远端机器。WSL 工作树不在此列：仍属本机范围，按钮保留。
- **登录命令失败 / 中断**：终端留在卡内，输出与退出码可见，**不自动重开终端或重新注入**——错误留在屏上，人再点「登录」才开新会话，或在终端里手敲重试（2026-10-19 真壳反馈）；卡上状态如实保持，命令结束后自动复查，人也可点「重新检查」。
- **登录中离开设置页**：内嵌终端随卡片卸载、登录会话关闭（2026-10-19 拍板时知情的取舍）；回集成页再点「登录」重开。
- **安装失败**：失败通知带原因与安装输出尾部；卡上「安装」按钮恢复可点，人可重试；状态保持未安装，刷新靠通知后的自动复查或人点「重新检查」。

## 行为规则与异常

### 状态口径（沿用现有 `CliProviderCardState`，不新造）

| 状态 | 含义 | 推导 |
|---|---|---|
| checking | 探测进行中 | preflight 在途或刷新中 |
| not-installed | CLI 不在 PATH | 现有 `detectCommandRuntime` 探不到可执行文件；cb 的存活探测用 `cb version` 子命令（`--version` 是未知旗标，真壳实测 2026-10-19） |
| not-authenticated | 已装，`auth status` 报未登录 | gh / codehub-cli / welink-cli / cb 各自 `auth status` 读回（codehub、welink、cloudbuild 为补齐）；codehub / welink / cb 未登录时 `auth status` 也退出 0（2026-10-16 / 10-19 真壳实测），登录判定按输出标记解析、不信退出码（codehub 看主机表 LOGIN 列，welink 看 User Token 行，cb 看 `Token Expires` 行且不带 `(expired)` 后缀——过期 token 仍退出 0，实测 2026-10-19）；welink-cli 的 EXPIRED（本会自动刷新）与 cb 的 `(expired)` 同归此态（welink 人拍板 2026-10-16，cb 照此口径） |
| connected | 已装且已登录 | 同上；welink-cli 输出含 EXPIRED、cb 输出含 `(expired)` 不算 connected |
| unavailable | 状态在当前运行时不可得 | 现有 unavailable 口径（探测本身失败或运行时不支持） |

信号只能从探测推导；探测不可得就是 unavailable，不给绿灯（铁律二）。

探测执行口径（Windows，2026-10-16 真壳发现并修复）：npm 全局安装的 CLI 在 Windows 上只有 `.cmd` shim，`CreateProcess` 只能启动真可执行文件——探测若直接 spawn 命令名，装完仍报未安装。探测须先按 PATH + PATHEXT 用 fs 解析出真实文件，`.cmd` / `.bat` 经 `cmd.exe` 执行，其余保持直接 spawn。

### 命令表（welink / codehub / cloudbuild 安装为人确认的权威口径；安装由应用后台执行，登录填入卡内终端）

| CLI | 安装 | 登录（填入卡内终端，人按回车） | 状态探测 |
|---|---|---|---|
| `gh` | 外链 https://cli.github.com （现有行为，人按官方说明装） | `gh auth login` | `gh auth status` |
| `codehub-cli` | `npm install -g @codehub/codehub-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false`（人确认 2026-10-16；自包含同 welink，不动机器 npm 配置） | `codehub-cli auth login --all` | `codehub-cli auth status` |
| `welink-cli` | `npm install -g @welink/welink-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false` | `welink-cli auth login`（扫码） | `welink-cli auth status` |
| `cb`（cloudbuild） | **两步**（人指定 2026-10-19）：① `npm config set @hw-cloudbuild:registry https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/` ② `npm install -g @hw-cloudbuild/cloudbuild-cli` | `cb login` | 存活 `cb version`；登录 `cb auth status` 按输出标记解析 |

- welink 安装命令自带内网 registry 与 `--strict-ssl=false`，机器无需预配 npm 源；公共 npm 的同名 `welink-cli` 是京东前端脚手架，不可用（#323 已警示）。
- cloudbuild 的口径与 codehub / welink 不同（人指定）：第一步把 scoped registry **写进机器 npm 配置**（`@hw-cloudbuild` 域名走内网源），第二步裸 `npm install -g`；不带 `--strict-ssl=false`。两步在卡上摆成两行文字、后台按序执行，任一步失败即中止并报该步的退出码。
- 命令本身不翻译；安装由应用后台执行、登录粘贴进卡内终端的都是卡上可见的命令（cloudbuild 为两行），人不手敲（按回车执行）。

### 卡片模板与交互规则

- 四卡共用现有 `IntegrationCardShell` 模板：图标、名称、一句话说明、状态徽标、账户范围行（现有 `ProviderHostScopeControl`）、按状态换出的操作区；命令照现有 GitHub 卡摆成文字行，人看得到按钮会注入什么。账户范围行只留范围标签与说明，「打开远程服务器」跳转按钮按人拍板（2026-10-16）从卡上移除——价值低，设置导航不走卡内捷径。
- 「安装」按钮只在**未安装**且账户范围为本机时出现：gh 跳外链（现有 `openUrl` 模式）；welink / codehub 由应用后台执行命令表的自包含安装命令，cloudbuild 由应用后台**按序执行两步**命令，卡上持续显示**安装中**，不开前台会话、不占会话栏；完成与失败都弹通知，成功后自动复查（2026-10-16 真壳反馈拍板）。
- 「登录」按钮只在**未登录**且本机时出现：卡内展开上游 `OnboardingInlineCommandTerminal` 内嵌终端（临时终端域、不挂接入的项目工作树），`auth login` 粘贴在提示符上，人按回车执行（2026-10-19 拍板翻转，见取舍区）。
- 点按钮即把卡上可见的那一条命令填进终端；登录命令开始后的交互（扫码、设备码、进度）由 CLI 在终端里自己呈现，人可随时在终端里中断或重试。
- 「重新检查」沿用现有 Re-check 按钮，任何非 checking 状态可用；点它只把**该卡**翻成 checking，兄弟卡保持已显示状态（2026-10-19 真壳反馈拆分；主进程探测仍跑全量，拆分只在 UI 层）；卡内终端的登录命令结束（OSC 133;D）自动触发复查，应用后台的安装结束由通知携带结果、成功后自动复查——2026-10-16「终端登录由人点 Re-check」的拆分随内嵌终端的结束检测能力作废。
- 已连接卡不给安装 / 登录，只留「重新检查」。

### 异常与边界

- **探测不可得**：整卡显示 unavailable + 「重新检查」，沿用现有口径，不拆分单卡错误。
- **杀进程重开**：状态重新探测，不缓存上次的绿灯（铁律一）。
- **i18n**：卡名、状态与按钮文案进英文词条（照 CodeHub 卡先例，其余语言经 `translate` 的 defaultValue 回退）；三个分组标题与描述行补中文（代码托管 / 项目群为人拍板 2026-10-16，构建组随 #366 增补同款，其余语言仍回退英文）；命令与链接不翻译。

## 验收与衡量

验收点（稳定标识，真壳执行）：

| 点 | 场景 | 可观察结果 |
|---|---|---|
| I01 | 打开设置 → 集成 | 只见四张卡，按代码托管 / 项目群 / 构建三组排列，六张旧卡不出现 |
| I02 | `gh` 未安装（本机） | GitHub 卡显示未安装；「安装」跳 cli.github.com（现有行为保持） |
| I03 | `gh` 已装未登录 | 卡显示未登录；点「登录」卡内展开内嵌终端，`gh auth login` 已粘贴待回车 |
| I04 | `codehub-cli` 未安装 | CodeHub 卡显示未安装；点「安装」应用后台执行 npm 安装命令（含 registry 参数），卡显示安装中，完成弹通知并自动复查 |
| I05 | `codehub-cli` 已装未登录 | 卡显示未登录（新增登录探测）；点「登录」卡内展开内嵌终端，`codehub-cli auth login --all` 已粘贴待回车 |
| I06 | `welink-cli` 未安装 | WeLink 卡显示未安装；点「安装」应用后台执行 npm 安装命令（含 registry 参数），卡显示安装中，完成弹通知并自动复查 |
| I07 | `welink-cli` 已装未登录 | 卡显示未登录；点「登录」卡内展开内嵌终端，`welink-cli auth login` 已粘贴待回车，扫码由 CLI 呈现 |
| I08 | 终端内完成登录（命令结束） | 卡自动复查翻已连接；「重新检查」手动亦可 |
| I09 | 账户范围为远端运行时 | 各卡只报状态与「重新检查」，无安装 / 登录按钮（WSL 工作树仍属本机范围，按钮保留） |
| I10 | 四 CLI 已装已登录 | 四卡显示已连接；「重新检查」读数一致 |
| I11 | `cb` 未安装 | CloudBuild 卡在构建组显示未安装；卡上摆两行安装命令，点「安装」应用后台按序执行两步，卡显示安装中，完成弹通知并自动复查 |
| I12 | `cb` 已装未登录（含 token 过期） | CloudBuild 卡显示未登录（过期 token 不亮绿灯）；点「登录」卡内展开内嵌终端，`cb login` 已粘贴待回车 |

旅程（IJ01）：四 CLI 全缺的新机器 → 从集成页看全状态、按按钮指引装好登好（全程不手敲命令）→ 「重新检查」四卡全部已连接；杀进程重开仍全部已连接。

衡量：intent 判据成立即值得用；运行成绩与证据记 [STATUS](STATUS.md)，不在此铺流水。

## 取舍与待决问题

**已放弃的选项**：

- *登录命令注入浮动终端页签并自动跳转*——2026-10-16 真壳反馈拍板的方案，2026-10-19 作废：浮动面板是自带 open 态的浮层，reveal / 激活链路连续暴露缺陷（工作区导航到不了面板、真壳复现一次点击产生两个页签且空白者被激活），且「主进程自动回车提交」偏离 issue 原文「人按回车执行」。
- *命令摆成文字让人自己敲*——上游现状。放弃：点按钮把命令填进终端，人不敲命令（人拍板 2026-10-15）。
- *跳外部系统终端*——放弃：卡内终端就是现成能力，无需另开系统窗口。
- *应用后台代跑命令*——原放弃（登录保持终端，人可看可中断）；2026-10-16 真壳反馈对**安装**作废并采纳：安装不需要人交互，由应用后台执行并通知结果；登录因扫码 / 输入仍走终端。

**已采纳（2026-10-19 翻转）**：*卡片内嵌终端*——issue 初稿的设想，首版设计曾以「为设置页新造终端交互面」为由放弃；该前提不成立：上游 `OnboardingInlineCommandTerminal`（2026-05 起服务 onboarding / 技能安装等设置面板）就是现成的设置页内嵌终端——粘贴命令不回车、人按回车执行，OSC 133;D 报告命令结束供自动复查，卸载即清理后台页签。人拍板（2026-10-19）翻转采纳。

**成本 / 风险**：集成页组件是上游 Orca 文件（非 `workbench/` 叠层目录），改动沿 CodeHub 卡先例直改并记入 upstream 对照，上游同步时需人工核对冲突；codehub-cli 安装口径依赖内网补齐。

**待决**：原 4 项已全部由人拍板（2026-10-16），落点见 [intent 待决](intent.md#成功判据与待决问题)各条；cloudbuild 的「构建」分组为本特性自行判断，待人确认（intent 拍板 8）。

## 实现落点建议（非实现设计）

- 渲染：`src/renderer/src/components/settings/IntegrationsPane.tsx` 收敛为四卡 + 三组分组标题；CodeHub / WeLink / CloudBuild 三卡落在 BW 自有文件 `bw-cli-integration-cards.tsx`——三卡共用一个 `BwCliIntegrationCard` 骨架（状态分支、安装区、登录区、卡内终端），每卡只是文案、探测字段与登录命令的薄配置（上游卡模块 `cli-source-control-integration-cards.tsx` 受 max-lines 预算约束，BW 卡不进），本机范围 hook 在 `use-local-cli-scope.ts`、安装动作 hook 在 `cli-install-action.ts`，经 barrel `source-control-integration-cards.tsx` 一并导出。
- 状态：`source-control-preflight-card-status.ts` / `integrations-pane-status.ts` 增 `welinkStatus` / `cloudbuildStatus`；`CodeHubCliStatus` 补 `not-authenticated` / `connected`。
- 主进程探测：`src/main/preflight/agent-detection.ts` 增 `welink-cli` / `cb` 探测与 codehub / welink / cb 的 `auth status` 读回（照 gh 现成模式）；BW 三 CLI 的探测与读鉴权编排下沉在 `bw-cli-auth-status.ts`（`probeBwClis` / `readBwCliAuths`，回调注入探测函数避免循环依赖），保住上游文件的 max-lines 预算；`preflight-command-exec.ts` 的 `isCommandAvailable` / `detectCommandRuntime` 增存活探测参数（cb 传 `version` 子命令）；`command-path-resolver.ts` 增 `resolveCommandOnLocalPath` 返回真实文件路径，`preflight-command-exec.ts` 把 `.cmd` / `.bat` 改经 `cmd.exe` 执行（Windows shim 盲区修复，2026-10-16 真壳发现）。
- 安装后台执行：命令表在 `src/shared/bw-cli-install-commands.ts`（每 CLI 一组有序 argv，卡上文字行与后台执行同源；cloudbuild 为两条）；主进程 runner `src/main/ipc/bw-cli-install.ts` 按序执行各步、任一步失败即中止并报该步退出码（in-flight 去重，完成 / 失败经 `cliInstall:finished` 广播），随 `register-core-handlers` 注册；preload `bw-cli-install-api.ts` + `cli-install-bridge.ts`；渲染端 `cli-install-action.ts` 订阅完成通知（成功自动复查，失败带原因与输出尾部）。
- 登录卡内终端：三卡未登录分支直接渲染上游 `OnboardingInlineCommandTerminal`（`src/renderer/src/components/onboarding/OnboardingInlineCommandTerminal.tsx`）——它自建品牌化临时终端域的 backing 页签（`brandEphemeralSetupTerminalWorktreeId`，不挂工作树）、内嵌 `TerminalPane`、等 PTY 就绪后经 `PASTE_TERMINAL_TEXT_EVENT` 粘贴命令**不回车**（人按回车执行，issue 原文形态）、OSC 133;D 回调 `onCommandFinished` 供卡自动复查、卸载或 PTY 退出即清理页签；卡片只传命令、标题、临时域 id（`connectors-{gh|codehub|welink|cloudbuild}-login`）与两个回调。被替代的浮动终端注入（`cli-command-injection.ts` 的 reveal 逻辑）已随本翻转删除。
- 类型：`src/preload/api/preflight-api.ts` 的 `PreflightStatus.codehub` 补 `authenticated`，新增 `welink` / `cloudbuild`。
- i18n：英文词条新增 / 调整（`en.json`，照 CodeHub 卡先例；其余语言走 defaultValue 回退）。
- 上游 Orca 原生文件的差异随 PR 记入 [ref/upstream.md](../../../ref/upstream.md) 对照；`bw-cli-install-*`、`cli-install-action.ts` 为 BW 自有文件，无上游冲突面。
