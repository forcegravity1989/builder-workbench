# 版本计划与验收材料契约

> 给维护版本材料的会话按需读取。本文定义对象、来源和写入边界，不复述讨论 SOP；SOP 在 week-planning / version-acceptance，旧格式字段与迁移只在读回异常时查旧格式材料 reference。契约变化时更新。

材料读写时必须已有明确版本，由宿主提供原生身份及可调用工具；启动会话不要求先有版本。

## 对象与工作区

| 对象          | 正本                                                                                                         | 边界                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 计划          | 本版固定计划树的 .bw/planning/<version>/data.json（绑定版本树 bw/<版本>/plan；旧无绑定固定树 bw/week-plan）  | summary、稳定 goalId、承诺/可选交付与验收说明、metricRef/目标、任务引用（**归档时写入的成员快照；本版成员平时按 Issue 标签 `bw:plan:<版本>` 与标题目标段读回，不逐条写在文件里**）、会议纪要（minutes）、workflow 阶段                                                                                                             |
| 验收          | 本版固定验收树（绑定版本树 bw/<版本>/acceptance；旧无绑定固定树 bw/week-acceptance）的同目录 acceptance.json | 固定 planRef、候选、演示环境（demoEnv）、预订会议（meeting）、制品登记（含验收证据报告）、readingRef、Issue 备注与遗留标记、会议纪要（minutes）、人的结论与下一步、workflow 阶段；不改计划                              |
| 指标          | 项目基线或包含该基线的维护提交中的 .bw/metrics.toml 及真实历史采集源                                         | 新采集固定本次采用的定义/脚本修订；旧 baseline 和归档证据保留，不以常驻树旧文件或旧引用锁住目录                                                                                                                         |
| Issue/会话/PR | 原生 provider / Orca                                                                                         | 材料只存引用，不另建正文、聊天或状态正本                                                                                                                                                                                |
| 纪要          | 计划与验收材料各自的 minutes 节                                                                              | 纪要正文由模型在未确认时撰写，人工确认只能由人标记，不另建第二份会议正文文件                                                                                                                                            |
| 验收证据报告 | `.bw/planning/<version>/acceptance-evidence.html`，登记为 `preparedArtifacts` 的 verification 制品 | 一个版本一份 HTML 报告，登记后经内置浏览器打开；待核对项不阻塞登记，登记不代表验收通过。生成流程与模板由 version-acceptance Skill 维护 |

计划/验收固定分支（绑定版本树为 bw/<版本>/plan、bw/<版本>/acceptance；旧无绑定固定树为 bw/week-plan、bw/week-acceptance）分别由原生项目/宿主/worktree 身份定位；物理目录由 Orca 原生创建和登记，不硬编码 .bw/worktrees 下的路径。冲突目录不得自动搬移/删除。同步基线前检查未归档修改，不 reset 脏树；跨树读取用固定提交，不把另一树的工作中草稿当正式材料。

运行身份由项目、宿主、流程与原生会话或 runId 定位。绑定工作树的会话版本由绑定决定（绑定即单一正本），不在会话内再选版；旧无绑定树的会话可先启动，后由人选已有版本或明确新建；未选择时不新建或修改计划，不能用日期、mtime 或未发布状态代定版本。自动化首次登记默认 reuseSession=false，之后尊重用户保存的配置；同次恢复沿用原生身份，不能按标题判断身份。命名沿用 Orca 默认规则；需要人为命名时，版本在前。工作文件代表当前编辑修订，历史通过不可变归档恢复。

cycleId 标识同一版本同一流程的材料身份，不是自然周、原生会话或自动化 runId；编辑、换会话和归档后补证都保留 cycleId。同一版本的计划、验收各自保留一份当前材料。**一个版本做一轮验收**：没有验收轮次，也不按周呈现，周次只是运行上下文。未达也能如实归档，不自动承诺遗留目标。

## 里程碑与版本排期

里程碑是可选的宏观参考，不是制定版本计划的前置条件。开始计划时读取已有版本材料并沿用 version + cycleId；已合入项目材料中的 `.bw/milestones.json` 存在时，再参考其中的特性及预期版本日期。未规划里程碑不影响计划讨论、保存或板面渲染；读取失败要如实说明，不能当作空文件覆盖。

两种日期分别保存：

- `.bw/milestones.json` 使用 schema_version=4，可选 `versionPlans` 数组中每项为 `{version, cycleId, timeWindow: {start, end}}`，表示里程碑预期的版本窗口。
- `.bw/planning/<version>/data.json` 使用计划 schema 3，可选 `timeWindow: {start, end}`，表示本版计划实际采用的周期。两端均为包含当日的 ISO 日期，开始不得晚于结束。编辑其他字段原样保留日期；没有日期就是未登记，不从 Releases、验收或提交时间猜。

首日 Plan 可以校准日期、目标和范围，与里程碑预期不同并不使计划失效。里程碑重新编排只更新预期，不覆盖已有版本计划的 timeWindow 或其他字段；计划改期也不自动重写里程碑。预排新版本只在 milestones.json 登记身份与日期，不预建空计划或执行工作树。用户主动准备版本计划工作区时，材料服务沿用同名排期的 cycleId 与初始日期；没有排期才新建身份。已有材料始终原样复用，不能重新初始化覆盖；里程碑损坏或身份冲突时提示核对，不回退为随机新身份。

旧版遗留的空占位按项目一次性核对来源、实际内容、工作区和验收材料，经 PR 清理，保留里程碑排期与 Git 历史；升级和日常里程碑提交不自动删除。版本目录与各页面继续沿原有材料读取规则，不引入占位过滤或来源标记。主动新建的空计划、已有计划内容、验收及固定提交引用仍保留。相关成员升级后再提交只有排期的新版本，旧客户端不支持该目录语义。

里程碑还保存 milestones（id、outcome、date；仅有月份精度的成果保留 month 直至人工指定日期）与 features（id/title/owner/deliveries）。特性名称必填、负责人可空；每个 delivery 为稳定 id、phase（Build 或 Maintain）与可选 timeWindow（start/end）。日期使用北京时间民用时间 `YYYY-MM-DDTHH:mm`，结束边界不包含；未记录日期时省略 timeWindow。日期段独立于版本，可跨任意版本、多轮维护；日期相交只提供计划候选，不表示正式纳入。版本预期窗口不新增或扩大重叠，存量交集可保留或缩小；调整版本不带动特性。条长是自然日期跨度，不是工时。

读取 schema 2/3 时保留节点、特性及段的身份、名称和已记录日期；旧前五阶段按最早开始与最晚结束归为 Build，维护段归为 Maintain，空阶段保持未记录日期。旧 month、版本引用及 goalSlot/goalId 不再约束特性；没有 versionPlans 的旧材料可借当前可读版本窗口展示，正常提交才保存预期窗口，不宣称恢复了原始预期日期。正式材料、已提交提案和本机恢复草案采用同一迁移；不回写固定计划或验收。

里程碑不创建或绑定特性 Issue。版内细化由计划助手按 [Issue 格式的特性主单与拆分任务](issue-state.md#特性主单与拆分任务)与人讨论；不得用目标标题猜特性身份。人明确确认特性改名时，助手同步主 Issue 标题和里程碑对应行的 title，保留特性行 id、主 Issue 身份、各版任务引用和历史归档。只改目标标题不触发特性改名；关联不唯一时先核对，不批量替换同名文本。

里程碑名称或排期修改走既有 bw/project 项目材料评审，合入后由固定计划树经自身 Git 同步读取；不能在计划树静默改写另一树的草稿。两处改名分别读回并说明已保存、待评审或失败的实际状态，不把一侧成功说成同步完成。主干正式、已提交提案与工作中草稿必须区分；计划、任务和验收的历史来源保持不变。

## 来源与历史

计划 `summary.progressSource` 是可选的已归档验收引用，只包含 version/cycleId/sourceCommit/revision，流程固定为 acceptance，项目与宿主来自当前原生上下文；没有该字段的材料仍有效。新计划默认按材料版本顺序选择紧邻前版，并只检查该版的验收；前版只有计划没有验收时提示尚未完成验收，回顾留空，不跳到更早版本。首版没有前版则留空。已有 progressSource 保持固定，不因出现新版本而改写。页面读取固定提交并核对材料修订及其 planRef；保存格式通过不能代替归档或内容核验。来源不可用时保留原输入，不改读最新记录，也不把读取失败当作没有验收。

现行 planRef 的 kind 固定为 committed，字段为 version/cycleId/revision/sourceCommit，不接受草案来源。项目身份由请求的原生项目上下文约束，材料路径从 version 推导为 .bw/planning/<version>/data.json。修订（revision）是材料内容指纹：固定提交引用保持原始指纹，当前工作材料的指纹不分换行形态，归档核对不因换行差异误报。**开始验收会话不以计划归档 PR 合入为门禁**：助手首轮核对并提醒未合入状态，不自动合入。验收材料仍须建立在可读且身份核对通过的已提交固定计划上；来源缺失时保留空目标，不伪造材料、目标或 planRef。

指标 ref 保存 name/definitionHash/configurationCommit；readingEvidence 保存 ref/value/unit/source/collectedAt/collectorRevision。新业务采集只使用日/周历史窗口，observation 记录 start/end/granularity/timezone；旧的即时读数形态只保留为历史证据的解释，不恢复当前值采集。计划 baseline 不被新采集覆盖；**验收板面不设指标区**，指标证据只进验收证据报告（随各 Issue 的验收件归并）；「本版目标值 vs 本期读数」对比已随 #471 举证前移退役。用户明确需要额外指标时，可在会话中按最新目录补充 readings；新旧配置不同不阻止采集。由人追溯核对可比性，不自动改原承诺或判断达成。不另建每日台账，来源真实性由指标服务及消费方核验。

taskSnapshot 保存验收当时逐项读取的 Issue 状态：每项含任务身份、标题、状态、链接，失败项记错误与读取时间。缺少 taskSnapshot 表示尚未记录，空数组才表示当时没有关联任务。快照不是 Issue 状态正本，不保存页面交互状态，也不授权自动完成任务。

验收 `results[]` 的现行字段是 goalId、readings、note、nextStep，以及可选的 decision、issueNotes、issueMarks。`issueNotes` 与 `issueMarks` 以完整任务身份关联人工备注与 carry（遗留）标记；carry 就是下版计划屏「延期遗留」的来源。issueMarks 只有 carry，没有风险标记。任务的原生状态仍从 provider 读取，标记不代替任务状态。

`demoEnv` 是版本级演示环境，由模型部署后写回，两种形态二选一：`{kind:'url', url, label?}` 给 web 服务（url 必须是以 http:// 或 https:// 开头的绝对地址，不接受协议相对或相对路径；label 是一句系统名，板面「演示环境」行显示系统名、缺省回退 URL，点击经内置浏览器打开）；`{kind:'launched', detail}` 给桌面应用，如实记录启动状态，不伪造链接。缺省表示尚未部署。

`meeting` 是版本级预订会议，由模型生成完整预览、**经人确认后预订**写回：`{title, time, id?, enMeetingId?, link?, attendees?}`——`title` 会议标题；`time` 人读的起止时间（如「10-31(周五) 14:00–15:00」）；`id` 是 `welink-cli meeting create` 返回并在 `meeting info` 读回的 `meetingId`（数字主键，不是 `meetingNo`）；`enMeetingId` 是建会/读回响应里的 eMeeting 侧 32 位主键（写入纪要草稿靠它定位会议，读不到就缺省不猜）；`link` 是 `meeting info` 的 `jumpUrls` 中 `type=basic`（缺省 `summary`）的会议页面地址；`attendees` 是实际传给 `--meeting-user-list` 的工号列表。与会人默认取项目根 `.bw/project.toml` 的 `[chat].group_id` 项目群全部成员（排除机器人/助手），没有绑定项目群时请人提供群号。缺省表示尚未预订；已预订不重复订，改期或取消由人说明后同样先预览再执行。预订/改期/取消后模型按验收技能预订节向项目群发会议通知（独立外部写入，单独预览确认）；通知发送事实不进材料、只在会话回执，`meeting` 字段不为此扩展。写回必须走材料服务（先 `read` 取 `revision`，再 `save --expected-revision`），不直接改文件；板面「验收会议」行读回标题、时间、会议 ID、与会人数与会议页面入口（`enMeetingId` 供会话侧同步纪要使用，板面不显示）。同步会议纪要只把材料纪要按固定样式写入该会议的纪要草稿（经用户自己的浏览器写入，步骤见验收技能的纪要同步 reference，经人确认预览后写入），已写入且未变化的重复执行跳过；最终发送由人在会议系统手动完成。

验收材料可选 `minutes` 节，结构与计划侧同形但**没有闭环位**：`consensus` 为共识若干点（字符串数组），`followups` 为遗留若干点（条目含稳定 id 与 text），`confirmed`/`confirmedAt` 记录人工确认，`sources`/`updatedAt` 可选。正文由验收助手基于板面在线批注与可选会议转写稿提炼撰写，条目按目标组织（带「G<n> ·」目标前缀，读视图按前缀分组呈现，协议仍是平铺清单），仅在未确认时可由模型通道写入或改写；人在界面确认后整节对模型冻结，要改正文须先由人在屏上撤销确认。验收侧遗留条目不另设闭环开关；正文记录落实到计划或结论的结果，或真实跟进 Issue。归档前由助手逐条核对、人在 PR 中确认；关联 Issue 不代表完成，开放 Issue 也可随纪要归档。只有人工确认过的纪要才会被下版回顾读取，读取不自动建任务或排期。`followups[].id` 用稳定身份，人工增删不让既有编号漂移，界面按数组序显示 M1…Mn。

计划材料可选 `minutes` 节承载会议纪要：`consensus` 为共识若干点（字符串数组），`followups` 为遗留若干点（条目含稳定 id、text、closed），`confirmed`/`confirmedAt` 记录人工确认，`sources`/`updatedAt` 为可选的输入来源描述与正文更新时间。正文由计划助手基于在线批注与可选会议转写稿提炼撰写，仅在未确认（confirmed=false 或整节缺省）时可由模型通道写入或改写；人在计划屏确认后整节对模型冻结，要改正文须先由人在屏上撤销确认。`followups[].closed` 是历史人工字段，现行界面不再提供逐条闭环开关；读写继续保留旧值，模型对既有条目按 id 原样往返，新增条目必须 closed=false，不得删除历史已闭环条目。现行正文与验收侧一致，记录落实结果或真实跟进 Issue，归档前由助手核对、人在 PR 中确认。纪要确认不是目标达成或 Issue 完成；生成或填写纪要不自动等于确认。总览直接读取本节呈现，无存储纪要的历史版本如实显示纪要未记录。

candidateRef 仅保存 repository/version/commit，commit 是完整 SHA。preparedArtifacts 含 artifactId/kind/location/candidateRef/generatedAt，可选 command/executionRoot/checksum；kind 为 package（制品包）或 verification（验收证据报告）等。验收证据报告必须在候选固定之后生成登记，location 存 `.bw/planning/<version>/acceptance-evidence.html` 相对路径，随带图片在同目录 shots/。执行根记录在该材料上，不加到 candidateRef。验收树只承载材料，出包从指定源码候选的执行工作区进行。包重出不自动刷新板面已填内容；是否重新部署演示环境、是否重新聚合报告由模型在会话中提醒、人决定，界面不做主动失效或「待重核」呈现；验收件在各 Issue/PR 合入时已留下，包重出不改变它们。

总览与版本索引按 version/workflow/cycleId 各取最新一条当前材料，不扫描旧提交铺旧记录；读取固定来源时核对版本、cycleId 与修订；未合入草稿在其工作区读取；损坏的当前文件如实提示。开始验收会话成功后，页面在固定计划可读且身份核对通过时初始化并保存缺失的空白验收；没有可读固定计划时四区仍可展示，目标留空并由会话处理来源问题。已有材料直接继续；新材料与归档后补证均自动保存。总览不显示发布状态。

workflow 是模型写入材料的 SOP 进度节：`stage` 记录最近完成的阶段（计划 preparation/goals/breakdown/review/archive；验收 preparation/showcase/archive），`updatedAt` 记录写入时间，`archivePr`（provider/repository/number）在归档 PR 开出后补上，验收侧另有 `release`（仅 tag）在发布执行后作为读回键补上。**两屏都不渲染旅程灯**：板面顶部旅程是同页定位导航，与 stage 不同名也不映射；stage 只供会话恢复校准与自动化读取。stage 是进度信号不是完成权威：不代表目标达成、不代替人工结论、不代表 PR 已合入；PR 合入状态由界面按 archivePr 向 provider 薄读取显示，读不到保持未知。纪要的人工确认是材料字段事实，不占 stage。会话恢复时先把 stage 校准到实际进度；内容实质调整使后续阶段失效时回退。界面不提供修改 stage 的入口，它只经材料保存写入。**发布读数不落材料**：`workflow.release` 只存 tag 读回键（同 archivePr 的「引用落材料、读数现算」），是否已发布、发布时间、Release 地址与资产由验收屏按该键向 provider 现算读回；正本在 Git 标签与 provider Release 页，模型发布后在会话中如实报告读回结果并写入该键，此外不写入材料。归档提交固定落在该流程的本版固定分支（绑定版本树：计划 bw/<版本>/plan、验收 bw/<版本>/acceptance；旧无绑定固定树：bw/week-plan、bw/week-acceptance）上，PR/MR 由该固定分支开向主分支，不从其他分支或新建工作树归档。

## 写入与人的决定

连接和执行沿用 Orca；宿主提供 repoId/worktreeId/hostId，分别绑定对应流程的本版固定树（绑定版本树或旧 bw/week-plan、bw/week-acceptance），页面还使用原生 runtimeOwnerEnvironmentId 选择配对宿主。不能由模型传文件根替代原生身份，也不把 SSH 路径交给客户端本机文件 API。

实际工具为 `ORCA bw materials context/select/list/read/save/add-artifact/schema`，共用 `--repo-id <id> --worktree-id <id> --workflow plan|acceptance`，host-id 在所选 runtime 内解释，默认 local；SSH 工作树使用宿主提供的 ssh: 身份。list 不需要版本，只有列举作用；read 需要 `--version <已确认版本>`，返回 document/revision 或 null。save 再传 `--input <JSON 草稿文件>` 或 `--input-stdin`（二选一）；SSH 会话通过标准输入传 JSON，由 Orca 原生 CLI bridge 转发，不把远端草稿路径交给客户端读文件；更新必须使用刚读到的 `--expected-revision <revision>`，明确新建用 `--create`，二者互斥。add-artifact 只用于验收材料，再传 `--kind <kind> --location <工作树相对路径>`，可选 `--artifact-id/--command/--checksum`：一条命令在拥有工作树的一侧完成制品登记——文件必须真实存在（不存在如实报错，mtime 作 generatedAt），candidateRef 复用材料现有值（候选未固定报错），同 artifactId 覆盖而非追加，写走同一事务核，revision 冲突自动重读重试一次、仍冲突报 currentRevision；命令不收文档，人工字段按构造原样往返。结构通过 `ORCA bw materials schema --workflow plan|acceptance --json` 读取（随 CLI 打包，无需 BW 源码或运行中的应用）；跨字段约束仍由 save 校验。

冲突命令以非零状态返回 revision-conflict 及 currentRevision，原材料和输入草稿保留；重读并合并后重试，不循环覆盖。页面走同一 runtime RPC，直接编辑自动保存；「更新代码」先把本屏工作树快进到主干最新、再重读宿主材料和版本候选并保留未保存输入，快进不了时保持原样并提示交会话处理、材料仍照常重读。文件保存不自行采集指标或验证人的身份，存入 reading/decision 字段不能据此点绿灯，业务消费方必须核对真实来源。

人工字段守卫保护：计划 `summary.risks` 与计划 minutes 的人工标记（confirmed/confirmedAt 及 followups[].closed；已确认时整节冻结，未确认时模型可写正文）；验收 `results[].decision/note/nextStep/issueNotes/issueMarks`、验收 minutes 的 confirmed/confirmedAt（已确认时整节冻结，未确认时模型可写正文）；以及旧格式材料的全部只读字段（轮次、会议指导、风险标记、目标级交付件与材料链接、目标级进展、材料备齐核对记录等）。模型/CLI 只能原样往返这些人工值；新增非空值、修改或删除均会被拒绝，不能用直接编辑文件绕过。验收材料的 planRef 必须是 kind=committed，模型不得用草案计划创建或改写验收。写入材料的文本字段保持周整：分段换行、多条用序号或短横线列举，不把多件事挤成一段。

先读 revision，再走同一材料服务 save(expectedRevision)；校验受信任工作树和流程白名单、路径、跨进程互斥、原子替换。不同分支不是一个写入路径。冲突保留双方输入并重读合并；不直接覆盖文件绕过服务。

保存、评审、归档、目标达成和正式发布分别成立。人的决定绑定对象/修订/来源/时间，模型不代签。`decision.outcome` 只有 `met` 与 `not-met`，由人在界面行尾单个状态标识选择（未判定/达成/不达成；未判定即字段缺省，不冒充、不推定）。`decision.source` 记「验收界面人工确认」，`reason` 取该目标的 note——行尾状态选择不采集原因文本，不达成的原因与安排的正本是纪要、nextStep 与 Issue 备注。`decision.materialRevision` 是该目标证据账本（候选、交付包、报告、演示环境、本目标承诺与关联 Issue 快照）的确定性修订投影，只是账本字段：界面不据它渲染陈旧态或「待重核」，证据是否变化要重核由模型在会话中提醒、人决定。摘要只检测证据变化，不证明签署人的身份，Issue 关闭数不自动决定目标达成。旧认可和归档不可直接覆盖新修订。归档在会话中发起：核对材料与结论状态后更新 stage=archive、按项目门禁提 PR、开出后写入 archivePr 并回显链接；界面没有直接执行归档的按钮，归档后补证直接在原会话继续处理。发布由界面一个按钮注入请求，预检、一致性核对、知情授权、执行与独立读回都在会话中完成，发布后把 tag 引用写入 `workflow.release` 供板面现算读回；后续执行遵从授权，不自动合入、完成 Issue 或发布。

Issue 关联以固定 plan.tasks 的完整任务身份与 goalId 为准，不能仅凭快照自己声明的 goalId。同一事实的刷新或列表重排不构成材料改动。未关联目标的 Issue 仍进入报告，不影响单目标结论；未记录与已记录空集分别呈现。
