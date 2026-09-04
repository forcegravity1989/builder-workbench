# docs/ — 全仓文档地图

> **30 秒导读**:这一页告诉你仓库里每一堆文档是干什么的。给新接手的人和 AI 会话看。仓库根 [`README.md`](../README.md) 是**产品介绍门面**;**主张与分层**听 [`01-principles/`](01-principles/README.md);开发规矩唯一正本 [`AGENTS.md`](../AGENTS.md);`CLAUDE.md` 只是一行导入它。本页随目录变动维护。

## 一张图

```
仓库根
├── README.md          产品介绍(GitHub 门面):是什么 · 主张摘要 · 快速开始 · 架构一眼
├── AGENTS.md          唯一开发规矩正本(建/跑/测+门禁+目录+铁律+特性起手)
├── CLAUDE.md          一行 @AGENTS.md 导入
├── CONTEXT.md         领域语言词表(交棒/读数/蒸馏……唯一规范用词来源)
├── CHANGELOG.md       版本变更记录(本次合入了什么)
├── DESIGN.md          设计指向(各模块设计 + workflow 文档指过去)
├── crates/            bw(内核)· bw-engine(底座)· app-shell(壳,bin bw-dev)
├── standard/          规范正本(include_str! 进 bw):模板 `templates/`(接入不摊)+ 系统提示词 + 运作剧本 + vendor
├── scripts/           门禁脚本(guard-*)+ codegraph 联调
├── docs/              ← 你在这
└── .bw/               Workbench 自己作为被管项目的资产(project.toml / metrics.toml; issue-policy.toml 是残留)
```

## docs/ 里有什么

| 路径 | 是什么 |
|---|---|
| [`01-principles/`](01-principles/README.md) | **原则正本**(慢变宪法):01 文档分层 / 02 逆向工作法 / 03 新闻稿·FAQ·飞轮。特性立项与产品主张的最高优先级约束 |
| [`architecture.md`](architecture.md) | **设计正本**:三 crate 架构 + 工作流模型(三来源两路径/系统提示词/默认 workflow/数据流/四铁律)+ 16 模块核心设计。人和 AI 都能在这检索到任一模块的设计。`DESIGN.md` 指向它;docs 内不编号 |
| [`02-adr/`](02-adr/) | 架构决策(难回头一条一篇) |
| [`03-guide/`](03-guide/) | 产品指南(怎么用 Workbench,给用户/同事)+ 填写规范 |
| [`04-design-system/`](04-design-system/) | Builder 设计系统资产(唯一样式表 + 机读 token + 双语规范 + 14 张示例页),镜像自 Claude Design 项目「builder」;未接线到壳,供界面演进采用 |
| [`05-features/`](05-features/) | **特性级变更制品链**——intent + 带原型的 spec 为人 gate;plan 仅大风险升 gate;小修不进。粒度与制品链见 [01 §4](01-principles/01-document-organization.md) |
| [`10-reference/`](10-reference/) | 外部参考的**提炼版**(转述非原文,原文只存链接)。现有两篇:[AI-native SDLC playbook](10-reference/ai-native-sdlc-playbook.md)——做法与治理哲学,每段带 BW 落点或不采纳理由;[BSC Designer 能力评估](10-reference/bsc-designer-capabilities.md)——平衡计分卡软件的能力与方法论逐条对照,引入 / 改造 / 不引入(评估稿,待裁决) |
| [`hifi/`](hifi/) | 视觉正本(`index.html` 单文件高保真 + 逐屏简报),桌面壳样式表从它搬过去 |

## 找东西

| 你在找 | 在哪 |
|---|---|
| 仓库门面 / 一句话介绍 | [`../README.md`](../README.md) |
| 「Workbench 是什么/设计」 | [`architecture.md`](architecture.md)([`DESIGN.md`](../DESIGN.md) 指路) |
| 产品主张 / 飞轮 / 特性怎么立项 | [`01-principles/`](01-principles/README.md) |
| 开发规矩(建/跑/测/门禁/目录/铁律/怎么加特性) | [`AGENTS.md`](../AGENTS.md) |
| 领域词 | [`CONTEXT.md`](../CONTEXT.md) |
| 产品指南(怎么用) | [`03-guide/`](03-guide/) |
| headless 例子(PTY 烟测) | [`AGENTS.md`](../AGENTS.md)「怎么建/跑/测」;源码 `crates/bw-engine/examples/` |
| 外部参考(playbook 等的提炼版) | [`10-reference/`](10-reference/) |
| V3 在哪 | V3 已删(2026-08-24),全量在 `v3` 分支 |
