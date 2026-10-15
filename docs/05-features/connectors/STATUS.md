# STATUS — 集成页三卡收敛（Connectors）

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-14）**：设计四件（intent / spec / prototype / STATUS）随 #323 设计 PR 首次落仓，全部为草案，待人 gate；未动实现代码。#323 明确「在 PR 里只交设计」，实现待人确认设计后进行（待决 2、3 先拍板）。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | intent.md 草案：五大拷问已答，5 个待决项待人 gate（六卡代码去留、终端形态、codehub-cli 安装命令口径、welink EXPIRED 语义、分组命名） |
| 2 spec | ◐ | spec.md 草稿：旅程、状态口径、命令表、验收点 I01–I10 与旅程 IJ01 已定义；可点原型 [prototype.html](prototype.html) 已带（改前 / 改后、平台、账户范围、五态切换、命令预填演示）；待人确认 |
| 3 实现设计 | ○ | 仅 spec「实现落点建议」（IntegrationsPane 收敛、integrations-pane-status 扩 welink、agent-detection 补探测、preflight-api 类型）；特性级 design 待实现启动时按待决 2 终端形态补 |
| 4 TDD | — | 未动码。实现时按 02 环 4 只立核心算法 / 数据协议看护（状态推导纯函数属核心算法候选） |
| 5 验收点E2E | 待建 | I01–I10 已定义（spec 验收表）；用例注册按 2026-09-29 用户拍板暂缓，实现落地后专项回补 |
| 6 旅程E2E | 待建 | IJ01（三 CLI 全缺 → 页内办到三卡全绿 → 杀进程重开仍绿）已定义、未注册 |

**已知债**：

1. **codehub-cli 安装命令无权威口径**——本机实测为内网分发二进制（非 npm 包），命令与说明链接待内网确认；spec 命令表占位「内网补」，实现前必须补齐或按待决 3 拍板降级口径。
2. **welink-cli 安装依赖内网 npm 源**——`npm install -g @welink/welink-cli` 需机器 npm registry 指向内网源；未配源机器上该命令会失败，卡内说明需带源配置提示（spec 已记，实现待落）。
3. **welink-cli EXPIRED 中间态语义未拍板**——`auth status` 存在「Token EXPIRED、下一条命令自动刷新」态（本机实测 2026-10-14）；草案按已连接处理（intent 待决 4），拍板前实现不得先斩后奏。
4. **原型为演示假体**——终端不真执行命令、远端场景以账户范围切换模拟；不表示能力已交付，行为以真壳与 PR 截图为准。
5. **上游同步冲突面**——集成页组件（IntegrationsPane、integrations-pane-status、agent-detection、preflight-api）均为上游 Orca 原生文件，本特性改动沿 CodeHub 卡先例直改；差异须随实现 PR 记入 [ref/upstream.md](../../../ref/upstream.md) 对照，未记前不算交付完成。
