---
name: workflow-audit
description: Use when 审计/优化一个 workflow/loop 项目(issue→...→MR 闭环/harness/多agent workflow)——用六要素/四大器/builder实践框架拷问其各组件规范合规、指标可统计、反哺点，产诚实 GAP 报告。v1=审计能力（usable）；愿景=引导人按本方法论建/调自己 workflow（phase2 backlog，见 §1）。
allowed-tools: Read, Glob, Grep, Agent
metadata:
  category: audit
---

# workflow-audit

> v1（审计能力，usable）。把"workflow/loop 项目审计优化"思想(六要素/四大器/builder实践 + 建规范→检查→修 loop + 反哺)编码成可复用 Skill。跑它于任何 workflow 项目即产其诚实 GAP 报告(拷问其他项目)。
>
> **愿景转向**（phase2 backlog，未做）：从"审计别人 workflow"演进为"**引导人按本方法论有参考地建/调自己的 workflow**"——v1 先把审计做扎实（思想框架 + spec 蒸馏 + GAP 报告），phase2 再叠引导式建设流程。

## 1. 核心目标

**v1（本期，已 usable）**：跑此 Skill 于某 workflow/loop 项目 → 产该项目 5 期望诚实解答:

1. **各组件规范合规**: agents/SKILL/env 等资产对照 spec-distill 是否合规
2. **四大器缺口**: 生成器/评估器×2/报告×2/改进器(离线集+flow 规范两套)齐不齐
3. **builder 动作标准**: 看板反向约束("统计不到=没规范")/资产台账/建规范→SubAgent 检查→砍冗余 loop 落地否
4. **双指标可统计**: 引领(流量脚本可统计)/滞后(存量大模型基于规范可统计,台账入口)
5. **反哺点/真 GAP**: 深度实践偏差→公共 spec 回流素材 + 真 GAP(缺组件/名实不符/不可统计)

## 2. When / NOT

**Use when**: 用户要审计/优化一个 workflow/loop/harness/多 agent workflow 项目,拷问其规范合规、可统计、改进闭环。
**NOT**: 写新 workflow(用 plan/build 类 skill)/ 单纯 code review / 跑某 loop 的 issue(用对应 loop skill)/ 非 workflow 项目审计。

## 3. 前置依赖

- 审计者读 `references/framework.md`(思想 home)+ `references/spec-distill.md`(规范蒸馏)——本 Skill 自包含,不需外部路径。
- 被审项目须可读(至少顶层 CLAUDE/README/DESIGN/AGENTS 可访问)。

## 4. 标准执行流程

按序执行,每步产审计笔记,末步汇编 GAP 报告。

1. **读项目顶层** (CLAUDE/README/DESIGN/AGENTS/ChangeLog)——理解 charter + 思想 spine + 文件地图。
2. **读规范权威** (spec/状态机/纪律表)——找单一权威源,判有无双份漂移。
3. **读资产** (agents/SKILL/env.md/scripts)——对照 spec-distill 判合规。
4. **六要素落地判据**——每要素(上下文/工具/编排/记忆/评估观测/约束恢复)到位否,有组件 + 真实运行证据才算到位。详见 framework §一。
5. **四大器盘点**——生成器/评估器×2/报告×2/改进器(离线集+flow 规范两套),缺一即不能自转。详见 framework §二。
6. **builder 动作标准**——看板反向约束规范("统计不到=没规范")/资产台账(owner/活跃度/last_verified)/建规范→SubAgent 检查→砍冗余 loop(铁律)/connectors。详见 framework §三。
7. **双指标可统计性**——引领=流量脚本可统计 / 滞后=存量大模型基于规范可统计(台账入口)。台账缺=滞后不可统计=真 GAP。详见 framework §四。
8. **反哺点**——深度实践偏差→公共 spec 回流素材(角色式 description/无 Before You Begin/红旗表+步骤风格/四码+verdict 并存/诊断+执行非码类豁免 Code Organization)。详见 framework §五。偏差都记理由,无理由的偏差=偷懒。
9. **产 GAP 报告**——按 §7 示例形态产出诚实报告。

> 步骤可并行:用 Agent 工具派子 agent 分审不同资产(agents/scripts/env),主编排汇编。但判"到位否"需人(审计者)据 framework 判据裁决,不交模型自判。

## 5. 参考资源

- `references/framework.md` — 思想 home(六要素/四大器/builder/双指标/反哺判据)。何时读:审每步判"到位否"时查判据。
- `references/spec-distill.md` — 规范蒸馏(agent/skill/superpowers/maas)。何时读:审各资产规范合规时对照。

## 6. error_handling

- 被审项目缺某层(如无 DESIGN.md): 如实记"缺层",不替项目编造;判其为 GAP。
- 资产不可读/路径不存在: 记 GAP "资产不可访问",不猜测内容。
- 偏差无理由: 记"偷懒偏差",非反哺素材。
- 审计者不确定某判据: 读 framework 对应段,不凭印象判。

## 7. 示例（GAP 报告形态）

```
# workflow-audit GAP 报告 —— <项目名> (v1)

## 1. 各组件规范合规
| 资产 | 规范 | 合规 | 证据/Gap |
| agents/*.md | agent-md-spec | ⚠️ | reviewer.md 超 300 行(行数=320) |
| SKILL.md | skill-md-spec 8-part | ✅ | 8 段齐,主体 480 词 |
| env.md | 六段+owner+last_verified | ❌ | 7 个 env 均缺 frontmatter owner |

## 2. 四大器缺口
| 器 | 状态 | Gap |
| 生成器 | ✅ | — |
| 评估器×2 | ⚠️ | 过程评估器无独立证伪,只对照 analyze |
| 报告×2 | ⚠️ | 过程报告(轨迹卡)待建 |
| 改进器 | ❌ | 离线案例集未留存;flow 规范两套齐 |

## 3. builder 动作标准
- 看板反向约束: ⚠️ MR 标题缺关键字,看板漏计=没规范
- 资产台账: ❌ env 台词缺 owner=滞后不可统计
- 建→检查→砍 loop: ✅ agent-md-spec 已建+SubAgent 检查

## 4. 双指标可统计
- 引领(流量): ✅ funnel 脚本读 issue 评论统计
- 滞后(存量): ❌ 台词缺 owner,last_verified 未填=不可统计

## 5. 反哺点/真 GAP
- 反哺素材: agent description 角色式(有理由,待回流)
- 真 GAP: ① 改进器离线集未留存 ② env 台词滞后不可统计 ③ 过程评估器无独立证伪
```

## 8. 纪律表

| 纪律 | 要点 |
|------|------|
| **诚实** | 不替项目编造;缺就记缺,名实不符就记不符 |
| **单一权威源** | 审计判据以 framework/spec-distill 为准,不凭印象 |
| **不替项目编造** | 资产不可读=记 GAP,不猜测内容 |
| **偏差记理由** | 有理由的偏差=反哺素材;无理由=偷懒 |
| **以身作则** | 本 Skill 自身须合 skill-md-spec 8-part(本文件即合规) |
