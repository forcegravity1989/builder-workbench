# STATUS — Windows 出包与发布 · 版本描述 · 验收报告

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-10-16，v0.6.0 发布后）**：v0.6.0 已正式发布（tag `v0.6.0` → `ece1d7269`，三资产；本机公司代理拦大体积上传，资产经套件 zip 在不受限网络上传）。发布固定动作改走 `.github/workflows/bw-release.yml`（PR #378，合入后才能触发自测）；本地脚本降为兜底。版本描述经 v0.6.0 实跑定稿为【这版有什么变化】单节，规范与模板已同步。验收报告（R06）待出。intent / spec 的 #332 增量与 v0.6.0 后续增量**待人 gate**。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ◐ | 草案 [intent.md](intent.md)。来源 `5b7907b12`、`2ff486012` + #332 增量，无人 gate 记录 |
| 2 spec | ◐ | 草案 [spec.md](spec.md)（含 R05/R06 与版本描述/验收报告契约）。无界面，操作契约指向技能；规格 gate 未过 |
| 3 实现设计 | ◐ | 技能 [SKILL.md](../../../.claude/skills/workbench-release/SKILL.md)、`.github/workflows/bw-release.yml`（PR #378）、`build-win-workbench.mjs`、`release-win-workbench.mjs`、`package.json` 的 `build:win:workbench` / `release:win:workbench`、两份规范 + 两份骨架模板（`references/`、`assets/`）。无单独 design |
| 4 TDD | ◐ | `release-win-workbench.test.mjs` 20 例覆盖 tag 解析、资产核对、gh 参数、授权闸、发布阻断项聚合与版本账本门禁（`pnpm exec vitest run config/scripts/release-win-workbench.test.mjs`）。出包脚本仍无单测 |
| 5 验收点 E2E | ◐ | R01–R06 已定义，入口（workflow 守卫 + 规范 + 模板）在仓；R01/R02/R03/R05 已对 v0.6.0 真实发布走通，R04 失败场景与 R06 报告未演练 / 未产出 |
| 6 用户旅程 E2E | ◐ | RJ01「出包→写版本描述→授权发布→读回→出验收报告归档」。v0.6.0 实走至读回（资产上传经套件外携）；验收报告段未执行 |

## 验收点与旅程矩阵

口径：● = 有真实运行证据；◐ = 入口已落地，没有这次运行的证据；○ = 未执行。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| R01 只出包得到三个产物 | ● | `build-win-workbench.mjs` | v0.6.0 本机出包三产物齐（2026-10-16，HEAD `ece1d7269`）；出包阶段未建标签 / Release |
| R02 未授权不发布 | ● | 技能授权闸 + 预演只读 | v0.6.0 出包后停在授权确认，远端无变化；获授权后才发布（2026-10-16） |
| R03 授权发布后读回同一 HEAD | ● | `gh release view` 读回（资产经套件外携上传） | tag `v0.6.0` → `ece1d7269`，三资产与这次出包一致（2026-10-16） |
| R04 失败时不覆盖 | ◐ | 脚本 blockers（缺资产 / 标签占用 / HEAD 不在远端 / 未登录 / 脏） | 未演练已存在标签、缺资产、未登录 |
| R05 版本描述合规范 | ● | [release-notes-spec.md](../../../.claude/skills/workbench-release/references/release-notes-spec.md) + 模板；workflow `notes` 输入（拒 `--generate-notes`） | v0.6.0 正文按单节规范发布并读回核验（2026-10-16） |
| R06 验收报告合规范 | ◐ | [acceptance-report-spec.md](../../../.claude/skills/workbench-release/references/acceptance-report-spec.md) + 模板；归档登记 `preparedArtifacts kind=showcase` | 规范与模板在仓；未产出一份真实版本收尾报告 |
| RJ01 出包→写版本描述→授权发布→读回→出验收报告 | ◐ | 同上 | v0.6.0 实走至读回（资产上传经套件外携）；验收报告段未走 |

**已知债**：
1. 安装包是否真能安装仍未验。v0.6.0 实跑后发现**版本账本缺口**（2026-10-21，#338 调查）：`latest.yml` 确指向本次 exe，但版本字段是 `-local` 构建号而非 tag 的 `0.6.0`（旧注入镜像了 bw-package 方案）——装它的用户自报 `1.4.197-local.*`，应用内更新链会永远判「已是最新」。已修：workflow 改注入发布版本号并在发布前校验清单账本，本地脚本同口径门禁（#398 已合入）；v0.6.0 已发包无法追溯修正，装过它的需手动装一次干净版本。
2. 退役 `version-report` 的 `report.py` ＝ 放弃确定性事实采集；验收报告事实改为人/模型依规范**具名引用**读回，靠来源脚注 + 诚实守卫（证据分层、Unknown 不是绿、缺值不填 0、人确认完成）补偿反编造。
3. 版本描述的分节骨架已经 v0.6.0 实跑打磨定稿（单节【这版有什么变化】，2026-10-16）；验收报告骨架仍未经一次真实收尾打磨。
4. `.bw/planning/v0.4/report.{json,html}` 为 version-report 历史归档，保留不改写。
