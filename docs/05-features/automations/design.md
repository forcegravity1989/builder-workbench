# 定时任务实现设计

> 给实现与技术评审者动代码前读；本文管对象、字段、复用、收口与异常设计。行为见 [spec](spec.md)，价值见 [intent](intent.md)。设计变化时更新，落地后同步 06-module。
>
> 状态：2026-10-09 设计会话确认，待人 gate 后实施。定位 architecture §1「设置定时工作」；调度能力在执行核，BW 叠层只做入口与会话编排。

## 侵入面与复用

原则：**只加可选字段，不改现有字段语义，新逻辑收口在既有函数的扩展点**。这样 Orca upstream 更新时，本特性的改动能快速增量同步。

| 层 | 位置 | 改动 |
| --- | --- | --- |
| 数据模型 | `src/shared/automations-types.ts` | `Automation` 追加 5 个可选字段；`AutomationRun` 追加 `promptSnapshot` 与 `skipped_overlap` 状态 |
| 判别收口 | `src/shared/automation-schedule-kind.ts`（新） | `isOneShotAutomation`、`deriveLifecycleState` 等纯函数；「onceAt 优先于 rrule」的判断只写在这一处 |
| 调度解析 | `automation-schedule-parsing.ts`、`automation-schedule-occurrences.ts` | RRULE 补 `FREQ=MINUTELY`、`INTERVAL`、`COUNT` 标准语义；间隔出现计算走 `dtstart + k×interval` 数学 |
| 调度器 | `src/main/automations/service.ts`、`persistence/scheduling-automations/` | `evaluateAutomation` 收口处加生命周期/并发判断；`advanceAutomationNextRun` 扩展 |
| 运行写入 | `automation-run-writer.ts`、`dispatch-refusal.ts` | 快照写入；`skipped_overlap` 复用拒绝合并机制 |
| 原生编辑器 | `AutomationSchedulePicker.tsx`、`AutomationEditorDialog.tsx` | 调度选择器加一次性/每 N 分钟/每 N 小时；次数上限输入；并发/携带/通知设置项 |
| 通知 | `src/main/automations/run-notifications.ts`（新） | 运行终态回调发 Electron 通知；Welink 推送为后续待办，不在本轮侵入面 |
| 导入导出 | `src/shared/automation-portable-schema.ts`（新）+ CLI + 列表行菜单 | 纯新增 |
| BW 叠层 | `workbench/version-cycle/ensure-composer-automation.ts`、`start-composer-session.ts`（新） | 复用 ensure/start-cycle-automation 模式 |
| Skill | `standard/skills/automation-composer/SKILL.md`（新） | 按 `SKILL-MD-SPEC`；正源 `standard/` |

不碰：`Automation` 现有字段、rrule 存量格式、missed 宽限机制、运行保留策略（100 条/任务）、hermes/openclaw 映射逻辑。

## 数据模型

```ts
// Automation 追加（全部可选，缺省即旧行为）
onceAt?: number                // 存在即一次性；目标时间戳；此时 rrule 为空
scheduledRunCount?: number     // 已实际派发的调度次数；持久正本（历史会被保留策略裁剪，不能从 runs 数）
concurrencyPolicy?: 'skip' | 'allow'   // 缺省 'skip'
carryLastRunOutput?: boolean   // 缺省 false
notifyOn?: 'none' | 'failure' | 'all'  // 缺省：一次性 'all'，循环 'failure'

// AutomationRun 追加
promptSnapshot?: string | null // 派发时快照最终递交的完整提示词
// AutomationRunStatus 追加 'skipped_overlap'
```

「已结束」不存储，由 `deriveLifecycleState(automation, now)` 现算：

- 一次性：已派发过（`scheduledRunCount ≥ 1`，无论那次成功失败）即终结；或超过宽限仍未跑（`onceAt + 宽限 < now`）。
- 循环：达到次数上限（`scheduledRunCount ≥ COUNT`，COUNT 从 rrule 解析；无上限则永不因此终结）。

这样满足铁律一「杀进程重开数字能重新计算」。`scheduledRunCount` 与 `nextRunAt` 一样是持久化字段、推导源；不能从运行历史数——历史会被保留策略裁剪。

## 调度解析与出现计算

- `parseRrule` 接受 `FREQ=MINUTELY`；解析 `INTERVAL`（缺省 1）与 `COUNT`；`BYHOUR/BYMINUTE` 仅对日历型生效。
- `nextAutomationOccurrenceAfter`：间隔型走 `dtstart + k×interval > after` 纯数学；日历型沿用逐日扫描；一次性不走此函数（`nextRunAt = onceAt` 建档时直写）。
- COUNT 预算在调度器检查（出现函数只管时间，次数是调度语义），避免解析层与运行历史耦合。
- 存量表达式（无 INTERVAL/COUNT）解析结果与今天一致。

## 调度器收口

`evaluateDueRuns` 每行先过 `deriveLifecycleState`，已结束的跳过。`evaluateAutomation` 派发前按序做五件事：

1. **一次性**：`onceAt` 到点 → 复用现有宽限判定 → 派发，或记 `skipped_missed`。不推进 `nextRunAt`（没有下次）。派发成功即 `scheduledRunCount = 1`，由派生状态终结。派发被拒不计次数：宽限内下个 tick 重试（同因拒绝已被折叠机制合并），超宽限记 `skipped_missed` 后终结——错过与被拒两条路径在超宽限时统一落 `skipped_missed`，通知判定不分叉。
2. **并发**：策略为跳过且该任务存在非终态运行（pending/dispatching/dispatched）→ 记 `skipped_overlap`，复用现有 repeatSkip 同因折叠；不消耗次数额度。
3. **次数**：派发成功后 `scheduledRunCount + 1`；达到 COUNT 后由派生自然终结。改大上限复活无特殊处理：`nextRunAt` 已过期就按常规宽限判定补跑或记 `skipped_missed` 后推进。
4. **快照**：dispatch 时把最终提示词（含 oneShotPrompt 合并、含携带的上次结果）写入 `promptSnapshot`。
5. **携带**：开关开启时，取该任务最近一次 completed 运行的 `outputSnapshot`，以固定格式附于提示词末尾；没有快照就如实不附。

手动 `runNow` 不检查并发策略、不递增 `scheduledRunCount`——人明确要跑；试跑因此不吃掉一次性机会与次数额度，启用后到点照常触发。仍写快照。

## 生成会话编排

复用 cycle 模式，零新增 RPC 工具面：

- `ensure-composer-automation`：登记「自动化作曲」自动化。固定提示词 = composer Skill 内容；禁用定时；固定工作区 = 当前项目工作区；`creationKey` 去重。已有条目按 BW 当前版本覆盖同步提示词，用户设置保留（同 ensure-cycle-automation 语义）。
- `start-composer-session`：`runNow(composer, oneShotPrompt = 用户描述)` + 打开原生会话（同 start-cycle-automation 的等待与失败处理）。
- 会话内 AI 的工具就是现有 `orca automations` CLI（`create --disabled` / `run` / `runs --json` / `edit` / `export`）加项目文件读写。CLI 唯一增量：`--trigger` 接受 `once` / `every N` 新值，随调度扩展自然带上。
- Skill 硬约束：不执行 `--enabled`（启用留给人）；试跑前告知真实副作用；读回失败如实报告，不重试轰炸。

## 通知

- 新增 `run-notifications.ts`，挂在 `markDispatchResult` 终态路径：按 `notifyOn` 判定 → 发 Electron Notification（点击跳运行详情）。通知异步发送，不阻塞状态机；发送失败写运行记录备注。
- **Welink 群推送为后续待办**（整仓尚未接入 Welink，2026-10-09 拍板先不做）：届时加 webhook 通道与设置页 Connector 配置区，与系统通知同判定、两路都发；凭据形态届时核对，不进诊断日志。

## 导入导出

- 新增 `automation-portable-schema.ts`：`schemaVersion` + 可移植子集（字段清单见 spec）。导出从记录投影；导入校验后预填编辑器草稿，人绑定宿主后走现有保存链。
- CLI：`orca automations export <id> [--file]`、`orca automations import <file> --repo|--workspace ...`。
- 校验失败指名缺失字段；导入恒为创建新记录，不覆盖、不部分导入。

## 错误处理

- 一次性超宽限：`skipped_missed` + 派生终结，记录保留，并按该任务通知判定告知（缺省「每次都通知」），不静默。
- `skipped_overlap` 同因折叠，防高频任务刷爆历史（沿用拒绝合并机制）。
- 通知发送失败 ≠ 运行失败，分开记录。
- 外部 provider 不支持新字段：如实降级显示。
- 导入文件非法：指名字段报错，不部分导入。

## 测试策略

按 [02 环 4](../../01-principles/02-working-backwards.md) 两类看护，单特性新增 ≤10 例，受 vitest-count-ratchet 约束（新增须同交付对冲删除）：

- **核心算法函数**：RRULE 解析（INTERVAL/COUNT/MINUTELY）、间隔出现计算、`deriveLifecycleState`、导入导出 schema 往返。
- **E2E 强相关数据协议**：`promptSnapshot` 写入、`skipped_overlap` 状态转换、携带上次结果的注入格式。
- **真壳 E2E**（验收点，控量）：一次性任务真实到点触发；计划屏入口 → composer 会话 → 试跑 → 人启用全链路。
- UI、文案、装配不新增单测；存量相关单测随改维护。

## 决策记录

- **增量字段 vs schedule union 重构**（2026-10-09 会话裁定）：三个调度缺口里两个（间隔、次数）本就是 RRULE 标准语义，补解析器即可，不动结构；只有一次性需要 `onceAt` 字段。两种方案要改的 8 处消费者相同，重构只买到类型美观，代价是全量迁移加在 upstream 最活跃的字段上制造永久分歧。差别不大，维持原结构。**重构触发点**：出现第二个装不进 rrule 的调度形态（最可能是事件触发器）时，把一次性与它一起迁入 union，一次迁移摊平两件事。
- **并发默认 skip**：存量行为从「允许并行」变「跳过」，视为修 bug（堆叠终端从来不是用户想要的），发布说明写明。
- **COUNT 计实际派发**：跳过与错过不消耗额度，符合「跑五次」的直觉；RFC 5545 的出现次数语义不适用于 agent 执行场景。
