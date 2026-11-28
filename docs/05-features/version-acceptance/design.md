# 版本验收实现设计

> 给实现和技术评审者读取。本文只保留当前模块边界、材料契约、原生复用和验证接缝。行为见 [spec](spec.md)，用户结果见 [intent](intent.md)，证据见 [STATUS](STATUS.md)。不保存历史交付流水。

## 模块边界

版本验收页面位于 `src/renderer/src/workbench/version-acceptance/`，通过 `version-cycle` 接入项目、版本、材料、任务、会话、浏览器、归档和发布状态。Orca 负责原生会话、工作树、Tasks、Automations、宿主身份和权限。BW 只保存验收材料和人工输入，不复制 Issue、PR/MR 或会议系统正本。

| 区域 | 责任 | 主要落点 |
| --- | --- | --- |
| 页面与导航 | 四区布局、开始卡、会话收折和对象动作 | `AcceptanceBoard`、`AcceptanceHeader`、`AcceptanceJourneyNav` |
| 准备与报告 | 候选、包、演示环境、会议与证据制品 | `AcceptancePreparation`、材料服务和会话 Skill |
| Showcase | 固定计划目标、Issue 投影和人工结论 | `AcceptanceGoalRows`、任务读取端口 |
| 纪要与批注 | 内存批注、共识/遗留编辑、人工确认 | `AcceptanceMinutesSection`、annotations、`acceptance-human-guard` |
| 归档与发布 | PR/MR 状态、原生入口和 tag 状态读回 | `AcceptanceArchiveCard`、`open-archive-pr`、release status RPC |
| 材料事务 | schema、身份、修订、锁、原子保存和冲突合并 | `version-document-store`、`VersionDocumentPort`、`acceptance-merge` |

不新增第二套聊天、任务详情、材料存储、会议系统或发布执行器。页面动作经 Orca 原生发送弹窗递交验收会话，板面只读回材料或 provider 的真实结果。

Bots 的「BW 验收会议助手」模板复用 Orca 原生建 Bot 与技能目录：建 Bot 时从 BW Skill 包正源（`skill-package.json`）解包独立的 `acceptance-meeting` 会议技能（含 references）进 bot 主目录（`src/main/bots/bot-template-bundle-skills.ts`），该技能只管会议预订与材料 `meeting` 写回，与验收屏的 `version-acceptance` 同期并存、互不替代；bot 会话沿原生 Orca CLI 按版本绑定找验收工作树解析身份，不新增第二套会议或材料通道。

## 材料契约

验收材料位于固定工作树的 `.bw/planning/<version>/acceptance.json`，使用 `schema_version=3`。当前字段包括 `candidateRef`、`preparedArtifacts`、`demoEnv`、`meeting`、`results[].decision`、`results[].note`、`results[].nextStep`、`results[].issueNotes`、`results[].issueMarks.carry`、`minutes`、`planRef`、`workflow.archivePr` 和 `workflow.release`。

旧材料中的 `progress`、`rounds`、`meetingDirectives`、`issueMarks.risk`、目标级 `deliveries` 与 `materials` 作为可选旧字段宽容读回，在“旧格式记录”区域只读呈现。当前 UI、模型通道和材料写入不再产生这些字段。真正迁移必须经会话说明和人确认，读取不会改写旧文件。

人工字段守卫保护目标结论、备注、下一步、遗留标记和 `minutes`。已确认纪要冻结，撤销确认是人工动作。保存失败或 CAS 冲突保留当前输入，不静默覆盖。

## 原生复用与来源

验收默认绑定 `bw/<版本>/acceptance`，计划引用固定提交、cycleId 和 revision。任务、标签、PR/MR、文件、浏览器、会议与发布读取沿所属宿主的原生能力。CodeHub 链接按实际 provider 来源打开，不能拼成 GitHub 地址。报告和 HTML 文件沿工作树及宿主边界打开，拒绝凭据 URL、树外路径和不支持的协议。

`workflow.stage` 只供会话和自动化校准，页面不派生完成度。目标结论来自人工 `results[].decision`，PR 合入、Issue 关闭、出包和发布状态分别读取各自正本。`workflow.release.tag` 是发布状态读回键，发布事实不复制进材料。

## 会议与发布接缝

会议预订由验收 Skill 生成预览并在确认后调用项目会议工具，写回会议身份。同步纪要只写预订会议草稿，工具中断时先核对现状再重试。发布按钮只注入会话请求，模型完成预检、授权和项目入口执行，发布后独立读回 tag、时间和资产。

## 验证边界

核心 TDD 只看材料协议、人工字段守卫、来源映射、CAS 冲突、发布状态读回和导航返回等稳定逻辑。E2E 只登记 W04 主链和特性内高风险验收点，当前文件、执行项目、真实环境和独立读回见 [STATUS](STATUS.md)。原型、模拟数据和静态接线不能替代真实会议、远端归档、发布或跨宿主模型验证。
