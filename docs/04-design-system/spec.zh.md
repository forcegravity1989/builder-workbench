# Builder 设计系统(中文指南)

> English guide: [spec.md](spec.md) — 规范以英文版为准,本文为对照译本。

Builder 安静、紧凑、精确 — 与 Orca / Multica / Linear 同族的工具 UI。**单色界面骨架承载一切;色彩只用于状态和唯一的主操作**。发丝线负责结构,系统字体栈负责表达,一切落在紧凑的 4px 网格上,圆角 6–12px。一份样式表内置**两套配色**:**Apple**(默认 — 白底、系统蓝)与 **Claude**(暖象牙底、陶土色)。

## 用法

- 每个页面只链一份样式表 — `<link rel="stylesheet" href="styles.css">`(按相对路径调整),所有颜色、字体、间距、圆角、阴影一律取自其变量(`var(--color-*)`、`--font-*`、`--space-*`、`--radius-*`、`--shadow-*`)。凡 token 已承载的值,不得硬编码。
- **切换配色:** Apple 配色在 `:root` 上;给 `<html>`(或任意子树)加 `data-theme="claude"` 即整体切换 — 全部 token 重新解析,组件零改动。
- 用下方组件类搭建,不要另起炉灶;组件页是纯 HTML,查看源码即可复制标记。
- 起步模板(`templates/landing`、`templates/deck`)留在来源 Claude Design 项目里(见 [README.md](README.md)),本镜像不含;做独立页面时从那边复制。

## 方向

左对齐、贴网格、紧凑。骨架保持中性:底色、发丝线与墨色叠加负责结构;饱和色只出现在主操作、链接、焦点与状态上。行落在可见网格上 — 文字靠左,数字 / 计数 / 快捷键靠右、用等宽字体。对齐与分组让"密"成为更快的扫读,装饰不是。宁用留白加一条发丝线,不用盒中盒;卡片永不嵌套。

## 色彩

两套主题定义同一组角色:`--color-bg`(画布)、`--color-surface`(安静的壳 — 侧边栏、看板列)、`--color-card`(有界内容组)、`--color-text`、`--color-accent`、`--color-accent-2`,以及 neutral / accent / accent-2 各自的 100–900 色阶 — 在 OKLCH 中按同一亮度尺生成,任一主题任一色阶的同一档位视觉权重一致。

- **Apple:** 白 `#ffffff`、灰 `#f5f5f7`、墨 `#1d1d1f`、蓝 `#0071e3`、靛 `#5856d6`;状态色为系统绿 / 橙 / 红。
- **Claude:** 象牙 `#faf9f5`、米灰 `#f0eee6`、暖墨 `#1f1e1d`、陶土 `#d97757`、青蓝 `#4c73a5`;状态色为适配暖底的调校值。

状态 token 成三元组 — `--color-success` / `-soft`(浅底)/ `-deep`(浅底上的文字),warning、danger 同理。只用于状态,不作装饰。色阶 100–300 做浅底与悬停,500 是基色,700–900 承担浅底文字与按压态。

对比度:Apple 强调色对白底 4.7:1(正文 AA);Claude 陶土为约 3:1 的界面色 — 正文级强调文字用 `--color-accent-700`。

## 字体

系统字体栈(Apple 硬件上为 SF Pro,Windows 为 Segoe UI)作 `--font-body` 与 `--font-heading`(600);`--font-mono`(SF Mono / Menlo / Consolas)标记一切字面值:ID、路径、计数、按键。正文 13px,全局 `letter-spacing: 0.01em`。字号按角色命名、刻意精简:

- 10–11px — 大写小节标签(600、放宽字距)、计数、元信息
- 12–13px — 密集行、正文、按钮
- 14–15px — 卡片与对话框标题
- 17–28px — 页面标题(h3–h1)

## 中文排印(CJK)

系统默认即支持中西混排:字体栈只点名拉丁字族(SF Pro / Segoe UI),汉字一律落到按文种的系统默认 — macOS / iOS 为苹方,Windows 为微软雅黑,Android / Linux 为思源黑体 — 与拉丁字族同一套"系统栈"策略,无需加载或上传任何字体。数字、ID、代码与快捷键在中文语境中依旧保持拉丁等宽。在 `<html>` 或任意子树声明 `lang="zh"` 即启用 styles.css 末尾的 `:lang(zh)` 层,组件零改动:标题负字距归零(拉丁 -0.02em 会让汉字粘连)、正文行高 1.7 加 0.02em 字距、强调以 600 字重呈现(汉字无斜体,绝不倾斜)、最小标签从 10px 升至 11px 汉字下限、头像取单个姓氏字、中西文间距与标点挤压交由 `text-autospace` / `text-spacing-trim`(浏览器支持时)。字重:苹方原生支持 500 / 600,微软雅黑映射为粗体,可接受。示例见 foundations/cjk.html。

## 图标

Lucide(https://lucide.dev),默认描边 2,默认 16px(密集行 14px、元信息 12px)。图标继承所在文本色 — 不要给 SVG 单独着色。

## 层级

只有三档,不许第四档:**发丝线**(`border: 1px solid var(--color-divider)` — 默认,几乎一切)、**轻浮起**(带边框卡片加 `--shadow-sm`)、**浮层**(`--shadow-lg` — 仅对话框、命令面板、Toast)。`--shadow-md` 是菜单用的中间档。

## 交互状态

静默行透明;悬停为墨色叠加(`--color-text` 的 4–6% `color-mix`);键盘选中行 = 更深叠加**加一圈内嵌发丝描边**(见 `.cmdk-item[aria-selected]`);持久当前项用 `aria-current`。主按钮悬停加深一档(`--color-accent-600`)、按压再一档。键盘焦点一律 `:focus-visible { outline: 2px solid var(--color-accent); }`。Cancel / Dismiss / Close 保持安静:ghost 或 secondary,不上色、不配快捷键。

## 组件对照

| 类 | 说明 | 示例页 |
| --- | --- | --- |
| `.btn` + `-primary/-secondary/-ghost/-danger/-icon/-block` | 操作 — 每视图一个实底主操作;danger 只给不可逆确认 | components/buttons.html |
| `.tag` + 各变体 | 胶囊标签与状态徽章 | components/buttons.html |
| `.kbd` | 键盘按键芯片 | components/buttons.html |
| `.field` / `.input`(含 `select.input`、`textarea.input`)/ `.radio` / `.seg` | 表单;iOS 式分段控件。下拉框不用系统自带那身外观,换成本系统的折线箭头 | components/forms.html |
| `.card` 系列;`.elev-sm/md/lg` | 有界内容卡片;层级工具类 | components/cards.html |
| `.status` + `.status-dot` 及五态 | 状态点 + 文字 | components/status.html |
| `.avatar` 系列、`.avatar-group` | 人是圆形,Agent 是方圆角 | components/status.html |
| `.nav` + `.nav-brand` | 顶栏 | components/navigation.html |
| `.sidebar` 系列 | 侧边栏 — 表面色上的 28px 行 | components/navigation.html |
| `.tabs` + `.tab` | 下划线标签页(`aria-selected`) | components/navigation.html |
| `.list` + `.list-row` 系列 | 密集事项行 — 等宽 ID、标题省略 | components/table.html |
| `.table` | 数据表格,大写表头,悬停行 | components/table.html |
| `.board` 系列 | 看板列,取表面色 | components/cards.html |
| `.dialog` 系列 | 浮层级模态 | components/dialog.html |
| `.toast` 系列 | 反色深底通知,底角 | components/dialog.html |
| `.cmdk` 系列 | ⌘K 命令面板 | components/command.html |
| `.frame` | 清晰图像框 — 发丝线、小圆角 | foundations/image.html |
| `.page-head` + `.page-desc/-actions` | 页标题(24px)+ 一句说明;页级动作靠右 | components/settings.html |
| `.section` + `.section-title/-desc/-tools` | 设置小节:标题、一句说明、右侧可挂控件 | components/settings.html |
| `.set-group` + `.set-row` + `.set-text/-title/-desc/-ctl` | 描边分组里的设置行 — 左边标题 + 一句说明,控件在行尾 | components/settings.html |
| `.toggle` + `.knob` | 开关(原生 checkbox) | components/settings.html |
| `.choice` + `.choice-pv/-label` | 从几张预览卡里选一种(原生 radio) | components/settings.html |
| `.path` | 文件路径 — 等宽、弱化、不换行(中间省略在代码里做) | components/settings.html |


## 设置文法

设置页只有一种骨架:`.page-head`(标题、一句说明、页级动作靠右),下面若干 `.section`,每节一张 `.set-group`。一行 `.set-row` = 左边标题 + **一句**说明,右边行尾一个控件——开关、`.seg`、`select.input`、`.input`、`.path` + 次按钮、或 `.status`。控件都落在同一条竖线上,一眼扫得出哪行能改;细节放进链接,不写第二句。自己就能生效的控件(开关、下拉、分段)不要保存键;打一半不能生效的自由输入,旁边留一颗安静的「保存」。见 components/settings.html。

## 要

- 骨架保持单色;每视图只让一个实底主操作占用强调色。
- 对齐:标签靠左,数字与快捷键靠右、用 `--font-mono`。
- 悬停 / 选中用 `color-mix` 墨色叠加,两主题自动对齐。
- 状态一律走 `.status-*` 语义 — 两主题色相一致。

## 不要

- 不用渐变、不用装饰性色块、圆角不超过 `--radius-lg`。
- 卡片不嵌套;优先一条发丝线或留白。
- 不按页面重定义焦点 / 悬停 / 选中 — 它们是系统级的。
- 不给 Cancel / Close 上色,更不许用 danger。

## 文件

同英文版 § Files;规范页均为中英对照,foundations/cjk.html 是中文排版示例页。本镜像不含模板与画布机器件,来源与同步方式见 [README.md](README.md)。
