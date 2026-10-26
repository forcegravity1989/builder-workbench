# 版本计划与验收材料契约

> 给维护版本材料的会话按需读取。本文定义对象、来源和写入边界，不复述讨论 SOP；SOP 在 week-planning / version-acceptance，旧格式字段与迁移只在读回异常时查旧格式材料 reference。契约变化时更新。

材料读写时必须已有明确版本，由宿主提供原生身份及可调用工具；启动会话不要求先有版本。

## 对象与工作区

| 对象          | 正本                                                     | 边界                                                                                            |
| ------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 计划          | 本版固定计划树的 .bw/planning/<version>/data.json（绑定版本树 bw/<版本>/plan；旧无绑定固定树 bw/week-plan）   | summary、稳定 goalId、承诺/可选交付与验收说明、metricRef/目标、任务引用、会议纪要（minutes）、workflow 阶段 |
| 验收          | 本版固定验收树（绑定版本树 bw/<版本>/acceptance；旧无绑定固定树 bw/week-acceptance）的同目录 acceptance.json        | 固定 planRef、候选、演示环境（demoEnv）、制品登记（含验收证据报告）、readingRef、Issue 备注与遗留标记、会议纪要（minutes）、人的结论与下一步、workflow 阶段；不改计划 |
| 指标          | 项目最新已合入配置中的 .bw/metrics.toml 及真实历史采集源 | 新采集固定本次采用的定义/脚本修订；旧 baseline 和归档证据保留，不以常驻树旧文件或旧引用锁住目录 |
| Issue/会话/PR | 原生 provider / Orca                                     | 材料只存引用，不另建正文、聊天或状态正本                                                        |
| 纪要          | 计划与验收材料各自的 minutes 节                           | 纪要正文由模型在未确认时撰写，人工确认只能由人标记，不另建第二份会议正文文件                     |
| 验收证据报告  | .bw/planning/<version>/ 下的报告文件，登记为 preparedArtifacts 的 verification 制品 | 一个版本一份、全目标合并，由模型按 version-acceptance 技能模板生成；不是界面派生文本，也不代替 workbench-release 的版本收尾报告 |

计划/验收固定分支（绑定版本树为 bw/<版本>/plan、bw/<版本>/acceptance；旧无绑定固定树为 bw/week-plan、bw/week-acceptance）分别由原生项目/宿主/worktree 身份定位；物理目录由 Orca 原生创建和登记，不硬编码 .bw/worktrees 下的路径。冲突目录不得自动搬移/删除。同步基线前检查未归档修改，不 reset 脏树；跨树读取用固定提交，不把另一树的工作中草稿当正式材料。

运行身份由项目、宿主、流程与原生会话或 runId 定位。绑定工作树的会话版本由绑定决定（绑定即单一正本），不在会话内再选版；旧无绑定树的会话可先启动，后由人选已有版本或明确新建；未选择时不新建或修改计划，不能用日期、mtime 或未发布状态代定版本。自动化首次登记默认 reuseSession=false，之后尊重用户保存的配置；同次恢复沿用原生身份，不能按标题判断身份。命名沿用 Orca 默认规则；需要人为命名时，版本在前。工作文件代表当前编辑修订，历史通过不可变归档恢复。

cycleId 标识同一版本同一流程的材料身份，不是自然周、原生会话或自动化 runId；编辑、换会话和归档后补证都保留 cycleId。同一版本的计划、验收各自保留一份当前材料。**一个版本做一轮验收**：没有验收轮次，也不按周呈现，周次只是运行上下文。未达也能如实归档，不自动承诺遗留目标。

## 来源与历史

计划 `summary.progressSource` 是可选的已归档验收引用，只需 version；cycleId/sourceCommit/revision 是存量兼容字段（v0.7.x 写入的四元组形态），新材料不再写入。流程固定为 acceptance，项目与宿主来自当前原生上下文；没有该字段的材料仍有效。它记录人明确选择的进展依据版本，不表示版本号之间有顺序关系。页面在基线分支上取该版本最新已合入的验收记录并沿其 planRef 核对当时的计划；四元组齐备的存量材料仍按固定提交读取并核对修订与身份。保存格式通过不能代替归档或内容核验。选择或更换版本不自动覆盖 summary.progress，来源不可用时保留原输入，不改读其他版本或最新记录。

planRef 的共同字段为 kind/version/cycleId/revision。kind=committed 时另有 sourceCommit；kind=draft 时另有 sourceWorktreeId/sourceHostId。项目身份由请求的原生项目上下文约束，材料路径从 version 推导为 .bw/planning/<version>/data.json。修订（revision）是材料内容指纹：固定提交引用保持原始指纹，当前工作材料的指纹不分换行形态，归档核对不因换行差异误报。**验收只能建立在已提交且归档 PR 已合入的计划上**：计划归档 PR 未合入时验收屏保持空板并如实报错，模型也不得用 kind=draft 的 planRef 创建验收材料。

指标 ref 保存 name/definitionHash/configurationCommit；readingEvidence 保存 ref/value/unit/source/collectedAt/collectorRevision。新业务采集只使用日/周历史窗口，observation 记录 start/end/granularity/timezone；旧的即时读数形态只保留为历史证据的解释，不恢复当前值采集。计划 baseline 不被新采集覆盖；**验收板面不设指标区**，指标证据只进验收证据报告，报告里每个目标必含「本版目标值 vs 本期读数」对比。用户明确需要额外指标时，可在会话中按最新目录补充 readings；新旧配置不同不阻止采集。由人追溯核对可比性，不自动改原承诺或判断达成。不另建每日台账，来源真实性由指标服务及消费方核验。

taskSnapshot 保存验收当时逐项读取的 Issue 状态：每项含任务身份、标题、状态、链接，失败项记错误与读取时间。缺少 taskSnapshot 表示尚未记录，空数组才表示当时没有关联任务。快照不是 Issue 状态正本，不保存页面交互状态，也不授权自动完成任务。

验收 `results[]` 的现行字段是 goalId、readings、note、nextStep，以及可选的 decision、issueNotes、issueMarks。`issueNotes` 与 `issueMarks` 以完整任务身份关联人工备注与 carry（遗留）标记；carry 就是下版计划屏「延期遗留」的来源。issueMarks 只有 carry，没有风险标记。任务的原生状态仍从 provider 读取，标记不代替任务状态。

`demoEnv` 是版本级演示环境，由模型部署后写回，两种形态二选一：`{kind:'url', url, label?}` 给 web 服务（url 必须是以 http:// 或 https:// 开头的绝对地址，不接受协议相对或相对路径；label 是一句系统名，板面「演示环境」行显示系统名、缺省回退 URL，点击经内置浏览器打开）；`{kind:'launched', detail}` 给桌面应用，如实记录启动状态，不伪造链接。缺省表示尚未部署。

验收材料可选 `minutes` 节，结构与计划侧同形但**没有闭环位**：`consensus` 为共识若干点（字符串数组），`followups` 为遗留若干点（条目含稳定 id 与 text），`confirmed`/`confirmedAt` 记录人工确认，`sources`/`updatedAt` 可选。正文由验收助手基于板面在线批注与可选会议转写稿提炼撰写，仅在未确认时可由模型通道写入或改写；人在界面确认后整节对模型冻结，要改正文须先由人在屏上撤销确认。验收侧遗留条目**不设闭环状态**——会上已解决的写进共识或不写入遗留；遗留条目原样成为下版计划屏「会议遗留」的来源，且只有人工确认过的纪要才会被下版读取。`followups[].id` 用稳定身份，人工增删不让既有编号漂移，界面按数组序显示 M1…Mn。

计划材料可选 `minutes` 节承载会议纪要：`consensus` 为共识若干点（字符串数组），`followups` 为遗留若干点（条目含稳定 id、text、closed），`confirmed`/`confirmedAt` 记录人工确认，`sources`/`updatedAt` 为可选的输入来源描述与正文更新时间。正文由计划助手基于在线批注与可选会议转写稿提炼撰写，仅在未确认（confirmed=false 或整节缺省）时可由模型通道写入或改写；人在计划屏确认后整节对模型冻结，要改正文须先由人在屏上撤销确认。`followups[].closed`（闭环 = 版本计划已按该条遗留修改）只能由人标记：模型对既有条目按 id 原样往返，新增条目必须 closed=false，不得删除已闭环条目。确认与闭环都不是目标达成或 Issue 认可，认可随归档 PR 评审表达；生成或填写纪要不自动等于确认。总览直接读取本节呈现，无存储纪要的历史版本如实显示纪要未记录。

candidateRef 仅保存 repository/version/commit，commit 是完整 SHA。preparedArtifacts 含 artifactId/kind/location/candidateRef/generatedAt，可选 command/executionRoot/checksum；kind 为 package（制品包）或 verification（验收证据报告）等。验收证据报告必须在候选固定之后生成登记，location 存 .bw 相对路径，截图落同目录 shots/。执行根记录在该材料上，不加到 candidateRef。验收树只承载材料，出包从指定源码候选的执行工作区进行。包重出不自动刷新板面已填内容；是否重核相关证据由模型在会话中提醒、人决定，界面不做主动失效或「待重核」呈现。

总览与版本索引按 version/workflow/cycleId 各取最新一条当前材料，不扫描旧提交铺旧记录；读取固定来源时核对版本、cycleId 与修订；未合入草稿在其工作区读取；损坏的当前文件如实提示。选中验收版本后，**只有计划归档 PR 已合入时**页面才初始化并保存缺失的空白验收，已有材料直接继续；新材料与归档后补证均自动保存。总览不显示发布状态。

workflow 是模型写入材料的 SOP 进度节：`stage` 记录最近完成的阶段（计划 preparation/goals/breakdown/review/archive；验收 preparation/showcase/archive），`updatedAt` 记录写入时间，`archivePr`（provider/repository/number）在归档 PR 开出后补上。**两屏都不渲染旅程灯**：板面顶部旅程是同页定位导航，与 stage 不同名也不映射；stage 只供会话恢复校准与自动化读取。stage 是进度信号不是完成权威：不代表目标达成、不代替人工结论、不代表 PR 已合入；PR 合入状态由界面按 archivePr 向 provider 薄读取显示，读不到保持未知。纪要的人工确认是材料字段事实，不占 stage。会话恢复时先把 stage 校准到实际进度；内容实质调整使后续阶段失效时回退。界面不提供修改 stage 的入口，它只经材料保存写入。**材料里没有发布记录字段**：发布读数的正本在 Git 标签与 provider Release 页，模型发布后在会话中如实报告读回结果，不写入材料。归档提交固定落在该流程的本版固定分支（绑定版本树：计划 bw/<版本>/plan、验收 bw/<版本>/acceptance；旧无绑定固定树：bw/week-plan、bw/week-acceptance）上，PR/MR 由该固定分支开向主分支，不从其他分支或新建工作树归档。

## 写入与人的决定

连接和执行沿用 Orca；宿主提供 repoId/worktreeId/hostId，分别绑定对应流程的本版固定树（绑定版本树或旧 bw/week-plan、bw/week-acceptance），页面还使用原生 runtimeOwnerEnvironmentId 选择配对宿主。不能由模型传文件根替代原生身份，也不把 SSH 路径交给客户端本机文件 API。

实际工具为 `ORCA bw materials context/select/list/read/save/schema`，共用 `--repo-id <id> --worktree-id <id> --workflow plan|acceptance`，host-id 在所选 runtime 内解释，默认 local；SSH 工作树使用宿主提供的 ssh: 身份。list 不需要版本，只有列举作用；read 需要 `--version <已确认版本>`，返回 document/revision 或 null。save 再传 `--input <JSON 草稿文件>` 或 `--input-stdin`（二选一）；SSH 会话通过标准输入传 JSON，由 Orca 原生 CLI bridge 转发，不把远端草稿路径交给客户端读文件；更新必须使用刚读到的 `--expected-revision <revision>`，明确新建用 `--create`，二者互斥。结构通过 `ORCA bw materials schema --workflow plan|acceptance --json` 读取（随 CLI 打包，无需 BW 源码或运行中的应用）；跨字段约束仍由 save 校验。

冲突命令以非零状态返回 revision-conflict 及 currentRevision，原材料和输入草稿保留；重读并合并后重试，不循环覆盖。页面走同一 runtime RPC，直接编辑自动保存；「更新代码」先把本屏工作树快进到主干最新、再重读宿主材料和版本候选并保留未保存输入，快进不了时保持原样并提示交会话处理、材料仍照常重读。文件保存不自行采集指标或验证人的身份，存入 reading/decision 字段不能据此点绿灯，业务消费方必须核对真实来源。

人工字段守卫保护：计划 `summary.risks` 与计划 minutes 的人工标记（confirmed/confirmedAt 及 followups[].closed；已确认时整节冻结，未确认时模型可写正文）；验收 `results[].decision/note/nextStep/issueNotes/issueMarks`、验收 minutes 的 confirmed/confirmedAt（已确认时整节冻结，未确认时模型可写正文）；以及旧格式材料的全部只读字段（轮次、会议指导、风险标记、目标级交付件与材料链接、目标级进展、材料备齐核对记录等）。模型/CLI 只能原样往返这些人工值；新增非空值、修改或删除均会被拒绝，不能用直接编辑文件绕过。验收材料的 planRef 必须是 kind=committed，模型不得用草案计划创建或改写验收。写入材料的文本字段保持周整：分段换行、多条用序号或短横线列举，不把多件事挤成一段。

先读 revision，再走同一材料服务 save(expectedRevision)；校验受信任工作树和流程白名单、路径、跨进程互斥、原子替换。不同分支不是一个写入路径。冲突保留双方输入并重读合并；不直接覆盖文件绕过服务。

保存、评审、归档、目标达成和正式发布分别成立。人的决定绑定对象/修订/来源/时间，模型不代签。`decision.outcome` 只有 `met` 与 `not-met`，由人在界面行尾标记（互斥，再点取消回未标；未标即字段缺省，界面保持空白，不冒充、不推定）。`decision.source` 记「验收界面人工确认」，`reason` 取该目标的 note——行尾两个动作不采集原因文本，不达成的原因与安排的正本是纪要、nextStep 与 Issue 备注。`decision.materialRevision` 是该目标证据账本（候选、交付包、报告、演示环境、本目标承诺与关联 Issue 快照）的确定性修订投影，只是账本字段：界面不据它渲染陈旧态或「待重核」，证据是否变化要重核由模型在会话中提醒、人决定。摘要只检测证据变化，不证明签署人的身份，Issue 关闭数不自动决定目标达成。旧认可和归档不可直接覆盖新修订。归档在会话中发起：核对材料与结论状态后更新 stage=archive、按项目门禁提 PR、开出后写入 archivePr 并回显链接；界面没有直接执行归档的按钮，归档后补证直接在原会话继续处理。发布由界面一个按钮注入请求，预检、一致性核对、知情授权、执行与独立读回都在会话中完成；后续执行遵从授权，不自动合入、完成 Issue 或发布。

Issue 关联以固定 plan.tasks 的完整任务身份与 goalId 为准，不能仅凭快照自己声明的 goalId。同一事实的刷新或列表重排不构成材料改动。未关联目标的 Issue 仍进入报告，不影响单目标结论；未记录与已记录空集分别呈现。
