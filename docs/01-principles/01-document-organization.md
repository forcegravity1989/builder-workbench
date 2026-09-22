# 01 · 文档组织结构

> **本篇维护约定**：给调整知识归属、文档边界的人与模型读取。只规定整仓分层、正本/投影关系、特性制品链及共用头部要素；不代写每篇的格式，不列开发命令或变更流水。结构按分层、职责、制品链、源与投影、落点与头部、读取路径组织；分层或共用规则经人确认变化时更新。日常维护操作见 [AGENTS](../../AGENTS.md)，各篇具体范围看其头部。

- 状态：**现在作数**
- 位置：`docs/01-principles/` 第一篇——本仓「知识与文档怎么分层」的正本
- 相关：[`../README.md`](../README.md)（docs 地图）、[`../architecture.md`](../architecture.md)（设计正本）、[`../../CONTEXT.md`](../../CONTEXT.md)（词表）、[`../../AGENTS.md`](../../AGENTS.md)（开发规矩）、[`03-press-release-faq-flywheel.md`](03-press-release-faq-flywheel.md)（少 gate / 飞轮检验）

> **30 秒导读**：原则慢变；**特性级**变更走 `docs/05-features/` 制品链——**人 gate 是 intent + 带原型的 spec**；`plan.md` 默认不审，仅大风险升 gate；**小 bug 直接修**，不开链。读回进 `docs/05-features/` 或 commit，欠账进对应 feature 的开放问题或架构文档；**不再设仓根 `iterations/` 层**。Superpowers / grill-me 可当过程工具，产出必须落进 `docs/05-features/`。产品主张听 03。Markdown 是唯一真相；gate 决策页只是投影。

> **用词**：**gate** = 必须由人拍板才能往下走的关卡（见 03 / `CONTEXT.md`）。本文一律用 gate，不再写「人闸」。与工程侧**门禁**（提交前检查组）不是一回事。

## 1. 分层总览

```text
仓根（四份入口文档，见 §6.1）
├── README.md          产品介绍 + 快速开始（入口件）
├── AGENTS.md          开发规矩唯一正本（入口件）
├── CLAUDE.md          一行 @AGENTS.md 导入（入口件）
└── CONTEXT.md         领域词表唯一正本（入口件）

docs/（所有知识目录都在这，编号定序；architecture 不编号＝docs 内设计正本）
├── 01-principles/     原则（慢变宪法）——本目录；第一篇就是本文
├── architecture.md    设计正本（Electron 叠层 + 模块设计；docs 内不编号）
├── 02-adr/            架构决策（难回头一条一篇）
├── 03-guide/          产品指南（怎么用，给人看）
├── 04-design-system/  视觉正本：设计系统资产（样式表 + token + 规范；壳直接拼入）
├── 05-features/       特性级变更制品链——intent + 带原型的 spec 为人 gate；plan 仅大风险；小修不进
├── 06-module/         单个模块的实现心智模型——设计面对的主要矛盾 / 取舍;不纠结实现细节
├── 10-reference/      外部参考的提炼版
├── hifi/              八屏版式与旅程原型
├── metrics.md         指标口径
└── draft/             本地草稿/真实项目试用记录（不进仓）

.teamai/               团队 harness 分发（skills / rules / hooks / MCP）——有则用之
decision-ui/ 等       gate 投影（只读渲染 docs/05-features/*；不当第二真相）
```

口诀：

**`docs/01-principles/` 是原则，`docs/05-features/` 是这次变更，`docs/` 其余是产品怎么说清楚（设计 / 指南 / 欠账）。仓根只留约定的入口文档。**

## 2. 各层职责

| 层 | 回答什么 | 变多快 | 不写什么 |
|---|---|---|---|
| **docs/01-principles/** | 我们永远怎么组织知识、信什么铁律（拍板才改） | 慢 | 单次需求、当周实验、某站施工日记 |
| **docs/05-features/\<id\>/** | **特性级**要什么、规格（含原型）；大风险才有必批 plan；读回可写在 STATUS / PRACTICE 段或 commit | 每个大特性/大改动一条 | 小 bug、文案错、一次性琐修；产品总设计、词表；第二份欠账总表 |
| **docs/06-module/** | 单个模块怎么实现的心智模型——设计面对的主要矛盾 / 取舍 | 模块新增或大改时补一篇 | 整体旅程与逻辑模块（在 architecture）；用户价值特性（在 05-features）；代码路径 / 数据字段 / 没建清单等实现细节 |
| **docs/03-guide** | 人怎么用 / 怎么讲（只写已实践） | 站验证后补 | 未上线功能、实现黑话堆砌 |
| **docs/\*-prototype/design** | 当前迭代设计实况（一篇正本） | 站走完改实况 | 单次 MR 的 intent；修订流水账当正文 |
| **AGENTS / CLAUDE** | agent 每会话必读的地板（AGENTS 是开发规矩正本） | 开发规矩或入口变化时，先修已有规则与引用 | 单次变更正本（进 docs/05-features/）；产品主张（进 docs/01-principles/03） |
| **.teamai/** | 可共享的 skills/hooks/规则如何同步到多工具 | 随团队政策 | 业务仓设计正本、docs/05-features 正文 |

### 文档变更时同步什么

改知识文档、提示词或技能时，先确认读者、适用任务与正本位置。规则写清约束和原因；保留产品硬约束，不因换模型或追求简短而删除。重复出现的问题先查已有规则、上下文和实现，不直接向入口叠加禁令。

移动文档、调整职责或改变契约时，同步检查入口索引、链接和章节引用、相关示例，以及实际读取这些内容的代码与调用方。引用的路径和示例应能核查；存在文件、分发文件、给模型指针与实际读取正文分别说明。读取方尚未支持的部分如实记录，不能靠改文档宣称实现已跟上。

日常新增与小修只检查本次改动及必要引用，不默认全仓审计或重复模型评测。改变执行行为时按受影响路径验证；没有验证的数据不写成收益。变更原因、验证证据和未完成项留在对应 commit/PR 或已有特性记录；当前知识同步到正本，不另建提交流水或平行规范。

Workbench 研发知识库的目录约定适用于本仓。`standard/` 给被管项目提供执行规范；项目文档归属与落点遵循该项目自己的 `AGENTS.md` 及引用，不照搬 BW 的目录树。术语边界见 [`CONTEXT.md`](../../CONTEXT.md)「知识与规范资产」。

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

### 6.1 仓根只留四份入口文档

| 仓根文档 | 职责 | 谁先读 |
|---|---|---|
| `README.md` | 产品介绍、当前能力边界、快速开始、继续阅读入口 | 浏览仓库的人 |
| `AGENTS.md` | 任务读取路径、开发硬约束、文档维护与交付规则 | 在本仓工作的模型与开发者 |
| `CLAUDE.md` | 只含一行 `@AGENTS.md`，不另立规则 | 对应工具通过它导入开发约定 |
| `CONTEXT.md` | 领域术语、歧义边界与相关正本 | 需要理解或维护领域用词的人与模型 |

整体设计直接指向 `docs/architecture.md`，不再维护仓根设计指针。变更原因与验证证据进 commit/PR，当前知识各归正本，历史用 Git 查询，不另维护仓根变更流水，也不复制为新归档。

其余知识文档进入 `docs/` 的已有职责层，目录编号定序，`architecture.md` 是不编号的整体设计正本。临时报告与原型作为仓外 artifact 或按既有约定留链接，不为了报告新建常驻知识层。工具配置、源码及结构化项目资产不属于本条的 Markdown 入口清单。

### 6.2 共用原则与每篇头部各管什么

- **本文**规定分层、共用要素与例外；**AGENTS**规定模型如何读、维护、验证以及何时征得人确认；**每篇头部**是该篇职责与格式的正本。索引只导航，不复制全套规范。
- 头部应让模型知道：**读者与读取时机、可以写什么/不写什么、正文结构、何时更新，以及依赖的正本**。用简短导读或维护块表达，不要求每篇套同样的章节数量。
- 头部放在标题附近、正文之前。`README.md` 可用顶部 HTML 注释兼顾仓库门面，模型必须读取 Markdown 原文；`CLAUDE.md` 只作导入，不加头部。
- Skill 保持 YAML frontmatter 和自身结构；上游镜像、生成文件遵循来源格式，由其入口说明维护方式，不给每个镜像文件强加头部。既有文档按实际改动补齐，不启动无差别全库格式改造。
- 新增或恢复内容必须先检查目标范围；范围外优先找正确正本，确需扩责须**先提出头部边界变更并经人确认，再改头部与正文**。具体维护顺序只在 [AGENTS](../../AGENTS.md) 维护，头部不得覆盖上层原则。

## 7. 建议的读写顺序

| 角色/场景 | 先读 |
|---|---|
| 浏览仓库的人 | README → 按问题读指南、主张或 docs/README；参与开发再读 AGENTS |
| 工作模型 / 开发者 | AGENTS（CLAUDE 仅导入）→ 按任务路由读原则、目标文档原文头部与相关正本 |
| 要开一个**特性** | 对齐 [03](03-press-release-faq-flywheel.md) → 按 [02](02-working-backwards.md) 开 `docs/05-features/<id>/intent.md`；可用 Superpowers/grill-me 辅助，产出落回 `docs/05-features/` |
| 要改客群/飞轮/对外主张 | 先议 → 改 [03](03-press-release-faq-flywheel.md)；特性 intent 不得偷偷改写 |
| 小 bug / 琐修 | 直接改 + 验证 + PR；不开 `docs/05-features/` |
| 要改产品实况 | 站验证后改 `docs/architecture.md` / guide；读回写进对应 change / commit |
| 要改原则本身 | 显式讨论 → 改本目录对应篇 → 必要时 ADR |

## 8. 暂不在本文强制的

- 立刻建齐 `docs/05-features/`、`REVIEW.md`、decision-ui（按 MVP 逐步加）  
- Maintain 全自治闭环、harness continuous evals（门禁信息架构稳定后再上）  
- 改 vendor skill 正文（Superpowers / grill-me 等）——过程兼容由本文与 `AGENTS.md` 约定，skill 包本身先不动
