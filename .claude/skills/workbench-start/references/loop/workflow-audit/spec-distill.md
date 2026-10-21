# spec 蒸馏（使 workflow-audit 自包含）

> v1,慢慢完善。本文件蒸馏 agent-md-spec / skill-md-spec / superpowers 6.1.1 / maas methodology-replicate 的要点,使本 Skill 不依赖任何本地路径即可审计任何 workflow 项目。蒸馏是综合理解,非逐字复制（避免 stale 漂移）。审计时用它对照被审项目各资产规范合规。

---

## 一、agent-md-spec 蒸馏（agent 规范）

被审项目的 `agents/*.md` 对照以下判据:

- **frontmatter**: `name`(连字符) / `tools` 白名单**必填** / `model` 显式(或显式 inherit)
- **`description`**: 只写何时触发 <500 字符；fresh-context 派发 agent 可写"角色+做什么+边界"(角色式),非纯流程罗列
- **正文**: implementer-prompt 段(8 段) 或 红旗表+步骤+返回格式风格；**主体 < 300 行**(被注入 prompt,越精简越好)
- **Subagent 纪律明确**: leaf worker 不开子 agent(防嵌套);派发者代起环境
- **四码状态**: `DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT`；reviewer verdict 与状态码并存(另一轴)
- **Code Organization 段**: 写码类必有；诊断/判定/执行非码类豁免
- **Self-Review 段**: 交付前自检(fresh eyes)
- **不凭空抽 agent**: 先在 skill 内跑通才抽,不为抽象造 agent

**审计判据**: 任何 agent.md 缺 frontmatter / 超 300 行 / 无状态码 / 自审无独立证伪 = 规范不合规。

---

## 二、skill-md-spec 蒸馏（SKILL 规范）

被审项目的 `SKILL.md` 对照以下判据:

- **8-part 结构**（合 skill-md-spec）:
  1. 核心目标
  2. When to use / NOT to use
  3. 前置依赖
  4. 标准执行流程
  5. 参考资源（→ references,渐进披露)
  6. error_handling
  7. 示例
  8. 纪律表
- **frontmatter**: `name` / `description`("Use when..." 触发式 <1024 字符) / `allowed-tools` / `metadata`
- **`description`**: "Use when <场景>"；只写何时触发,不总结流程；<1024 字符
- **渐进披露**: 主体精简(<500 词),细节进 `references/`,何时读有指引
- **能机械执行**: 指令像老手带新人,不空话;步骤可机械跑
- **anti-patterns**（必避）:
  - 无 storytelling / 不堆方法论散文
  - multi-language 混用(选一种)
  - code in flowchart mermaid 里塞代码
  - generic labels(占位符标签)
  - description 总结流程而非写何时触发
  - 重复(一个事实多个权威源)

**审计判据**: SKILL.md 缺任一段 / description 非"Use when" / 超 500 词 / 无 references / 有 anti-pattern = 不合规。**本 workflow-audit Skill 自身也须合规——以身作则**。

---

## 三、superpowers 6.1.1 蒸馏（方法论纪律）

- **纪律表在 SKILL 不在 agent prompt/controller**: 通用纪律(Excuse→Reality 红旗表)归 Orchestrator 编排层,不在各 agent.md 重复
- **leaf + file-handoff**: leaf worker 不开子 agent;**不 endorse 嵌套**(superpowers 6.x 不 endorse,深度实践可砍透传舞但记理由)
- **四码状态**: `DONE`/`DONE_WITH_CONCERNS`/`BLOCKED`/`NEEDS_CONTEXT`(标准状态码,编排路由用)
- **红旗表范式**: 每条 = 模型最爱找的借口 → 红旗 → 正确动作
- **蒸馏内联不直接挂 loader**: 方法论纪律无损蒸馏进角色 prompt(运行时不依赖 Read 外部技能);**重人在环阶段用自控人盯门(GATE)**,不把重人参与的技能直接装进自动流程
- **自控人盯门(GATE)**: 起步人盯每步 → 关键门把关 → 完全自治,阶梯降级;自主性是挣来的

**审计判据**: 通用纪律散落各 agent / leaf 开子 agent / 无 GATE 人盯门 = 方法论不合规。

---

## 四、maas methodology-replicate 蒸馏（重构方法论实践）

- **看板统计不到 = 没规范**: 看板能统计的才有规范；统计不到的等于没规范。看板是规范的检验器
- **双指标**: 引领性(流量=解决 issue 数,脚本可统计) + 滞后性(存量=资产沉淀,大模型基于规范可统计,台账是入口)
- **重构 8 步方法论**: 不逐字抄,要点是"先读后改/先查后动/先验后执"——先确认状态再执行操作
- **六要素视角非目录**: 六要素是控件视角,不是文件目录；一个文件可承载多要素,一个要素可跨多文件
- **四大器留白 + 问题驱动 + 最简**: 四大器未必齐(改进器常缺),缺口用"问题驱动"补；**最简优先**,不为抽象牺牲可交付

**审计判据**: 项目无看板统计 / 看板统计不到关键 funnel = 规范缺失；四大器缺改进器 = 不能自转；为抽象牺牲可交付 = 过度设计。

---

## 自包含声明

本文件 + `framework.md` 是本 Skill 的全部理论依赖。审任何 workflow 项目不需访问 maas/superpowers 本地路径——本两文件已蒸馏要点。被审项目若需深查某条,看它自己的 references 是否自包含即可。
