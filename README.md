# Builders' Workbench

**你定方向，AI 跑完能跑的。**

给 **super builder** 的 AI 时代工作台——一个人从想法负责到持续运营。你定方向、审结果；现有做法覆盖到的工作由 AI 执行，其他工作由人与 AI 协作完成。

![CI](https://github.com/forcegravity1989/builder-workbench/actions/workflows/ci.yml/badge.svg)

主张正本 · [docs/01-principles/03](docs/01-principles/03-press-release-faq-flywheel.md) · 开发规矩 · [AGENTS.md](AGENTS.md) · 设计 · [docs/architecture.md](docs/architecture.md) · 词表 · [CONTEXT.md](CONTEXT.md)

---

## 这是什么？

Builders' Workbench 是本机桌面工作台（Rust / Dioxus，macOS + Windows）。

AI 时代写代码已经很快，规划、设计、构建、发布、维护、运营等开发活动对 super builder 可以在一次**迭代**内完成。这些活动不等于 Workbench 的五站产品旅程。稀缺的不是「会不会写代码」，而是：

1. **确定目标与范围**：项目是什么、对标谁、往哪走、这一周推什么——必须是你定的，不能被模板或 agent 代填生效。
2. **人审结果**：对照「做哪些事」「结果长什么样」「怎么验收」审阅结果；原型与操作逻辑必须明确，风险大的事项优先交给你判断，完成由你确认。
3. **按已验证的做法执行**：`standard/` 覆盖到的工作由 AI 执行；尚未覆盖的由人与 AI 协作完成。不满意可反馈重做，或开一棵**独立 worktree** 亲手试——创建工作树和讨论都不等于确认完成。
4. **高可靠**：没数据就显示灰色「未知」，绝不假装绿；架构欠账有全景可盘，盘出来的事排进下一次迭代。

它不是又一块看板，也不是 Cursor / Claude Code 外面套一层壳。编辑器解决「这段代码怎么改」；Workbench 管整次迭代里人该坐在哪、要点头的地方有多少。

> **主张与现状**：上面写的是目标体验（见 [docs/01-principles/03](docs/01-principles/03-press-release-faq-flywheel.md)）。仓里现行主路径仍有脚手架成分（项目墙 / 看板 / ▶跑 / 人点完成等），**不得把草稿界面讲成已交付**。做到哪以 [docs/architecture.md](docs/architecture.md) 与指南为准。

---

## 怎么叫

| 说法 | 用途 |
|---|---|
| **Builders' Workbench** / **Workbench** / **BW** | 产品名（对外、文档、主张） |
| **bw** | 工程标识：crate（`bw` / `bw-engine`）、仓目录 `.bw/`、标签 `bw:*`、环境变量 `BW_*`、二进制 `bw-dev` |

GitHub 仓库 slug 是 `builder-workbench`。已废弃：`buddy`、`loop-buddy`。

---

## 能力（目标体验）

- **确定目标与范围** — 基础信息、目标方向、周目标由你确认；AI 可起草，未确认不得生效。
- **人审结果** — 对照工作范围、原型与操作逻辑验收；风险大的事项优先审阅。AI 可以执行，不能替你确认完成。
- **能商量也能上手** — 反馈重做、开独立 worktree 亲手试、确认完成；讨论与创建工作树不等于完成，结论写回这件事的正文。
- **一站式迭代** — 项目版本、构建交付、治理、反馈、进化五站在同一工作台上衔接；专业工具中的结果也回到对应工作。
- **架构审视** — 架构说明随代码更新；你与负责架构的 AI 定期审视技术债务，排进下一次迭代。
- **健康难造假** — 信号只能从真实数据推导；无数据 = Unknown，不装绿。

更完整的新闻稿、外/内 FAQ 与飞轮见 [docs/01-principles/03](docs/01-principles/03-press-release-faq-flywheel.md)。

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

▶跑一条 Issue 会在内嵌终端里起交互式 `claude`。真跑受信任对话框与网关影响，那不是本仓的门禁。

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

给贡献者与 Agent 的规矩在 [AGENTS.md](AGENTS.md)（唯一开发正本）：怎么建/跑/测、门禁、目录导览、铁律、特性起手（`docs/01-principles/02` + `docs/05-features/`）、写作与 commit 约定。


| 你在找             | 去哪                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| 产品主张 / FAQ / 飞轮 | [docs/01-principles/03](docs/01-principles/03-press-release-faq-flywheel.md)                                         |
| 文档怎么分层、特性制品链    | [docs/01-principles/01](docs/01-principles/01-document-organization.md) · [02](docs/01-principles/02-working-backwards.md) |
| 怎么用（指南）         | [docs/03-guide/](docs/03-guide/)                                                                           |
| 全仓文档地图          | [docs/README.md](docs/README.md)                                                                     |
| 领域用词            | [CONTEXT.md](CONTEXT.md)                                                                             |
| 版本记录            | [CHANGELOG.md](CHANGELOG.md)                                                                         |


