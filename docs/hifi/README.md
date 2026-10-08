# 高保真原型 · 逐屏简报

> **边界横幅（2026-10-07 · 主干换 Orca Electron 叠层）**：主干 `main`（原 `bw-orca`，2026-09-30 扶正）是 Orca Electron 叠层；旧 Rust 三 crate 壳已归档 `archive/main-pre-orca`。本目录四个 HTML 是**旧 Rust 壳八屏的历史原型档案**，不描述现行界面；不得用它们恢复旧功能、旧命名或旧路由（`#/wall` `#/p/<项目>/…` 已不存在）。现行界面与旅程看 [`architecture.md`](../architecture.md) §1，叠层屏幕清单与源码落点看 [`SYNC.md`](../../src/renderer/src/workbench/SYNC.md) / [`INVENTORY.md`](../../src/renderer/src/workbench/INVENTORY.md)，视觉正本看 [`docs/04-design-system/`](../04-design-system/README.md)。新原型只留链接、落在所属特性目录（`docs/05-features/<id>/prototype/`），不再提交到本目录。

> **历史与目标态边界（2026-09-11）**：`index.html` 的状态机、配置页和旧术语，以及 `plan.html` 的演示脚本保持历史行为。`home.html` 展示五站目标，`overview.html` 展示旧总览目标，均不表示能力已按该稿交付。现行术语看 [`CONTEXT.md`](../../CONTEXT.md)。

> **历史横幅(2026-09-07)**:壳的视觉语言(配色、字体、间距、圆角、组件类)已改以 [`docs/04-design-system/`](../04-design-system/README.md) 为正本。本目录保留**八屏版式与旅程**的原型:块顺序、控件与交互供设计参考；颜色和组件长相以设计系统为准,两边不一致时不改这里的旧样式。旧 Dioxus 壳编译期拼入 `styles.css` 的表述随 Rust 壳删除已失效；现行 Electron 叠层皮肤走 `src/renderer/src/workbench/workbench-tokens.css` 及各屏 CSS。

> **30 秒导读**:[index.html](index.html) 是单文件、浏览器直接打开的可点击原型。**给谁看**:要追溯 Workbench 界面设计目标的人。**现在还作数吗**:八屏版式与旅程仅作历史参考;现行屏幕对照见下节,页内演示数据(旧「规范铺底 / issue-policy」、Orca/Open Design iframe 会话屏等)已全部过时。三条总原则:①目标态,不是演示走场;②成熟组件原样沿用;③信息密度优先。

2026-08-25 / 2026-08-29 的两轮旧壳对齐记录（去连接器表、删通知页签、计划屏定稿 `plan.html`、会话屏两 iframe 页签等）针对已归档的 Rust 壳，细节从 Git 追溯，不再维护。本地状态前缀 `bw-v4-hifi7-state`（点「重置」清除）。

## 1 · 旧八屏 → 现行界面对照

现行导航（`WorkbenchSidebarNav.tsx`）：侧栏顶部项目墙按钮，其下**总览 · 计划 · 验收 · 任务 · 自动化 · 知识库**，任务入口复用 Orca 原生按钮；项目墙、接入在 Orca `activity` 内容槽切换，设置走 Orca 原生 Settings。没有独立会话屏和配置屏。

| 旧八屏（本目录原型） | 现行承载 | 说明 |
|---|---|---|
| 项目墙 | `ProjectWallPage.tsx` | activity 内容槽；按 `ProjectGroup` 聚合多仓，卡片展示仓链接，`+ 代码仓` / 删除 |
| 接入 | `OnboardProjectPage.tsx` / `OnboardCharterStep.tsx` / `EditCharterPage.tsx` | 打开本地仓 / 克隆远端 → `repo.add`；名片经固定分支 `bw/project` 固定树 PR 合入被管仓；行为见 [project-intake spec](../05-features/project-intake/spec.md) |
| 总览（`overview.html`） | `OverviewPage.tsx` | 块顺序：指标问题面板 → 项目名片 + 北极星双卡 → 版本纪要 → 业务/项目指标两区（ECharts，日/周粒度、特性显隐）→ SDLC 三区；「配置指标」走独立 `bw/metrics-refresh` 固定树；无数据保持 Unknown；边界见 [overview-metrics STATUS](../05-features/overview-metrics/STATUS.md) |
| 计划（`plan.html`） | 计划屏：artifacts 槽准备固定树 `bw/week-plan` → 原生 terminal 工作区 + 右侧 `PlanningBoard` 材料单页 | 旧四列看板 / 列表视图 / 居中弹窗 / 出包发版按钮全部不作数；材料经 `workbench.materials.*` RPC 读写 `.bw/planning/<版本>/`；见 [版本计划 STATUS](../05-features/version-planning/STATUS.md) |
| ——（旧无独立验收屏） | 验收屏：与计划共用容器，独立固定树 `bw/week-acceptance` | 协作卡片手动运行已登记自动化；归档状态按材料身份与合入证据推导，无证据一律 Unknown |
| 会话 | 已删除 | 计划/验收完整复用 Orca 原生会话工作区（终端、标签/分屏、资源管理器、智能体历史）；不再走 iframe 内嵌 Orca / Open Design |
| 配置 | 已删除 | 能力在 Orca 原生 Settings；定时工作走原生 Automations（侧栏「自动化」），「配置自动化」入口在计划/验收右板页头 |
| 知识库 | `KnowledgePage.tsx` | 文档 / 代码 / 对账三页签；文档树与正文读真实仓库、编辑直接保存该仓；代码页仍为占位，对账与建议含演示数据 |
| 设置 | Orca 原生 Settings | 旧「工作区根目录 / 数据目录 / 工具检测 / Orca 网页地址」设置屏描述不再作数 |

`home.html`（五站驾驶地图）对应的五站旅程仍是产品目标，主张以 [原则 03](../01-principles/03-press-release-faq-flywheel.md) 为准；页面本身是旧稿。

## 2 · 档案内引用状态

- `plan.html` 原引用旧壳样式 `crates/app-shell/assets/shell.css`，文件已随 Rust 壳删除，死链已移除；页面只剩 [`04-design-system/styles.css`](../04-design-system/styles.css)，旧壳布局类（`app-root`、侧栏等）失去样式来源，版式残缺属预期。
- `index.html` 内嵌 `../guide/v4-产品指南.html`（iframe）：旧产品指南已删除，打开帮助抽屉时该面板为空。原型按历史行为保留，不修复、不替换。
- `overview.html` 引用 `../04-design-system/styles.css`，仍可渲染。
- 各页演示数据（issue-policy、周计划、出包/发版流程等）均为旧 Rust 壳口径，不描述现行数据契约。

## 3 · 怎么开

浏览器直接打开 `index.html`。点「重置」清掉 `bw-v4-hifi7-state`。
