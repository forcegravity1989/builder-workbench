# 定时任务 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

现状（2026-10-12）：特性 gate（2026-10-09）后经用户再审收窄（证据：[research.md](research.md) 第二轮矩阵；砍除间隔预设/次数上限/并发配置/携带上次结果/提示词快照，新增 webhook 最小形态）。分支 feat/automations-enhancements 已落地调度引擎与全部砍留重排后的实现（一次性/间隔触发、调度器收口、webhook、导入导出、composer 会话编排与 Skill、已结束标记 UI），AU01 一次性到点真壳 E2E 已执行通过（serve 模式自动化驱动，杀进程重开读回一致）。本表不表示能力已交付。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ● | [intent.md](intent.md) 已 gate（2026-10-09），2026-10-10 再审收窄 |
| 2 spec | ● | [spec.md](spec.md) 已确认；2026-10-10 再审更新验收点（AU02/AU03/AU05 砍除，新增 AU09 webhook） |
| 3 实现设计 | ● | [design.md](design.md) 随 gate 获认可，2026-10-10 再审更新；砍留重排后的设计已全部实施（回退字段不留双路径） |
| 4 TDD | ◐ | 解析/出现/生命周期/折叠/收口/webhook/schema/composer 装配单测已随各任务提交；ratchet 257=基线；COUNT 相关用例随回退删除 |
| 5 验收点 E2E | ◐ | AU01 已执行通过（2026-10-12，见下表）；AU04/AU06–AU09 入口已落地待真壳证据 |
| 6 用户旅程 E2E | ○ | AUJ01 待执行 |

## 验收点与旅程矩阵

口径：✅ = 已实现且有自动化/真壳证据；◐ = 入口已落地，但没有这次运行的证据；○ = 未实现（如实标注，不冒充）。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| AU01 一次性到点真实触发并终结 | ✅ | 调度器 + 派生生命周期 | 2026-10-12 真壳通过：`node config/scripts/au01-once-automation-e2e.mjs`（构建后 serve 模式）——`create --trigger once --at --disabled` 落 onceAt 原值+空 rrule+禁用，人 `edit --enabled`，到点 tick 派发 run（trigger=scheduled、scheduledFor=onceAt、status=dispatched），scheduledRunCount=1 即「已结束」，SIGTERM 杀进程重起同 profile 读回完全一致（run 行、计数、onceAt）。驱动顺带抓出并修复 runtime controller create/update 白名单漏转 onceAt 的真缺陷（回归测试 1 例）。dev:workbench 界面标签（Once at/Finished）目检留人工 |
| AU04 上次未完成时跳过不堆叠 | ◐ | `skipped_overlap` + 同因折叠 | 调度器收口已落地（固定跳过、同因折叠、occurrenceCount）；单测覆盖，真壳未验 |
| AU06 composer 会话全链路 | ◐ | 叠层编排 + Skill + CLI | 入口/编排/Skill 正源与分发副本均已落地（ensure-composer-automation 禁用态注册 + start-composer-session oneShotPrompt 递交）；全链路真壳（入口→会话→试跑→人启用）未验；启用必须由人操作 |
| AU07 运行完成通知沿用现有链路 | ○ | 无新增模块（沿用 agent 完成通知） | 自动化派发的会话是否同样触发完成通知待验证 |
| AU08 导出 → 导入 → 重绑 → 可运行 | ◐ | portable schema + 编辑器预填 | schema/CLI export+import/UI 菜单已落地（机器绑定字段不投影不接受，导入默认停用）；跨机往返真壳未验 |
| AU09 serve 模式 webhook 触发 | ◐ | serve 端点 + 每任务 token | 端点/token/详情页三态已落地（404→401→409 契约、恒定时间比较、机器绑定不进导出）；真壳 curl 触发未验 |

（AU02 间隔预设、AU03 次数上限、AU05 提示词快照随 2026-10-10 再审砍除；INTERVAL 解析正确性由单元测试看护。）

| 旅程 | 状态 | 覆盖 |
|---|---|---|
| AUJ01 一句话 → 试跑迭代 → 人启用 → 到点触发 → 通知 → 重启读回 | ○ | 未执行 |

**已知债与后续待办**：按任务通知设置与 Welink 群推送为后续待办（通知沿用现有会话完成通知，2026-10-09 拍板）；一次性任务错过（skipped_missed）在通知沿用现状下静默——无运行即无完成通知，随上述待办补；外部 provider（hermes/openclaw）对新字段的降级显示未设计明细；存量任务并发默认值变化（允许并行 → 跳过）发布说明草稿已建（[release-notes.md](release-notes.md)，正式发布由人取用）；COUNT 上限与 concurrencyPolicy/carryLastRunOutput/promptSnapshot 字段已随 2026-10-10 收窄全量回退，无兼容层与双路径。
