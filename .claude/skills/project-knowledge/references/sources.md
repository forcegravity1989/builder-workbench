# 来源、采用范围与验证责任

> 30 秒导读：下面记录借来的机制与本地适配。我们没有安装或复制这些框架来运行本 Skill；八类资产、逐篇清债、内容契约和共享条件是本包的综合设计，效果仍需实践。

一手页面核读日期：2026-09-15。网页和 main 分支会变化；本包用原创摘要表达机制，未固定所有上游快照，也未整体导入上游代码/提示词。未来复制或分发上游材料前核对固定版本和许可。

| 来源 | 借鉴与本包落点 | 没有照搬 / 怎样验证 |
|---|---|---|
| [BMAD 规划路径](https://docs.bmad-method.org/plan/choose-a-planning-path/) | 根据意图清晰度、范围和风险选择规划深度；对应本包任务分流 | 不安装其角色体系；文档小修无需完整新特性流程。验证小修能完成，缺决定的大变化能被识别 |
| [OpenSpec 概念](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) | 分清现行规格与拟变化，变化结束同步正本；对应 spec/变化记录与存量处置 | 不强迫创建 openspec 目录；BW 当前 spec 语义先适配。验证旧规格不与新行为并存冲突 |
| [Matt Pocock Skills](https://github.com/mattpocock/skills) | 技能职责拆分、共享词表与 ADR；对应按需方法和概念/决策正本 | 当前上游 README 也建议每次变更先 grill。本包的小修直接执行是结合 BMAD 与用户目标的主动适配，并非照搬 Matt。验证任务路由与知识同步 |
| [Matt writing-for-agents](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md) | 指针写明用途和读取条件，按任务分支加载；同一概念集中说明，步骤有可观察完成条件 | 先把本地入口实际读对，不默认把上游所有写作主张设为硬门禁；验证触发、阅读与交付 |
| [Diátaxis](https://diataxis.fr/) | 教程、操作、参考、解释按读者需要组织；对应使用文档契约 | 四类不是所有资产分类，也不强制每项生成四篇。验证读者能找到并完成具体任务 |
| [HEART 原论文页面](https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/) | 从用户目标选择指标；对应特性价值与衡量关系 | 不强制套满所有维度；引领假设和 BW 指标不是论文直接给出的。验证来源可采、结果能帮助判断 |
| [指标框架 Skill](https://github.com/mohitagw15856/pm-claude-skills/blob/main/skills/metrics-framework/SKILL.md) | 指标树、定义与衡量设计作为口径检查参考 | 社区 Skill 的自评分不构成效果证据；具体公式与阈值由项目验证 |
| [Example Mapping](https://cucumber.io/docs/bdd/example-mapping/) | 规则、具体例子、未决问题的对应关系；对应验收场景 | 不要求每次组织讨论会；已明确的规则直接写可执行例子。验证例子能暴露误解 |
| [TEA](https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/) | 风险导向测试与验收追踪作为验证设计参考 | 不假设支持目标平台的 Electron/Orca；测试执行器复用项目已有设施。验证证据确实覆盖要求 |
| [Harness engineering](https://openai.com/index/harness-engineering/) | 精简入口、可定位知识、机械检查与持续清理；对应维护和反哺 | 工程案例不是可安装完整规范；不采用其组织权限或自动合并政策。验证本项目实际效果 |

## 指令审查的固定来源

[Anthropic Prompt Audit 固定版本](https://github.com/anthropics/skills/blob/41bbe19d1a1a7eaab5e7bb9050a417e5c6cffc8f/skills/claude-api/shared/prompt-audit.md)，本地核读日期 2026-09-16。来自现有 prompt-audit 试验包，其验证脚本声明上游 SHA 为该版本；本轮读取文件的 SHA-256 为 571b08c181a8f3f0906a99045ff0bca88ca728d5a2d01afabb620b270c8048a2。未在本轮重跑整包上游一致性验证。

采用指令面/来源追查、必要内容保护、具体修订、依赖同步、行为复验；落点是 [指令专项审查](prompt-review.md)。不复制上游完整文本或软件包，不引入 Claude SDK/模型配置，模型特定结论须另查适用证据。原包许可证为 Apache-2.0；未来若复制上游材料需按固定版本处理许可。

## 验证责任

来源与机制已进入本包不代表效果已验证。代表输入见 [固定案例](../evals/cases.md)，静态检查、真实任务与修订复验结果分别留在对应 Git/PR/运行记录；不在本篇维护试用流水。反馈与复验程序见 [维护方法](maintenance.md)。

## 已研究但未选作主流程

- [Superpowers brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)：此前报告用于比较设计澄清与验证纪律。本包不把其审批流程作为所有小修默认路径；本轮没有重新核读其完整实现。
- [Spec Kit](https://github.com/github/spec-kit)：此前报告用于对照规格与实施的一致性。本包不引入另一套目录/制品链；本轮没有重新核读其扩展实现。

## BW 继承与用户要求

只读脚本与其确定性测试取自 BW 固定提交 `a2fbaf1d6359a3a13eea805c23ba963930e1796c` 的同名包（当时 main），仅复制本包四个 scripts 文件，未合并 Rust 产品实现。目标包按 bw-orca 适配范围分类与映射，保留无网络、源文件只读、仓外输出和未检查项协议；运行结果以当前 PR 为准，不继承来源分支的 CI 或模型效果结论。六环/带入三问读取目标分支原则 02，不在本包复制 main 的 Rust 验收设施。

- BW 的工作树、真实证据、人确认完成、Unknown 等是项目约束；不是上述框架带来的新设计。
- AGENTS/顶层与 docs 都可整改；规范、存量瘦身和配套维护同块交付；先把 BW 做成可实践样例。这些来自用户方向。
- 现有 standard/asset-audit 只作为实现现状核对，不作为本治理方法的正确性来源。
- 目录编号、现有测试/采集协议属于 BW 适配；其他项目先映射自己的结构。

## 每次采用或升级记录什么

在相关规则、原任务或 PR 中记录：解决的问题 → 来源与读取版本/日期 → 采用/调整/不采用 → 影响对象 → 实际验证及限制。能引用本表就不复制摘要；本地规则被证据否定时可以修改，不因来自高星项目而永久保留。
