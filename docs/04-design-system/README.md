# Workbench 设计系统

> **本篇维护约定**：给写界面、做原型、改样式或引导的人与模型读取，动手前先读。只写入口：怎么用、文件各是什么、值从哪来、怎么同步；视觉与组件规则在 [guidelines.md](guidelines.md)，引导内容与旅程覆盖在 [guidance.md](guidance.md)，不在这里重复。文件增删、正本或同步方式变化时更新。

> **30 秒导读**：**所有当前原型遵循一套规范，以仓内 BW/Orca 真实界面为基线。** 基础值来自 [`main.css`](../../src/renderer/src/assets/main.css)，当前 BW 主题还叠加 [`workbench-tokens.css`](../../src/renderer/src/workbench/workbench-tokens.css)，不能只读本目录 token 就推断最终配色。先读 [guidelines.md](guidelines.md)，再读实际页面与组件；本目录的 Markdown、JSON、CSS、HTML 是规则、基础值与局部示例，不是另一套产品界面。

## 按任务读

| 要做什么 | 读 | 用 |
|---|---|---|
| 改产品界面（React） | [guidelines.md](guidelines.md) → 对应的 `primitives/<名>.md` | `src/renderer/src/components/ui/` 的原语 + Tailwind token 类（`bg-card`、`text-muted-foreground`） |
| 走查旅程、设计引导或制作指南/传播素材 | 完整读取 [guidance.md](guidance.md) | 在入门或探索矩阵定位内容行，复用现有机制，逐格维护覆盖与产出 |
| 改叠层 CSS（`src/renderer/src/workbench/*.css`） | [guidelines.md](guidelines.md)「Workbench 叠层怎么对齐」 | `var(--foreground)` 这类 Orca 名；存量的 `--color-*` 角色名见 tokens.json |
| 做原型、文档页、验收展示 | [guidelines.md](guidelines.md)「HTML 原型与文档页」下的[入口与正本](guidelines.md#原型入口与正本)、[当前 BW 外壳](guidelines.md#当前-bw-外壳)、[特性增量](guidelines.md#特性增量与跨特性复用)、[交互完成度](guidelines.md#交互完成度)、[数据与验证边界](guidelines.md#数据示例与验证边界)、[资产治理](guidelines.md#资产历史与并行工作树)和[评审清单](guidelines.md#原型评审清单) | 文档与评审区使用 `styles.css`；产品画布复用实际组件、布局与运行时主题；静态表达按真实界面校准并标明边界 |
| 查某个颜色/间距/圆角的值 | [tokens.json](tokens.json) 与实际页面加载的样式 | token 的 `usage` 解释语义；BW 取值须核对 `workbench-tokens.css` 运行时覆盖 |
| 加或改一个 token | 先改 `main.css`（`:root` 与 `.dark` 都给值，`@theme inline` 暴露），再同步 [tokens.json](tokens.json) | `node config/scripts/design-system-tokens.mjs --write` |

深色：应用和 BW 原型切换根节点 `.dark`，BW 保留 `data-skin="ds" data-theme="claude"`；只展示基础 token 的文档页可用 `data-theme="dark"`。静态 BW 原型在 `styles.css` 后直接加载产品 `workbench-tokens.css`，路径和边界见 [HTML 原型规范](guidelines.md#html-原型与文档页)。中文页面声明 `lang="zh"` 启用中文排版层。

## 文件

| 路径 | 是什么 |
|---|---|
| [guidelines.md](guidelines.md) | 规则正文：文案、颜色角色、字体、层级、组件选型、[按钮与新增入口](guidelines.md#按钮与新增入口)、图标、交互反馈、叠层对齐、中文排版，以及按章节组织的 HTML 原型入口、BW 外壳、特性增量、交互、数据边界和资产治理 |
| [guidance.md](guidance.md) | 引导分工、展示/回看与新功能提示规则；BW 入门、探索 BW（工作/功能）两张矩阵及产出归属 |
| [tokens.json](tokens.json) | 机读 token：颜色（light / dark 两主题，135 个）、字体与 10 个字号样式、间距、圆角、阴影；每个带 `usage` |
| [tokens.css](tokens.css) | **生成文件，不要手改**——由 tokens.json 生成的 CSS 变量与 Geist `@font-face` |
| [styles.css](styles.css) | HTML 类词汇（`.btn`、`.card`、`.set-row`…）+ `:lang(zh)` 中文层；引入 tokens.css |
| [primitives/](primitives/) | 15 个 Orca React 原语：`<名>.md` 使用说明、`<名>.html` 静态预览（加 `data-theme="dark"` 看深色）、`primitives.css` 预览样式；接口与行为以实际 TSX 为准 |
| [components/](components/)、[foundations/](foundations/) | 通用 HTML 控件与排版示例（纯 HTML、无脚本，浏览器直接开）；不作为 BW 外壳或完整交互模板 |

图标从 `lucide-react` 引入，不进本目录；产品标志统一使用 [`resources/icon-source/workbench.png`](../../resources/icon-source/workbench.png)，保留原图颜色与构图，浅色/深色主题均不反色；界面引用生成的 `resources/icon.png`，应用图标也在 [`resources/`](../../resources/)；Geist 字体文件在 `src/renderer/src/assets/fonts/`。

## 值从哪来、怎么不漂

- 颜色：tokens.json 里凡与 `main.css` 同名的 token（104 个），值必须逐一相等；`node config/scripts/design-system-tokens.mjs` 校验这一点并检查 tokens.css 是否过期，已接入 `pnpm run lint`。Tailwind 色板引用按 `tailwindcss/theme.css` 解析。
- Workbench 增补（usage 以 Addition 开头）与叠层角色（以 Overlay role 开头）不在 `main.css`，由本目录维护；增补要进产品代码时先进 `main.css`。
- 组件：接口和行为的唯一实现依据是 `src/renderer/src/components/ui/*.tsx`。`primitives/` 提供使用说明和部分状态的静态预览，不能替代 Radix 行为、键盘与焦点验证。原语变化时同步受影响说明和示例；不再维护独立的手工类型副本。
- 当前 BW 主题由 `WorkbenchShellBootstrap.tsx` 启用 `data-skin="ds"`、`data-theme="claude"`，`workbench-tokens.css` 叠加到基础 token 上；浅色为暖色背景和陶土色主动作，深色沿实际覆盖条件。基础 token 检查不覆盖这层最终显示效果，原型须另核对真实页面与主题。修改产品配色需要明确设计依据，不能把基础值镜像当作已认可的新皮肤。

## 范围外

- 15 个原语之外的 `components/ui/`（accordion、button-group、collapsible、color-picker、context-menu、hover-card、popover、progress、scroll-area、separator、sheet、slider、sonner、toggle、toggle-group、repo-multi-combobox）尚未写说明，用之前直接读源码。
- 终端符号字体 `Orca Nerd Font Symbols`、只用于单个界面的 `main.css` 配方（工作树卡片激活态、文件树选中、Sonner 细节、终端与 Markdown 预览样式）不登记为 token。
- claude.ai 上的设计系统页面（[Workbench Design System (Orca)](https://claude.ai/artifact/GysYQpWCHMe1nZEbtxvLVL)，仅所有者可见）是本目录的浏览视图：改动先进仓，再从仓同步过去，不反向改。
