# Spec · 壳接上 Builder 设计系统

> **30 秒导读**:壳的全局样式 = `docs/04-design-system/styles.css`(编译期原样拼入)+ `crates/app-shell/assets/shell.css`(壳骨架、各屏版式、壳独有小件,只取 `var(--*)`)。八屏标记按下面的对照表换成设计系统的组件类;旧 `hifi.css` 与旧 token 整体删除。可点原型就是设计系统的示例页。

上游意图见 [`intent.md`](intent.md)。

## 可点原型

- 组件:[`../../04-design-system/components/`](../../04-design-system/components/)(buttons · forms · cards · navigation · table · dialog + toast · command · status + avatars)。
- 基础:[`../../04-design-system/foundations/`](../../04-design-system/foundations/)(color · type · cjk · layout · icons · image)。
- 版式与旅程:[`../../hifi/index.html`](../../hifi/index.html)(块顺序、控件、点什么发生什么)。

浏览器直开,查源码即抄。

## 设计拍板

1. **两层一张表**:`styles.css`(设计系统,正本在 `docs/04-design-system/`)在前,`shell.css`(壳层)在后,`theme::GLOBAL_CSS` 编译期 `concat!` 拼成一张挂到 `document::Style`。壳不复制设计系统文件。
2. **配色 Claude 板**:根节点 `data-theme="claude"`;`lang="zh"` 启用中文排版层。Apple 板留在表里,不做切换入口。
3. **壳层只写设计系统没有的东西**:图标轨、项目轨头部、内容区、各屏的网格 / 列宽 / 高度、进度条、折线图、指南抽屉、忙碌遮罩、一步一句回执。取值一律 token,不写色号 / 字体名。
4. **屏里只写 class**:允许的行内 style 只有数据驱动的值(`width:{pct}%`、`--status-c:{color}`、`--swatch:{color}`、提示框定位、`z-index`)。
5. **不造平行类**:设计系统有的(按钮、标签、表单、卡片、侧栏、页签、分段、列表、表格、看板、弹窗、toast、状态点、头像)一律用它的;壳层类只做版式修饰(如 `.kcard` 只管拖拽态与内边距,长相来自 `.card`)。
6. **卡片不套卡片**:总览指标块、走势框、知识库统计格改成发丝线分隔。
7. **一个视图一颗实底主按钮**;取消 / 关闭用 secondary 或 quiet ghost;不可逆确认用 danger。
8. **状态语义**:待办 `status-todo`(中性)、进行中 `status-progress`(警示色)、待评审 `status-review`(第二强调色)、完成 `status-done`(成功色)、阻塞 `status-blocked`(危险色);标签形态对应 `tag-neutral / -warning / -accent-2 / -success / -danger`。健康灯沿用成功 / 警示 / 危险 / 中性四色,Unknown 灰。
9. **toast**:设计系统的深色底角条;不自动消失,点「关闭」才关。
10. **高保真降级**:`docs/hifi/` 顶部加历史横幅,只作版式与旅程原型;`index.html` 的 `<style>` 不再搬。

## 类名对照(旧 hifi → 设计系统)

| 旧 | 新 |
|---|---|
| `btn` / `btn btn-sm` | `btn btn-secondary` |
| `btn btn-primary` | `btn btn-primary`(每视图一颗) |
| `btn btn-ghost` | `btn btn-ghost`;关闭型图标按钮 `btn btn-ghost btn-quiet btn-icon` |
| `chip` / `chip-clay` / `chip-outline` / `chip-green` / `chip-red` / `chip-gray` | `tag tag-neutral` / `-accent` / `-outline` / `-success` / `-danger` / `-neutral` |
| `il-pill status-*` | `tag tag-*`(见拍板 8) |
| `dot` / `dot-lg`(健康灯) | `status-dot` / `status-dot status-dot-lg` + `--status-c` |
| `status-dot dot-gray/amber/green/red` | `status-dot status-todo/-progress|-review/-done/-blocked` |
| `formrow` + `label.label` + `input.input` / `textarea.textarea` / `select.select` | `field` + `label` + `input.input` / `textarea.input` / `select.input` |
| `card`(带阴影) | `card`(发丝线,无阴影;`elev-sm` 才有浮起) |
| `projectrail` + `pr-link.active` | `sidebar` + `sidebar-item[aria-current=page]` |
| `topbar` + `topbar-title` + `demo-tag` | `nav` + `nav-brand` + `tag tag-outline mono` |
| `ov-tabs/ov-tab.on`、`sess-tabs/sess-tab.active`、`tabbtn-row/tabbtn.active` | `tabs` + `tab[aria-selected=true]` |
| `ov-seg/ov-seg-btn.on`、`kanban-segtabs/seg-tab.active`、`pillrow/pill.active`、`il-presets/il-preset.on` | `seg` + `seg-opt` + 隐藏 radio |
| `kanban` / `kanban-col` (+`col-*` 底色) / `kanban-col-head` / `kcard` | `board` / `board-col` / `board-col-head` / `card kcard` |
| `il-row` / `issue-list` | `list-row` / `list issue-list` |
| `table.tbl` | `table.table` |
| `modal-backdrop` / `modal` / `modal h3` / `modal-lead` / `modal-actions` / `modal-banner` | `dialog-backdrop` / `dialog` / `dialog-title` / `dialog-body` / `dialog-actions` / `dialog-note` |
| `toast.show` + `toast-x` | `toast` + `toast-action` |
| 行内 `color:var(--ink-3)` 小字 / `var(--ink-2)` 正文 / `var(--alert-deep)` | `hint` / `text-muted` / `text-danger` |

旧 token 与新 token 的对应:`--paper`→`--color-bg`、`--rail-bg`→`--color-surface`、`--card`→`--color-card`、`--ink`→`--color-text`、`--clay`→`--color-accent`、`--agent`→`--color-accent-2`、`--green/--amber/--red/--gray`→`--color-success/-warning/-danger/-neutral-400`、`--border`→`--color-divider`、`--serif/--sans`→`--font-body`(系统字体,不再用衬线)、`--mono`→`--font-mono`。

## 操作逻辑

纯视觉层,所有交互路径不变:

- 主路径:打开壳 → 项目墙 / 接入 / 设置 / 总览 / 计划(看板 + 列表 + 弹窗)/ 会话 / 配置 / 知识库,每屏渲染与点击行为同改前。
- 分支:分段控件从「按钮 + active 类」改成「label + 隐藏 radio」,选中态由 `checked` 驱动,`onchange` 调原来的点击逻辑;页签用 `aria-selected`;侧栏当前项用 `aria-current`。
- 出错:样式不参与错误处理;失败原话仍走 toast(不自动消失)与就地 `text-danger`。

## 硬核挑战 / FAQ

- **WebView 支持?** `color-mix()` 与 `:has()` 在 macOS WebKit(Safari 16.2+)与 WebView2(Chromium)都可用;旧 `hifi.css` 已在用 `:has()`。
- **中文字体?** 设计系统栈只点名拉丁面,汉字落到各平台系统默认(苹方 / 微软雅黑),`lang="zh"` 的 `:lang(zh)` 层收字距与行距,零上传。
- **代价?** 一次性改 13 个屏文件的标记;之后改 token 一处生效。
- **成功指标?** 壳里零旧 token(`grep 'var(--clay\|--ink' crates/app-shell` 为空)、零带色号 / 字号的行内 style、`cargo check -p app-shell` 与八条门禁全过、深链八屏截图肉眼对照设计系统示例页。
- **不做**:Apple 板切换入口;Lucide 图标替换;命令面板(`cmdk`)——壳里没有这个交互。
