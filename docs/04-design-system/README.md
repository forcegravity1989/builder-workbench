# Workbench 设计系统

> **本篇维护约定**：给要写界面、做原型、改样式的人和任何 code agent（Claude Code、Codex、Cursor……）读取，动手前先读。只写入口：怎么用、文件各是什么、值从哪来、怎么同步；规则正文在 [guidelines.md](guidelines.md)，不在这里重复。文件增删、正本或同步方式变化时更新。

> **30 秒导读**：Workbench 的界面语言与 Orca 对齐——单色、安静，颜色只留给状态。**值的正本是 [`src/renderer/src/assets/main.css`](../../src/renderer/src/assets/main.css)**，本目录是它的可读镜像加上 Workbench 的增补，全部是普通 Markdown / JSON / CSS / HTML，任何 agent 不需要专门工具就能读。写产品代码看 [guidelines.md](guidelines.md) + [primitives/](primitives/)；做不跑 React 的原型页只链 [styles.css](styles.css)。

## 按任务读

| 要做什么 | 读 | 用 |
|---|---|---|
| 改产品界面（React） | [guidelines.md](guidelines.md) → 对应的 `primitives/<名>.md` | `src/renderer/src/components/ui/` 的原语 + Tailwind token 类（`bg-card`、`text-muted-foreground`） |
| 改叠层 CSS（`src/renderer/src/workbench/*.css`） | [guidelines.md](guidelines.md)「Workbench 叠层怎么对齐」 | `var(--foreground)` 这类 Orca 名；存量的 `--color-*` 角色名见 tokens.json |
| 做原型、文档页、验收展示 | [guidelines.md](guidelines.md)「HTML 原型与文档页」 | `<link rel="stylesheet" href="…/04-design-system/styles.css">` + 类名，照示例页抄标记 |
| 查某个颜色/间距/圆角的值 | [tokens.json](tokens.json) | 每个 token 带 `usage`，说明用在哪、配在什么底上 |
| 加或改一个 token | 先改 `main.css`（`:root` 与 `.dark` 都给值，`@theme inline` 暴露），再同步 [tokens.json](tokens.json) | `node config/scripts/design-system-tokens.mjs --write` |

深色：应用在根节点加 `.dark`；文档页和原型在 `<html>` 或任意子树加 `data-theme="dark"`。中文页面声明 `lang="zh"` 启用中文排版层。

## 文件

| 路径 | 是什么 |
|---|---|
| [guidelines.md](guidelines.md) | 规则正文：文案、颜色角色、字体、层级、组件选型、图标、交互反馈、叠层对齐、中文排版、HTML 原型类 |
| [tokens.json](tokens.json) | 机读 token：颜色（light / dark 两主题，135 个）、字体与 10 个字号样式、间距、圆角、阴影；每个带 `usage` |
| [tokens.css](tokens.css) | **生成文件，不要手改**——由 tokens.json 生成的 CSS 变量与 Geist `@font-face` |
| [styles.css](styles.css) | HTML 类词汇（`.btn`、`.card`、`.set-row`…）+ `:lang(zh)` 中文层；引入 tokens.css |
| [primitives/](primitives/) | 15 个 Orca React 原语：`<名>.md` 用法与 props、`<名>.html` 浅色预览（加 `data-theme="dark"` 看深色）、`primitives.css` 静态复刻样式、`index.d.ts` props 类型 |
| [components/](components/)、[foundations/](foundations/) | HTML 类词汇的示例页（纯 HTML、无脚本，浏览器直接开） |

图标从 `lucide-react` 引入，不进本目录；Logo 与应用图标在 [`resources/`](../../resources/)；Geist 字体文件在 `src/renderer/src/assets/fonts/`。

## 值从哪来、怎么不漂

- 颜色：tokens.json 里凡与 `main.css` 同名的 token（104 个），值必须逐一相等；`node config/scripts/design-system-tokens.mjs` 校验这一点并检查 tokens.css 是否过期，已接入 `pnpm run lint`。Tailwind 色板引用按 `tailwindcss/theme.css` 解析。
- Workbench 增补（usage 以 Addition 开头）与叠层角色（以 Overlay role 开头）不在 `main.css`，由本目录维护；增补要进产品代码时先进 `main.css`。
- 组件：`primitives/` 是按 `src/renderer/src/components/ui/*.tsx` 的 Tailwind 类逐条翻译的静态复刻，选择器对齐真实的 `data-slot` / `data-variant`。原语改了外观，同步改对应的 `.md` 与 `primitives.css`。
- 叠层 CSS 当前仍由 `src/renderer/src/workbench/workbench-tokens.css` 给 `--color-*` 角色赋旧暖色值（`data-skin="ds"`）；切到本系统的值是另一项界面改动，本目录描述的是对齐后的目标值。

## 范围外

- 15 个原语之外的 `components/ui/`（accordion、button-group、collapsible、color-picker、context-menu、hover-card、popover、progress、scroll-area、separator、sheet、slider、sonner、toggle、toggle-group、repo-multi-combobox）尚未写说明，用之前直接读源码。
- 终端符号字体 `Orca Nerd Font Symbols`、只用于单个界面的 `main.css` 配方（工作树卡片激活态、文件树选中、Sonner 细节、终端与 Markdown 预览样式）不登记为 token。
- claude.ai 上的设计系统页面（[Workbench Design System (Orca)](https://claude.ai/artifact/GysYQpWCHMe1nZEbtxvLVL)，仅所有者可见）是本目录的浏览视图：改动先进仓，再从仓同步过去，不反向改。
