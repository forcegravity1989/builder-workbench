# AGENTS.md — buddy 开发手册

> 这是 buddy(loop-buddy / Builders' Workbench)仓库的**唯一开发规矩正本**。`CLAUDE.md` 只是一行导入它。给所有驱动 AI(Claude Code / Cursor / Codex)和接手的人看。改这份 = 改开发规矩,过评审再合。

## 这是什么

单人构建者的 Rust 原生桌面工作台(Dioxus 0.7 / wry WebView,macOS + Windows)。产品命题见 [`README.md`](README.md);设计正本见 [`docs/architecture.md`](docs/architecture.md)([`DESIGN.md`](DESIGN.md) 指路);领域词表见 [`CONTEXT.md`](CONTEXT.md)。三个名字一件东西:仓库真名 **loop-buddy**、产品名 **Builders' Workbench(BW)**、产品里 AI 队友自称 **buddy**。

> **V3 已删**:本仓产品线是 buddy MVP(内核 `crates/bw-v4` + 底座 `crates/v4-engine` + 壳 `crates/app-shell`)。V3 的六 crate 与 V3 编译资产已于 2026-08-24 删除——全量在 `v3` 分支找回。别再提 V3 概念,设计看 [`docs/architecture.md`](docs/architecture.md)。

## 语言和构建

Rust 1.82+,cargo workspace。桌面壳另需 Dioxus 0.7 的系统依赖(macOS 自带 WebKit,Windows 用 WebView2)。`#![forbid(unsafe_code)]` 是 `v4-engine` 的规矩。跨会话只认本仓的 `AGENTS.md` + `CONTEXT.md` + `docs/` + `CHANGELOG.md` + `DESIGN.md`,不凭上一会话口头结论改代码。

## 怎么建 / 怎么跑 / 怎么测

```bash
cargo check -p bw-v4 -p v4-engine            # 日常最快(内核+底座,不编 Dioxus)
cargo run -p app-shell                      # 启 buddy MVP 桌面壳(bin 名 bw-v4-dev)
BW_OPEN=<项目名> BW_PANEL=overview|plan|session|notify|config|kb ./target/debug/bw-v4-dev
                                            # 深链直达屏;stderr [BW_OPEN]=真的渲染到了
BW_VIEW=onboard|settings ./target/debug/bw-v4-dev   # 顶层屏深链
cargo run -p v4-engine --example pty_smoke [-- --teardown|-- --abort]  # PTY 地基烟测(不碰 claude/网关)
cargo test --workspace                                # CI 也跑:现存内联测试必须过
```

▶跑(干一张活)走交互式 `claude` 在内嵌终端里;需本机 `claude` CLI(`BW_CLAUDE_BIN` 可指定路径)。真跑受 claude 信任对话框与网关状态影响,不作为门禁。`BW_CLAUDE_MAX_BUDGET_USD` 控预算。

## 门禁(每个 commit 前全过,与 CI 一致)

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo check -p app-shell          # buddy MVP 壳编译过
./scripts/guard-kernel-ui-free.sh
./scripts/guard-no-cross-screen-import.sh   # 屏与屏不互相引用
./scripts/guard-screen-hooks.sh             # 用 hook 的函数必须是组件
./scripts/guard-file-lines.sh               # 单文件 1500 行硬上限(只查 buddy MVP 三 crate)
cargo test --workspace
```

行为正确性靠 E2E(深链启动 + `codehub-cli`/`gh`/`git`/`cat .bw/…` 读回 + computer-use)+ `/code-review`;单元测试不是交付物(现存的随 CI 跑、改到顺手维护、不建回归大坝)。**buddy MVP 本地零数据库——读回用 `codehub-cli`/`gh`/`git`/`cat .bw/…`,不用 `sqlite3`**(那是 V3 的库)。

## 顶层目录导览

```
crates/   bw-v4(MVP 内核:本地零库+仓文件解析+现算推导+Command/Event)
          v4-engine(MVP 底座:交互式 claude+PTY+worktree+git+codehub/github 远端)
          app-shell(MVP 壳:九屏+主题+内核桥+适配模块,bin bw-v4-dev)
standard/  buddy 推给被管项目的规范正本(include_str! 进 bw-v4):模板 + 自维护 skill(`skills/` 10 份)+ 业界 skill(`vendor/` mattpocock/superpowers/mohit,给默认 workflow 打包)
docs/      architecture(设计正本)+ guide(产品指南)+ adr + hifi + README(地图)
scripts/   门禁脚本(guard-*)+ codegraph 联调
.bw/       buddy 自己作为被管项目的资产(PROJECT.md/metrics.toml/issue-policy.toml/…)
```

## buddy 特有规矩(只写仓里真还在用的)

### 四铁律(产品行为不可违反约束)

| 铁律(人话) | 怎么守 |
|---|---|
| 杀进程重开,所有数字能重算出来、前后一致 | 现算推导;E2E 重启后读回一致 |
| 信号只能从数据推导;没数据就是 Unknown,不是绿 | `Derived<Signal>` 密封、store 无 `set_signal`;现算唯一写入者 |
| 「完成」永远由人点;同一件活绝不重复记账 | 状态机 `can_transition_to` 守卫、Done 入边仅 InReview;`settled_at` settle-once |
| 定时任务真实到点触发;自动建的活绝不被自动推进到完成 | E2E:到点 tick 后读回新建活,状态正常 |

### 三层模型(怎么给 buddy 做一个特性)

- **承载 · codehub issue**:issue+标签=唯一正本,本地零数据库;状态走标签、工作产物走 MR。
- **规范 · 系统提示词 + 渐进加载**(三段静态在 `crates/bw-v4/src/app/bootstrap.rs` `agent_system_prompt` 现拼 + 运行时注入剧本;设计见 [`docs/architecture.md`](docs/architecture.md) 的「系统提示词与渐进加载」模块;`standard/skills/` 索引):不论哪个 workflow 都兜住 buddy 统一要求。
- **方法论 · skill / workflow**(`standard/skills/` 自带 10 份;build 默认 workflow 见 issue-policy,可换):怎么做能做得更好。

改一个特性前,先在 [`docs/architecture.md`](docs/architecture.md) 的模块设计上定位:旅程哪一站 → 三层里改哪层 → 数据归哪 → 模块落点。找不到先补文档、再动代码——不清晰不写代码。

### codehub issue 标签词表

`bw:status:{todo|inprogress|inreview|blocked}`(closed=Done,不打)、`bw:week:YYYY-Www`、`bw:released:vX`。**不打**:`kind`(从 workflow 推断)、`tool`/`workflow`(走 `.bw/issue-policy.toml` 映射)。仓改动两类:issue 数据(状态/排期/版本)→ codehub 标签 buddy 直接改;仓文件产物(名片/配置/规范件)→ worktree + MR,幂等键=固定枚举标题。详见 `standard/05-issue-policy/`。

### 写作纪律(给人看的东西先让人看得懂)

1. 汇报用人话:做了什么、结果如何、下一步。代号第一次出现带一句人话。
2. 实现术语留在代码(settle-once / derive-only 这类只进代码注释与对照表,写给人的正文说人话)。
3. 用词以 [`CONTEXT.md`](CONTEXT.md) 词表为准;新造词先进词表。
4. 代号先登记再用(开新代号系列前,先确认旧系列没撞;登记处随用随建进 `docs/adr/` 或 `CONTEXT.md`)。
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
- 不在入口层写业务和存储;不照 README 抄命令(README 常年不更新,以 CI 配置为准)。
- 未锁定决策先走 grill/domain-modeling,不凭猜改设计;改动前 `CHANGELOG.md` 记一行。
