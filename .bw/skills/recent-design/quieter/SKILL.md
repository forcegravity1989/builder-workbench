---
name: quieter
description: 在 BW 已认可的界面中降低视觉噪声、竞争层级和过量动效，保留状态语义、操作可发现性与无障碍；不重设计品牌或削减功能。
license: Apache-2.0
metadata:
  adaptation: BW-local
  upstream: pbakaus/impeccable
---

# quieter — 降低视觉噪声

本篇改写自 Impeccable 的 quieter 方法；来源版本见 [impeccable-source.json](../impeccable-source.json)，[原命令](../upstream/impeccable/quieter.md) 与 [许可](../licenses/pbakaus--impeccable/LICENSE) 保留。原命令的安装、上下文工具和相邻命令不属于本适配的执行步骤。

## 先定范围

完整读取 [本目录适用边界](../README.md)、[设计系统 guidelines](../../../../docs/04-design-system/guidelines.md) 与 [开发规范](../../../../docs/development.md)。采用用户给定目标与所属特性的已认可行为，复用现有 token 和原语。找不到必要行为依据时先调查；真正缺人的决定才用 AskUserQuestion。

## 降噪

1. 检查同屏竞争：饱和背景、多个主按钮、重复边框/卡片、无意义标签、字重跨度及频繁动效。区分装饰与状态/操作语义，给具体位置和任务影响。
2. 用间距、对齐、分组和有限字重恢复层级；减少装饰而非降低文字、控件、焦点的必要对比度。
3. 颜色回到 BW 语义 token。不要按上游百分比盲目减饱和，不新增暖灰/色板，不改状态色含义。
4. 删除无目的动效，缩短高频反馈，保留必要状态连续性和 reduced-motion。不要为表现“安静”把可操作控件变得不可发现。
5. 对需要删操作、隐藏重要信息或重排旅程的建议先说明差异，按特性确认规则执行，不以视觉整理绕过决定。

## 核对结果

对照修改前后，核验主任务仍能完成、焦点清楚、状态可辨、浅深主题和长文案可读。涉及界面改动按开发规范在真实 Electron 中验证并留证；未运行就标未验。输出具体减少了什么、保留了什么、实际验证和残余问题，不给无数据的质量绿灯。
