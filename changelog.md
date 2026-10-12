# Changelog

## 2026-10-12 修复与优化（推 PR 前四维检视修正）

- **变更类型**：修复（类型谓词收窄缺失）/ 优化（判别收口、注释清理、文档同步）
- **变更摘要**：推 PR 前四维 subagent 检视（顶层文档一致性、特性资产同步、实现代码清理、测试配比）发现项的同一交付内修正，共 14 项。代码侧：CLI `automation-format.ts` 与 renderer `automation-portable-file-actions.ts` 两处消费者内联 `onceAt != null` 判别改回收口模块 `isOneShotAutomation`（design「判别收口」）；收口后暴露真类型缺陷——原内联判别带 `!= null` 收窄、无谓词函数不收窄，`new Date(automation.onceAt)` 报 TS2769，给 `isOneShotAutomation` 加类型谓词（true 分支 onceAt 收窄为 number）修复并顺手清掉 `deriveLifecycleState` 内的 `as number` 断言；`automation-definition-operations.ts` lifecycleKindChanged 注释清理被砍能力残留表述（次数上限语境），`dispatch-refusal.ts` / `due-run-evaluator.ts`「不消耗次数额度」措辞改「不推进一次性派发计数」。文档侧：STATUS 与特性矩阵第 8 行 AU07 归类改精确枚举（AU01 ✅；AU04/AU06/AU08/AU09 入口已落地待真壳；AU07 通知未验证）；spec/intent 补间隔触发 CLI 表达（`--trigger every <N><m|h>` 归一引擎间隔语义，UI 不加预设）；architecture §1 用例行全面重写、§2② 入口并列、§2③ 如实登记 composer 分发副本例外（根级手维护副本含 CLI 解析段、standard 存 SOP 正本）；AGENTS.md 计划/验收工作流段补 composer 例外一句（AGENTS 头部范围内修改，PR 正文明列）；ref/upstream.md 扩点清单补「定时任务增强（2026-10 特性批）」行（additive 字段、判别收口、调度器收口三文件按函数对齐等合并保留要求）；docs/README.md 特性枚举补第 8 项定时任务；CONTEXT.md 自动化分组补 5 词条（一次性任务/onceAt 与「已结束」、并发跳过/skipped_overlap、webhook 触发/token、配置导入导出、AI 创建自动化/composer）。
- **涉及文件**：
  - `src/shared/automation-schedule-kind.ts`（isOneShotAutomation 加类型谓词；deriveLifecycleState 去 as 断言）
  - `src/cli/automation-format.ts`、`src/renderer/src/components/automations/automation-portable-file-actions.ts`（判别收口）
  - `src/main/persistence/scheduling-automations/automation-definition-operations.ts`、`src/main/automations/dispatch-refusal.ts`、`src/main/automations/due-run-evaluator.ts`（注释与措辞清理）
  - `docs/05-features/automations/STATUS.md`、`docs/05-features/README.md`（AU07 精确枚举）
  - `docs/05-features/automations/spec.md`、`intent.md`（间隔 CLI 表达）
  - `docs/architecture.md`（§1/§2②/§2③）、`AGENTS.md`（composer 例外）、`ref/upstream.md`（扩点行）、`docs/README.md`（特性枚举）、`CONTEXT.md`（5 词条 + automation-spec 链接）
- **验证**：受影响测试面全过——cli automation-format + shared portable-schema + main dispatch-refusal/service-trigger-semantics/persistence automation-run-operations 共 5 文件 18 例，谓词修复后 automation-schedule-kind + automation-format 2 文件 7 例；`pnpm run typecheck` 三工程 0 错误（谓词修复前 2 处 TS2769，修复后归零）；oxlint 改动文件全过、oxfmt 全过（dispatch-refusal 措辞重排一次）。维度④ 3 项测试配比发现（14 例超 ≤10 例配额的理由与归类、ratchet 259→257 真实账目、composer 例贴边）不修代码，PR 正文说明。

## 2026-10-12 文档同步（定时任务特性收尾）

- **变更类型**：优化（文档同步，纯文档无代码改动）
- **变更摘要**：定时任务增强特性实现收尾的文档同步。新增发布说明草稿 `docs/05-features/automations/release-notes.md`（spec/design 两处要求「发布说明写明」）：并发默认值变化（允许并行 → 跳过，存量任务适用，视为修 bug）置顶，一次性/间隔/webhook/导入导出/AI 创建自动化五项新增能力与界面变化分节；发布后归档，正式发布由人取用。06-module 两篇同步：「会话与执行」页头入口补「AI 创建自动化」并新增 composer 编排段（ensure-composer-automation 项目级禁用态注册、start-composer-session oneShotPrompt 递交、启用留人不执行 `--enabled`）；「系统提示词与渐进加载」补 composer 提示词来源差异（不走 cycle-prompt 渲染，分发副本 ?raw 内嵌全文）。STATUS.md 全表更新：六环表第 3 环 →●（砍留重排后设计全部实施）、第 4/5 环证据刷新；AU04/AU06/AU08/AU09 ○→◐（入口已落地待真壳证据）；已知债段——COUNT/concurrencyPolicy/carryLastRunOutput/promptSnapshot 回退完成、发布说明草稿已建。特性矩阵第 8 行与脚注⁴从「未写实现代码」更新为「已实现，AU01 ✅」。
- **涉及文件**：
  - `docs/05-features/automations/release-notes.md`（新增：发布说明草稿）
  - `docs/06-module/会话与执行.md`（composer 入口与编排段）
  - `docs/06-module/系统提示词与渐进加载.md`（composer 提示词来源）
  - `docs/05-features/automations/STATUS.md`（六环表/验收点矩阵/已知债全表更新）
  - `docs/05-features/README.md`（特性矩阵第 8 行与脚注⁴）
- **验证**：文档检查——release-notes 与 spec/design 的并发行为表述逐条对齐（固定跳过、手动不受限、存量适用、无策略开关）；06-module 两篇新增段与 Task 6 实现一致（bw-composer 身份、oneShotPrompt 不写回、启用留人）；STATUS 状态与各任务 changelog 证据一致，未冒充未验项（AUJ01/AU07 保持 ○）；未改任何运行时代码，不伪造界面验证。

## 2026-10-12 新增（定时任务：AU01 一次性到点真壳 E2E）+ 修复（onceAt 转发缺失）

- **变更类型**：新增（验收驱动脚本）/ 修复（runtime 控制器字段转发）/ 重构（copyPatchValues 拆分过 max-lines 门禁）
- **变更摘要**：AU01 验收点真壳通过。新增 `config/scripts/au01-once-automation-e2e.mjs`：构建产物 serve 模式（`out/main/index.js --serve`，随机端口 + 临时 profile + 临时 git 仓）全链路驱动——`automations create --trigger once --at <ISO> --disabled`（断言 onceAt 毫秒原值落盘、rrule 空、禁用态）→ 人 `edit --enabled` → 等 60s tick 到点真实派发（断言 run trigger='scheduled'、scheduledFor=onceAt，驱动全程不调 `automations run`）→ scheduledRunCount=1 即「已结束」→ SIGTERM 杀进程重起同 profile → run 行/计数/onceAt 读回完全一致（铁律一）。驱动首跑即抓出真缺陷：runtime 控制器 `create` 转发白名单与 `update` 的 copyPatchValues 键表都漏 `onceAt`，store 收不到 onceAt 就对空 rrule 跑出现计算落进 cron 五字段解析报「Cron schedule must have five fields」——两处补转发（update 侧 null 透传保显式清除语义），新增回归测试 1 例（src/main/runtime 不在 ratchet 桶内）。copyPatchValues 拆至 `runtime-automation-update-value.ts`（与 hasRuntimeAutomationUpdateValue 同域）过 max-lines 门禁，无新豁免。
- **涉及文件**：
  - `config/scripts/au01-once-automation-e2e.mjs`（新增：AU01 验收驱动，可复跑）
  - `src/main/runtime/runtime-automation-controller.ts`（create/update 补 onceAt 转发；copyPatchValues 拆出）
  - `src/main/runtime/runtime-automation-update-value.ts`（新增 copyRuntimeAutomationPatchValues）
  - `src/main/runtime/orca-runtime-automations.test.ts`（+1 例：一次性 onceAt 建档转发回归）
  - `docs/05-features/automations/STATUS.md`（AU01 行 ○→✅ 证据登记；六环表第 5 环 ○→◐；现状段更新）
- **验证**：E2E 终验 PASS（拆分后 bundle 重跑）：create 落 onceAt=1791774483686 原值+空 rrule+禁用 → 人启用 → 到点 run f3b4bcf6 trigger=scheduled status=dispatched scheduledFor=onceAt → scheduledRunCount=1 → 杀进程重起读回一致（1 run row、计数、onceAt）；controller 测试 12/12；main automations+persistence 面 212/213（1 失败为 external-manager-scoped Windows `where`/`which` 预存，与基线一致）；`pnpm run typecheck` 三工程 0 错误；ratchet 257=基线；oxlint 改动文件 EXIT=0（max-lines 拆分后归零）；oxfmt 已格式化。dev:workbench 界面标签（Once at/Finished）目检留人工，未做。

## 2026-10-10 新增（定时任务：已结束标记与一次性调度展示）

- **变更类型**：新增（UI 小件）
- **变更摘要**：自动化列表行与详情页补一次性任务的生命周期展示，判别全部走收口模块 `automation-schedule-kind.ts`（消费者不写字段判断）：调度列对一次性任务（onceAt 存在、rrule 为空）显示「Once at \<时刻\>」，不再落「Invalid schedule」；下次运行列经 `deriveLifecycleState` 现算「已结束」（一次性已派发或超宽限），优先于人的暂停开关且与 enabled 分开呈现（「已结束」是推导值不是存储状态，铁律一）。skipped_overlap 的运行历史行标签（「Skipped — previous run still active」）前序提交已存在，本次核对无新增。真壳目检并入 Task 9 E2E 同屏验证。
- **涉及文件**：
  - `src/renderer/src/components/automations/AutomationListLocalRow.tsx`（调度列 Once at + 下次运行列 Finished）
  - `src/renderer/src/components/automations/AutomationDetail.tsx`（详情 Schedule/Next run 两处同构）
- **验证**：renderer automations 811/811（与 HEAD 基线一致，无回归）；ratchet 257=基线；`pnpm run typecheck` 三工程零错误；oxlint 两文件 EXIT=0（max-lines 未触发）；oxfmt 已格式化。真壳界面目检未做，留 Task 9 E2E 同屏验证。

## 2026-10-10 新增（定时任务：automation-composer Skill 正源）

- **变更类型**：新增（纯文档）
- **变更摘要**：Task 6 分发副本（`skills/automation-composer/SKILL.md`，随 composer 自动化提示词内嵌）补上产品正源 `standard/skills/automation-composer/SKILL.md`，按 SKILL-MD-SPEC 撰写：目的与边界、五步执行流程（起草展示 → `create --disabled` → 试跑 → `runs --json` 读回迭代 → 交还启用）、边界与失败四条。三条硬约束与分发副本一致：不执行 `--enabled`（启用是用户的决定）、试跑前告知真实副作用、读回失败如实报告；另加 CLI 不可用报错停止不换可执行文件硬试（分发副本的 CLI 解析段同规则）。`standard/skills/README.md` 技能表登记一行，注明分发形态为提示词内嵌（非 Stub 与原生指南）。
- **涉及文件**：
  - `standard/skills/automation-composer/SKILL.md`（新增正源，version 0.1.0）
  - `standard/skills/README.md`（技能表加「自动化作曲」行）
- **验证**：文档检查——对照 SKILL-MD-SPEC 自检（name 与目录一致、description 含触发场景与边界、正文按任务组织无冗余章节、命令面 `orca automations create --disabled/run/runs --json/edit` 均已在 CLI specs 验证存在）；正源与分发副本 SOP 段落逐条对齐（副本仅多 CLI 解析段，为会话运行时所需）；未改任何运行时代码，不伪造界面验证。

## 2026-10-10 新增（定时任务：AI 创建自动化 composer 会话编排）

- **变更类型**：新增
- **变更摘要**：计划屏页头新增「AI 创建自动化」入口（与「配置自动化」并列），背后的编排复用 ensure/start-cycle-automation 模式：进屏注册一条禁用态 composer 自动化（身份 `bw-composer:<项目+仓库+宿主>`，不含 workflow——项目级入口两屏共用一条；提示词 = 分发副本 `skills/automation-composer/SKILL.md` 的 `?raw` 内容，BW 所有字段进屏覆盖同步，人所有字段永不触碰；调度为 schema 占位 daily 09:00，`enabled:false` 禁用定时，runNow 不检查 enabled 故手动可跑）。点入口弹一句话 Dialog，用户描述作为 oneShotPrompt 随 runNow 一次性投递（不写回记录），轮询打开本次匹配的运行终端（30s/1s，同周期启动）。Skill 正文写入三条硬约束：不执行 `--enabled`、试跑前告知真实副作用、读回失败如实报告；操作序列对齐 spec（起草展示 → `create --disabled` → `run` 试跑 → `runs --json` 读回 → `edit` 迭代 → 人启用）。测试对冲：composer 装配协议新增 1 例（ratchet +1），ensure-cycle-automation 的两个 skip 守卫例合并为一例保留全部分支断言（-1），净 0 基线 257 不变。
- **涉及文件**：
  - `skills/automation-composer/SKILL.md`（新增分发副本初版：自包含 composer SOP + CLI 解析段；正源 `standard/skills/` 随 Task 7 建立后同步）
  - `src/renderer/src/workbench/version-cycle/ensure-composer-automation.ts`（新增：注册/覆盖同步/并发去重 + useEnsureComposerAutomation hook）
  - `src/renderer/src/workbench/version-cycle/start-composer-session.ts`（新增：owner fence → runNow(oneShotPrompt=用户描述) → 轮询开终端）
  - `src/renderer/src/workbench/version-cycle/AutomationComposerButton.tsx`（新增：页头按钮 + 一句话 Dialog）
  - `src/renderer/src/workbench/version-cycle/ensure-composer-automation.test.ts`（新增 1 例：创建装配协议）
  - `src/renderer/src/workbench/version-cycle/ensure-cycle-automation.ts`（导出 pinnedAuthority/destinationFor 供 composer 复用）
  - `src/renderer/src/workbench/version-cycle/ensure-cycle-automation.test.ts`（skip 两例合并对冲 ratchet）
  - `src/renderer/src/workbench/version-cycle/CycleWorkspaceProvider.tsx` / `cycle-workspace-context.ts` / `CycleWorkspaceShell.tsx`（compose 回调与 context 穿透）
  - `src/renderer/src/workbench/version-planning/PlanningSections.tsx` / `PlanningBoard.tsx` / `planning-dialogs.css`（页头入口与 textarea 样式）
- **验证**：version-cycle + version-planning 42/42；renderer workbench 全量 135/135；ratchet 257=基线（+1/-1 对冲）；`pnpm run typecheck` 三工程零错误（CycleWorkspaceShell 的 CycleEntry 字面量补 compose 一处）；oxlint 改动文件 EXIT=0；oxfmt 已格式化。真壳 AU06 全链路（入口→会话→试跑→人启用）为 Task 9 E2E 必验项，本次未做真壳验证。

## 2026-10-10 新增（定时任务：配置导入导出，portable schema）

- **变更类型**：新增
- **变更摘要**：定时任务可导出为可移植 JSON 并在另一台机器导入。可移植子集（`schemaVersion:1`）：名称、提示词、precheck、agent、调度（rrule+dtstart，一次性任务为 `onceAt`+空 rrule）、时区、宽限、工作区模式、基线分支、会话复用；机器绑定字段（宿主、项目、工作区、启用态、scheduledRunCount、时间戳、webhookToken）绝不投影也绝不接受——导入文件只能携带配置，不能携带状态。schema 校验指名报错（缺失/类型不符字段名进错误消息），不部分导入。三入口：CLI `orca automations export <id> [--file]`（缺省 stdout）、CLI `orca automations import <file> --repo|--workspace|--project`（目标显式必传，导入起停用 `enabled:false`，同名不覆盖直接报错）、UI 列表行菜单「Export」（复用 `fs.saveDownloadedFile` 保存对话框，零新 IPC）+ 工具栏「Import」（新 IPC `automations:pickImportFile` 一次完成选文件+读内容 → 共享 parser 校验 → 预填原生编辑器，宿主/项目/工作区留空让人选）。导入预填的调度映射诚实往返：预设 rrule 映射回 preset+time；every_n 与未识别的合法调度走 custom 原文（保存透传 customSchedule，不改写）；一次性任务在 UI 指名拒绝（编辑器无法表达一次性时刻，保存路径会撒谎），提示引导用 CLI 导入——CLI 侧全类型支持。`AutomationEditorRequest` 的 create 变体 host 改可选（导入不钉宿主）、draft 可选键扩 6 个（precheck/baseBranch/宽限/savedSchedule/scheduleWarning）。
- **涉及文件**：
  - `src/shared/automation-portable-schema.ts`（新增：投影/校验纯函数 + schemaVersion）
  - `src/shared/automation-portable-schema.test.ts`（新增 2 例：往返+机器绑定排除、指名报错）
  - `src/cli/handlers/automation-portable-handlers.ts`（新增：export/import 两 handler，独立文件过 max-lines 预算）
  - `src/cli/handlers/automations.ts`（getExplicitTarget 导出供 import 复用）
  - `src/cli/specs/automations.ts`（export/import 命令 spec）
  - `src/cli/handler-group-manifest.ts`（automations 组加两 key、合并加载两 handler 表）
  - `src/main/ipc/automations.ts`（`automations:pickImportFile`：showOpenDialog+readFile 一次往返）
  - `src/preload/api/automation-api.ts` / `automations-bridge.ts`（pickImportFile 类型与桥接）
  - `src/renderer/src/components/automations/automation-portable-file-actions.ts`（新增：导出/导入动作 + buildAutomationImportRequest 调度反向映射）
  - `src/renderer/src/components/automations/automation-editor-request.ts`（create 变体 host 可选 + draft 扩键）
  - `src/renderer/src/components/automations/use-automation-editor-actions.ts`（可选 host 适配）
  - `src/renderer/src/components/automations/AutomationListLocalRow.tsx`（行菜单双入口加 Export）
  - `src/renderer/src/components/automations/AutomationsListPanel.tsx` / `AutomationListToolbar.tsx` / `AutomationsPageListPanel.tsx`（exportAutomation/importAutomation 穿透 + Import 按钮）
  - 三个测试文件补新 props（AutomationListLocalRows/AutomationListHostGroups/AutomationsListPanel .test.tsx）
- **验证**：schema 2/2；renderer automations 813/813；main automations 207/208（1 失败为 external-manager-scoped Windows `where`/`which` 预存，与 Task 4 基线一致）；CLI specs/handlers/help/manifest 441/445（4 失败全为 orchestration-* Windows 引号渲染预存）；main ipc 无 automations 相关失败（18 失败全为 pty/wsl/watcher Windows 预存）；`pnpm run typecheck` 三工程零错误；oxlint 改动文件 EXIT=0；oxfmt 已格式化；双 ratchet 绿（vitest 257=基线——新增 2 例在 src/shared 不受 ratchet 约束范围；max-lines 7 豁免无新增）。

## 2026-10-10 新增（定时任务：serve 模式 webhook 触发，每任务 token）

- **变更类型**：新增（webhook 端点 + token）/ 重构（三文件拆分过 max-lines 门禁）
- **变更摘要**：serve 模式在 WS 端口的 plain-HTTP 面挂载 `POST /webhooks/automations/<id>`，请求带 `x-webhook-token` 头；契约 404（路径/id 未知）→ 401（token 不符）→ 409（停用）→ 200 `{outcome:'dispatched',runId,status}` 或 `{outcome:'skipped_overlap'}`，非法调用如实 4xx、不触发、不写运行行。token 建档随机生成一次、`--regenerate-webhook-token` 重生成、恒定时间比较；机器绑定不进导出。实现为 service 独立 `runWebhook` 入口（与计划「runNow 加 trigger 参数」的偏差：webhook 受固定并发约束跳过并记录，runNow 不查并发——独立入口避免策略分叉），计数与一次性机会照手动语义不消耗。桌面模式不构造 handler（无端点）；详情页 webhook 区块三态诚实：serve 显示 POST URL + token，桌面显示「需要 serve 模式」，老 host 未知不渲染。`automation.list/show` additive 返回 `webhookBaseUrl`。为过 max-lines 门禁拆分三处 T1/T6 遗留超限：ExternalAutomation 类型拆 `external-automations-types.ts`（re-export 保持 30+ import 不动）、触发语义三用例拆 `service-trigger-semantics.test.ts`、tick 评估循环拆 `due-run-evaluator.ts`。
- **涉及文件**：
  - `src/main/runtime/rpc/automation-webhook-handler.ts`（新增：端点 handler + runtime 适配器）
  - `src/main/automations/webhook-token.ts`（新增：token 生成/恒定时间校验）
  - `src/main/runtime/rpc/ws-transport-http-listener.ts`（新增：plain-HTTP 组合抽离，ws-transport 回到限内）
  - `src/main/automations/service.ts`（runWebhook 入口；evaluateDueRuns/evaluateAutomation 拆出）
  - `src/main/automations/due-run-evaluator.ts`（新增：tick 评估循环）
  - `src/main/automations/service-trigger-semantics.test.ts`（新增：webhook/一次性/重叠三用例拆分）
  - `src/shared/external-automations-types.ts`（新增：外部管理器类型拆分，automations-types re-export）
  - `src/main/startup/main-process-runtime-launch.ts`（serve 挂 handler、发布 webhookBaseUrl）
  - `src/main/runtime/runtime-automation-controller.ts`（runWebhook 委托 + assertService 收口）
  - `src/renderer/src/components/automations/`（详情页 webhook 区块：`use-selected-automation-webhook.ts` 新增 + AutomationDetail/DetailPane/PageSurface/setup-state/local-state/refresh/scoped-list-client 七文件穿透）
  - `src/shared/automations-types.ts`（webhookToken 字段 + AutomationWebhookRunResult + trigger:'webhook'）
  - `src/main/automations/webhook-token.test.ts`（新增 2 例：恒定时间校验/不匹配拒绝）
- **验证**：main automations 207/208（1 失败为 external-manager-scoped Windows `where`/`which` 预存平台问题）；rpc methods 13/13、ws-transport 族 41/41、service+trigger 18/18、renderer automations 811/811、CLI 30/30；`pnpm run typecheck` 三工程 exit 0；oxlint 全部改动文件零错误（三处遗留超限经拆分归零，无新豁免）；双 ratchet 绿（vitest 257=基线、max-lines 7 豁免无新增）；ai-vault 2 例 Windows 路径分隔符预存失败与本次无关。

## 2026-10-10 新增（定时任务：CLI 一次性与间隔触发表达）

- **变更类型**：新增
- **变更摘要**：`orca automations create/edit --trigger` 新增两类表达。`once --at <ISO时间戳>`：一次性任务，写 `onceAt`、rrule 置空；缺 `--at`、`--at` 非法或非未来时刻在触达 runtime 前拒绝，`--at` 只能配 `once`。`every <N><m|h>`：间隔任务，归一为 `FREQ=MINUTELY;INTERVAL=<分钟>`——引擎间隔语义是 MINUTELY 数学（dtstart 锚点），HOURLY 分支不感知 INTERVAL，按计划字面写 `FREQ=HOURLY;INTERVAL=2` 会实跑成每小时，故按引擎实际语义归一。编辑时 `--trigger` 显式清一次性（`onceAt: null`），支持循环⇄一次性互转（跨界切换次数清零由存储层既有逻辑处理）；建档不送空 onceAt。wire 侧两处修正：create 的 rrule 放行空串（一次性联立 superRefine 守门，无 onceAt 的空 rrule 仍拒）；update 的 rrule 改保空串（原 OptionalString 会把 `''` 折回 undefined，搁浅循环→一次性切换）。CLI 展示 once 感知：一次性任务显示「Once at \<ISO\>」而非「Invalid schedule」。
- **涉及文件**：
  - `src/cli/handlers/automation-schedule-flag.ts`（新增：调度触发解析独立模块——once/every 解析、`--at` 校验、循环分支返回 `onceAt: null`；自 handler-flags 抽出以过 max-lines 门禁）
  - `src/cli/handlers/automation-handler-flags.ts`（摘除调度块，仅留 provider/enabled/reuse/precheck/source-context/workspace-mode）
  - `src/cli/handlers/automations.ts`（create 剥离空 onceAt）
  - `src/shared/rpc-contract/automation-params.ts`（create rrule 空串放行、update rrule 保空串）
  - `src/cli/automation-format.ts`（`Once at` 展示标签）
  - `src/cli/specs/automations.ts` / `src/cli/help.ts` / `src/cli/bundled-skill-guides.ts`（flag 注册、用法、帮助、内嵌指南同步）
  - `src/cli/index-automation-schedule.test.ts`（新增 3 例）
- **验证**：定向 10/10 绿；全 src/cli + automation 面 2278 通过、14 失败均为预存平台/叠层问题（parity 与 orchestration-gate 经 HEAD stash 基线复现同样失败，client-recovery 为 Windows Unix socket EACCES，均与本次改动无关）；`pnpm run typecheck` 三工程 exit 0；src/cli 不在 vitest-count-ratchet 桶内，无额度影响。

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
