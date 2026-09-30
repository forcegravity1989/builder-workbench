# STATUS — Windows 出包与发布

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-09-30）**：技能和出包脚本已在本分支。intent / spec 从提交回写，**待人 gate**。本次写文档时没有重新出包，也没有创建 Release。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | 草案 [intent.md](intent.md)。来源是 `5b7907b12`、`2ff486012`，无人 gate 记录 |
| 2 spec | ◐ | 草案 [spec.md](spec.md)。无界面，操作契约指向技能；规格 gate 未过 |
| 3 实现设计 | ◐ | 技能、`config/scripts/build-win-workbench.mjs`、`package.json` 的 `build:win:workbench`、[SYNC.md](../../../src/renderer/src/workbench/SYNC.md) 的 Windows 一行。无单独 design |
| 4 TDD | ○ | 出包脚本没有单测。可移植 pnpm 调用没有随 `2ff486012` 留下测试 |
| 5 验收点 E2E | ○ | R01–R04 已定义，未跑。特性矩阵已知债里的「真实出包/验包」仍成立 |
| 6 用户旅程 E2E | ○ | RJ01 已定义。需要本机 Windows 构建和已登录的 `gh`，本次未执行 |

## 验收点与旅程矩阵

口径：◐ = 入口已落地，没有这次运行的证据；○ = 未执行。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| R01 只出包得到三个产物 | ◐ | `build-win-workbench.mjs` | 脚本在仓；本次未出包 |
| R02 未授权不发布 | ◐ | 技能「出包」节 | 纪律写在技能里；未做一次「只出包」的远端读回 |
| R03 授权发布后读回同一 HEAD | ◐ | 技能「发版本」节 | 未创建 Release，不能把技能文本当成读回 |
| R04 失败时不覆盖 | ◐ | 技能 error_handling | 未演练已存在标签、缺资产、未登录 |
| RJ01 出包后授权发布并读回 | ○ | 同上 | 未执行 |

**已知债**：安装包是否真能安装、`latest.yml` 是否指向这次 exe，都没有验过。version-report 仍调用 `.bw/release/pack`，和本入口并列，未决定是否合并。
