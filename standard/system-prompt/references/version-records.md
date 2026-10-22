# 版本计划与验收材料契约

> 给维护版本材料的会话与实现者按需读取。本文定义对象、来源和写入边界，不复述讨论 SOP；SOP 在 week-planning / version-acceptance。契约变化时更新。
>
> 状态：schema3 材料核心、runtime RPC、CLI 与计划/验收页面已接入；schema2 需显式迁移。材料读写时必须已有明确版本，由宿主提供原生身份及可调用工具；启动会话不要求先有版本。

## 对象与工作区

| 对象          | 正本                                                     | 边界                                                                                            |
| ------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 计划          | bw/week-plan 工作树的 .bw/planning/<version>/data.json   | summary、稳定 goalId、承诺/可选交付与验收说明、metricRef/目标、任务引用、会议纪要（minutes）、workflow 阶段 |
| 验收          | bw/week-acceptance 工作树的同目录 acceptance.json        | 固定 planRef、候选、演示环境（demoEnv）、制品登记（含验收证据报告）、readingRef、Issue 备注与遗留标记、会议纪要（minutes）、人的结论与下一步、workflow 阶段；不改计划 |
| 指标          | 项目最新已合入配置中的 .bw/metrics.toml 及真实历史采集源 | 新采集固定本次采用的定义/脚本修订；旧 baseline 和归档证据保留，不以常驻树旧文件或旧引用锁住目录 |
| Issue/会话/PR | 原生 provider / Orca                                     | 材料只存引用，不另建正文、聊天或状态正本                                                        |
| 纪要          | 计划与验收材料各自的 minutes 节                           | 纪要正文由模型在未确认时撰写，人工确认只能由人标记，不另建第二份会议正文文件                     |
| 验收证据报告  | .bw/planning/<version>/ 下的报告文件，登记为 preparedArtifacts 的 verification 制品 | 一个版本一份、全目标合并，由模型按 version-acceptance 技能模板生成；不是界面派生文本，也不代替 workbench-release 的版本收尾报告 |

两个固定分支分别由原生项目/宿主/worktree 身份定位；物理目录由 Orca 原生创建和登记，不硬编码 .bw/worktrees 下的路径。冲突目录不得自动搬移/删除。同步基线前检查未归档修改，不 reset 脏树；跨树读取用固定提交，不把另一树的工作中草稿当正式材料。

运行身份由项目、宿主、流程与原生会话或 runId 定位。会话可先启动，后由人选已有版本或明确新建；未选择时不新建或修改计划，不能用日期、mtime 或未发布状态代定版本。自动化首次登记默认 reuseSession=false，之后尊重用户保存的配置；同次恢复沿用原生身份，不能按标题判断身份。命名沿用 Orca 默认规则；需要人为命名时，版本在前。工作文件代表当前编辑修订，历史通过不可变归档恢复。

cycleId 标识同一版本同一流程的材料身份，不是自然周、原生会话或自动化 runId；编辑、换会话和归档后补证都保留 cycleId。同一版本的计划、验收各自保留一份当前材料。**一个版本做一轮验收**：没有验收轮次，也不按周呈现，周次只是运行上下文。未达也能如实归档，不自动承诺遗留目标。

## 来源与历史

计划 `summary.progressSource` 是可选的已归档验收引用，只包含 version/cycleId/sourceCommit/revision，流程固定为 acceptance，项目与宿主来自当前原生上下文；没有该字段的 schema3 材料仍有效。它表示明确选择的进展依据，不表示版本号之间有顺序关系。页面读取固定提交并核对材料修订及其 planRef；保存格式通过不能代替归档或内容核验。选择或更换引用不自动覆盖 summary.progress，来源不可用时保留原输入，不改读最新记录。

planRef 的共同字段为 kind/version/cycleId/revision。kind=committed 时另有 sourceCommit；kind=draft 时另有 sourceWorktreeId/sourceHostId。项目身份由请求的原生项目上下文约束，材料路径从 version 推导为 .bw/planning/<version>/data.json，固定提交引用的 revision 保持原始字节 SHA-256；当前工作材料读写的 revision 统一 CRLF 为 LF 后计算（其余内容仍参与比较），归档核对忽略这一换行差异，不再重复写 project/path/hash。**验收只能建立在已提交且归档 PR 已合入的计划上**：草案预验收通道已退役，计划归档 PR 未合入时验收屏保持空板并如实报错，模型也不得用 kind=draft 的 planRef 创建验收材料。来源解析与核验由验收接线实现，保存 schema 本身不能证明来源。

指标 ref 保存 name/definitionHash/configurationCommit；readingEvidence 保存 ref/value/unit/source/collectedAt/collectorRevision。新业务采集只使用日/周历史窗口，observation 记录 start/end/granularity/timezone；既有 instant/observedAt 只保留为历史证据的解释，不恢复当前值采集。计划 baseline 不被新采集覆盖；**验收板面不设指标区**，指标证据只进验收证据报告，报告里每个目标必含「本版目标值 vs 本期读数」对比。用户明确需要额外指标时，可在会话中按最新目录补充 readings；新旧配置不同不阻止采集。由人追溯核对可比性，不自动改原承诺或判断达成。不另建每日台账，来源真实性由指标服务及消费方核验。

taskSnapshot 保存验收当时逐项读取的 Issue 状态。每项 ready 含 reference/source/iid/title/state/url/readAt；unavailable 含 reference/readAt/error，可保留已解析 source。source 复用原生 TaskSourceContext，执行宿主 hostId 与 providerIdentity 的平台 host/project 分开，不存页面返回、滚动或草稿状态。缺少 taskSnapshot 表示尚未记录，空数组才表示当时没有关联任务。快照不是 Issue 状态正本，也不授权自动完成任务。

验收 `results[]` 的现行字段是 goalId、readings、note、nextStep，以及可选的 decision、issueNotes、issueMarks。`issueNotes` 与 `issueMarks` 以完整任务身份关联人工备注与 carry（遗留）标记；carry 就是下版计划屏「延期遗留」的来源。任务的原生状态仍从 provider 读取，标记不代替任务状态。**风险标记已整体退役**，`issueMarks` 只剩 carry。

`demoEnv` 是版本级演示环境，由模型部署后写回，两种形态二选一：`{kind:'url', url}` 给 web 服务（必须是以 http:// 或 https:// 开头的绝对地址，不接受协议相对或相对路径），界面点击经内置浏览器打开；`{kind:'launched', detail}` 给桌面应用，如实记录启动状态，不伪造链接。缺省表示尚未部署。版本级一份完整交付件加一个演示环境取代了旧的目标级交付件。

验收材料可选 `minutes` 节，结构与计划侧同形但**没有闭环位**：`consensus` 为共识若干点（字符串数组），`followups` 为遗留若干点（条目含稳定 id 与 text），`confirmed`/`confirmedAt` 记录人工确认，`sources`/`updatedAt` 可选。正文由验收助手基于板面在线批注与可选会议转写稿总结撰写，仅在未确认时可由模型通道写入或改写；人在界面确认后整节对模型冻结，要改正文须先由人在屏上撤销确认。验收侧遗留条目**不设闭环状态**——会上已解决的写进共识或不写入遗留；遗留条目原样成为下版计划屏「会议遗留」的来源，且只有人工确认过的纪要才会被下版读取。`followups[].id` 用稳定身份，人工增删不让既有编号漂移，界面按数组序显示 M1…Mn。

计划材料可选 `minutes` 节承载会议纪要：`consensus` 为共识若干点（字符串数组），`followups` 为遗留若干点（条目含稳定 id、text、closed），`confirmed`/`confirmedAt` 记录人工确认，`sources`/`updatedAt` 为可选的输入来源描述与正文更新时间。正文由计划助手基于在线批注与可选会议转写稿总结撰写，仅在未确认（confirmed=false 或整节缺省）时可由模型通道写入或改写；人在计划屏确认后整节对模型冻结，要改正文须先由人在屏上撤销确认。`followups[].closed`（闭环 = 版本计划已按该条遗留修改）只能由人标记：模型对既有条目按 id 原样往返，新增条目必须 closed=false，不得删除已闭环条目。确认与闭环都不是目标达成或 Issue 认可，认可随归档 PR 评审表达；生成或填写纪要不自动等于确认。旧「按目标派生三节模板的预览纪要」出口已整体退役，总览直接读取本节呈现，无存储纪要的历史版本如实显示纪要未记录，不再由目标派生冒充。

### 旧格式字段（v10 之前，只读）

验收材料里以下字段属 v10 之前的格式，**schema 仍接受它们以便存量材料可读，但任何界面与模型通道都不得写入、修改或清理**：`results[].rounds[]`（验收轮次及其快照）、`results[].meetingDirectives[]`（会议指导与处置标签）、`results[].deliveries[]`（目标级交付件）、`results[].materials[]`（目标级材料链接）、`results[].progress`（目标级人工进展）、`issueMarks[].risk`（风险标记）。它们由验收屏的「旧格式记录（v10 前）」只读区如实呈现，不参与任何结论、纪要或遗留回显。

唯一例外是读取侧的兼容：计划屏「上版回顾」在验收材料**没有** minutes 节时，仍读旧的已确认且 tag=`next-week-plan` 的 meetingDirectives 作为「会议遗留」，使旧版本的两行回显不因退役而变空；一旦该版有了人工确认的纪要，以纪要为准。

把这些字段真正转换到当前格式属于**迁移**，只能在会话中说明方案、经人确认后执行，不留旧文件副本；读回永不改写存量文件。模型通道改动这些字段（包括「顺手清理」）会被人工守卫拒绝。

candidateRef 仅保存 repository/version/commit，commit 是完整 SHA。preparedArtifacts 含 artifactId/kind/location/candidateRef/generatedAt，可选 command/executionRoot/checksum；kind 为 package（制品包）或 verification（验收证据报告）等。验收证据报告必须在候选固定之后生成登记，location 存 .bw 相对路径，截图落同目录 shots/。执行根记录在该材料上，不加到 candidateRef。验收树只承载材料，出包从指定源码候选的执行工作区进行。包重出不自动刷新板面已填内容；是否重核相关证据由模型在会话中提醒、人决定，界面不做主动失效或「待重核」呈现。

总览从项目主干基线（主检出）的版本目录读取材料，一个版本只显示一份当前计划及验收，不扫描旧提交重新铺出旧记录。版本材料索引按 version/workflow/cycleId 各取最新一条。读取固定来源时核对版本、cycleId 与修订；未合入草稿在其工作区读取，损坏的当前文件如实提示。选中验收版本后，**只有计划归档 PR 已合入时**页面才初始化并保存缺失的空白验收，已有材料直接继续。新材料与归档后补证均自动保存。总览不显示发布状态。

workflow 是模型写入材料的 SOP 进度节：`stage` 记录最近完成的阶段（计划 preparation/goals/review/breakdown/archive；验收 preparation/showcase/archive），`updatedAt` 记录写入时间，`archivePr`（provider/repository/number）在归档 PR 开出后补上。**两屏都不渲染旅程灯**：验收屏板面的四步（验收准备/Showcase/会议纪要/归档 PR 及发版本）是同页定位导航，与 stage 不同名也不映射；stage 只供会话恢复校准与自动化读取。stage 是进度信号不是完成权威：不代表目标达成、不代替人工结论、不代表 PR 已合入；PR 合入状态由界面按 archivePr 向 provider 薄读取显示，读不到保持未知。纪要的人工确认是材料字段事实，不占 stage。会话恢复时先把 stage 校准到实际进度；内容实质调整使后续阶段失效时回退。界面不提供修改 stage 的入口，它只经材料保存写入。**材料里没有发布记录字段**：发布读数的正本在 Git 标签与 provider Release 页，模型发布后在会话中如实报告读回结果，不写入材料。归档提交固定落在该流程的固定分支（计划 bw/week-plan、验收 bw/week-acceptance）上，PR/MR 由固定分支开向主分支，不从其他分支或新建工作树归档。

preparationReview 是历史保留的人工材料备齐核对记录，包含 source、recordedAt、materialRevision。验收屏已移除「材料备齐」勾选，该字段不再驱动任何界面信号。字段仍受人工守卫保护（模型/CLI 不得代人写入或篡改），旧材料读回时保留原值，也不证明命令执行或目标达成。

## 写入与人的决定

连接和执行沿用 Orca；宿主提供 repoId/worktreeId/hostId，分别绑定 bw/week-plan、bw/week-acceptance，页面还使用原生 runtimeOwnerEnvironmentId 选择配对宿主。不能由模型传文件根替代原生身份，也不把 SSH 路径交给客户端本机文件 API。

实际工具为 `orca bw materials list/read/save`，共用 `--repo-id <id> --worktree-id <id> --workflow plan|acceptance`，host-id 在所选 runtime 内解释，默认 local；SSH 工作树使用宿主提供的 ssh: 身份。list 不需要版本，只有列举作用；read 需要 `--version <已确认版本>`，返回 document/revision 或 null。save 再传 `--input <schema3 JSON 草稿文件>` 或 `--input-stdin`（二选一）；SSH 会话通过标准输入传 JSON，由 Orca 原生 CLI bridge 转发，不把远端草稿路径交给客户端读文件，更新必须使用刚读到的 `--expected-revision <revision>`；明确新建用 `--create`，二者互斥。普通项目通过 `orca bw materials schema --workflow plan|acceptance --json` 读取随 CLI 打包的结构，无需 BW 源码或运行中的应用；跨字段约束仍由 save 校验。维护正本为 src/shared/workbench/version-material.ts，不能把 schema2 文件直接提交；`--json` 用于机器读取。

冲突命令以非零状态返回 revision-conflict 及 currentRevision，原材料和输入草稿保留；重读并合并后重试，不循环覆盖。页面走同一 runtime RPC，直接编辑自动保存；「更新代码」先把本屏工作树快进到主干最新、再重读宿主材料和版本候选并保留未保存输入，快进不了时保持原样并提示交会话处理、材料仍照常重读。文件保存不自行采集指标或验证人的身份，存入 reading/decision 字段不能据此点绿灯，业务消费方必须核对真实来源。

人工字段守卫保护：计划 `summary.risks` 与计划 minutes 的人工标记（confirmed/confirmedAt 及 followups[].closed；已确认时整节冻结，未确认时模型可写正文）；验收 `preparationReview`、`results[].decision/note/nextStep/issueNotes/issueMarks`、验收 minutes 的 confirmed/confirmedAt（已确认时整节冻结，未确认时模型可写正文）；以及上文列出的全部旧格式只读字段。模型/CLI 只能原样往返这些人工值；新增非空值、修改或删除均会被拒绝，不能用直接编辑文件绕过。验收材料的 planRef 必须是 kind=committed，模型不得用草案计划创建或改写验收。写入材料的文本字段保持周整：分段换行、多条用序号或短横线列举，不把多件事挤成一段。

先读 revision，再走同一材料服务 save(expectedRevision)；校验受信任工作树和流程白名单、路径、跨进程互斥、原子替换。不同分支不是一个写入路径。冲突保留双方输入并重读合并；不直接覆盖文件绕过服务。

保存、评审、归档、目标达成和正式发布分别成立。人的决定绑定对象/修订/来源/时间，模型不代签。`decision.outcome` 只有 `met` 与 `not-met` 由人在界面行尾标记（互斥，再点取消回未标；未标即字段缺省，界面保持空白，不冒充、不推定）；`pending` 仅为读回 v9.5 存量结论保留，板面不写不显。`decision.source` 记「验收界面人工确认」，`reason` 取该目标的 note——行尾两个动作不采集原因文本，不达成的原因与安排的正本是纪要、nextStep 与 Issue 备注。`decision.materialRevision` 是版本、验收周期、planRef、candidateRef、demoEnv、全局候选交付包（kind=package）、登记的验收证据报告、固定计划中本目标的承诺与该目标关联 Issue 快照的确定性 SHA-256 投影，不含 decision 自身。目标级交付件退役后，证据登记是版本级的：报告或演示环境变化会影响各目标的账本修订。该修订只是账本字段，界面不据它渲染陈旧态或「待重核」；证据是否变化由模型在会话中提醒、人决定是否重核。摘要只检测证据变化，不证明签署人的身份，Issue 关闭数不自动决定目标达成。归档在会话中发起：核对材料与结论状态后更新 stage=archive、按项目门禁提 PR、开出后写入 archivePr 并回显链接；界面没有直接执行归档的按钮，归档后补证直接在原会话继续处理。发布由界面一个按钮注入请求，预检、一致性核对、知情授权、执行与独立读回都在会话中完成；后续执行遵从授权，不自动合入、完成 Issue 或发布。旧认可和归档不可直接覆盖新修订。

Issue 关联以固定 plan.tasks 的完整任务身份与 goalId 为准，不能仅凭快照自己声明的 goalId。快照指纹按任务身份稳定排序，保留来源、标题、状态、链接或失败事实，排除仅 readAt 变化；同事实刷新或列表重排不构成材料改动。未关联目标的 Issue 仍进入报告，不影响单目标结论；未记录与已记录空集分别呈现。

schema2 一次显式迁移保留原件/提交来源；旧 results 按实际版本导入验收草稿（旧的目标级交付件转为 note 里的注记文字，不随字段退役丢数据），旧 confirmation 仅作历史依据。不能无损解释的对象保留待核。UI/CLI/提示/模板同时切换，不永久双写或失败静默回退旧流程。
