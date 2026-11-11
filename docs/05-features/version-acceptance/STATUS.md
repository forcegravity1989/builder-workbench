# 版本验收 — 当前状态

> 给开发、评审和验收者读取。只记录认可来源、当前实现与验证边界；运行结果变化时更新。行为见 [spec](spec.md)，价值见 [intent](intent.md)，实现边界见 [design](design.md)。变更过程与详细验证留在对应 PR，问题跟进沿原生 Issue。

## 认可与交付依据

- 四步会议屏「验收准备 → Showcase → 会议纪要 → 归档 PR 及发版本」于 2026-10-22 经负责人确认；举证前移、报告聚合及会议协作按 [#471](https://github.com/forcegravity1989/builder-workbench/issues/471) 的确认维护。
- 当前交互原型为 [acceptance-journey-prototype.html](acceptance-journey-prototype.html)，报告版式由 [HTML 模板](../../../standard/skills/version-acceptance/assets/evidence-report-template.html)承载；两者均不是运行证据。
- [#422](https://github.com/forcegravity1989/builder-workbench/issues/422) / [PR #584](https://github.com/forcegravity1989/builder-workbench/pull/584) 的报告修订在评审中。负责人于 2026-11-11 确认：先登记并可打开，待核对项保留给人处置，登记不代表验收通过。具体检视、远端检查和内部验证结果留在该 PR。
- 里程碑结果沿人工目标结论、固定计划及正式合入归档读取，见[共同方案](../overview-metrics/spec.md#里程碑与版本联动)；源码接入不等于真实跨版旅程已验。

## 当前证据边界

○ 未实现或未执行；◐ 已有实现但完整用户旅程未验。既有静态检查、原型或协议测试不提升为真壳通过。

| 验收点 | 状态 | 已有依据与仍需验证的边界 |
|---|---|---|
| A01 原生会话与四区 | ◐ | 启动与切屏已接线。会话收起的零占位、1600/1100 窗口、PTY 与栏宽保留曾由独立测试 agent 按同一路径复验，来源 [#445](https://github.com/forcegravity1989/builder-workbench/issues/445)；不覆盖完整验收旅程 |
| A02 固定计划与安全初始化 | ◐ | committed 固定来源、身份与并发保护已接入；真实缺来源、初始化与恢复仍待核对 |
| A03 出包、部署与演示环境 | ◐ | 包真实读回、URL/桌面已启动两形态已接；真实项目部署与两形态读回未完整验证 |
| A04 报告生成、登记与打开 | ◐ | 复用 add-artifact 与内置浏览器；[#516](https://github.com/forcegravity1989/builder-workbench/issues/516) 有历史登记/打开证据。本次 HTML 产出、待核对不阻塞、完整 Skill 读取及 CodeHub 来源链接待内部真实会话验证 |
| A05 人工目标结论 | ◐ | 原生材料守卫及单个状态选择已接入；重启后一致性待真壳核对 |
| A06 纪要与确认 | ◐ | 按目标分组、整份确认/撤销和冻结已接入；真实模型整理、确认及跟进旅程未完整验证 |
| A07 归档 PR | ◐ | 原生 PR 状态、入口及会话归档已接入；真实 provider 归档全链未验 |
| A08 发布读回 | ◐ | tag 引用与真实状态读取见 [#462](https://github.com/forcegravity1989/builder-workbench/issues/462)；原型与历史测试不覆盖真实发布、重启读回 |
| A09 Issue 状态与遗留 | ◐ | 分组、计数、标签与原生详情已接入；真实 provider 交互待验 |
| A10 同步、恢复与冲突 | ◐ | 字段归属合并和草稿恢复已接入；重启、切树、脏树与冲突处理未完整真壳验证 |
| A11 验收范围 | ◐ | 屏上保留报告入口，不设个人自验或逐条验收件工作面 |
| A12 原生自动化 | ◐ | 已复用调度和短入口；真实到点触发未以本轮证据验证 |
| A13 旧材料与固定历史 | ◐ | 宽容读回、只读记录及固定来源页面已接入；真实历史/恢复旅程待验，不能用当前草稿代替固定来源 |
| A14 会议准备与纪要同步 | ◐ | Skill 自带会议步骤与浏览器驱动；历史 Edge 脚本操作及 CLI 命令面证据不覆盖真实建会、通知与纪要全流程 |
| A15 批注快捷键 | ◐ | 空板负例有既有烟测；有材料状态、改绑和 macOS 物理键回退待人工真壳验证 |
| AJ01 完整会议与归档旅程 | ○ | 尚无真实服务、真实报告、真实发布和重启读回组成的完整运行证据 |

## 证据来源与限制

基线生产实现从 [PR #394](https://github.com/forcegravity1989/builder-workbench/pull/394) 及后续交付追溯；固定来源、启动与 Issue 读取的既有检视见 [PR #441](https://github.com/forcegravity1989/builder-workbench/pull/441)。这些历史证据只支持当时的用例与版本，不覆盖新报告流程或跨宿主模型行为。

PR #584 本轮按用户要求不运行本地 CI、不启动服务或真壳。报告生成与人工核对的实际模型行为、GitHub/CodeHub 图片可读性、安装失败与取消重试、跨宿主路径及重启读回由内部环境验证；结果回填原 PR，不在本文保存执行流水。
