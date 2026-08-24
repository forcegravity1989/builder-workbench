# docs/ — 全仓文档地图

> **30 秒导读**:这一页告诉你仓库里每一堆文档是干什么的、现在作不作数。给新接手的人和 AI 会话看。仓库根 [`README.md`](../README.md) 是总入口;开发规矩唯一正本 [`AGENTS.md`](../AGENTS.md);`CLAUDE.md` 只是一行导入它。本页随目录变动维护。

## 一张图

```
仓库根
├── README.md          总入口:是什么 · 怎么跑
├── AGENTS.md          唯一开发规矩正本(建/跑/测+门禁+目录+铁律)
├── CLAUDE.md          一行 @AGENTS.md 导入
├── CONTEXT.md         领域语言词表(交棒/读数/蒸馏……唯一规范用词来源)
├── CHANGELOG.md       版本变更记录(本次合入了什么)
├── DESIGN.md          设计指向(各模块设计 + workflow 文档指过去)
├── DEVELOPMENT.md     开发指南(工作区布局 · 常用命令 · headless 例子)
├── plan/              设计事实源与规则 7 篇(06 缺口台账 · 07 命题 · 08 MVP 定义 · 13/15/16/20)
├── docs/              ← 你在这
├── standard/          buddy 推给被管项目的规范正本(模板 + 10 份自带 skill)
├── e2e/ examples/     验收流考卷 · 样板间库与 vendor 技能库
└── scripts/           门禁脚本 · 验收流工具链 · 联调脚本
```

## docs/ 里的四类东西

### 1. 现役文档(改东西前读)

| 路径 | 是什么 |
|---|---|
| [`modules/`](modules/) | **特性模块自足设计**(16 份 + README 索引):每份说清是什么 / 代码在哪几层 / 数据落哪 / 依赖 / 产出与验证 / 没建什么。不同人凭一份接手该模块。`DESIGN.md` 指向这里 |
| [`convention.md`](convention.md) | **规范与赋能模型**:buddy 给被管项目的三来源两路径 + 顶层文档集 + 边界 + buddy 自身符合度(dogfood) |
| [`hifi/`](v4-prototype/hifi/) | 视觉正本(`index.html` 单文件高保真 + 逐屏简报),桌面壳样式表从它搬过去 |
| [`LEFTOVERS.md`](LEFTOVERS.md) | 离「buddy MVP 做完了」还差什么的唯一清单,按验收八条分组 |
| [`doc-boundaries.md`](doc-boundaries.md) | 文档边界:什么写到哪、不写到哪 |
| [`releases.md`](releases.md) | 版本登记:出包与运作 |
| [`code-schemes.md`](code-schemes.md) | 代号索引,新开代号先登记 |
| [`adr/`](adr/) | 架构决策(难回头一条一篇) |
| [`guide/`](guide/) | 给同事用的产品指南 HTML(只写已实践)+ 填写规范 |
| [`metrics/workflowhub/`](metrics/workflowhub/) | WorkflowHub 项目的指标正本(不是本仓的) |

### 2. 运行时资产(被 `include_str!` 编进二进制——**改它就是改产品行为**)

| 路径 | 编进哪 | 备注 |
|---|---|---|
| [`buddy/system-prompt.md`](buddy/system-prompt.md)、[`buddy/standards/metrics.md`](buddy/standards/metrics.md)、[`buddy/standards/connectors.md`](buddy/standards/connectors.md) | `crates/bw-core` | **V3 编译资产**。buddy MVP 的系统提示词由 `crates/bw-v4/src/app/bootstrap.rs` 动态拼装(参考这套规矩) |
| [`skills/*/SKILL.md`](skills/) | `crates/bw-core` | **V3 自带的 9 个基础技能包正本**。buddy MVP 自带技能在仓根 `standard/skills/`(`bw-v4` 编进) |

**不要搬这两个目录**——路径是编译期硬绑定。它们是 V3 的编译资产,随 V3 一起冻结、一起删(`AGENTS.md` 的 V3 备注说明)。

### 3. 历史档案([`archive/`](archive/),只加不改)

早期路线选型、做完即历史的执行批次、交接记录、Rust 重写前的 HTML 原型、演示报告、V1/V2/V3 迭代线已落地的设计事实源、buddy MVP 设计正本归档快照([`archive/v4-prototype/design.md`](archive/v4-prototype/design.md),整改前最后版本)。规则见 [`archive/README.md`](archive/README.md)。**编号语义保留**:源码注释里 `plan/09 §2` 去 `archive/plan/09-…` 找。

### 4. 找东西

| 你在找 | 在哪 |
|---|---|
| 「现在到底该按哪份文档干活」 | [`DESIGN.md`](../DESIGN.md) 指 [`modules/`](modules/) 各份;设计层面拿不准查 [`plan/06`](../plan/06-overall-alignment.md);产品命题查 [`plan/07`](../plan/07-product-proposition.md) |
| 开发规矩(建/跑/测/门禁/目录/铁律) | [`AGENTS.md`](../AGENTS.md) |
| 领域词 | [`CONTEXT.md`](../CONTEXT.md) |
| headless 例子(指挥器 / PTY 烟测) | [`DEVELOPMENT.md`](../DEVELOPMENT.md);源码在 `crates/bw-v4/examples/`、`crates/v4-engine/examples/` |
| 验收流 | [`plan/15`](../plan/15-acceptance-flow-workflow.md) + `e2e/` + `scripts/run-flow.py` |
| 规范与赋能模型(三来源两路径) | [`convention.md`](convention.md) |
| V3 在哪 | V3 六 crate 冻结在 `crates/`(bw-core/bw-engine/bw-store/bw-app/ui/app-desktop),不是权威;全量在 `v3` 分支与 `docs/archive/` |
