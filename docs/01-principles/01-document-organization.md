# 01 · 文档组织结构

- 状态：**现在作数**（2026-09-17）
- 位置：`docs/01-principles/` 第一篇——本仓「知识与文档怎么分层」的正本
- 相关：[`../README.md`](../README.md)（docs 地图）、[`../architecture.md`](../architecture.md)（设计正本）、[`../../CONTEXT.md`](../../CONTEXT.md)（词表）、[`../../AGENTS.md`](../../AGENTS.md)（开发规矩）、[`03-press-release-faq-flywheel.md`](03-press-release-faq-flywheel.md)（少 gate / 飞轮检验）、[`04-ai-native-docs.md`](04-ai-native-docs.md)（文档角色与 Agent 加载协议）

> **30 秒导读**：原则慢变；**特性级**变更走 `docs/05-features/` 制品链——**人 gate 是 intent + 带原型的 spec**；`plan.md` 默认不审，仅大风险升 gate；**小 bug 直接修**，不开链。Agent 按**文档角色**加载（愿景 / 契约 / 当前活跃特性 / 工程参考），路径映射在 `.bw/knowledge-map.toml`，协议见 [04](04-ai-native-docs.md)。读回进 `docs/05-features/` 或 commit，欠账进对应 feature 的开放问题或架构文档。Superpowers / grill-me 可当过程工具，产出必须落进 `docs/05-features/`。产品主张听 03。Markdown 是唯一真相；gate 决策页只是投影。

> **用词**：**gate** = 必须由人拍板才能往下走的关卡（见 03 / `CONTEXT.md`）。本文一律用 gate，不再写「人闸」。与工程侧**门禁**（提交前检查组）不是一回事。

## 1. 分层总览

```text
仓根（只留入口件 + 惯例置根件，见 §6.1）
├── README.md          产品介绍 + 快速开始（入口件）
├── AGENTS.md          开发规矩唯一正本（入口件）
├── CLAUDE.md          一行 @AGENTS.md 导入（入口件）
├── CONTEXT.md         领域词表唯一正本（入口件）
├── DESIGN.md          纯指路指针 → docs/architecture.md（惯例置根件）
└── CHANGELOG.md       版本变更流水（惯例置根件）

docs/（所有知识目录都在这，编号定序；architecture 不编号＝docs 内设计正本）
├── 01-principles/     原则（慢变宪法）——本目录；第一篇就是本文；04 是文档角色与 Agent 加载协议
├── architecture.md    设计正本（三 crate 架构 + 模块设计；docs 内不编号）
├── 02-adr/            架构决策（难回头一条一篇）
├── 03-guide/          产品指南（怎么用，给人看）
├── 04-design-system/  视觉正本：设计系统资产（样式表 + token + 规范；壳直接拼入）
├── 05-features/       特性级变更制品链；**当前活跃集**以该目录 README 为准（不是整棵树）
├── 06-module/         单个模块的实现心智模型——设计面对的主要矛盾 / 取舍;不纠结实现细节
├── 10-reference/      外部参考的提炼版
├── hifi/              八屏版式与旅程原型
├── metrics.md         指标口径
└── draft/             本地草稿/真实项目试用记录（不进仓）

.teamai/               团队 harness 分发（skills / rules / hooks / MCP）——有则用之
decision-ui/ 等       gate 投影（只读渲染 docs/05-features/*；不当第二真相）
```

口诀：

**愿景管方向，契约管结构，当前活跃特性管这一次；工程参考只查阅。** 人 gate 仍是 intent + 带原型的 spec。仓根只留入口件与惯例置根件。路径 → 角色见 `.bw/knowledge-map.toml`。

## 2. 各层职责

| 层 | 回答什么 | 变多快 | 不写什么 |
|---|---|---|---|
| **docs/01-principles/** | 我们永远怎么组织知识、信什么铁律（拍板才改）；04 管文档角色与 Agent 怎么加载 | 慢 | 单次需求、当周实验、某站施工日记 |
| **docs/05-features/\<id\>/** | **特性级**要什么、规格（含原型）；大风险才有必批 plan；读回可写在 STATUS / PRACTICE 段或 commit。**当前活跃集**只含 README 列出的目录 | 每个大特性/大改动一条 | 小 bug、文案错、一次性琐修；已交付特性的施工日记（约束吸收进 architecture / 06-module）；产品总设计、词表；第二份欠账总表 |
| **docs/06-module/** | 单个模块怎么实现的心智模型——设计面对的主要矛盾 / 取舍 | 模块新增或大改时补一篇 | 整体旅程与逻辑模块（在 architecture）；用户价值特性（在 05-features）；代码路径 / 数据字段 / 没建清单等实现细节 |
| **docs/03-guide** | 人怎么用 / 怎么讲（只写已实践） | 站验证后补 | 未上线功能、实现黑话堆砌 |
| **docs/\*-prototype/design** | 当前迭代设计实况（一篇正本） | 站走完改实况 | 单次 MR 的 intent；修订流水账当正文 |
| **AGENTS / CLAUDE** | agent 每会话必读的地板（AGENTS 是开发规矩正本） | 错两次写入 | 单次变更正本（进 docs/05-features/）；产品主张（进 docs/01-principles/03） |
| **.teamai/** | 可共享的 skills/hooks/规则如何同步到多工具 | 随团队政策 | 业务仓设计正本、docs/05-features 正文 |

## 3. 二者关系：01-principles · 05-features

```text
docs/01-principles/  ──约束──►  docs/05-features/<id>/intent.md | spec.md [| plan.md 仅大风险]
     ▲                         │
     │                         │ 做中踩坑、读回 → 写进该 change / commit
     │                         ▼
     │                   docs/architecture.md / guide（站实况）
     │                   docs/*-prototype/design（站实况）
     │                         │
     └── 若原则要改：先议 → 改 docs/01-principles/ ──────────────────────────┘
```

- **01-principles → 05-features**：单向约束。写 intent 不得违背已作数的原则篇（尤其 [03](03-press-release-faq-flywheel.md)）。  
- **05-features → docs**：站验证后改设计正本 / 指南；还没干 → 写进对应 feature 开放问题或 architecture 留白，不另开第二份总表。  
- **不再维护仓根 `iterations/`**：旧实践/交接史实随 V3 清理在 `v3` 分支；现役不设该层。

### 名字消歧（必读）

| 写法 | 是什么 |
|---|---|
| **`docs/01-principles/`** | 本目录：仓库级慢变原则 |
| **当前活跃特性** | `docs/05-features/README.md` 列出的目录；不是 `docs/05-features/` 整棵树。已交付的约束吸收进 `architecture.md` / `06-module/` |
| **`docs/05-features/<id>/plan.md`** | 单次变更的**实现计划**；**默认不进 gate**，仅命中大风险清单才升 gate |
| 已删的仓根 **`plan/`** | 旧产品规范集已随 lean 整改退场；工程设计听 `docs/architecture.md`，主张听 03 |
| **`docs/superpowers/specs/`** | Superpowers 流程可能写出的设计稿落点；**可作过程草稿**，特性 gate 正本仍是 `docs/05-features/<id>/` |
| **`v3` 分支** | 已删的 V3 代码与历史交接/实践档案；**不是**现役层 |

## 4. 变更制品链（docs/05-features/）

### 4.1 粒度（硬规矩）

`docs/05-features/` 只装**产生用户价值的新能力或新信息**——给客户一个以前没有的价值（新能力 / 新数据维度 / 能做成以前做不成的事）。

| 走 `docs/05-features/` | 不走（直接修 + 留痕） |
|---|---|
| 新能力：用户以前没有、现在能做新事 | 命名 / 统一口径（版本号归一、标签体系合并） |
| 新信息维度：用户能看见以前看不见的 | 基建接线（已有设计系统接上、样式正本归一） |
| 大改行为或信息架构**且**产生新价值 | 重构 / 重排不产生新价值（仅更顺 / 更好看） |
| 跨多模块、要产品拍板范围 | 小 bug、文案、测试补洞、依赖钉死 |

判定关键：**用户感知到新价值**，不是「工程更顺」。拿不准时问：发布当天客户看见什么新东西？答不出「新价值」→ 直修留痕（commit 说明 + 必要时改 `architecture.md` 实况段），不开 intent gate、不过五大拷问、不建 05-features 目录。

一条 `docs/05-features/<id>/` 可以对应多笔提交、多个 PR，只要仍是**同一个特性意图**；不要把「修一个按钮色」拆成独立 change。

### 4.2 目录与 gate（少而硬）

一次特性级变更一个目录：

```text
docs/05-features/<change-id>/
  intent.md    # 要什么 / 为何 / 约束 / 开放问题（意图 gate）
  spec.md      # 需求+设计；必须含可点原型的链接与操作逻辑（规格 gate；原型文件不进仓）
  plan.md      # 改哪些文件、顺序、风险、如何证明——默认自动跑用；仅大风险升 gate
  STATUS.md    # draft | accepted | building | in_review | shipped | rejected
```

**人 gate（必须过）：**

1. **意图 gate** —— 批 `intent.md`（做不做、是否落在周目标/03 飞轮里）。  
2. **规格 gate** —— 批 `spec.md`：**缺可点原型或操作逻辑 → 直接退回**，不许「先做着」。**非 UI 变更**（纯脚本/规范包）豁免「可点原型」：仍须有操作逻辑（脚本协议 / 输入输出契约 / 样例输出当原型替代），但不必是可点的界面原型。**原型文件不进仓**：`spec.md` 里写的是链接（artifact 或一条永不合入的分支），仓里不留 `prototype.html`——落点规矩见 [02 §3.2](02-working-backwards.md)。

**默认不进 gate：**

- **`plan.md`**：规格认过之后，实现计划默认由 agent 自拟并自动跑；工程师**不**默认必批。  
- **仅当命中大风险清单**（破坏性迁移、权限/密钥面扩大、对外契约变更、不可逆发布、跨边界数据流出等——清单正本听 03 内部 FAQ）时，`plan.md` / 技术方案才升 gate。

接受某一制品 = 允许进入下一阶段；**聊过 / 口头批准 ≠ 过 gate**；git 历史即审计轨迹。小修：**不开**本链。

### 4.3 与 Superpowers / grill-me 兼容

本仓**不排斥** Superpowers（含 brainstorming、writing-plans）与 grill-me：它们是**过程工具**（发散、质询、写计划草稿），可以继续用。

兼容规则只有三条：

1. **正本唯一**：特性级 gate 批的是 `docs/05-features/<id>/intent.md` 与带原型的 `spec.md`，不是 `docs/superpowers/specs/` 里另起一套。  
2. **产出要落仓**：brainstorming / grill-me 的结论必须写回（或迁入）对应 `docs/05-features/<id>/`；只留在聊天或 superpowers 草稿、正文不动 = 没过 gate。  
3. **plan 仍听少 gate**：writing-plans 产出可进 `plan.md`；默认不另开工程师必批 gate，除非命中大风险清单。

历史仍作数的 `docs/superpowers/specs/` 篇章（被 plan/13 等引用的）保持原状；**新特性不要默认只写到那里就开干**。

## 5. 源与投影

- **源（SSOT）**：Markdown（及仓内约定的结构化文本）。agent 读写、git diff、跨工具同步都以源为准。  
- **投影**：HTML / 应用内决策台——为 gate 提供摘要、风险、证据、通过|驳回|接着聊|开独立 worktree。  
- **禁止**：把 HTML 当成 intent/spec/plan 的唯一正文，再维护一份 md「备份」。

## 6. 与现有文档边界的关系

[`docs/README.md`](../README.md) 管 docs 树地图；设计正本是 [`docs/architecture.md`](../architecture.md)；产品指南在 [`docs/03-guide/`](../03-guide/)。  
本文管**整仓知识分层**（原则 / 变更 / docs / agent 入口）。与 docs 落盘细则冲突时：**docs 目录内听 docs/README + architecture**；跨目录归属听本文。

### 6.1 落点铁律：仓根只留「入口件」与「惯例置根件」，其余入 `docs/`

仓根只留两类：**入口件**（newcomer 起手读、建立初始心智的骨架）与**惯例置根件**（业界默认在仓根，挪走会破坏工具发现）。**所有知识目录（含原则、特性制品链）一律落 `docs/`、编号定序。**

**入口件**（建立初始心智）：

| 仓根留 | 是什么 | 为什么留仓根 |
|---|---|---|
| `README.md` | 产品介绍 + 快速开始 | 第一眼落地 |
| `AGENTS.md` | 开发规矩正本 | agent 每会话必读 |
| `CLAUDE.md` | 一行导入 AGENTS | 仓外 IDE 入口 |
| `CONTEXT.md` | 领域词表 | 跨工具一致用词 |

**惯例置根件**（业界惯例，非初始心智）：

| 仓根留 | 是什么 | 为什么留仓根 |
|---|---|---|
| `DESIGN.md` | 纯指路指针 → `docs/architecture.md` | 路标惯例；正文必须在 docs/ |
| `CHANGELOG.md` | 变更流水 | [Keep a Changelog](https://keepachangelog.com/) 等工具默认去仓根找 |

其余文档与知识目录——原则（`docs/01-principles`）、特性制品链（`docs/05-features`）、设计正本（`docs/architecture.md`，docs 内**不编号**、同根 `README`/`CHANGELOG` 之特殊地位）、架构决策（`docs/02-adr`）、指南（`docs/03-guide`）、设计系统（`docs/04-design-system`）、参考（`docs/10-reference`）、高保真（`docs/hifi`）、指标（`docs/metrics`）、本地草稿（`docs/draft`）——**一律落 `docs/`**。仓根不堆散件：临时报告、演示文稿、sdlc 产物等归 `docs/draft/`，不进仓根。

> `decision-ui/` 等 gate 投影是 HTML 渲染产物，不是 markdown 文档，不受本条约束；`REVIEW.md`（若建）属文档，按本条落 `docs/`。

## 7. 建议的读写顺序

| 角色/场景 | 先读 |
|---|---|
| 新会话 / 新成员 | README → 本文 → CONTEXT → AGENTS/CLAUDE → docs/README |
| **Agent 开设计或开发** | [04 文档角色](04-ai-native-docs.md) → 按分支加载愿景 / 契约 / 当前活跃特性 / 工程参考；对账只盯契约与活跃特性 |
| 要开一个**特性** | 对齐 [03](03-press-release-faq-flywheel.md) → 先看 [`docs/05-features/README.md`](../05-features/README.md) 是否已有条目 → 按 [02](02-working-backwards.md) 开或改 `docs/05-features/<id>/intent.md`；可用 Superpowers/grill-me 辅助，产出落回 `docs/05-features/` |
| 要改客群/飞轮/对外主张 | 先议 → 改 [03](03-press-release-faq-flywheel.md)；特性 intent 不得偷偷改写 |
| 小 bug / 琐修 | 直接改 + 验证 + PR；不开 `docs/05-features/` |
| 要改产品实况 | 站验证后改 `docs/architecture.md` / guide；读回写进对应 change / commit |
| 要改原则本身 | 显式讨论 → 改本目录对应篇 → 必要时 ADR |

## 8. 暂不在本文强制的

- 立刻建齐 `docs/05-features/`、`REVIEW.md`、decision-ui（按 MVP 逐步加）  
- Maintain 全自治闭环、harness continuous evals（门禁信息架构稳定后再上）  
- 改 vendor skill 正文（Superpowers / grill-me 等）——过程兼容由本文与 `AGENTS.md` 约定，skill 包本身先不动

## 修订

| 日期 | 改什么 |
|---|---|
| 2026-08-25 | 首篇：定 `01-principles/` 与文档组织结构 |
| 2026-08-25 | `05-features/` 定为特性级粒度；小 bug 直修不开链 |
| 2026-08-25 | 特性立项指向 [02 逆向工作法](02-working-backwards.md) |
| 2026-08-26 | 术语改 gate；制品链改为 intent+带原型 spec 为人 gate，plan 仅大风险；兼容 Superpowers/grill-me（过程工具，正本在 05-features/） |
| 2026-08-26 | 撤销仓根 `iterations/` 层；读回归 changes / guide / architecture；与 lean 仓（AGENTS 正本、无 plan/archive）对齐 |
| 2026-09-01 | 规格 gate 加「非 UI 变更豁免可点原型」：纯脚本/规范包仍须操作逻辑（协议/样例输出当原型），但不必可点界面 |
| 2026-09-01 | 加 6.1 落点铁律：仓根只留建立初始心智的入口件（README/AGENTS/CLAUDE/CONTEXT/01-principles/DESIGN 指针/CHANGELOG），其余文档一律落 `docs/`；散件归 `docs/draft/` |
| 2026-09-01 | docs/ 加数字前缀：architecture→01-architecture、adr→02-adr、guide→03-guide、design-system→04-design-system、reference→10-reference；6.1 拆「入口件 + 惯例置根件」两类例外，resolve 表内矛盾与 §1 REVIEW.md 归属 |
| 2026-09-01 | 根目录知识目录加编号：principles→01-principles、changes→05-features（特性级制品链）；§3 标题与关系线同步改 01-principles · 05-features |
| 2026-09-01 | principles 与 features 迁入 `docs/`：`docs/01-principles/`、`docs/05-features/`；`docs/01-architecture.md` 去编号为 `docs/architecture.md`（docs 内设计正本，同根 README/CHANGELOG 之不编号例外）；6.1 入口件不再含 principles（principles 转为 docs 内编号知识目录），§1/§2/§3/§7 路径同步；仓根只剩 README/AGENTS/CLAUDE/CONTEXT + DESIGN/CHANGELOG |
| 2026-09-11 | 原型文件不进仓：规格 gate 仍要可点原型，但 `spec.md` 只写链接（artifact 或独立分支），`docs/05-features/<id>/prototype.html` 不再是交付件 |
| 2026-09-08 | 加 `docs/06-module/` 层:单个模块实现的心智模型(主要矛盾/取舍);architecture.md 收为整体旅程+逻辑模块、不进模块实现细节;三层边界 architecture / 06-module / 05-features 写进 AGENTS「人怎么驾驭」可见物表与本文 §1/§2 |
| 2026-09-09 | §4.1 收紧口径:`docs/05-features/` 只装产生用户价值的新能力/新信息;命名收口/基建接线/重构重排不产生新价值的直修留痕(commit 说明 + 必要时改 architecture 实况段),不开 intent gate;02 §1 适用范围、§6 小特性豁免同步 |
| 2026-09-17 | 加文档角色视图：Agent 按愿景/契约/当前活跃特性/工程参考加载；协议在 [04](04-ai-native-docs.md)，路径映射在 `.bw/knowledge-map.toml`，活跃集在 `docs/05-features/README.md`；§1 口诀、§2、§7 同步 |
