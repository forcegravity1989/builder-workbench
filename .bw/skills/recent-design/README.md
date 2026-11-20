# Recent Design：BW 研发技能

> **读者与时机**：BW 本仓开发者与模型，在选择外部设计或前端研发方法时读取。**职责**：维护本目录技能的选型、适用边界、来源与更新方法；不替代产品规格、设计系统或开发规范，不分发给被管项目。按使用 → 已采用 → 未采用 → 来源维护组织；上游或选型变化时更新。上游镜像保持来源格式，本地适配与原件分开。

通过 [仓内入口](../../../.claude/skills/recent-design/SKILL.md) 使用，例如 `/recent-design review-animations 检查侧栏展开动效`。本入口是一个按需读取的路由，不会将所有正文塞入上下文。技能文件纳入 Git；新会话是否发现入口、模型是否实际读到并遵守，须在真实宿主会话中另验。

给人阅读的 [HTML 选型报告](selection-report.html) 是本篇与来源清单的只读投影，逐项说明为什么选、用来做什么、限制与未选理由。修改本篇或来源后运行 `node .bw/skills/recent-design/selection-report.mjs` 同步；生成器嵌入现有设计系统样式与字体，单个 HTML 下载后可离线打开，不维护第二份选型正本。

## 使用边界

- 范围是 BW 自身的 Electron / React / TypeScript 研发，不是移动端、Next.js 服务端或 Vercel 部署。
- [AGENTS](../../../AGENTS.md)、[开发规范](../../../docs/development.md)、所属特性与 [设计系统](../../../docs/04-design-system/README.md) 优先。BW 沿用 Orca 原语、Geist 字体、语义 token、单色安静的界面语言；颜色只给状态，不因外部方法另造色板、字体或组件系统。
- 做改动前完整读取匹配的 `SKILL.md` 与其中必读参考。只加载本次需要的方法；示例中不存在的库/API 不代表本仓可用，不自行安装。
- 外部技能的审美建议不构成 bug 或合入阻断依据。检视须结合本仓认可行为与实际证据，不能只因不符合上游数值/偏好而报告回归。
- 不运行上游安装脚本、`npx impeccable` 或新浏览器工具，不向外网发送仓内源码、内部页面或截图。不新增 `DESIGN.md`、品牌上下文、统计存储或平行规范；需要记录稳定决定时写回既有正本。

## 已采用

Recent 页面是聚合目录，不是单一技能仓库。下表按其条目筛选；其中 UI Skills 已改名为 `baseline-ui`，Impeccable 的四个条目已合并成命令，本仓保留有限的本地适配。

| Recent 条目 / 本地技能      | 为什么选给 BW                                                                                 | BW 使用结果                          | 正文与范围                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| quieter                     | 高频工作台需要减少同屏竞争；针对背景、字重、边框和过量动效降噪，而非只追求好看                | 减少视觉噪声，保留状态可辨性         | [本地适配](quieter/SKILL.md)；不照搬降低对比度、加暖灰等建议                                                                                             |
| distill                     | 版本、目标、工作区与任务容易重复展示；以主任务为中心清理重复信息与操作障碍                    | 清理重复控件和无关信息               | [本地适配](distill/SKILL.md)；不擅自删能力或改信息结构                                                                                                   |
| critique                    | 补充视觉层级、可发现性与恢复路径的设计观察，回答“为什么难用”；不替代正式独立检视              | 以用户任务评议设计，输出有依据的问题 | [本地适配](critique/SKILL.md)；不运行外部检测器或把审美评分当健康信号                                                                                    |
| polish                      | BW 体验跨越列表、浮层、表单与会话入口；沿完整路径收尾，避免只修一张截图                       | 收尾布局、状态、交互与一致性         | [本地适配](polish/SKILL.md)；不暗中重设计                                                                                                                |
| UI Skills → baseline-ui     | 语义控件、键盘、焦点、布局等基础检查适用于 Electron 的 DOM 界面，无须新产品框架               | 检查语义控件、键盘、布局与反馈       | [上游正文](baseline-ui/SKILL.md)；只用现有原语，库偏好不是替换理由                                                                                       |
| emil-design-eng             | 按使用频率判断动效、浮层起点与反馈细节，适合高频按钮、浮层和工具提示的综合打磨                | 打磨按钮、浮层、反馈和细节           | [上游正文](emil-design-eng/SKILL.md)；不统一给高频操作加缩放/弹簧                                                                                        |
| make-interfaces-feel-better | 将字形、图标光学对齐与交互感觉落实为局部组件检查项，补充综合原则                              | 具体组件的交互、字形和光学对齐       | [上游正文](make-interfaces-feel-better/SKILL.md)；不替代整段旅程验收                                                                                     |
| animation-vocabulary        | 把“弹一下”“跟着变”等描述转成精确术语，降低图标和界面动效的沟通歧义，不引入动画库              | 将动效描述转换成准确术语             | [上游正文](animation-vocabulary/SKILL.md)；只命名，不实现或变更领域词表                                                                                  |
| review-animations           | 专门核对目的、频率、时长、起点、可中断性、GPU 属性与 reduced-motion，防止装饰动效拖慢高频操作 | 检查动效目的、频率、性能和无障碍     | [上游正文](review-animations/SKILL.md) + [标准](review-animations/STANDARDS.md)；需要编排时才读 [相邻参考](choreograph/SKILL.md)，该参考不是额外安装入口 |
| oklch-skill                 | BW 采用统一 token 并覆盖浅深主题；色域、转换和对比度知识可解释某个状态色为何不可读            | 理解色彩转换、色域与对比度           | [上游正文](oklch-skill/SKILL.md)；保留已有 token，不批量转色或自动反转深色主题；亮度差/APCA 是辅助线索，实际 WCAG 对比度单独测量                         |
| vercel-react-best-practices | 客户端 React、事件订阅、异步和重渲染规则匹配 BW 渲染层，可用于有实际现象的性能排查            | 检查 React 重渲染、事件、异步与打包  | [上游正文](react-best-practices/SKILL.md)；不采用 Next/RSC/SSR/Vercel 专用建议，按实际 React 版本确认 API                                                |
| vercel-composition-patterns | 用显式变体和组合边界减少布尔 props 的组合漏洞，改善现有原语/组件 API，而非另建组件库          | 优化组件组合与 props 边界            | [上游正文](composition-patterns/SKILL.md)；复用原语，不另造组件框架                                                                                      |
| typescript-advanced-types   | 联合、映射和条件类型可用于准确表达真实数据契约，帮助识别不合法状态                            | 为真实数据契约选择恰当类型           | [上游正文](typescript-advanced-types/SKILL.md)；不为展示技巧增加类型复杂度                                                                               |
| frontend-design             | 从真实产品内容与用户任务探索层级表达，避免通用营销模板；仅补充 BW 既定视觉方向                | 在已有品牌与规格内探索具体界面表达   | [上游正文](frontend-design/SKILL.md)；不重建 token/字体，不把营销 hero 套进日常桌面工作流                                                                |

## 本轮未采用

| Recent 条目                | 原因 / 现有替代                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| canvas-design              | 静态画作/PDF 工作流，不是 BW 产品界面；需要传播素材时按具体任务再决策                                         |
| prototype                  | 上游要求在真实项目中加 picker、variants 与 playground；BW 已有按特性归档的高保真流程，不引入第二套原型机制    |
| apple-design               | 主要面向 Apple 风格/原生平台；BW 是 Windows/macOS Electron 且与 Orca 设计系统对齐                             |
| vercel-react-native-skills | React Native/Expo，不匹配当前桌面技术栈                                                                       |
| tailwind-design-system     | 教人新建 token/组件体系；BW 已有单一设计系统正本与同步脚本                                                    |
| extract-design-system      | 浏览器提取生成设计文档，与已有 design-system-import 及源码 token 正本重叠                                     |
| shadcn                     | registry/CLI 安装工作流，不为读技能引入组件管理工具；使用现有 components/ui 原语                              |
| agent-browser              | 新增浏览器 CLI/toolchain，与 Orca 原生浏览器及现有真实验收入口重叠                                            |
| grill-me                   | 已有过程工具兼容与特性确认路径，安装本次设计技能不再叠加需求流程                                              |
| web-design-guidelines      | 上游 SKILL 运行时抓取远端规则，离线正文不完整；本次用 baseline-ui 与现有引导/旅程规范，不把联网指针称为完整包 |
| userinterface-wiki         | 多平台知识与外部查询、相邻工具范围较广；本轮由更窄的交互与动效技能覆盖                                        |

## 来源与维护

- 聚合入口：[recent.design/skills](https://recent.design/skills)。各技能的一手仓库、固定 commit、原始目录、许可文件和 SHA-256 在 [sources.json](sources.json)。不把网页的标题、星数或介绍当作技能正文。
- 采用“镜像存储 + 固定版本溯源”：普通候选完整复制上游技能目录与必需参考，仓内入口按需引用；不是只存联网指针。React 技能的实际 `name` 与上游目录名不同，原件不改名，统一通过仓内路由读取。`emil-design-eng` 是较长的综合指导，保留镜像格式，仅需要综合交互指导时完整读取；动效任务优先窄技能。上游版权及许可保存在 [licenses/](licenses/)。Vercel 仓库没有独立根 LICENSE 文件，保留作者在 README 中的 MIT 许可声明、技能 frontmatter 与固定 commit 作为采用依据；不自行补写版权声明，本仓采用不代表已完成法律审查或向被管项目授权分发。
- React 的上游编译版 `react-best-practices/AGENTS.md` 中三个 `./<规则>.md` 链接漏了 `rules/` 层（`async-defer-await`、`async-cheap-condition-before-await`、`server-hoist-static-io`）。镜像不修改；实际读取 [rules/](react-best-practices/rules/) 中的同名文件。完整加载优先走 `SKILL.md` → 对应规则，已保留所有规则。
- 四个 Impeccable 本地适配只借用设计方法，原命令文本保存在 `upstream/impeccable/`；不将它们伪装成完整 Impeccable 安装，不执行原文中的 CLI、上下文/检测存储与相邻命令。Apache-2.0 LICENSE 和上游 NOTICE 一并保留，改写处在本地 SKILL 中标明。
- 更新先核对聚合页及一手仓库，再在独立分支固定新 commit；核查 license、脚本/外链、引用依赖和与本仓冲突。原件变化重新计算哈希，本地适配另审；不自动追 main 或覆盖用户文件。
- 验证 Git 可追踪性、YAML、清单哈希、必要引用、许可证与本地入口。静态通过只能证明资产完整与可定位；真实模型读取、方法效果和产品旅程验收分别留在本次 Issue/PR，不写成已交付能力。
