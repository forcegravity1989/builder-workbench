# STATUS — 与「端口」同构的状态栏「常用链接」入口（quick-links）

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-11-13）**：范围已由人经多轮澄清收敛——Orca 端口面板已覆盖服务识别与打开（复用、不重建），web-manager 的增量是「存储网页标签」，落点为**与端口同构的状态栏「常用链接」入口 + 独立 popover 面板**（来源 [#650](https://github.com/forcegravity1989/builder-workbench/issues/650)；2026-11-13 人评审由「右栏子分区/独立窗口」改定为状态栏入口）。**本轮已落地实现代码**（`QuickLinksStatusSegment` + 项目级 `.bw/quick-links.json` 读写），但**尚未真壳验证**（未跑两屏/会话注入类真壳 E2E，截图证据未产出）。intent / spec / design 仍为草案待人 gate。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | 草案（待 gate） | [intent.md](intent.md)：价值=端口之外的常用链接、项目级、无状态灯、避「收藏夹病」；落点=与端口同构的状态栏入口（2026-11-13 人评审）；「项目」口径按激活仓库（`useActiveRepo`）实现，其余待决待人拍板 |
| 2 spec | 草案（待 gate） | [spec.md](spec.md)：入口=状态栏图标+计数→popover、完整旅程、字段与校验规则、验收点 QL01–QL12、旅程 QLJ01；均为定义、未注册 |
| 3 实现设计 | 已实现（待人评审，未真壳验证） | 代码：`src/renderer/src/workbench/quick-links/QuickLinksStatusSegment.tsx`（状态栏段+popover+内联增改表单）、`quick-links-store.ts`（经 `window.api.fs` 读写 `.bw/quick-links.json`，复用既有 fs 桥、不新增主进程 IPC）、`src/shared/workbench/quick-links.ts`（schema+URL 归一化/校验纯函数）；上游改动仅 `StatusBarSurface` 一处挂载、`StatusBarItem`/RPC 枚举与默认项、`StatusBarVisibilityMenu` 一项开关（见 [design.md](design.md)） |
| 4 TDD | 未新增用例 | 纯函数（URL 归一化/去重/校验）未新增单测：受环 4 叠层 vitest 例数 ratchet（净零、只减不增）约束，本次无存量负面清单用例可对冲，故不增例；行为由真壳验收点覆盖，待专项回补 |
| 5 验收点E2E | 待验证 | QL01–QL12 已定义（spec 验收表），未注册、未真壳执行 |
| 6 旅程E2E | 待验证 | QLJ01 已定义、未注册、未真壳执行 |

**已知债**：

1. **已写实现、未真壳验证**——真实持久化读回、项目隔离、杀进程读回、内置浏览器打开需真壳执行并留证据；本状态不宣称能力已交付。
2. **单测缺口**——受 ratchet 净零约束本轮不增例，纯函数待专项回补（可考虑同交付对冲删除负面清单用例后在 PR 说明）。
3. **默认开启迁移的已知取舍**——既有本地 profile 首次升级时经一次性 flag 补入该入口；新 profile 由 `DEFAULT_STATUS_BAR_ITEMS` 默认带出。真壳需验证升级路径。
