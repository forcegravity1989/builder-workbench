# Orca：把执行压短之后，谁保证这一周真正交付？

> **读者与边界**：供 BW 产品负责人及 1–3 人 Builder 团队决策；研究 stablyai/orca 的公开能力、演进与交付约束，不代替 BW 产品正本。截止与访问日均为 **2026-10-09**；窗口为近一年，已核实时间线从 2026 年 3 月起。能力发布、关键缺陷或 BW 上游基线变化时更新。Markdown 是正源，HTML 由统一 renderer 投影；本篇不构成升级方案。

## 结论：Orca 已超出写代码，结果约束仍需要人

**Orca 已是围绕 agent 的开发工作环境，覆盖任务来源、并行执行、运行预览、审阅和合入。** 官方面向会读 diff、管理提交的开发者，而非无代码用户；因此“Builder 有 Orca，只剩开发提效，其他都薄弱”不是可靠前提。[官方定位](https://www.onorca.dev/docs)

从任务板、自动化、跨机工作和恢复机制的扩展看，产品正在争取整个开发工作台；这是根据公开演进作出的判断，不是官方公布的商业路线图。原生工具能让有边界的工作更快完成，但本次未找到它默认保证“本周只交付这一小块、已有真实用户使用、下一周依据效果收缩方向”的证据。

对“写了两三个月仍无线上版本”的用户，BW 应验证的主张是：**让一个小版本按期进入真实使用，并让使用证据改变下一轮取舍。** 四块界面只有共同缩短这条链路才有价值。一个必须认真比较的对照方案是“原生 Orca＋现有 Issue 系统＋一份交付约定和周回顾 Skill”，不能预设它不够用。

## 新变化时间线：从多终端到交付协作与持续恢复

| 时间与证据 | 已发生什么 | 对判断的意义 |
|---|---|---|
| 2026-03-22，[v1.0.20](https://github.com/stablyai/orca/releases/tag/v1.0.20) | 工作树卡片展示 GitHub Issue；终端分屏可调尺寸、重排 | 早期就围绕任务组织执行，并非只有代码补全 |
| 2026-05-14，[自动化 PR #1806](https://github.com/stablyai/orca/pull/1806) 合并 | 自动化页面、定时运行及后台工作空间进入代码 | 从盯着一个会话，发展到周期性工作；合并日期不冒充正式发布日期 |
| 2026-07-08，[v1.4.128](https://github.com/stablyai/orca/releases/tag/v1.4.128) | 限制会话缓存和终端积压，修 Windows 内存溢出、远端恢复及更新后终端存续 | 长时间、多任务运行的可持续性成为实际工程工作 |
| 2026-09-20，[v1.4.206](https://github.com/stablyai/orca/releases/tag/v1.4.206) | 跨电脑会话搜索、计划卡片、活跃会话重连；用量扫描移到 worker、大历史列表虚拟化 | 降低找上下文和等待界面的成本 |
| 2026-09-25，[v1.4.211](https://github.com/stablyai/orca/releases/tag/v1.4.211) | Codex goal 固定在输入框上方；子任务仍运行时父会话保持工作状态 | 管理目标与并行状态，但这是会话层能力 |
| 2026-10-06 合并、10-08 发布，[看板 PR #19074](https://github.com/stablyai/orca/pull/19074) | GitHub Projects 的 Board 可拖拽并回写字段；已有 Table、Roadmap | 原生跨任务管理持续扩大，BW 不宜复制任务板 |
| 2026-10-08，[v1.4.223](https://github.com/stablyai/orca/releases/tag/v1.4.223) | 草稿跨重启保留、SSH 页签恢复、远端输入恢复；活动视图过滤与批选 | 流畅度与恢复应进入 BW 的上游筛选，而非只追新功能 |

当前发布页仍将原生结构化聊天标为**实验性**；Remote Server 也仍属实验，Server 2.0 只是官方预告。上述修复说明厂商处理过这些问题，不证明问题在 BW 环境已复现或已消失。[最新发布](https://github.com/stablyai/orca/releases/tag/v1.4.223)

## 三个可重建的 2026 工作故事

以下是以官方能力拼成的工作方式，**不是客户案例，也没有实测提效倍数**。

**故事一：周一选定一个用户障碍，当天就让实现、测试设计与审查相互反馈。** 负责人把“一位用户完成某项操作”的边界写进 Issue，带描述、图片与评论进入工作树；执行者改代码，第二个 agent 准备失败场景，第三个只读审查接口与风险，避免三个 agent 同时扩功能。Orca 提供任务上下文、隔离工作树和并行协调；负责人决定删什么、何时停止扩范围，并在集成版本上验一次真实旅程。[Linear 上下文](https://www.onorca.dev/docs/review/linear)、[工作树](https://www.onorca.dev/docs/model/worktrees)

这里压短的是串行交接和等待，不是取消集成验证。独立工作树上的测试通过不能证明合并后的版本能用；并行审查也必须重新核对最后提交。

**故事二：页面已经跑起来，设计反馈直接回到实现。** Builder 在内置浏览器点选出错元素，将 DOM、样式、局部截图及可得源码位置递交 agent；实现进行时，测试者同时梳理用户动作和失败边界。热更新后先复查页面，再通过原生 PR 审阅与失败检查日志修复问题。它缩短“描述截图—猜位置—再解释”的循环；是否解决了用户问题仍需观察真实操作。[Design Mode](https://www.onorca.dev/docs/browser/design-mode)、[审阅与检查](https://www.onorca.dev/docs/review/github)

**故事三：周五能解释工作，却不能拿 agent 的 Done 冒充交付。** 自动化可定时汇总 Issue、评审及阻塞信息，活动流帮助找到待输入、已结束和仍运行的会话。再补一张有来源的证据表：上线地址、实际使用者、完成的关键动作、未解决障碍。前半段原生能力已经很强；后半段是否值得做成 BW，取决于它能否促成人停止无效开发或缩小下一版。[自动化](https://www.onorca.dev/docs/cli/automations)、[活动流](https://www.onorca.dev/docs/activity)

## 机制和指标：谁决定什么

| 机制 | 决定与执行权 | 不能据此推出什么 |
|---|---|---|
| 原生 plan / goal | Claude TodoWrite、Codex update_plan 由 agent 提供；Codex goal 由原生聊天呈现，用户可暂停、恢复、清除；状态来自相应会话 | agent 的计划完成，不等于产品目标被用户接受 |
| 编排任务 | coordinator 建任务、依赖和派发；worker 对本次 dispatch 报成功或失败；Run 只存命名空间与收件箱，不自行调度 | 原生 Run 不是自动决定优先级的项目经理 |
| decision gate | coordinator 创建阻塞问题并记录解决结果；worker 的 ask 发给 coordinator | 默认 gate 不保证由人拍板，更不等同 BW 的人验收 |

前一行见[原生聊天](https://www.onorca.dev/docs/agents/native-chat)，后两行见[实验性编排协议](https://www.onorca.dev/docs/cli/orchestration)。**Orca 的 decision gate 与 BW 术语中的“必须由人决定的 gate”不是同一语义。** 若希望暂停新增范围、确定发布或确认结果，必须明确负责人、证据和协调者权限，不能仅靠同名组件。

原生 usage 关注额度、token 与费用估算，不能回答用户是否受益。[用量说明](https://www.onorca.dev/docs/agents/usage-tracking) 对 BW 更有解释力的候选指标是：从承诺范围到首次真实使用的时间、承诺版本的使用证据、未完成工作的数量与年龄、范围变更原因。它们也是假设；不要把提交数、agent 完成数或指标变绿作为价值替身。

## BW 吸收边界与四块重叠

[本仓上游说明](../../../ref/upstream.md)记录基线为 **caa465d1，2026-09-15**；本次核查 BW 为 **5202485e**。任务、自动化、工作树和审阅执行核在本仓保留，不能把上游现有能力统称为 BW 缺失。

有一个确切的后续差异：本仓 [ProjectViewStates.tsx](../../../src/renderer/src/components/github-project/ProjectViewStates.tsx) 第 47 行只允许 Table、Roadmap；[ProjectViewWrapper.tsx](../../../src/renderer/src/components/github-project/ProjectViewWrapper.tsx) 仍无 Board 渲染分支。因此 10 月可拖拽 GitHub Board **尚未吸收，证据层级仅为源码**。9 月 15 日之后的 goal 展示、性能和恢复修复未逐项比对，不冒称已吸收或全部缺失；基线日期也不能排除定向移植。

| BW 区块 | 原生重叠与应借用部分 | 值得验证的差异；反证 |
|---|---|---|
| 总览 | 任务项目视图、活动流、会话历史 | 帮人看清本周实际可用增量；若只是搬运状态，原生足够 |
| 指标 | 原生工程状态、用量；沿用数据与执行通道 | 用真实使用结果改变决策；若指标无数据或从不改变取舍，新增屏无价值 |
| 计划 | Issue、Roadmap、agent plan / goal、编排 | 固定一个可交付切片、明确不做什么和截止点；若只是 agent 待办镜像，应收回 |
| 验收 | diff、PR/MR、CI、浏览器运行和审阅 | 把部署、用户关键动作与人工接受连起来；若只是重复 CI 和勾选清单，应复用原生 |

## 对 1–3 人 Builder 的建议与反证

先选一个真实项目做两轮小版本验证。每轮只承诺一个可独立使用的切片；新想法进入候选，变更当前范围要写明取舍。利用原生工作树、浏览器、审阅与自动化压短执行；BW 只尝试把“承诺—可用版本—使用反馈”联系起来。

同等支持下，与“原生 Orca＋轻量 Skill”交叉比较：是否更早首次使用、是否减少长期未完成工作、周五能否解释真实增量，以及额外录入花了多久。若两种方式效果相当，就没有四块独立界面的充分理由；若主要损耗来自启动失败、卡顿、断线或数据错误，应先修这些。若交付及时却没人需要，问题可能在需求选择与用户接触，不能继续加计划表解决。

## 局限

这是公开发布、官方文档、合并 PR 和少量 BW 源码核对，未安装最新版 Orca、未跑 Electron 旅程、未验证真实 GitHub 写入或商业收益。看板 PR 作者明确说明其渲染验证使用确定性 IPC，并非写真实用户项目；Windows/Linux 渲染留待 CI，不能抹掉该边界。[验证原文](https://github.com/stablyai/orca/pull/19074)

2025 年部分未找到足够可靠材料，不推断产品当时不存在。文档无发布日期时只记访问快照；未把开放 Issue 当路线图。最新发布亦披露旧原生聊天升级后不可见但文件仍在磁盘的已知问题，不能把“可恢复”泛化为所有升级都安全。[已知问题](https://github.com/stablyai/orca/releases/tag/v1.4.223)

## 来源表

访问日全部为 **2026-10-09**。版本日期以 GitHub 发布页为准；“未标”表示页面未披露更新日期，不能以访问日冒充发布日期。

| 一手来源 | 发布／更新日 | 访问日 | 支持主张 |
|---|---|---|---|
| [What is Orca](https://www.onorca.dev/docs) | 未标 | 2026-10-09 | 对象与产品边界 |
| [v1.0.20](https://github.com/stablyai/orca/releases/tag/v1.0.20) | 2026-03-22 | 2026-10-09 | 早期任务、终端 |
| [Automations PR #1806](https://github.com/stablyai/orca/pull/1806) | 合并 2026-05-14 | 2026-10-09 | 周期工作演进 |
| [v1.4.128](https://github.com/stablyai/orca/releases/tag/v1.4.128) | 2026-07-08 | 2026-10-09 | 内存与恢复修复 |
| [v1.4.206](https://github.com/stablyai/orca/releases/tag/v1.4.206) | 2026-09-20 | 2026-10-09 | 计划、搜索、性能 |
| [v1.4.211](https://github.com/stablyai/orca/releases/tag/v1.4.211) | 2026-09-25 | 2026-10-09 | goal 与子任务状态 |
| [Board PR #19074](https://github.com/stablyai/orca/pull/19074) | 合并 2026-10-06 | 2026-10-09 | 看板及验证局限 |
| [v1.4.223](https://github.com/stablyai/orca/releases/tag/v1.4.223) | 2026-10-08 | 2026-10-09 | 当前发布、预告、缺陷 |
| [Linear](https://www.onorca.dev/docs/review/linear) | 未标 | 2026-10-09 | 用户任务上下文 |
| [Worktrees](https://www.onorca.dev/docs/model/worktrees) | 未标 | 2026-10-09 | 隔离与交付流程 |
| [Design Mode](https://www.onorca.dev/docs/browser/design-mode) | 未标 | 2026-10-09 | 运行界面反馈 |
| [Hosted reviews](https://www.onorca.dev/docs/review/github) | 未标 | 2026-10-09 | 评审、检查、项目 |
| [Automations](https://www.onorca.dev/docs/cli/automations) | 未标 | 2026-10-09 | 周期执行 |
| [Activity](https://www.onorca.dev/docs/activity) | 未标 | 2026-10-09 | 注意力与会话状态 |
| [Native chat](https://www.onorca.dev/docs/agents/native-chat) | 未标 | 2026-10-09 | plan、goal、实验边界 |
| [Orchestration](https://www.onorca.dev/docs/cli/orchestration) | 未标 | 2026-10-09 | 协调权与 gate |
| [Usage](https://www.onorca.dev/docs/agents/usage-tracking) | 未标 | 2026-10-09 | 额度与费用边界 |

## 未决

1. 内部 Builder 的延迟主要来自范围膨胀、用户接触不足，还是环境与恢复故障？需要真实工作记录区分。
2. 两周内哪个切片能交给哪位用户，谁有权拒绝 agent 建议的额外工作？
3. BW 已有四块中，哪一次显示实际改变过发布或取舍决定？先寻找这一条证据，再决定保留和收缩。
