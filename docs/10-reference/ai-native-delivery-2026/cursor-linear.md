# Cursor 与 Linear：一个 Builder 怎样组织跨会话的 AI 交付

> **读者与边界**：供独立负责项目的 Builder、共享 SE/Leader 及 BW 产品决策者盘点存量价值。主要研究 2025-10-09 至 2026-10-09 的变化，截止与访问日均为 2026-10-09；一项更早的客户反馈机制仅作背景。只研究官方公开机制、自用经验与效果口径，不替代 BW 产品原则或实测。结构为结论、时间线、工作故事、指标、建议、局限与来源；产品状态、证据或内部实验变化时更新。Markdown 为内容正源，同名 HTML 为生成投影。

## 结论：原生工具已进入项目组织，BW 必须证明增量

**【综合判断】** “编码工具负责开发、BW 负责计划和验收”的分工已经不够稳固。Cursor 的 Projects 于 2026-09-10 开始向所有用户推出 beta，面向超过一次聊天的工作；Linear 从已有客户请求与项目关系出发，加入 coding sessions、运行环境及浏览器验证。两者正在压缩上下文搬运、持续调度和验证交接。BW 若仅增加四个页面，容易重复已有信息；候选价值应是减少“等人决定什么、证据在哪里、这次交付是否解决原问题”的成本。[S4](https://cursor.com/blog/projects)、[S5](https://linear.app/changelog/2026-06-11-coding-sessions)、[S6](https://linear.app/changelog/2026-08-20-coding-environments)

**【职责事实】** Linear 区分人类 assignee 与 agent delegate：代理执行，指定的人仍负责。Cursor 的协调者与工作者分工也不是取消判断，而是让总体决策少受执行细节干扰。小团队值得抄的是清楚的决定权、可复用上下文和可检查产物；不需要先复制企业组织层级。[S10](https://linear.app/docs/assigning-issues)、[S2](https://cursor.com/blog/agent-swarm-model-economics)

## 近一年变化：研究、试用与已发布分开看

| 日期 | 机制及状态 | 变化的含义 |
|---|---|---|
| 2026-01-14 | Cursor 长任务研究：拆分规划者、工作者和迭代判断 [S1](https://cursor.com/blog/scaling-agents) | 数周运行是实验，不能当作成熟交付承诺 |
| 2026-04-08 | Bugbot 从评审反馈学习规则；文中称学习功能 beta [S3](https://cursor.com/blog/bugbot-learning) | 从每次重新提醒，转向可调整的持续质量约束 |
| 2026-06-11、06-18 | Linear 发布云端编码会话及项目更新草稿 [S5](https://linear.app/changelog/2026-06-11-coding-sessions)、[S7](https://linear.app/changelog/2026-06-18-agent-assisted-project-updates) | 工作上下文进入执行，状态整理也减少人工搬运 |
| 2026-07-02、07-20 | Linear 扩展 initiative 状态与优先级；Cursor 发表新版 swarm 实验 [S8](https://linear.app/changelog/2026-07-02-initiative-properties)、[S2](https://cursor.com/blog/agent-swarm-model-economics) | 高层目标组织与底层 agent 协作是不同问题 |
| 2026-08-20 | Linear 编码会话新增环境配置及浏览器测试 [S6](https://linear.app/changelog/2026-08-20-coding-environments) | 产物从代码差异延伸至运行与画面证据 |
| 2026-09-10 | Cursor Projects beta [S4](https://cursor.com/blog/projects) | 跨会话共享上下文、云端执行和事件订阅进入产品；不能仍把它描述成纯 IDE 补全 |

## 三条工作故事：步骤压缩了，哪些判断仍在人

### 故事一：一位 Builder 修复真实客户阻塞

**【按已发布机制重建的路径，非实测案例】** 客户报告“导出后筛选条件丢失” → 将原始请求关联 issue，写复现条件与期望结果 → 人确认影响和优先级，保留负责人并委派 agent → Linear 会话携带历史、客户请求及讨论，用 Claude Code 或 Codex 产生修改 → 配置环境后运行浏览器旅程，返回差异和前后截图 → 人检查验收、决定发布，再回到原请求确认问题解决。[S5](https://linear.app/changelog/2026-06-11-coding-sessions)、[S6](https://linear.app/changelog/2026-08-20-coding-environments)、[S10](https://linear.app/docs/assigning-issues)

被压缩的是重新解释问题、搭环境、搬运修复与验证结果。人仍需给可复现输入、判断需求是否值得做、处理缺失凭证和环境配置，以及确认测试覆盖真实客户路径。截图证明一次被执行的旅程，不自动证明客户满意或生产环境无回归。

### 故事二：迁移可以跑三周，但“跑完”不等于可发布

**【官方自用实验】** Cursor 一月披露内部 Solid→React 迁移连续超过三周，通过 CI 和初步检查时仍需仔细评审。早期平权 agent 用共享锁协调，20 个 agent 的有效吞吐只剩两三个；去掉锁后又出现回避难题、反复做安全小改的问题。[S1](https://cursor.com/blog/scaling-agents)

七月研究进一步承认早先浏览器实验远未成为打磨完善的软件；多规划者会形成互不兼容的设计，工作者处理冲突会覆盖或放弃修改。一月移除“集成人”以免形成瓶颈，七月在更大规模研究中又引入中立冲突处理 agent。**【判断】** 组织办法依赖任务和规模，不宜抄成固定多 agent 流程。[S2](https://cursor.com/blog/agent-swarm-model-economics)

九月的 Projects 自用描述已改为与协调者先确定迁移方案，再逐个 PR 推进，早期密切评审；共享文件保存历史，订阅使工作可持续。**【单 Builder 应用假设】** 同一位 Builder 定义兼容边界并核对高风险路径，必要时带具体问题请共享 SE 复核；agent 承担有边界的批次，留下回退条件与未验证项。首个批次不过关就收缩，避免积累一个无人能审的大差异。[S4](https://cursor.com/blog/projects)

### 故事三：跨周继续做什么，从客户请求而非完成数量出发

**【产品事实与应用推断】** Linear 早在 2025-04-30 已让客户请求关联项目，并汇总项目下 issue 的客户请求；这是研究窗口前的基础。2026 年项目更新可从上次更新后的 issue、文档、讨论和关联 Slack 生成草稿，由人补判断再发布；initiative 将项目连接到高层目标，并能明确取消。[S9](https://linear.app/changelog/2025-04-30-customer-requests-on-projects)、[S7](https://linear.app/changelog/2026-06-18-agent-assisted-project-updates)、[S8](https://linear.app/changelog/2026-07-02-initiative-properties)

对于独立负责该项目的一位 Builder：几位试用者都卡在导出 → 聚成一个用户问题 → 本周只改最影响完成任务的环节 → 下周自动整理变化和请求 → 人比较失败率、回访与新增投诉，决定继续或取消。共享 Leader 按需看到同一份变化与决定，支持跨项目取舍。工具支持关联和整理；它没有替 Builder 证明需求规模，也没有把“项目完成”变成“用户问题消失”。对当前这个单人项目，问题→issue→交付证据即可，不必再添 initiative 层。

## 指标机制：官方数字具体说明了什么

| 官方证据 | 样本、口径及限制 | 对 BW 的启示 |
|---|---|---|
| Bugbot 报告 78.13% resolution rate [S3](https://cursor.com/blog/bugbot-learning) | 50,310 个公开仓库 PR；由 LLM 判断评审评论在合并前是否被处理。不是缺陷召回率、线上事故率或随机对照；未处理也可能是有效但延后修复的建议 | 记录误报、漏报和处理成本，不能用采纳率替代质量 |
| Linear 自报约 30% 新进入的 bug reports 被其内部自动流程解决，多数首轮成功 [S5](https://linear.app/changelog/2026-06-11-coding-sessions) | 未公开样本量、周期、难度分布和解决后的复发；不证明任意团队省下 30% 工时 | 对比真人介入时间、重开和回归，并保留分母 |
| Projects 声称新用户多合并 30% PR、主要使用者达 6 倍 [S4](https://cursor.com/blog/projects) | 未给样本、对照和任务规模；熟练用户选择、PR 拆分均可能影响结果 | PR 数只能描述活动；另看用户任务成功和返工 |

**【可借鉴机制】** Bugbot 从人的反应、评论和人工评审遗漏中生成候选规则，持续评估后启用，也能降级或由人修改。[S3](https://cursor.com/blog/bugbot-learning) BW 可借鉴“证据改变后续行为”，但不应让低样本的单次赞同直接固化成规范。

## 对一位 Builder、共享 SE/Leader 与 BW 的取舍及反证

以下均为**待内部验证的建议**，不是本次新增功能要求。

| 已有能力 | 优先复用、精简或实验 | 反证：何时应收缩 |
|---|---|---|
| 总览 | 聚焦现在等人决定的阻塞、待审证据、失联客户问题；从现有 issue/PR 推导 | 若只重复原生会话列表和状态，新增页面没有增量 |
| 计划 | 只保存本轮要解决的用户问题、选择依据、最小验证及停做条件；任务拆分交执行核 | 若维护计划耗时超过省下的决策时间，减少字段与周期仪式 |
| 验收 | 将声明、实际执行路径、证据出处和未覆盖范围并排，保留人确认 | 若只是 agent 自报完成或重复测试日志，不能宣称降低交付风险 |
| 指标 | 区分执行吞吐、质量与用户结果；先选一个真实旅程测失败/重试/返工 | 没有使用数据时保持未知；数字不能改变下一步取舍就不必常驻 |

**【最小实验】** 连续观察两轮真实小交付，用现有 issue/PR 与原生工具作基线，再让 BW 帮同一类任务整理一次。记三项：人补上下文和找证据的时间、评审退回/发布后重开、原问题是否得到用户确认。样本小只判断机制是否有用，不报告统计显著提效。必须同时记手填与维护成本，不能只计生成报告的速度。

**【不适用】** 不照搬 Cursor 研究中的千级并行、专用版本控制或允许暂时破坏核心构建的实验办法；也不因 Linear 有公司级目标而给小团队加层级。执行环境不足、测试无法访问真实依赖时，先修环境；把待验证项画成绿色没有价值。

## 局限与未决

这里的可用性来自官方发布与文档，没有登录试用、运行 benchmark 或核验厂商内部数据。研究文章是第一手经验，但不等于独立复现。Projects 仍应按 beta 评估；本文没有找到这十项来源能证明“加计划/总览界面本身提升用户结果”。

仍需 BW 内部回答：用户目前丢失的是原始需求、执行上下文、等待中的决定，还是证据？现有 Orca 能直接承接哪一段？原生产品继续增加项目能力后，BW 能否仍减少一次实际操作？哪个真实案例即使 PR 全部合并仍没有解决用户问题？应先收集这些反例，再决定四块能力如何保留。

## 来源表

日期为页面标示的原始发布日；未单列更新日的页面不推测其更新日期。全部访问于 2026-10-09；S9 明确在研究窗口之外，S10 无公开日期。

| 编号与一手来源 | 发布/更新日期 | 访问日 | 支持主张与证据性质 |
|---|---|---|---|
| S1 [Scaling long-running autonomous coding](https://cursor.com/blog/scaling-agents) | 2026-01-14；更新未标 | 2026-10-09 | 长任务、迁移、协调失败；官方实验 |
| S2 [Agent swarms and the new model economics](https://cursor.com/blog/agent-swarm-model-economics) | 2026-07-20；更新未标 | 2026-10-09 | 设计冲突、合并与评审机制；官方研究 |
| S3 [Bugbot now self-improves with learned rules](https://cursor.com/blog/bugbot-learning) | 2026-04-08；更新未标 | 2026-10-09 | 学习规则、50,310 PR 与 LLM 评判；产品与厂商评估 |
| S4 [Introducing Projects](https://cursor.com/blog/projects) | 2026-09-10；更新未标 | 2026-10-09 | beta、共享上下文、跨 PR 自用及吞吐主张；发布与营销 |
| S5 [Coding sessions in Linear](https://linear.app/changelog/2026-06-11-coding-sessions) | 2026-06-11；更新未标 | 2026-10-09 | 上下文到代码、内部 30% 主张；发布与自报 |
| S6 [Coding sessions: environments, browser use, and updated pricing](https://linear.app/changelog/2026-08-20-coding-environments) | 2026-08-20；更新未标 | 2026-10-09 | 环境配置、浏览器测试、截图；产品发布 |
| S7 [Agent assisted project updates](https://linear.app/changelog/2026-06-18-agent-assisted-project-updates) | 2026-06-18；更新未标 | 2026-10-09 | 由事实生成草稿、人修改发布；产品发布 |
| S8 [Initiative properties](https://linear.app/changelog/2026-07-02-initiative-properties) | 2026-07-02；更新未标 | 2026-10-09 | 目标与项目、取消/优先级；产品发布 |
| S9 [Customer Requests on projects](https://linear.app/changelog/2025-04-30-customer-requests-on-projects) | 2025-04-30；窗口外基础 | 2026-10-09 | 客户请求关联 issue 与项目；产品发布 |
| S10 [Assign and delegate issues](https://linear.app/docs/assigning-issues) | 发布/更新日均未标 | 2026-10-09 | 人负责、agent 被委派；现行文档 |
