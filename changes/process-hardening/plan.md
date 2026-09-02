# Plan · 过程纪律门禁化（批次、落点、验收）

> **30 秒导读**：这是什么——本次变更的**实施计划件**：改哪些文件、什么顺序、什么风险、什么数证明做完。给谁看——过完意图/规格 gate 后实施的会话，与审 PR 的人核 diff 对不对得上计划。现在作数吗——**未动工**（随 intent 待 gate；下表状态列施工时如实更新）。上游：`intent.md` → `spec.md` → 本篇。

## 改哪些文件

```
scripts/guard-bw-write-authority.sh  已完工并入（见「已在仓里的那一条」）
scripts/guard-doc-links.sh        新增（A1）
scripts/guard-doc-budgets.sh      新增（A2）
scripts/doc-budgets.txt           新增（A2 预算清单，初值见 spec）
scripts/guard-selftest.sh         新增（A3，分母自动跟随 guard-*.sh）
scripts/guard-frozen-docs.sh      新增（B2）
scripts/frozen-docs.txt           新增（B2 冻结清单，首批盘入历史横幅件）
AGENTS.md                         门禁段 +4 行命令；commit 约定 +「放弃方案:」一条（B1）
.github/workflows/ci.yml          挂 4 个新 guard
CHANGELOG.md                      各批合入时各记一行
changes/process-hardening/        本产物链四件（已就位）
changes/<standard-对标-id>/       C1 立项时新开（仅 intent 草稿）
```

## 顺序与进度

| # | 步 | gate 档位 | 状态 |
|---|---|---|---|
| 0 | 意图 gate：人批 intent（含未决四问）+ 规格 gate 认可「判定样例代替原型」 | 人 | 未过 |
| 0.5 | **已完工并入**：`guard-bw-write-authority.sh` 从 #134 提取，接进门禁与 CI | 评审合入 | **已完成** |
| 1 | 按标准建活：本批 1 张 + C1 立项 1 张（codehub issue，标题即幂等键） | 窗口 AI | 未动工 |
| 2 | 批次 A：写 A1/A2 两 guard + 首跑修存量死链（修复数如实记 CHANGELOG） | 评审合入 | 未动工 |
| 3 | 批次 A：A3 guard-selftest，给全部 guard（含存量 6 个）配坏例断言到 100% | 评审合入 | 未动工 |
| 4 | 批次 B：AGENTS.md 两条规矩（B1 文案 + B2 纪律）+ B2 guard + 首批冻结清单 | 评审合入（改规矩） | 未动工 |
| 5 | 挂 CI：ci.yml 加 4 个 guard；门禁段与 CI 保持一致 | 评审合入 | 未动工 |
| 6 | C1：建活 + 开 intent 草稿（不实施） | 特性 gate 另走 | 未动工 |
| 7 | 30 天盘点：B1 覆盖率抽查出数，对 80% 目标记账 | 周盘点 | 未动工 |

批次 A 与 B 可各自独立成 PR；步 2–5 顺序内 commit 独立、不 push（用户要 push 另开 bundle）。

## 风险

1. **预算初值卡住正常写作**——缓解：15% 余量 + 提额通道（改清单 + commit 论证）；预算是护栏不是减肥目标（取自 dsh 的教训原话）。
2. **首跑死链可能揪出一批存量坏链**——修复算本批工作量，逐条修不豁免；若量大（>30 条）在 PR 里报数请示是否分批。
3. **B2「触及即红」误伤正当维护**——人工通道（临时移出清单 + 论证）兜底；若三个月内通道使用 > 冻结件数，说明清单盘得太宽，回头缩。
4. **B1 无法全自动**——已如实标注为半自动项，靠周盘点；若 30 天覆盖率 < 50%，升级讨论是否收窄「非琐碎」口径为可机判白名单，而不是硬上假门禁。
5. **shell guard 在 CI（ubuntu）与本机（darwin）行为差异**——脚本只用 POSIX 工具 + git，照存量 guard-* 的写法；A3 自测在两端各跑一遍即是回归。

## 验收总表（做完的定义）

| 数 | 目标 |
|---|---|
| guard 脚本数 | 6 →（+1 已并入）7 → 11，全部挂 CI |
| guard 自测覆盖率 | 11/11（`guard-bw-write-authority` 已自带，是现成范式）|
| 全仓 md 死链 | 0 |
| 预算清单 8 份文档 | 全部 ≤ 上限 |
| 冻结清单 | ≥ 1 件盘入，guard 生效 |
| 「放弃方案:」覆盖率 | 30 天抽查 ≥ 80%（基线 0） |
| C1 | 活 + intent 草稿各 1 |
