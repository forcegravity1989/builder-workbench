# 贡献 BW：认可与证据

> **读者与时机**：评审和交付本主题时读取。只维护认可范围、当前制品身份和验证边界；行为归 intent/spec，不存施工流水或遗留台账。认可或有效验证证据变化时更新。

- 归属：研发保障的一条贡献旅程。跟踪 [Issue #783](https://github.com/forcegravity1989/builder-workbench/issues/783) 与 [PR #784](https://github.com/forcegravity1989/builder-workbench/pull/784)。
- 当前制品：[意图](intent.md)、[规格](spec.md)、[局部体验稿](prototype/index.html)。用户已认可批注工具旁交接、独立助手加载 Skill、本机按需补采、无源码可提单、会话内复用原生开工和简短备注的旅程；局部交互与 Skill 实际效果待体验，不记为整篇通过产品验收。
- 原型范围：批注到助手、Issue 到开工两处增量。实际组件与演示接线在评审说明和构建清单中分别标明，不代表完整工作台或安装版行为。研究报告维持原件，不作为当前交互入口。
- 当前入口：仅快捷键进入批注，浮窗复制旁图标交接。保存原生批注后准备浮动智能体草稿，原批注在前、起手提示在后，由用户发送。界面无开启按钮。
- 运行观察：当前工作树的 Electron CDP 已观察到批注快捷键、缺默认智能体提示、真实本机 Skill 安装、浮动会话创建，以及真实 Issue 读回后的原生创建器和短备注。同轮后续实机已观察到真实批注进入未发送终端输入框、原生浮动收起找回，以及点击 Issue 链接菜单进入创建器、编辑并恢复短备注。截图和源码版本见 [主验证报告](https://github.com/forcegravity1989/builder-workbench/pull/784#issuecomment-7132540764)。完整模型提单与跨主机执行仍未验。
- 证据边界：组件原型和静态 Skill 检查不能证明目标宿主真实安装、模型实际加载、现场采集覆盖、Issue 写入、启动备注执行或跨主机交付。该旅程尚无真实 E2E 通过记录。
- 验收依据：spec 的 BC-01 至 BC-08；承接 W03 可信交付，复用 F01 工作区、F06 会话、F08 批注以及相应原生执行能力。具体执行证据在 PR，工程遗留及独立规范反哺安排在仓外 plan。

## 复用依据

- Skill：沿 [计划助手短入口与完整包](../../../src/renderer/src/workbench/version-cycle/cycle-prompt.ts) 和 [安装适配](../../../src/renderer/src/workbench/workbench-skill-install.ts)。新增反馈主题不等于现有三类流程已支持它；源码 Skill 与分发接通分别验收。
- 开工：沿 [任务页关联工作区动作](../../../src/renderer/src/components/use-task-page-workspace-actions.ts) 和共用创建器参数；本机浮动会话中 BW Issue 的原生链接菜单提供“开始修复”。未纳版 Issue 不强行走版本计划专用起手。
- 备注：原 [创建弹窗](../../../src/renderer/src/components/NewWorkspaceComposerModal.tsx) 支持 `initialNote`；[关联任务提示](../../../src/renderer/src/lib/linked-work-item-context.ts) 和 [启动计划](../../../src/renderer/src/hooks/composer-state/quick-startup-plan.ts) 将备注及链接传入启动草稿。自动发送与实际模型执行不由此推断。
