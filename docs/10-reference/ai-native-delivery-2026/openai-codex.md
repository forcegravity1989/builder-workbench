# OpenAI Codex：把持续写代码变成可核对的交付

> **读者与时机**：讨论 BW 定位、复盘 1–3 人 Builder 项目的产品与研发。**范围**：截至 2026-10-09 的 Codex 实践、反馈与人类责任；不代写 BW 产品设计，不证明 BW 已实现或用户已受益。**结构**：结论、时间线、故事、机制、指标、启发与反证、开放问题、来源。**维护**：官方实践变化或内部项目产生反证时更新；Markdown 是正源，同名 HTML 为阅读投影。本篇是外部研究，尚非获批方案；仓内原则及交付规则仍以 AGENTS 和原则正文为准。

## 30 秒结论

**Codex 的进展正在减少执行与验证劳动，但不能替小团队决定何时停止建设、把什么交给真实用户。** 本篇把“周五说不清做了什么、两三个月没有用户可用版本”看作研究问题，不预设四块管理屏就是答案。

近一年官方材料最一致的实践是：明确终点与范围，保留可运行产物，让失败证据决定下一步，再把有效经验用于后续任务。其价值首先是让工作可检查、可纠正；“因此更快获得客户或收入”仍缺少这里可引用的对照证据。

证据分为**内部实践自报、能力实验、教学示例、产品机制和本文建议**。以下材料均已发布；没有把未来愿景当作可用能力。日期是文章原发布日期，不能自动当作其中每项功能的首发日。

## 近一年时间线：从会做，走向可持续复核

| 日期与材料 | 已核实变化 | 不能据此推出什么 |
|---|---|---|
| 2026-01-22，Skill 评估教程 | 从任务目标、过程、风格、效率建立少量检查，保留运行轨迹与产物。[S1](https://developers.openai.com/blog/eval-skills) | 遵守步骤不等于选对问题。 |
| 2026-02-23，长任务实验 | 一个设计工具实验连续运行约 25 小时、生成约 3 万行；借助持久文件与逐里程碑验证保持方向。[S2](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) | 原文明确不是生产发布；运行时长和行数不是用户价值。 |
| 2026-03-09，SDK 维护实践 | 两仓三个月合入 PR 从前期 316 增至 457；结合 Skill、脚本和评审。[S3](https://developers.openai.com/blog/skills-agents-sdk) | 前后自报没有控制需求、人员等变量，不能归因为同幅度生产率提升。 |
| 2026-05-09—12，三篇教程 | Goals 固定终点；修复循环利用验证反馈；改进循环把轨迹与反馈转成评估和后续修改。[S4](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)、[S5](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex)、[S6](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop) | 教程可运行与工程闭环不证明真实客户效果。 |
| 2026-08-03—25，流程与应用实践 | 按项目风险裁剪流程，复用执行系统；Runme 将操作和结果留在同一份 notebook。[S7](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)、[S8](https://developers.openai.com/blog/codex-as-a-platform)、[S9](https://developers.openai.com/blog/automating-repetitive-work-at-openai-with-codex) | 不要求复制固定文件树或增加审批屏。 |
| 2026-09-11，指令维护建议 | 警告过长、冲突的 Skill 描述和过度规定步骤会妨碍新模型。[S10](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | 不能把某版模型经验永久固化为所有任务必经流程。 |

## 三个故事：产物怎样变得可以接手

### 1. 给 SDK 用户发一个能安装运行的版本

**内部实践自报。** 触发是发布候选准备好；输入是上一发布标签与当前代码差异。维护流程检查兼容性、回归和迁移说明，还通过本地包仓库发布并在多个运行环境安装测试。其判断对象超出了“源码示例能跑”。Python 3.9 支持移除的案例，即使总体可发，仍明确指出安装限制和发布说明责任。[S3](https://developers.openai.com/blog/skills-agents-sdk)

产出是有证据和待办的发布准备结论。人仍要决定 API、兼容承诺、范围和发布顺序。**本文推断**：小团队最该复制的是用户拿到产物后的路径，而非增加一次抽象的“验收通过”。

### 2. 修教程时，让真实执行失败决定下一轮

**教学示例。** 触发是 API 教程过时；输入是原 notebook、规则与检查结果。Codex 仅修改副本，执行验证后把剩余差异交回下一轮；每轮保存修改产物和记录，区分查出了什么、改了什么、执行是否通过、还有什么。达到上限、差异不再收敛或需要人决策时应停止。[S5](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex)

关键反证：示例的三份材料特意安排成一、二、三轮通过，代码包含分阶段条件。这是展示控制流，**不是三轮保证修好，也不是生产成功率**。BW 可以借鉴“剩余缺口”，不能展示一个只有编辑次数的进度条来替代它。

### 3. 重复跑模型评估，把人的取舍留下来

**内部个人实践自报。** 触发是新模型需要评估；工程师在 Runme 写目标，Codex 参考旧运行拟计划，人审后执行并记录命令、输出与解释。遇到资源额度耗尽，人帮助决定复用现有环境；结束时补上为什么选择这条路径，供下轮复用。[S9](https://developers.openai.com/blog/automating-repetitive-work-at-openai-with-codex)

产物是同一份可接手 notebook，不需要重读整段聊天。这里的人审针对资源和方案选择，不能外推为所有小任务都先审批计划；原文也没有提供节省工时的受控测量。

## 能防跑偏的机制，以及各自边界

**终点先于执行清单。** Goals 教程要求写明结果、证明方式、约束、可操作范围、迭代策略和受阻停止条件。适合终点清晰但路线未知的任务；一次性修改仍用普通提示。它约束“怎样才算工程任务完成”，不会自行证明目标有市场需求。[S4](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex)

**反馈必须能改变下一轮。** Agent Improvement Loop 从运行轨迹出发，加入人和模型反馈，生成可重跑评估，再给 Codex 排序后的改动建议。示例使用虚构公司数据和示例人评，并非生产金融服务实证；开发者仍决定评估、PR、合入和部署等环节如何设人审。[S6](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop)

**长任务依赖可读状态，不依赖一直催。** 里程碑足够小、每段有验证，约束与当前状态保存在可再读材料中，使人离开后能继续接手。对 BW 的意义是恢复上下文和识别偏离；不意味着要维持第二份与 Issue、Git 重复的台账。[S2](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)

**规则也要接受反证。** 8 月流程教程明确文件约定可裁剪，不应无理由强加企业流程；9 月建议收紧 Skill 触发、渐进读取，避免不相关指令占据上下文。这对“再加流程就能改善交付”构成直接反证。[S7](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)、[S10](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

## 度量：把工程可信度与真实交付分开

下表是**本文建议的内部试用口径**，不是 OpenAI 已验证的指标体系。起步只选与当前阻塞有关的两三项，避免先建设指标平台。

| 要回答的问题 | 可记录的口径 | 容易出现的假进步 |
|---|---|---|
| 是否不断扩大范围？ | 开工后新增的必要承诺、被主动延后的事项及原因 | 拆更多任务让完成率看起来更高 |
| 是否越来越接近可用？ | 同口径必须通过的缺口、无进展轮数、等待人决定时长 | 删除检查或改阈值换取全绿 |
| 是否真的交给用户？ | 从明确问题到指定真实用户首次完成核心操作的时间；附版本和使用证据 | 把部署成功、生成 PR 算作用户使用 |
| 是否改善了问题？ | 同场景前后任务成功率、耗时、再次使用或付费意愿的原始反馈 | 代码量、token 数、agent 忙碌时长 |
| 管理成本是否值得？ | 找背景、整理证据、重复录入和必要决策所用的人时 | 自动生成长周报但无人据此改决定 |

Skill 评估的启示是先选少量必须通过项，兼看结果与过程；对可机械检查的事实用实际运行，对主观判断保留评判依据。其评估分数只能回答所设检查，不能直接跨到商业结果。[S1](https://developers.openai.com/blog/eval-skills)

## 给 BW 的启发与反证

**先验证一个存量故事。** 选择一支已有 Orca 的 1–3 人项目，认领一个真实用户问题、一个可交付切片和一个明确的试用对象。下一次约定检查点，先看用户是否已拿到并完成核心操作；未达到就明确卡在范围、执行、发布还是使用，而不是再让模型扩展愿望清单。这是试验建议，不把固定周节奏当行业标准。

四块能力可以围绕同一个交付对象审视：总览暴露该做的决定；指标呈现问题与效果的来源；计划保留本次承诺和主动不做的部分；验收汇合运行证据、实际发布及用户读回。需要探索的细节继续交给原生会话与 Skill，人的注意力留给取舍。是否需要独立四屏，须由使用成本证明。

OpenAI 8 月平台文章明确区分复用执行系统与应用自有界面、上下文、权限、结果归档。**本文推断**：BW 可能有价值的部分是贴近 Builder 的交付对象和判断入口；重新造会话、调度和修复循环需要更强证据。[S8](https://developers.openai.com/blog/codex-as-a-platform)

删减判据也要先约定：如果 Orca 加一份短模板同样能收敛范围、找回证据并交给用户，BW 应缩减重复步骤；若某指标从未改变取舍，应撤掉；若“验收”只有 agent 自评，应保留未知。反过来，若 BW 能持续减少无效扩展、待发堆积和人工找证据时间，才有继续打磨的理由。

## 开放问题

- 当前最常失败在未锁定用户、范围扩张、可靠性、发布，还是发布后无人使用？需访谈并查最近真实项目，不能靠产品结构推断。
- Builder 是否愿意明确延后模型提出的新想法？产品应帮助取舍，还是已有提示与习惯即可？
- 谁能提供独立于实现 agent 的验收与使用证据？缺数据时怎样保留未知？
- 当工程循环已原生自动化，BW 的额外维护成本能否被节省的决策与交接时间抵消？
- 官方资料缺少与本目标人群匹配的商业结果对照；内部试用需要怎样的样本和时间窗口才足以决定保留或删减？

## 来源与证据范围

所有来源查阅日均为 **2026-10-09**；只使用 OpenAI Developers 一手内容。本次核对文档和示例代码，未运行示例，未测 Codex 当前各账户可用性，未访问文中客户或内部生产系统。

| 编号与一手来源 | 原发布日期 | 类型与支持主张 |
|---|---|---|
| [S1 · Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills) | 2026-01-22 | 教程：小型检查、轨迹与产物、过程与效率 |
| [S2 · Run long horizon tasks with Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) | 2026-02-23 | 能力实验：持久状态、里程碑验证；非生产 |
| [S3 · Using skills to accelerate OSS maintenance](https://developers.openai.com/blog/skills-agents-sdk) | 2026-03-09 | 内部实践自报：安装路径、发布评审与人的取舍 |
| [S4 · Using Goals in Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex) | 2026-05-09 | 机制与教程：结果、边界、停止条件 |
| [S5 · Build iterative repair loops with Codex](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex) | 2026-05-11 | 教学示例：实际执行、剩余差异、分阶段 fixture |
| [S6 · Build an Agent Improvement Loop](https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop) | 2026-05-12 | 合成案例：反馈转评估与改动建议；可设人审 |
| [S7 · Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex) | 2026-08-03 | 流程建议：证据和范围约束，按风险裁剪 |
| [S8 · Codex as a platform](https://developers.openai.com/blog/codex-as-a-platform) | 2026-08-19 | 产品机制与方向：复用执行系统，应用拥有工作流 |
| [S9 · Automating repetitive work at OpenAI](https://developers.openai.com/blog/automating-repetitive-work-at-openai-with-codex) | 2026-08-25 | 内部个人实践：Runme 目标、执行、人的选择 |
| [S10 · Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra) | 2026-09-11 | 实践建议：防过度指令，收紧触发与渐进加载 |
