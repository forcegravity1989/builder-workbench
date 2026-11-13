# 探索 BW — 状态

> **读者与时机**：判断本特性认可与验证范围时读取。
> **职责与结构**：记录意图/规格的认可边界和六环状态；实现进度与运行记录归 Issue/PR，不把原型当作产品验收。
> **更新触发**：用户确认设计，或实现与适用验证证据变化时更新。

现有探索框架沿 [#634](https://github.com/forcegravity1989/builder-workbench/issues/634)。W01 调整处于 `in_review`，用户已认可目录、四步布局和名片片段的演示顺序。[可点原型](prototype.html)已精简说明，已确认正式动画复用 BW 实际界面，用独立样例保留播放、暂停与重播。

| 环 | 状态 | 依据与边界 |
|---|---|---|
| 意图 | ● | [意图正文](intent.md)已确认，后续逐项填充内容 |
| 规格 | ● | [规格](spec.md)与[可点原型](prototype.html)记录已认可布局、演示顺序与实现方式 |
| 实现设计 | ● | BW 目录复用原生演示的选择、正文与配置卡 |
| 单测 | — | 目录交互由真实 Electron 验收覆盖 |
| 验收点 E2E | ◐ | Windows 真壳已核对入口、目录切换、内容状态、关联入口与回看 |
| 用户旅程 E2E | ◐ | Windows 真壳走通帮助到工作区和浏览器演示，远端用例见交付记录 |

[PR #640](https://github.com/forcegravity1989/builder-workbench/pull/640)的既有四步截图、三项关联和 Windows 本机证据见[探索 BW 矩阵](../../04-design-system/guidance.md#探索-bw-矩阵)及[用户指南](../../03-guide/project-direction/README.md)。产品内四步播放、三个功能片段和真实业务的验证范围按矩阵分别记录。
