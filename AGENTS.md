# AGENTS.md — Workbench 开发约定

> **本篇维护约定**
> - **读者与时机**：在本仓工作的模型与开发者；开始任务、修改文档、提交和开 PR 前读取。
> - **职责与边界**：只写任务读取路径、开发硬约束、建跑测命令、文档维护与交付规则；不承载产品介绍、模块设计正文或变更流水。
> - **结构**：按任务读取 → 文档维护 → 项目硬约束 → 构建验证 → 修改交付 → CodeGraph。
> - **更新触发**：开发约定、命令、权限边界或读取路径变化时更新。本篇是唯一开发规矩正本，`CLAUDE.md` 只导入它；整仓分层服从 [原则 01](docs/01-principles/01-document-organization.md)。修改本篇须评审。

## 按任务读取

本仓开发 Builders' Workbench（Workbench / BW）：Rust 桌面工作台，内核 `crates/bw`、底座 `crates/bw-engine`、壳 `crates/app-shell`。给人介绍产品从 [README.md](README.md) 开始，完整文档地图在 [docs/README.md](docs/README.md)。

**[docs/01-principles/](docs/01-principles/README.md) 是最慢变的原则正本**，不得用草稿实现或聊天结论推翻。按任务读取对应资料，不把所有正文堆进入口：

| 任务 | 读取路径与动作 |
|---|---|
| 仓外 IDE 新会话 | 本篇 → [workbench-start](.claude/skills/workbench-start/SKILL.md)，按意图与影响分流开发、验证和交付；相关设计读 [architecture](docs/architecture.md)、术语读 [CONTEXT](CONTEXT.md)。Workbench 发起的项目执行会话读产品传入提示与被管项目的 AGENTS，不自动叠加本仓起手 Skill |
| 特性级变更 | 对齐 [03 产品主张与飞轮](docs/01-principles/03-press-release-faq-flywheel.md) → 按 [02 逆向工作法](docs/01-principles/02-working-backwards.md) 开/改 `docs/05-features/<id>/intent.md` 与带原型链接的 `spec.md`；二者由人确认，`plan.md` 仅大风险升 gate |
| 小 bug、文案、无新增用户价值的整理 | 读现有正本，直接修、验证、commit/PR 留痕；不开特性制品链，粒度听 [01](docs/01-principles/01-document-organization.md) |
| 改客群、飞轮或对外主张 | 先议再改 03；特性 intent 不得偷偷改写产品主张，不把草稿界面说成已交付 |
| 改代码或现行设计 | 在 [architecture](docs/architecture.md) 定位用例哪一站 → §2 能力 → §3 crate 与数据流；模块取舍读 [06-module](docs/06-module/README.md)。影响使用方式或界面时同步 [指南](docs/03-guide/) 与 [设计系统](docs/04-design-system/README.md)/[高保真](docs/hifi/) |
| 改文档 | 先读下节维护流程 → 原则 01 → 目标文件原文头部约定与相关正本；用 [docs 地图](docs/README.md) 找去处。盘点、瘦身、职责/格式治理与模型指令整改使用 [project-knowledge](.claude/skills/project-knowledge/SKILL.md)，包含 HTML 决策、只读扫描和逐轮反哺；普通开发的必要文档同步不启动全库盘点 |
| 改 `standard/` | 先读 [standard/README](standard/README.md) 与 [系统提示词与渐进加载](docs/06-module/系统提示词与渐进加载.md)的维护对照；写 Skill 再读 [SKILL-MD-SPEC](standard/skills/SKILL-MD-SPEC.md)。本仓知识库不等于给被管项目分发的规范 |

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
| 信号只能从数据推导；没数据就是 Unknown，不是绿 | `Derived<Signal>` 密封，store 无 `set_signal`；现算是唯一写入者 |
| 完成永远由人确认，同一工作不重复记录完成结果 | `can_transition_to` 守卫；人可从待办/进行中/待评审/阻塞/未排期操作完成，有开放 MR 先合入，否则关闭 Issue；自动化、agent、定时不得推到 Done；`settled_at` 只记录一次 |
| 定时任务真实到点触发；自动创建的 Issue 不自动完成 | 调度在 Orca，到点开会话，不能替人确认 Done |

- Issue 与标签是工作状态的正本；仓文件产物通过分支和 PR/MR 评审。标签协议、状态机和各写入者边界读 [issue-state](standard/system-prompt/references/issue-state.md)，不要另造一套。不打 `kind` / `tool` / `workflow` 标签：种类从标题推导，工具跟随本机设置，工作流按类别或周期工作标题选择；不再新写 `bw:week:*`。
- Workbench MVP 本地零业务数据库。用 `gh` / `codehub-cli` / `git` / 文件独立读回；不用 V3 的 `sqlite3` 路径。项目约定和指标资产的归属读 [architecture](docs/architecture.md)，不能将资产盘点变成代写项目开发规范。
- 入口层不写业务和存储；`bw-engine` 遵守 `#![forbid(unsafe_code)]`。
- 先审已有代码、提示词和方案，不对就改原件；不新增平行实现、平行规范或特殊通道。不为过时实现留兼容层、回退或双路径；不扩 scope，未建如实标未建。
- V3 已删除，不能用 V3 crate 解释 MVP；历史在 `v3` 分支，必要时看 [旧模块挪移记录](docs/10-reference/v3-and-module-migration.md)。

## 构建、运行与验证

Rust 1.82+，Cargo workspace；桌面壳使用 Dioxus 0.7 / wry，macOS 使用系统 WebKit，Windows 使用 WebView2。

```bash
cargo check -p bw -p bw-engine
cargo run -p app-shell
cargo run -p bw-engine --example pty_smoke
# PTY 烟测也支持：-- --teardown 或 -- --abort
cargo test --workspace
```

壳二进制名 `bw-dev`。深链环境变量：`BW_OPEN=<项目名>` 搭配 `BW_PANEL=overview|plan|session|config|kb`；顶层屏用 `BW_VIEW=onboard|settings`，帮助小窗用 `BW_HELP=home|guide|report`。设置后启动壳，stderr 的 `[BW_OPEN]` 用于核对实际渲染。PowerShell 示例：

```powershell
$env:BW_OPEN = '<项目名>'
$env:BW_PANEL = 'plan'
.\target\debug\bw-dev.exe
```

Windows 出包/验包入口是 `.bw/release/pack/pack.cmd` 与 `.bw/release/e2e/e2e.cmd`，均传 `--version <号> --workdir <仓根绝对路径>`；协议见 [ADR 0005](docs/02-adr/0005-发版出包与E2E协议.md)。正源为 `.bw/release/pack/*.iss`，产物 `.bw/release/out/<号>/` 不进仓；出包不是日常门禁。

桌面开工走会话屏 Orca / Open Design，工具按本机设置选择；路径与失败处理见 [会话与执行](docs/06-module/会话与执行.md)。真实执行依赖工具、会话宿主、信任对话框及网关；PTY 烟测只证明底座，不证明桌面开工成功。

### 提交前门禁

每个 commit 前全过；Windows 的 shell 守卫用 Git Bash 执行。

Windows 交付验证入口：`node .bw/release/verify/verify.mjs --profile pr`，执行下面的门禁（壳 `build` 包含 `check`）及已注册固定 E2E，产出 `.bw/release/out/verify/<run-id>/report.html`、`result.json`、`review.md` 与证据清单。命令、报告格式、专项用例接入及 CI 结果位置见 [交付验证入口](.bw/release/verify/README.md)。开发特性的会话负责补对应专项用例并发 PR；通用入口不代替特性验收、代码 Review 和人的合入决定。

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo check -p app-shell
./scripts/guard-kernel-ui-free.sh
./scripts/guard-remote-isolation.sh
./scripts/guard-no-cross-screen-import.sh
./scripts/guard-screen-hooks.sh
./scripts/guard-file-lines.sh
./scripts/guard-codegraph-clean.sh
cargo test --workspace
```

本地与 CI：Ubuntu 的 headless 检查排除 app-shell；Windows CI 执行完整门禁、构建壳与固定桌面 E2E。两者复用 `.bw/release/verify/plan.json`，差异以 [.github/workflows/ci.yml](.github/workflows/ci.yml) 为准。PR 检查的固定结果入口是 Checks 对应任务的 Summary，完整报告和证据在该次 Actions Artifacts；独立验证 Review 仍遵循下面的截图要求。

行为正确性仍靠真实 E2E（深链、远端/Git/文件读回与界面核对）及 code review；已有单测随改维护，不把新增回归大坝当交付物。

## 修改与交付

### 写作

- 汇报说明做了什么、结果、下一步；代号首次出现附人话。UI 写对象、动作、结果，必要时补失败原因和下一步，不展示内部协议与实现历史。
- 术语以 [CONTEXT](CONTEXT.md) 为准；新领域词先登记，代号先查重再登记到词表或 ADR。普通词按通常含义使用，不另造隐喻；文案调整不等于改协议值。
- 注释只写代码无法表达的约束、原因、单位、协议及边界，不复述控制流或历史；实现术语留在代码与技术对照中。
- 新文档用头部给出 30 秒导读与维护约定；工具导入、上游镜像或生成文件遵守对应格式，不机械塞入头部。具体例外听原则 01。

### commit 与 PR

每件独立提交、在分支和独立工作树上。**默认继续交付 PR**：完成门禁、对应 E2E 和自检后，提交、push、开 PR 并补验证 Review；人明确说「只本地」时才停止在本地。不自动合入 PR、关闭 Issue 或正式发版本，除非人已明确授权该动作。标题应让人不查文档也懂改了什么，正文如实说明原因、取舍与偏差；变化与证据写进 commit/PR，当前知识写回正本。

PR 展示实际改动、知识去向、验证结果和未验证项；文档改动按上节给出内容去向与头部变化。稳定规则写回正本，不把提交流水重新养成一份常驻文档。

界面/行为改动开 PR 时另发 review 验证报告：验什么、命令与深链、门禁结果、未验留白；本次改动新增或修改的判据内嵌真壳截图四件套（用例名、执行路径、期望结果、截图），未变旅程的证据指向验证报告与证据目录，不逐条铺进 PR。不动 E2E 用例的修复以同格式贴临时验证。截图推永不合入的 `shots/<分支名>`，内嵌用 `https://github.com/<owner>/<repo>/raw/<commit SHA>/x.jpg`，钉 SHA；不使用 `raw.githubusercontent` 或带斜杠分支名的图片地址。大改的改前/改后对照仍按约定进 `docs/05-features/<id>/shots/`。纯文档改动报告文档检查，不伪造界面验证。

原型网页不进仓，发布为 artifact 或永不合入的分支，spec / STATUS 只留链接，见 [02 §3.2](docs/01-principles/02-working-backwards.md)。

## CodeGraph 导航（可选）

共享图在 `.codegraph/codegraph.db`。CLI 可用时，广搜前先 `codegraph explore "<问题或符号>"`，再用 `codegraph node/callers/callees/impact <symbol>` 跟进。改源码后跑 `codegraph sync`；数据库不进 feature commit，由 CI 在 main 发布。
