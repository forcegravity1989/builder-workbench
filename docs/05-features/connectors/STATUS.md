# STATUS — 集成页三卡收敛（Connectors）

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-16）**：设计已经人 gate（2026-10-15），实现随 #323 同 PR 交付——三卡渲染（代码托管 / 项目群两组）、preflight 补 `welink-cli` 探测与 codehub / welink `auth status` 读回、三卡登录与安装命令注入开发屏终端页签执行（gh 安装保持外链；welink / codehub 安装均为自包含 npm 命令）。待决 1–4 已全部由人拍板（2026-10-16）：六卡代码留仓、codehub 安装口径落定并接按钮、welink EXPIRED 改判未登录、分组标题补中文。真壳验收证据（I01–I10 / IJ01）未采，见已知债 1。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ✔ | intent.md 已 gate（2026-10-15）；待决 1–4 已全部由人拍板（2026-10-16）：1 六卡代码留仓（只改渲染名单与 search 目录）、2 codehub 安装口径落定（自包含命令，按钮已接）、3 welink EXPIRED 改判未登录（推翻草案倾向）、4 分组标题只补中文 |
| 2 spec | ✔ | spec.md 已 gate 并随实现与拍板对齐：远端运行时无按钮（WSL 工作树属本机范围，按钮保留，I09 同步）、命令注入为本机主进程写入并回车提交（非 `terminal-paste`，那是 SSH 通道）、命令表 welink / codehub 安装均为人确认的自包含权威口径、EXPIRED 归 not-authenticated、分组标题补中文（其余语言回退英文） |
| 3 实现设计 | ✔ | 落地与 spec 实现落点一致：`agent-detection.ts` 补探测编排（每轮 preflight 9 次 execFile：5 版本探测 + 4 auth 读回），codehub / welink 的 auth 读回在 BW 文件 `bw-cli-auth-status.ts`（上游文件受 max-lines 预算约束；welink 读回把 EXPIRED 判未登录，2026-10-16 拍板）；`preflight-api.ts` 补 `codehub.authenticated` 与 `welink` 字段；`integrations-pane-status.ts` 补 codehub / welink 状态推导；CodeHub / WeLink 卡与注入助手在 BW 文件 `bw-cli-integration-cards.tsx` / `cli-command-injection.ts`（同因 max-lines 拆出，经 barrel 导出），GitHub 卡在上游卡模块内接登录注入；三卡注入走 `createTab` + `pendingStartup` + 激活页签；codehub / welink 安装按钮注入各自自包含命令且命令文字行卡上可见；`IntegrationsPane.tsx` 收敛为两组三卡 |
| 4 TDD | ✔ | 看护落在核心口径：preflight 探测编排与 auth 读回语义（`preflight-host-cli-status.test.ts`：9 次调用序列改写 + welink EXPIRED 判未登录（2026-10-16 改判后反转）、无标记判未登录、codehub LOGIN 标记三例）；状态推导纯函数（`integrations-pane-status.test.ts`：codehub 改 auth 语义 + welink 推导）；卡片既有用例随行为更新保持绿（`cli-source-control-integration-cards.test.tsx`，codehub 未安装用例随安装按钮接入改写），未新增 UI 装配用例 |
| 5 验收点E2E | 待建 | I01–I10 已定义（spec 验收表）；用例注册按 2026-09-29 用户拍板暂缓，实现落地后专项回补 |
| 6 旅程E2E | 待建 | IJ01（三 CLI 全缺 → 按按钮指引装好登好、全程不手敲命令 → 重新检查全绿 → 杀进程重开仍绿）已定义、未注册 |

**已知债**：

1. **真壳验收证据未采**——I01–I10 / IJ01 的真壳截图与运行证据未采集（环 5 / 6 待建）；本 PR 的门禁证据为 typecheck / lint / 定向 vitest，行为正确性待真壳复核。
2. **原型为演示假体**——终端不真执行命令、安装不真跳转、远端场景以账户范围切换模拟；不表示能力已交付，行为以真壳与 PR 截图为准。
3. **上游同步冲突面**——上游 Orca 原生文件（IntegrationsPane、cli-source-control-integration-cards、agent-detection、preflight-api）沿 CodeHub 卡先例直改；BW 新增内容落在自有新文件（`bw-cli-integration-cards.tsx`、`cli-command-injection.ts`、`bw-cli-auth-status.ts`，max-lines 预算所迫的拆分，上游合并无冲突面）。差异已随本 PR 记入 [ref/upstream.md](../../../ref/upstream.md) §2.3 对照（三卡渲染名单、探测字段、注入路径、welink EXPIRED 判未登录、codehub / welink 自包含安装命令均为 BW 口径，上游合并不恢复六卡渲染）。
