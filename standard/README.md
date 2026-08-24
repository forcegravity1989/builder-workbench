# standard/ 是什么

<!-- 30 秒导读:这是 standard/ 目录本身的说明文件,给三种人看——复核规范
     设计的用户、维护铺底代码的会话、以后要往这里提 PR 的同事。现在作数:
     这里是 V4「规范铺底」用的模板正本,代码侧已经在读它、铺它了
     (`crates/bw-v4/src/standard/`)。 -->

`standard/` 是 Builders' Workbench(buddy)接入一个项目时,往那个项目仓里
铺的那一整套骨架文件的**正本**。项目仓里看到的 `.bw/PROJECT.md`、
`.bw/metrics.toml`、仓根 `AGENTS.md` 这些文件,内容都来自这里的模板渲染——改
这里的模板,就是在改 buddy 给每个新项目铺出来的起点长什么样。

**落点分两类,别混**:

- **`.bw/` 下的是 buddy 的资产** —— 名片、指标、规范清单（周计划改挂 ops① issue 评论、发版改用 codehub Release，都不再是仓文件）。
  收在一个目录里,「bw 到底往我仓里放了什么」一眼可数,也不会和项目自己的
  `README.md` / `docs/` 打架。
- **仓根 `AGENTS.md` 与 `CLAUDE.md` 是项目自己的** —— 那是 Claude Code /
  Cursor / Codex 都在找的位置,塞进 `.bw/` 谁都读不到。buddy 只在它们
  **不存在**时搭一份初稿,已经有就一个字不动,补齐交给规范铺底第 2 步的
  agent 会话去谈。

规范版本因此从 4.0 跳到 **5.0** —— 落点变了,老版本铺出来的文件在新版本眼里
就是「不在册」,不做迁移。

这套规范一共分八个大类(见
[`docs/architecture.md`](../docs/architecture.md) 的「规范铺底」模块),这个仓目前只落地了会被优先接入代码的那一部分——见下方
文件表与「还没做的部分」。

## 谁会读这些文件

- **人**:复核这套规范设计对不对的用户;评审「规范铺底」这次合并请求时,
  人看到的骨架内容就是这里模板渲染出来的样子。
- **代码**:这个目录会在编译时整个打进 buddy 二进制(用 `include_str!`),
  铺底命令运行时从二进制里取模板写进项目仓,不是运行时去读磁盘上的这个
  目录——**改这里任何一份文件的内容,就是在改 buddy 的产品行为**,不是
  改一份纯文档。
- **agent**:铺进项目仓之后,仓根 `AGENTS.md`(经 `CLAUDE.md` 一行导入)会被
  每次开工的 agent 会话读到;其余模板渲染出的文件(`.bw/PROJECT.md`、
  `.bw/*.toml` 等)是项目
  自己的正本文件,供人和 agent 日常打开查阅、按需要修改。

## 目前这里有什么

`standard/` 分四块,各有各的落点:

| 块 | 内容 | 落点 |
|---|---|---|
| `VERSION` | 当前规范版本号 | 铺底与对账时读 |
| `templates/` | **铺进项目仓 `.bw/` 的模板**,镜像 `.bw/` 结构 | 渲染进项目仓 `.bw/` |
| `system-prompt/` | **buddy runtime 用的系统提示词**,不进项目仓 | 编进二进制,渲染后经 `--append-system-prompt` 送 agent |
| `skills/` | **buddy 自带技能**(四份运作剧本) | 摊到 `<asset_root>/skills/`,不进项目仓 |
| `vendor/` | **业界 workflow 库原样副本**(mattpocock / mohit) | 待打包,不进项目仓 |

`templates/` 镜像铺底目标 `.bw/` 结构:

| 文件 | 一句话 |
|---|---|
| `templates/PROJECT.md.tmpl` | 项目章程:想做什么、最像的对标、北极星、项目信息 |
| `templates/design/README.md` | `.bw/design/` 目录用途与写作约定(30 秒导读、过期加横幅) |
| `templates/metrics.toml.tmpl` | `.bw/metrics.toml` 骨架:北极星占位 + 滞后/引领指标写法示例(注释掉) |
| `templates/issue-policy.toml.tmpl` | `.bw/issue-policy.toml` 骨架:开工工具声明、类别→工具→workflow 默认映射、评审/节律/看板规则 |
| `templates/standard.toml.tmpl` | `.bw/standard.toml` 骨架:记这个项目铺的规范版本与启用/扩展的大类 |
| `templates/scripts/*.py`(3 份) | 现成采集脚本(每周提交数 / 合入 PR 数 / star 数),铺进 `.bw/scripts/` |

`system-prompt/` 是 buddy 自己 runtime 用的(不进项目仓):

| 文件 | 一句话 |
|---|---|
| `system-prompt/SYSTEM.md.tmpl` | 主提示词模板:身份 + 四铁律 + 读项目规范件指引,`{{...}}` 占位运行时渲染 |
| `system-prompt/references/metrics.md` | 干指标活的 buddy 规范(可回溯/不许写0/窗口 buddy 给) |
| `system-prompt/references/build.md` | 干改仓活的 buddy 规范(分支/MR/合并是人/不自动 Done) |

## 还没做的部分(如实说明,不是遗漏)

`skills/` 现在只有**四份运作剧本**(更新指标与周计划、资产盘点 + 子技能
`project-handbook`、`metrics-refresh`)。**不预置方法论**——原来预置的六份
阶段方法论(原型/构建/优化/运营推广/运维/竞品)默认 workflow 没打包、一份
没被真正派发过,删光了:阶段方法论该由业界 workflow(`vendor/`)提供,
buddy 每个环节挑一个最好的默认;要从实践里长出 buddy 自己的方法论,到时候
再建,不预先搞一堆没用的。规范铺底不起 agent,所以没有它的剧本。技能编进
二进制,开工时摊在 **buddy 自己的资产目录**,**不复制进用户的仓** —— 用户
`.gitignore` 怎么写不该由 buddy 决定,而每个项目复制一份 buddy 自带的东西也
没有道理。系统提示词里只给名字 + 一句话 + 路径,正文按需读
(见 `crates/bw-v4/src/standard/skills.rs` + `system_prompt.rs`)。

`vendor/` 已 vendor 进来两家(mattpocock-skills、mohit-pm-claude-skills)的
原样副本,但**打包机制未实现**——buddy 还没把它们摊进自己的资产目录、注入
提示词(issue-policy 默认值已诚实化,不指向没打包的)。proto-design(原型阶段
默认 workflow)的源还没 vendor 进来。full bundle 是后续 subagent 任务
(见 `docs/architecture.md` 的「没建什么」)。

铺底流程与对账细节见
[`docs/architecture.md`](../docs/architecture.md) 的「规范铺底」模块;
文件格式的完整样例见
[`docs/architecture.md`](../docs/architecture.md) 的「仓文件解析」模块。
