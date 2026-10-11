# loop/ — 把 workbench-start 升级为可自转交付 loop 的调研素材与方法

> **30 秒导读**：本目录是**阶段 0 调研产物**——把"如何把一个人驱动的开发入口升级为能自转的交付 loop"这件事讲清楚，供 BW 侧专家 agent 落地时读。**它不是 BW 的设计，也没有做任何落地。**
> **读者**：BW 侧负责落地的人与专家 agent。
> **来源与自包含**：`workflow-audit/` 是一套外部审计框架的**原文**；`fixer-record.md` 是一个外部 harness 项目的**诚实记录**。**读者无需访问任何外部仓库、无需联网**——本目录自带全部判据与实例。

---

## 1. 目录结构

```text
.claude/skills/workbench-start/references/loop/
├── README.md            ← 本文件：结构、各份是什么、怎么读
├── workflow-audit/      ← 【判据层】审计框架原文（逐字搬运）
│   ├── SKILL.md            审计的用途、执行流程(9步)、GAP 报告形态、纪律表
│   ├── framework.md        思想 home：六要素/四大器/builder/双指标/反哺/审计补遗/双北极星
│   └── spec-distill.md     规范蒸馏：agent-md / skill-md / superpowers / maas
├── fixer-record.md      ← 【实例层】一个真实 loop 的诚实记录
├── loop-method.md       ← 【方法层】通用套路：入口→loop 的六个转型动作 + 底座谱系
└── bw-loop-report.md    ← 【应用层】拷问 BW 的 GAP 报告 + 分阶段落地方案(plan)
```

## 2. 各份是什么、何时读

| 文件 | 是什么 | 什么时候读 |
|------|--------|-----------|
| [`workflow-audit/`](workflow-audit/SKILL.md) | **判据原文**：一套"审计/优化 workflow/loop 项目"的框架（六要素/四大器/builder/双指标/反哺 + 规范蒸馏） | 需要判"某个 loop 到位没到位、缺什么"时，读它当尺子 |
| [`fixer-record.md`](fixer-record.md) | **实例记录**：一个已跑通 `issue→MR` 闭环的外部 harness 长什么样——组件、取舍、状态机、卡口、验证模型、记忆报告、patrol、改进器、维护规范，**含它自审的缺口** | 想知道"一个真的自转 loop 具体由什么部件拼成"时读 |
| [`loop-method.md`](loop-method.md) | **通用套路**：把"人读入口"变"自转 loop"要做哪几件事（六个转型动作）+ 骨架有哪几种形态（底座谱系） | 要动手改造入口前读；判据不在此，它只给指针 |
| [`bw-loop-report.md`](bw-loop-report.md) | **应用**：用上述判据拷问现 `workbench-start` 的 GAP + P0–P3 分阶段 plan | 落地前读它定范围与节奏 |

## 3. 怎么读（建议顺序）

1. 想快速理解"loop 是什么、BW 差在哪" → 先读 `bw-loop-report.md` §1/§3（结论与 GAP）。
2. 要动手 → 读 `loop-method.md`（转型动作 + 底座谱系）+ `fixer-record.md`（现成部件长啥样）。
3. 要当尺子审某处 → 用 `workflow-audit/` 原文。

> **单一权威源**：判据以 `workflow-audit/` 原文为准；实例以 `fixer-record.md` 为准；`loop-method.md` 只补判据没有的通用套路，`bw-loop-report.md` 只做 BW 的应用——**不复述彼此**，避免双源漂移。

## 4. 原文中的外部代号（速查）

`workflow-audit/` 是**逐字原文**（不改写），文中会出现其来源项目的代号，只看 BW 的读者按此对照，不必访问外部仓：

- `fixer` —— 一个已跑通 `issue→MR` 闭环的外部 harness 项目；说明见 [`fixer-record.md`](fixer-record.md)。
- `loop-buddy` —— 原文提到的另一个原型/项目名，仅作判据来源标注；**本目录不复述其内容**，读到当作"某来源"即可。

## 5. 边界

- 本目录 = **阶段 0（调研 + 素材 + 方法）**，**不构成任何能力已交付**。
- BW 的**落地**（改 `SKILL.md`/新增 agents/脚本、接 patrol 等）由落地任务另行按 BW 正本产出，**不回填本目录**。
- 未经授权，本目录内容未推送远端；`workbench-start/SKILL.md` 尚未引用本目录（入链属落地任务）。
