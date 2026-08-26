# 01 · 文档组织结构

- 状态：**现在作数**（2026-08-26）
- 位置：`principles/` 第一篇——本仓「知识与文档怎么分层」的正本
- 相关：[`../docs/README.md`](../docs/README.md)（docs 地图）、[`../docs/architecture.md`](../docs/architecture.md)（设计正本）、[`../CONTEXT.md`](../CONTEXT.md)（词表）、[`../AGENTS.md`](../AGENTS.md)（开发规矩）、[`03-press-release-faq-flywheel.md`](03-press-release-faq-flywheel.md)（少 gate / 飞轮检验）、[`04-ai-native-sdlc.md`](04-ai-native-sdlc.md)（产物链的方法来源）

> **30 秒导读**：原则慢变；**特性级**变更走 `changes/` 制品链——**人 gate 是 intent + 带原型的 spec**；`plan.md` 默认不审，仅大风险升 gate；**小 bug 直接修**，不开链。读回进 `changes/` 或 commit，欠账进 `changes` 开放问题或架构文档；**不再设仓根 `iterations/` 层**。Superpowers / grill-me 可当过程工具，产出必须落进 `changes/`。产品主张听 03。Markdown 是唯一真相；gate 决策页只是投影。

> **用词**：**gate** = 必须由人拍板才能往下走的关卡（见 03 / `CONTEXT.md`）。本文一律用 gate，不再写「人闸」。与工程侧**门禁**（提交前检查组）不是一回事。

## 1. 分层总览

```text
principles/          原则（慢变宪法）——本目录；01 分层 · 02 逆向工作法 · 03 主张/飞轮 · 04 AI-Native SDLC
changes/             特性级变更制品链——intent + 带原型的 spec 为人 gate；plan 仅大风险；小修不进
docs/                产品文档——设计正本 architecture.md · 指南 guide/ · adr/ · 高保真 hifi/（地图见 docs/README）
AGENTS.md            跨工具薄入口（原则指针、特性起手路径、命令/验证指针）
CLAUDE.md            一行导入 AGENTS（开发规矩唯一正本）
CONTEXT.md           领域词表唯一正本
REVIEW.md            PR / gate 怎么审（未建；与变更链配套时再立）
.teamai/             团队 harness（驱动 agent 的工具链配置）分发（skills / rules / hooks / MCP）——未建，有则用之
decision-ui/ 等      gate 投影（只读渲染 changes/*；不当第二真相）——未建
```

口诀：

**`principles/` 是原则，`changes/` 是这次变更；`docs/` 是产品怎么说清楚（含欠账与指南）。**

## 2. 各层职责

| 层 | 回答什么 | 变多快 | 不写什么 |
|---|---|---|---|
| **principles/** | 我们永远怎么组织知识、信什么铁律（拍板才改） | 慢 | 单次需求、当周实验、某站施工日记 |
| **changes/\<id\>/** | **特性级**要什么、规格（含原型）；大风险才有必批 plan；读回可写在 STATUS / PRACTICE 段或 commit | 每个大特性/大改动一条 | 小 bug、文案错、一次性琐修；产品总设计、词表；第二份欠账总表 |
| **docs/guide** | 人怎么用 / 怎么讲（只写已实践） | 站验证后补 | 未上线功能、实现黑话堆砌 |
| **docs/architecture.md** | 当前设计实况（一篇正本，16 模块 + 各自「没建什么」） | 站走完改实况 | 单次 MR 的 intent；修订流水账当正文 |
| **AGENTS / CLAUDE** | agent 每会话必读的地板（AGENTS 是开发规矩正本） | 错两次写入 | 单次变更正本（进 changes/）；产品主张（进 principles/03） |
| **.teamai/** | 可共享的 skills/hooks/规则如何同步到多工具 | 随团队政策 | 业务仓设计正本、changes 正文 |

## 3. 二者关系：principles · changes

```text
principles/  ──约束──►  changes/<id>/intent.md | spec.md [| plan.md 仅大风险]
     ▲                         │
     │                         │ 做中踩坑、读回 → 写进该 change / commit
     │                         ▼
     │                   docs/architecture.md / guide（站实况）
     │                         │
     └── 若原则要改：先议 → 改 principles/ ──────────────────────────┘
```

- **principles → changes**：单向约束。写 intent 不得违背已作数的原则篇（尤其 [03](03-press-release-faq-flywheel.md)）。  
- **changes → docs**：站验证后改设计正本 / 指南；还没干 → 写进对应 change 开放问题或 architecture 留白，不另开第二份总表。  
- **不再维护仓根 `iterations/`**：旧实践/交接史实随 V3 清理在 `v3` 分支；现役不设该层。

### 名字消歧（必读）

| 写法 | 是什么 |
|---|---|
| **`principles/`** | 本目录：仓库级慢变原则 |
| **`changes/<id>/plan.md`** | 单次变更的**实现计划**；**默认不进 gate**，仅命中大风险清单才升 gate |
| 已删的仓根 **`plan/`** | 旧产品规范集已随 lean 整改退场；工程设计听 `docs/architecture.md`，主张听 03 |
| Superpowers 等过程工具的草稿 | 本仓**没有** `docs/superpowers/specs/` 这类落点目录；若过程工具产出草稿，只作过程件，特性 gate 正本仍是 `changes/<id>/` |
| **`v3` 分支** | 已删的 V3 代码与历史交接/实践档案；**不是**现役层 |

## 4. 变更制品链（changes/）

### 4.1 粒度（硬规矩）

`changes/` 只装**比较大的、特性级（或同级）变更**——需要对齐意图与规格的那一类。

| 走 `changes/` | 不走 `changes/`（直接修） |
|---|---|
| 新特性 / 大改行为或信息架构 | 小 bug、崩溃热修、明显笔误 |
| 跨多模块、要产品拍板范围 | 测试补洞、文案/注释、依赖小版本钉死 |
| 要对齐 03 飞轮、写 intent + 带原型的 spec | 改完能用现有测试/门禁一眼验完 |

拿不准时：**偏大就开 change，偏小就直修**。直修仍走正常 PR/门禁；需要留痕可在对应 `changes/<id>/` 的 STATUS、或 commit 说明里一笔带过，**不要为修一个小 bug 建整套 intent/spec/plan**。

一条 `changes/<id>/` 可以对应多笔提交、多个 PR，只要仍是**同一个特性意图**；不要把「修一个按钮色」拆成独立 change。

### 4.2 目录与 gate（少而硬）

一次特性级变更一个目录：

```text
changes/<change-id>/
  intent.md    # 要什么 / 为何 / 约束 / 开放问题（意图 gate）
  spec.md      # 需求+设计；必须含可点原型与操作逻辑（规格 gate）
  plan.md      # 改哪些文件、顺序、风险、如何证明——默认自动跑用；仅大风险升 gate
  STATUS.md    # draft | accepted | building | in_review | shipped | rejected
```

**人 gate（必须过）：**

1. **意图 gate** —— 批 `intent.md`（做不做、是否落在周目标/03 飞轮里）。  
2. **规格 gate** —— 批 `spec.md`：**缺可点原型或操作逻辑 → 直接退回**，不许「先做着」。

**默认不进 gate：**

- **`plan.md`**：规格认过之后，实现计划默认由 agent 自拟并自动跑；工程师**不**默认必批。  
- **仅当命中大风险清单**（破坏性迁移、权限/密钥面扩大、对外契约变更、不可逆发布、跨边界数据流出等——清单正本听 03 内部 FAQ）时，`plan.md` / 技术方案才升 gate。

接受某一制品 = 允许进入下一阶段；**聊过 / 口头批准 ≠ 过 gate**；git 历史即审计轨迹。小修：**不开**本链。

### 4.3 与 Superpowers / grill-me 兼容

本仓**不排斥** Superpowers（含 brainstorming、writing-plans）与 grill-me：它们是**过程工具**（发散、质询、写计划草稿），可以继续用。

兼容规则只有三条：

1. **正本唯一**：特性级 gate 批的是 `changes/<id>/intent.md` 与带原型的 `spec.md`，不是 `docs/superpowers/specs/` 里另起一套。  
2. **产出要落仓**：brainstorming / grill-me 的结论必须写回（或迁入）对应 `changes/<id>/`；只留在聊天或 superpowers 草稿、正文不动 = 没过 gate。  
3. **plan 仍听少 gate**：writing-plans 产出可进 `plan.md`；默认不另开工程师必批 gate，除非命中大风险清单。

## 5. 源与投影

- **源（SSOT）**：Markdown（及仓内约定的结构化文本）。agent 读写、git diff、跨工具同步都以源为准。  
- **投影**：HTML / 应用内决策台——为 gate 提供摘要、风险、证据、通过|驳回|接着聊|开独立 worktree。  
- **禁止**：把 HTML 当成 intent/spec/plan 的唯一正文，再维护一份 md「备份」。

## 6. 与现有文档边界的关系

[`docs/README.md`](../docs/README.md) 管 docs 树地图；设计正本是 [`docs/architecture.md`](../docs/architecture.md)；产品指南在 [`docs/guide/`](../docs/guide/)。  
本文管**整仓知识分层**（原则 / 变更 / docs / agent 入口）。与 docs 落盘细则冲突时：**docs 目录内听 docs/README + architecture**；跨目录归属听本文。

## 7. 建议的读写顺序

| 角色/场景 | 先读 |
|---|---|
| 新会话 / 新成员 | README → 本文 → CONTEXT → AGENTS/CLAUDE → docs/README |
| 要开一个**特性** | 对齐 [03](03-press-release-faq-flywheel.md) → 按 [02](02-working-backwards.md) 开 `changes/<id>/intent.md`；可用 Superpowers/grill-me 辅助，产出落回 `changes/` |
| 要改客群/飞轮/对外主张 | 先议 → 改 [03](03-press-release-faq-flywheel.md)；特性 intent 不得偷偷改写 |
| 小 bug / 琐修 | 直接改 + 验证 + PR；不开 `changes/` |
| 要改产品实况 | 站验证后改 `docs/architecture.md` / guide；读回写进对应 change / commit |
| 要改原则本身 | 显式讨论 → 改本目录对应篇 → 必要时 ADR |

## 8. 暂不在本文强制的

- 立刻建齐 `REVIEW.md`、`.teamai/`、decision-ui（三者今天都未建，按 MVP 逐步加）  
- Maintain 全自治闭环、对 agent 工具链的持续评测（harness continuous evals）——门禁信息架构稳定后再上  
- 改 vendor skill 正文（Superpowers / grill-me 等）——过程兼容由本文与 `AGENTS.md` 约定，skill 包本身先不动

## 修订

| 日期 | 改什么 |
|---|---|
| 2026-08-25 | 首篇：定 `principles/` 与文档组织结构 |
| 2026-08-25 | `changes/` 定为特性级粒度；小 bug 直修不开链 |
| 2026-08-25 | 特性立项指向 [02 逆向工作法](02-working-backwards.md) |
| 2026-08-26 | 术语改 gate；制品链改为 intent+带原型 spec 为人 gate，plan 仅大风险；兼容 Superpowers/grill-me（过程工具，正本在 changes/） |
| 2026-08-26 | 撤销仓根 `iterations/` 层；读回归 changes / guide / architecture；与 lean 仓（AGENTS 正本、无 plan/archive）对齐 |
| 2026-08-26 | 引用对齐本仓真实地形：设计实况指 `docs/architecture.md`（不再写 `doc-boundaries` / `*-prototype/design`）；未建层（REVIEW / .teamai / decision-ui）如实标注；删 `docs/superpowers/specs/`、`plan/` 迁并等失实条目；分层图补 04 |
