# BW 特性矩阵

> 开发特性、给 BW Issue 定归属或核对交付现状时读。本篇是 BW 归属名称、文档入口和六环链状态总览的正本。按用户旅程一项结果一行，横向能力列在旅程之后；共用目录可分行。归属或证据变化时同步对应行，具体行为读规格，链状态按各自 STATUS 的证据范围填写。判据见[原则 02 §6.2–6.3](../01-principles/02-working-backwards.md#62-六环交付链)。

制作、盘点或清理特性原型时，先读[原则 02 §3.2](../01-principles/02-working-backwards.md#32-spec-结构用户怎样完成怎样验收)和[设计系统 HTML 原型规范](../04-design-system/guidelines.md#html-原型与文档页)，再从下方特性矩阵行内的原型链接或对应 `spec.md` 确认应打开的文件。本篇只维护特性归属、入口和证据，不复制原型规范；历史稿由 Git 追溯，`docs/hifi/` 不是当前原型正本。

## 特性矩阵

BW Issue 按主要用户结果选一个主归属。每行名称可直接用于标题；版本、目标和主单身份按[通用 Issue 规范](../../standard/references/issue-state.md)填写。

价值判断见 [03 产品主张](../01-principles/03-press-release-faq-flywheel.md)：版本计划承接定承诺，版本验收承接交结果，总览、项目墙与指标能力支持看实况。三个核心场景不穷尽全部改进；任务管理、日常执行体验等按高效与结果可核对的价值判断，主归属仍按下表的用户结果确定。

| 主归属       | 用户结果                                                                                        | 定义与证据                                                                                                                                           | 链状态概览                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 项目纳入     | 将仓库纳入 BW，记录项目身份与信息                                                               | [接入规格](project-intake/spec.md) · [原型](project-intake/project-settings-prototype.html) · [状态](project-intake/STATUS.md)                                                                                | 既有接入旅程未完整验证；原生统一添加、名片后补与单一编辑器方向已确认，制品待评审（G1）。                                         |
| 项目墙       | 跨项目、主机扫墙，按真实读数选择要跟进的项目                                                    | [墙卡规格](project-intake/spec.md) · [状态](project-intake/STATUS.md)                                                                                | 个人／团队本机属性、项目负责人、精简墙卡和当前项目侧栏原型待批注（#497/#345）；额外视图撤去，#489 仅文字；生产状态不因原型提升。 |
| 项目总览     | 按日期和特性安排里程碑，对照版本计划与实际目标结果                                              | [总览规格](overview-metrics/spec.md) · [原型](overview-metrics/prototype.html) · [里程碑状态](overview-metrics/STATUS.md#当前结论)                                                 | #590 原型及关键逻辑已确认；版本复用与材料提交范围已有 Windows 真壳局部验证，完整旅程边界见状态。                                 |
| 版本计划     | 与团队确定本版目标、验收条件和任务，评审并归档计划                                              | [计划规格](version-planning/spec.md) · [原型](version-planning/prototype.html) · [状态](version-planning/STATUS.md)                                                                            | 目标与规格已确认，材料协议和部分真壳旅程已验；模型执行与真实来源归档的覆盖见状态。                                               |
| 版本会话管理 | 从侧栏找到版本、目标、工作区与会话，准备并进入流程树                                            | [侧栏规格](version-workspace/spec.md) · [当前侧栏原型](version-workspace/prototype.html) · [状态](version-workspace/STATUS.md) | 版本导航、绑定和工作区生命周期；W02/W03 归属、验收入口与未验证边界见 STATUS。                                       |
| 任务管理     | 跨来源查找、筛选和处理 Issue、PR/MR，跟进任务结果                                               | [任务屏与链接直达规格](task-management/spec.md) · [任务屏原型](task-management/prototype.html) · [快捷入口原型](quick-links/prototype.html) · [状态](task-management/STATUS.md) · [CodeHub 任务页](codehub/spec.md#任务页行为) · [CodeHub 范围证据](codehub/STATUS.md)                                                             | 独立用户特性；当前原型为待评审的 GitHub 全局任务屏样板；链接直达规格保留，原型暂未覆盖，真实旅程待验。CodeHub 任务行为和证据按其子能力范围维护。                                          |
| 通知         | 把需要人回应的请求送到人，并在 BW 内跟踪处理结果；v0.8 只做 PR / MR 评审通知                    | [规格](pr-review-notify/spec.md) · [状态](pr-review-notify/STATUS.md) · [原型](pr-review-notify/prototype/index.html)                                | 主机多选与 CodeHub MR 已接入；静态复检及本机简单 CDP 已验，两主机及内部旅程待验。                                                |
| 产物分享     | 把本地 HTML 报告、原型或验收材料上传到团队自管服务，生成同事可打开的链接                     | [产物分享规格](artifact-sharing/spec.md) · [状态](artifact-sharing/STATUS.md) · [服务端说明](../../services/bw-share/README.md)                                                             | 客户端入口、自动设备令牌、本机记录与移除链接已实现并有协议测试；真实内网、重启读回与链接更新旅程待验，边界见状态。                                       |
| 版本验收     | 围绕目标核对证据、记录人的判断并归档验收结果                                                    | [验收规格](version-acceptance/spec.md) · [原型](version-acceptance/prototype.html) · [状态](version-acceptance/STATUS.md)                                                                        | 会议流程与来源契约已有定义，入口和部分操作有真壳证据；完整会议至归档旅程未验证。                                                 |
| 工程部署     | 查看被管项目的 CI 结果，部署并读回运行结果                                                      | [验收中的出包入口](version-acceptance/spec.md)                                                                                                       | 现有资料覆盖验收中的出包环节；独立的 CI 至部署定义及整段验证尚缺。                                                               |
| 版本总览     | 查看本版目标、任务数、未完成数和验收结论。SDLC 和 AI 生产力统计默认关闭，可在本机按项目分别开启 | [版本总览规格](version-overview/spec.md) · [原型](version-overview/prototype.html) · [状态](version-overview/STATUS.md)                                                                        | 历程与事实来源已有规格、实现及协议测试，交互和真实数据验证范围见状态。                                                           |
| 指标能力     | 定义指标、采集历史值，并在总览和验收中读回                                                      | [指标规格](overview-metrics/spec.md) · [指标六环状态](overview-metrics/STATUS.md#六环状态)                                                           | 历史采集和来源协议有定向验证；配置、采集、合入、采用及重启的完整旅程未验证。                                                     |
| 内部集成     | 接通内部服务，使用 CodeHub 仓库与 WeLink 通信、发起评审                                         | [接入规格](connectors/spec.md) · [原型](connectors/prototype.html) · [状态](connectors/STATUS.md) · [CodeHub 适配](codehub/intent.md)及[状态](codehub/STATUS.md)                          | 接入卡已有规格、实现和测试，完整登录旅程未验；CodeHub 有局部真壳证据。接入证据仅覆盖相应服务和动作。                             |
| 团队多人协作 | 用团队目录发现项目、合看多台主机的项目进展，独立完成评审                                        | [意图](team-collaboration/intent.md) · [规格](team-collaboration/spec.md) · [原型](team-collaboration/prototype.html) · [状态](team-collaboration/STATUS.md)                               | v1.1 G1 设计待评审（#342）。                                                                                                     |

## E2E 旅程登记

跨特性用户旅程 E2E 按探索 BW 的 5 条工作旅程登记；30+ 个功能项是能力入口，不各自生成一条用户旅程 E2E。TDD 和特性验收 E2E 的边界仍以各特性 `STATUS.md` 为准。一个真实主链可以覆盖多个特性；主链已覆盖某个验收边界时，不另建该特性的验收用例。`未登记` 表示规格已有旅程或已有局部用例，却还没有可追踪的入口和当前运行证据，不等于实现不存在。

W01–W05 的具体定义、归属和证据分别回到 [探索 BW 规格](explore-workbench/spec.md)、各特性 `spec.md` 与 `STATUS.md`；现有特性 STATUS 编号在资产迁移 PR 建立 crosswalk 前保持历史身份。本篇不保存当前运行数量、逐用例处置或缺口流水。

侧栏统一规划归版本会话管理，包括原生项目与工作区区域的布局、置顶、展开收起、显示身份和归属。任务列表、详情和处理交互归任务管理，来源特有的接入与通信归内部集成。多人协作随用户结果归属：把请求送到人并跟踪处理结果归通知，v0.8 只包含 PR 评审请求的发送、接收与结果跟踪；借助 WeLink 完成本版验收归版本验收。

## 特性之外的归属

| 主归属    | 适用范围                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 产品基础  | 跨旅程的通用产品体验，包括没有对应特性的 Orca 原生改造。原生改动若服务某一已有特性，直接归该特性。[探索 BW 布局](explore-workbench/spec.md)及[原型](explore-workbench/prototype.html)维护探索目录的布局和交互，内容覆盖仍归引导矩阵。 |
| 研发保障  | BW 团队自身的开发、验证、上游升级与发布，包括 [开发检视规范](../development.md#独立检视)、[BW 出包发布](workbench-release/STATUS.md)和贡献 BW 的[意图](bw-contribution/intent.md)、[规格](bw-contribution/spec.md)、[当前原型](bw-contribution/prototype/index.html)及[认可与证据](bw-contribution/STATUS.md)（待评审）。 |
| 待定/预研 | 用户、独立结果或验收方式尚未明确的研究，如 AI 资产管理。专题结论明确后按用户结果定归属。                                             |
