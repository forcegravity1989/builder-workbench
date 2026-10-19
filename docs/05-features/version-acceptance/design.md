# 版本验收实现设计

> 给实现与技术评审者动代码前读；本文管对象、数据边界、组件复用和异常语义。用户行为以 [spec](spec.md) 为准，共享壳层与计划边界见 [计划设计](../version-planning/design.md#共享边界)。落地后同步 06-module。本文只描述当前有效方案，不保留被替代的形态或过程记录。
>
> 状态：v9.5 形态已由用户于 2026-10-18 确认，本文是生产实施输入。批次 A 先落 schema 与守卫，之后再落两屏组件；材料增量字段全部可选，旧材料不迁移、不改写。

## 设计边界

AcceptancePage 是 Workbench 业务页，复用 Orca 原生项目、工作树、会话、任务详情、文件打开、Automations 和指标执行能力。BW 只保存版本材料、轮次和人工输入，不复制 Issue、PR、指标或会议转写的正本。计划屏与验收屏共用 GoalCard、Issue 子块、材料块和会话壳层；页面拥有的差异只在于计划输入与验收结论。

计划固定在 `bw/week-plan`，验收固定在 `bw/week-acceptance`。运行身份由 projectId、repoId、hostId、workflow、runId 和 cycleId 组成，版本由人明确选择。页内不按标题、日期或上次打开项推断版本，不建立第二套会话绑定或业务数据库。VersionDocumentPort、TaskPort、ArchivePrPort、MetricsPort 和材料自动保存沿用计划侧已有接线；不修改 Orca 核心。

## 材料对象与兼容读回

Acceptance 材料继续使用 `schema_version=3`、`identity`、`planRef`、`candidateRef`、`preparedArtifacts`、`results`、`taskSnapshot` 和 `workflow`。本轮只增加可选字段：

- `results[].materials?: Array<{ label: string; url: string }>` 是目标级材料入口；已有 `deliveries` 继续按旧语义读回。
- `results[].rounds?: Array<{ id: string; week: string; kind: 'progress' | 'final'; closedAt?: string; snapshot: { goals: Array<{ goalId: string; decision: string; progress: string; next?: string }>; issueMarks: Record<string, { carry?: boolean; risk?: boolean }>; issueNotes: Record<string, string> } }>` 固化每轮人工输入。
- `results[].meetingDirectives?: Array<{ id: string; text: string; tag: 'resolved-this-acceptance' | 'next-week-plan' | 'record-remaining'; goalId?: string; status: 'pending' | 'confirmed'; source: 'transcript-summary' | 'manual'; sourceRef?: string; confirmedAt?: string }>` 保存会后指导与遗留。
- `results[].issueNotes?: Record<string, string>` 和 `results[].issueMarks?: Record<string, { carry?: boolean; risk?: boolean }>` 保存当前轮 Issue 级备注与标记。
- `taskSnapshot[].labels?: string[]` 保存 provider 返回的分类标签；有 `Bug/缺陷` 标签归 Bug，其余有标签默认归 Feature，无标签才归未分类。

计划材料保留现有目标、任务、指标和 `workflow`；任务引用的 provider/repository/number/goalId 仍是 Issue 正本。所有新增字段使用 Zod `optional()`，嵌套字段也只在出现时校验。旧材料缺字段时按一个当前轮、无指导、无 Issue 备注/标记、无目标级新增材料读回。读回不触发迁移或隐式保存，保存只在用户或获授权的模型流程明确写入时发生。
验收树从项目主干基线创建；运行时不硬编码 bw-orca 或 main。每次新运行刷新远端并检查树的干净状态、前次归档与基线差异（现状注：脏树/未归档提交检查为提示级，由会话承担，无代码强制校验落点）。已有脏改动/未归档提交不 reset、不搬树、不强推，恢复该次工作或呈现冲突。先回显固定工作区与现有材料；进屏不做任何 Git 动作，页头「更新代码」经 workbench.trunk.update 把固定树快进到主干最新（fetch 书签 → 双向对比 → merge --ff-only；快进不了保持原样、统一中文提示交会话处理、材料仍照常重读；纯草稿状态不是异常、不提示；远程 SSH 树暂不自动同步，属只读中继边界），已有同分支其他路径提示真实路径，不擅自删除重建。

## 轮次与重启

当前材料代表可编辑轮次；每次周五进展刷新或展示验收结束，模型在会话中把当前人工输入复制到 `rounds`，写入 `week`、`kind`、`closedAt` 和完整 snapshot，再创建下一次当前轮。模型新增的历史 snapshot 只能逐字段复制当前材料，不能制造新的结论、Issue 备注或标记；每个结果只写一个与该结果 `goalId` 相同的 `snapshot.goals` 条目，`decision` 缺省为 `pending`、`progress` 缺省为空字符串，`next` 为空时省略，`issueMarks`/`issueNotes` 逐字复制当前结果。新轮需要沿用时仍保持待核，不能把旧结论变成新轮确认。轮次不由自然周自动推断，`week` 是模型在确定轮次时写入的协议值。

界面按周列出轮次：当前轮可编辑，历史轮只读。历史材料从固定验收树的 Git 读回，页面以材料中的轮次和 commit 身份呈现，不把最新 Issue 或指标状态覆盖旧快照。重启后只从材料和 Git 重建当前轮、历史轮、备注、标记与待确认指导；内存状态、缓存和页面顺序不作为正本。

## 共用 GoalCard

计划和验收使用同一 `version-cycle/GoalCard` 骨架，目标卡是页面的主要信息单元：

1. **结论行（收起态）**：数据推导的结论灯、G 编号与目标、负责人、Issue 计数、遗留/风险标记和结论选择。无数据的灯、计数和标记显示 Unknown/空，不以组件默认值补绿。
2. **故事行（展开态）**：横排三格「约定交付｜进展｜材料」。计划侧显示既有 deliverable/acceptance、deadline/owner 和唯一的目标级 progress 输入；验收侧 progress 与材料依据来自当前轮结果；存量 `deliveries` 只读回显并通过材料位置打开。旧 `reason` 只作为兼容读回，生产编辑入口统一为 progress。
3. **指标行**：计划卡允许从项目目录添加/移除承诺、编辑本版目标并展开定义与采集依据；验收卡只读呈现承诺、读数和来源状态。刷新读数/目录及会话配置沿用现有指标能力。没有承诺或读数时保持 Unknown，不把缺数据点绿。
4. **Issue 子块**：按 provider labels 分为 Bug 类、Feature 类、未分类三组；有标签但没有 Bug/缺陷标签的 Issue 默认归 Feature，无标签才归未分类。每行呈现原生状态、标题、assignee、内联备注和 carry/risk 标记。开放/遗留以黄色、风险以红色显示，颜色只来自真实状态和人工标记。Issue 详情仍由原生 TaskPort 打开；不保存 Issue 正文快照。
5. **未达下一步与会后指导**：未达目标显示 next；会后指导位于页面底部独立块，不在卡内另造“遗留汇总”或注入按钮。

计划卡的 deadline/owner 从既有计划字段读取；计划拆解入口放在目标卡 Issue 子块中，要求新 Issue 使用 Bug/Feature provider 分类标签。验收卡 owner 只读，Issue assignee 只读 provider 值。两屏不提供板内搜索、页顶摘要计数行、全量 Issue 快照区、双面切换或独立周报/导出屏。
出包区块是一条协议两个宿主：`workbench.package.list/latest/launch/download`（shared/workbench/package-pipeline.ts）由 scope 解析出工作树后按远端身份分派（package-pipeline-runtime）——CodeHub 远端分两面：执行面（list/launch）走本机 cloudbuild CLI（cb，cloud-dragon-cli-ops；launch 语义 = 按流水线名找 ID，再按 pr_pipeline 执行方案启动，与页面链路一致），制品面（latest/download）走 CloudDragon 浏览器会话（主进程常驻 Playwright，cloud-dragon-session；CLI 无制品仓库能力，页面选择器经真实页面验证）；其余（GitHub）走本机 gh CLI（github-package-ops）。界面与协议不感知宿主差异；SSH 宿主拒绝出包（依赖本机登录态与工作树）。GitHub 侧的识别规则：仓里文件名以 `bw-package` 前缀开头的 Actions workflow 即出包流水线；最新包读 releases 列表端点而非 `/releases/latest`（后者跳过预发布）；下载只取安装包本体，排除更新器元数据（yml/blockmap/json）。启动经 launchInFlight 互斥，双击不重复触发；最新包每分钟静默刷新，出包灯只随真实包数据点亮，不写 workflow.stage。

## 会前、会中、会后

三种使用姿态看同一块板，不新增模式或路由：

- **会前**：目标卡展开，核对约定交付、进展、材料，刷新指标，查看出包区块并在 Issue 行写备注或标记。
- **会中**：全部收起，只看结论行；讲到目标再展开。预览纪要由当前材料派生，只读且可复制。
- **会后**：补 next、确认人工结论、处理指导与遗留，在会话中发起归档。人合入后，页面从 Git 读回历史轮次。

出包区块继续与 `AcceptancePackage` 同构并可收缩；出包事实只点亮出包灯，不写 `workflow.stage`。归档行按 `workflow.archivePr` 薄读取 provider 合入状态，读不到保持 Unknown，不阻塞继续编辑或开下一轮。

## 会议指导与遗留 SOP

会后 `version-acceptance` Skill 负责把会议 ID、转写稿定位、目标和 Issue 上下文交给已有会议转写来源，再要求独立 subagent 总结「会议指导与遗留」。总结结果必须明示 AI 来源、`sourceRef` 和 pending 状态；主会话不代替 subagent 总结，不把模型文字当人的决定。用户逐条确认、删除或人工补记后，才把 `status=confirmed`、`confirmedAt` 和可选 `goalId` 写入材料。tag 只有三种：本次验收已解决、纳入下周计划、记录遗留。

当前仓内没有可直接调用的 eMeeting 音频转写脚本；`wsl-transcript-*` 只处理会话文件系统通道。SOP 因此只消费 issue #374 或项目会话实际提供的转写稿，拿不到稿件就呈现 Unknown/待补来源，不声称应用内已完成语音转写。转写获取、总结、逐条确认和材料保存是四个不同证据边界。

## 人工字段守卫

`material-human-guard` 在 `clientKind === undefined` 的模型保存通道上保护人工字段。保护清单包括 `results[].decision`、`results[].deliveries`、`results[].progress`、兼容旧字段 `results[].note`、`results[].nextStep`、`results[].issueNotes`、`results[].issueMarks`、`results[].meetingDirectives[].text` 以及已确认指导的 `status/confirmedAt`。模型可以新增只复制当前人工字段的轮次结构，以及带非空 `sourceRef` 的 `source=transcript-summary`、`status=pending` 指导，但不得修改或确认人的结论、备注、标记和已确认条目。人工 UI/明确的人工客户端保存才允许这些字段变化；校验失败整次保存拒绝并保留现有材料。

## 材料打开、指标和异常

目标材料链接优先交给当前工作区的 Orca 浏览器能力；没有可用工作区浏览器时按现有 `shell.openUrl` 或 `openFilePath` 处理，失败显示具体恢复提示，不新增浏览器核心。指标仍经 `MetricsPort.list/read/refresh` 读真实来源，卡面只读；刷新失败显示 Unknown/失败原因，不回退旧读数冒充当前值。

计划、验收和历史读取都保留材料事务的 expectedRevision、原子替换、跨进程互斥和工作树身份校验。保存冲突保留用户输入；候选、计划修订或 Issue 快照改变只使受影响结论待核，不自动清空或确认。归档 PR 状态遵循 `ArchivePrPort`：GitHub 走既有 gh 读回，CodeHub 走 `codehub-cli mr view`，远端身份不一致、状态异常、权限/网络失败均为 Unknown；不以 PR 合入替代人的完成确认。

## 调研结论与实现落点

- **R1 守卫**：模型保存在材料 RPC 进入 `material-human-guard`，当前只保护结论/风险；本轮扩展到上述人工字段，保存服务和 CLI 继续复用同一入口。
- **R2 材料**：目标已有 `deliveries`，没有显式目标材料数组；新增 `materials` 为可选字段，URL 打开沿用既有 DeliveryDetails 能力，不做迁移。
- **R3 Orca 浏览器**：原生 store 已有工作区浏览器 tab 能力，`shell.openUrl` 是系统回退；生产只做 BW 侧路由，不改 Orca 核心。
- **R4 RPC**：读写统一走 `workbench.materials.*`、版本材料服务和原子事务；schema 扩展不另造通道。
- **R5 指标**：现有 `useAcceptanceMetricWindow` 是指标端口 hook，不是独立页面；保留 list/read/refresh 数据协议，移除卡面编辑器并把状态压成一行。
- **R6 CodeHub**：`codehub-cli` 已有 project/host 参数和 `viewCodeHubTask` 接缝；归档状态按 MR 读取，身份不符或读失败 Unknown，重复刷新使用短缓存/并发合并。
- **R7 收折**：`usePlanColumnResize` 已控制 BW 右板列宽并派发 fit 事件；在同一壳层增加持久化 collapsed/narrow rail，终端保持挂载，不改 Orca 内部 pane。
- **R8 转写**：仓内没有 eMeeting 获取脚本，既有 WSL transcript 是会话文件通道；SOP 只接 issue #374/项目提供的转写稿，缺稿不编造。
- **R9 分类**：原型与生产按 `Bug/缺陷` 标签归 Bug，其余有标签归 Feature，无标签归未分类；生产 task snapshot 以可选 `labels` 补齐，旧快照无标签仍归未分类。
- **R10 全量任务**：独立任务区已移除；TaskPort 仍负责单项详情读回与打开，计划/验收只在目标卡 Issue 子块内呈现关联任务，快照只作为卡内状态来源。

## 验证边界

协议纯函数、旧材料 optional 解析、轮次固化和人工守卫用 Vitest 覆盖；新增测试只覆盖核心算法或与真实旅程强相关的数据协议。lint-staged 使用工作树可运行的 node 直调，提交因 junction 中 husky 不可运行而使用 `--no-verify`，并记录等价门禁。生产 UI 需按目标卡、周/轮次、指导确认和收折路径做真壳验证；本次用户明确不启动真壳和 CI，未运行项保持缺口，不能把原型或 DOM 结果写成真实 Electron 证据。
