# Builder 设计系统 · 仓内规范资产

> **30 秒导读**:这里是 **Builder 设计系统**的仓内正本镜像——Workbench 界面的视觉语言(双配色 Apple/Claude、token 体系、组件类、中文排版层)。**给谁看**:要写界面、做页面、改样式的人和 AI。**从哪来**:镜像自 Claude Design 项目「builder」,只保留规范本体,画布机器件全部剥离。**规范正文**读 [spec.md](spec.md)(英文为准,[spec.zh.md](spec.zh.md) 中文对照);**唯一样式表**是 [styles.css](styles.css);**机读 token** 在 [theme.json](theme.json)。

## 60 秒上手

1. 页面只链一份样式表:`<link rel="stylesheet" href="styles.css">`,颜色/字体/间距/圆角/阴影一律取 `var(--*)`,不许硬编码 hex 和 px。
2. 切配色:`<html data-theme="claude">`(默认 Apple);中文页面加 `lang="zh"` 即启用中文排版层——组件零改动。
3. 要哪个组件,查 [spec.md](spec.md) 的组件对照表,打开对应示例页(纯 HTML 无脚本),浏览器直开、查源码抄标记。

## 文件地图

| 路径 | 是什么 |
|---|---|
| [spec.md](spec.md) / [spec.zh.md](spec.zh.md) | 规范正文(方向 · 色彩 · 字体 · CJK · 层级 · 交互态 · 组件对照 · 要/不要) |
| [styles.css](styles.css) | 唯一样式表:两套配色 token + 全部组件类 + `:lang(zh)` 中文层 |
| [theme.json](theme.json) | 机读主题记录(两套调色板、字体策略、圆角/密度/图标约定) |
| [components/](components/) | 8 张组件示例页:buttons · forms · cards · navigation · table · dialog(+toast)· command(⌘K)· status(+头像) |
| [foundations/](foundations/) | 6 张基础示例页:color · type · cjk(中文排版)· layout · icons · image |
| [assets/photo.jpg](assets/photo.jpg) | image.html 用的参考照片 |

## 与现行壳的关系

**未接线**。桌面壳 `crates/app-shell` 现行样式仍以 [docs/hifi/](../hifi/) 九屏高保真为准;本目录是设计系统资产,供后续界面演进采用。谁接线、何时接线,按特性起手路径走 `05-features/`。

## 来源与剥离清单

- 来源:Claude Design 项目「builder」(`dd2af572-7839-44f2-9cb9-b9619144586d`),2026-08-31 落仓。设计系统上游参考:stablyai/orca 的 STYLEGUIDE + multica 的 token 表(来源记录原在项目内 `github.md`)。
- 剥离(画布/预览机器,不影响规范本体):`_ds_bundle.js`、`support.js`、`Canvas.dc.html`、`theme.html`、`thumbnail.html`、`.thumbnail`、`_ds_manifest.json`、`_builtin.json`、`_adherence.oxlintrc.json`(React/oxlint 向的巡检配置,对本仓不适用;其「禁裸 hex/px」意图已是 spec 正文规则)。
- 未镜像:`templates/`(landing/deck 起步模板,自带页面机器件)留在设计项目,需要时从那边复制。
- 改名:`readme.md` → `spec.md`、`readme.zh.md` → `spec.zh.md`(macOS 文件系统大小写不敏感,避开本 README 撞名);`styles.css` 头注释的指向同步改为 spec.md。其余文件逐字一致,示例页首行 `@dsCard` 注释保留(设计画布靠它建卡片索引,别删)。

## 怎么演进

拉回(设计侧改了)与回推(仓侧改了)的完整步骤在 skill **`design-system-import`** 里,那是唯一正本——授权怎么拿、分拣怎么判、回推走哪条链,都在那份。本节只记本资产自己的约定:

- token 先行:新颜色 / 间距先进 `styles.css` 的 `:root`(两套配色都要给值),再谈使用。
- 三处同步:`styles.css` 是实现正本,token 或约定变了,`theme.json` 与 spec.md / spec.zh.md 一起改。
- 新组件类先进 spec 的组件对照表、配示例页,再在产品里用。
- 示例页保持纯 HTML + 一份样式表,无脚本、无构建——这是「查源码即抄」的前提。
- 各页首行 `@dsCard` 注释保留:设计画布靠它建卡片索引,删了回推就断。
