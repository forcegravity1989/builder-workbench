# 版本计划与验收材料契约

> 给维护版本材料的会话与实现者按需读取。本文定义对象、来源和写入边界，不复述讨论 SOP；SOP 在 week-planning / version-acceptance。契约变化时更新。
>
> 状态：schema3 材料核心、runtime RPC、CLI 与计划/验收页面已接入；schema2 需显式迁移。材料读写时必须已有明确版本，由宿主提供原生身份及可调用工具；启动会话不要求先有版本。

## 对象与工作区

| 对象          | 正本                                                     | 边界                                                                                            |
| ------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 计划          | bw/week-plan 工作树的 .bw/planning/<version>/data.json   | summary、稳定 goalId、承诺/可选交付与验收说明、metricRef/目标、任务引用、workflow 阶段            |
| 验收          | bw/week-acceptance 工作树的同目录 acceptance.json        | 固定 planRef、候选、材料与链接、readingRef、人工进展、Issue 备注/标记、会议指导、人的结论与下一步、workflow 阶段；不改计划 |
| 指标          | 项目最新已合入配置中的 .bw/metrics.toml 及真实历史采集源 | 新采集固定本次采用的定义/脚本修订；旧 baseline 和归档证据保留，不以常驻树旧文件或旧引用锁住目录 |
| Issue/会话/PR | 原生 provider / Orca                                     | 材料只存引用，不另建正文、聊天或状态正本                                                        |
| 纪要/报告     | 从明确材料修订派生                                       | 无第二份手填会议正文                                                                            |

两个固定分支分别由原生项目/宿主/worktree 身份定位；物理目录由 Orca 原生创建和登记，不硬编码 .bw/worktrees 下的路径。冲突目录不得自动搬移/删除。同步基线前检查未归档修改，不 reset 脏树；跨树读取用固定提交，不把另一树的工作中草稿当正式材料。

运行身份由项目、宿主、流程与原生会话或 runId 定位。会话可先启动，后由人选已有版本或明确新建；未选择时不新建或修改计划，不能用日期、mtime 或未发布状态代定版本。自动化首次登记默认 reuseSession=false，之后尊重用户保存的配置；同次恢复沿用原生身份，不能按标题判断身份。命名沿用 Orca 默认规则；需要人为命名时，版本在前、周次在后。工作文件代表当前编辑修订，历史通过下述不可变归档恢复。

cycleId 标识同一版本同一流程的材料身份，不是自然周、验收轮次、原生会话或自动化 runId；编辑、跨周、换会话和归档后补证都保留 cycleId。同一版本的计划、验收各自保留一份当前材料。验收的周次与进展/最终验收轮次由 results[].rounds[] 表达，页面按材料选择当前周或历史周，不按日期自动建立轮次；跨周在会话内核对并执行封存承接。未达也能如实归档，不自动承诺遗留目标。

## 来源与历史

计划 `summary.progressSource` 是可选的已归档验收引用，只包含 version/cycleId/sourceCommit/revision，流程固定为 acceptance，项目与宿主来自当前原生上下文；没有该字段的 schema3 材料仍有效。它表示明确选择的进展依据，不表示版本号之间有顺序关系。页面读取固定提交并核对材料修订及其 planRef；保存格式通过不能代替归档或内容核验。选择或更换引用不自动覆盖 summary.progress，来源不可用时保留原输入，不改读最新记录。

planRef 的共同字段为 kind/version/cycleId/revision。kind=committed 时另有 sourceCommit；kind=draft 时另有 sourceWorktreeId/sourceHostId。项目身份由请求的原生项目上下文约束，材料路径从 version 推导为 .bw/planning/<version>/data.json，固定提交引用的 revision 保持原始字节 SHA-256；当前工作材料读写的 revision 统一 CRLF 为 LF 后计算（其余内容仍参与比较），归档核对忽略这一换行差异，不再重复写 project/path/hash。正式验收须固定项目指定基线已合入的计划，草案预验收明确标示；来源解析与核验由验收接线实现，保存 schema 本身不能证明来源。

指标 ref 保存 name/definitionHash/configurationCommit；readingEvidence 保存 ref/value/unit/source/collectedAt/collectorRevision。新业务采集只使用日/周历史窗口，observation 记录 start/end/granularity/timezone；既有 instant/observedAt 只保留为历史证据的解释，不恢复当前值采集。计划 baseline 不被新采集覆盖，验收按原指标承诺或已保存 readings 显示采集行；用户明确需要额外指标时，可在会话中按最新目录补充 readings；新旧配置不同不阻止采集。证据详情显示来源、采集时间、配置提交与脚本修订，定义指纹保留在材料中；由人追溯核对可比性，不自动改原承诺或判断达成。不另建每日台账，来源真实性由指标服务及消费方核验。

taskSnapshot 保存验收当时逐项读取的 Issue 状态。每项 ready 含 reference/source/iid/title/state/url/readAt；unavailable 含 reference/readAt/error，可保留已解析 source。source 复用原生 TaskSourceContext，执行宿主 hostId 与 providerIdentity 的平台 host/project 分开，不存页面返回、滚动或草稿状态。缺少 taskSnapshot 表示尚未记录，空数组才表示当时没有关联任务；历史报告展示快照及读取时间，不能拿实时状态替换历史事实。快照不是 Issue 状态正本，也不授权自动完成任务。

验收 `results[]` 的 `progress`、`materials`、`issueNotes`、`issueMarks`、`meetingDirectives` 均为 schema3 可选增量字段；旧材料缺字段时分别按无进展补记、无链接、无备注/标记、无会议指导读取，不迁移或改写存量文件。`progress` 是目标级人工进展，`materials` 保存 label/url，`issueNotes` 和 `issueMarks` 以完整任务身份关联人工备注及 carry/risk 标记。任务的原生状态仍从 provider 读取，标记不代替任务状态。

`meetingDirectives` 条目保存 id/text/tag、可选 goalId、status/source/sourceRef/confirmedAt。tag 仅为 `resolved-this-acceptance`、`next-week-plan`、`record-remaining`，是处置方向，不是目标达成或 Issue 完成。模型只能新增 `status=pending` 且无 confirmedAt 的条目：转写总结使用 `source=transcript-summary` 和可回溯的会议/录制/议题 sourceRef；Builder 在会话补充的素材经整理后使用 `source=manual` 与 `sourceRef=conversation:<实际会话或消息引用>`，后缀必须非空、来自真实消息，不可编造或只写前缀。人工提供并由 AI 整理的内容不冒充转写；人只需核对并确认，无需重复抄录。既有手工条目仍可使用 manual 来源。人确认后才写 confirmed 与 confirmedAt；模型不得修改既有条目的文字/来源或任何已确认内容。未确认指导不能当已采纳的计划承诺。

`results[].rounds[]` 是可选增量字段，各目标共用同一组 id/week/kind（progress 或 final）及封存来源，最多一个未关闭轮；不一致时提示核对，不能以目标顺序或机器日期推断。无 rounds 的旧材料按单个隐式当前轮读取，不自动迁移；需要首次登记或跨周时由会话核对周次。每轮 snapshot 保存本目标的 goals（goalId/decision/progress/可选 next）、issueMarks、issueNotes 摘要。可选 sourceCommit/sourceRevision 必须成对，且只属于带 closedAt 的已关闭轮；有来源时按固定 Git acceptance.json 与其固定 planRef 读完整历史页，无来源的旧轮只展示实际已有摘要，不拿当前读数、指导或 Issue 状态补历史。

跨周必须在刷新指标、Issue、候选或指导之前完成：先把 planRef 固定到可读的已提交计划（正式验收仍要求已合入）；在固定验收树提交当前已保存的 acceptance.json，保留当前材料全部字段，取得可达提交 SHA，以及 `git show <SHA>:.bw/planning/<version>/acceptance.json` 原始输出字节的 SHA-256，写成 `sha256:<hex>`。不能用 Git blob SHA，也不能直接把换行归一化后的 read.revision 当 sourceRevision。随后以刚读到的 expectedRevision 在一次 save 中完成：旧轮保持 id/week/kind，补 closedAt/sourceCommit/sourceRevision，snapshot 按封存前的人填值生成；各目标新增同一新轮 id/week/kind，无 closedAt 或来源，snapshot 的 decision 为 pending；移除当前 results[].decision 和旧 workflow（含阶段与 archivePr），其余材料原样保留。旧材料无显式轮时，同一次保存可增加已核对身份的旧 closed 轮与新 open 轮。若旧材料已有 rounds 且全部关闭，保持所有旧 closed 轮原样（不补造缺失来源），先提交当前完整材料，再只追加统一的新 open 轮，snapshot 承接当前人填进展、备注和标记且 decision 为 pending；同一次 save 删除当前 decision/workflow，其余材料精确承接。此时服务从固定验收树 HEAD 读取完整 acceptance.json 并核对当前持久材料及可读的 committed planRef，不新增材料字段；旧轮摘要仍只展示原有信息，完整旧材料可按 Git 修订读回。两种承接都要求 Git 文档与当前持久材料一致及固定计划可读；失败不能单独清结论或改历史。新轮无已完成阶段，准备完成才写 preparation，再按当前周刷新最新指标。

candidateRef 仅保存 repository/version/commit，commit 是完整 SHA。preparedArtifacts 含 artifactId/kind/location/candidateRef/generatedAt，可选 command/executionRoot/checksum；执行根记录在该材料上，不加到 candidateRef。验收树只承载材料，出包从指定源码候选的执行工作区进行。候选变化使不匹配证据待核，不自动沿用成功。

总览从项目主干基线（主检出）的版本目录读取材料，一个版本只显示一份当前计划及验收，不扫描旧提交重新铺出旧轮次。版本材料索引按 version/workflow/cycleId 各取最新一条；验收历史周则按 rounds 的固定 sourceCommit/sourceRevision 读取当时完整材料，两者不是同一种列表。读取固定来源时核对版本、cycleId 与修订；未合入草稿在其工作区读取，损坏的当前文件如实提示。选中验收版本后页面初始化并保存缺失的空白验收，已有材料直接继续，不按日期造轮次。新材料与归档后补证均自动保存；历史只读，当前编辑不覆盖旧周。

workflow 是模型写入材料的 SOP 进度节：`stage` 记录最近完成的阶段（计划 preparation/goals/review/breakdown/archive；验收 preparation/showcase/archive），`updatedAt` 记录写入时间，`archivePr`（provider/repository/number）在归档 PR 开出后补上。两屏旅程灯只做序号比较：灯位不超过 stage 即绿，否则灰，没有其他推导。stage 是进度信号不是完成权威：不代表目标达成、不代替人工结论、不代表 PR 已合入；PR 合入状态由界面按 archivePr 向 provider 薄读取显示，读不到保持未知。会话恢复时先把 stage 校准到实际进度；内容实质调整使后续阶段失效时回退。界面不提供修改 stage 的入口，它只经材料保存写入。归档提交固定落在该流程的固定分支（计划 bw/week-plan、验收 bw/week-acceptance）上，PR/MR 由固定分支开向主分支，不从其他分支或新建工作树归档。

preparationReview 是历史保留的人工材料备齐核对记录，包含 source、recordedAt、materialRevision。验收屏已移除“材料备齐”勾选，旅程灯只读 workflow.stage，不再由证据完备性或该字段推导。字段仍受人工守卫保护（模型/CLI 不得代人写入或篡改），旧材料读回时保留原值，不因日历跨周作废，也不证明命令执行或目标达成。

## 写入与人的决定

连接和执行沿用 Orca；宿主提供 repoId/worktreeId/hostId，分别绑定 bw/week-plan、bw/week-acceptance，页面还使用原生 runtimeOwnerEnvironmentId 选择配对宿主。不能由模型传文件根替代原生身份，也不把 SSH 路径交给客户端本机文件 API。

实际工具为 `orca bw materials list/read/save`，共用 `--repo-id <id> --worktree-id <id> --workflow plan|acceptance`，host-id 在所选 runtime 内解释，默认 local；SSH 工作树使用宿主提供的 ssh: 身份。list 不需要版本，只有列举作用；read 需要 `--version <已确认版本>`，返回 document/revision 或 null。save 再传 `--input <schema3 JSON 草稿文件>` 或 `--input-stdin`（二选一）；SSH 会话通过标准输入传 JSON，由 Orca 原生 CLI bridge 转发，不把远端草稿路径交给客户端读文件，更新必须使用刚读到的 `--expected-revision <revision>`；明确新建用 `--create`，二者互斥。普通项目通过 `orca bw materials schema --workflow plan|acceptance --json` 读取随 CLI 打包的结构，无需 BW 源码或运行中的应用；跨字段约束仍由 save 校验。维护正本为 src/shared/workbench/version-material.ts，不能把 schema2 文件直接提交；`--json` 用于机器读取。

冲突命令以非零状态返回 revision-conflict 及 currentRevision，原材料和输入草稿保留；重读并合并后重试，不循环覆盖。页面走同一 runtime RPC，直接编辑自动保存；“更新代码”先把本屏工作树快进到主干最新、再重读宿主材料和版本候选并保留未保存输入，快进不了时保持原样并提示交会话处理、材料仍照常重读；指标更新由“刷新指标”显式触发。文件保存不自行采集指标或验证人的身份，存入 reading/decision 字段不能据此点绿灯，业务消费方必须核对真实来源。人工字段守卫保护计划 summary.risks，以及验收 preparationReview、results[].decision/deliveries/progress/note/nextStep/issueNotes/issueMarks、既有指导的文字与来源、已确认指导的全部内容和确认时间。模型/CLI 只能原样往返这些人工值；新增非空值、修改或删除均会被拒绝，不能用直接编辑文件绕过。待确认 AI 指导按上文规则提出，确认、删除与直接人工补记在界面完成；会话人工素材仅按上文规则新增待确认指导。封存承接是唯一允许同时清除当前 decision 与 workflow 的例外，必须通过完整 Git 来源核验。写入材料的文本字段保持周整：分段换行、多条用序号或短横线列举，不把多件事挤成一段。

先读 revision，再走同一材料服务 save(expectedRevision)；校验受信任工作树和流程白名单、路径、跨进程互斥、原子替换。不同分支不是一个写入路径。冲突保留双方输入并重读合并；不直接覆盖文件绕过服务。

保存、评审、归档、目标达成和正式发布分别成立。人的决定绑定对象/修订/来源/时间，模型不代签。decision.materialRevision 是版本、验收周期、planRef、candidateRef、全局候选交付包（preparedArtifacts 中 kind=package）、固定计划中本目标的承诺与本目标采用证据的确定性 SHA-256 投影，不含 decision 自身。证据包括 deliveries/readings/note/nextStep、本目标 deliveries.location 引用的其他准备材料，以及固定计划关联到该目标的 Issue 快照。只改一个目标证据，仅该目标需重新确认；planRef、candidateRef 或全局候选交付包改变，保留已有结论但全部标记待重新确认，即使源码提交相同也要核对包的真实来源。未被目标引用的其他准备材料不计入该目标证据。摘要只检测证据变化，不证明签署人的身份，Issue 关闭数不自动决定目标达成。归档在会话中发起：核对材料与待确认项后更新 stage=archive、按项目门禁提 PR、开出后写入 archivePr 并回显链接；界面没有归档按钮，归档后补证直接在原会话继续处理。后续执行遵从授权；不自动合入、完成 Issue 或发布。旧认可和归档不可直接覆盖新修订。

Issue 关联以固定 plan.tasks 的完整任务身份与 goalId 为准，不能仅凭快照自己声明的 goalId。快照指纹按任务身份稳定排序，保留来源、标题、状态、链接或失败事实，排除仅 readAt 变化；同事实刷新或列表重排不触发重新确认。未关联目标的 Issue 仍进入报告，不影响单目标结论；未记录与已记录空集分别呈现。

schema2 一次显式迁移保留原件/提交来源；旧 results 按实际版本导入验收草稿，旧 confirmation 仅作历史依据。不能无损解释的对象保留待核。UI/CLI/提示/模板同时切换，不永久双写或失败静默回退旧流程。
