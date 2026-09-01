# Builders' Workbench

**你定要做什么，队友把其余跑完。**

给 **super builder** 的 AI 时代工作台——一个人从想法 own 到持续运营。你定框、过少数几个 gate；规划到运营在同一张台上迭代。

![CI](https://github.com/forcegravity1989/builder-workbench/actions/workflows/ci.yml/badge.svg)

主张正本 · [principles/03](principles/03-press-release-faq-flywheel.md) · 开发规矩 · [AGENTS.md](AGENTS.md) · 设计 · [docs/architecture.md](docs/architecture.md) · 词表 · [CONTEXT.md](CONTEXT.md)

---

## 这是什么？

Builders' Workbench 是本机桌面工作台（Rust / Dioxus，macOS + Windows）。

AI 时代写代码已经很快，六个阶段——规划、设计、构建、发布、维护、运营——对 super builder 可以一周走完一次**迭代**。稀缺的不是「会不会写代码」，而是：

1. **定框**：项目是什么、对标谁、往哪走、这一周推什么——必须是你定的，不能被模板或 agent 代填生效。
2. **少而硬的 gate**：日常只审「做不做」和「长什么样、怎么操作」（规格必须带可点原型与操作逻辑）；技术方案默认不烦你，只有大风险才升上来。
3. **认过之后自动跑**：中间的拆解、实现、自检、准备发版，交给队友；你不满意就在 gate 上**接着聊**，或开一棵**独立 worktree** 亲手试——开树 ≠ 过 gate。
4. **高可靠**：没数据就显示灰色「未知」，绝不假装绿；架构欠账有全景可盘，盘出来的事排进下一次迭代。

它不是又一块看板，也不是 Cursor / Claude Code 外面套一层壳。编辑器解决「这段代码怎么改」；Workbench 管整次迭代里人该坐在哪、要点头的地方有多少。

> **主张与现状**：上面写的是目标体验（见 [principles/03](principles/03-press-release-faq-flywheel.md)）。仓里现行主路径仍有脚手架成分（项目墙 / 看板 / ▶跑 / 人点完成等），**不得把草稿界面讲成已交付**。做到哪以 [docs/architecture.md](docs/architecture.md) 与指南为准。

---

## 怎么叫

| 说法 | 用途 |
|---|---|
| **Builders' Workbench** / **Workbench** / **BW** | 产品名（对外、文档、主张） |
| **bw** | 工程标识：crate（`bw` / `bw-engine`）、仓目录 `.bw/`、标签 `bw:*`、环境变量 `BW_*`、二进制 `bw-dev` |

GitHub 仓库 slug 是 `builder-workbench`。已废弃：`buddy`、`loop-buddy`。

---

## 能力（目标体验）

- **定框** — 基础信息、发展方向、周目标由你确认；队友可起草，未确认不得生效。
- **少 gate 待办** — 意图（做不做）· 规格（长什么样，含原型与操作逻辑）· 偶发大风险方案；其余默认自动跑。
- **gate 上能商量也能上手** — 「认 / 退回 / 接着聊 / 开独立 worktree」；聊过与开树都不等于过 gate，结论落回这件事的正文。
- **一站式迭代** — 六个阶段的最小动作在同一张台上做完并交棒；更深的专才工具可以出去用，结论回到台上。
- **架构盘账** — 架构全景随代码养账；你与架构师队友定期盘欠账，排进下一次迭代。
- **健康难造假** — 信号只能从真实数据推导；无数据 = Unknown，不装绿。

更完整的新闻稿、外/内 FAQ 与飞轮见 [principles/03](principles/03-press-release-faq-flywheel.md)。

---

## 快速开始

**需要：** Rust 1.82+；桌面壳另需 Dioxus 0.7 的系统依赖（macOS 自带 WebKit，Windows 用 WebView2）；本机可用的 `claude` CLI（`BW_CLAUDE_BIN` 可指定路径）。

```bash
cargo run -p app-shell
# 二进制名 bw-dev；本地零数据库

# 深链直达某一屏（stderr 出现 [BW_OPEN] = 真的渲染到了）
BW_OPEN=<项目名> BW_PANEL=overview|plan|session|config|kb ./target/debug/bw-dev

# 不开界面：证明内嵌终端 PTY 在本机能跑（不碰 claude / 网关）
cargo run -p bw-engine --example pty_smoke
```

▶跑一张活会在内嵌终端里起交互式 `claude`。真跑受信任对话框与网关影响，那不是本仓的门禁。

完整的建 / 跑 / 测 / 门禁命令见 [AGENTS.md](AGENTS.md)。

---

## 架构（一眼）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   app-shell     │────>│       bw         │────>│  仓文件 + 远端   │
│ 桌面壳 (bw-dev) │<────│ 内核 Command/Event│<────│ codehub / gh /  │
│ Dioxus + wry    │     │ 现算推导 · 零业务库 │     │ .bw/* · git     │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                        ┌────────┴─────────┐
                        │    bw-engine     │  交互式 claude · PTY · worktree
                        └──────────────────┘
```


| 层           | 职责                                  |
| ----------- | ----------------------------------- |
| `app-shell` | 八屏桌面壳（bin `bw-dev`）                 |
| `bw`        | MVP 内核：仓文件解析、现算推导、Command/Event     |
| `bw-engine` | 交互式 claude、内嵌终端 PTY、worktree、git、远端 |
| `standard/` | 推给被管项目的规范正本（`include_str!` 进二进制）    |


模块设计见 [docs/architecture.md](docs/architecture.md)（[DESIGN.md](DESIGN.md) 指路）。

---

## 开发

给贡献者与 Agent 的规矩在 [AGENTS.md](AGENTS.md)（唯一开发正本）：怎么建/跑/测、门禁、目录导览、铁律、特性起手（`principles/02` + `changes/`）、写作与 commit 约定。


| 你在找             | 去哪                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| 产品主张 / FAQ / 飞轮 | [principles/03](principles/03-press-release-faq-flywheel.md)                                         |
| 文档怎么分层、特性制品链    | [principles/01](principles/01-document-organization.md) · [02](principles/02-working-backwards.md) |
| 怎么用（指南）         | [docs/guide/](docs/guide/)                                                                           |
| 全仓文档地图          | [docs/README.md](docs/README.md)                                                                     |
| 领域用词            | [CONTEXT.md](CONTEXT.md)                                                                             |
| 版本记录            | [CHANGELOG.md](CHANGELOG.md)                                                                         |


