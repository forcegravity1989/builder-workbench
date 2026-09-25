# 材料与运行能力

> 给计划/验收会话在实际读写、恢复或旧数据处理时读。本文只说明工具能力核对与迁移边界，目标流程在 Skill，业务协议在 [版本材料](../../../system-prompt/references/version-records.md)。运行接口变化时替换对应说明。

## 使用宿主提供的入口

核对项目根、工作区、版本、流程和实际工具路径。已有文件先读修订再改，不依靠宿主 cwd 推断项目。模型与右侧编辑器必须调用同一材料服务，以 expectedRevision 保存；冲突保留双方输入，不能用直接写文件绕开校验。

使用 `orca bw materials schema/list/read/save`，参数与修订约束以版本材料 reference 及命令 `--help` 为准。宿主未提供入口时，报告缺失、可以讨论并保留草稿建议，但不能编造命令或宣称已保存。自动化只创建/恢复 Orca 运行，不代替用户认可。

## 显式迁移旧材料

候选显示需迁移时，使用宿主明确的计划工作树、版本与 cycleId 调用 `orca bw materials migration-preview`。预览不写文件；展示旧目标、待核来源与 warnings，再根据人的明确迁移指令调用 `migrate --expected-revision <预览的 sourceRevision>`。旧文件在同版本目录以 `schema2-<原字节哈希>.json` 完整保留，之后仍可用 `migration-preview --source-revision <原修订>` 读回。冲突停止，不重试覆盖。

旧 results 只归入其 previous_version。先在验收流程选定并核对该版本的真实 planRef，再展示旧目标与现有 goalId 的对应；得到明确对应后通过普通验收 save 写无认可草稿。缺少真实计划、版本含糊或对应冲突时保留原件待核，不伪造 planRef。旧状态与手填读数只能写入带来源的说明，不能升级为采集证据。

旧 results 属于其明确指出的上版，不按当前目录名猜；旧确认保留历史身份，不自动升级为新计划或验收确认。迁移保持原件/提交来源，错误时停止该对象写入，不替换成空数据。

Skill 安装目录是工具与模板来源，项目 .bw 是业务材料；不在项目里复制日常 HTML 编辑器，不另起浏览器服务。普通项目缺产品资产时由宿主补分发，不能要求用户克隆 BW 源码。
