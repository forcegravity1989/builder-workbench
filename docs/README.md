# docs/ — 全仓文档地图

> **30 秒导读**:这一页告诉你仓库里每一堆文档是干什么的。给新接手的人和 AI 会话看。仓库根 [`README.md`](../README.md) 是总入口;开发规矩唯一正本 [`AGENTS.md`](../AGENTS.md);`CLAUDE.md` 只是一行导入它。本页随目录变动维护。

## 一张图

```
仓库根
├── README.md          总入口:是什么 · 怎么跑
├── AGENTS.md          唯一开发规矩正本(建/跑/测+门禁+目录+铁律)
├── CLAUDE.md          一行 @AGENTS.md 导入
├── CONTEXT.md         领域语言词表(交棒/读数/蒸馏……唯一规范用词来源)
├── CHANGELOG.md       版本变更记录(本次合入了什么)
├── DESIGN.md          设计指向(各模块设计 + workflow 文档指过去)
├── crates/            bw-v4(内核)· v4-engine(底座)· app-shell(壳,bin bw-v4-dev)
├── standard/          规范正本(include_str! 进 bw-v4):模板 + 自维护 skill `skills/` 10 份 + 业界 skill `vendor/`(mattpocock/superpowers/mohit)
├── scripts/           门禁脚本(guard-*)+ codegraph 联调
├── docs/              ← 你在这
└── .bw/               buddy 自己作为被管项目的资产(PROJECT.md/metrics.toml/issue-policy.toml/…)
```

## docs/ 里有什么

| 路径 | 是什么 |
|---|---|
| [`architecture.md`](architecture.md) | **设计正本**:三 crate 架构 + 工作流模型(三来源两路径/系统提示词/默认 workflow/数据流/四铁律)+ 16 模块核心设计。人和 AI 都能在这检索到任一模块的设计。`DESIGN.md` 指向它 |
| [`guide/`](guide/) | 产品指南(怎么用 buddy,给用户/同事)+ 填写规范 |
| [`adr/`](adr/) | 架构决策(难回头一条一篇) |
| [`hifi/`](hifi/) | 视觉正本(`index.html` 单文件高保真 + 逐屏简报),桌面壳样式表从它搬过去 |

## 找东西

| 你在找 | 在哪 |
|---|---|
| 「buddy 是什么/设计」 | [`architecture.md`](architecture.md)([`DESIGN.md`](../DESIGN.md) 指路) |
| 开发规矩(建/跑/测/门禁/目录/铁律/怎么加特性) | [`AGENTS.md`](../AGENTS.md) |
| 领域词 | [`CONTEXT.md`](../CONTEXT.md) |
| 产品指南(怎么用) | [`guide/`](guide/) |
| headless 例子(PTY 烟测) | [`AGENTS.md`](../AGENTS.md)「怎么建/跑/测」;源码 `crates/v4-engine/examples/` |
| V3 在哪 | V3 已删(2026-08-24),全量在 `v3` 分支 |
