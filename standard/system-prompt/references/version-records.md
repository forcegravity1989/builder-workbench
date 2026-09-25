# 版本计划与验收材料契约

> 给维护版本材料的会话与实现者按需读取。本文定义对象、来源和写入边界，不复述讨论 SOP；SOP 在 week-planning / version-acceptance。契约变化时更新。
>
> 状态：schema3 材料核心、runtime RPC 和 CLI 已实现，旧页面/会话提示尚未切换。当前 schema2/旧 CLI 不具备以下全部能力；材料读写时必须已有明确版本，由宿主提供原生身份及可调用工具；启动会话不要求先有版本。

## 对象与工作区

| 对象 | 正本 | 边界 |
|---|---|---|
| 计划 | bw/week-plan 工作树的 .bw/planning/<version>/data.json | summary、稳定 goalId、承诺/可选交付与验收说明、metricRef/目标、任务引用 |
| 验收 | bw/week-acceptance 工作树的同目录 acceptance.json | 固定 planRef、候选、材料、readingRef、人的结论与下一步；不改计划 |
| 指标 | 项目配置基线中的 .bw/metrics.toml 及真实采集源 | 两流程引用同一配置修订；不以常驻树旧文件当最新配置 |
| Issue/会话/PR | 原生 provider / Orca | 材料只存引用，不另建正文、聊天或状态正本 |
| 纪要/报告 | 从明确材料修订派生 | 无第二份手填会议正文 |

两个固定分支分别由原生项目/宿主/worktree 身份定位；物理目录由 Orca 原生创建和登记，不硬编码 .bw/worktrees 下的路径。冲突目录不得自动搬移/删除。同步基线前检查未归档修改，不 reset 脏树；跨树读取用固定提交，不把另一树的工作中草稿当正式材料。

运行身份由项目、宿主、流程与原生 runId 定位；cycleId 是可区分多周/重复运行的稳定上下文，版本是明确后附加的材料关联。计划运行可先有会话、后由人选已有版本或明确新建，未选择时不新建或修改计划；不能用日期、mtime 或未发布状态代定版本。新周期新会话，选版本不新开运行，同次恢复沿用真实关联，不能按标题判断身份。有关联时显示版本在前周次在后。工作文件代表当前编辑修订，历史通过下述不可变归档恢复。

## 来源与历史

planRef 的共同字段为 kind/version/cycleId/revision。kind=committed 时另有 sourceCommit；kind=draft 时另有 sourceWorktreeId/sourceHostId。项目身份由请求的原生项目上下文约束，材料路径从 version 推导为 .bw/planning/<version>/data.json，revision 本身是 sha256 字节摘要，不再重复写 project/path/hash。正式验收须固定项目指定基线已合入的计划，草案预验收明确标示；来源解析与核验由验收接线实现，保存 schema 本身不能证明来源。

指标 ref 保存 name/definitionHash/configurationCommit；readingEvidence 保存 ref/value/unit/source/collectedAt/collectorRevision，observation 区分 instant 的 observedAt 与 window 的 start/end/granularity/timezone。不另建每日台账，采集真实性和可比较性由指标服务及消费方核验。

taskSnapshot 保存验收当时逐项读取的 Issue 状态。每项 ready 含 reference/source/iid/title/state/url/readAt；unavailable 含 reference/readAt/error，可保留已解析 source。source 复用原生 TaskSourceContext，执行宿主 hostId 与 providerIdentity 的平台 host/project 分开，不存页面返回、滚动或草稿状态。缺少 taskSnapshot 表示尚未记录，空数组才表示当时没有关联任务；历史报告展示快照及读取时间，不能拿实时状态替换历史事实。快照不是 Issue 状态正本，也不授权自动完成任务。

candidateRef 仅保存 repository/version/commit，commit 是完整 SHA。preparedArtifacts 含 artifactId/kind/location/candidateRef/generatedAt，可选 command/executionRoot/checksum；执行根记录在该材料上，不加到 candidateRef。验收树只承载材料，出包从指定源码候选的执行工作区进行。候选变化使不匹配证据待核，不自动沿用成功。

每次归档生成带 cycleId 和修订的记录，记录固定计划/验收来源、派生摘要、PR 及证据来源。总览 VersionHistoryPort 从项目基线 Git 历史读取该元数据和材料：列表身份为项目+流程+版本+cycleId+归档提交，文件路径相同也不把多周合成一个最新值。同周补证形成新修订；列表可聚合同一周期最新修订，但保留旧修订入口。未合入草稿单列，缺失/含糊历史标待核，不能凭目录和今天的状态推造周次或认可。

archiveCommit 只能在实际合入后由 provider/Git 解析，不能把尚未知的提交写进自身。提交内容保存 cycleId、sourceRevision 等元数据，PR 关联及合入提交由真实来源补全。新归档记录的发现与提交定位由共享层统一实现，两个特性提供纯派生摘要，不各做一套 Git 扫描。

## 写入与人的决定

连接和执行沿用 Orca；宿主提供 repoId/worktreeId/hostId，分别绑定 bw/week-plan、bw/week-acceptance，页面还使用原生 runtimeOwnerEnvironmentId 选择配对宿主。不能由模型传文件根替代原生身份，也不把 SSH 路径交给客户端本机文件 API。

实际工具为 `orca bw materials list/read/save`，共用 `--repo-id <id> --worktree-id <id> --workflow plan|acceptance`，host-id 在所选 runtime 内解释，默认 local；SSH 工作树使用宿主提供的 ssh: 身份。list 不需要版本，只有列举作用；read 需要 `--version <已确认版本>`，返回 document/revision 或 null。save 再传 `--input <schema3 JSON 草稿文件>` 或 `--input-stdin`（二选一）；SSH 会话通过标准输入传 JSON，由 Orca 原生 CLI bridge 转发，不把远端草稿路径交给客户端读文件，更新必须使用刚读到的 `--expected-revision <revision>`；明确新建用 `--create`，二者互斥。普通项目通过 `orca bw materials schema --workflow plan|acceptance --json` 读取随 CLI 打包的结构，无需 BW 源码或运行中的应用；跨字段约束仍由 save 校验。维护正本为 src/shared/workbench/version-material.ts，不能把 schema2 文件直接提交；`--json` 用于机器读取。

冲突命令以非零状态返回 revision-conflict 及 currentRevision，原材料和输入草稿保留；重读并合并后重试，不循环覆盖。页面走同一 runtime RPC。文件保存不自行采集指标或验证人的身份，存入 reading/decision 字段不能据此点绿灯，业务消费方必须核对真实来源。

先读 revision，再走同一材料服务 save(expectedRevision)；校验受信任工作树和流程白名单、路径、跨进程互斥、原子替换。不同分支不是一个写入路径。冲突保留双方输入并重读合并；不直接覆盖文件绕过服务。

保存、评审、归档、目标达成和正式发布分别成立。人的决定绑定对象/修订/来源/时间，模型不代签。decision.materialRevision 是 planRef、candidateRef 与本目标证据（deliveries、readings、note、nextStep，以及本目标 deliveries.location 引用的 preparedArtifacts）的确定性 SHA-256 投影，不含 decision 自身。只改一个目标证据，仅该目标需重新确认；planRef 或 candidateRef 改变，保留已有结论但全部标记待重新确认。未被目标引用的准备材料不计入该目标证据。摘要只检测证据变化，不证明签署人的身份。归档按钮只准备未发送请求，后续执行遵从授权；不自动合入、完成 Issue 或发布。旧认可和归档不可直接覆盖新修订。

schema2 一次显式迁移保留原件/提交来源；旧 results 按实际版本导入验收草稿，旧 confirmation 仅作历史依据。不能无损解释的对象保留待核。UI/CLI/提示/模板同时切换，不永久双写或失败静默回退旧流程。
