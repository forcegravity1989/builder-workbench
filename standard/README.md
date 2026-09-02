# standard/ 是什么

<!-- 30 秒导读:这是 standard/ 目录本身的说明。第一次纳入只写名片到项目约定
     常驻树,不摊 issue-policy。模板里的 issue-policy 仅残留测,不是仓正本。 -->

`standard/` 是 Builders' Workbench 的规范正本(系统提示词、运作剧本、业界 workflow)。
第一次纳入只写名片 `.bw/project.toml`(项目约定常驻树),不摊 issue-policy。
指标跟运作活①走,不预铺空壳。仓根 `AGENTS.md` 不在这套模板里。

**落点分两类,别混**:

- **`.bw/` 下的是 Workbench 的资产** —— 名片、指标、规范清单（周计划改挂 ops① issue 评论、发版改用 codehub Release，都不再是仓文件）。
  收在一个目录里,「bw 到底往我仓里放了什么」一眼可数,也不会和项目自己的
  `README.md` / `docs/` 打架。
- **仓根 `AGENTS.md` 与 `CLAUDE.md` 是项目自己的** —— 那是 Claude Code /
  Cursor / Codex 都在找的位置,塞进 `.bw/` 谁都读不到。铺底**仓根一个字
  不写**;要不要写开发手册,是资产盘点首次模式问过人才写的事(今天还没接上)。

规范版本因此从 4.0 跳到 **5.0** —— 落点变了,老版本铺出来的文件在新版本眼里
就是「不在册」,不做迁移。续三(系统提示词外置 + 扁平铺底 + 删方法论)又
抬到 **5.1**,当前值见 `VERSION`。续五(默认 workflow 打包:mattpocock 入口 + vendor 摊 + issue-policy 回填)抬到 **5.2**。续十六(指标空壳到站才铺 + 脚本 UTF-8 / A 类 points / `def` 字段)抬到 **5.3**。续十七(运作活①评论三标题 + 挂评校验脚本)抬到 **5.4**。续二十(B 类仍要写脚本)抬到 **5.5**。续二十二(B 类写入 + 定本周建卡必打类别)抬到 **5.6**。续二十三(mattpocock 入口写清 `/xxx`=读路径,并补 grilling/domain-modeling/tdd)抬到 **5.7**。B/C 读数改日历日键、展示按周抬到 **5.8**。过程指标包(十份脚本 + 目录总账)抬到 **5.9**。独立评审(评审剧本 `mr-review` + 阶段规范 `review` + 评审主提示词 `REVIEW.md.tmpl`)抬到 **5.10**。计划版本收成 `v0.x`、不再写 `bw:week` 抬到 **5.11**。名片只留 `project.toml`、开工约定不再写工具声明、不再铺 `standard.toml` / `managed.toml`、周盘点清旧件抬到 **5.12**。不写主检出、开工工具跟人走、不再铺 issue-policy 抬到 **5.13**。

第一次纳入不再摊 `CORE_TEMPLATES`(空表)。名片走项目约定。metrics 有模板但不铺(运作活①跟人写)。
`.bw/standard.toml` / `managed.toml` / `PROJECT.md` / `issue-policy.toml` 不再铺;旧仓里那几份由每周资产盘点清掉。
开工工具跟人走本机;workflow 和周五盘点是产品默认。

## 谁会读这些文件

- **人**:复核规范设计;评审「项目约定」那张 MR 时,人看到的是名片,不是摊一堆模板。
- **代码**:这个目录编译时 `include_str!` 进二进制。**改这里任何一份,就是改产品行为**。
- **agent**:仓根 `AGENTS.md` 是项目自己的(问过人才写)。`.bw/project.toml` 是名片正本;
  `issue-policy.toml` 不再铺,旧仓残留由周盘点删。

## 目前这里有什么

`standard/` 分四块,各有各的落点:

| 块 | 内容 | 落点 |
|---|---|---|
| `VERSION` | 当前规范版本号 | 铺底与对账时读 |
| `templates/` | 指标等格式样例;接入不摊 | 运作活①照着写;issue-policy 模板仅残留测 |
| `system-prompt/` | **Workbench runtime 用的系统提示词**,不进项目仓 | 编进二进制,渲染后经 `--append-system-prompt` 送 agent |
| `skills/` | **Workbench 自带技能**(四份运作剧本 + 评审剧本 `mr-review` + workflow 入口) | 摊到 `<asset_root>/skills/`,不进项目仓 |
| `vendor/` | **业界 workflow 库原样副本**(mattpocock / mohit) | 待打包,不进项目仓 |

`templates/` 镜像铺底目标 `.bw/` 结构:

| 文件 | 一句话 |
|---|---|
| `templates/metrics.toml.tmpl` | 指标格式正本,不随接入铺;运作活①照着写 |
| `templates/issue-policy.toml.tmpl` | 旧格式样例,仅残留测;非正式正本 |
| `templates/scripts/*.py`(13 份) | 现成采集脚本,铺进 `.bw/scripts/`:仓级三份(每周提交数 / 合入 PR 数 / star 数)+ 过程指标包十份(评审等待 / 首过率 / 返工轮数 / 首审等待 / 意图成文时长 / 变更前置时间 / 同时开着的 MR 数 / 活存活率 / 手册修正频次 / 距上次发版天数)——全部可回溯、只读代码仓与远端 |
| `templates/process-catalog.md` | 过程指标目录(playbook 26 条的总账:能算的指到脚本、等前置的写明等什么、不建的写明为什么),铺进 `.bw/process-catalog.md`;荐入规则见 `skills/metrics-refresh` |

`system-prompt/` 是 Workbench 自己 runtime 用的(不进项目仓):

| 文件 | 一句话 |
|---|---|
| `system-prompt/SYSTEM.md.tmpl` | 主提示词模板:身份 + 四铁律 + 读项目规范件指引,`{{...}}` 占位运行时渲染 |
| `system-prompt/REVIEW.md.tmpl` | **评审会话**主提示词:独立评审身份 + 只评不改/绝不合并/意见落 MR 评论,占位同上 |
| `system-prompt/references/metrics.md` | 干指标活的 Workbench 规范(可回溯/不许写0/窗口 Workbench 给) |
| `system-prompt/references/build.md` | 干改仓活的 Workbench 规范(分支/MR/合并是人/不自动 Done) |
| `system-prompt/references/review.md` | 干评审活的 Workbench 规范(独立评审/唯一落点 MR 评论/大风险顶格标出) |

## 还没做的部分(如实说明,不是遗漏)

`skills/` 现在只有**四份运作剧本**(更新指标与周计划、资产盘点 + 子技能
`project-handbook`、`metrics-refresh`)加**一份评审剧本**(`mr-review`,独立
评审会话专用,由「请评审」派发)。**不预置方法论**——原来预置的六份
阶段方法论(原型/构建/优化/运营推广/运维/竞品)默认 workflow 没打包、一份
没被真正派发过,删光了:阶段方法论该由业界 workflow(`vendor/`)提供,
Workbench 每个环节挑一个最好的默认;要从实践里长出 Workbench 自己的方法论,到时候
再建,不预先搞一堆没用的。项目约定不起 agent,所以没有它的剧本。技能编进
二进制,开工时摊在 **Workbench 自己的资产目录**,**不复制进用户的仓** —— 用户
`.gitignore` 怎么写不该由 Workbench 决定,而每个项目复制一份 Workbench 自带的东西也
没有道理。系统提示词里只给名字 + 一句话 + 路径,正文按需读
(见 `crates/bw/src/standard/skills.rs` + `system_prompt.rs`)。

`vendor/` 已 vendor 进来两家(mattpocock-skills、mohit-pm-claude-skills)的
原样副本。**mattpocock-skills 已打包**:Workbench 写一份入口 SKILL.md(在
`skills/mattpocock-skills/`,body 是 grill→implement→review SOP + 指向 vendor 库
子技能路径)作 SkillPack 走 `skill_pointer` 注入,vendor 库整树摊到
`<asset>/vendor/`(dev 期从源码树 runtime 摊,分发态 defer),产品默认
build/优化/运维 workflow 是 `mattpocock-skills`。**proto-design**(原型阶段默认
workflow)源还没 vendor 进来、未打包。vendor 摊的分发态 bundle 进二进制留后续
(见 `docs/architecture.md` 的「没建什么」)。

接入与名片见
[`docs/architecture.md`](../docs/architecture.md) 的「项目约定」模块;
文件格式的完整样例见
[`docs/architecture.md`](../docs/architecture.md) 的「仓文件解析」模块。
