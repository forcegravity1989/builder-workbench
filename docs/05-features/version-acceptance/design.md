# 版本验收实现设计

> 给实现与技术评审者动代码前读；本文管对象、候选来源、复用和异常设计。行为见 [spec](spec.md)，共享层见 [计划设计](../version-planning/design.md#共享边界)。设计变化时更新，落地后同步 06-module。
>
> 状态：已授权实施；详细设计未逐项细审，未决项须人工确认。定位 architecture §1 项目版本/交付核对，§2 事实、执行与壳。共享核心的实现范围见计划设计及 STATUS，其余接口不表示已有运行能力。

## 页面与复用

AcceptancePage 是 BW 业务页，复用原生项目/工作树/会话、Tasks 详情与正文编辑、Automations、现有文件打开和命令执行能力。右侧顶部用轻量准备摘要展示候选与包/报告/展示材料，下方使用共享目标卡和 Issue 状态区；不建通用发布控制台。

共享组件只提供承诺区及结果槽位，业务字段由本页拥有。旧 PlanResultsPane 可提取展示能力，但旧跨版本 results 流程不并行维护。TaskPort/CycleSessionPort/ArchivePort/VersionDocumentPort 与计划共用，MetricsPort 由指标线提供。

## 两个常驻工作树

本轮仅接本机 Git 项目，入口及材料服务均拒绝 SSH/远端运行时；WSL 路径尚未验证，不自动转为本机路径。材料 RPC/CLI 共用入口及其当前缺口见计划设计。只保存引用不表示已校验计划来源、候选或人的决定。

计划固定 bw/week-plan，验收固定 bw/week-acceptance，默认目录分别为 .bw/worktrees/week-plan 与 .bw/worktrees/week-acceptance。通过 Orca 项目/宿主和分支查真实工作区，不仅替换标签，不新增聊天日志或 BW 调度器。

验收树从项目指定基线创建，BW 自用基线是 bw-orca；每次新运行刷新远端并检查树的干净状态、前次归档与基线差异。已有脏改动/未归档提交不 reset、不搬树、不强推，恢复该次工作或呈现冲突。基线同步通过正常 Git 合并/项目流程，已有同分支其他路径提示真实路径，不擅自删除重建。

运行身份包含 projectId、hostId、workflow=acceptance 与 Orca runId；cycleId 为周期上下文，version 为另行核对的材料关联，不作为运行去重前提。恢复使用真实关联 ID，不用标题匹配。新周期 existing 工作区、reuseSession=false；上午/下午共用该运行，计划会话不能被验收恢复选中。

## 候选与材料

acceptance.json 在验收工作树保存，planRef 从指定基线固定提交读取；草案预验收显式带源树、修订及 draft 标识。共享写入核心按项目/流程映射允许写入的树和对象，验收不得修改 plan.data.json。

candidateRef 保存项目、完整 commit SHA、版本与来源；preparedArtifacts 保存类别（交付件/包/验证/showcase）、可打开位置、候选、执行入口/工作区、生成时刻及适用时的 hash。项目没有包要求时直接采用其约定交付。数据字段唯一参考是 [version-records](../../../standard/system-prompt/references/version-records.md)。

模型通过宿主下发的项目既有命令准备包和证据。源代码执行区须明确固定候选 SHA；若常驻验收树不适合作为干净源码区，复用原生工作树能力准备候选执行区，验收树仍只承载材料。只包装项目已有能力，不照搬 Rust 发布工具或另写打包器。记录实际执行路径、退出和产物，不因文件名有版本就认为匹配。

构建运行复用原生任务/进程状态关联 runId；恢复先查询仍在运行的任务和已生成产物，不盲目再启动。候选改变时将不匹配材料标陈旧；相应材料状态由事实推导，不自动撤销或代写人的判断。正式发布、tag、远端完成与 PR 合入仍按项目的人授权。

## 记录、报告与版本历史

记录 version、cycleId、planRef、candidateRef、preparedArtifacts、goalId 对应实际交付/readingRef/结论/依据/下一步、人的确认来源与修订。可保存只读承诺快照作为草案/离线证据，不能编辑为另一份计划。

采集值只来自脚本，归档保存采用的定义指纹、窗口或 observedAt、结果及来源；保留证据不是建立日采账本。Issue 快照附 provider/repo/number/state/readAt，不是可编辑任务正本。

验收纪要由对应修订确定性生成，预览/复制/归档采用同一函数。已合入记录以目标基线的 commit + 文档路径 + cycleId 为历史身份；总览读取摘要，能打开对应只读原文及来源。每周和补证归档都是可追溯修订，缓存可重建，不另建里程碑表或历史业务数据库。

准备状态、人的结论和归档灯分别推导；保存不是验收认可，候选包可用不是已发版。未达报告合入时归档可以完成而目标仍未达。

## 异常、迁移与验证

使用材料核心的 expectedRevision/原子写入/跨进程互斥；冲突保留输入。文件链接绑定可信材料根或明确外部来源，失效错误有恢复入口。跨树、跨项目返回核对宿主身份。

旧 results 按其明确说明的上一版本导入，不能按目录名误认当前验收；旧 confirmation 仅历史证据。新实现一次切换所有读写消费者，再退役旧三屏/CLI 路径。

TDD 覆盖跨树写入限制、计划/候选固定与变化、材料匹配、重复构建恢复、报告/灯色及历史索引。A01–A10/AJ01/AJ02 运行真实 Electron、项目命令、模型和独立读回。共享接口、候选适配及 VersionHistory 由协调窗口提供，本线负责验收业务与所需专项用例。
