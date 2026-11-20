---
name: polish
description: 在 BW 已认可的界面世界内完成布局、状态、文案、交互和代码一致性收尾，按完整任务路径验证；不隐蔽重设计或增加无目的动效。
license: Apache-2.0
metadata:
  adaptation: BW-local
  upstream: pbakaus/impeccable
---

# polish — 界面收尾

本篇改写自 Impeccable 的 polish 方法；固定版本见 [impeccable-source.json](../impeccable-source.json)，保留 [原命令](../upstream/impeccable/polish.md) 与 [许可](../licenses/pbakaus--impeccable/LICENSE)。以本仓正本、真壳证据和 PR 取代上游 DESIGN.md、上下文/检测/截图工具和评分存储。

## 定系统与范围

完整读取 [本目录适用边界](../README.md)、[设计系统 guidelines](../../../../docs/04-design-system/guidelines.md) 与 [开发规范](../../../../docs/development.md)。对齐用户范围、所属特性、当前版本、邻近界面、token 与原语；打磨不是换概念。概念不匹配时说明原因并按特性确认规则处理，不偷偷重设计。

## 收尾顺序

1. 先排真实任务阻塞、数据错误、误导状态和不可访问路径；再补空、加载、失败、禁用、权限与恢复。
2. 对齐分组、布局、光学位置、间距、同角色字号和文案；核验长内容、本地化、缩放与两种主题，不只修当前截图。
3. 复用语义 token、图标和原语，保持颜色含义、字重和焦点一致；有现成组件不另造实现。
4. 检查鼠标/键盘、反馈、可中断动效和 reduced-motion；不为了显得打磨过而加动画。
5. 清理本次造成的重复样式、无用导入、调试输出和临时制品；共享值只有确属共用约束时才进入现有 token 正本，不为单点抽象。

## 验证并交付

按完整任务与恢复路径复验，覆盖影响范围内的内容/状态/主题，确认新代码已加载。按开发规范完成真壳证据、适用门禁、独立检视和修正；未运行项如实说明。最终输出变化、验证、尚需决定；规格同步到所属正本，过程留 PR。不自动确认完成、关闭 Issue 或合入。
