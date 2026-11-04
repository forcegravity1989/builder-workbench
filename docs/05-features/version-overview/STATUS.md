# 版本总览状态

> 给实现、评审和验收者核对本特性的认可、实现入口与验证结论。行为见 [spec](spec.md)，价值见 [intent](intent.md)。认可或交付状态改变时更新；变更过程、运行证据和问题处理记录留在 PR。

## 认可与交付

[Issue #334](https://github.com/forcegravity1989/builder-workbench/issues/334)承载版本总览特性；[设计 PR #459](https://github.com/forcegravity1989/builder-workbench/pull/459)与[开发 PR #474](https://github.com/forcegravity1989/builder-workbench/pull/474)已合入。

用户已确认按目标组织、特性六阶段、连续 Maintain、三种状态横轴、阶段来源直接跳转，以及 workflow 的任务比例与独立次数。

上轮已确认的[统计展开布局](prototype.html?sdlc=on&ai=on&rev=558-opt-in-1)：未来阶段优先使用明确关联规划的长度，没有匹配规划时使用默认长度。生产已接入正式规划读取；原型中的规划长度为模拟，PR 合入状态为单独标明采集时间的真实快照。

## 默认关闭与按需开启原型（#558）

按用户要求，先在现有原型上演示 SDLC 与 AI 生产力独立开关，默认均关闭；关闭时基础版本总览保留且不显示对应统计或占位。设置入口与样式参考当前 Orca「设置 → 实验性功能」，新增项目作用范围为本次设计提案。入口见 [spec 的原型评审增量](spec.md#实验能力原型评审558)。

本轮仅修改特性原型与必要评审说明，生产代码未改；真实设置持久化、采集停止和项目总览联动均尚未实现，不能以静态快照或原型检查代替生产验证。界面方案待本轮人审。

## 实现与验证

生产入口为 `version-overview-page.tsx`；`version-overview/` 分开材料及 provider 读取、事实解析、缓存和呈现。目标人工验收沿正式材料回显，目标任务沿原生入口进入。AI workflow 只读目标内 Issue 的单份 PR 报告，指标独立加载、缓存与刷新。

既有运行证据见 [PR #474 验证报告](https://github.com/forcegravity1989/builder-workbench/pull/474#issuecomment-6517643767)。两屏接入共用材料、特性事实与缓存；当前增量尚未运行真实 BW 联合旅程，门禁与独立检视随交付 PR 记录。原型、静态检查、隔离回归与真实 BW 项目旅程是不同证据，任何一层均不代替另一层或人工验收。内部渠道验证统一在 [#530](https://github.com/forcegravity1989/builder-workbench/issues/530) 跟进。
