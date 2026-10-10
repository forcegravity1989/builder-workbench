# 定时任务实现设计

> 给实现与技术评审者动代码前读；本文管对象、字段、复用、收口与异常设计。行为见 [spec](spec.md)，价值见 [intent](intent.md)。设计变化时更新，落地后同步 06-module。
>
> 状态：已 gate（2026-10-09，随 intent/spec 一并确认）；2026-10-10 再审收窄（用户携能力矩阵拍板，见决策记录末条）。定位 architecture §1「设置定时工作」；调度能力在执行核，BW 叠层只做入口与会话编排。

## 侵入面与复用

原则：**只加可选字段，不改现有字段语义，新逻辑收口在既有函数的扩展点**。这样 Orca upstream 更新时，本特性的改动能快速增量同步。

| 层 | 位置 | 改动 |
| --- | --- |
| 数据模型 | `src/shared/automations-types.ts` | `Automation` 追加 `onceAt`、`scheduledRunCount`、`webhookToken`；`AutomationRun` 追加 `skipped_overlap` 状态与 `trigger: 'webhook'` 取值 |
| 判别收口 | `src/shared/automation-schedule-kind.ts` | `isOneShotAutomation`、`deriveLifecycleState` 纯函数；「onceAt 优先于 rrule」的判断只写在这一处 |
| 调度解析 | `automation-schedule-parsing.ts`、`automation-schedule-occurrences.ts` | RRULE 补 `FREQ=MINUTELY`、`INTERVAL` 标准语义（COUNT 容忍忽略）；间隔出现计算走 `dtstart + k×interval` 数学 |
| 调度器 | `src/main/automations/service.ts`、`persistence/scheduling-automations/` | `evaluateAutomation` 收口处加生命周期/并发判断；`advanceAutomationNextRun` 扩展 |
| 运行写入 | `automation-run-writer.ts`、`dispatch-refusal.ts` | `skipped_overlap` 复用拒绝合并机制 |
| webhook | serve HTTP 面 + `persistence` | 每任务 token；触发走 `runNow` 同一派发链，trigger 记 'webhook' |
| 导入导出 | `src/shared/automation-portable-schema.ts`（新）+ CLI + 列表行菜单 | 纯新增 |
| BW 叠层 | `workbench/version-cycle/ensure-composer-automation.ts`、`start-composer-session.ts`（新） | 复用 ensure/start-cycle-automation 模式 |
| Skill | `standard/skills/automation-composer/SKILL.md`（新） | 按 `SKILL-MD-SPEC`；正源 `standard/` |

不碰：`Automation` 现有字段、rrule 存量格式、missed 宽限机制、运行保留策略（100 条/任务）、hermes/openclaw 映射逻辑、原生编辑器预设选择器。

## 数据模型

```ts
// Automation 追加（全部可选，缺省即旧行为）
onceAt?: number                // 存在即一次性；目标时间戳；此时 rrule 为空
scheduledRunCount?: number     // 已实际派发的调度次数；持久正本（历史会被保留策略裁剪，不能从 runs 数）
webhookToken?: string | null   // serve 模式触发凭据；机器绑定，不进导出

// AutomationRunStatus 追加 'skipped_overlap'
// AutomationRun.trigger 取值增加 'webhook'
```

「已结束」不存储，由 `deriveLifecycleState(automation, now)` 现算：一次性已派发过（`scheduledRunCount ≥ 1`，无论那次成功失败）即终结；或超过宽限仍未跑。循环任务不因此终结（次数上限已砍除）。

这样满足铁律一「杀进程重开数字能重新计算」。`scheduledRunCount` 与 `nextRunAt` 一样是持久化字段、推导源；不能从运行历史数——历史会被保留策略裁剪。

## 调度解析与出现计算

- `parseRrule` 接受 `FREQ=MINUTELY`；解析 `INTERVAL`（缺省 1）；`COUNT` 容忍出现但不生效（2026-10-10 再审砍除次数上限）；`BYHOUR/BYMINUTE` 仅对日历型生效。
- `nextAutomationOccurrenceAfter`：间隔型走 `dtstart + k×interval > after` 纯数学；日历型沿用逐日扫描；一次性不走此函数（`nextRunAt = onceAt` 建档时直写）。
- 存量表达式（无 INTERVAL）解析结果与今天一致。

## 调度器收口

`evaluateDueRuns` 每行先过 `deriveLifecycleState`，已结束的跳过。`evaluateAutomation` 派发前按序做三件事：

1. **一次性**：`onceAt` 到点 → 复用现有宽限判定 → 派发，或记 `skipped_missed`。不推进 `nextRunAt`（没有下次）。派发成功即 `scheduledRunCount = 1`，由派生状态终结。派发被拒不计次数：宽限内下个 tick 重试（同因拒绝已被折叠机制合并），超宽限记 `skipped_missed` 后终结——错过与被拒两条路径在超宽限时统一落 `skipped_missed`。
2. **并发**：该任务存在非终态运行（pending/dispatching/dispatched）→ 记 `skipped_overlap`，复用现有 repeatSkip 同因折叠。固定行为，无每任务开关。
3. **拒绝折叠**：派发被拒（宿主不可用等）经 repeatSkip 合并，防高频任务刷爆历史。

手动 `runNow` 不检查并发、不递增 `scheduledRunCount`——人明确要跑；试跑因此不吃掉一次性机会，启用后到点照常触发。webhook 触发走 `runNow` 同一链路，trigger 记 'webhook'，同样不递增调度计数（它是外部手动等价物，不是调度出现；一次性任务的 webhook 触发不消耗 onceAt 机会，到点仍会触发）。

## webhook 触发

- serve 模式 HTTP 面新增触发端点；鉴权为每任务随机 token（`webhookToken`，生成一次存库，可重新生成）。
- 命中且任务启用 → 走 `runNow` 派发链；上次仍在运行时同样受固定并发行为约束（跳过并记录）。
- token 不符/任务停用/非 serve 模式 → 如实拒绝。桌面模式 UI 显示「需要 serve 模式」。
- 不做签名、轮换、IP 白名单（矩阵：这些是独立能力）。

## 生成会话编排

复用 cycle 模式，零新增 RPC 工具面：

- `ensure-composer-automation`：登记「自动化作曲」自动化。固定提示词 = composer Skill 内容；禁用定时；固定工作区 = 当前项目工作区；`creationKey` 去重。已有条目按 BW 当前版本覆盖同步提示词，用户设置保留（同 ensure-cycle-automation 语义）。
- `start-composer-session`：`runNow(composer, oneShotPrompt = 用户描述)` + 打开原生会话（同 start-cycle-automation 的等待与失败处理）。
- 会话内 AI 的工具就是现有 `orca automations` CLI（`create --disabled` / `run` / `runs --json` / `edit` / `export`）加项目文件读写。CLI 增量：`--trigger` 接受 `once --at <时间>` 与 `every <N><m|h>`（写 INTERVAL rrule）。
- Skill 硬约束：不执行 `--enabled`（启用留给人）；试跑前告知真实副作用；读回失败如实报告，不重试轰炸。

## 通知

沿用现有会话完成通知链路（agent 完成通知：仓内悬浮窗与系统弹窗），本特性**不新建通知模块、不加字段**。按任务通知设置与 Welink webhook 为后续待办（整仓尚未接入 Welink，2026-10-09 拍板先沿用现有）：届时一并设计通知判定（失败与跳过分开算）、推送通道与设置页配置区，挂点在 `markDispatchResult` 终态路径；凭据形态届时核对，不进诊断日志。

## 导入导出

- 新增 `automation-portable-schema.ts`：`schemaVersion` + 可移植子集（字段清单见 spec）。导出从记录投影；导入校验后预填编辑器草稿，人绑定宿主后走现有保存链。
- CLI：`orca automations export <id> [--file]`、`orca automations import <file> --repo|--workspace ...`。
- 校验失败指名缺失字段；导入恒为创建新记录，不覆盖、不部分导入。

## 错误处理

- 一次性超宽限：`skipped_missed` + 派生终结，记录保留。
- `skipped_overlap` 同因折叠，防高频任务刷爆历史（沿用拒绝合并机制）。
- webhook 非法调用：如实 4xx，不触发、不记录运行。
- 外部 provider 不支持新字段：如实降级显示。
- 导入文件非法：指名字段报错，不部分导入。

## 测试策略

按 [02 环 4](../../01-principles/02-working-backwards.md) 两类看护，单特性新增 ≤10 例，受 vitest-count-ratchet 约束（新增须同交付对冲删除）：

- **核心算法函数**：RRULE 解析（INTERVAL/MINUTELY）、间隔出现计算、`deriveLifecycleState`、导入导出 schema 往返、webhook token 校验。
- **E2E 强相关数据协议**：`skipped_overlap` 状态转换、webhook trigger 记账。
- **真壳 E2E**（验收点，控量）：一次性任务真实到点触发；计划屏入口 → composer 会话 → 试跑 → 人启用全链路。
- UI、文案、装配不新增单测；存量相关单测随改维护。

## 决策记录

- **增量字段 vs schedule union 重构**（2026-10-09 会话裁定）：只有一次性需要 `onceAt` 字段；两种方案要改的 8 处消费者相同，重构只买到类型美观，代价是全量迁移加在 upstream 最活跃的字段上制造永久分歧。维持原结构。**重构触发点**：出现第二个装不进 rrule 的调度形态时，把一次性与它一起迁入 union。webhook 不算——它是触发层扩展，不进调度表达。
- **并发默认 skip**：存量行为从「允许并行」变「跳过」，视为修 bug（堆叠终端从来不是用户想要的），发布说明写明。2026-10-10 再审后为固定行为，不提供策略字段。
- **通知不新建链路**（2026-10-09 用户拍板）：现有会话完成通知已覆盖「跑完知道」；按任务通知设置与 Welink 推送随 Welink 接入一并设计，不先造判定字段。
- **2026-10-10 再审收窄**（用户携能力矩阵逐项拍板，证据见 [research.md](research.md) 第二轮）：**砍除**——每 N 分钟/小时预设（不建）、执行次数上限（回退 COUNT 链）、每任务并发策略配置（回退字段，留固定行为）、携带上次结果（未提交改动丢弃）、提示词快照（未提交改动丢弃）；**保留**——一次性引擎（已落地，composer 需「明早九点跑一次」表达）、固定跳过、导入导出；**新增**——webhook 最小形态（serve + 每任务 token，对照 Manus；CLI `orca automations run` 已存在，shell 触发今天已可用）。矩阵依据：被砍三项在 15 产品中零原生先例；保留项均有 2–4 家先例。
