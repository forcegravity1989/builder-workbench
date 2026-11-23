---
name: critique
description: 针对 BW 指定任务和真实界面，以层级、信息架构、可发现性、状态与恢复路径评议设计，区分缺陷、未验和审美建议；不运行外部检测器或自动改设计。
license: Apache-2.0
metadata:
  adaptation: BW-local
  upstream: pbakaus/impeccable
---

# critique — 有依据的设计评议

本篇改写自 Impeccable 的 critique 方法；版本见 [impeccable-source.json](../impeccable-source.json)，保留 [原命令](../upstream/impeccable/critique.md) 与 [许可](../licenses/pbakaus--impeccable/LICENSE)。不采用原工具链、质量评分存储、自动检测/截图命令或强制多代理编排。

## 获取依据

完整读取 [本目录适用边界](../README.md)、[设计系统 guidelines](../../../../docs/04-design-system/guidelines.md) 与 [开发规范](../../../../docs/development.md)，找到目标特性规格和当前源码版本。用户路径涉及引导时完整读取 [引导与旅程规范](../../../../docs/04-design-system/guidance.md)。明确任务、入口、数据、期望结果和观察范围。

## 评议

观察真实界面与操作；无运行条件时仅给静态意见并保留未验。检查：

- 主任务和下一步是否清楚，层级是否服务对象而非装饰；
- 分组、术语与邻近旅程是否一致，信息是否可发现且不会一次过载；
- 每项信号是否有真实数据依据，Unknown 是否与正常、成功区别；
- 空、加载、失败、权限不足和恢复路径是否完整；
- 语义控件、键盘路径、焦点、主题对比度、长内容与 reduced-motion；
- 组件与 token 是否复用，装饰/动效是否妨碍高频工作。

不因为界面“像 AI”或不符合外部偏好就报告 bug。问题要有具体触发条件、位置、依据与用户后果；没有行为依据的建议明确标为建议，缺观察标未验。

## 输出与下一步

按影响优先输出任务、版本与证据范围，再列具体问题：`位置 / 触发条件 → 实际与预期差异 → 影响 → 最小建议`。合并无发现项，说明有效之处但不造质量分或健康灯。

本技能只评议，不自动应用。已有明确授权和依据的修正按开发流程继续；涉及新布局、能力削减或产品取舍，用 AskUserQuestion 提供针对发现的选项，不例行追问已确定的信息。正式 PR 交付仍由独立 subagent 按开发规范检视，不能用本技能的自评替代。
