# STATUS — 集成页三卡收敛（Connectors）

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-15）**：设计已经人 gate（两轮修订后拍板「看着计划无问题，可以进行开发」），实现随 #323 同 PR 交付——三卡渲染（代码托管 / 项目群两组）、preflight 补 `welink-cli` 探测与 codehub / welink `auth status` 读回、三卡登录与 welink 安装命令注入开发屏终端页签执行（gh 安装保持外链，codehub 安装占位）。真壳验收证据（I01–I10 / IJ01）未采，见已知债 3。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ✔ | intent.md 已 gate（2026-10-15）；待决 1（六卡组件 / 状态推导 / 词条保留在仓，只改 `IntegrationsPane` 渲染名单与 `integrations-search` 目录）与待决 3（welink EXPIRED 算 connected）按草案随实现交付，最终去留待人复核；待决 2（codehub 安装口径，见已知债 1）与待决 4（分组标题五语词条怎么译）仍开放 |
| 2 spec | ✔ | spec.md 已 gate 并随实现对齐现实：远端运行时无按钮（WSL 工作树属本机范围，按钮保留，I09 同步）、命令注入为本机主进程写入并回车提交（非 `terminal-paste`，那是 SSH 通道）、i18n 照 CodeHub 先例只进 `en.json`；命令表 welink 安装为人确认权威口径 |
| 3 实现设计 | ✔ | 落地与 spec 实现落点一致：`agent-detection.ts` 补探测编排（每轮 preflight 9 次 execFile：5 版本探测 + 4 auth 读回），codehub / welink 的 auth 读回在 BW 文件 `bw-cli-auth-status.ts`（上游文件受 max-lines 预算约束）；`preflight-api.ts` 补 `codehub.authenticated` 与 `welink` 字段；`integrations-pane-status.ts` 补 codehub / welink 状态推导；CodeHub / WeLink 卡与注入助手在 BW 文件 `bw-cli-integration-cards.tsx` / `cli-command-injection.ts`（同因 max-lines 拆出，经 barrel 导出），GitHub 卡在上游卡模块内接登录注入；三卡注入走 `createTab` + `pendingStartup` + 激活页签；`IntegrationsPane.tsx` 收敛为两组三卡 |
| 4 TDD | ✔ | 看护落在核心口径：preflight 探测编排与 auth 读回语义（`preflight-host-cli-status.test.ts`：9 次调用序列改写 + 新增 welink EXPIRED 计 connected、无标记判未登录、codehub LOGIN 标记三例）；状态推导纯函数（`integrations-pane-status.test.ts`：codehub 改 auth 语义 + welink 推导）；卡片既有用例随行为更新保持绿（`cli-source-control-integration-cards.test.tsx`），未新增 UI 装配用例 |
| 5 验收点E2E | 待建 | I01–I10 已定义（spec 验收表）；用例注册按 2026-09-29 用户拍板暂缓，实现落地后专项回补 |
| 6 旅程E2E | 待建 | IJ01（三 CLI 全缺 → 按按钮指引装好登好、全程不手敲命令 → 重新检查全绿 → 杀进程重开仍绿）已定义、未注册 |

**已知债**：

1. **codehub-cli 安装口径无权威口径**——内网分发二进制，安装命令或说明链接待内网确认（intent 待决 2）。实现按 spec「如实占位」：CodeHub 卡未安装态显示「安装口径待内网确认」说明、不给安装按钮；登录注入不受影响。补齐口径后补按钮。
2. **welink-cli EXPIRED 语义按草案落地**——`auth status` 存在「Token EXPIRED、下一条命令自动刷新」态（本机实测 2026-10-14）；实现按 intent 待决 3 草案算 connected（exit 0 即登录，含 EXPIRED），已有单测看护；待人复核转正。
3. **真壳验收证据未采**——I01–I10 / IJ01 的真壳截图与运行证据未采集（环 5 / 6 待建）；本 PR 的门禁证据为 typecheck / lint / 定向 vitest，行为正确性待真壳复核。
4. **原型为演示假体**——终端不真执行命令、安装不真跳转、远端场景以账户范围切换模拟；不表示能力已交付，行为以真壳与 PR 截图为准。
5. **上游同步冲突面**——上游 Orca 原生文件（IntegrationsPane、cli-source-control-integration-cards、agent-detection、preflight-api）沿 CodeHub 卡先例直改；BW 新增内容落在自有新文件（`bw-cli-integration-cards.tsx`、`cli-command-injection.ts`、`bw-cli-auth-status.ts`，max-lines 预算所迫的拆分，上游合并无冲突面）。差异已随本 PR 记入 [ref/upstream.md](../../../ref/upstream.md) §2.3 对照（三卡渲染名单、探测字段、注入路径为 BW 口径，上游合并不恢复六卡渲染）。
