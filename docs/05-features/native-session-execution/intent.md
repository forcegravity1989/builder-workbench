# Intent · 原生会话执行（一体产品，不嵌外部 Orca）

> **30 秒导读**：把「开工 → 看 agent 跑 → 接回 / 停止」收进 Workbench 自己的执行面。不再另开 Electron Orca、不再 iframe 配对页。架构决策见 [ADR-0006](../../02-adr/0006-会话执行内嵌-废弃外部Orca嵌页.md)。可点高保真在永不合入分支 [`proto/native-session-execution`](https://github.com/forcegravity1989/builder-workbench/tree/proto/native-session-execution/docs/05-features/native-session-execution)（钉 [`87a2c561`](https://github.com/forcegravity1989/builder-workbench/blob/87a2c561f55f6407d6b27b560b4b79a3c22a8763/docs/05-features/native-session-execution/prototype-v4.html)；按原则原型文件不进 main）——检出后本地开 `prototype-v4.html`。**执行工作区**的结构与交互按 Orca 1:1 复刻（Create worktree Dialog、WorktreeCreationPanel、Explorer / Source Control / Diff；中栏 Terminal / Claude Code / Open Design），但**皮肤跟产品走：整窗一套 token，一个开关管整窗**（V4 修的就是「一个窗口三套配色」）；**导航外壳是 Workbench 自己的**：一条左栏装下项目头、四屏导航（总览 · 计划 · 自动化 · 知识库）与始终展开的 Projects；**没有「会话」页签**——点树或计划 ▶开工才进执行面；项目墙与设置是顶层覆盖层，不占导航格。

- 状态:**提议**（2026-09-11）
- 上游:ADR-0006
- 对齐:[原则 03](../../01-principles/03-press-release-faq-flywheel.md)、[architecture §2 会话与执行](../../architecture.md)

## 痛点

今天开工走本地 pipe，人看输出却靠嵌外部 Orca 网页。结果是：

- 必须另装 / 另开 Orca，贴带 token 的配对 URL；
- 人不知道「这张 Issue 对应 Orca 里哪条会话」；
- 停止接口未接，本机记录变了不能说成已杀进程；
- 会话屏是租来的脸，飞轮在「人审结果」前断一截。

## 解决方案（体验语言）

计划屏 ▶开工仍是唯一业务入口。点下去后走与 Orca 同序的建树（provision → refresh → create → reveal），**进入执行面**（不是切到第五个导航页签）：**本机终端 + Projects 列表 + Explorer / Source Control / Diff**；中栏可开 Terminal / Claude Code / Open Design；能停、能接回，不需要配对码。Open Design 仍可嵌本机网页（设计工具，不是执行宿主）。

## 飞轮检验

- **加强**：人审结果——输出在工作台里，审与点完成同一窗口。
- **不拽回搬运工**：不开第二套 IDE 工作流；完成仍人点。
- **不破坏铁律**：定时自动化的钟收回本机后仍只负责开会话、最多把活推到待评审；agent 不能代点 Done。

## 五大拷问摘要

| 拷问 | 答案 |
|---|---|
| 谁是客户？ | 用 Workbench 管周循环、在计划屏开工的 Super builder。 |
| 痛点？ | 执行面外挂，看跑、停跑、认会话都要离开产品。 |
| 核心利益？ | 一个窗口完成开工与审跑。 |
| 如何知道？ | 现行会话屏空态/配对摩擦；ADR-0006 拍板方向；发起人要求一体产品不要 iframe。 |
| 体验什么样？ | 见 [prototype-v4.html](https://github.com/forcegravity1989/builder-workbench/blob/87a2c561f55f6407d6b27b560b4b79a3c22a8763/docs/05-features/native-session-execution/prototype-v4.html)：一条左栏四屏 → 计划（默认列表）▶开工或点 Projects 树 → 建树进度 → 三栏（Projects/终端/Explorer·SC）→ Diff 审变更 → 停止 / 接回；换项目走项目墙覆盖层，改能力走设置覆盖层；整窗一套皮，不再像两个产品拼起来。 |

## 开放问题

1. 会话列表信息密度：只显示「进行中的这张 Issue」还是项目内多会话并排——MVP 建议以**当前 Issue 为主**，侧栏可扫同项目其它活会话。
2. Codex 是否进第一版开工工具——默认先 Claude Code + Cursor（已通）。
3. 过渡期是否保留 pipe 双后端开关——实现期可留，目标体验不得依赖外部 Orca。
