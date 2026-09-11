---
name: workbench-start
description: >-
  Use when starting any Claude Code, Cursor, or Codex session on the
  Builders' Workbench (builder-workbench) repo outside the Workbench desktop app —
  起手, 开干, 伴飞, continue a module, add a feature, fix a bug, write docs,
  or a new window on this repo. Use even if a personal kickoff,
  feature-dev, or bugfix skill is also available. Do not use inside
  Workbench's embedded terminal.
---

# workbench-start — 仓外起手闸门

Workbench MVP 还不能在工作台里维护自己。这份 skill 按住仓外窗口 AI:**人只走站和验收,改代码与文档是你的事**。不是第二套工作台,正本仍是 `AGENTS.md`。

## 人与窗口 AI

人是 Builder,也是核心开发——但开发不是人干的。人做三件事:走旅程、判断对错、点头或驳回。你改代码、补指南、改 architecture、改高保真。人说「做成了」之前,他自己用 `gh` / `codehub-cli` / `git` / `cat .bw/…` 读回,不信你自报。

可见物各干什么,见 `AGENTS.md`「人怎么驾驭」。伴飞打开 `docs/03-guide/index.html`（指向现行指南 `v4-产品指南.html`）:

| 人看 | 人用来 | 你用来 |
|---|---|---|
| 产品指南 `docs/03-guide/v4-产品指南.html` | 第几站、该看到什么 | 走过之后按 `docs/03-guide/填写规范.md` 写成实况 |
| 高保真 `docs/hifi/index.html` | 这一屏该长什么样 | 壳不对改壳,稿不对改稿 |
| `docs/architecture.md` | 设计 / bug / 没建 | 改设计或改代码的唯一依据 |
| 本文件 + `AGENTS.md` | 按住你 | 规矩正本,不许另起一套 |

没有单独一本「维护指南」。机制和特性关键设计都在 architecture。

## 人判定之后你改哪一份

| 人对不上的判断 | 你改 | 你不改 |
|---|---|---|
| 设计就不该这样 | `architecture.md` 那个模块 | 先改代码圆过时设计 |
| 设计对,产品没守 | 代码 | 先改文档把 bug 写成特性 |
| 走过了,指南空或错 | 产品指南(操作 → 背后 → 得到什么) | 写进 architecture |
| 稿和壳不一致 | 人先定谁对,再改那一份 | 发明第三套样子 |
| 本来就标了没建 | 记下,等人说做再做 | 顺手做技能提炼 / Cursor / B 类读数 |

## 先读再动手

1. `AGENTS.md` → 2. `docs/architecture.md` → 3. `CONTEXT.md` → 4. 动到哪站再读指南与高保真。

定位:旅程哪一站 → 三层哪一层 → 数据归哪 → architecture §3 哪个模块。找不到先补文档。未锁定决策走 grill / domain-modeling。构建类 Issue 走仓内 `mattpocock-skills`,不要自造流程。改 `standard/`(主提示词 / reference / skill)先对 `AGENTS.md`「三层模型」指向的 architecture 模块 4 对照表,不要只改内核或只改 skill。

先审已有实现和提示词,不对再改那一份;不新增平行方案。正本见 `AGENTS.md`「不要做的」。

## 禁止

| 借口 | 实际 |
|---|---|
| 先走个人 kickoff / 伴飞 / 需求 / 修 bug skill | 平行链,本仓不用 |
| 在 Cursor 里演 issue / worktree / PTY / 定时 | 那是产品,这里不模拟 |
| 正本在聊天里 | 跨会话只认仓文件 |
| 人没点完成我也先 merge | 合入永远是人 |
| 人没走完一站我就六站一起改 | 一站一结 |

工作台内嵌终端已经加载了系统提示词,不要在那里再跑这份 skill。
