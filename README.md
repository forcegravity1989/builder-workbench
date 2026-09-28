<!--
本篇维护约定：给首次访问仓库的人看；介绍产品、当前能力边界、最短启动路径和继续阅读入口。
不写：完整开发门禁、标签协议、模块设计正文、目标能力的已交付承诺、变更流水。
结构：产品简介 → 当前可用范围 → 快速开始 → 继续阅读。定位、能力或启动方式变化时更新。
主张服从 docs/01-principles/03-press-release-faq-flywheel.md；现状对照 docs/architecture.md。
模型维护前必须读取本注释；范围变更按 AGENTS.md「文档怎么读、怎么维护」先与人确认。
-->

# Builders' Workbench

**你定方向，AI 跑完能跑的。**

给独立构建者的 AI 时代桌面工作台：一个人从想法负责到持续运营。你判断方向、审阅结果并确认完成；已被现有做法覆盖的工作交给 AI，其他工作由人与 AI 协作完成。

![CI](https://github.com/forcegravity1989/builder-workbench/actions/workflows/pr.yml/badge.svg?branch=bw-orca)

## 当前可用范围

Workbench 是 Electron 桌面应用（Orca 产品叠层），面向 macOS 与 Windows，目前仍在内测与持续建设中。

- 接入本地或远端 GitHub / CodeHub 仓库，维护项目约定。
- 计划与验收复用 Orca 原生会话工作区，右侧业务板读写版本材料；“新建计划／验收”运行已保存的自动化并打开本次会话，普通新建会话沿用 Orca。
- 总览展示真实指标读数与版本记录，无数据保持未知；知识库对账与建议仍含演示数据，不作为审计证据。会话创建、提示送达和实际执行分别验证，当前证据见各特性 STATUS。
- 由人评审结果、确认完成；AI 和定时任务不能替人完成验收。

产品的目标旅程是“项目版本 → 构建交付 → 治理 → 反馈 → 进化”，**这不是全部能力已交付的声明**。完整主张看 [新闻稿与 FAQ](docs/01-principles/03-press-release-faq-flywheel.md)，现行能力与未建边界看 [架构说明](docs/architecture.md)。技能提炼等目标能力不得仅因出现在主张或词表中就视为可用。

## 快速开始

需要 Node.js 与 pnpm。日常热加载：

```bash
pnpm run dev:workbench
```

构建完成后打开 Workbench 窗口。打开或接入项目后进入计划、任务或知识库页签；新路线的完整用户指南随迁移验收补齐。叠层说明见 [`SYNC.md`](src/renderer/src/workbench/SYNC.md)。

**启动窗口与实际开工是两件事。** 执行 Issue 还需要所选工具、会话宿主以及对应仓库的访问权限；具体依赖与失败处理见 [会话与执行](docs/06-module/会话与执行.md)。完整开发、深链、测试与门禁命令只在 [AGENTS.md](AGENTS.md) 维护。

## 继续阅读

| 想了解什么 | 入口 |
|---|---|
| 当前旅程与待迁移边界 | [架构说明 §1](docs/architecture.md#1--用例与旅程) |
| 为谁做、要解决什么问题 | [产品主张 / FAQ / 飞轮](docs/01-principles/03-press-release-faq-flywheel.md) |
| 当前整体设计与实现边界 | [架构说明](docs/architecture.md) |
| 各类知识放在哪里 | [全仓文档地图](docs/README.md) |
| 领域概念与容易混淆的词 | [CONTEXT.md](CONTEXT.md) |
| 开发或让模型修改本仓 | [AGENTS.md](AGENTS.md) |

产品称 **Builders' Workbench / Workbench / BW**，工程标识使用 `bw`。变更原因与验证证据查对应 commit / PR，当前知识以以上正本为准。


