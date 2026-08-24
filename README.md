# Builders' Workbench(BW / loop-buddy)

> **30 秒导读**:仓库总入口——是什么、怎么跑、规矩在哪。给第一次 clone 下来的人看。开发规矩(唯一正本)在 [`AGENTS.md`](AGENTS.md);领域词表在 [`CONTEXT.md`](CONTEXT.md);设计指向在 [`DESIGN.md`](DESIGN.md);全仓文档地图在 [`docs/README.md`](docs/README.md)。

## 是什么

单人构建者的 Rust 原生桌面工作台(Dioxus 0.7 / wry WebView,macOS + Windows)。产品命题一句话:**用 AI 时代的方式,一步步把一个项目的管理体系搭起来;走完,你拥有一套可复制的项目管理方法,而不只是一块看板**。完整拆解见 [`plan/07-product-proposition.md`](plan/07-product-proposition.md)。

主环(用户在这里真干活):**项目墙 → 建/接项目 → Issue 看板 → ▶跑(内嵌终端里的真实 `claude`)→ 评审 → 人点「完成」→ 一键蒸馏成技能**。

三个名字是一件东西:仓库真名 **loop-buddy**;产品名 **Builders' Workbench(BW)**;**buddy** 是产品里那个 AI 队友/程序的自称。

## 怎么跑

```bash
# 需要 Rust 1.82+;桌面壳另需 Dioxus 0.7 的系统依赖(macOS 自带 WebKit,Windows 用 WebView2)
cargo run -p app-shell                      # 启 buddy MVP 桌面壳(bin 名 bw-v4-dev)
BW_DB=/tmp/bw.db cargo run -p app-shell     # 用一个临时空库启动(注:V3 库路径语义,见 AGENTS.md)

# 不开界面证明内嵌终端在这台机器上能跑(所有平台同一条路径,不碰 claude/网关):
cargo run -p v4-engine --example pty_smoke
```

▶跑 需要本机装好 `claude` CLI(`BW_CLAUDE_BIN` 可指定路径)。真跑受 claude 信任对话框与网关状态影响,那不是 BW 的门禁。

## 仓库结构

```
crates/   bw-v4(内核)· v4-engine(底座)· app-shell(壳,bin bw-v4-dev)  ← buddy MVP
          bw-core/bw-engine/bw-store/bw-app/ui/app-desktop  ← V3,冻结等删(见 AGENTS.md)
standard/  buddy 推给被管项目的规范正本(模板 + 10 份自带 skill)
docs/      文档地图 + 模块设计(modules/)+ convention + adr + 历史 archive
plan/      06 设计事实源 · 07 命题 · 08 MVP 定义 · 13/15/16/20 规范
scripts/   门禁脚本 + 验收流工具链 + 联调脚本
e2e/ examples/  验收流考卷 + 样板间库与 vendor 技能库
```

架构、门禁命令、验证方式、目录导览见 [`AGENTS.md`](AGENTS.md);现在在做什么见 [`docs/README.md`](docs/README.md)。

## 提交前

门禁与 CI 完全一致(命令见 [`AGENTS.md`](AGENTS.md)「门禁」);commit 标题必须让不查文档的人看懂做了什么;数字一律读回(`codehub-cli`/`gh`/`git`/`cat .bw/…`)、不硬编。
