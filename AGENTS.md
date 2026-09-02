# AGENTS.md — Workbench 开发手册

> 这是 **Builders' Workbench（Workbench / BW）** 仓库的**唯一开发规矩正本**。`CLAUDE.md` 只是一行导入它。给所有驱动 AI(Claude Code / Cursor / Codex)和接手的人看。改这份 = 改开发规矩,过评审再合。

## 原则正本（最高优先级）

**`docs/01-principles/` 是本仓最重要、最慢变的原则。** 开特性、改产品主张、写给人看的文档之前必须对齐这里；不得用草稿实现或口头约定推翻。

| 篇 | 管什么 |
|---|---|
| [`docs/01-principles/01-document-organization.md`](docs/01-principles/01-document-organization.md) | 整仓知识/文档怎么分层；`docs/05-features/` 少 gate |
| [`docs/01-principles/02-working-backwards.md`](docs/01-principles/02-working-backwards.md) | 逆向工作法：特性怎么写 intent / 带原型的 spec |
| [`docs/01-principles/03-press-release-faq-flywheel.md`](docs/01-principles/03-press-release-faq-flywheel.md) | **整个产品**的新闻稿、外/内 FAQ、飞轮（主张正本） |

索引见 [`docs/01-principles/README.md`](docs/01-principles/README.md)。改客群 / 飞轮 / 对外主张 → 先议再改 03；特性 intent 不得偷偷改写。现行实现对照听 [`docs/architecture.md`](docs/architecture.md)，**不得把草稿界面讲成 03 里已经交付的体验**。

### 特性起手路径（硬约定）

| 场景 | 怎么走 |
|---|---|
| **特性级变更** | 对齐 03 → 按 **02** 开 / 改 `docs/05-features/<id>/intent.md` + 带原型的 `spec.md`（人 gate）；`plan.md` 仅大风险升 gate；小修直修（见 01） |
| **Superpowers / grill-me** | **可用**：发散、质询、写计划草稿。产出必须落回 `docs/05-features/<id>/`。不得把聊天或旁路 specs 当成已过 gate 的正本 |
| **小 bug / 琐修** | 直接改 + 门禁 / 验证；不开 `docs/05-features/` |


## 这是什么

单人构建者的 Rust 原生桌面工作台(Dioxus 0.7 / wry WebView,macOS + Windows)。产品命题见 [`README.md`](README.md);设计正本见 [`docs/architecture.md`](docs/architecture.md)([`DESIGN.md`](DESIGN.md) 指路);领域词表见 [`CONTEXT.md`](CONTEXT.md)。产品叫 **Builders' Workbench / Workbench / BW**;工程标识用 **bw**(crate / `.bw/` / `bw:*` / `BW_*`)。已废弃 buddy、loop-buddy。

> **V3 已删**:本仓产品线是 Workbench MVP(内核 `crates/bw` + 底座 `crates/bw-engine` + 壳 `crates/app-shell`)。V3 的六 crate 与 V3 编译资产已于 2026-08-24 删除——全量在 `v3` 分支找回。别再提 V3 概念,设计看 [`docs/architecture.md`](docs/architecture.md)。

## 语言和构建

Rust 1.82+,cargo workspace。桌面壳另需 Dioxus 0.7 的系统依赖(macOS 自带 WebKit,Windows 用 WebView2)。`#![forbid(unsafe_code)]` 是 `bw-engine` 的规矩。跨会话只认本仓的 `docs/01-principles/` + `AGENTS.md` + `CONTEXT.md` + `docs/` + `CHANGELOG.md` + `DESIGN.md`,不凭上一会话口头结论改代码。

仓外 IDE(Claude Code / Cursor / Codex)开新会话,先读 [`.claude/skills/workbench-start/SKILL.md`](.claude/skills/workbench-start/SKILL.md)——只是闸门,正本仍是本文件。工作台内嵌终端里不要用它(那边已经灌了系统提示词)。Workbench MVP 还不能在工作台里维护自己,所以仓外起手暂时靠这份 skill,不是再做一套伴飞/需求/修 bug 流程。

## 怎么建 / 怎么跑 / 怎么测

```bash
cargo check -p bw -p bw-engine            # 日常最快(内核+底座,不编 Dioxus)
cargo run -p app-shell                      # 启 Workbench MVP 桌面壳(bin 名 bw-dev)
BW_OPEN=<项目名> BW_PANEL=overview|plan|session|config|kb ./target/debug/bw-dev
                                            # 深链直达屏;stderr [BW_OPEN]=真的渲染到了
BW_VIEW=onboard|settings ./target/debug/bw-dev   # 顶层屏深链
cargo run -p bw-engine --example pty_smoke [-- --teardown|-- --abort]  # PTY 地基烟测(不碰 claude/网关)
cargo test --workspace                                # 本地含壳;CI 同命令加 --exclude app-shell(ubuntu 无 WebKit/GTK)
# 出包(Windows 安装器,非门禁/非 CI):流程见 packaging/BuildersWorkbench-MVP.iss 头注释,只吃仓内相对路径 + 装过 Workbench(旧名 buddy)的机器
#   cargo build --release -p app-shell                                                    # 出带图标 bw-dev.exe(build.rs 嵌 app.ico)
#   cp target/release/build/webview2-com-sys-*/out/x64/WebView2Loader.dll target/release/  # dll 落稳定路径(hash 子目录不稳)
#   cd packaging && "<InnoSetup>\ISCC.exe" BuildersWorkbench-MVP.iss                       # setup.exe 落 packaging\output\(gitignore)
```

▶跑(干一张活)走交互式 `claude` 在内嵌终端里;需本机 `claude` CLI(`BW_CLAUDE_BIN` 可指定路径)。真跑受 claude 信任对话框与网关状态影响,不作为门禁。`BW_CLAUDE_MAX_BUDGET_USD` 控预算。

## 门禁(每个 commit 前全过,与 CI 一致)

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo check -p app-shell          # Workbench MVP 壳编译过
./scripts/guard-kernel-ui-free.sh
./scripts/guard-no-cross-screen-import.sh   # 屏与屏不互相引用
./scripts/guard-screen-hooks.sh             # 用 hook 的函数必须是组件
./scripts/guard-file-lines.sh               # 单文件 2000 行硬上限(只查 Workbench MVP 三 crate)
./scripts/guard-codegraph-clean.sh           # codegraph.db 不进 feature commit(CI 在 main 发布)
cargo test --workspace
```

本地与 CI：壳的编译 / Clippy 因 ubuntu runner 常缺 WebKit/GTK，**壳相关检查以本机为准**；CI 侧 `cargo test` 会 `--exclude app-shell`。差异以 `.github/workflows/ci.yml` 为准。

行为正确性靠 E2E(深链启动 + `codehub-cli`/`gh`/`git`/`cat .bw/…` 读回 + computer-use)+ `/code-review`;单元测试不是交付物(现存的随 CI 跑、改到顺手维护、不建回归大坝)。**Workbench MVP 本地零数据库——读回用 `codehub-cli`/`gh`/`git`/`cat .bw/…`,不用 `sqlite3`**(那是 V3 的库)。

## 顶层目录导览

```
crates/   bw(MVP 内核:本地零库+仓文件解析+现算推导+Command/Event)
          bw-engine(MVP 底座:交互式 claude+PTY+worktree+git+codehub/github 远端)
          app-shell(MVP 壳:八屏+主题+内核桥+适配模块,bin bw-dev)
standard/  Workbench 推给被管项目的规范正本(include_str! 进 bw):铺底 `templates/` + 系统提示词 `system-prompt/`(SYSTEM.md.tmpl+references)+ 自维护运作剧本 `skills/` 4 份 + 业界 workflow `vendor/`(mattpocock/mohit,给默认 workflow 打包)
docs/01-principles/ 慢变原则正本(01 分层/changes · 02 逆向工作法 · 03 新闻稿/FAQ/飞轮)
docs/      architecture(设计正本)+ guide(产品指南)+ adr + hifi + README(地图)
scripts/   门禁脚本(guard-*)+ codegraph 联调
packaging/  BW 自身出包(Inno Setup 脚本 + 装完说明;ISCC 编译,产物落仓外暂存,不入 CI/门禁)
.bw/       Workbench 自己作为被管项目的资产(PROJECT.md/metrics.toml/issue-policy.toml/…)
```

## Workbench 特有规矩(只写仓里真还在用的)

### 人怎么驾驭(可见物,不是代码)

人、同事、另一只 AI 接手靠四样能看见的东西,不靠读源码。不同人开不同模型,只许写出同一套风格——正本在这些文件里,聊天结论不进仓就不算数。代码和文档都在这些规范下演进。仓外会话里人只走站和验收,改代码与文档是窗口 AI 的事(开场契约见 `.claude/skills/workbench-start`)。

| 可见物 | 在哪 | 用来干什么 |
|---|---|---|
| 用户旅程 / 产品指南 | [`docs/03-guide/`](docs/03-guide/) | 点什么、背后发生什么、手上多了什么;按站把活交给人或 AI |
| 高保真 | [`docs/hifi/`](docs/hifi/) | 界面长什么样 |
| 架构与特性关键设计 | [`docs/architecture.md`](docs/architecture.md) | 模块为什么这样、数据归哪、没建什么;按模块交活 |
| 产品主张 / 飞轮 | [`docs/01-principles/03`](docs/01-principles/03-press-release-faq-flywheel.md) | 目标体验与选型约束；特性 intent 必须对齐 |
| 开发规矩 + 词表 | 本文件 + [`CONTEXT.md`](CONTEXT.md) | 怎么建/跑/测、用哪个词 |

自己作为被管项目跟被管仓同一套落点:`.bw/` 走规范铺底;`AGENTS.md` 走 project-handbook;`CONTEXT` / adr / spec 走 `mattpocock-skills`;旅程 / 高保真 / 架构是产品自己的可见物,业界 workflow 不会代写。资产盘点盘这些齐不齐,它本身不产规范。

### 四铁律(产品行为不可违反约束)

| 铁律(人话) | 怎么守 |
|---|---|
| 杀进程重开,所有数字能重算出来、前后一致 | 现算推导;E2E 重启后读回一致 |
| 信号只能从数据推导;没数据就是 Unknown,不是绿 | `Derived<Signal>` 密封、store 无 `set_signal`;现算唯一写入者 |
| 「完成」永远由人点;同一件活绝不重复记账 | 状态机 `can_transition_to` 守卫、Done 入边仅 InReview;`settled_at` settle-once |
| 定时任务真实到点触发;自动建的活绝不被自动推进到完成 | E2E:到点 tick 后读回新建活,状态正常 |

### 三层模型(怎么给 Workbench 做一个特性)

- **承载 · codehub issue**:issue+标签=唯一正本,本地零数据库;状态走标签、工作产物走 MR。
- **规范 · 系统提示词 + 渐进加载**(主提示词外置 `standard/system-prompt/SYSTEM.md.tmpl` + `references/` 阶段规范,运行时渲染注入;设计见 [`docs/architecture.md`](docs/architecture.md) 的「系统提示词与渐进加载」模块):不论哪个 workflow 都兜住 Workbench 统一要求。
- **方法论 · skill / workflow**(此层含**运作剧本**——Workbench 自发动作,非方法论——在 `skills/`;**业界 workflow**——方法论来源——在 `vendor/`,build 默认 `mattpocock-skills` 可换):怎么做能做得更好。

改一个特性前,先对齐 [`docs/01-principles/03`](docs/01-principles/03-press-release-faq-flywheel.md) 飞轮检验,再按「特性起手路径」写 `docs/05-features/`(见上);工程落点在 [`docs/architecture.md`](docs/architecture.md) 的模块设计上定位:旅程哪一站 → 三层里改哪层 → 数据归哪 → 模块落点。找不到先补文档、再动代码——不清晰不写代码。

### codehub issue 标签词表

`bw:status:{todo|inprogress|inreview|blocked}`(closed=Done,不打)、`bw:week:YYYY-Www`(周版本)/`bw:plan:<name>`(人起名的版本——与周版本是同一槽位,一张活只挂一个)、`bw:released:vX`(发版号,另一件事)、`bw:category:{prototype|build|optimize|growth|ops}`。**不打**:`kind`(从标题推断)、`tool`/`workflow`(走 `.bw/issue-policy.toml` 映射)。仓改动两类:issue 数据(状态/排期/版本/类别)→ codehub 标签 Workbench 直接改;仓文件产物(名片/配置/规范件)→ worktree + MR,幂等键=固定枚举标题。详见 `standard/templates/issue-policy.toml.tmpl`。

### 写作纪律(给人看的东西先让人看得懂)

1. 汇报用人话:做了什么、结果如何、下一步。代号第一次出现带一句人话。
2. 实现术语留在代码(settle-once / derive-only 这类只进代码注释与对照表,写给人的正文说人话)。
3. 用词以 [`CONTEXT.md`](CONTEXT.md) 词表为准;新造词先进词表。
4. 代号先登记再用(开新代号系列前,先确认旧系列没撞;登记处随用随建进 `docs/02-adr/` 或 `CONTEXT.md`)。
5. 每篇新文档开头给 30 秒导读;过时不删但顶部加历史横幅。
6. **不为向后兼容留旧路径**:发现过时实现直接移除,不加兼容层/回退/迁移。

### commit 约定

每件独立 commit、在分支上、**不 push**(用户要 push 时另开 bundle)。标题让人不查文档也看懂做了什么(可带代号前缀,但须人话描述)。信息如实描述取舍,不吹;偏差如实记进 commit message 与 `CHANGELOG.md`。

## CodeGraph 导航(可选用)

仓共享 codegraph 在 `.codegraph/codegraph.db`。`codegraph` CLI 可用时,先于广 grep 用:
`codegraph explore "<问题或符号>"` 一次拿架构/流程/落点;`codegraph node/callers/callees/impact <symbol>` 跟进。改源码后跑 `codegraph sync`。`.codegraph/codegraph.db` 不进 feature commit(CI 是唯一发布者)。

## 不要做的

- V3 已删(见 `v3` 分支),别拿 V3 crate 当 MVP 事实源去 grep/读(会误导)。
- 不为「兼容旧半修」留双路径;不扩 scope(留白如实标"未建")。
- **先审已有代码、已有提示词、已有方案对不对;不对就改那一份。** 不要冲上来新增代码、新增提示词、新增方案或特殊通道——那些都会把产品胀大。
- 不在入口层写业务和存储;命令与门禁以本文件与 CI 为准——根 `README.md` 是产品介绍与快速开始,不是开发命令正本。
- 未锁定决策先走 grill/domain-modeling,不凭猜改设计;改动前 `CHANGELOG.md` 记一行。
