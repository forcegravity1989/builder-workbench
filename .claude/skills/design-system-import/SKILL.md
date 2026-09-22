---
name: design-system-import
description: >-
  Claude Design 项目(claude.ai/design 的 design system)与仓之间的双向镜像:
  把导出的复杂网页结构转成 agent 可读的仓内规范资产、拉回设计侧改动、
  把仓侧 token 或组件类改动回推设计项目。
  用户说「把 design 导进来」「设计系统同步一下」「这个导出太复杂了不好读」,
  或给出一条 claude.ai/design 链接时使用。
---

# design-system-import — 设计系统落仓与回推

Claude Design 的项目里混着两种东西:**规范正本**(样式表、token、规范正文、示例页)和**画布件**(让设计画布能渲染、能预览的运行时)。整包搬进仓,agent 读到的一半是噪音;只搬规范正本,仓里就多了一份能读、能改、能与上游核对的资产。

这份 skill 管三个方向:**导入**(设计 → 仓,第一次)、**拉回**(设计侧改了)、**回推**(仓侧改了)。

## 一句话分拣

> **脱离 Claude Design 的画布,这个文件还有意义吗?**

有 → 规范正本,进仓。没有 → 画布件,留在设计项目。

**这一句判的是内容,不是文件名。** 表里没列的文件先 `get_file` 打开看:读起来像一份 token 表、一段规范、一页示例,就是规范正本;像给某个工具读的清单、索引、运行时配置,就是画布件。上游会长出新文件,靠文件名猜必错——`.dsignore` 这种名字,不看内容答不出来。看完仍拿不准,当面问人,别替人决定。

判成画布件的,人不动它——但**判过的都写进落地 README 的剥离清单**,连同判的理由。下次拉回照着清单走,同一个文件不重判第二遍。

## 接口:先拿授权

**DesignSync 工具是唯一走得通的读写路。** 浏览器、桌面应用、本机缓存这几条都通向登录墙或空目录——已逐条试过,证据和结论在 [`references/access.md`](references/access.md),不必重走。

首次调用报 `needs design-system authorization` 时,请人在**交互式** claude 终端会话里跑一次 `/design-login`,浏览器里确认。这台机器从此永久授权,headless 与 SDK 会话都复用。人跑完直接重试。

拿到授权后:`list_projects` 取 projectId(分享链接 `claude.ai/design/p/<id>` 里的 id 就是它)→ `list_files` 取全量路径 → `get_file` 逐个读。

## 导入(设计 → 仓)

1. **读全量**:`list_files` 拿路径清单,按下表分拣。规范正本逐个 `get_file`。
2. **保存文件**:目录结构照搬(示例页链 `../styles.css`、图链 `../assets/`,结构一变链就断)。内容逐字镜像——这是资产不是改写,改动留给落仓之后。
3. **补三样**(设计项目里没有,得你写):
   - `README.md` — 给人和 agent 的导读:来源(项目 id)、剥离清单、演进方式(指回本 skill)、与现行界面的关系。
   - 改名后的指向修正 — 见下方落地规矩。
   - 仓侧登记 — 按现有头部范围更新文档地图(如 `docs/README.md`)，变更原因、验证与未验项写进 commit/PR；文档维护遵守仓根 `AGENTS.md`，不另建变更流水。
4. **验证** — 见下方。

### 分拣表

| 文件 | 判 | 为什么 |
|---|---|---|
| `styles.css` | 规范 | 唯一样式表,token 与组件类都在这 |
| `readme.md` / `readme.zh.md` | 规范 | 规范正文;落仓要改名,见落地规矩 |
| `theme.json` | 规范 | 机读 token 记录 |
| `components/`、`foundations/` 下**每一个** `.html` | 规范 | 纯 HTML 示例页,查源码即抄。这两个目录整取,不挑 |
| `assets/` 下**每一个**文件 | 规范 | 示例页引用的图,不带它示例页图挂 |
| `theme.html` | 画布 | theme.json 的渲染视图——同一份意思的第二处,留一份 |
| `_ds_manifest.json` | 画布 | 由各页首行 `@dsCard` 注释编译而来,注释才是源 |
| `_ds_bundle.js`、`support.js` | 画布 | 画布运行时 |
| `Canvas.dc.html` 等 `*.dc.html` | 画布 | 画布本身 |
| `thumbnail.html`、`.thumbnail` | 画布 | 封面与缩略图 |
| `_builtin.json` | 画布 | 画布内部标识 |
| `_adherence.oxlintrc.json` | 画布 | React/oxlint 巡检配置;它「禁裸 hex/px」的意图写进规范正文即可 |
| `templates/` | 看情况 | 自带页面机器件。只有人明说要拿它当新页面的起点时才取;要的是规范本体就不取 |
| `github.md` | 化进 README | 上游来源记录,并进落仓 README 的「来源」段 |

### 落地规矩

- **保留各页首行 `@dsCard` 注释**。设计画布靠它建卡片索引,删了回推就断——它看着像可以顺手清掉的注释,其实是接口。
- **规范正文整族改名**:`readme.md` → `spec.md`,`readme.zh.md` → `spec.zh.md`,其余语种同理。落地目录要放 `README.md` 给人导读,macOS 文件系统大小写不敏感,不改就撞名。
- **改完名 grep 旧名,每个改过的名字各查一遍**(`grep -rn "readme" <落地目录>/` 一次抓完整族更省事),把指向改到新名:`styles.css` 头注释、规范正文里的互链都会引到它。剩下的每一处要么改掉,要么是**故意**指上游原名——后者把出处写进那句话,像 `` `spec.md` — 本指南(设计项目里叫 `readme.md`)``,别让下一个人当烂链修掉。
- **README 记满三样**:来源项目 id、剥离清单、演进方式。少任何一样,下一个会话都得重新考古。
- **接线状态如实写**:资产落仓不等于产品已经用它。没接线就写没接线。

### 验证

浏览器实开至少两张示例页——一张纯组件页、一张带图资产的页——截图核对渲染:token 解析、配色切换、中英混排、图片路径。

内嵌 Browser pane 开不了 `file://`(报 no open project folder)。走 web-access 的 CDP proxy:

```bash
curl -s -X POST --data-raw 'file:///绝对路径/components/buttons.html' http://localhost:3456/new
```

拿到 targetId 后 `/screenshot?target=<id>&file=<出图路径>`,读图核对,完事 `/close`。

## 拉回(设计侧改了)

`list_files` 与仓内对一遍结构差,改了的 `get_file` 覆盖落盘。**过一遍分拣表**——上游可能新增了画布件,别让它跟着进来。改名对应关系(readme→spec)每次都要重做。

## 回推(仓侧改了)

样式表是实现正本。token 或约定变了,`styles.css`、`theme.json`、规范正文**三处同步改**——三者不同步就是账错了,下次拉回会打架。

回推走 DesignSync 的写路径:`finalize_plan`(列出要写的路径 + 本地目录,人在这一步看到并批准)→ `write_files`(带 planId,用 `localPath` 让工具直接读盘上传)。装了 `/design-sync` skill 就用它——它包了这条链,按组件增量推,不整包覆盖。

## 本仓的完成实例

`docs/04-design-system/` 是这套流程跑完的样子:2026-08-31 从项目 `dd2af572-7839-44f2-9cb9-b9619144586d` 导入,14 张示例页 + 双语规范 + 双配色 token。要对着一个真实结果核对判断时,读它的 `README.md`。
