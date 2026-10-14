---
name: week-planning
description: Use when 在 BW 计划屏协助用户制定、评审和归档版本计划，或对应 Orca 周期运行启动。验收已有版本使用 version-acceptance。
metadata:
  version: 0.4.0
---

# 版本计划

帮助 Builder 与 Leader 形成清楚、有依据的版本目标，并连接真实任务和归档。目标由人决定；不要根据不完整仓库信息先替人写完。

宿主下发原生项目、工作树与运行身份。先通过 `orca skills get week-planning` 核对版本匹配的产品技能；参考资料用同入口的 `--references` 和 `--reference <名称>` 按需读取。命令或权限不可用时保留讨论内容并报告真实错误。

## 阶段状态（与计划屏的灯共用）

计划材料的 `workflow.stage` 记录**最近完成的阶段**，计划屏旅程灯直接按它点亮：到 stage 及其之前为绿，之后为灰，没有其他状态。每完成一个阶段就用 `ORCA bw materials save` 更新，让屏上的灯与会话里的进度始终一致：

| 阶段 | stage 值 | 何时写入 |
|---|---|---|
| 准备 | `preparation` | 版本明确、现状与上版交付核对完成 |
| 目标 | `goals` | 版本目标成形并写入 goals |
| 评审 | `review` | 用户在会话中明确确认评审通过后 |
| 拆解 | `breakdown` | Issue 创建/更新完成并写入 tasks 引用 |
| 归档 | `archive` | 提交归档 PR 之前；PR 开出后把 provider/repository/number 写入 `workflow.archivePr` |

恢复会话时先校准：按材料实际进度把 stage 补写到真实到达的阶段，再继续。评审必须由用户明确表达确认才写 `review`，不因改过目标就代人记录。内容实质调整使后续阶段失效时，把 stage 回退到实际阶段（如评审后大改目标则回到 `goals`）。PR 是否合入由界面按 `archivePr` 读 provider 显示，合入依人的授权，stage 不代表已合入。

## 执行流程

1. **让全程可见，先明确版本。** 开口先讲旅程：准备 → 目标 → 评审 → 拆解 → 归档，并按校准后的 `workflow.stage` 说明现在在哪一步。本次运行尚未关联版本时，列出现有候选，让用户在界面选已有版本，或在会话确认沿用或新建；确认前不创建或修改计划。已有明确关联（包括入口附带的当前选版）则恢复，不重复问。用户可直接编辑右侧并自动保存，或在会话讨论；不要求重新填写已有信息。
2. **准备与讨论目标。** 按 [目标引导](references/goal-guidance.md) 把目标说成能验收的结果：谁走通哪段旅程、交什么、怎样算完成。目标要能联到特性，特性要有用户旅程。不让用户先选类别，不按第几周套。再核对上版实际交付和本版约束；来源不明不编上版成绩，已有进展先核对再修改。上版验收纪要：从已归档验收记录中找到本版对应的上一版，与用户核对后把其引用写入 `summary.progressSource`，界面会直接回显派生纪要；找不到记录才与用户讨论回填 `summary.progress` 文本，不按版本号、日期或最新一条猜。`summary.risks` 风险由用户自己填写，不代写不代改（模型通道写该字段会被拒绝）。仓库分支若落后，或已有未归档的材料提交，再单独问要不要先更新，不自行合并。形成风险和少数几条结果目标，不强制分类、报告、指标或点数。准备完成写 `stage=preparation`，目标成形写 `stage=goals`。
3. **与 PL 评审并修改目标。** 有指标诉求时从共用目录选取并采集，缺定义/脚本先用 [metrics-refresh](../metrics-refresh/SKILL.md) 补齐，不编读数。Builder 制定目标后与 PL 开会，直接在目标卡修改目标、交付约定和可判断依据；不要求先生成或复制纪要才能评审。用户明确确认评审通过后写 `stage=review`。评审中或评审后调整了目标，同步核对已建关联 Issue：标题标记 `【<版本>|<目标>】` 与 `bw:plan:<版本>` 标签跟着目标变化更新，不留旧标记。
4. **连接真实工作。** 按 [Issue 格式](../../system-prompt/references/issue-state.md) 查重并创建或更新任务。首次提单只需问题描述；用户确认版本与目标后，再在同一条 Issue 补处理范围、验收条件，按 `【<版本>|<目标>】问题描述` 整理标题并精确增加 `bw:plan:<版本>` 标签。将 provider/repository/number/goalId 写入计划材料 tasks；无确认的版本或目标不猜。依会话授权执行并读回编号、正文、状态和任务引用。右侧呈现真实关联；任务详情与编辑使用 Orca。先定结果再拆工作，不顺便改完成状态。拆解完成写 `stage=breakdown`。
5. **归档与接续。** 界面不再有归档按钮，用户在会话中直接要求归档：核对当前材料和待确认项，写 `stage=archive`；在固定 bw/week-plan 工作树内提交材料并推送远端 bw/week-plan，创建由 bw/week-plan 到主分支的 PR/MR，按项目门禁与授权执行，不另建工作树或分支。PR 开出后把 provider/repository/number 写入 `workflow.archivePr`，回显链接与实际状态；合入依人的授权。PR 开出后再改材料时，核对 PR 是否需要同步更新。归档后继续修改同一份计划并保留 cycleId，材料按新修订再次提交。自动化首次登记默认不复用会话，后续按用户保存的配置运行；同次恢复与标题沿 Orca。实际开展上版验收进入独立验收屏，不当作本版规划前置门槛。

Builder 在评审后填写会议纪要时，可预览并复制按 [模板](assets/minutes-template.md) 从当前目标生成的三段内容。通常在任务拆解和 PR 合入后整理，也允许在拆解前复制；不以任务或 PR 状态限制此动作，不把打开或复制当作评审通过，不另存一份可编辑纪要正本。

## 需要时读取

- [版本材料](../../system-prompt/references/version-records.md)：保存、修订、归档或跨屏引用前读，含 workflow 契约与文本写入要求。
- [运行能力](references/data-and-runtime.md)：工具缺失、旧数据与并发冲突时读；使用宿主提供的真实入口。
- [指标](../../system-prompt/references/metrics.md)、[Issue](../../system-prompt/references/issue-state.md)：涉及对应数据或写入时读，不复写协议。

保存失败保留输入，冲突先重读比较；缺数据保持未知。任务、归档和人的认可分开，不把文档存在、Issue 关闭、PR 合入或 stage 记录自动判为目标达成。
