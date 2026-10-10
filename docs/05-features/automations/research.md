# 定时任务竞品调研（外部存档）

> **来源与状态**：两轮外部竞品调研的存档。**第一轮**（调研基准 2026-10-09，按产品分节）2026-10-10 经聊天粘贴存档，中段约 713 行未随粘贴到达（Dify 余下、TRAE、WorkBuddy、DeepSeek Harness、OpenClaw / Clawdbot、GitHub Copilot、Claude Code / Claude Cowork、n8n、Windsurf 各节与结论前半），正文以 ⚠️ 标出截断点，补全前该部分不得当作完整依据引用。**第二轮**（调研基准 2026-10-10，能力 × 产品证据矩阵，见文末「第二轮调研」）同日存档，以更严的判定口径覆盖了第一轮的关键判定缺口。给判断「定时任务值得做什么、做到哪」的人读，与 [intent.md](intent.md) 的「价值与依据」互为印证。
>
> **维护约定**：只存调研原文与后续补充调研结果，不写本仓的取舍结论（结论进 intent / spec / design）。中段补全或新一轮调研到达时更新本文。

## 第一轮调研（2026-10-09，按产品分节，中段缺）

【AI 工作台定时任务与 Agent 自动化竞品调研
调研基准：2026 年 10 月 9 日｜优先采用官方文档、官方产品说明及官方代码仓库

本次重点不只是比较"能不能定时运行"，而是拆解对桌面 AI 工作台有直接借鉴价值的产品机制：调度规则的表达力、任务生命周期、Prompt 创建与调试闭环、运行记录与恢复、并发控制，以及错过调度后的行为。

先说明一个证据边界：以下将区分官方资料明确记载的功能、可以从产品架构或公开实现中确认的行为，以及尚未查到确切依据的细节。对于执行次数上限、到期策略、失败重试、并发互斥等容易被产品宣传页忽略的能力，不会因为产品支持定时执行就默认它也支持这些机制。

另一个重要区别是：后台 Agent、定时触发器、可复用工作流和任务运行记录是四种不同的产品能力。一个产品可能有后台 Agent，却没有原生定时调度；也可能支持 Cron，却没有 AI 辅助编写 Prompt 或从失败运行恢复对话。

### 1. Cursor — Automations / Cloud Agents

官方文档：
Cursor Automations ·
Background Agents / Cloud Agents

事实要点

创建流程与 UI

- 官方文档明确支持从 Agents Window、cursor.com/automations、Marketplace 模板或本地 Agent 会话中的 /automate skill 创建自动化。
- 创建步骤为：选择触发器 → 编写 Prompt → 选择可用工具 → 选择一个或多个仓库，或不绑定仓库 → 保存并启用。
- /automate 可以通过自然语言描述工作流，由 Cursor 配置触发器、指令和工具。这是明确的 AI 辅助自动化配置机制，而不是单纯的文本输入框。
- 可以配置多个触发器；任意一个触发器触发即可启动自动化。

Schedule 表达力

- 支持预设调度和自定义 Cron 表达式。
- 官方举例包括每小时执行；Cron 用于更精确的调度。
- 调度执行可能延迟，但不会早于指定的触发时间。
- 这是循环调度设计。一次性任务、执行 N 次、指定截止日期、任务自动过期的支持情况：未查到官方文档明确说明。
- 时区选择、错过一次或多次调度后的补跑规则、同一自动化的并发互斥规则：未查到足够明确的官方说明。

Prompt 生成与调试

- /automate 的自然语言配置能力，可以减少用户手工拼接触发器、指令和工具的负担。
- 可以从 Marketplace 模板创建，复用已有自动化设计。
- 自动化支持选择 MCP 工具，以及发送 Slack 消息、评论 PR 等工具。
- 保存前是否有专门的 dry-run、模拟触发器、Prompt 单独试跑或调度调试器：未查到明确说明。
- 自动化可使用持久化 Memories，在同一自动化的多次运行之间读写记忆；这意味着它不仅能重复执行静态指令，还可以通过持久化信息积累上下文。

运行历史与恢复

- Cloud Agents 有独立的运行过程，可查看状态、接管执行环境；运行产物可以包括代码变更、测试结果、日志、截图或视频等。
- Automations 是 Cloud Agents 的自动触发层。
- 定时任务是否提供逐次运行列表、每次完整输出快照、从某一次历史运行直接继续同一对话：未查到足够明确的 Automations 官方文档依据。 不应将普通 Cloud Agent 会话能力直接等同于自动化运行历史能力。

定时任务与 Background Agent 的关系

- 关系非常明确：Automations 是触发与配置层，Cloud Agent 是实际执行工作的 Agent。
- 触发器可以是时间，也可以是 GitHub、GitLab、Slack、Webhook、Linear 等事件。
- 因此 Cursor 的自动化并不是一个独立的 cron 脚本，而是把后台 Agent 的执行能力连接到调度和外部事件。

来源：

- Automations：创建流程、触发器、工具与 Memories
- Cursor Background Agents

对桌面 AI 工作台的借鉴

Cursor 最值得参考的不是 Cron UI，而是把触发条件、Prompt、工具权限、工作空间作为一个整体保存。对于本地 Agent，可以借鉴 /automate 的自然语言生成配置方式，同时保留可编辑的结构化配置，让用户知道 AI 最终生成了什么规则。

### 2. Dify — Workflow 定时触发

官方入口：
Dify 官方文档 ·
Dify GitHub 仓库

事实要点

触发类型

- Dify 的 Workflow、Chatflow、API 发布能力与外部自动化触发应当区分：
- API： 发布后的应用可以通过 API 调用。这是由外部系统主动发起执行，不等于内置定时调度。
- Webhook： 可以通过外部 Webhook 集成实现事件触发，但是否属于当前版本原生 Workflow 触发器，需要结合具体版本和插件确认。
- Cron / Schedule Trigger：未查到足够明确、可核实的当前官方文档，能够确认其原生支持范围及 UI 细节。
- 这里不把第三方插件、外部 cron 服务或自行调用 API 的方案误写成 Dify 原生能力。

频率配置

- Dify 的核心是可视化 Workflow 编排、发布和运行，而不是传统任务管理器。
- 原生 Schedule Trigger 是否支持"每 N 分钟 / 小时 / 天"的表单，以及是否允许直接输入 Cron 表达式：未查到可以确认当前版本具体行为的官方文档。
- 时区、夏令时、一次性触发、指定结束日期等：未查到确切依据。

执行次数、停用与重试

- 最大执行次数、执行到期自动停用、连续失败后暂停任务：未查到可以确认原生调度器行为的官方文档。
- Dify 工作流节点中的错误处理、重试或失败分支，与调度器层面的重 ⚠️【中段截断】

---

⚠️ **以下约 713 行未随粘贴到达，待补**：Dify（余下）、3. TRAE、4. WorkBuddy、5. DeepSeek Harness、6. OpenClaw / Clawdbot、7. GitHub Copilot、8. Claude Code / Claude Cowork、9. n8n、10. Windsurf 各节，以及结论部分前半。补全前引用本文须注明此缺口。

---

【⚠️ 结论尾段，接上文】分最值得研究的工程参考。

最后，最重要的一点是：不要让用户把"定时任务已触发""Agent 已开始执行""Agent 已完成""输出已成功交付"看成同一个状态。把这几个阶段清楚地呈现出来，比单纯增加更多调度预设更能提高自动化功能的可靠性和可理解性。

### 官方及相关资料链接（第一轮）

1. Cursor
   - Automations：https://cursor.com/docs/cloud-agent/automations
   - Background Agents：https://docs.cursor.com/background-agent
2. Dify
   - 官方文档：https://docs.dify.ai/
   - GitHub 仓库：https://github.com/langgenius/dify
3. TRAE
   - SOLO 产品介绍：https://www.trae.ai/blog/product_solo
   - SOLO 更新介绍：https://www.trae.ai/blog/new_solo_beta_0331
   - TRAE Work 产品介绍：https://www.trae.ai/blog/trae_work_0609
4. WorkBuddy
   - 官方自动化指南：https://www.workbuddy.ai/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Automation-Guide
   - 中文自动化指南：https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Automation-Guide
   - 创建任务指南：https://www.workbuddy.ai/docs/workbuddy/Create-Task
   - 快速入门：https://www.workbuddy.ai/docs/workbuddy/Quickstart
5. DeepSeek Harness
   - 官方主页：https://www.deepseek.com/en/harness/
   - 开发者预览说明：https://www.deepseek.com/harness/en/
   - Schedule Reminders：https://deepseek-harness.github.io/deepseek-harness/en/guide/schedule
   - Host-wide Schedule 技术参考：https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/schedule
   - 工具 Schema Catalog：https://deepseek-harness.github.io/deepseek-harness/en/reference/tool-catalog
6. OpenClaw / Clawdbot
   - Cron Jobs 文档：https://github.com/openclaw/openclaw/blob/main/docs/automation/cron-jobs.md
   - CLI Cron 参考：https://github.com/openclaw/openclaw/blob/main/docs/cli/cron.md
7. GitHub Copilot
   - Cloud Agent Automations：https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-automations
   - 创建自动化：https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/create-automations
   - Copilot App Automations：https://docs.github.com/en/copilot/how-tos/github-copilot-app/using-automations
   - Copilot CLI 定时 Prompt：https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/schedule-prompts
8. Claude Code / Claude Cowork
   - Claude Code 官方文档：https://docs.anthropic.com/en/docs/claude-code/overview
   - Claude Code GitHub 仓库：https://github.com/anthropics/claude-code
   - Scheduled / Cron 相关公开讨论：https://github.com/anthropics/claude-code/issues/30646
   - Scheduled Tasks 时区相关记录：https://github.com/anthropics/claude-code/issues/88638
9. n8n
   - Schedule Trigger 节点文档：https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.scheduletrigger/
   - 官方文档首页：https://docs.n8n.io/
10. Windsurf
    - 官方文档：https://docs.windsurf.com/

---

## 第二轮调研（2026-10-10）：能力 × 产品证据矩阵（砍 / 留决策用）

> 来源：用户经联网模型生成，2026-10-10 粘贴存档。证据编号 E1–E11；官方链接未随粘贴以 URL 形式到达，可对照第一轮链接表映射：E1→Cursor Automations / Background Agents、E2→Copilot Cloud Automations 三篇、E3→OpenClaw cron 两篇、E4→DeepSeek Harness schedule 两篇、E6→n8n Schedule Trigger、E7→claude-code#30646、E8→claude-code#88638、E11→Copilot CLI schedule-prompts；E5（dsh-cron-scheduler 插件）、E9（Devin）、E10（Manus）的原始链接待补。粘贴中的图片标题残片已清除，矩阵表由粘贴文本重建，其余文字未改动。

【AI 工作台「定时任务」能力矩阵：砍 / 留决策调研
调研基准日：2026-10-10｜证据范围：官方文档、官方产品说明、官方代码仓库及官方 Issue

这份调研的核心不是比较谁的定时任务功能更多，而是区分三件事：调度器能做什么、Agent 每次运行能继承什么、产品是否把这些机制暴露为用户可配置的能力。

### 一、判定口径

为避免把竞品没有明确承诺的能力误判为不支持，矩阵采用以下标记：

- ✓ 原生：官方资料明确说明产品自身提供该能力。
- ✗ 不支持：官方资料明确说明不支持，或官方实现足以证实该机制不存在。
- 插件变通：需要外部 cron、操作系统计划任务、第三方自动化平台或额外脚本才能实现。
- 未查到：没有找到足以支持结论的官方证据，不等于产品一定不支持。

尤其需要区分以下三种状态：

- 定时调度 ≠ 完整生命周期管理。 能在指定时间触发，不代表有一次性任务、到期状态、执行次数上限或自动归档。
- 运行连续性 ≠ 自动传递上次输出。 Agent 可以复用同一个工作区、读取状态文件，或者拥有持久记忆，但这不等于调度器自动把上次完整输出追加到下一次 prompt。
- 能触发 ≠ 有统一触发器配置。 一个产品支持 API 启动任务，不代表每个定时任务都能同时绑定 Webhook、GitHub 事件、Slack 和 Linear。

下面以九项能力为列、产品为行。对「未查到」的项目，不用相邻功能推导结论；对「插件变通」的项目，也不会将其记作原生能力。

### 二、官方证据索引

| 编号 | 产品 | 官方证据 |
|---|---|---|
| E1 | Cursor | Automations 官方文档：多触发器、cron、自然语言 /automate、模板市场、跨运行 Memories |
| E2 | GitHub Copilot | About Copilot automations；创建与管理 Automations：重复调度、仓库事件、prompt、运行历史、手动 Run now |
| E3 | OpenClaw / Clawdbot | 官方 Cron Jobs 文档；官方 CLI 参考：持久化调度、一次性时间、固定间隔、cron、运行记录与输出投递 |
| E4 | DeepSeek Harness | Schedule 用户指南；Schedule 子系统设计：会话内一次性提醒、固定间隔、日历规则、任务状态与生命周期 |
| E5 | DeepSeek Harness 插件方案 | dsh-cron-scheduler 插件说明：外部系统 cron、独立 headless Agent 执行、每次新会话、运行结果及历史。注意这是插件，不是内置 Schedule |
| E6 | n8n | Schedule Trigger；工作流导入导出：固定间隔、cron、多条规则、错过调度的处理、JSON 导入导出 |
| E7 | Claude Code | Issue #30646：Scheduled / cron task 功能请求：提出内置调度需求，不能把提案当作已发布能力 |
| E8 | Claude Code / Web Routines | Issue #88638：Scheduled tasks 时区问题：证明相关 Routines 调度机制已存在于对应产品环境，但该 Issue 是缺陷报告，不是完整功能规格 |
| E9 | Devin | Weekly Dependency Updates：周期调度、事件上下文、自动化模板及提示词 |
| E10 | Manus | Automations 官方说明；Scheduled Tasks 2.0：一次性与重复调度、结束条件、事件/Webhook 触发、同一任务或新任务、运行记录 |
| E11 | GitHub Copilot CLI | 官方文档与仓库更新日志：/after、/every 本地交互会话中的定时提示机制 |

证据边界说明： WorkBuddy、TRAE、Windsurf、Dify，以及 Copilot CLI schedule-prompts 的专属行为，在本轮检索中尚未获得足以覆盖九项能力的完整官方证据。对应格子会明确写「未查到」，而不是从相似产品或通用 Agent 功能推断。

### 三、A. 能力 × 产品证据矩阵

列编号：C1 一次性任务及结束生命周期；C2 固定间隔（每 N 分钟 / 小时）；C3 执行次数上限；C4 并发控制及策略可配置性；C5 跨运行状态传递机制；C6 Prompt 快照及历史会话恢复；C7 非时间触发器、多触发器及鉴权；C8 AI 辅助创建、从当前会话保存；C9 导入导出、跨机器迁移及模板分享。

| 产品 | C1 一次性/生命周期 | C2 固定间隔 | C3 次数上限 | C4 并发控制 | C5 跨运行状态 | C6 Prompt/恢复 | C7 事件触发器 | C8 AI 创建 | C9 配置分享 |
|---|---|---|---|---|---|---|---|---|---|
| Cursor Automations | 未查到完整一次性生命周期 [E1] | ✓ cron [E1] | 未查到 [E1] | 未查到 [E1] | ✓ 持久 Memories [E1] | 未查到完整快照机制 [E1] | ✓ 多触发器 [E1] | ✓ /automate [E1] | ✓ 模板市场 [E1] |
| GitHub Copilot Cloud Automations | 未查到 [E2] | ✓ 小时/日/周 [E2] | 未查到 [E2] | 未查到 [E2] | ✓ 仓库指令/Agent 配置；自动传递上次输出未查到 [E2] | ✓ 会话日志可查看；快照/恢复未查到 [E2] | ✓ Issue/PR 事件；多触发器 [E2] | ✓ Prompt 配置及工具建议 [E2] | 未查到配置导出；自动化模板未查到 [E2] |
| GitHub Copilot CLI /after、/every | ✓ 延迟一次性 /after [E11] | ✓ /every [E11] | 未查到 [E11] | 未查到 [E11] | ✓ 同一交互会话可保留上下文；跨次自动携带未查到 [E11] | ✓ 可恢复交互会话；调度运行快照未查到 [E11] | 插件变通：外部事件需另行接入 [E11] | ✓ 自然语言调度提示 [E11] | 未查到 [E11] |
| OpenClaw / Clawdbot Cron Jobs | ✓ --at、可选运行后删除 [E3] | ✓ --every [E3] | 未查到 [E3] | 未查到明确的每任务并发策略 [E3] | ✓ 可投递回指定会话；自动携带上次输出未查到 [E3] | ✓ 运行记录；完整 prompt 快照/恢复未查到 [E3] | ✓ Webhook、Gmail PubSub 等 [E3] | 未查到专用自然语言建任务入口 [E3] | 未查到 [E3] |
| DeepSeek Harness 内置 Schedule | ✓ 一次性提醒；投递后保留记录 [E4] | ✓ 固定间隔 [E4] | 未查到 [E4] | 未查到 [E4] | ✓ 同一会话消息交付；不是自动复制上次输出 [E4] | 未查到完整快照/恢复 [E4] | 未查到通用事件触发器 [E4] | ✓ 对话中请求创建提醒 [E4] | 未查到 [E4] |
| DeepSeek Harness + dsh-cron-scheduler | 插件变通：cron 可长期运行；一次性终结未查到 [E5] | ✓ 插件 cron [E5] | 未查到 [E5] | 未查到 [E5] | ✓ 每次新会话、同工作区；非自动传递输出 [E5] | ✓ 结果可从工作区会话查看；prompt 快照未查到 [E5] | 插件变通：由外部调度/脚本扩展 [E5] | 插件变通：需配置插件规则 [E5] | 插件变通：配置文件可随项目分发；完整迁移机制未查到 [E5] |
| WorkBuddy | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 |
| TRAE | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 |
| Windsurf | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 |
| Dify | 未查到足够证据确认原生定时任务 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到 | 未查到足够证据确认与定时任务绑定的触发器配置 | 未查到 | 未查到足够证据确认定时任务配置迁移 |
| n8n | ✓ 单次可通过日期规则或外部触发设计；专用一次性生命周期未查到 [E6] | ✓ 秒/分/小时/Cron [E6] | 未查到原生总次数限制 [E6] | 未查到每工作流的通用并发策略配置 [E6] | ✓ 工作流数据与持久化状态可用于跨次处理；自动附加上次输出未查到 [E6] | ✓ 执行历史可查；Prompt 快照/会话恢复不适用或未查到 [E6] | ✓ 其他触发节点可扩展；每任务多触发器与鉴权需逐项确认 [E6] | 未查到专用自然语言生成入口 | ✓ JSON 导入导出 [E6] |
| Claude Code CLI | 插件变通：外部 cron/OS 计划任务；原生能力见 Issue 边界 [E7] | 插件变通：OS cron 等 | 未查到 | 未查到 | ✓ 项目文件、会话恢复可用；定时任务跨运行机制未查到 [E7] | ✓ 交互会话恢复；定时任务快照未查到 [E7] | 插件变通 | 未查到 | 未查到 |
| Claude Code Web Routines / Cowork | ✓ 对应 Web Routines 有定时任务机制；专用一次性生命周期未查到 [E8] | ✓ Routines 调度存在；精确间隔表达待核 [E8] | 未查到 [E8] | 未查到 [E8] | 未查到 [E8] | 未查到 [E8] | ✓ Routines 标签表明支持 Webhook 触发；具体鉴权及多触发器待核 [E8] | 未查到 [E8] | 未查到 [E8] |
| Devin | 未查到专用一次性生命周期 [E9] | ✓ 周期调度/RRULE [E9] | 未查到原生总次数上限 [E9] | 未查到 [E9] | ✓ Knowledge、事件上下文；自动携带上次输出未查到 [E9] | ✓ 会话运行可追踪；完整 Prompt 快照/恢复未查到 [E9] | ✓ 事件型自动化能力；完整触发器范围待核 [E9] | ✓ 通过会话描述、模板创建 [E9] | ✓ 官方自动化模板；通用配置导出未查到 [E9] |
| Manus | ✓ 支持不重复调度及结束条件 [E10] | ✓ 最短 5 分钟等间隔/Cron [E10] | 未查到明确的总执行次数限制 [E10] | 未查到 [E10] | ✓ 可选 Same task / New task [E10] | ✓ Updates 运行记录；快照/会话恢复细节未查到 [E10] | ✓ 应用事件、Webhook [E10] | ✓ 自然语言创建自动化 [E10] | 未查到通用配置导入导出；有自动化示例 [E10] |

关于矩阵中两个容易误读的地方：

第一，Copilot CLI 与 Copilot Cloud Automations 必须拆开。 CLI 的 /after、/every 是本地交互会话中的定时提示机制；Cloud Automations 则是由 GitHub 云端 Agent 根据时间或仓库事件启动任务。不能将其中一方的功能直接记到另一方名下。[E11]

第二，DeepSeek Harness 也必须拆分内置 Schedule 与外部 cron 插件。 内置 Schedule 的核心语义是"在原会话里投递提醒"，而 dsh-cron-scheduler 是在到期时启动新的 Agent 运行。两者在运行时机、会话隔离、无人值守能力方面不是同一种产品能力。[E4]、[E5]

### 四、B. 九项能力的业界共识

**C1. 一次性任务：指定时刻运行一次，并在结束后终结**

业界现状：有先例，但"只运行一次"和"有完整生命周期终态"不是一回事。

- OpenClaw 支持绝对时间调度，并提供 --delete-after-run，适合执行后清理任务。[E3]
- DeepSeek Harness 支持绝对时刻或延迟提醒，已交付的一次性提醒仍可在任务列表中查看，需显式删除。[E4]
- GitHub Copilot CLI 的 /after 是延迟后运行一次，并不等同于任意指定日期时间的完整生命周期管理。[E11]
- Manus 明确提供不重复的调度及结束条件。[E10]

分歧主要在执行完之后：删除任务、标记为已完成、保留已结束记录，还是继续保留可编辑的任务对象。对于桌面工作台，建议将调度状态和执行状态分开设计：例如 active / completed / expired / disabled 与每次运行的 queued / running / succeeded / failed / skipped 分离。

**C2. 固定间隔：每 N 分钟 / 小时**

固定间隔已有多个明确先例，但不能把 Cron 表达式与固定延迟混为一谈。

- OpenClaw 直接提供 --every 10m、--every 1h 等表达。[E3]
- DeepSeek Harness 的 every_seconds 按创建时刻对齐，且明确区分固定间隔与每天某个本地时刻。[E4]
- n8n 的 Schedule Trigger 直接提供秒、分钟、小时等间隔单位。[E6]
- Manus 支持间隔调度与 Cron。[E10]
- Cursor 提供预设频率及 Cron 表达式。[E1]

关键分歧在于语义：例如"每 60 分钟"究竟是从创建时间开始，每过 60 分钟触发，还是每个整点触发。产品必须明确规定错过调度后的补跑、跳过和重新对齐规则，不能只展示一个模糊的"每小时"。

**C3. 执行次数上限：运行 N 次后自动停止**

本轮已核实的官方资料中，没有找到足以确认上述代表性产品原生提供通用 max_runs = N 的证据。

现有产品常见的是：

- 任务结束时间或调度结束日期。
- 一次性执行后删除。
- 用户手动停用或删除。
- 单次执行的时长、调用量或成本限制。

这些都不等价于"无论成功、失败或跳过，累计触发 N 次后自动停止"。特别是 Devin 文档中的 invocation limits 或 ACU 限制，也不能直接认定为任务总运行次数上限。[E9]

建议将"最大触发次数"与"最大成功次数"视为不同的配置项。如果只实现一个，必须明确失败和跳过是否计数，否则用户可能以为任务会在成功 N 次后结束，而系统实际已经运行了 N 次却没有成功。

**C4. 并发控制：上一轮未结束时怎么办**

官方文档里明确写出可供每个任务选择的"跳过 / 排队 / 取消旧运行 / 允许并行"四种策略的证据不足。

当前可观察到的产品差异主要是：

- 每次运行创建独立 Agent 会话。
- 将到期消息投递到已有会话。
- 通过调度器对错过的执行进行跳过或补跑。
- 由运行时管理任务排队或执行。

n8n 明确提供错过调度时的处理选项，但那是处理实例停机导致的 missed execution，不等同于"上一轮 Agent 仍在运行时如何并发"。[E6] DeepSeek Harness 内置 Schedule 的交付语义也不能推导出完整的 Agent 并发控制面板。[E4]

对于本地 Agent，建议至少先实现一种明确且可解释的默认策略，例如 同一任务不重叠执行，到期时跳过并记录原因。如果后续需要，才开放排队和允许并行；"取消旧运行"应单独设计，因为它可能中断写文件、Git 操作或外部副作用。

**C5. 跨运行状态：下一次运行如何知道上次发生了什么**

这是本次调研最值得关注的产品设计分歧。

- 机制 A：专用持久记忆。Cursor Automations 提供 Memories，Agent 可以在同一自动化的不同运行之间读取和写入持久笔记。这不是把上一轮完整输出直接拼进下一轮 prompt。[E1]
- 机制 B：复用同一个任务上下文。Manus 提供 Same task / New task 选择。Same task 会继续使用之前的消息、文件和结果；New task 则重新开始。[E10]
- 机制 C：固定会话或工作区状态。DeepSeek Harness 内置 Schedule 把到期内容交付给原会话；cron 插件则每次创建新会话，并将会话关联到所属工作区。[E4][E5]

另一个普遍可行的实现是把状态写入工作区文件、数据库或任务产物，由下一轮 Agent 主动读取。不过，不能仅凭某产品支持工作区或文件读写，就认定它原生实现了跨运行状态管理。

因此，目前能确认的是多种机制并存，而不是业界已统一采用某一种机制。在产品设计上，建议将"执行历史""共享工作区""持久记忆"和"自动注入上一轮输出"设计为独立能力，避免相互绑定。

**C6. 运行记录：保存实际 Prompt 快照并恢复会话**

留存运行历史已有先例；完整的、逐次的实际 Prompt 快照与恢复能力，证据远少于普通运行日志。

- GitHub Copilot Cloud Automations 可以查看其启动的会话和会话日志。[E2]
- OpenClaw 提供运行记录查询，并支持输出投递。[E3]
- Manus 的 Updates 可以查看每次运行及结果，并从失败运行进入问题排查。[E10]
- n8n 支持查看工作流执行记录，并导入导出工作流定义。[E6]

这里需要明确区分三类数据：

- 任务定义：用户配置的基础 prompt。
- 实际执行输入：某次运行最终提交的 prompt，可能包含动态变量、事件负载、上下文和系统指令。
- 会话快照：包含消息历史、工具调用、运行状态等，可用于恢复或重放。

只保存第一类并不等于保存了每次运行的真实输入；保存第三类也不必然意味着可以安全、确定性地重新执行外部副作用。

对于桌面 AI 工作台，建议最少保存任务定义版本、实际用户 prompt、触发原因、运行时间、结果摘要和错误信息。完整的系统提示词、工具参数、凭据等内容则需要有明确的脱敏与权限边界。

**C7. 非定时触发器：Webhook、代码托管事件、协作工具、API / CLI**

多触发器的产品先例明确存在，但可组合范围和鉴权能力差异很大。

- Cursor 支持计划调度、GitHub / GitLab 代码事件、Slack、Linear 和 Webhook；一个自动化可以配置多个触发器，任一触发器触发即可运行。[E1]
- GitHub Copilot Cloud Automations 支持计划调度以及 Issue、PR 相关事件，并允许为自动化配置多个触发器。[E2]
- OpenClaw 支持定时任务、Webhook，以及 Gmail PubSub 等事件接入。[E3]
- Manus 支持应用事件和 Webhook，创建后可以查看 Webhook URL 与鉴权 Header。[E10]

Webhook 鉴权应单独作为能力核验，不能从"支持 Webhook"直接推断其支持签名验证、密钥轮换、时间戳防重放或 IP 白名单。

建议将触发器设计为可扩展集合，而不是让任务类型与某一种触发器绑定。每个触发器需要有独立的配置、启停状态、鉴权设置和触发负载记录，并规定同一任务的多个触发器同时触发时如何去重。

**C8. AI 辅助创建：自然语言生成配置，或从当前会话保存**

自然语言辅助创建已有明确先例，但"将调试好的当前会话一键保存为定时任务"并不是同一个能力。

- Cursor 的 /automate 可从本地 Agent 会话中描述需求，由系统配置触发器、指令和工具。[E1]
- DeepSeek Harness 可在当前对话中要求模型创建提醒。[E4]
- Devin 提供通过会话描述、自动化模板创建任务的工作流。[E9]
- Manus 支持在任务、Project 或 Web App 中直接描述需要周期执行的工作。[E10]

这些机制证明 AI 辅助创建值得考虑，但不代表所有产品都能将当前调试会话中的上下文、工具授权、运行环境和输入参数完整转化为可复用的调度配置。

建议优先实现"自然语言生成草稿 → 用户确认 → 保存"，并将当前会话保存为任务作为后续增强项。创建时应显示解析后的频率、时区、触发器、目标工作区、工具权限和结束条件，避免模型误解自然语言时间表达后直接启动无人值守任务。

**C9. 配置导入导出与分享**

工作流自动化平台更容易具备文件化配置和跨环境迁移；Agent 产品更常见的是模板、项目指令或会话上下文复用。

- n8n 明确支持工作流 JSON 下载、导入文件、URL 导入，以及跨实例迁移。[E6]
- Cursor 提供自动化模板市场。[E1]
- Devin 提供自动化模板。[E9]

需要注意：模板分享并不等于完整的可移植配置。任务可能依赖模型、工作区路径、环境变量、MCP 工具、外部账号授权、Webhook 密钥或本地运行环境。

如果桌面工作台将配置文件化，建议分离可分享的任务定义和不可直接分享的运行凭据；导入时对缺失工具、权限、路径和密钥做校验，而不是直接激活任务。

### 五、C. 三个砍 / 留判定问题

**(a) 执行次数上限是不是业界普遍能力？**

结论：不是已证实的普遍能力；在本轮核查的代表性产品中，没有找到通用的原生 max_runs = N 能力的充分证据。

| 能力 | 证据判断 |
|---|---|
| 指定结束日期 | 部分产品支持 |
| 只运行一次 | 有明确先例 |
| 单次运行时长或成本限制 | 部分产品支持，但不是次数上限 |
| 总共触发 N 次后自动停 | 未找到足以确认原生支持的官方证据 |
| 成功 N 次后自动停 | 未找到足以确认原生支持的官方证据 |

建议：保留为可选的进阶能力，不必作为首版必做项。但如果你们的定时任务面向无人值守 Agent，次数上限具有实际价值：它可以限制意外重复执行和长期运行的成本。建议同时设计：

- max_runs：最多触发多少次，是否包含失败和跳过必须明确。
- end_at：截止时间。
- max_consecutive_failures：连续失败达到阈值后暂停。

这三项是不同的保护机制，不能用一个"结束条件"笼统替代。

**(b) 并发控制是普遍暴露为每任务配置，还是产品直接定死一种行为？**

结论：本轮没有足够证据证明行业普遍将并发策略开放为每任务配置；不能把"运行时有某种行为"误判为"用户可以配置"。

建议采用以下最小方案：

| 优先级 | 功能 | 建议 |
|---|---|---|
| P0 | 明确默认策略 | 同一任务不允许重叠执行，到期时跳过并记录原因 |
| P1 | 排队 | 用户可选择等待上一轮完成后执行 |
| P1 | 跳过 | 用户可选择忽略本次触发 |
| P2 | 允许并行 | 允许同一任务存在多个运行实例 |
| P2 | 取消旧运行 | 单独实现，要求 Agent 运行时支持安全取消 |

首版最重要的是定义并记录行为，而不是提供尽可能多的开关。尤其不能将"取消旧运行"当作普通并发策略，因为它可能发生在 Agent 已经修改文件、提交代码或调用外部 API 之后。

**(c) "自动携带上次运行输出"有没有先例，还是业界都用持久记忆 / 状态文件替代？**

结论：不能说业界都使用持久记忆或状态文件替代；至少存在复用同一任务上下文的明确先例，但本轮没有确认普遍的"自动把上次完整输出附加到下一轮 prompt"机制。

可以确认的机制包括：

- Cursor：自动化级别的持久 Memories。[E1]
- Manus：可选择复用同一任务上下文，或每次新建任务。[E10]
- DeepSeek Harness：内置 Schedule 将提醒投递到原会话；外部 cron 插件则新建会话并关联工作区。[E4][E5]

这三种机制对应不同的产品取舍：

| 机制 | 优点 | 主要问题 |
|---|---|---|
| 自动附加上次完整输出 | 实现直观、容易理解 | 上下文持续膨胀，成本增加，旧信息可能干扰判断 |
| 复用同一会话 / 任务 | 上下文连续，用户容易追踪 | 历史增长、上下文压缩和会话恢复复杂 |
| 持久记忆 | 可以只保留重要信息 | Agent 需要维护记忆，可能出现过期或错误信息 |
| 工作区状态文件 / 数据库 | 结构明确、可审计、适合机器处理 | 需要定义格式、版本和冲突处理 |

建议：首版不必自动附加完整的上次输出。 可以优先提供"每次独立运行 + 共享工作区"，并支持用户显式选择是否读取上次结果。对需要连续演进的任务，再增加持久记忆或同一任务上下文模式。

### 六、最终功能取舍建议

建议首版保留：

- 一次性任务及明确的完成状态。
- 固定间隔与日历 / Cron 调度两种表达。
- 明确的默认并发策略、跳过记录及失败状态。
- 运行历史、Prompt 版本、错误信息与结果摘要。
- 共享工作区与明确的跨运行上下文规则。
- 自然语言生成任务草稿，保存前允许检查配置。

建议首版暂缓：

- 通用执行次数上限的复杂组合策略。
- 允许并行、自动取消旧运行等高级并发选项。
- 所有第三方事件源、通用触发器市场与完整 Webhook 管理平台。
- 自动将完整历史输出注入下一轮 prompt。
- 完整任务配置市场及跨机器无缝迁移。

以上取舍基于已核实的机制与当前证据缺口，不代表被暂缓的能力没有用户价值。若产品主要面向无人值守的高风险操作，应提高并发安全、执行上限、审计和失败保护的优先级。

### 七、调研局限与后续核验

本报告是以官方证据为边界的能力盘点，不是对所有产品逐项完成的源码审计。特别是 WorkBuddy、TRAE、Windsurf、Dify、Claude Cowork 及 Claude Code Routines 的完整功能规格，仍需补齐官方文档或仓库证据。对应能力目前保留「未查到」，不应直接作为竞品不支持的依据。

建议在正式立项评审前，再做一轮定向核验，优先检查以下三项：

1. 是否存在原生的最大执行次数或最大成功次数限制。
2. 上一次 Agent 尚未完成时，到期触发究竟如何处理，是否允许用户按任务配置。
3. 是否存在真正的上一轮输出自动注入机制，而非共享会话、持久记忆或工作区复用。

这三项最直接影响调度器复杂度、运行成本和用户对无人值守执行的信任，适合作为下一轮调研的重点。】
