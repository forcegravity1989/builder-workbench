# Changelog

## 2026-10-10 优化（定时任务再审收窄：砍除虚假场景 + 调度器收口 + 字段回退）

- **变更类型**：优化（范围收窄）/ 重构（调度器收口）/ 回退（字段摘除）
- **变更摘要**：携 15 产品 × 9 能力矩阵（官方证据口径）对已 gate 特性再审收窄，砍除零原生先例的虚假场景，保留有 2–4 家先例的真实场景。**砍除**：每 N 分钟/小时预设（upstream rrule 地基不动）、执行次数上限（COUNT 容忍出现但不生效）、每任务并发策略配置（固定为「上次未结束则记 `skipped_overlap` 跳过」，手动 runNow 不受限）、携带上次运行结果、提示词快照（运行历史只留状态/错误/输出尾部）；**保留**：一次性引擎（`onceAt`/`scheduledRunCount`，composer「明早九点跑一次」依赖）、固定跳过行为、导入导出；**新增**：webhook 最小形态（serve 模式端点 + 每任务 token，走 runNow 派发链不递增计数）。调度器收口已落地：生命周期门（一次性超宽限幂等记 `skipped_missed`）→ 一次性派发（`scheduledFor=onceAt`）→ 并发跳过 → 拒绝折叠（同因重复拒绝折叠进首条记录，`occurrenceCount` 计数）。被砍能力不留兼容层与双路径，字段与解析链全量回退；vitest ratchet 基线随删例收紧 259→257。
- **涉及文件**：
  - `docs/05-features/automations/research.md`（新增：两轮竞品调研存档，第二轮含能力矩阵与 E1–E11 证据索引）
  - `docs/05-features/automations/intent.md` / `spec.md` / `design.md` / `STATUS.md`（重写：砍留留痕、验收点 AU02/AU03/AU05 砍除、AU09 webhook 新增、依据段两处降级）
  - `src/main/automations/service.ts`（调度器收口：固定并发跳过、一次性派发、DEBUG 插桩摘除）
  - `src/main/automations/dispatch-refusal.ts`（`recordSkippedOverlap` + `recordMissedRun` 幂等守卫）
  - `src/shared/automations-types.ts` / `src/shared/rpc-contract/automation-params.ts` / `src/main/persistence/scheduling-automations/*`（删 `concurrencyPolicy`/`carryLastRunOutput`/`promptSnapshot`，保留 `onceAt`/`scheduledRunCount`)
  - `src/shared/automation-schedule-kind.ts`（`deriveLifecycleState` 只保留一次性生命周期）
  - `src/shared/automation-schedule-parsing.ts` / `automation-schedule-occurrences.ts`（删 count 解析与 `automationRunCountCap`）
  - `config/vitest-count-baseline.txt`（ratchet 基线 259→257）
- **验证**：全 automation 测试面 146/147 文件绿；唯一失败为 `external-manager-scoped.test.ts`（HEAD 预存 Windows 平台问题：测试硬编码 `which`，源码在 win32 用 `where`，本次未改动两文件）；typecheck 后台跑批中。

## 2026-10-09 新增（定时任务特性带入：设计四件套）

- **变更类型**：新增（特性设计文档，未写实现代码）
- **变更摘要**：定时任务增强特性落入 `docs/05-features/automations/`：调度表达扩展（一次性/每 N 分钟/每 N 小时/执行次数上限）、AI 生成与调试会话（composer，对话式起草→禁用态创建→试跑→读回→迭代，启用留给人）、运行提示词快照、并发跳过策略、携带上次运行结果、任务导入导出；通知沿用现有会话完成通知，不新建链路（按任务通知设置与 Welink 推送为后续待办，2026-10-09 拍板）。存储维持 Orca 原有结构，仅追加 4 个可选字段（`onceAt`/`scheduledRunCount`/`concurrencyPolicy`/`carryLastRunOutput`）+ `promptSnapshot` + `skipped_overlap` 状态，判别与生命周期推导收口单一新模块，便于增量同步 upstream。intent/spec/design 为 2026-10-09 设计会话产出；spec 原型豁免已拍板，intent/spec 已 gate（2026-10-09，含验收点 AU01–AU08 与旅程 AUJ01 定义）。
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
