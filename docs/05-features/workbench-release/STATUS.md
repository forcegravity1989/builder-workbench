# STATUS — Windows 出包与发布 · 版本描述 · 验收报告

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-10-15，#332 批）**：出包脚本之外，新增发布脚本 `release-win-workbench.mjs`（机械全流程 + 单测）、版本描述规范与骨架模板、验收报告规范与骨架模板；`version-report` 技能退役、职责并入本技能。intent / spec 的 #332 增量**待人 gate**。本次没有重新出包，也没有创建真实 Release（预演只读，不写远端）。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | 草案 [intent.md](intent.md)。来源 `5b7907b12`、`2ff486012` + #332 增量，无人 gate 记录 |
| 2 spec | ◐ | 草案 [spec.md](spec.md)（含 R05/R06 与版本描述/验收报告契约）。无界面，操作契约指向技能；规格 gate 未过 |
| 3 实现设计 | ◐ | 技能 [SKILL.md](../../../.claude/skills/workbench-release/SKILL.md)、`build-win-workbench.mjs`、`release-win-workbench.mjs`、`package.json` 的 `build:win:workbench` / `release:win:workbench`、两份规范 + 两份骨架模板（`references/`、`assets/`）。无单独 design |
| 4 TDD | ◐ | `release-win-workbench.test.mjs` 18 例覆盖 tag 解析、资产核对、gh 参数、授权闸与发布阻断项聚合（`pnpm exec vitest run config/scripts/release-win-workbench.test.mjs`）。出包脚本仍无单测 |
| 5 验收点 E2E | ○ | R01–R06 已定义（R05 版本描述合规范、R06 验收报告合规范），入口（脚本守卫 + 规范 + 模板）在仓，但未对真实发布跑。特性矩阵已知债里的「真实出包/验包」仍成立 |
| 6 用户旅程 E2E | ○ | RJ01 已扩到「出包→写版本描述→授权发布→读回→出验收报告归档」。需本机 Windows 构建和已登录 `gh`，本次未执行 |

## 验收点与旅程矩阵

口径：◐ = 入口已落地，没有这次运行的证据；○ = 未执行。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| R01 只出包得到三个产物 | ◐ | `build-win-workbench.mjs` | 脚本在仓；本次未出包 |
| R02 未授权不发布 | ◐ | `release-win-workbench.mjs` 预演（无 `--publish`）+ 技能纪律 | 预演只读；未做一次「只出包」的远端读回 |
| R03 授权发布后读回同一 HEAD | ◐ | `release-win-workbench.mjs --publish` + `gh release view` 读回 | 未创建真实 Release，不能把脚本/技能文本当成读回 |
| R04 失败时不覆盖 | ◐ | 脚本 blockers（缺资产 / 标签占用 / HEAD 不在远端 / 未登录 / 脏） | 未演练已存在标签、缺资产、未登录 |
| R05 版本描述合规范 | ◐ | [release-notes-spec.md](../../../.claude/skills/workbench-release/references/release-notes-spec.md) + 模板；脚本 `--notes-file`（拒 `--generate-notes`） | 规范与模板在仓；未对一次真实 Release 正文核验 |
| R06 验收报告合规范 | ◐ | [acceptance-report-spec.md](../../../.claude/skills/workbench-release/references/acceptance-report-spec.md) + 模板；归档登记 `preparedArtifacts kind=showcase` | 规范与模板在仓；未产出一份真实版本收尾报告 |
| RJ01 出包→写版本描述→授权发布→读回→出验收报告 | ○ | 同上 | 未执行 |

**已知债**：
1. 安装包是否真能安装、`latest.yml` 是否指向这次 exe、真实发布与读回，都没有验过（需本机 Windows 出包 + 授权，属人跑）。
2. 退役 `version-report` 的 `report.py` ＝ 放弃确定性事实采集；验收报告事实改为人/模型依规范**具名引用**读回，靠来源脚注 + 诚实守卫（证据分层、Unknown 不是绿、缺值不填 0、人确认完成）补偿反编造。
3. 版本描述规范与验收报告规范的**分节骨架**尚未经一次真实发布/收尾打磨，可能需按实跑反馈微调（分节名已冻结以防漂移）。
4. `.bw/planning/v0.4/report.{json,html}` 为 version-report 历史归档，保留不改写。
