---
name: week-planning
description: Use when 在 BW 计划屏协助用户制定、评审和归档版本计划，或对应 Orca 周期运行启动。验收已有版本使用 version-acceptance。
metadata:
  version: 0.3.0
---

# 版本计划

帮助 Builder 与 Leader 形成清楚、有依据的版本目标，并连接真实任务和归档。目标由人决定；不要根据不完整仓库信息先替人写完。

宿主下发原生项目、工作树与运行身份。先通过 `orca skills get week-planning` 核对版本匹配的产品技能；参考资料用同入口的 `--references` 和 `--reference <名称>` 按需读取。命令或权限不可用时保留讨论内容并报告真实错误。

## 执行流程

1. **让全程可见，先明确版本。** 开场展示“准备 → 目标 → 评审 → 拆解 → 归档”。本次运行尚未关联版本时，列出现有候选，让用户在会话确认或在界面选已有版本、明确新建；确认前不创建或修改计划。已有明确关联则恢复，不重复问。说明现有内容和所在步骤，用户可直接编辑右侧或在会话讨论；不要求重新填写已有信息。
2. **准备与讨论目标。** 核对项目入口和当前材料，再询问缺失的场外要求、约束或信息冲突；仓库是线索而非全部答案。需要帮人区分目标与任务时读 目标引导（`orca skills get week-planning --reference goal-guidance`）。形成风险、所述版本进展和 Top3 结果目标，不强制分类、报告、指标或点数。
3. **准备评审。** 有指标诉求时从共用目录选取并采集，缺定义/脚本先用 metrics-refresh（`orca skills get metrics-refresh`） 补齐，不编读数。与人核对交付和可判断依据；三段纪要按 模板（`orca skills get week-planning --reference minutes-template`） 从当前目标生成，修改目标原件，不再手填另一份纪要。
4. **连接真实工作。** 按已认可范围查已有 Issue，准备具体创建/更新内容，依会话授权执行并读回编号、正文和状态。右侧呈现真实关联；任务详情与编辑使用 Orca。先定结果再拆工作，不顺便改完成状态。
5. **归档与接续。** 用户要求归档时核对当前材料和待确认项，按项目门禁与授权提 PR，回显链接与实际状态；合入由人决定。新的周期运行开新会话，同次恢复继续原会话，标题沿 Orca。验收上版进入独立验收屏，不当作本版规划前置门槛。

## 需要时读取

- 版本材料（`orca skills get week-planning --reference version-records`）：保存、修订、归档或跨屏引用前读。
- 运行能力（`orca skills get week-planning --reference data-and-runtime`）：工具缺失、旧数据与并发冲突时读；使用宿主提供的真实入口。
- 指标（`orca skills get week-planning --reference metrics`）、Issue（`orca skills get week-planning --reference issue-state`）：涉及对应数据或写入时读，不复写协议。

保存失败保留输入，冲突先重读比较；缺数据保持未知。任务、归档和人的认可分开，不把文档存在、Issue 关闭或 PR 合入自动判为目标达成。
