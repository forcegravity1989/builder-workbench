# 01 · 文档组织结构

- 状态：**现在作数**（2026-08-25）
- 位置：`principles/` 第一篇——本仓「知识与文档怎么分层」的正本
- 相关：[`../docs/doc-boundaries.md`](../docs/doc-boundaries.md)（给人看的 docs 三层细则）、[`../CONTEXT.md`](../CONTEXT.md)（词表）、[`../docs/README.md`](../docs/README.md)（全仓地图）

> **30 秒导读**：原则慢变；**特性级**变更走 `changes/` 制品链；**小 bug 直接修**，不开链。实践写笔记，产品设计另有正本。Markdown 是唯一真相；人闸 HTML/决策页只是投影。`principles/` 不是 `plan.md`。

## 1. 分层总览

```text
principles/          原则（慢变宪法）——本目录；第一篇就是本文
changes/             特性级变更制品链（大粒度）——intent → spec → plan → 状态；小 bug 不进这里
iterations/          实践笔记（当周读回）——PRACTICE-*.md
docs/                产品文档三层——指南 / 设计实况 / 欠账（细则见 doc-boundaries）
AGENTS.md            跨工具薄入口（命令、边界、验证、指针）
CLAUDE.md            Claude 薄层（导入 AGENTS + 特有约定；宜短）
CONTEXT.md           领域词表唯一正本
REVIEW.md            PR 人闸怎么审（可选，与变更链配套）
.teamai/             团队 harness 分发（skills / rules / hooks / MCP）——有则用之
decision-ui/ 等      人闸投影（只读渲染 changes/*；不当第二真相）
```

口诀：

**`principles/` 是原则，`changes/` 是这次变更，PRACTICE 是实践笔记；`docs/` 是产品怎么说清楚。**

## 2. 各层职责

| 层 | 回答什么 | 变多快 | 不写什么 |
|---|---|---|---|
| **principles/** | 我们永远怎么组织知识、信什么铁律（拍板才改） | 慢 | 单次需求、当周实验、某站施工日记 |
| **changes/\<id\>/** | **特性级**要什么、规格、实现计划、批过没 | 每个大特性/大改动一条 | 小 bug、文案错、一次性琐修；产品总设计、词表 |
| **iterations/PRACTICE-*** | 试了什么、读回如何、学到什么 | 当周连续 | 代替 intent/spec/plan 正文；第二份欠账总表 |
| **docs/guide** | 人怎么用 / 怎么讲（只写已实践） | 站验证后补 | 未上线功能、实现黑话堆砌 |
| **docs/\*-prototype/design** | 当前迭代设计实况（一篇正本） | 站走完改实况 | 单次 MR 的 intent；修订流水账当正文 |
| **docs/LEFTOVERS** | 还没干完的唯一清单 | 有欠账就改 | 叙事、设计论证 |
| **AGENTS / CLAUDE** | agent 每会话必读的地板 | 错两次写入；宜短 | 长政策（进 skills）、单次变更 |
| **.teamai/** | 可共享的 skills/hooks/规则如何同步到多工具 | 随团队政策 | 业务仓设计正本、changes 正文 |

## 3. 三者关系：principles · changes · PRACTICE

```text
principles/  ──约束──►  changes/<id>/intent.md | spec.md | plan.md
     ▲                         │
     │                         │ 做中踩坑、读回
     │                         ▼
     │                iterations/PRACTICE-*.md
     │                         │
     └── 若原则要改：先议 → 改 principles/；PRACTICE 只记「为何要改」──┘
```

- **principles → changes**：单向约束。写 intent 不得违背已作数的原则篇。  
- **changes → PRACTICE**：这条变更的过程与读回进实践笔记；笔记**不替代**给人闸批的制品。  
- **PRACTICE → principles / docs / LEFTOVERS**：发现原则该改 → 另开决定改 principles；站实况变了 → 验证后改设计正本；还没干 → 只进 `LEFTOVERS.md`。

### 名字消歧（必读）

| 写法 | 是什么 |
|---|---|
| **`principles/`** | 本目录：仓库级慢变原则 |
| **`changes/<id>/plan.md`** | 单次变更的**实现计划**（AI-Native SDLC 用语） |
| 仓根旧目录 **`plan/`** | 历史命名的现役产品规范集；**不是** `plan.md`。迁并进 `principles/` 另议 |

## 4. 变更制品链（changes/）

### 4.1 粒度（硬规矩）

`changes/` 只装**比较大的、特性级（或同级）变更**——需要人闸对齐意图、规格与实现计划的那一类。

| 走 `changes/` | 不走 `changes/`（直接修） |
|---|---|
| 新特性 / 大改行为或信息架构 | 小 bug、崩溃热修、明显笔误 |
| 跨多模块、要产品拍板范围 | 测试补洞、文案/注释、依赖小版本钉死 |
| 要写 intent→spec→plan 才能安全动 | 改完能用现有测试/门禁一眼验完 |

拿不准时：**偏大就开 change，偏小就直修**。直修仍走正常 PR/门禁；需要留痕可在 PRACTICE 或 commit 说明里一笔带过，**不要为修一个小 bug 建整套 intent/spec/plan**。

一条 `changes/<id>/` 可以对应多笔提交、多个 PR，只要仍是**同一个特性意图**；不要把「修一个按钮色」拆成独立 change。

### 4.2 目录最小集

一次特性级变更一个目录：

```text
changes/<change-id>/
  intent.md    # 要什么 / 为何 / 约束 / 开放问题
  spec.md      # 需求+设计；标出 flagged concerns
  plan.md      # 改哪些文件、顺序、风险、如何证明
  STATUS.md    # draft | accepted | building | in_review | shipped | rejected
```

人闸（产品/工程师/发布）批的是这些文件（或由其渲染的决策页），不是聊天记录。  
接受某一制品 = 允许进入下一阶段；git 历史即审计轨迹。

## 5. 源与投影

- **源（SSOT）**：Markdown（及仓内约定的结构化文本）。agent 读写、git diff、跨工具同步都以源为准。  
- **投影**：HTML / 应用内决策台——为人闸提供摘要、风险、证据、通过|驳回|加签。  
- **禁止**：把 HTML 当成 intent/spec/plan 的唯一正文，再维护一份 md「备份」。

## 6. 与现有文档边界的关系

[`docs/doc-boundaries.md`](../docs/doc-boundaries.md) 继续管 **docs/ 内部**写到哪：

1. 产品指南 `docs/guide/`  
2. 设计实况（当前为 `docs/v4-prototype/design.md`）  
3. 欠账 `docs/LEFTOVERS.md`  

本文管的是**整仓知识分层**（原则 / 变更 / 实践 / docs / agent 入口 / 分发）。  
docs 细则与本文冲突时：**docs 目录内的落盘仍听 doc-boundaries**；跨目录归属听本文。

## 7. 建议的读写顺序

| 角色/场景 | 先读 |
|---|---|
| 新会话 / 新成员 | README → 本文 → CONTEXT → AGENTS/CLAUDE → docs/README |
| 要开一个**特性** | 对齐 [03 产品主张](03-press-release-faq-flywheel.md) → 按 [02 逆向工作法](02-working-backwards.md) 开 `changes/<id>/intent.md` |
| 要改客群/飞轮/对外主张 | 先议 → 改 [03](03-press-release-faq-flywheel.md)；特性 intent 不得偷偷改写 |
| 小 bug / 琐修 | 直接改 + 验证 + PR；不开 `changes/` |
| 要改产品实况 | 站验证后改 design 正本；过程可记 PRACTICE |
| 要改原则本身 | 显式讨论 → 改本目录对应篇 → 必要时 ADR |

## 8. 暂不在本文强制的

- 立刻把整个 `plan/` 搬进 `principles/`（另开迁移决定）  
- 立刻建齐 `changes/`、`REVIEW.md`、decision-ui（按 MVP 逐步加）  
- Maintain 全自治闭环、harness continuous evals（门禁信息架构稳定后再上）

## 修订

| 日期 | 改什么 |
|---|---|
| 2026-08-25 | 首篇：定 `principles/` 与文档组织结构 |
| 2026-08-25 | `changes/` 定为特性级粒度；小 bug 直修不开链 |
| 2026-08-25 | 特性立项指向 [02 逆向工作法](02-working-backwards.md) |
