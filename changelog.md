# Changelog

## 2026-10-09 新增（定时任务特性带入：设计四件套）

- **变更类型**：新增（特性设计文档，未写实现代码）
- **变更摘要**：定时任务增强特性落入 `docs/05-features/automations/`：调度表达扩展（一次性/每 N 分钟/每 N 小时/执行次数上限）、AI 生成与调试会话（composer，对话式起草→禁用态创建→试跑→读回→迭代，启用留给人）、运行提示词快照、并发跳过策略、携带上次运行结果、系统通知（Welink 推送为后续待办：整仓尚未接入，2026-10-09 拍板先不做）、任务导入导出。存储维持 Orca 原有结构，仅追加 5 个可选字段（`onceAt`/`scheduledRunCount`/`concurrencyPolicy`/`carryLastRunOutput`/`notifyOn`）+ `promptSnapshot` + `skipped_overlap` 状态，判别与生命周期推导收口单一新模块，便于增量同步 upstream。intent/spec/design 为 2026-10-09 设计会话产出；spec 原型豁免已拍板（2026-10-09），待人 gate。
- **涉及文件**：
  - `docs/05-features/automations/intent.md`（新增：用户与问题/价值与依据/目标体验/范围与边界）
  - `docs/05-features/automations/spec.md`（新增：完整用户旅程/调度表达/生成与调试会话/运行时行为/通知/导入导出/兼容与迁移）
  - `docs/05-features/automations/design.md`（新增：侵入面与复用/数据模型/调度器收口/会话编排/通知/导入导出/错误处理/测试策略/决策记录）
  - `docs/05-features/automations/STATUS.md`（新增：六环现状表 + 必验项矩阵 + 已知债）
  - `docs/05-features/README.md`（特性矩阵加第 8 行「定时任务」及脚注⁴）
- **验证**：纯文档改动，报告文档检查——四件套头部约定齐备、相互链接正确、特性矩阵行与 STATUS 状态一致；未写任何实现代码，不伪造界面验证。

## 2026-09-30 修复（workbench 材料保存 CLI 通道全量被拒）

- **变更类型**：修复
- **变更摘要**：修复 `bw materials save`（acceptance 工作流、CLI 通道）必然失败的缺陷。根因：`material-human-guard.ts` 的 `assertHumanFieldsUntouched` 把含 `expectedRevision`/`document` 的完整保存参数直接传给 read 回调，而存储层 read 路径用 strict 的 `VersionMaterialReadSchema` 校验入参，两个保存专属键被报为 `Unrecognized keys`，导致 CLI 通道所有验收材料保存（含不含人工签字段的正常保存）全部被拒。修复为剥离保存专属键后再调用 read。人工结论字段保护（preparationReview / results[].decision 禁经 CLI 写入）语义不变。
- **涉及文件**：
  - `src/main/workbench/material-human-guard.ts`（剥离 `expectedRevision`/`document` 后再传 read）
  - `src/main/workbench/material-human-guard.test.ts`（新增回归测试：guard 传给 read 的载荷必须能通过 strict `VersionMaterialReadSchema`）
- **验证**：`vitest run src/main/workbench/material-human-guard.test.ts` 全过；重建 `out/main` 后经 CLI 实测 `bw materials save --create` 成功落盘并 `read` 回读一致。
