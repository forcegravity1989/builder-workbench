# spec — 内部集成

> **维护约定**：给设计、实现、检视和验收者读取。本篇只维护当前入口、行为、失败边界和验收判据。用户结果见 [intent.md](intent.md)，证据边界见 [STATUS.md](STATUS.md)。原型 [prototype.html](prototype.html) 不代表生产行为。

## 入口与旅程关系

入口是设置 → 集成，作用于当前 Monica 本机运行时。设置页与 Monica 入门复用同一套 CLI 探测、安装和登录能力。

集成是 W03「构建交付」和 W04「验收成果」的前置能力。W03 使用 GitHub 或 CodeHub 任务、评审入口，W04 可选使用 WeLink 发送报告与诊断。CloudBuild 属于构建入口。IJ01 是旧旅程标识，当前不独立登记用户旅程 E2E。

## 四张卡

| CLI | 分组 | 安装 | 登录 | 状态探测 |
| --- | --- | --- | --- | --- |
| `gh` | 代码托管 | 打开 [cli.github.com](https://cli.github.com) | `gh auth login` | `gh auth status` |
| `codehub-cli` | 代码托管 | `npm install -g @codehub/codehub-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false` | `codehub-cli auth login --all` | `codehub-cli auth status` |
| `welink-cli` | 报告与诊断 | `npm install -g @welink/welink-cli --registry=https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/ --strict-ssl=false` | `welink-cli auth login` | `welink-cli auth status` |
| `cb` | 构建 | 先执行 `npm config set @hw-cloudbuild:registry https://cmc.centralrepo.rnd.huawei.com/artifactory/api/npm/product_npm/`，再执行 `npm install -g @hw-cloudbuild/cloudbuild-cli` | `cb login` | 存活使用 `cb version`，登录使用 `cb auth status` |

安装动作只在本机未安装状态出现。CodeHub、WeLink 和 CloudBuild 的安装由应用后台按规格命令执行，CloudBuild 两步中任一步失败都停止并报告失败原因。GitHub 保持现有外链行为。

## 状态与操作

| 状态 | 含义 | 操作 |
| --- | --- | --- |
| 检查中 | 当前探测仍在进行 | 等待本轮结果 |
| 未安装 | 找不到可执行 CLI | 本机显示安装入口 |
| 未登录 | CLI 可执行但登录探测未通过 | 本机展开卡内终端并填入登录命令 |
| 已连接 | CLI 可执行且登录探测通过 | 只显示重新检查 |
| 不可用 | 当前运行时无法得到可靠状态 | 显示原因和重新检查 |

登录命令填入复用的卡内终端但不自动回车。Builder 按 CLI 自身提示完成交互。命令结束后卡片自动重新探测，失败或中断时保留输出和失败状态，Builder 可以重新打开登录终端。重新检查只更新所点卡的显示状态，后台探测仍按现有共享机制执行。

## 用户路径

1. Builder 打开设置 → 集成，页面按代码托管、报告与诊断和构建分组显示四张卡。
2. 页面读取当前运行时状态。未安装卡提供安装动作，未登录卡提供登录动作。
3. Builder 执行安装或在卡内终端按回车完成登录。完成后页面自动重新探测，也可以手动重新检查。
4. 已连接卡只保留重新检查。离开设置页时，卡内登录终端随卡卸载并结束。
5. 重启 Monica 后重新读取四 CLI 状态，不使用上次缓存的绿灯。

## 失败边界

- 状态信号只能从当前探测和输出标记推导。探测失败或无法确认时显示不可用。
- CodeHub、WeLink 和 CloudBuild 的 `auth status` 退出码不能单独证明已登录。CodeHub 读取主机表的登录标记，WeLink 读取 User Token 行，CloudBuild 读取 `Token Expires` 行。WeLink 的 `EXPIRED` 和 CloudBuild 的 `(expired)` 均按未登录处理。
- Windows npm 全局 CLI 的 `.cmd` 或 `.bat` shim 需要按本机 PATH 解析并经 `cmd.exe` 执行。不能因探测到 shim 就直接报告已安装。
- 远端运行时只读状态，不提供本机安装和登录动作。WeLink 是可选报告与诊断能力，不参与任务或评审来源完成判断。
- 原型中的模拟状态、模拟安装和模拟登录不能替代真实 CLI、真实权限或重启后的独立读回。

## 验收判据

| 标识 | 场景 | 可观察结果 |
| --- | --- | --- |
| I01 | 打开设置 → 集成 | 四张卡按三组显示，收敛的旧 provider 卡不出现 |
| I02 | `gh` 未安装 | GitHub 卡显示未安装，安装动作打开官方入口 |
| I03 | `gh` 已安装未登录 | 卡内终端填入 `gh auth login`，等待 Builder 回车 |
| I04 | `codehub-cli` 未安装 | 后台执行安装命令，显示安装中并在结束后重新探测 |
| I05 | `codehub-cli` 已安装未登录 | 卡内终端填入 `codehub-cli auth login --all` |
| I06 | `welink-cli` 未安装 | 后台执行带 registry 的安装命令，结束后重新探测 |
| I07 | `welink-cli` 已安装未登录 | 卡内终端填入 `welink-cli auth login` |
| I08 | 任一登录命令结束 | 对应卡自动重新探测，成功时显示已连接 |
| I09 | 远端运行时 | 只显示状态和重新检查，本机安装与登录动作不出现 |
| I10 | 四 CLI 已安装并已登录 | 四张卡均显示已连接，重新检查读数一致 |
| I11 | `cb` 未安装 | 构建卡显示两步安装命令，按序执行并报告失败步骤 |
| I12 | `cb` 未登录或 token 过期 | 显示未登录，卡内终端填入 `cb login` |
| I13 | 入门中只连接 GitHub 或只连接 CodeHub | 任一当前环境已登录的代码托管 CLI 可完成对应来源配置，状态随重新探测变化 |
| I14 | WeLink 未安装、未登录或内网不可用 | 报告与诊断入口可跳过，不影响任务与评审来源配置 |

本特性最多登记一条验收点 E2E。当前没有登记到 Monica 白名单的业务 E2E，未来应由一条真实入口覆盖适用的 I01–I14。该入口不能替代 W03 或 W04 的主旅程证据。
