# Builders' Workbench(BW / loop-buddy)

> **30 秒导读**:仓库总入口——是什么、怎么跑、规矩在哪。给第一次 clone 下来的人看。开发规矩(唯一正本)在 [`AGENTS.md`](AGENTS.md);领域词表在 [`CONTEXT.md`](CONTEXT.md);设计指向在 [`DESIGN.md`](DESIGN.md);全仓文档地图在 [`docs/README.md`](docs/README.md)。

## 是什么

单人构建者的 Rust 原生桌面工作台(Dioxus 0.7 / wry WebView,macOS + Windows)。产品命题一句话:**用 AI 时代的方式,一步步把一个项目的管理体系搭起来;走完,你拥有一套可复制的项目管理方法,而不只是一块看板**。设计见 [`docs/architecture.md`](docs/architecture.md)。

主环(用户在这里真干活):**项目墙 → 建/接项目 → Issue 看板 → ▶跑(内嵌终端里的真实 `claude`)→ 评审 → 人点「完成」→ 一键蒸馏成技能**。

三个名字是一件东西:仓库真名 **loop-buddy**;产品名 **Builders' Workbench(BW)**;**buddy** 是产品里那个 AI 队友/程序的自称。

## 怎么跑

```bash
# 需要 Rust 1.82+;桌面壳另需 Dioxus 0.7 的系统依赖(macOS 自带 WebKit,Windows 用 WebView2)
cargo run -p app-shell                      # 启 buddy MVP 桌面壳(bin 名 bw-v4-dev,本地零数据库)
BW_OPEN=<项目名> BW_PANEL=overview|plan|session|notify|config|kb ./target/debug/bw-v4-dev
                                            # 深链直达屏;stderr [BW_OPEN]=真的渲染到了

# 不开界面证明内嵌终端在这台机器上能跑(所有平台同一条路径,不碰 claude/网关):
cargo run -p v4-engine --example pty_smoke
```

▶跑 需要本机装好 `claude` CLI(`BW_CLAUDE_BIN` 可指定路径)。真跑受 claude 信任对话框与网关状态影响,那不是 BW 的门禁。

## 仓库结构

```
crates/   bw-v4(内核)· v4-engine(底座)· app-shell(壳,bin bw-v4-dev)
standard/  规范正本(铺底 `templates/` + 系统提示词 `system-prompt/` + 运作剧本 `skills/` 4 份 + 业界 workflow `vendor/` mattpocock/mohit)
docs/      文档地图 + architecture(设计正本)+ guide(产品指南)+ adr + hifi
scripts/   门禁脚本(guard-*)+ codegraph 联调
```

架构、门禁命令、验证方式、目录导览见 [`AGENTS.md`](AGENTS.md);现在在做什么见 [`docs/README.md`](docs/README.md)。

## 提交前

门禁与 CI 完全一致(命令见 [`AGENTS.md`](AGENTS.md)「门禁」);commit 标题必须让不查文档的人看懂做了什么;数字一律读回(`codehub-cli`/`gh`/`git`/`cat .bw/…`)、不硬编。
