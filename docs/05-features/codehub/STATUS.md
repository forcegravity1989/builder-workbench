# STATUS — CodeHub 适配

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-10-26）**：任务来源、任务页和计划 / 验收读写已在本分支。intent / spec 从提交回写，**待人 gate**。没有可点原型。2026-10-22 MR 详情补检查项（`mr gate`）与文件变更（`mr changes`）页签，样式复用 GitHub PR 页组件，单测与门禁随提交重跑；真壳人工核对通过（2026-10-22，用户在 Workbench 壳内确认检查项与文件变更显示正常）。2026-10-26 评论样式对齐 GitHub 弹窗并按真机反馈修正（见下方评论样式对齐一行），真壳人工核对通过（2026-10-26，用户确认）；同日补行评论内联显示修复与议题标签编辑（见下方行评论内联显示与标签编辑一行），行评论内联显示真壳人工核对通过（2026-10-26，用户确认），标签编辑按用户反馈补项目标签下拉勾选，真壳核对待用户执行。其余环节数据未重跑。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ◐ | 草案 [intent.md](intent.md)。来源 `05dfa7455`、`b0005c098`、`7ca46d402` |
| 2 spec | ◐ | 草案 [spec.md](spec.md)。缺可点原型，规格 gate 未过 |
| 3 实现设计 | ◐ | 行为散落在 [ref/upstream.md](../../../ref/upstream.md) CodeHub 节、[codehub-cli 指南](../../03-guide/codehub-cli.md)、验收规格里的版本目录规则。无特性级 design |
| 4 TDD | ◐ | 存量单测文件在；2026-10-26 交付改断言/mock 后重跑通过。见下表 |
| 5 验收点 E2E | ○ | C01–C12 已定义。上游写明平台请求用模拟边界，不能代替内部 CodeHub 实机 |
| 6 用户旅程 E2E | ○ | CJ01 已定义，未执行 |

## 验收点与旅程矩阵

口径：◐ = 主路径有实现和单测文件，没有真实 CodeHub 或真壳证据；◑ = 在 ◐ 之上真壳人工核对通过；○ = 未执行。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| C01 自动切到 CodeHub | ◐ | 任务页 provider 状态、`task-providers.ts` | 单测覆盖注册与加载范围；真壳未看 |
| C02 未加载完不说成没有 | ◐ | CodeHub 列表加载 | 同上；文案键变更见 upstream |
| C03 先评论再关闭 | ◐ | `src/main/codehub/issue-state.ts` | `issue-state.test.ts`；未对真实站点读回评论 |
| C04 无草稿 / 无 Mark ready | ◐ | HostedReview 创建与状态动作 | 组件测试使用模拟；未看真实 MR |
| C05 未安装 CLI | ◐ | 预检报 `{ installed, authenticated }`（#323 起与 `gh` 同口径） | `preflight-host-cli-status.test.ts` 锁定探测顺序 |
| C06 周期里按项目路径打开 | ◐ | `src/renderer/src/workbench/task-port.ts` | `task-port.test.ts`；未从计划屏点进真实详情 |
| C07 归档保持未知 | ◐ | `src/main/workbench/archive-pr-status.ts`（CodeHub/非 GitHub 一律 unknown；2026-10-13 起原 archive-source-gap/archive-port 接缝已随合入证明链退役删除） | 未在 CodeHub 仓库上看见未知原因 |
| C08 基线版本目录可选 | ◐ | `version-history-service.ts` 的 `treePlans` | `version-history-service.test.ts` 有「无 provider 合入也列出 data.json」；真壳未选过版本 |
| C09 MR 检查项显示 | ◑ | `src/main/codehub/mr-reads.ts`、`task-page/codehub/ChecksTab.tsx` | `codehub-mr-detail.test.ts` 锁定状态映射、`mr-reads.test.ts` 锁定命令形状；真壳人工核对通过（2026-10-22） |
| C10 MR 文件变更显示 | ◑ | `task-page/codehub/FilesTab.tsx`（patch 重建两侧，复用 `PRFilesCombinedDiffBody`） | `codehub-mr-detail.test.ts` 锁定 patch 解析与重建行号→真实行号映射；真壳人工核对通过（2026-10-22） |
| C11 无流水线 MR 空态 | ◐ | `mr-reads.ts` 的 `--jq '.checks'` 空输出映射为空列表 | `mr-reads.test.ts` 有 null 投影用例；真壳未专门构造无流水线 MR 覆盖 |
| C12 文件行评论 | ◑ | `FilesTab.tsx` 行号换算后提交，`comments.ts` 行级命令；读侧 position 回退与过期跳过（2026-10-26） | `comments.test.ts` 锁定 `--path/--line/--start-line/--severity` 命令形状与 position 回退；本机 CLI 对真实 MR 实发行评论（severity 必填验证）并删除成功；真壳人工核对通过（2026-10-26，用户确认行内卡片显示正常） |
| C13 议题标签修改 | ◐ | `mutations.ts` 的标签整组替换命令，`IssueProperties.tsx` 弹层编辑（项目标签下拉勾选 + 键入新名，2026-10-26） | `mutations.test.ts` 锁定命令形状（含空集以单空格清空）、`repo-reads.test.ts` 锁定 `project label list --limit 100` 名单命令；对真实议题实测替换与清空、新名保存时自动创建为项目标签（默认蓝色），验证后测试标签已从项目删除；真壳未核对 |
| CJ01 关闭后重启仍为关闭 | ○ | 任务页 + CLI | 未执行 |

相关单测还有 `src/main/codehub/mutations.test.ts`、`work-items.test.ts`、`comments.test.ts`（评论展平、线程回复与删除命令形状）、`src/shared/codehub-mr-detail.test.ts`（gate 状态映射、changes 字段映射、patch 解析）、`src/main/codehub/mr-reads.test.ts`（mr gate / mr changes 命令形状与 jq 投影）、`src/main/github/issue-update.codehub.test.ts`（GitHub 更新不因旁边有 CodeHub 远程而改道）。

实机证据（2026-10-10，project-intake 名片链复用同一 CodeHub 能力）：克隆前名片预读读侧（repo-reads）对两个内源 host 实机验证可读（修复 --jq 引号假 absent 后）；createCodeHubMr 打包实跑在真实 CodeHub 仓验证可开 MR（应用内曾出现一次瞬时失败，错误信息未留存，排除法定位；查重/创建命令现均实测通过）。

评论读回（2026-10-20，评论显示 / 删除修复）：`mr review list` 展平 discussion 内嵌 notes 后，对真实 MR 实读 3 条评论、issue 路径 1 条，系统流水被过滤（该过滤口径已于 2026-10-26 被用户裁定推翻，见下方评论样式对齐一行）；删除与线程回复命令形状由单测与本机 CLI `--help` 锁定，未对真实 MR 执行删除或实发回复。独立评论的回复寻址（单评 discussion id）与 `#note_<id>` 网页锚点未在真实 CodeHub 验证。

评论样式对齐（2026-10-26，#425）：评论卡片对齐 GitHub 弹窗——头像、`from_robot` 真实机器人计数与人／机器人筛选、文件行号锚点、Markdown 正文；已解决线程按用户裁定不折叠、直接展开带「已解决」徽标；系统流水笔记（如 changed this line）随线程像普通回复展示（推翻 2026-10-20 的过滤口径，用户 2026-10-26 裁定）；回复提交成功后收起输入框。真壳人工核对通过（2026-10-26，用户在 welink-claude-bridge MR 29 确认系统流水两条可见，回复收起与已解决展开正常）。文件变更页行评论同日接线（此前加号点击提交无动作）：界面重建行号按补丁 hunk 头换算成新文件真实行号后走 `mr review create --path --line`，行级评论走评审接口、服务器必填严重级别（空值报 CH.00406030），默认发最轻的 `suggestion`；成功后评论进对话页签并以行内卡片显示。单测锁定换算与命令形状；本机 CLI 对真实 MR（welink-claude-bridge iid 3）实发一条行评论并删除验证通过，BW 界面发评论待用户核对。已知边界：远端执行主机上的仓库评论由远端 BW 取数，远端版本未升级前数据不带新字段（头像／机器人／已解决），本机修复不影响其显示内容；行评论的锚点参数同理会被远端旧版剥离、降级为普通评论，直至远端升级。

行评论内联显示与标签编辑（2026-10-26，#425 追加）：行评论提交成功后此前只进对话页签、行下不显示卡片，根因是 szv-open 站点返回的行评论顶层 `file_path`/`line` 为空、锚点在嵌套 `position` 对象里，读侧只认顶层（dg-g 站点填顶层，故早前验证通过）；读侧改为顶层优先、`position` 回退，并透传 `is_outdated`，锚点过期的评论照 GitHub 口径不进内联、只留对话页签。真壳人工核对通过（2026-10-26，用户确认行内卡片显示正常）。议题详情补标签编辑（#425 遗留项）：属性区弹层内当前标签以标签片逐个移除、下拉列出项目自有标签供勾选（`project label list`，`--limit` 默认 10 且不翻页，取 100）、也可键入新名字（回车或逗号落格），保存即整组替换；`--labels` 空串被 CLI 视为未传参（报「至少要一个更新字段」），清空以单空格实现。替换语义、空格清空与新名保存时自动创建为项目标签（默认蓝色 `#428BCA`）均对真实议题实测（welink-claude-bridge #1，自测单，验证后已关闭，测试标签已从项目删除）；下拉勾选为用户核对基础版后要求的补齐，真壳核对待用户执行。2026-10-27 追查用户指出的 bw:status:inreview（关联 bridge，innersource/AI-Coding_G/bridge，#58/#51）：CodeHub 标签分项目/组两级，bridge 的 bw:* 全族为项目级（16 条项目标签，下拉本就覆盖），welink-claude-bridge 仅 6 条项目标签、bw:status:todo 在其上只是 innersource 组池（95 条）的组级标签；`include_ancestor_groups` 服务端不认。用户裁定共享组池不进下拉，名单维持只取项目级；组级标签键入名字可直接打上（实测 bw:status:todo 与项目标签混存一次保存），不进下拉不损失该能力。
