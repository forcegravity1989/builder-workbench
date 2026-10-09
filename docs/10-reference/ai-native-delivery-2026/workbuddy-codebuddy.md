# WorkBuddy 与 CodeBuddy：小团队怎样把 AI 产出变成可交付软件

> **读者与边界**：供 1–3 人 Builder 团队及 BW 产品决策者盘点已有能力；研究窗口为 2025-10-09 至 2026-10-09，截止与访问日均为 2026-10-09。本文区分 WorkBuddy 工作台、CodeBuddy IDE/插件、CodeBuddy Code CLI，不以办公案例证明研发成效，不替代 BW 产品原则、规格或实测。结构为结论、时间线、工作故事、指标机制、建议、局限、来源与未决；版本、官方证据或内部实验变化时更新。Markdown 是内容正源，同名 HTML 为阅读投影。

## 结论：交付动作正在压缩，判断责任仍在人

**【综合判断】** 腾讯这组产品正在把“提需求、找上下文、写代码、跑工具、预览和发布”放进持续会话，并用工作树隔离、共享上下文和可复用编排减少人来回搬运。对已经有 Orca 的 Builder，BW 的候选价值应落在三个可观察问题：是否选对本次要解决的问题；是否拿到可核对的交付证据；是否因此作出下一次取舍。再加一份计划或总览，并不能自动回答它们。

**【产品事实】** WorkBuddy 提供通用任务及代码开发入口；CodeBuddy IDE/插件聚焦开发环境；CodeBuddy Code 是可融入终端、脚本和流水线的执行工具。Enterprise 是组织治理与产品组合层，不能当作第四种研发完成机制。WorkBuddy 文档说明兼容用户级 `.codebuddy` 配置，但这不证明三个端所有命令、权限和状态完全一致。[产品形态 S1](https://cloud.tencent.com/product/acc)、[配置兼容 S2](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting)、[Enterprise S18](https://cloud.tencent.com/product/workbuddy-enterprise)

## 近一年可确认的新变化

| 日期与主体 | 已发布变化 | 对少人交付的意义与边界 |
|---|---|---|
| 2026-03-04，WorkBuddy 4.5.0 | 官方日志记载正式发布，包含文件、终端、技能及产物预览 | 开始形成可执行工作台；不是十月之前已存在一整年的成熟证据 |
| 2026-05-27，CodeBuddy Code 2.99.0 | `/goal` 持续推进，评估满足条件才停止 | 减少逐轮催促；完成依据仍取决于条件和会话证据 |
| 2026-06-03，WorkBuddy 5.0.0 | 团队项目、计划看板、共享资产、任务流转 | 团队接续与项目安排已进入原生产品 |
| 2026-06-09，CodeBuddy Code 2.105.0 | Dynamic Workflow、研究编排、运行管理与脚本复用 | 将重复分派写成可重跑脚本，减少人工组织多个 Agent |
| 2026-08-20，WorkBuddy 5.4.0 | Worktree 并行开发任务、分支与终端面板 | 隔离并发改动；合并冲突和集成正确性仍须验证 |
| 2026-09-20，CodeBuddy IDE 4.12.1；09-21，WorkBuddy 5.6.2 | 前者统一项目记忆格式并改善上下文；后者修复任务卡住、历史与状态错误 | 持续上下文、可靠恢复和流畅审阅本身就是交付能力 |

日期分别见 [S3 WorkBuddy 日志](https://www.workbuddy.cn/docs/workbuddy/Changelog)、[S4 CLI 日期索引](https://www.codebuddy.cn/docs/cli/release-notes/README)、[S5 Goal 发布](https://www.codebuddy.cn/docs/cli/release-notes/v2.99.0)、[S6 Workflow 发布](https://www.codebuddy.cn/docs/cli/release-notes/v2.105.0)、[S7 IDE 日志](https://www.codebuddy.cn/docs/ide/release-notes/release-notes)。CLI 索引已列到 2026-10-07 的 2.162.0，本次未取得该版正文，故不推断其新增能力；无日期的操作文档只证明当前官方描述。

## 两个完整工作故事：从明确问题到可判断的交付

以下是依据官方机制重构的使用路径，**不是客户成功案例或本次实测**。时间节省与业务收益均待验证。

### 故事一：一个 Builder 把课程预约从想法交给真实用户

**触发与输入。** 老师正在手工整理预约。Builder 给 WorkBuddy 的代码开发入口说明：谁预约、每时段名额、老师如何查看、数据是否持久保存。官方网页应用指南已经把用户操作与数据保存列为需求重点。[S8](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Web-App)

**执行与产物。** 同一会话生成应用，按需开启数据库、身份认证和存储，再发布为在线应用；减少的是搭环境、接云服务和部署配置的机械步骤。设计需要修改时，以运行界面和反馈继续迭代。另一本本地应用教程展示了“生成—尝试运行—描述异常—继续排查”的交互方式，但它只覆盖本地工具，不能移作线上可靠性证据。[S8](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Web-App)、[S9](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Practice-Seven)

**仍由人决定。** 是否真需要账号体系、是否收集手机号、取消与超额预约怎么处理、何时公开上线。建议验收必须实际覆盖两人抢最后名额、越权看名单、刷新后读回记录，并观察老师是否真的减少整理时间。这些是本报告提出的验证点，官方教程未给出通过率。发布成功说明地址可访问，不等于用户问题已解决。

### 故事二：两名 Builder 在既有仓库完成一次接口迁移

**触发与输入。** 已有调用方需要迁移，不能破坏线上兼容。第一人确定目标接口、不改范围和可运行的验收命令；让 CodeBuddy Code 先读工程再提出方案。官方最佳实践强调给具体文件与约束，小而明确的改动无需额外计划过程。[S10](https://www.codebuddy.cn/docs/cli/best-practices)

**执行与产物。** 将独立模块交给隔离工作树会话，第二人同时核对接口契约和集成环境；Agent 修改、运行测试、根据失败继续，形成 diff、执行输出和 MR。工作树减少文件相互覆盖；重复的跨模块审查可以保存为 Workflow。它压缩分派、上下文重述和反复催促，不能消除共享接口冲突。[S11](https://www.codebuddy.cn/docs/cli/common-workflows)、[S12](https://www.codebuddy.cn/docs/cli/workflows)

**最关键边界。** `/goal` 的评估器只读会话里已表达的内容，不自己运行命令或读取文件。即使显示达成，第二人仍应在实际合并版本核对测试和集成行为；由负责人决定合入及发布。将“测试通过”设为终态时，还要防止 Agent 改弱判据。这是证据责任的迁移，不能交给绿色状态代替。[S13](https://www.codebuddy.cn/docs/cli/goal)

## 哪些责任被压缩，哪些仍必须有人承担

| 环节 | AI 机制能省下的动作 | 1–3 人团队需要保留的判断 |
|---|---|---|
| 需求与设计 | 检索上下文、整理约束、生成可看方案 | 用户是谁、问题优先级、范围和体验是否合适 |
| 开发与调试 | 多文件修改、工具执行、根据报错续做 | 接口、数据和权限边界；何时中止错误方向 |
| 测试与审阅 | 生成测试、运行命令、汇总 diff 与发现 | 判据是否代表真实风险，证据是否对应交付版本 |
| 发布与反馈 | 云资源接入、发布、保存产物与上下文 | 上线授权、回退条件，以及使用后是否有效 |

**【综合判断】** 小团队可以把角色交接压成围绕同一个可运行产物的数次决定，不必把产品、设计、开发、测试各做一遍独立填报。团队越小，越应关注从问题到可信结果的总时间，而非 Agent 数、生成代码量或文档份数。

## 指标与效果：现有证据能说明多少

**【营销证言】** WorkBuddy 产品页有用户声称办公单环节提效超过 90%，同时提到报错、重试和卡顿；页面未披露任务样本、计时方法、失败分母或对照。这既不能外推研发，也不能证明总体交付快了 90%。[S14](https://cloud.tencent.com/product/workbuddy)

**【可复核的评测设计】** 官方 WorkBuddy Bench 提供 80 个 Code、70 个 Web、50 个 Office、60 个 Security 任务，共 260 个；通过隔离环境记录改动、轨迹、结果和效率。论文说明使用 CodeBuddy Code 与 Claude Code 两种执行框架，各子集评分工具不同，不报告统一平均分。这能支持任务级可重复验证；没有测量小团队几周内的真实用户收益、审阅负担与上线事故，不能作为 WorkBuddy 桌面已提高交付效率的结论。[S15](https://github.com/Tencent/workbuddy-bench)、[S16](https://arxiv.org/abs/2607.20911)

**【BW 建议】** 每个实际工作记录请求到可审产物、到人验收、到用户用上的时间；同时记录人工干预分钟、失败/返工次数、逃逸问题和一个用户结果。对比时保留失败任务，用复杂度相近的工作做配对；两周小样本只作方向信号，不声称因果收益。

## 对 BW：先复用，再精简，再作小实验

**复用。** 会话、工作树、工具、定时和运行状态优先沿 Orca 已有能力衔接；CodeHub 适配解决进入真实仓与真实评审的障碍，本身可有价值，但要用成功交付率与少掉的手工操作证明。

**精简。** WorkBuddy 已提供负责人、起止时间、计划视图和任务流转，并明确计划事项与 AI 会话是两种对象。BW 不能靠“也有计划屏”建立必要性，也应避免让用户在 Issue、聊天、计划和验收中重复描述同一工作。[S17](https://cloud.tencent.com/document/product/1831/138797)

**实验。** 在一个 1–3 人内部团队的真实交付上，先试“原生 Orca + 一份简短目标/证据记录”，再与 BW 四块比较。总览须减少寻找需干预事项的时间；指标须改变至少一次判断；计划须帮助少做无效工作；验收须发现“实现完成但用户目标未满足”。同时记录新增维护成本。若没有新增决定、只是重排已有信息，优先合并入口或移除必填步骤，而非再铺能力。

**不适用点。** 动态编排的官方说明提醒大量代理可能比普通对话消耗更多 Token，暂停恢复也仅限同一会话。一次小修不必先建立复杂编排；跨进程持续交付不能凭可恢复按钮推断。小团队应从一个目录或一项任务试跑后再扩大。[S12](https://www.codebuddy.cn/docs/cli/workflows)

**反证条件。** 若复用原生会话与现有 Issue 已能低成本达成上述结果，BW 四块就缺少独立价值；若真实用户没有可追踪的跨次交付问题，指标闭环也可能只是额外负担。反过来，只有能证明减少失焦、错判完成或重复核对，才值得继续投资。

## 局限与未决

本次为公开资料研究，未安装三端、未执行真实研发任务。部分站点直接抓取超时，内容通过官方页的搜索索引核对；文档日期缺失处保留未知。腾讯云开发者社区不是自动的一手来源，未经确认的转载提效数字未采用。已发布记录、官方未来承诺、我们的推断不可混用；本次没有找到带日期的“跨周用户结果验收闭环”公开路线图。

下一步需要实测：WorkBuddy 与 CodeBuddy 配置复用的实际边界；并行任务发生接口冲突后恢复代价；Goal 在错误测试与缺少日志时如何判断；云应用权限、回退与长期维护；BW 四块让内部用户做出了哪些原生会话无法低成本支持的决定。

## 来源表

所有来源访问日均为 **2026-10-09**；日期未知不以搜索抓取日替代。操作文档证明官方描述，发布日志证明版本变化，教程不等于成功率研究。

| 编号与标题 | 原始发布／更新日期 | 访问日 | 支持主张 |
|---|---|---|---|
| [S1 CodeBuddy 产品形态](https://cloud.tencent.com/product/acc) | 页面未标注 | 2026-10-09 | IDE、插件、CLI 主体边界 |
| [S2 WorkBuddy 系统设置](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting) | 页面未标注 | 2026-10-09 | 用户级配置兼容 |
| [S3 WorkBuddy 更新日志](https://www.workbuddy.cn/docs/workbuddy/Changelog) | 所引版本 2026-03-04 至 09-21 | 2026-10-09 | 发布、团队、工作树、恢复修复 |
| [S4 CLI 发布索引](https://www.codebuddy.cn/docs/cli/release-notes/README) | 索引列到 2026-10-07 | 2026-10-09 | 2.99、2.105 等日期 |
| [S5 CLI 2.99.0](https://www.codebuddy.cn/docs/cli/release-notes/v2.99.0) | 2026-05-27，日期由 S4 对照 | 2026-10-09 | Goal 发布 |
| [S6 CLI 2.105.0](https://www.codebuddy.cn/docs/cli/release-notes/v2.105.0) | 2026-06-09，日期由 S4 对照 | 2026-10-09 | 动态编排发布 |
| [S7 IDE 发布日志](https://www.codebuddy.cn/docs/ide/release-notes/release-notes) | 所引 4.12.1：2026-09-20 | 2026-10-09 | 记忆与上下文演进 |
| [S8 网页应用开发与发布](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/App-Publishing/Web-App) | 页面未标注 | 2026-10-09 | 全栈生成、云能力及发布路径 |
| [S9 本地应用教程](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Practice-Cases/Practice-Seven) | 页面未标注 | 2026-10-09 | 生成、运行、异常反馈 |
| [S10 CLI 最佳实践](https://www.codebuddy.cn/docs/cli/best-practices) | 页面未标注 | 2026-10-09 | 上下文与按需规划 |
| [S11 CLI 常见工作流](https://www.codebuddy.cn/docs/cli/common-workflows) | 页面未标注 | 2026-10-09 | 隔离工作树与 MR 路径 |
| [S12 Dynamic Workflows](https://www.codebuddy.cn/docs/cli/workflows) | 页面未标注；首发见 S6 | 2026-10-09 | 脚本编排与复用；同会话恢复限制 |
| [S13 Goal](https://www.codebuddy.cn/docs/cli/goal) | 页面未标注；首发见 S5 | 2026-10-09 | 评估器只读会话证据 |
| [S14 WorkBuddy 产品页](https://cloud.tencent.com/product/workbuddy) | 页面未标注 | 2026-10-09 | 办公提效证言及其口径缺失 |
| [S15 Tencent/workbuddy-bench](https://github.com/Tencent/workbuddy-bench) | README 未标注发布日期 | 2026-10-09 | 260 个任务及运行方法 |
| [S16 WorkBuddy Bench 论文](https://arxiv.org/abs/2607.20911) | 2026-07-23 | 2026-10-09 | 执行框架、分项评分边界 |
| [S17 WorkBuddy 项目](https://cloud.tencent.com/document/product/1831/138797) | 更新于 2026-09-24 | 2026-10-09 | 原生计划、协作与两类任务对象 |
| [S18 WorkBuddy Enterprise](https://cloud.tencent.com/product/workbuddy-enterprise) | 页面未标注 | 2026-10-09 | 产品矩阵与组织治理定位 |
