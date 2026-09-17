---
name: workbench-start
description: >-
  Use when starting any Claude Code, Cursor, or Codex session on the
  Builders' Workbench (builder-workbench) repo outside the Workbench desktop app —
  起手, 开干, 伴飞, continue a module, add a feature, fix a bug, write docs,
  or a new window on this repo. Use even if a personal kickoff,
  feature-dev, or bugfix skill is also available. Do not use inside
  project sessions launched by Workbench.
---

# workbench-start — 仓外起手闸门

Workbench MVP 还不能在工作台里维护自己。这份 skill 按住仓外窗口 AI:**人只走站和验收,改代码与文档是你的事**。不是第二套工作台,正本仍是 `AGENTS.md`。

## 人与窗口 AI

人是 Builder,也是核心开发——但开发不是人干的。人做三件事:走旅程、判断对错、点头或驳回。你改代码、补指南、改 architecture、改高保真。人说「做成了」之前,他自己用 `gh` / `codehub-cli` / `git` / `cat .bw/…` 读回,不信你自报。

可见物各干什么,见 `AGENTS.md`「按任务读取」与 `docs/README.md`。伴飞打开 `docs/03-guide/index.html`（指向现行指南 `v4-产品指南.html`）:

| 人看 | 人用来 | 你用来 |
|---|---|---|
| 产品指南 `docs/03-guide/v4-产品指南.html` | 第几站、该看到什么 | 走过之后按 `docs/03-guide/填写规范.md` 写成实况 |
| 高保真 `docs/hifi/index.html` | 这一屏该长什么样 | 壳不对改壳,稿不对改稿 |
| `docs/architecture.md` | 整体旅程 / 逻辑模块 / 实现边界 | 定位受影响的能力和数据流 |
| `docs/06-module/` | 单个模块的实现心智与主要取舍 | 修改模块时对照对应篇 |
| `docs/05-features/<id>/` | 某项特性的目标与规格 | 特性级变更按原则 01/02 维护制品 |
| 本文件 + `AGENTS.md` | 按住你 | 规矩正本,不许另起一套 |

文档分层与变更同步要求听 `docs/01-principles/01-document-organization.md`；本篇只指向已有正本。

## 人判定之后你改哪一份

| 人对不上的判断 | 你改 | 你不改 |
|---|---|---|
| 设计就不该这样 | 整体设计改 `docs/architecture.md`，模块取舍改 `docs/06-module/`，特性规格改对应 `docs/05-features/<id>/` | 先改代码圆过时设计 |
| 设计对,产品没守 | 代码 | 先改文档把 bug 写成特性 |
| 走过了,指南空或错 | 产品指南(操作 → 背后 → 得到什么) | 写进 architecture |
| 稿和壳不一致 | 人先定谁对,再改那一份 | 发明第三套样子 |
| 本来就标了没建 | 记下,等人说做再做 | 顺手做技能提炼 / Cursor / B 类读数 |

## 先读再动手

1. `AGENTS.md` → 2. `docs/architecture.md` → 3. `CONTEXT.md` → 4. 动到哪站再读指南与高保真。

定位:旅程哪一站 → architecture §2 哪个能力 → 三层哪一层 → 数据归哪 → architecture §3 的 crate 与数据流；模块实现心智读 `docs/06-module/` 对应篇。找不到先澄清并补文档；新增或补回内容先读目标头部，范围外按 `AGENTS.md`「文档怎么读、怎么维护」与人确认边界。未锁定决策走 grill / domain-modeling。构建类 Issue 走仓内 `mattpocock-skills`,不要自造流程。改 `standard/`(主提示词 / reference / skill)先读 `docs/06-module/系统提示词与渐进加载.md`「三层分工与维护对照」,不要只改内核或只改 skill。

先审已有实现和提示词,不对再改那一份;不新增平行方案。正本见 `AGENTS.md`「项目硬约束」。

## 禁止

| 借口 | 实际 |
|---|---|
| 先走个人 kickoff / 伴飞 / 需求 / 修 bug skill | 平行链,本仓不用 |
| 在 Cursor 里演 issue / worktree / PTY / 定时 | 那是产品,这里不模拟 |
| 正本在聊天里 | 跨会话只认仓文件 |
| 人没点完成我也先 merge | 合入永远是人 |
| 人没走完一站我就六站一起改 | 一站一结 |

Workbench 发起的项目执行会话遵循产品传入的提示与被管项目的 `AGENTS.md`，不要在那里再跑这份仓外起手 skill。
