# Workbench 设计规范

> **本篇维护约定**：给写界面、做原型、改样式的人和任何 code agent（Claude Code、Codex 等）读取。只写视觉与交互规则、token 怎么用、组件怎么选；具体取值看 [tokens.json](tokens.json)，单个原语的细节看 [primitives/](primitives/)。结构：总则 → 文案 → 颜色 → 字体 → 间距/圆角/层级 → 组件选型 → 图标 → 交互 → 平台 → 叠层对齐 → 中文排版 → HTML 原型。Orca 规则原文在 [ref/STYLEGUIDE.md](../../ref/STYLEGUIDE.md)，两者冲突以 Orca 为准；规则或 STYLEGUIDE 变化时更新本篇。

Workbench 跑在 Orca 执行核上，界面语言就是 Orca 的：**单色、安静，颜色只留给状态。** 产品大部分时间在托管别人的工具（终端、Monaco、Markdown 预览、浏览器），所以自己的 chrome 要退后、做框。Workbench 叠层页面（总览、计划、验收、知识库、项目墙）与 Orca 原生界面用同一套 token、同一批 shadcn 原语，不另起皮肤。

拿不准时：先用 `muted` / `accent` / `border`，再考虑颜色；先用变量，再考虑写 hex；先找最近的原语，再考虑写自定义 CSS。

## 文案

- **不夸大。** 代码没有真实状态或结果数据，就不写「已跳过」「已保护」「已找到」「已验证」「已删除」。进行中用中性的过程语：「正在克隆…」→「正在安装…」。
- **写对象、动作、结果。** 必要时补失败原因和下一步。不展示内部协议、实现历史和代号。
- **直接动词 + 具体名词。** 删「请」「只需」「您可以」「简单地」这类填充；英文同理删 please / simply / just / you can。
- **没有解释性小字。** 标题不解释自己，同一状态不说两遍（色点 + 文字已够），空态给获取数据的动作而不是自述。
- 按钮写动作：「删除工作树」「创建工作树」，不是「确定」。取消就是「取消」。
- 数字、计数、快捷键右对齐；文字左对齐。

## 颜色

Token 成对使用：一个面 + 一个在其上达标的前景。

| 面 / 前景 | 用于 | 不用于 |
|---|---|---|
| `background` / `foreground` | 应用画布、默认文字 | 卡片、浮层、侧栏（各有自己的面） |
| `card` / `card-foreground` | 从画布抬起的面板 | 画布本身 |
| `popover` / `popover-foreground` | 不透明浮层（Command 根、hovercard） | 菜单与 Select（用半透明菜单配方） |
| `primary` / `primary-foreground` | 一个流程里唯一的肯定动作 | 装饰、悬停、次要动作 |
| `secondary` / `secondary-foreground` | 紧挨 primary 的次要实心动作 | 肯定动作 |
| `muted` / `muted-foreground` | 降级文字、说明、占位、禁用 chrome | 正文、主动作 |
| `accent` / `accent-foreground` | ghost 按钮与列表行的悬停/激活底 | 实心按钮（用 `secondary`） |
| `destructive` | 删除、丢弃、不可逆；错误态 | 取消 |
| `border` | 所有细线：分隔、卡边、输入框外框 | 重强调（那是 `ring`） |
| `input` | 表单控件外框与暗色填充 | 表单以外 |
| `ring` | focus-visible 外圈、选中光晕 | 常驻装饰 |
| `sidebar*` / `worktree-sidebar*` | 各自的侧栏及其子元素 | 其他面板 |
| `editor-surface` | Monaco 与 Markdown 编辑区 | 应用 chrome |

**状态色，各管一件事：**
- `agent-question`（橙）= 「有 agent 在问你」，所有出现它的面同一色；其上的字用 `agent-question-text`。不挪作他用。
- `ai-action-accent`（紫）= 把活交给 AI 的动作，只做图标/点缀。
- `status-success` 成功；底 `status-success-background`、边 `status-success-border`。
- `workspace-status-done` / `-review` / `-progress` 是 PR 状态，两套主题同色，只做圆点。
- `git-decoration-*`、`diff-*`、`git-graph-*` 只用于 git 状态，沿用 VS Code 配色。
- 图表用 `chart-1`…`chart-5`，一个蓝色按明度排开。
- `warning` / `warning-background` / `warning-text`、`destructive-background` 是 **Workbench 增补**（`tokens.json` 里 usage 以 Addition 开头）：Orca 没有警告色，叠层的状态标签需要。产品代码要用，先把它们加进 `main.css` 两套主题并在 `@theme inline` 暴露。
- 状态永远配文字或图标，不靠颜色单独区分。

**列表行**（工作树、命令面板、设置导航）：静止透明；悬停 `accent`（工作树侧栏里用 `sidebar-accent`）；键盘选中不要只铺 `accent`——浅色浮层上它几乎看不见，用 jump-palette 配方（`foreground` 12% 混入 `background` + 1px 内描边）；持续的「当前」行同样 `accent`，再加 `data-current="true"`。

**混色**不造新 hex：`color-mix(in srgb, var(--primary) 12%, var(--background))`，明暗自动对齐。

**对比度**（本系统 token 实测）：`muted-foreground` 在 `background` 上浅 4.7:1、暗 7.7:1，在浅色 `muted` 上只有 4.3:1——那里只放 11px 以上半粗的元信息。两处源值未达标、原样保留并已在 token 说明里标注：浅色 `ring`（#a1a1a1 在白底 2.6:1，低于焦点环 3:1），暗色 `destructive-foreground` 不能叠在 `destructive` 上（1.7:1；组件实际用白字叠 60% 填充）。

## 字体

- 无衬线一律 **Geist**（单个可变字重 woff2，100–900），不用 Inter 或系统字体；汉字不点名字体，落到系统中文字体（见「中文排版」）。
- 等宽 `mono`：路径、分支、命令、终端相邻界面——凡是「这是字面量」的地方。
- 正文字距 0.01em 是全局设置，组件里不要改。
- 字号走 Tailwind 刻度，常用四档：11px `meta`（全大写、600、0.05em，用于分类标签与侧栏标题）、12px `secondary`（次要文字、路径、说明）、13px `row`（侧栏项、密集列表行）、14px `body`（默认正文与按钮）。弹窗标题 `dialog-title` 18px，卡片标题 `card-title` 16px，菜单项 `menu-item` 12px / 450。

## 间距、圆角、层级

- 间距是 Tailwind 的 4px 步进（`spacing-1` = 4px）。表单整节 `space-y-3`、紧凑单控件 `space-y-2`、标签组 `space-y-1`。
- 圆角由 `radius`（10px）推出：按钮与输入 `radius-md` 8px，卡片 `radius-xl` 14px，弹窗与标签列表 `radius-lg` 10px，命令/下拉项 `radius-sm` 6px，徽标全圆。沿用最近原语的圆角，不新造。
- 层级只有三档：**细线**（`border`，几乎一切都在这一档）→ **轻抬**（`shadow-xs` + 单 token 边框，outline 按钮、嵌入卡片）→ **浮起**（`shadow-floating`，逃出编辑区的弹出物，保留使用）。不加第四档；需要更强调时多半该用 `ring`。菜单、Select、弹窗各有一套半透明面 + 14% 边 + 双阴影 + 背景模糊的配方（见各组件）。
- 卡片必须与父面可分；卡片里不套卡片；不是重复项、弹窗或工具框的区块，不加框或用通栏。
- 复杂流程默认逐行布局；只有空间受限或「对比本身就是目的」时才左右分栏。

## 组件选型

| 想要 | 用 | 别用 |
|---|---|---|
| 图标按钮的悬停名称 | `Tooltip` | HoverCard、title 属性 |
| 悬停预览富内容 | `HoverCard` | Tooltip |
| 点击出动作列表 | `DropdownMenu` | 手搓 Popover 列表 |
| 右键动作 | `ContextMenu` | DropdownMenu |
| 点击出任意内容（表单、选择器） | `Popover` | Dialog |
| 必须先做决定的模态 | `Dialog` | Popover、行内浮层 |
| 从边缘滑出的面板 | `Sheet` | 居中 Dialog |
| 已知短列表单选 | `Select` | 自制 listbox |
| 需要搜索的单选 | `Command` + `Popover` | Select |
| 带搜索的多选 | 照 `repo-multi-combobox` | 再造一个 |
| 瞬时确认（已保存、已复制） | sonner toast | Dialog、横幅 |
| 持续的行内状态（3 个错误） | 行内文字 + `Badge` | toast |

原语保留根节点的 `data-slot`；类合并用 `cn()`，调用方 `className` 放最后；多变体用 CVA。不重写无头行为，扩展现有封装。

## 图标

只用 **lucide-react**（0.577），不引第二套。默认 16px（`Button` 自动套用）；元信息与密集行 12–14px；空态主图标 28px 起。线宽保持 2px。颜色继承文字色（`muted-foreground`、`destructive`…），不单独给 SVG 上色。加载图标统一 `loader-circle` 旋转；超过 3 秒的多步工作用阶段文字代替无标签转圈。示例见 `foundations/icons.html`。

快捷键只用 `ShortcutKeyCombo`：Mac 显示 `⌘ ⇧` 字形相邻无分隔，Windows/Linux 显示 `Ctrl+Shift+`。标签必须与该平台的真实绑定一致；取消、关闭和 link 动作上不放快捷键。

滚动条三种：`.scrollbar-sleek`（默认）、`.scrollbar-editor`（编辑器相邻面）、`.worktree-sidebar-scrollbar`（仅工作树侧栏）。不写第四种。

## 交互与反馈

| 耗时 | 反馈 |
|---|---|
| 0–100ms | 无，任何可见变化都像故障 |
| 100ms–1s | 只禁用 |
| 1–3s | 禁用 + 转圈或换文字 |
| 3s 以上或多步 | 阶段文字、进度 |

- 先预留之后要占的空间（用 `width` 不用 `min-width`），控件不在动作中改变大小。
- 本地快、远程（SSH）慢的动作：禁用立即绑定，可见加载态延后约 200ms。
- 退出路径不加重：取消、关闭、丢弃不是 destructive，用 ghost、无颜色、无快捷键。
- 弹窗、浮层、命令面：默认焦点落在最可能用的输入或主动作上，回车触发主动作，Esc 退出。
- 高频动作放在最顺手的位置，低频动作收进菜单或高级区；常见流程 1–2 步完成。
- 动画只用来交代展开/收起的连续性，尊重「减少动态效果」。
- 相邻组件读起来是一个设计：同图标、同快捷键约定、同提交语义。

## 平台与主题

macOS、Windows、Linux 三端，明暗两套主题都要成立。修饰键按平台选（Mac `metaKey`，其他 `ctrlKey`；菜单加速键 `CmdOrCtrl`）。macOS 标题栏左侧 80px 留给红绿灯，不放可点区域。暗色切换：应用在根节点加 `.dark`；文档页与原型在 `<html>` 或任意子树加 `data-theme="dark"`（两者 `tokens.css` 都认）。插件主题可以改皮肤，但来源与授权界面锁定 `orca-security-*`，插件改不动。

## Workbench 叠层怎么对齐

- 叠层页面用上面的 token 和 `src/renderer/src/components/ui/` 原语，不另起皮肤。
- 叠层 CSS 现有的 `--color-*` 角色名（`color-text`、`color-divider`、`color-neutral-600`、`color-success-soft`…）已并入 `tokens.json`，**改指向 Orca 的值**（usage 以 Overlay role 开头，写明对应哪个 Orca token）。新写的叠层 CSS 直接用 Orca 名（`--foreground`、`--border`、`--muted-foreground`），角色名只为存量代码保留。
- **同名不同义，小心 `--color-accent`**：叠层角色 `--color-accent` = 主色 `primary`；Tailwind 主题里的 `--color-accent`（`bg-accent` 背后那个）= 灰色悬停底 `accent`。新代码不要再写 `--color-accent`。
- 旧类映射：`.wb-btn-primary` → Button `default`，`.wb-btn-secondary` → `outline`，`.wb-btn-ghost` → `ghost`，`.wb-btn-sm` → `size="xs"`（24px）；`.wb-card` → Card；`.wb-tag-*` → Badge（成功用 `dot` + `status-success`，危险用 `destructive`，其余 `outline` / `secondary`）；`.wb-mono` → `font-mono`；`.wb-muted` → `muted-foreground`。
- 叠层需要新颜色时，先进 `main.css` 的 `:root` 与 `.dark` 并在 `@theme inline` 暴露，再登记到 `tokens.json`；不在叠层 CSS 里写 hex。

## 中文排版

- 字体栈只点名拉丁字族（Geist），汉字落到各平台系统默认：macOS / iOS 苹方，Windows 微软雅黑，Android / Linux 思源黑体。不加载、不点名中文字体。数字、ID、代码与快捷键在中文语境里仍是拉丁与等宽。
- 中文页面或子树声明 `lang="zh"`（应用里随界面语言设置）。`styles.css` 末尾的 `:lang(zh)` 层随之生效：
  - 标题字距归零——拉丁的负字距会让汉字粘连；
  - 正文行高 1.7、字距 0.02em；
  - 强调用 600 字重，不用斜体（汉字没有斜体）；
  - 最小标签从 10px 升到 11px，汉字不低于 11px；
  - 中西文间距与标点挤压交给 `text-autospace` / `text-spacing-trim`（浏览器支持时）。
- 字重：苹方原生有 500 / 600；微软雅黑映射为粗体，可以接受。示例见 `foundations/cjk.html`。

## HTML 原型与文档页

原型、文档页、验收展示这类**不跑 React** 的页面，只链一份 `styles.css`（它会引入 `tokens.css`），用下面的类搭，不写自定义颜色。类名沿用原 Builder，值全部来自 Orca；产品代码不用这些类，用 React 原语。

| 类 | 用途 | 示例页 |
|---|---|---|
| `.btn` + `-primary` / `-secondary` / `-ghost` / `-danger` / `-icon` / `-block` | 操作；每视图一个实底主操作，danger 只给不可逆确认 | `components/buttons.html` |
| `.tag` + 变体、`.kbd` | 胶囊标签、按键芯片 | `components/buttons.html` |
| `.field` / `.input`（含 `select.input`、`textarea.input`）/ `.radio` / `.seg` | 表单、分段控件 | `components/forms.html` |
| `.card` 系列、`.board` 系列 | 卡片、看板列 | `components/cards.html` |
| `.status` + `.status-dot` + `-todo` / `-progress` / `-review` / `-done` / `-blocked` | 状态点 + 文字；进行中/评审/完成取 `workspace-status-*`，阻塞取 `destructive` | `components/status.html` |
| `.avatar` 系列 | 人圆形，Agent 方圆角 | `components/status.html` |
| `.nav`、`.sidebar` 系列、`.tabs` + `.tab` | 顶栏、侧栏（28px 行）、下划线标签页 | `components/navigation.html` |
| `.list` + `.list-row`、`.table` | 密集事项行（等宽 ID、标题省略）、数据表 | `components/table.html` |
| `.dialog` 系列、`.toast` 系列 | 模态、反色通知 | `components/dialog.html` |
| `.cmdk` 系列 | ⌘K 命令面板 | `components/command.html` |
| `.page-head`、`.section`、`.set-group` + `.set-row`、`.toggle`、`.choice`、`.path` | 设置页骨架 | `components/settings.html` |
| `.frame` | 图像框：发丝线、小圆角 | `foundations/image.html` |

**设置页骨架**（原型用；应用内设置页沿用 Orca 的 `components/settings/`）：`.page-head`（标题、页级动作靠右）→ 若干 `.section` → 每节一张 `.set-group`。一行 `.set-row` = 左边标题 + 至多一句说明，行尾一个控件（开关、`.seg`、`select.input`、`.input`、`.path` + 次按钮、或 `.status`），控件落在同一条竖线上。自己就能生效的控件不配保存键；打一半不能生效的自由输入旁边留一颗安静的「保存」。
