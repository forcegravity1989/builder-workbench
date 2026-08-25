# Builders' Workbench(BW / loop-buddy)

> **30 秒导读**:这是仓库的总入口——它是什么、怎么跑起来、文档在哪。给第一次 clone 下来的人看。**现在作数**。给 AI 会话的工作纪律在 [`CLAUDE.md`](CLAUDE.md);开发者操作手册在 [`DEVELOPMENT.md`](DEVELOPMENT.md);全仓文档地图在 [`docs/README.md`](docs/README.md)。

## 是什么

单人构建者的 Rust 原生桌面工作台(Dioxus 0.7 / wry WebView,macOS + Windows)。产品命题一句话:**用 AI 时代的方式,一步步把一个项目的管理体系搭起来;走完,你拥有一套可复制的项目管理方法,而不只是一块看板**。完整拆解见 [`plan/07-product-proposition.md`](plan/07-product-proposition.md)。

**当前主线是 V4**(一心 V4;V3 旧壳并存等删、不再投入):**仓是正本**——buddy 把一套规范文件铺进项目仓的 `.bw/` 目录,周计划、指标、发版记录都住在仓里走 MR;本机库只有四张表,健康灯和数字每次现算。一个项目一周转一圈:看总览 → 一次 agent 会话更新指标、定周计划 → 每张活按类别选开工工具、agent 干人守门 → 评审、合入、人点「完成」→ 发版。设计正本见 [`docs/v4-prototype/design.md`](docs/v4-prototype/design.md)。

四条产品铁律:「完成」永远由人点;健康信号只能从真实数据推导(没数据就是灰,绝不假装绿);交棒、指标读数这类记录只追加、不修改;定时任务只自动**建**活、绝不自动**完成**活。

三个名字是一件东西:仓库真名 **loop-buddy**(GitHub);产品名 **Builders' Workbench(BW)**;**buddy** 是产品里那个 AI 队友/程序的自称。

## 怎么跑

```bash
# 需要 Rust 1.82+;桌面壳另需 Dioxus 0.7 的系统依赖(macOS 自带 WebKit,Windows 用 WebView2)

# V4(当前主线):
cargo run -p app-shell                      # 启动 V4 新壳(二进制名 bw-v4-dev;库文件 workbench-v4.db)

# V3(旧壳,并存等删):
cargo run -p app-desktop                    # 启动 V3 桌面应用(默认库在 ~/Library/Application Support/BuildersWorkbench/)

# 不开界面证明内嵌终端在这台机器上能跑(macOS/Linux/Windows 同一条路径):
cargo run -p v4-engine --example pty_smoke
```

▶开工(V3 里叫 ▶跑)需要本机装好 `claude` CLI(`BW_CLAUDE_BIN` 可指定路径)。真跑受 claude 的信任对话框与网关状态影响,那不是 BW 的门禁。

## 仓库结构

```
crates/         V4:bw-v4(内核:四张表 + 仓文件解析 + 现算)· v4-engine(claude 执行/PTY/远端)
                · app-shell(V4 新壳)
                V3(并存等删):bw-core · bw-engine · bw-store · bw-app · ui · app-desktop
standard/       V4 规范件正本(铺进项目仓的模板 + buddy 自带技能),编进二进制,改它=改产品行为
plan/           现役计划与规范(README 说明哪些作数)
docs/           文档地图 docs/README.md(含「现在的节奏」)· V4 设计正本 v4-prototype/design.md
                · 遗留清单 LEFTOVERS.md(全产品唯一)· 文档边界 doc-boundaries.md · 版本登记 releases.md · 历史档案 archive/
iterations/     PRACTICE-buddy.md(实践日志)
e2e/ examples/ scripts/   验收流考卷与种子库 · 样板间库与 vendor 技能库 · 门禁与联调脚本
```

架构、常用命令、headless 例子清单、验证方式见 [`DEVELOPMENT.md`](DEVELOPMENT.md);领域词表见 [`CONTEXT.md`](CONTEXT.md);现在在做什么见 [`docs/README.md`](docs/README.md)「现在的节奏」。

## 提交前

跑 `./scripts/gate.sh`(门禁清单的唯一正本,每个 commit 前全过);commit 标题必须让不查文档的人看懂做了什么;数字一律 `sqlite3` 读回、不硬编。
