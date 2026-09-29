# 版本计划与验收材料契约

> 给维护版本材料的会话与实现者按需读取。本文定义对象、来源和写入边界，不复述讨论 SOP；SOP 在 week-planning / version-acceptance。契约变化时更新。
>
> 状态：schema3 材料核心、runtime RPC、CLI 与计划/验收页面已接入；schema2 需显式迁移。材料读写时必须已有明确版本，由宿主提供原生身份及可调用工具；启动会话不要求先有版本。

## 对象与工作区

| 对象 | 正本 | 边界 |
|---|---|---|
| 计划 | bw/week-plan 工作树的 .bw/planning/<version>/data.json | summary、稳定 goalId、承诺/可选交付与验收说明、metricRef/目标、任务引用 |
| 验收 | bw/week-acceptance 工作树的同目录 acceptance.json | 固定 planRef、候选、材料、readingRef、人的结论与下一步；不改计划 |
| 指标 | 项目最新已合入配置中的 .bw/metrics.toml 及真实历史采集源 | 新采集固定本次采用的定义/脚本修订；旧 baseline 和归档证据保留，不以常驻树旧文件或旧引用锁住目录 |
| Issue/会话/PR | 原生 provider / Orca | 材料只存引用，不另建正文、聊天或状态正本 |
| 纪要/报告 | 从明确材料修订派生 | 无第二份手填会议正文 |

两个固定分支分别由原生项目/宿主/worktree 身份定位；物理目录由 Orca 原生创建和登记，不硬编码 .bw/worktrees 下的路径。冲突目录不得自动搬移/删除。同步基线前检查未归档修改，不 reset 脏树；跨树读取用固定提交，不把另一树的工作中草稿当正式材料。

运行身份由项目、宿主、流程与原生会话或 runId 定位。会话可先启动，后由人选已有版本或明确新建；未选择时不新建或修改计划，不能用日期、mtime 或未发布状态代定版本。自动化首次登记默认 reuseSession=false，之后尊重用户保存的配置；同次恢复沿用原生身份，不能按标题判断身份。命名沿用 Orca 默认规则；需要人为命名时，版本在前、周次在后。工作文件代表当前编辑修订，历史通过下述不可变归档恢复。

cycleId 标识材料轮次，不是自然周、原生会话或自动化 runId。同一版本的计划、验收各自只有一轮活动材料，新周新会话可继续关联该轮；不要因编辑或换会话改 cycleId。该流程归档后才可明确开下一轮，未达结果也能如实归档；不自动迁移或承诺遗留目标。历史按实际归档留存，不补造每周快照。

## 来源与历史

计划 `summary.progressSource` 是可选的已归档验收引用，只包含 version/cycleId/sourceCommit/revision，流程固定为 acceptance，项目与宿主来自当前原生上下文；没有该字段的 schema3 材料仍有效。它表示明确选择的进展依据，不表示版本号之间有顺序关系。页面读取固定提交并核对材料修订及其 planRef；保存格式通过不能代替归档或内容核验。选择或更换引用不自动覆盖 summary.progress，来源不可用时保留原输入，不改读最新记录。

planRef 的共同字段为 kind/version/cycleId/revision。kind=committed 时另有 sourceCommit；kind=draft 时另有 sourceWorktreeId/sourceHostId。项目身份由请求的原生项目上下文约束，材料路径从 version 推导为 .bw/planning/<version>/data.json，revision 本身是 sha256 字节摘要，不再重复写 project/path/hash。正式验收须固定项目指定基线已合入的计划，草案预验收明确标示；来源解析与核验由验收接线实现，保存 schema 本身不能证明来源。

指标 ref 保存 name/definitionHash/configurationCommit；readingEvidence 保存 ref/value/unit/source/collectedAt/collectorRevision。新业务采集只使用日/周历史窗口，observation 记录 start/end/granularity/timezone；既有 instant/observedAt 只保留为历史证据的解释，不恢复当前值采集。计划 baseline 不被新采集覆盖，验收可以选择最新目录的新指标补充 readings；新旧配置不同不阻止采集。证据详情显示来源、采集时间、配置提交与脚本修订，定义指纹保留在材料中；由人追溯核对可比性，不自动改原承诺或判断达成。不另建每日台账，来源真实性由指标服务及消费方核验。

taskSnapshot 保存验收当时逐项读取的 Issue 状态。每项 ready 含 reference/source/iid/title/state/url/readAt；unavailable 含 reference/readAt/error，可保留已解析 source。source 复用原生 TaskSourceContext，执行宿主 hostId 与 providerIdentity 的平台 host/project 分开，不存页面返回、滚动或草稿状态。缺少 taskSnapshot 表示尚未记录，空数组才表示当时没有关联任务；历史报告展示快照及读取时间，不能拿实时状态替换历史事实。快照不是 Issue 状态正本，也不授权自动完成任务。

candidateRef 仅保存 repository/version/commit，commit 是完整 SHA。preparedArtifacts 含 artifactId/kind/location/candidateRef/generatedAt，可选 command/executionRoot/checksum；执行根记录在该材料上，不加到 candidateRef。验收树只承载材料，出包从指定源码候选的执行工作区进行。候选变化使不匹配证据待核，不自动沿用成功。

每次归档生成带 cycleId 和修订的记录，记录固定计划/验收来源、派生摘要、PR 及证据来源。总览 VersionHistoryPort 从项目基线 Git 历史读取该元数据和材料：列表身份为项目+流程+版本+cycleId+归档提交，文件路径相同也不把多周合成一个最新值。同周补证形成新修订；列表可聚合同一周期最新修订，但保留旧修订入口。未合入草稿单列，缺失/含糊历史标待核，不能凭目录和今天的状态推造周次或认可。

archiveCommit 只能在实际合入后由 provider/Git 解析，不能把尚未知的提交写进自身。提交内容保存 cycleId、sourceRevision 等元数据，PR 关联及合入提交由真实来源补全。新归档记录的发现与提交定位由共享层统一实现，两个特性提供纯派生摘要，不各做一套 Git 扫描。

preparationReview 是可选的人工材料备齐核对记录，包含 source、recordedAt、materialRevision；修订覆盖版本、轮次、固定计划、候选、准备材料和各目标交付件。它是历史保留字段：验收屏已移除“材料备齐”勾选，准备灯改由各目标已记录的实际交付证据推导，不再由此字段驱动。字段仍受人工守卫保护（模型/CLI 不得代人写入或篡改），旧材料读回时保留原值，不因日历跨周作废，也不证明命令执行或目标达成。

## 写入与人的决定

连接和执行沿用 Orca；宿主提供 repoId/worktreeId/hostId，分别绑定 bw/week-plan、bw/week-acceptance，页面还使用原生 runtimeOwnerEnvironmentId 选择配对宿主。不能由模型传文件根替代原生身份，也不把 SSH 路径交给客户端本机文件 API。

实际工具为 `orca bw materials list/read/save`，共用 `--repo-id <id> --worktree-id <id> --workflow plan|acceptance`，host-id 在所选 runtime 内解释，默认 local；SSH 工作树使用宿主提供的 ssh: 身份。list 不需要版本，只有列举作用；read 需要 `--version <已确认版本>`，返回 document/revision 或 null。save 再传 `--input <schema3 JSON 草稿文件>` 或 `--input-stdin`（二选一）；SSH 会话通过标准输入传 JSON，由 Orca 原生 CLI bridge 转发，不把远端草稿路径交给客户端读文件，更新必须使用刚读到的 `--expected-revision <revision>`；明确新建用 `--create`，二者互斥。普通项目通过 `orca bw materials schema --workflow plan|acceptance --json` 读取随 CLI 打包的结构，无需 BW 源码或运行中的应用；跨字段约束仍由 save 校验。维护正本为 src/shared/workbench/version-material.ts，不能把 schema2 文件直接提交；`--json` 用于机器读取。

冲突命令以非零状态返回 revision-conflict 及 currentRevision，原材料和输入草稿保留；重读并合并后重试，不循环覆盖。页面走同一 runtime RPC。文件保存不自行采集指标或验证人的身份，存入 reading/decision 字段不能据此点绿灯，业务消费方必须核对真实来源。

先读 revision，再走同一材料服务 save(expectedRevision)；校验受信任工作树和流程白名单、路径、跨进程互斥、原子替换。不同分支不是一个写入路径。冲突保留双方输入并重读合并；不直接覆盖文件绕过服务。

保存、评审、归档、目标达成和正式发布分别成立。人的决定绑定对象/修订/来源/时间，模型不代签。decision.materialRevision 是版本、验收周期、planRef、candidateRef、全局候选交付包（preparedArtifacts 中 kind=package）、固定计划中本目标的承诺与本目标采用证据的确定性 SHA-256 投影，不含 decision 自身。证据包括 deliveries/readings/note/nextStep、本目标 deliveries.location 引用的其他准备材料，以及固定计划关联到该目标的 Issue 快照。只改一个目标证据，仅该目标需重新确认；planRef、candidateRef 或全局候选交付包改变，保留已有结论但全部标记待重新确认，即使源码提交相同也要核对包的真实来源。未被目标引用的其他准备材料不计入该目标证据。摘要只检测证据变化，不证明签署人的身份，Issue 关闭数不自动决定目标达成。归档按钮只准备未发送请求，后续执行遵从授权；不自动合入、完成 Issue 或发布。旧认可和归档不可直接覆盖新修订。

Issue 关联以固定 plan.tasks 的完整任务身份与 goalId 为准，不能仅凭快照自己声明的 goalId。快照指纹按任务身份稳定排序，保留来源、标题、状态、链接或失败事实，排除仅 readAt 变化；同事实刷新或列表重排不触发重新确认。未关联目标的 Issue 仍进入报告，不影响单目标结论；未记录与已记录空集分别呈现。

schema2 一次显式迁移保留原件/提交来源；旧 results 按实际版本导入验收草稿，旧 confirmation 仅作历史依据。不能无损解释的对象保留待核。UI/CLI/提示/模板同时切换，不永久双写或失败静默回退旧流程。

