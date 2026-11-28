# 版本计划实现设计

> 给实现和技术评审者阅读。本文说明当前模块边界、数据契约和原生复用方式。行为正本见 [spec](spec.md)，用户结果见 [intent](intent.md)，验证状态见 [STATUS](STATUS.md)。只保留稳定实现决定，不写开发流水。

## 模块边界

版本计划位于 `src/renderer/src/workbench/version-planning/`，通过 `version-cycle` 共享层接入项目、版本、材料、任务、会话和归档能力。计划屏负责目标、纪要和计划侧投影，验收屏负责验收结论和实际交付，指标域负责指标定义与采集。Orca 负责 Tasks、工作树、会话、Automations、项目身份和权限。

| 业务区域   | 当前落点                                                                   | 责任                                             |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| 页面与导航 | `PlanningBoard`、`PlanningHeader`、`PlanningJourneyNav`                    | 四区布局、同页定位、开始卡、会话收折和操作入口   |
| 上版回顾   | `PlanningPriorReview`、`use-prior-carryovers`                              | 固定验收来源核验与延期、会议遗留投影             |
| 目标与任务 | `PlanningGoalCard`、任务端口和 G2 Start/Open 解析器                        | 目标编辑、指标承诺、任务归属、详情往返和开工入口 |
| 批注与纪要 | `annotations/`、`PlanningMinutesSection`、`plan-send-menu`                 | 对象批注、原生发送、纪要读写和人工确认           |
| 归档       | `PlanningArchiveCard`、`open-archive-pr`                                   | 归档引用、provider 状态和原生 PR/MR 页面         |
| 材料事务   | `version-document-store`、`MaterialDraftController`、`VersionDocumentPort` | schema 校验、CAS 修订、锁、原子写入和冲突处理    |

不新增第二套聊天、任务详情、材料存储或自动化执行核。计划屏和验收屏可以共享端口与通用批注模块，业务投影保持各自演进。

## 计划材料

计划材料位于固定工作树的 `.bw/planning/<version>/data.json`，当前结构使用 `schema_version=3`，保留目标、任务、工作流、摘要、`minutes` 和 `workflow.archivePr` 契约。旧材料只在显式迁移时升级，迁移失败保留原件并报告，不静默双写或回退旧界面。

`VersionDocumentPort.read/save(expectedRevision)` 是 UI 和 `ORCA bw materials` CLI 共用的写入入口。写入前核对项目根、版本身份和修订，使用锁与原子替换。保存冲突暂停自动保存并保留当前输入，不能覆盖模型或另一会话的修改。

新建版本通过 `selectPriorVersionSource` 先确定紧邻前版，再读取固定验收来源。已有 `summary.progressSource` 优先。 `use-prior-carryovers` 只投影延期和会议遗留，不生成新的验收报告，不把实时 Issue 状态写入固定回顾。

计划成员通过 `bw:plan:<version>` 标签读取，目标通过标题中的 `【版本|目标】` 段归属。无法解析的成员进入未归类区域，查询失败或不完整时显示未知。任务端口复用原生批量读取和缓存，缓存只用于回显，不写入事实快照。

## 原生复用与导航

每版计划默认绑定 `bw/<version>/plan`，验收绑定 `bw/<version>/acceptance`，旧无绑定上下文兼容 `bw/week-plan` 和 `bw/week-acceptance`。计划屏直接复用 Orca 的 Terminal、TabBar、会话历史、工具、Tasks 页面和 Automations。普通原生新建会话不注入 BW 提示，专用入口只准备完整 Skill 包和可编辑请求草稿。

任务详情使用 `TaskOrigin` 携带项目、版本、目标筛选、滚动和草稿来源，返回时复用原生导航历史并恢复计划上下文。归档通过 `workflow.archivePr` 读取 provider、仓库和编号，经 `workbench.archive.prStatus` 获取状态，读不到保持 `unknown`。不按分支名探测 PR，不用字节级合入证明替代原生状态。

更新代码是显式同步入口。同步期间材料只读，完成后重新读取材料和候选版本，不能重选用户当前工作区或覆盖未提交输入。外部 Git 操作不受材料锁控制。

## 批注与纪要

批注模块只保存当前渲染进程内的板面会话状态，并按项目、宿主、工作树、版本和屏身份隔离。页面切换保留当前板面批注，渲染进程重启按设计清空。发送通过 Orca 原生发送弹窗，成功回调后清空已递交条目。

批注不会直接成为材料。计划助手根据批注和可选会议转写写入 `minutes.consensus` 与 `minutes.followups`，仅未确认正文可改。人工确认写入确认字段并冻结正文，撤销确认后才能修改。旧 `followups[].closed` 保留原值供兼容读回，当前界面不提供逐项闭环控件。

## 工作流与状态

`workflow.stage` 是模型与自动化使用的进度信号，不是页面完成权威。页面不渲染旅程灯，也不从 stage 推导目标完成或 PR 合入。归档由会话发起，页面只显示真实引用和状态。目标完成、PR 合入和 Issue 关闭由各自正本记录。

## 验证边界与维护

核心 TDD 关注目标到纪要的材料协议、CAS 冲突、来源隔离、已有周期自动化的去重与进屏不新建、导航返回。E2E 入口按 [spec](spec.md) 的 P01–P12 和 W02 登记，当前数量受三类用例规范和 allowlist 约束。实现模块、材料契约或原生接缝改变时更新本设计，并把运行结果写入 PR 验证评论，不在此追加历史日志。
