# 团队协作设计状态

> 给评审者读；只记录本提案的认可、证据和验证边界。行为正本为 [spec](spec.md)，原型为 [prototype.html](prototype.html)。证据变化时更新；不记录项目执行流水。

| 环 | 状态 | 证据与缺口 |
| --- | --- | --- |
| intent | ◐ 草案 | 用户要求完整团队协作设计，承接 #342；具体模型与原则变更尚待认可 |
| spec | ◐ 草案 | 关系、12 条旅程、权限、刷新、实现分工及动画已起草；待评审 |
| 实现设计 | ◐ 提案 | 基线 cdbe31892；团队目录服务、资源授权与隔离均为新增建议 |
| TDD | — 本次不适用 | 本次是设计与演示，无生产实现 |
| 验收点 E2E | ○ 产品未验 | 只验证 HTML 播放与场景交互，不代表真实身份／网络／权限可用 |
| 用户旅程 E2E | ○ 产品未验 | 双机、真实 Git、进程重启与撤销执行待实现后验证 |

## 依据

- 现场代码：`src/shared/project-types.ts`，`src/shared/project-host-setup-projection.ts`，`src/main/runtime/device-registry.ts`，`src/main/runtime/runtime-rpc/runtime-rpc-websocket-dispatch.ts`。
- 刷新与入口：`src/renderer/src/workbench/wall-refresh.ts`，`workbench-wall-projects.ts`，`src/renderer/src/store/repos/repo-catalog-merge.ts`，`src/renderer/src/components/onboarding/OnboardingFlow.tsx`。
- 已有知识：project-intake intent/spec、ref/upstream、原则 03、引导矩阵；2026-10-21 聚合研究只用作定位，当前能力已重新看源码。
- 现场读取 #342、#552、#603、#641；#342 保留 #479 的地址变化输入。主单未关闭，不将设计产物当作人确认。

## 原型验证（2026-11-13）

Chrome / Python Playwright 实跑 12 条旅程、43 步，逐步动作、自动播放与暂停、重播、URL 步骤恢复、8 个关系节点、三个视图、深色和 390px 窄屏通过，无 JavaScript 异常。独立检视复核了同样范围，并修正授权上下文、图关系、窄屏溢出与入口索引。演示不连接真实账号／主机／代码平台；不将本结果列为生产 E2E。
