# docs/ — 全仓文档地图

> **30 秒导读**:这一页告诉你**仓库里的每一堆文档是干什么的、现在还作不作数、该不该动**,并且是「**现在在做什么**」这件事的唯一正本——别处(README、DEVELOPMENT、各目录导读)只指到这里,不再各自复述节奏。给新接手的人和 AI 会话看。**现在作数**(随目录与节奏变动维护)。仓库根的 [`README.md`](../README.md) 是总入口;这里只管文档。

## 现在的节奏(唯一正本,别处只指这里)

**一心 V4**(2026-08-21 起):

- **设计正本**:[`v4-prototype/design.md`](v4-prototype/design.md),一篇讲完。代码已建成合进 `main`(V4 内核 `crates/bw-v4` + 能力底座 `crates/v4-engine` + 新壳 `crates/app-shell`),**试点在跑、一边跑一边改**。
- **离 MVP 还差什么**只认 [`LEFTOVERS.md`](LEFTOVERS.md)。
- **V3 不再投入、连 bug 也不修**,与 V4 并存等删(两边零依赖;删除判据见 design.md §12.6,今天一条都不满足,所以旧壳还在)。V3 的欠账不进遗留清单,随它一起等删。
- V4 还没出过安装包;同事手里装的仍是 V3 的包(见 [`releases.md`](releases.md))。

## 一张图

```
仓库根
├── README.md          总入口:是什么 · 怎么跑 · 文档地图
├── CLAUDE.md          给 AI 会话的工作说明(写作纪律 · 核心纪律 · 协作约定)← 规则的正本
├── AGENTS.md          给通用 agent 工具的 CodeGraph 导航,一句话指回 CLAUDE.md
├── CONTEXT.md         领域语言词表(队友/交棒/读数/蒸馏……唯一规范用词来源)
├── DEVELOPMENT.md     开发指南:工作区布局 · 常用命令 · headless 例子 · 验证方式 ← 操作的正本
├── plan/              现役计划与规范(README 说明各管什么;多为 V3 时代拍板,命题仍现役)
├── iterations/        只剩 PRACTICE-buddy.md(伙伴的实践日志,持续更新)
├── standard/          V4 规范件正本(编进二进制,改它=改产品行为,不是普通文档)
├── docs/              ← 你在这
├── e2e/               验收流考卷(toml)与种子库(V3 工具链)
├── examples/          样板间库(aihot)+ vendor 技能库
└── scripts/           gate.sh(门禁正本)· 结构守卫 · 验收流工具链 · 本机联调脚本
```

## docs/ 里的四类东西

### 1. 现役文档(改东西前读;过时了要么改要么加横幅)

| 路径 | 是什么 | 谁在维护 |
|---|---|---|
| [`v4-prototype/`](v4-prototype/) | **当前主线 V4 的入口**:设计正本 [`design.md`](v4-prototype/design.md)(一篇,一站走完就把对应章节改成实况)+ 高保真原型 [`hifi/`](v4-prototype/hifi/)(视觉正本)+ 一次性的现状核查报告。配套的产品指南与对外宣讲在 [`guide/`](guide/) | 试点会话;文档整理在每站用户验证后单独做(见 doc-boundaries) |
| [`LEFTOVERS.md`](LEFTOVERS.md) | **离「V4 的 MVP 做完了」还差什么**的唯一清单,按 design.md §13.1 的验收八条分组。做完的史实、有意的留白、V3 的欠账一律不记 | 加条目前先回答「验收八条里哪一条过不去」 |
| [`doc-boundaries.md`](doc-boundaries.md) | 文档边界:给人看的文档分几层、每层写什么、文档整理什么时候做 | 现在作数 |
| [`releases.md`](releases.md) | 版本登记:出包与运作 | 现在作数 |
| [`code-schemes.md`](code-schemes.md) | 代号索引(P/S/W/R/L/A/D/G/K/M/T/V……),新开一批代号先来这里登记 | 谁开代号谁登记 |
| [`adr/0001-ubiquitous-language.md`](adr/0001-ubiquitous-language.md) | 确立 `CONTEXT.md` 为领域语言规范的决定 + 改名台账 | 改术语时更新 |
| [`guide/`](guide/) | 给同事用的:[`guide.md`](guide/guide.md)(**「怎么用」的正本**,只写已实践,每走完一站补一站)、[`v4-产品指南.html`](guide/v4-产品指南.html)(图文版,冲突时以 guide.md 为准;下半「怎么给 buddy 开发新特性」以 `DEVELOPMENT.md` 为正本)、[`v4-对外宣讲.html`](guide/v4-对外宣讲.html)(讲稿,零实现术语零代号)+ V1 期留下的指南 HTML 原型与 `填写规范.md` | V4 指南:伴飞中,每走完一站补一站 |
| [`superpowers/specs/`](superpowers/specs/) | 仍作数的设计稿(GitHub 主体化入门、技能五角色归类、减负重构) | 过时即搬 `archive/superpowers/` |
| [`metrics/workflowhub/`](metrics/workflowhub/) | **WorkflowHub 这个项目**的指标正本与推导记录(装的是 WorkflowHub 的指标,不是 loop-buddy 自己的,所以不放仓根 `.bw/`) | 指标变动时 |
| [`examples/metrics.toml.sample`](examples/metrics.toml.sample) | `.bw/metrics.toml` 可复制样例(V3 格式;V4 格式见 design.md §10.8) | 格式变动时 |
| [`v1-prototype/`](v1-prototype/) [`v2-prototype/`](v2-prototype/) [`v3-prototype/`](v3-prototype/) | **V1→V2→V3 三代迭代线的史实**(V1 产品化 → V2 调度/多人 → V3 内嵌 Open Design)。已落地的篇章大多归档在 [`archive/`](archive/),各现役目录只剩仍被引用为当时权威、或含未关闭线索的少数篇;各有 README 与逐文件状态表。**按当前节奏,这三个目录只读不写**——新东西一律进 V4 | 只加横幅,不新增设计 |

### 2. 运行时资产(被 `include_str!` 编进二进制——**改它就是改产品行为**,不是改文档)

| 路径 | 编进哪 |
|---|---|
| 仓根 [`standard/`](../standard/)(不在 docs/ 下,性质相同) | `crates/bw-v4/src/standard/`——**V4 的规范件正本**:铺进项目仓 `.bw/` 的模板 + buddy 自带的技能与运作剧本(`standard/skills/`,平铺一层) |
| [`buddy/`](buddy/)(系统提示词 + `.bw/*.toml` 格式规范) | `crates/bw-core/src/buddy_assets.rs`——**V3 用**;V4 的格式契约见 design.md §10.8 |
| [`skills/*/SKILL.md`](skills/) | `crates/bw-core/src/bw_library.rs`——**V3 自带的基础技能包正本;V4 不再读这个目录**(V4 自带技能收敛在仓根 `standard/skills/`) |

`buddy/README.md` 有 V3 那批资产的自述。**不要搬这几个目录**——路径是编译期硬绑定。

### 3. 历史档案([`archive/`](archive/),只加不改)

早期路线选型(`plan/00-05`)、做完即历史的执行批次(`plan/09-12,14,17-19,21`)、交接记录与 aihot 践行日志(`iterations/`)、superpowers 实施计划原件、Rust 重写前的 HTML 原型稿(`design/`)、2026-07 的演示报告(`verification/`)、V1/V2/V3 迭代线里已落地的设计事实源、V4 规划期的原文与预研(`v4-prototype/`)。规则与目录见 [`archive/README.md`](archive/README.md)。**编号语义保留**:源码注释里的 `plan/09 §2` 去 `archive/plan/09-…` 找。

### 4. 不在 docs/ 但容易找错地方的

| 你在找 | 在哪 |
|---|---|
| 「现在到底该按哪份文档干活」 | [`v4-prototype/design.md`](v4-prototype/design.md);产品命题查 `plan/07`;V3 时代怎么定的查 `plan/06` 与各代目录 |
| 门禁 / 常用命令 / 深链 / 读回纪律 | `scripts/gate.sh`(门禁正本)· `DEVELOPMENT.md`(操作正本)· `CLAUDE.md`(纪律) |
| 领域词(队友、交棒、读数、蒸馏……) | `CONTEXT.md`(V4 语义有变的词条带「V4」引注) |
| headless 例子(指挥器 / 各模块 smoke / PTY 烟测) | `DEVELOPMENT.md`「headless 例子」一节 |
| 验收流(考卷 / 真点击 / 证据报告,V3 工具链) | `plan/15` + `e2e/` + `scripts/run-flow.py`;V4 的验证手段见 design.md 第 13 章 |
| 样板间库怎么再生 | `examples/README.md` |
| 产品名 | 仓库真名 **loop-buddy**(GitHub);产品名 **Builders' Workbench(BW)**;`buddy` 是产品里那个 AI 队友/程序的自称,三者是一件东西的三个称呼 |
