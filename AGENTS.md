# AGENTS.md — Workbench 开发约定

> **本篇维护约定**
> - **读者与时机**：在本仓工作的模型与开发者；开始任务、修改文档、提交和开 PR 前读取。
> - **职责与边界**：只写任务读取路径、开发硬约束、建跑测命令、文档维护与交付规则；不承载产品介绍、模块设计正文或变更流水。
> - **结构**：按任务读取 → 文档维护 → 项目硬约束 → 构建验证 → 修改交付 → CodeGraph。
> - **更新触发**：开发约定、命令、权限边界或读取路径变化时更新。本篇是唯一开发规矩正本，`CLAUDE.md` 只导入它；整仓分层服从 [原则 01](docs/01-principles/01-document-organization.md)。修改本篇须评审。

## 按任务读取

本仓开发 Builders' Workbench（Workbench / BW）。**`bw-orca` 分支**是 Orca Electron 执行核上的产品叠层，不是 Rust 三 crate 桌面；叠层 `src/renderer/src/workbench/`，规范 `standard/`。相对 upstream 删了什么、从 `main` 合入了什么、以及遗留项读 [ref/upstream.md](ref/upstream.md)。给人介绍产品从 [README.md](README.md) 开始，完整文档地图在 [docs/README.md](docs/README.md)。

**[docs/01-principles/](docs/01-principles/README.md) 是最慢变的原则正本**，不得用草稿实现或聊天结论推翻。按任务读取对应资料，不把所有正文堆进入口：

| 任务 | 读取路径与动作 |
|---|---|
| `bw-orca` 叠层 / 与 Orca、main 的差异 | 读 [ref/upstream.md](ref/upstream.md)。Orca Mobile 产品已删；`standard/` 已从 `main` 合入。叠层 UI 在 `src/renderer/src/workbench/` |
| 仓外 IDE 新会话 | 本篇 → [workbench-start](.claude/skills/workbench-start/SKILL.md)，按意图与影响分流开发、验证和交付；相关设计读 [architecture](docs/architecture.md)、术语读 [CONTEXT](CONTEXT.md)。Workbench 发起的项目执行会话读产品传入提示与被管项目的 AGENTS，不自动叠加本仓起手 Skill |
| 特性级变更 | 对齐 [03 产品主张与飞轮](docs/01-principles/03-press-release-faq-flywheel.md) → 按 [02 逆向工作法](docs/01-principles/02-working-backwards.md) 开/改 `docs/05-features/<id>/intent.md` 与带原型链接的 `spec.md`；二者由人确认，`plan.md` 仅大风险升 gate。交付按 02 §6.2 六环链，新工作先过 §6.3 带入三问；迁移在 Orca 上重新决策，按实际改动补链 |
| 小 bug、文案、无新增用户价值的整理 | 先确认所属特性与已有行为依据；依据齐备则直接修、验证、commit/PR 留痕，不为小修新立特性。所属独立特性的必要文档缺失时，按 [02 §6.3](docs/01-principles/02-working-backwards.md) 补齐本次定义并完成缺失决定的人确认，再改依赖这些决定的代码；粒度听 [01](docs/01-principles/01-document-organization.md) |
| 改客群、飞轮或对外主张 | 先议再改 03；特性 intent 不得偷偷改写产品主张，不把草稿界面说成已交付 |
| 改代码或现行设计 | 在 [architecture](docs/architecture.md) 定位用例哪一站 → §2 能力 → §3 Electron 叠层与数据流；模块取舍读 [06-module](docs/06-module/README.md)。影响使用方式或界面时同步相应特性资料；指南待旅程验证后补。视觉协同读 [设计系统](docs/04-design-system/README.md)/[高保真](docs/hifi/)，按文件归属与对应负责人协调 |
| 改文档 | 先读下节维护流程 → 原则 01 → 目标文件原文头部约定与相关正本；用 [docs 地图](docs/README.md) 找去处。盘点、瘦身、职责/格式治理与模型指令整改使用 [project-knowledge](.claude/skills/project-knowledge/SKILL.md)，包含 HTML 决策、只读扫描和逐轮反哺；普通开发的必要文档同步不启动全库盘点 |
| 改 `standard/` | 先读 [standard/README](standard/README.md) 与 [系统提示词与渐进加载](docs/06-module/系统提示词与渐进加载.md)的维护对照；写 Skill 再读 [SKILL-MD-SPEC](standard/skills/SKILL-MD-SPEC.md)。本仓知识库不等于给被管项目分发的规范。合入记录见 [ref/upstream.md](ref/upstream.md) |

Superpowers / grill-me 可用于发散、质询和计划草稿，特性产出仍须落回 `docs/05-features/<id>/`。找不到设计落点先澄清并补正本，再写代码；未锁定决策先走 grill/domain-modeling。跨会话以仓内正本及可追溯的 commit/PR 为据，不凭上次聊天改代码。

两份 Skill 是任何使用者均可采用的仓内试用方法；项目规则仍以本篇和原则为准。仓内采用不等于已分发到 `standard/`，方法按真实任务反馈维护。

## 文档怎么读、怎么维护

1. **先读头部，再读正文与相关正本。** 头部说明本篇给谁看、什么时候读、可以写什么、不写什么、正文结构与更新触发。读 Markdown 原文，包括 README 顶部的维护注释；不要只看渲染页。`CLAUDE.md` 是一行导入的特例。
2. **新增、迁入或补回内容，先判断是否在目标头部范围内。** 在范围内才改正文；不在范围内先找已有的合适正本。确需扩展这篇职责时，先向人说明“头部哪条要改、为什么、与其他文档的边界如何变化”，**经人确认后才能改头部并加入内容**。不得为了塞进内容偷偷放宽头部；已经明确批准的范围无需重复确认。
3. **旧篇缺约定不等于无限制。** 先用原则、索引与原文导读确认其既有职责；边界明确时补头部，职责不明或要承担新职责时先问人。新篇先确认必要性与边界，不为安放一段内容就新建文档。头部不得推翻上层原则和产品硬约束。
4. **无价值、重复、过时或讲不清且不再需要的内容可以直接删。** 不为保留而复制到归档。仍有价值但放错位置的内容迁到已有正本；迁入也执行第 2 条。必要迁移、原处删除、入口和读取方调整放在同一 PR，不把缺口留给“后续再补”。需要保留的历史必须标清历史身份，不能继续充当现行操作要求。
5. **验证这次变动影响到的路径。** 查入链、章节引用、示例和实际读取方；确认模型从 AGENTS 的任务路径能找到相关规范并读到正文。文件存在、索引可达、实际加载与模型遵守是不同证据，不能把静态检查说成行为验证；日常修改不默认全库审计。
6. **各归其位，便于人审。** 当前知识写入对应正本；改了什么、为什么、实际验证和未验证项写进 commit/PR。PR 明列头部边界变化及人的授权、内容保留/迁移/删除去向。历史从 Git 找回；即使找回旧内容，仍须先过第 2 条。

共用分层与头部要素见 [原则 01](docs/01-principles/01-document-organization.md)；每篇具体范围与格式以其头部为准。本节管操作顺序，不再维护一份各篇规范副本。

## 项目硬约束

### 四铁律

| 约束 | 如何守住 |
|---|---|
| 杀进程重开，所有数字能重新计算、前后一致 | 现算推导；用真实 E2E 重启后独立读回核对 |
| 信号只能从数据推导；没数据就是 Unknown，不是绿 | 健康信号只能从读数推导；store 不提供手设绿灯；没数据就显示未知 |
| 完成永远由人确认，同一工作不重复记录完成结果 | 人可从待办/进行中/待评审/阻塞/未排期操作完成，有开放 MR 先合入，否则关闭 Issue；自动化、agent、定时不得推到 Done |
| 定时任务真实到点触发；自动创建的 Issue 不自动完成 | 调度在 Orca，到点开会话，不能替人确认 Done |

- Issue 与标签是工作状态的正本；仓文件产物通过分支和 PR/MR 评审。标签协议、状态机和各写入者边界读 [issue-state](standard/system-prompt/references/issue-state.md)，不要另造一套。不打 `kind` / `tool` / `workflow` 标签：种类从标题推导，工具跟随本机设置，工作流按类别或周期工作标题选择；不再新写 `bw:week:*`。
- Workbench MVP 本地零业务数据库。用 `gh` / `codehub-cli` / `git` / 文件独立读回；不用 V3 的 `sqlite3` 路径。项目约定和指标资产的归属读 [architecture](docs/architecture.md)，不能将资产盘点变成代写项目开发规范。
- 入口层不写业务正本；计划 JSON 与 Issue 标签是各自的事实源。
- 先查清 Orca 已有代码、提示词和真实调用链，核对能力归属、宿主路由、权限及扩展点，再比较复用与最小适配；不把尚未摸清能力当成产品限制，不另造平行实现、平行规范或特殊通道。具体边界读 [architecture](docs/architecture.md) 与 [upstream](ref/upstream.md)。
- 方案纠正或重做时，同一交付内清除被替代的尝试代码、错误文档、配置及入口引用，必要的测试随正确行为更新；不为错误方案留兼容层、回退或双路径。现行正本只写有效方案，历史由 Git 追溯，不另建错误尝试台账；不扩 scope，未建如实标未建。
- V3 与旧 Rust 三 crate 已不在本分支；不能用已删除的 `crates/` 解释现行 Electron 壳。历史在 `v3` 分支与旧 main，必要时看 [旧模块挪移记录](docs/10-reference/v3-and-module-migration.md)。

## 构建、运行与验证

Node.js + pnpm；桌面壳是 Electron（Orca 叠层），macOS / Windows。叠层热加载与真壳验证入口：

```bash
pnpm run dev:workbench
pnpm test
pnpm run lint
pnpm run typecheck
```

`dev:workbench` 已设置 `WORKBENCH_SHELL=1`、`VITE_WORKBENCH_SHELL=1`、`ORCA_PRODUCT_NAME=Workbench`，使用独立 profile `workbench-dev`。Agent 自动化可加 `ORCA_BACKGROUND_LAUNCH=1` 与 `REMOTE_DEBUGGING_PORT=9337`。打试用包见 [`SYNC.md`](src/renderer/src/workbench/SYNC.md) 的 `pnpm run build:mac:workbench`。

旧 Dioxus 壳的 `cargo run -p app-shell`、`bw-dev` 深链与 `.bw/release/pack` 出包协议针对已删除的三 crate，不能用来解释本分支。现有 Electron 构建入口以 SYNC 和 package.json 为准；BW 的 CI/CD、评审与正式出包链随迁移任务验证，不能据此宣称已完成 v0.5 交付。

计划/验收工作流入口（已登记自动化；数据文件问题作为一次性上下文随手动运行递交，不单独渲染）与「配置指标」携带 SYSTEM + 对应 Skill 指针；普通原生新建会话不额外注入 BW 提示（`version-cycle/cycle-prompt.ts`，正源 `standard/`）；真实执行依赖本机设置的会话工具、固定工作树及仓库权限。路径与失败处理见 [会话与执行](docs/06-module/会话与执行.md)。

### 提交前门禁

每个 commit 前过 husky `lint-staged`（oxlint / oxfmt）。改叠层或注入逻辑时再跑受影响的 Vitest，例如：

```bash
pnpm exec vitest run --config config/vitest.config.ts src/renderer/src/workbench/version-cycle/cycle-prompt.test.ts
```

PR 检查以 [`.github/workflows/pr.yml`](.github/workflows/pr.yml) 为准。行为正确性仍靠真壳（计划/验收两屏、会话注入、远端/Git/文件读回）及 code review；已有单测随改维护，不把新增回归大坝当交付物；新增单测按 [02 环 4](docs/01-principles/02-working-backwards.md) 测试用例规范只立两类看护——核心算法函数、与 E2E 强相关的数据协议（单特性新增默认 ≤10 例），UI/文案/装配不新增；验收点与旅程 E2E 特性初期控量，稳定后专项回补。

## 修改与交付

### 写作

- 汇报说明做了什么、结果、下一步；代号首次出现附人话。UI 写对象、动作、结果，必要时补失败原因和下一步，不展示内部协议与实现历史。
- 术语以 [CONTEXT](CONTEXT.md) 为准；新领域词先登记，代号先查重再登记到词表或 ADR。普通词按通常含义使用，不另造隐喻；文案调整不等于改协议值。
- 注释只写代码无法表达的约束、原因、单位、协议及边界，不复述控制流或历史；实现术语留在代码与技术对照中。
- 新文档用头部给出 30 秒导读与维护约定；工具导入、上游镜像或生成文件遵守对应格式，不机械塞入头部。具体例外听原则 01。

### commit 与 PR

每件独立提交、在分支和独立工作树上。**默认继续交付 PR**：完成门禁、对应 E2E 和推前 subagent 全方位检视（四维与 TODO 步骤见 [02 §6.2 横切站 B](docs/01-principles/02-working-backwards.md)）后，提交、push、开 PR 并补验证 Review；人明确说「只本地」时才停止在本地。不自动合入 PR、关闭 Issue 或正式发版本，除非人已明确授权该动作。标题应让人不查文档也懂改了什么，正文如实说明原因、取舍与偏差；变化与证据写进 commit/PR，当前知识写回正本。

PR 展示实际改动、知识去向、验证结果和未验证项；文档改动按上节给出内容去向与头部变化。稳定规则写回正本，不把提交流水重新养成一份常驻文档。

界面/行为改动开 PR 时另发 review 验证报告：验什么、命令与深链、门禁结果、未验留白；本次改动新增或修改的判据内嵌真壳截图四件套（用例名、执行路径、期望结果、截图），未变旅程的证据指向验证报告与证据目录，不逐条铺进 PR。不动 E2E 用例的修复以同格式贴临时验证。截图推永不合入的 `shots/<分支名>`，内嵌用 `https://github.com/<owner>/<repo>/raw/<commit SHA>/x.jpg`，钉 SHA；不使用 `raw.githubusercontent` 或带斜杠分支名的图片地址。大改的改前/改后对照仍按约定进 `docs/05-features/<id>/shots/`。纯文档改动报告文档检查，不伪造界面验证。

特性原型放在所属特性目录，各屏可有独立 HTML 入口与可编辑源码；共用资源只保留一份并用相对路径引用，共用整份原型时才用索引文件。spec / STATUS 标清来源与设计、历史身份，不以原型证明能力已交付，见 [02 §3.2](docs/01-principles/02-working-backwards.md)。

## CodeGraph 导航（可选）

共享图在 `.codegraph/codegraph.db`。CLI 可用时，广搜前先 `codegraph explore "<问题或符号>"`，再用 `codegraph node/callers/callees/impact <symbol>` 跟进。改源码后跑 `codegraph sync`；数据库不进 feature commit，由 CI 在 main 发布。
