---
name: project-knowledge
description: >-
  Establish and maintain a project's knowledge base: map document roles,
  define content and format contracts, refactor one document with its
  existing debt, connect features to metrics and acceptance evidence,
  and improve the method from real use. Use for 知识库治理、文档规范、逐篇整改、
  文档瘦身、特性指标验收梳理、知识老化和反哺. Route full feature-and-metrics
  inventory (project card → north star → features → leading/lagging metrics)
  to feature-metrics-inventory. Ordinary coding only needs the
  relevant project knowledge; it does not trigger a full knowledge audit.
metadata:
  version: 0.4.3-pilot
---

# 项目知识库治理

> 30 秒导读：先弄清文档职责，再改原文、清存量、接引用、验证。本包提供可携带的方法；项目已认可的规范决定当地正本。每次整改一个完整主题，维护本包也按同样标准执行。

## 起手与边界

用户说“盘点顶层几个 MD”或“整改 AGENTS”即可。自行识别目标、已有决定与适用契约，说明当前阶段、随后交付和真实待决事项，不要求用户补写 SOP。仅请求评审时只读；要求整改且依据与授权已充分时，完成实际修改与验证，不重复批准同一范围。

- 治理项目自己的产品、实现、使用知识和协作约定；本包属于开发方法，不是产品的知识库浏览功能，也不自动重构代码或分发规范。
- Skill 路径只定位方法；业务仓根以用户选定目标为准。跨工作树加载方法不能切换业务工作目录；记录目标仓与方法来源的版本。
- 项目事实在当地正本，历史执行与认可证据在 Git/PR/运行产物。按项目既有边界分类；文件存在、入口可达、实际加载和行为正确分别取证。

## 按任务读取

| 请求 | 做到哪里 | 读取 |
|---|---|---|
| 建立全局图 / 多文档盘点 / 首次用于新项目 | 映射现状；职责或格式未定时交决策报告，按认可范围整改 | [知识模型](references/knowledge-model.md) + [文档契约](references/document-contracts.md) + [评审与对齐](references/review-workflow.md) |
| 整改某篇 / 某小类文档 | 原文、存量、必要引用与验证一起交付 | 对应文档契约 + [维护方法](references/maintenance.md) |
| 梳理特性、指标、验收和 E2E | 建立有来源的关联，区分候选、已认可与实际运行 | [特性与证据](references/feature-evidence.md) |
| 跨技术路线迁移的知识同步 | 分开目标、当前实现/验证和历史；产品取舍交回开发入口 | 特性与证据；BW 时加 [项目适配](references/projects/bw.md) |
| 方法有问题 / 上游变化 / 要共享 | 定位真实偏差，修正确归属并复验 | 维护方法的反哺部分 + [来源](references/sources.md) |
| 审查模型指令及行为偏差 | 追踪用途、加载与必要约束，提出具体修订并验证 | [指令专项审查](references/prompt-review.md) |
| 对 BW 操作 | 额外核对路线、知识职责和授权范围 | BW 项目适配 |
| 跨任务或并行整改 | 固定版本，明确依赖与合入读回 | [会话运作](references/session-workflow.md) |
| 只读链接检查 / 全景与前后扫描 | 生成有范围和版本的检查产物 | [扫描说明](references/scanning.md) |

只读相关章节，无需安装来源中的框架。

## 一次整改

1. **定位。** 读目标仓 AGENTS/上级规则、入口、目标原文头部及直接依据；核对仓根、分支/HEAD、远端、PR base、技术路线与并行修改。明确主文档、必要关联件和排除项，不默认全库扫描。
2. **对齐。** 对照当地规范、类型契约与实际正文，核对入链和真实读取方；真实未决的职责/格式按评审流程给具体方案，已认可决定直接复用。
3. **整改。** 按维护方法落实原文、旧内容去向、入口与加载方。必要内容优先落已有正本；规范和覆盖到的存量同块处理，不先建完全部模板、schema 或编号体系。旧清单与模板不能要求恢复已退役文件。
4. **验收与反哺。** 按维护方法交付 diff、处置去向、适用验证、未完成项及方法复盘；跨任务时追加会话运作要求的交接差异。

完成要求是认可职责、覆盖到的旧债、必要引用/加载与适用验证一起落实；未解决的迁移债不能标成完成。总字数只是成本观察，不能靠删掉必要约束提高“瘦身率”。详细验收、唯一交付表与反馈程序在维护方法，工具命令和覆盖限制在扫描说明。

本包为仓内 0.4.2-pilot；来源与采用差异见来源参考，固定输入见 [评估案例](evals/cases.md)，实际结果留在对应 PR/运行记录。脚本测试、静态走读和真实模型任务分别报告，不从静态通过推断模型效果。
