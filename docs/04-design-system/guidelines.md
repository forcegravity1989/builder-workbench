# Workbench 设计规范

> **本篇维护约定**：给写界面、做原型、改样式的人和任何 code agent（Claude Code、Codex 等）读取。只写视觉与交互规则、token 怎么用、组件怎么选；具体取值看 [tokens.json](tokens.json)，单个原语的细节看 [primitives/](primitives/)。结构：总则 → 文案 → 颜色 → 字体 → 间距/圆角/层级 → 组件选型 → 按钮与新增入口 → 图标 → 交互 → 平台 → 叠层对齐 → 中文排版 → HTML 原型。Orca 规则原文在 [ref/STYLEGUIDE.md](../../ref/STYLEGUIDE.md)，两者冲突以 Orca 为准；规则或 STYLEGUIDE 变化时更新本篇。

Workbench 跑在 Orca 执行核上，界面语言就是 Orca 的：**单色、安静，颜色只留给状态。** 产品大部分时间在托管别人的工具（终端、Monaco、Markdown 预览、浏览器），所以自己的 chrome 要退后、做框。Workbench 叠层页面（总览、计划、验收、知识库、项目墙）与 Orca 原生界面用同一套 token、同一批 shadcn 原语，不另起皮肤。

拿不准时：先用 `muted` / `accent` / `border`，再考虑颜色；先用变量，再考虑写 hex；先找最近的原语，再考虑写自定义 CSS。

## 文案

- **不夸大。** 代码没有真实状态或结果数据，就不写「已跳过」「已保护」「已找到」「已验证」「已删除」。进行中用中性的过程语：「正在克隆…」→「正在安装…」。
- **写对象、动作、结果。** 必要时补失败原因和下一步。不展示内部协议、实现历史和代号。
- **失败先给可理解、可处理的反馈。** 用户触发的短暂失败复用 Orca 的全局轻量通知（Sonner toast）。数据持续不可用、草稿未保存或用户需要在原位置重试时，在受影响的区域显示明确的错误状态和恢复动作。页面正文、工具提示与通知摘要不得直接拼接异常、命令输出或堆栈。技术原因放在可展开的详情及已有诊断日志中，沿用日志的凭据脱敏与输出限制。
- **直接动词 + 具体名词。** 删「请」「只需」「您可以」「简单地」这类填充；英文同理删 please / simply / just / you can。
- **没有解释性小字。** 标题不解释自己，同一状态不说两遍（色点 + 文字已够），空态给获取数据的动作而不是自述。
- 按钮文字写「动作 + 对象」，如「删除工作树」「创建工作树」。上下文已明确时可简写「取消」「保存」。按钮用文字还是图标，见[按钮与新增入口](#按钮与新增入口)。
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
| 纯图标按钮的悬停与聚焦提示 | `Tooltip` | HoverCard、title 属性 |
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

## 按钮与新增入口

**优先用易认的图标，把按钮放在动作对象旁边。** 用户应能凭图标、相邻标题或行内容判断点下去会做什么。BW 叠层与原型复用 Orca 的 Button、Tooltip、DropdownMenu 和现有 token。

| 场景 | 用法 |
|---|---|
| 页面、区块或集合的新增入口 | 归属清楚时直接用 `Plus`。页级动作用稳定的页头位置，如「项目墙」里的 `+`。区块级动作放在标题同一行的固定操作位，如「本版目标」的 `+`。列表末尾也可以承载 `+`，前提是它紧跟最后一项，能看出是给哪组内容加一项。 |
| 同屏的新增动作容易混淆 | 用「对象或动作图形 + 加号」组成一个图标，优先用现有 Lucide 图标，如 `CalendarPlus` 表示新增一段排期。对象图形从当前界面选，加号保持清楚，整个组合与同组按钮共用命中区和层级。 |
| 图标与上下文仍不清楚 | 紧凑处可用一至两个字表达动作，例如「重试」。先核对标签能不能说清点下去会做什么，以及它和同组按钮是否协调。无法简写的动作放到有空间的区域，次要动作也可用有明确名称的菜单项承载。 |
| 空态或前提未满足 | 让用户直接看到第一步。需要先进入规划、选项目或配置时，显示实际可执行的前置动作。空态或弹窗有空间时，可用明确的完整文字。区分真正为空、筛选无结果和读取失败，提供对应操作。 |
| 提交、取消、删除确认 | 沿用现有按钮层级和动作文字，如「保存草稿」「取消」「删除工作树」。完整文字用于讲清结果。 |

- 主要入口在可操作时保持可见，Tooltip 使用简短的动作名称。行或区块已经说明对象时，提示中无需重复。编辑态专属动作继续随编辑态出现，进入编辑的入口需要清楚。可随悬停出现的补充动作也要能通过键盘找到和触发。
- 同一区域里重复出现的标题操作使用同宽的操作位，图标和标题垂直居中。标题长短、换行或截断都不推动操作位横向移动。窄窗维持按钮与所属区块的关系，同组操作保持一致的尺寸与样式。每个流程只有一个实底主动作。
- 纯图标按钮用 `aria-label` 或 `aria-labelledby` 提供完整动作名称，重复动作加上必要的对象上下文。短标签无法表达全义时，可访问名称包含可见短标签及完整动作。Tooltip 在悬停和聚焦时显示。采用原生按钮语义，键盘可聚焦、有可见焦点，Enter 和 Space 可触发。按钮命中区至少 24 × 24 CSS px。

**走查办法。** 隐去 Tooltip，检查空态、有内容和窄窗。用户能否从控件和附近内容说出「做什么、对谁做」，以及同时看到多个新增入口时能否区分。用长短不同的标题检查操作列是否对齐，在实际按钮尺寸下检查组合图标的两部分是否都能辨认。再用键盘检查焦点、提示和触发结果。实际改变入口时，同批更新所属特性规格，并核对[引导与旅程矩阵](guidance.md)中的相关说明、演示与定位。

### 设计依据

- [IBM Carbon 按钮规范](https://www.carbondesignsystem.com/building-blocks/core/components/button/guidelines)说明纯图标适用于易识别或紧凑的场景。[Wiedenbeck 的按钮实验](https://www.tandfonline.com/doi/abs/10.1080/014492999119129)中，新手对图标配文字的易用性评价更好。BW 优先让摆放位置和相邻内容提供语义，在图标与上下文仍不足时补文字。
- [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/adding-items-to-your-project)和 [Notion](https://www.notion.com/help/intro-to-databases)提供集合内新增，[Linear](https://linear.app/changelog/2025-01-23-pull-request-reviews)使用列表分组或看板列里的加号，[Jira](https://support.atlassian.com/jira-software-cloud/docs/create-a-work-item-and-a-subtask/)同时提供全局和上下文创建。BW 按新增对象的作用范围选位置。
- 键盘操作与可访问名称依据 [WAI Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)；24 CSS px 命中区参考 [WCAG 2.2 目标尺寸](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)，沿用 Orca 已有尺寸。

## 图标

只用 **lucide-react**（0.577），不引第二套。默认 16px（`Button` 自动套用）；元信息与密集行 12–14px；空态主图标 28px 起。线宽保持 2px。颜色继承文字色（`muted-foreground`、`destructive`…），不单独给 SVG 上色。加载图标统一 `loader-circle` 旋转；超过 3 秒的多步工作用阶段文字代替无标签转圈。示例见 `foundations/icons.html`。

通用操作图标固定映射：刷新 `RefreshCw`、导入 `FileInput`（文件形状）、新增 `Plus`、关闭 `X`、打开总览 `ExternalLink`、配置 `SlidersHorizontal`。是否同时显示动作文字见[按钮与新增入口](#按钮与新增入口)。Builder 摘要采用「状态点 + Builder 名称」，设备详情放配置内；健康无数据时为未知，不装绿。

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

原型、文档页、验收展示这类**不跑 React** 的静态页面，只链一份 `styles.css`（它会引入 `tokens.css`），用下面的类搭，不写自定义颜色。React/生成型原型不套这条静态 HTML 入口规则，应沿用 token、React 原语和现有构建入口；源码是可编辑正本，生成物由构建更新，不手改生成物或打包依赖。类名沿用原 Builder，值全部来自 Orca；产品代码不用这些静态类，用 React 原语。

| 类 | 用途 | 示例页 |
|---|---|---|
| `.btn` + `-primary` / `-secondary` / `-ghost` / `-danger` / `-icon` / `-block` | [按钮与新增入口](#按钮与新增入口)；danger 只给不可逆确认 | [按钮示例](components/buttons.html) |
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

**原型注释**：屏上说明文字只有**不会落地到最终界面**、仅用于评审和阅读时才写注释，一律以「**原型注释：**」开头，并用弱化样式（次要文字色、斜体等）呈现，让人一眼分清哪些是最终 UI 文案、哪些只是原型辅导。新增内容统一使用全角冒号；已有半角「原型注释:」在迁移期可保留，不因格式统一单独改动活动特性。注释密度要控，不把整屏堆满说明，一句能说清的不铺多行。原型注释不进入生产文案，生产文案同[文案](#文案)章。

**参考来源**：有外部产品、规范或做法作为参考时，注明对象和来源或链接；没有外部参考时，明确标为「自有设计」或「无外部参考」。这只说明设计出处，不把参考内容当作已交付能力。

**阶段切换**：要看原型在空态 / 进行中 / 完成等不同阶段的样子时，在原型内提供阶段切换，但**阶段数量要控制**：不要为一个提示的几种情况就铺几个筛选窗、几个原型又基本长一样；只取能体现差异的关键阶段，重复形态合并，避免让人困惑。

**复用标注**：特性只改局部时，未改到的区域不重画一遍冒充新设计；直接标为「**复用 {模块 / 原语}**」并链到既有界面或原语，说明沿用来源。

**跨特性复用与公共外壳**：特性 A 需要展示特性 B 的入口或交互时，A 只保留进入 B 的路径、上下文和本特性的变化，直接链接或嵌入 B 的**当前入口**；不复制 B 的页面、侧栏、示例数据或旧稿。B 没有独立当前入口时，回链 B 的 `spec.md`/真实代码并标明“复用 B”，不要在 A 内补画一份替代界面。项目墙、项目上下文、侧栏、版本导航、会话区、状态栏等公共 BW 外壳以当前真壳和设计系统原语为来源；特性原型可以用评审框架表达位置，但必须标注“复用当前 BW 外壳”，只绘制本特性改变的区域。公共外壳或入口变化后，同一交付内更新受影响原型的壳标注和入口映射，清除继续呈现旧壳的副本；历史评审需要保留时只能标为历史并用固定提交追溯。

**并行工作树保护**：变更前先检查仓库 worktree 和分支是否有未合入的原型、正文或生成源。被其他工作树认领的文件先登记路径、负责人/分支和当前身份，视为冻结资产；在负责人定稿并回收变更前，不覆盖、删除或重命名。清理和重绘应在合并或 rebase 后按最终入口重新核对。

**原型评审框架与产品页头分层**：原型评审条不是产品页头，不能把评审信息伪装成最终 UI，也不能借评审条冻结所有产品页面的标题文案。产品页头遵循真实 BW/Orca 页面和本篇的 `.page-head`、导航、页级动作规则；不同产品页可按信息层级有不同标题、面包屑和动作位置。可点原型先使用 `styles.css` 的 `.bw-prototype-shell`、`.bw-prototype-topbar`、`.bw-prototype-sidebar`、`.bw-prototype-main` 表达 BW 应用骨架；评审信息放在主内容页头下的 `.bw-prototype-review-note`，只在确有场景切换或多页导航时使用 `.prototype-review-bar`，不能把多个评审条堆在应用最上方。原型正文可以按特性需要变化，但不能另造一套 BW 外壳。原型在正文外另设评审框架时，按以下三层组织：

1. **当前壳层**：需要表达原型位于 BW 哪个区域时，复用当前真壳、设计系统原语或现行页面入口；侧栏、项目上下文、版本导航、会话区、状态栏等不由特性原型重新发明。无法完整复用时只画必要的定位框，并标明“原型注释：复用当前 BW 外壳”，不能把旧壳当作现行布局。
2. **评审信息层**：只写评审需要知道的内容：所属特性、原型/历史身份、当前壳来源、示例数据或真实读回边界、适用场景，以及 `intent.md`、`spec.md`、`STATUS.md` 等来源入口。它可以是顶端条、页头旁注或设计说明面板；位置和视觉可复用已有设计系统组件，不要求所有特性使用同一段固定文案。
3. **特性内容层**：只展示本特性新增或改变的用户路径、状态和结果。场景切换、重置、来源导航等评审工具放在评审信息层或现有工具区；正式产品没有的控件必须有“原型注释”标识。跨特性内容直接链接或嵌入被复用特性的当前入口，不复制页面和示例数据。

每份原型都要能在进入主要内容前回答“它属于哪个特性、位于 BW 哪个区域、这份稿改变什么、哪些内容复用、数据是否真实”。至少在可见评审信息或所属 `spec.md` 中提供 `shell/source/data boundary/changed area` 四项；简单原型可以只提供最小评审信息层。评审信息不足或公共壳过时的原型不能继续作为当前稿。页头、评审条和内容区的具体取舍写在所属 `spec.md`，本篇只规定职责边界和最低信息。共享壳元数据只描述评审边界；静态标签不代表版本、任务、目标或指标已经由运行时真实读回。

**控件与文案**：原型屏与产品屏一致遵循[文案](#文案)章——优先图标 + Tooltip，密集的次要操作不铺文字按钮；按钮具体形态以文案章和已认可决定为准，真机验证发现纯图标过隐蔽时用图标 + 短动词文字，不强制纯图标。原型只表达目标态，不引入正式界面没有的操作。
