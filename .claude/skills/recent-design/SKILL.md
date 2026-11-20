---
name: recent-design
description: >-
  用于 BW 本仓的界面打磨、视觉降噪、设计评议、动效术语与评审、色彩对比度、
  React 性能与组件组合、TypeScript 类型设计。根据任务读取 .bw 中已筛选的
  Recent Design 技能；不是新特性确认、全仓文档治理或被管项目技能分发入口。
argument-hint: '[技能名] [目标组件、文件或问题]'
---

# Recent Design — BW 研发技能入口

1. 完整读取 [技能清单与 BW 适用边界](../../../.bw/skills/recent-design/README.md)，依其中范围与采用限制选择方法。
2. 直接修改 BW 前，完整读取 [AGENTS](../../../AGENTS.md) 与 [开发规范](../../../docs/development.md)，按 [workbench-start](../workbench-start/SKILL.md) 执行起手与交付。
3. 做界面、原型或视觉检视前，完整读取 [设计系统 guidelines](../../../docs/04-design-system/guidelines.md)，按 [设计系统入口](../../../docs/04-design-system/README.md) 找到对应特性、token 和原语。
4. 按目标选择清单中最窄的技能，完整读取其 `SKILL.md`，并按正文要求完整读取参考文件。未给技能名时说明选择；目标无法从输入与仓内依据确定时，使用 AskUserQuestion 提供具体选项。
5. 原件和本地适配的位置、依赖限制、验证与未验边界均以清单为准；本入口只编排读取，不维护技能正文或另一份采用规则。
