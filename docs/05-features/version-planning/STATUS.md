# 版本计划 — 当前状态

> 当前在开发 worktree codex/version-planning 内维护 Skill、固定 HTML 和数据文件。用户已认可页面可以开始试用，改为与本会话逐屏实战填写 v0.4；v0.3 保留为历史资料，BW/Orca 接线已纳入本次功能 PR。

## 当前文件

- 开发树：E:/zhuyu/code/builder-workbench/.bw/worktrees/version-planning。
- [Skill](../../../standard/skills/week-planning/SKILL.md)：修改原有 week-planning，未另建并行 Skill。
- [出厂 HTML](../../../standard/skills/week-planning/assets/version-plan.html)、[空数据模板](../../../standard/skills/week-planning/assets/data-template.json)、[纪要模板](../../../standard/skills/week-planning/assets/minutes-template.md)：随 Skill 开发的交付资产，不是一次性设计演示。
- 项目 HTML 入口（本机路径 `E:/zhuyu/code/builder-workbench/.bw/worktrees/week-plan/.bw/planning/template/version-plan.html`）：服务刷新生成的离线只读缓存，可由 JSON 随时重建，Git 忽略。
- v0.3 内容（本机路径 `E:/zhuyu/code/builder-workbench/.bw/worktrees/week-plan/.bw/planning/v0.3/data.json`）、v0.4 内容（本机路径 `E:/zhuyu/code/builder-workbench/.bw/worktrees/week-plan/.bw/planning/v0.4/data.json`）：从原实战树原样迁入，迁移前后 SHA256 一致；v0.4 已有回填，未重置。
- [本次 Orca 提示词](orca-task-prompt.txt)、[填写说明](manual-review.md)位于本特性文档目录，不随 Skill 分发；验证报告由统一 PR 入口生成并发布至 PR Review。

## 交付包与开发文件

`standard/skills/week-planning` 仅保留 Skill、三份 assets（固定 HTML、数据模板、三节纪要模板）、两个运行脚本（planning.py、eMeeting 转写脚本）、两份按需读取的 reference，以及现行产品仍在调用的评论格式校验脚本。构建用 JS/CSS、构建器和验证器在 [`scripts/version-planning`](../../../scripts/version-planning/README.md)；BW 的实际版本数据与来源只留在项目 `.bw/planning`，不放进出厂包。忽略规则不属于业务资源。

模板、数据样例与工具留在 Skill 安装目录，不拷入项目树；每版只存 `<版本>/data.json` 与 `deliverables/`、`reviews/`。项目树 `template/version-plan.html` 是服务刷新生成的离线缓存，可随时重建、Git 忽略。data.json 是唯一内容正本，确认只记录状态、不生成快照；归档只提交版本目录与共享忽略文件，本机 `.local` 不入库。详见 [数据契约](../../../standard/skills/week-planning/references/data-and-runtime.md)。

本轮修复了脚本字符串中结束标签提前关闭 HTML script 元素的问题，并清除了此前构建遗留在脚本后的源码。验证直接解析最终 HTML，检查脚本完整性并让 Node 校验提取出来的脚本；不仅检查独立 JS。SE 样式和实际版本 JSON 未修改。

## 当前行为和边界

模板内嵌 SE 样式，不依赖 BW 加载。Skill start 返回本地 URL，用于切版本和手工填写；直接打开 HTML 为离线只读。没有资料时由 Skill 建立 default，版号确定后保留内容并刷新同一页。页面通过服务停顿自动写入 JSON，无目录授权；失败或断线保留输入并提示。页面已无来源说明折叠与会议链接输入。当前不改 v0.3。第一屏标题为“上周版本结果”；结果目标卡保留编号、一句目标、进度条及实际值 / 目标值与结果标签；计划目标卡只保留编号与一句目标。期限默认该版本，负责人默认 Builder，真实工作进展放任务区。

原 8876 方案已废弃；经用户重新确认，现将最小 HTTP 服务集成进 Skill 原 planning.py，使用自动分配端口和工作树服务记录。页面确认只写本地确认记录；eMeeting 转写脚本与三节纪要模板已内置为默认配置，纪要整理与 PR 由后续会话执行。本次交付功能 PR，复用 BW UI 组件并更新原定版本计划自动化。

浏览器工具已看到旧 HTTP 页的空数据/只读问题；本地文件 URL 被工具策略阻断，未绕过。目前 HTTP 往返、磁盘读回、模型更新、冲突拒绝、进程生命周期及真实浏览器输入保存检查通过；最终填写易用性由用户继续验收。代码/文件检查不等于用户手填可用性已通过。

此前把交付资源长期放在 visualizations，并以后台文件检查代替视觉检查，是本轮返工原因。现在运行和构建都使用本 worktree 资源；不再维护 visualizations 版本。历史对话的旧链接不再作为入口。

## v0.4 第一屏实战

用户明确 v0.3 属于旧流程，目标在 Issue，故本次 previous_version 指向 #174 的目标评论和来源快照，不引用重建的 v0.3 数据作为正本。此前将原评论 11 项工作直接当目标，评审指出仍然混淆了目标和任务。来源保留整体目标原文，卡片缩为一句（没有历史衡量口径，不编数），11 项进入任务区，无法证实的 G1–G11 父目标映射已清空。任务中的总览与版本模型分别核对提交 2da1956、ea05ad0 已包含在当前基线 f592fa7，未据此判断目标达成或用户验收。旧 CodeHub MR 元数据未取得，不用 GitHub PR 列表冒充完整历史。

反馈：此前归并目标并用“有进展报告”填读数混淆了原承诺、任务进展和量化结果。已修订 Skill 和字段说明；SE 样式、v0.3 数据保持不变，第二、三屏不提前填写。

## 当前三屏与采集状态

第二、三屏共用简洁 plan.goals 卡片（编号 + 目标句，不显示目标值/进度）；第二屏先与 Builder 拟定，再带去 Leader 评审。第一屏另有实际读数与结果。版本交付件独立在任务前；任务不再显示交付件、批注、额外状态，第一屏只列有真实 Issue 编号的任务，第三屏允许待建草稿，最终确认要求真实编号和链接。会议版确认改由会话执行 `confirm --stage review_ready`；页面不再导出会议评审 HTML。

类型按 Bug/Feature 标签，缺标签默认 Feature。目标按 `【v0.4|W38|G1】` 解析，排期按 bw:plan，遗留保留原标签与原目标身份。只读 collect-issues 提供 GitHub 分页采集和规范化 JSON 输入，不替用户提交或改远端。现有未排期、遗留、Bug 的纳入提醒已进 Skill。

会话先只显示真实标题；当前尚无可复用 Orca 会话列表读取接口。总览/计划的目标与结果摘要已经改读同份 JSON；不双写目标评论。历史会话列表仍待可用读取接口；JSON 消费者已接入并有真实文件读回检查。

功能实现不重写 v0.3/v0.4 真实数据，也不创建计划任务 Issue；功能 PR 与用户后续计划归档 PR 分开。原无编号历史工作项保留数据来源，不再作为真实 Issue 展示；已有用户填写仍在原 JSON。

实际版本材料已原样迁到主项目的 .bw/worktrees/week-plan/.bw/planning，功能 PR 不含未确认版本内容。专项浏览器/部署检查已通过；完整 PR profile 和远端审查结果以验证 Review 为准。

2026-09-17 本机真实 BW 打开 workbench 后完整分发 Skill，创建定版本计划任务；重启后沿 automation.update 更新，读回确认仅一条、同 ID、同调度/启用状态/agent，workspaceId 指向 bw/week-plan。没有触发模型运行，用户后续从原任务“立即运行”开始真实旅程。
