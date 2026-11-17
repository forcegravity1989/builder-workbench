# 探索 Monica — 状态

> **读者与时机**：判断本特性认可与验证范围时读取。
> **职责与结构**：记录意图/规格的认可边界和六环状态；实现进度与运行记录归 Issue/PR，不把原型当作产品验收。
> **更新触发**：用户确认设计，或实现与适用验证证据变化时更新。

现有探索框架沿 [#634](https://github.com/forcegravity1989/builder-workbench/issues/634)。W01 已由 #640 合入，用户已认可目录、四步布局和名片片段的演示顺序。[可点原型](prototype.html)已精简说明，已确认正式动画复用 Monica 实际界面，用独立样例保留播放、暂停与重播。

| 环 | 状态 | 依据与边界 |
|---|---|---|
| 意图 | ● | [意图正文](intent.md)已确认，后续逐项填充内容 |
| 规格 | ● | [规格](spec.md)与[可点原型](prototype.html)记录已认可布局、演示顺序与实现方式 |
| 实现设计 | ● | Monica 目录复用原生演示的选择、正文与配置卡 |
| 单测 | — | 目录交互由真实 Electron 验收覆盖 |
| 验收点 E2E | ◐ | Windows 真壳已核对入口、目录切换、内容状态、关联入口与回看 |
| 用户旅程 E2E | ◐ | Windows 真壳走通帮助到工作区和浏览器演示，远端用例见交付记录 |

[PR #640](https://github.com/forcegravity1989/builder-workbench/pull/640)的既有四步截图、三项关联和 Windows 本机证据见[探索 Monica 矩阵](../../04-design-system/guidance.md#探索-monica-矩阵)及[用户指南](../../03-guide/project-direction/README.md)。产品内四步播放、三个功能片段和真实业务的验证范围按矩阵分别记录。

W02 五步内容复用 W01 的播放器，Windows Electron 已核对选步、暂停、重播和归档到开工的模拟结果。业务验证边界见[引导矩阵](../../04-design-system/guidance.md#探索-monica-矩阵)。

W03 已复用现有目录和播放器。Windows 前台 Electron 的隔离空项目覆盖六段样例，按实际入口查看、顺序播放、暂停续播和重播，观察了并行工作区、批注、PR 表单、评论以及合入后关单读数。隔离 Git 样例已走通源代码管理引导首现、跳过、重播和打开实际差异，以及内置浏览器帮助重播、添加和展开回看批注。新进程读回已看记录与项目登记，浏览器恢复页面地址，未发送批注随原生页面重建清空。实际模型、真实双账号 PR 和共享主机送达另行验收。见[构建交付指南](../../03-guide/issue-delivery/README.md)与[覆盖矩阵](../../04-design-system/guidance.md#探索-monica-矩阵)。

W04 五步样例及验收和版本总览的屏内引导已在 Windows Electron 验证。纪要确认、撤销后编辑和保存后的读回见[版本验收状态](../version-acceptance/STATUS.md)。

W05 的四步样例及固定三步记分牌引导已获认可。Windows Electron 已核对样例关键画面、指标功能项的跟做入口，以及隔离项目总览的首次触发和重播。实际指标配置、外部采集及多人事实读回仍按[总览指标状态](../overview-metrics/STATUS.md)验收。
