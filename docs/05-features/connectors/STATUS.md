# STATUS — Connector（集成）卡片：GitHub、CodeHub、WeLink

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-10）**：只交设计。intent / spec / 原型为草案，**未经人 gate**；实现由内网按本目录完成，CodeHub、WeLink 的安装与登录细节待内网补。关联 #323。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md) 草案；带入来源 = 2026-10-10 用户指令（只留 gh，新增 codehub-cli、welink-cli 并提供添加能力）。五个待决项等 gate |
| 2 spec | ◐ | [spec.md](spec.md) 草案 + 可点原型 [prototype.html](prototype.html)（改前 / 改后、平台、状态位置、每张卡状态可切）；验收点 I01–I10 与旅程 IJ01 已定义；命令表 CodeHub、WeLink 列待内网补 |
| 3 实现设计 | ◐ | 落点建议写在 spec §7（预检加 WeLink 探测与 CodeHub 登录探测、`PreflightStatus` 两处定义、三卡通用模板、Workbench 壳只留三张卡与任务来源页三行、终端首行遮挡前置修复）；未实现 |
| 4 TDD | ○ | 未开始；预检探测改动会改既有 `preflight-host-cli-status.test.ts` 的 mock 顺序 |
| 5 验收点E2E | ○ | 未开始 |
| 6 旅程E2E | ○ | IJ01 已定义，未执行 |

## 验收点与旅程矩阵

口径：○ = 未实现、未执行。实现落点见 spec §7。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| I01 只留三张卡 | ○ | `IntegrationsPane.tsx`、副标题渲染 | 未实现 |
| I02 搜索与任务来源页 | ○ | `integrations-search.ts`、`TasksPane.tsx` | 未实现 |
| I03 三卡未安装 | ○ | 预检 + 通用卡 | 未实现 |
| I04 安装命令填进终端 | ○ | 卡片内终端 + 命令表 | PR #309 真壳验过 GitHub 一侧，未在主干实现 |
| I05 登录后已连接 | ○ | 同上 | 未实现；需要真实账号 |
| I06 外部装好后重新检查 | ○ | 预检 | 未实现 |
| I07 不报登录状态的 CLI 显示已安装 | ○ | 命令表登记 + 通用卡 | 未实现 |
| I08 远端 / WSL 不给按钮 | ○ | `getLocalPreflightContext` | PR #309 有实现，未在远端 / WSL 实机验过 |
| I09 重新检查时终端不消失 | ○ | 通用卡 | PR #309 修过同类问题，未在主干实现 |
| I10 超时显示不可用、重启一致 | ○ | 登录探测 | 未实现 |
| IJ01 GitHub 从未安装到已连接、重启仍已连接 | ○ | 全链 | 未执行 |

**已知债**：
1. **`welink-cli` 的安装来源与登录命令未知**——公共 npm 同名包是无关项目（京东前端脚手架，命令名 `welink`）；旧 Rust 主干记的 `npm i -g welink-cli` 作废。`--version` 是否退出 0 也未核（预检靠它判安装）。
2. **CodeHub `auth status` 的退出码含义与站点未核**——命令本身已在 [codehub-cli 用法](../../03-guide/codehub-cli.md) 记录；查的是哪个站点、`CODEHUB_HOST` / `CODEHUB_TOKEN` 环境变量在桌面启动的应用里是否可见，待内网核实。
3. **Windows 上 npm 装的 CLI**——预检的 `execFile` 认不出 `.cmd` 垫片，会误报未安装（spec §5）。
4. **前置修复未合入主干**——Workbench 皮肤把无标题终端的透明标题条刷成卡片色、盖住终端首行；修法在 spec §7，PR #309（已关闭）真壳验证过，主干仍有此问题。
5. **隐藏 Linear、Jira、GitLab 后，Workbench 壳里不能新连这三个任务来源**——已连的不受影响（intent 待决 5）。
