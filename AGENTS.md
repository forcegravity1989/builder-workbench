# CodeGraph-first repository navigation

This repository shares its code graph at `.codegraph/codegraph.db`. When the
`codegraph` CLI is available, use it before broad grep/find or opening many
files:

- `codegraph explore "<question or symbol names>"` for architecture, flows, and
  locating the relevant implementation in one call.
- `codegraph node <symbol>`, `codegraph callers <symbol>`,
  `codegraph callees <symbol>`, and `codegraph impact <symbol>` for focused
  follow-up queries.
- Treat source returned by `codegraph explore` or `codegraph node` as already
  read; do not reopen the same file unless additional lines are needed.

Run `codegraph sync` after changing source code so local queries stay current.
Do not add `.codegraph/codegraph.db` to feature commits: pull-request CI verifies
the graph, and the CodeGraph workflow is the single writer that publishes the
shared snapshot after `main` passes CI. Runtime files such as WAL/SHM files,
logs, sockets, and PID files stay machine-local.

Repository-specific product, architecture, verification, and writing rules
remain in `CLAUDE.md` and apply alongside this file. Start at `README.md` for
what the repo is and how to run it; `docs/README.md` is the map of every doc
tree (active docs, runtime assets baked in via `include_str!`, the partner's
`docs/v1~v3-prototype/` iteration line, and `docs/archive/`).

## buddy 开发规范（给每个开发 AI，不乱改）

V4 的数据层（2026-08-22 重定调，正本见 `docs/v4-prototype/design.md` §3）：**codehub/GitHub 的 issue + 标签 = 唯一 issue 正本；本地零数据库**（只剩运行时：`session.jsonl`、本机设置，落在 `asset_root` 下）。

**改一个特性前，先在 `docs/v4-prototype/design.md` 的特性规划图（§特性规划图）上定位**：旅程站 → 三层 → 数据归属 → 模块落点。找不到就**先补文档、再动代码**——不清晰不写代码。

**三层模型**（「怎么给 buddy 做一个特性」）：
- **承载 · codehub issue**：把这件事装进来。issue 状态走标签、工作产物走 MR。
- **规范 · 系统提示词 + 渐进加载规范**（`docs/buddy/system-prompt.md` + `docs/buddy/standards/`，`include_str!` 进二进制）：这个运作活 buddy 要求的规范是什么。改 buddy 规范 = 改这套，随 buddy 演进。
- **方法论 · skill**（`standard/skills/<名>/SKILL.md`，自带、不进用户仓、未来拔插）：怎么做能做得更好。改方法论 = 改 skill。

**仓改动两类，无特殊**：
- A 类 · issue 数据（状态/排期/版本）→ codehub 标签，buddy 直接改。
- B 类 · 仓文件产物（名片/配置/规范件/AGENTS.md 草稿）→ worktree + MR，**幂等键 = 固定枚举标题**（精确匹配、不加变体后缀，buddy 查「标题==这个枚举的 open issue」→ 有则复用 worktree 追加提交、没则新建），不重复建。
- 要加「buddy 直写 main」的特殊，先答「为什么不走 MR」——答不上不加。

**codehub issue 标签词表**：`bw:status:{todo|inprogress|inreview|blocked}`（closed=Done，不打）、`bw:week:YYYY-Www`、`bw:released:vX`。**不打**：`kind`（从 workflow 推断）、`tool`/`workflow`（走 `.bw/issue-policy.toml` 映射）、B 类复用键（走固定枚举标题、不占标签）。buddy 结构化产出挂 **issue 评论**、不动正文。B 类 issue 标题一律固定枚举字符串（如「编辑项目名片」），变体内容进评论/正文，不拼进标题。

**门禁**（每件 commit 前全过，见 `CLAUDE.md`）：`cargo fmt --all --check`、`cargo clippy --workspace --exclude app-desktop -- -D warnings`、三个 guard 脚本、`cargo check -p bw-core --target wasm32-unknown-unknown --no-default-features`、`cargo test --workspace --exclude app-desktop`。每件独立 commit、在分支上、标题带人话。
