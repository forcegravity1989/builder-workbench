# architecture.md — Workbench MVP 设计正本

> **30 秒导读**:Workbench MVP 的**唯一设计正本**。三段:**§1 用例与旅程怎么编排 → §2 特性(每个能力是什么、关键取舍)→ §3 实现(代码落点、数据、依赖、没建)**。给要判断"某条为什么这么定"、接手模块、往规范里加东西的人和 AI 看。不在本篇的:开发规矩(怎么建/跑/测)在 [`AGENTS.md`](../AGENTS.md);界面视觉语言在 `docs/04-design-system/`,八屏版式与旅程在 `docs/hifi/`,五站驾驶地图在 `docs/hifi/home.html`;词表 `CONTEXT.md`;版本变更 `CHANGELOG.md`;老版本史实(V3、旧 16 模块挪移)见本篇附录。`DESIGN.md` 指路本篇。
>
> **四层口径**(§2 按此归位):**层 A 事实**——主张性文档(人对项目基础信息/里程碑的定义)+ 仓里已有事实(代码/issue/已有文档/读数);**层 B 执行**——主体是 Orca 会话、worktree、工具探活;dispatch 单入口与守卫是内核工作方式、不单列为能力模块(见 §3 运行机制);**层 C standard 积累**——系统提示词 + 技能 + 蒸馏(渐进加载);**层 D 壳**——八屏,人怎么交互、人看什么。

**写作约定**:正文说人话,实现名字(命令名、函数名、表名)只在必要时作为"代码锚点"出现、不逐文件:行罗列;代号在当篇第一次出现带一句人话说明。

---

## §1 · 用例与旅程

> §1 写**用例与旅程怎么编排**——每个用例编排哪些能力(§2)、落哪个站哪个屏、什么节律、没建什么。§2 写**特性**(每个能力的设计层:是什么 + 关键取舍),§3 写**实现**(每个能力的代码落点、数据、依赖、没建)。用例不是另一层东西——它天生横切,是它编排哪些能力。

### 顶层旅程 · 五站

五站是产品的顶层迭代旅程:**项目版本 → 构建交付 → 治理 → 反馈 → 进化 ↺**。主张正本(飞轮、外/内 FAQ)在 [`docs/01-principles/03-press-release-faq-flywheel.md`](01-principles/03-press-release-faq-flywheel.md),驾驶地图(五站格子、点什么发生什么)在 [`docs/hifi/home.html`](hifi/home.html)。本篇不重画五站,只把它下面的关键用例子旅程列清。

### 关键用例 / 子旅程

用例分**一级**(独立目标、有独立节律触发)与**二级**(某一级下的子步 / 派生读视图;↳ 标二级,跨切二级标「跨切」)。每行:编排哪些 §2 能力模块 / 落哪个站哪个屏 / 节律 / 没建什么。详细机制在 §2 对应能力模块。


| 用例 | 编排哪些能力模块(§2) | 站 / 屏 | 节律 | 没建什么 |
| --- | --- | --- | --- | --- |
| **接入(项目约定)** | 关键信息维护 | 项目版本 / 接入屏 | 第一次纳入自动建一张轻量活 | 节律目录 / 鱼塘未建;旧仓残留由盘点删 |
| **周循环与计划** | 会话与执行 + 关键信息维护 + 系统提示词 | 构建交付 / 计划屏;会话屏 | 周一 09:00 定版本计划 | 预览·未合入灰态、蒸馏灰态未接;给活挂指标命令没接 |
| ↳ week-planning(运作活①) | 系统提示词与渐进加载 + 技能与蒸馏 + 会话与执行 | 项目版本 / 会话屏(①) | 周一 09:00 新会话 | 版本目标读 ops① 评论整段;替身路径走 `ConfirmWeekDraft` |
| ↳ 发版 | 关键信息维护(Release) | 构建交付 / 计划屏 | 人点 | 号锁死当前版本视图,不能另填 |
| ↳ 开工 | 会话与执行 + 系统提示词与渐进加载 | 构建交付 / 计划屏 Start | 人拖进「进行中」或详情 ▶开工 | 评审三件套未派发;`DeleteSession` 内核在、壳无按钮(见 §3 该删) |
| ↳ 出包 / 验包 | 关键信息维护(`PackRelease`) | 构建交付 / 计划屏出包 | 人点 | 仅 Windows、非门禁非 CI;产物在 `.bw/release/out/<版本>/` |
| **asset-audit(运作活②)** | 技能与蒸馏 + 关键信息维护 + 会话与执行 | 治理 / 会话屏(②) | 周五 15:00 新会话 | 五条历史探测只实现前三条;`mode: first` 没做 |
| **指标采集** | 关键信息维护(读数流水) + 会话与执行(B 类定时) | 反馈 / 总览屏采按钮 | 打开自动采一轮;B 类每天 20:00 | C 类定时建提醒活没做;B 类脚本在项目仓,Workbench 只跑和记账 |
| ↳ 健康展示 | 关键信息维护·健康推导(现算) | 反馈 / 总览 + 项目墙 | 打开现算 | 没读到不打勾;灯可因读数难看变红 |
| ↳ 项目群发送(跨切) | 关键信息维护(NotifyEvent 注册表) | 项目版本 + 反馈 / 总览名片 | 事件触发(定计划/建活/合入/发版) | 群历史拉不了(welink-cli 只发不读);周报无触发、无生成逻辑 |


> **站 ≠ 屏。** 五站是顶层旅程(在 03 + home.html),八屏是壳导航(项目墙/接入/设置/总览/计划/会话/配置/知识库,见 §2 桌面壳)。一个用例落某个屏、属于某个站,是两个轴。

### 各用例要点

- **接入(项目约定)**:第一次纳入自动建「项目约定」轻量活,只写 `.bw/project.toml`(外加 `.bw/.gitignore`),落常驻分支 `bw/project`,开 MR 等人合,全程不起 agent。默认分支 HEAD 已有名片、或开着项目约定 / 残留旧标题就不重开。没合进默认分支总览常驻横幅。改名片 / 项目群复用同一标题同一棵树。在研版本不进仓文件:看远端里程碑覆盖当天。开工工具跟人走本机。**不写主检出、完成永远人点、常驻分支合入后不删**。仓根一个字不写。详见 §2「关键信息维护」。
- **周循环与计划**:计划版本、自建版本、发版号是同一个里程碑名(`bw:plan:<名>` / 里程碑标题 / Release)。ISO 周只做节律不当排期名。在研版本看覆盖当天的里程碑,不进 `.bw/project.toml`。版本列表、发版、看板计数全现算——没有周计划索引表、没有发版表。发版先建 codehub Release 成功再打 `bw:released:<名>`(顺序不能反)。出包是左侧另一颗按钮(ADR-0005),不和发版本绑。拖拽落定那一刻标签就是新的(排期是 issue 数据,不走 MR);写标签成功才挪卡,失败停原列。完成永远人点。节律在 Orca:周一 09:00 定计划、周五 15:00 盘点、每天 20:00 采 B 类。
- ↳ **week-planning(运作活①)**:人先确认本周版本(推荐 `vX.X`),当场建卡打 `bw:plan:<名>` + `bw:category:*`,挂 codehub 同名里程碑(起止默认本周周一到周五)。替身路径走 `ConfirmWeekDraft`。不再写 `bw:week:*`。挂评前用 `week-planning/check-week-comment.py` 校验标题。
- ↳ **发版**:远端建 Release + 打 `bw:released:<名>`,号锁死当前版本视图。
- ↳ **开工**:入口在计划屏(拖进「进行中」或详情 ▶ Start),同一条 `run_issue`:开/复用 worktree,没会话才打 Orca `createAgentSession`,有会话只切树。详见 §2「会话与执行」。
- ↳ **出包 / 验包**:入口 `.bw/release/pack/pack.cmd` + `e2e/e2e.cmd`,协议见 ADR-0005;产物 `.bw/release/out/<版本>/`(gitignore)。验包不过「详情」列出每条用例与报错。
- **asset-audit(运作活②)**:每周对照 `references/bw-assets.md` 盘 Workbench 给项目的 `.bw/`(清残留、升格式、点未闭环的环),再盘全仓人持文档正本(architecture / AGENTS / CONTEXT / CHANGELOG / 01-principles / 02-adr / 03-guide / 04-design-system / 05-features)对齐实现、清过时、互相一致,只写评论不替改,再盘项目本周提交与开着的 MR(建议只落这张活的评论),再按 `week-plan-comment.md` 给本周在研版本那张运作活①追加一条每周进展。开工工具跟构建。
- **指标采集**:见 §2「关键信息维护」的读数流水。A 类(可回溯)一个字不存现算;B 类(不可回溯)与 C 类(手填)进同一份 `.bw/metrics/readings.jsonl`(键日历日,同天同指标只留一行)。B 类日采走 Orca 自动化(每天 20:00,钉账本树 `bw/ledger`,默认关)。
- ↳ **健康展示**:调 §2「关键信息维护」的健康推导(二级特性),总览+项目墙现算,没数据是诚实的灰不是绿。
- ↳ **项目群发送**:往群里发固定枚举事件(本周版本计划 / 新建活纳入本周 / PR 合入 / 发版 / 周报),每件可在总览单项开关。事件挂在 `NotifyEvent` 注册表上(加新事件 = 加 variant + 动作点调一次统一 dispatch,见 ADR-0003)。发送不落库(没有已发送账本/去重键/重试队列,发送即完成)。群号走仓文件、登录是机器的事(Workbench 不碰不存凭证)。

---

## §2 · 特性(设计层)




| 层          | 能力模块         | 是什么一句话                                                                                |
| ---------- | ------------ | ------------------------------------------------------------------------------------- |
| A 事实       | ① 关键信息维护      | 本地 `.bw` 仓文件 + 远端 issue/MR/Release 的唯一读写口;活的状态正本=issue label(转移规则守铁律)+ 本机运行时资产目录(零正本);含健康推导二级特性(派生健康灯);含人持文档正本维护(asset-audit 盘点,代码不读写) |
| B 执行       | ② 会话与执行      | Orca + worktree + Open Design + 工具探活                                                  |
| C standard | ③ 系统提示词与渐进加载 | 开工渲染系统提示词,正文按需读不塞进提示词                                                                 |
| C standard | ④ 技能与蒸馏       | 四运作剧本 + asset-audit + 蒸馏主张                                                            |
| D 壳        | ⑤ 桌面壳        | 八屏,只渲染和转发意图                                                                           |


### ① 关键信息维护(层 A 事实)

**是什么**:正本分两类——**活态数据正本**落两处:**codehub/GitHub 的 issue+标签**是唯一 issue 正本(状态/排期/发版号/类别全以标签表达,两台 Workbench 接同一个 codehub 仓读出来是同一份活态);**仓文件 `.bw/`** 是项目约定与指标定义的正本(人、agent、第二台机器要看的都住仓里走 MR,本地不存第二份)。这一层是读写正本的唯一入口,别处不许自己拼路径读 `.bw/*.toml`。活的状态正本 = 远端 issue 标签(七态 + 状态机转移规则 + settle-once 守「完成永远由人点」铁律);本机运行时资产目录纯运行时、零正本,删掉重接就回来;`NotifyEvent` 注册表管项目群事件(加新事件 = 加 variant + 动作点统一 dispatch,ADR-0003)。**另一类是人持文档正本**——项目自己的设计正本 / 开发规矩 / 词表 / 变更记录 / 原则 / 架构决策 / 指南 / 设计系统 / 特性制品等需与实现保持一致的文档;Workbench 代码不读写它们(读写口仍只 issue 标签 + `.bw/`),维护纪律靠人 + asset-audit(运作活②)盘:对齐实现、清过时、互相一致。盘点清单随项目;Workbench 自己(被管项目)的正本见 §1 asset-audit 要点。dispatch 单入口与回执语义是内核工作方式(见 §3 运行机制),不在这层。

**关键取舍**:放弃本地读缓存、读全走 CLI(MVP 卡点认了)。排期只有一个槽 `bw:plan:<版本名>`、里程碑标题同字(名字不设限,`vX.X` 只推荐),旧 `bw:week:` 不认。仓文件不做 `deny_unknown_fields`(人手写多一个字段就整份崩代价太大);metrics 只认 `schema_version=2`,读到旧格式整份拒收、不在打开项目时改仓;写回手写渲染而非自动序列化,把注释留给人看。远端按 provider 统一路由(调用方只见方法不见 provider 分支);MR 合入复跑读回 state 真 `merged` 才算成功(退出码靠不住绝不假 Done);Cursor 探活失败就拒绝开工,不悄悄退回 Claude CLI。现行 `.bw` 契约在 `references/bw-assets.md`。

代码 / 数据 / 没建见 §3 ①。

**二级特性 · 健康推导**:把 ① 维护的信息(提交/读数/上周交付)派生成一盏健康灯,现算纯函数;密封类型 `DerivedHealth`(构造点限仓内、仓内无 `set_signal`)守「没数据不装绿」铁律,灯只能从数据推导不手设,没数据是诚实的灰不是绿,连两周没动是真停了的红。代码/数据/没建见 §3 ① 健康推导。

### ② 会话与执行(层 B 执行)

**是什么**:会话屏只剩两个组件——**Orca**、**Open Design**。开工入口在计划屏(拖进「进行中」或详情 ▶开工),同一条 `run_issue`:开/复用 worktree,没会话才打 Orca 会话,有会话只切树。铁律挂启动参数(Cursor 拼进用户话)。完成仍由人点(计划屏拖进已完成 / 合入)。

**关键取舍**:
- 旧三栏 / 动作条 / 灌词条不要——停止 / 开 MR / 推评审 / 删会话在 Orca 里做或拖列;Workbench 不知道人在 Orca 点了哪条会话,灌词条对着「当前会话」会骗人。
- 两条通道别混:本地 pipe 是 Workbench 对 Orca 下命令(开工/接回),同机读 token、不需配对;嵌网页是把本机已开的 Orca web 给人看、要配对码(人从 Orca 桌面「给 web 配对」拿完整 URL 贴进本机设置)。没贴 URL 则嵌页如实空着、不影响开工。跟随网页是 Orca 内核的刀、不是 Workbench 第二条 RPC,带这刀的 Orca 推配对网页,没这刀的官方包开工和桌面切换仍成立。
- Open Design 是「本机网页内嵌类」开工工具:不起 CLI、不 spawn agent,开工 = 在内嵌标签里用本机已开的 OD 干;探不到返 None 不 panic;够不上一个适配模块体量,不单开 adapter 目录。
- 工具跟人走本机设置,探不通如实回灰;Cursor 探活失败拒绝开工,不悄悄退回 Claude CLI(与 ① 同一条铁律)。运作活开工工具跟构建,不写死 Claude。
- worktree 目录忽略提交;旧平级兄弟不迁不删,接回按「会话记的路径 → 新目录 → 旧兄弟」顺序找。账本 worktree 这版不动。

代码 / 数据 / 没建见 §3 ②。

### ③ 系统提示词与渐进加载(层 C standard)

**是什么**:每张活开工渲染一份系统提示词,主提示词是**外置模板** `standard/system-prompt/SYSTEM.md.tmpl`(哪张活、读被管仓 `AGENTS.md`、按任务加载哪份 reference、和 BW 状态机怎么配合)。references 是「干某类活需要额外知道的 Workbench 规范」(指标格式、周计划评论、改仓规则、`.bw` 现行契约),按活的 category/workflow 匹配;技能同理。写作分层(SYSTEM / reference / skill 各写什么)正本在 [`standard/README.md`](../standard/README.md),本模块只写怎么注入。

**关键取舍**:
- **正文一律不塞进提示词**——只给「一句话 + 完整路径」,references/技能文件不在硬盘就如实少一段不编路径,主提示词不硬编码在代码里(改身份/纪律 = 改 md)。这就是渐进加载:提示词放索引、正文让 agent 按需读。
- **不论哪个 workflow 都被这层兜住 Workbench 统一要求**——要加"所有项目都该守的统一要求",改这份 md,不加进 workflow 本身。
- **归一**:技能注入只有一个模型 `skill_pointer`(workflow→slug→`SkillPack`→入口 SKILL.md 路径)。类别→默认 workflow 是产品编译默认(构建/优化/运维默认 `mattpocock-skills`、原型/运营推广空着),默认 workflow 由 Workbench 打包统一管理、不写进被管仓(打包现状见 §3 ③)。运作剧本入口 body 自足;业界 workflow 入口 body 是 SOP 链 + 指向 `vendor/` 库子技能路径。两类同机制,不另开第二条注入路径。

三层各装什么、改了哪条流程要同步哪份——对照表就在下面。`AGENTS.md`「三层模型」指到这里。改 `standard/` 之前先对表。本周项目侧变化(`git log`、开着的 MR、账本)每次现算,不写进上述任何一层。

代码 / 数据 / 没建见 §3 ③。

**分工**(改提示词 / 加 reference / 改 skill 之前先对):


| 层                          | 装什么                                                                            | 不装什么               | 改它何时        |
| -------------------------- | ------------------------------------------------------------------------------ | ------------------ | ----------- |
| **主提示词** `SYSTEM.md.tmpl`  | 哪张活、读仓根 `AGENTS.md`、按任务加载哪份 reference、和 BW 状态机怎么配合、references/技能的**名字+一句话+路径** | 文件清单、格式版本、某类活的步骤   | 所有活都该守的契约变了 |
| **阶段规范** `references/*.md` | 干**这一类**活必须对照的现行契约                                                             | 怎么一步步干;本周这个项目发生了什么 | 这类活的协议变了    |
| **技能** `skills/*/SKILL.md` | SOP:先干什么、产出落哪、人点什么                                                             | 现行文件枚举当正本(会漂);铁律副本 | 这类活的步骤变了    |


本周项目侧变化(`git log`、开着的 MR、账本)每次现算,不写进上述任何一层。

**维护**(产品流程变了,同步哪份;目录变了就改 `standard/README` 那张表):


| 变了什么                                                     | 同步哪份                                                                                      | 谁在开工时读到                        |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| 所有活都守的纪律(最远评审中 / 提完 MR 改 inreview 标签 / 只提 MR / 提交优先用户技能) | `SYSTEM.md.tmpl`                                                                          | 每张活                            |
| 指标协议(可回溯、窗口、不许写 0、schema)                                | `references/metrics.md` + `templates/metrics.toml.tmpl`                                   | 运作活①;② 升格式时 skill 会再指过去        |
| 运作活①评论三标题 + 周五每周进展                                       | `references/week-plan-comment.md` + `week-planning` / `asset-audit` skill / 校验脚本(只查周初三标题) | 运作活①;运作活②(只写进展)                |
| 改仓:分支 / 提 MR / 合并是人 / 提完 MR 改 `bw:status:inreview`       | `references/build.md`                                                                     | 构建/优化/运维业务活;运作活②(改 `.bw` 也是改仓) |
| `.bw` 该有、整份可删、现行格式、和①的分工                                 | `references/bw-assets.md`                                                                 | 运作活②                           |
| 独立评审只评不改                                                 | `references/review.md` + `REVIEW.md.tmpl` + `mr-review`(尚未派发)                             | 评审会话                           |
| 某张运作活怎么干                                                 | 对应 `skills/<slug>/SKILL.md`                                                               | 挂了那个 workflow 的活               |
| 哪类活注入哪份 reference                                        | `app/bootstrap.rs` 的 `want_ref`                                                           | 开工渲染                           |


漏同步的结果就是周五盘点还在找已经不存在的登记表——协议变了只改内核、不改 reference,现场 agent 对不上。

**评审会话另有一份外置主提示词** `standard/system-prompt/REVIEW.md.tmpl`(独立评审身份 + 只评不改/绝不合并/意见落 MR 评论),渲染与摊开同机制;阶段规范 `review`、评审剧本 `mr-review` **设计走同一条注入链,但尚未编进二进制、未派发**(见 §3 ②「没建」的「请评审」)。

### ④ 技能与蒸馏(层 C standard)

**是什么**:Workbench 自带**四份运作剧本**(week-planning / asset-audit / metrics-refresh / project-handbook),编译期编进二进制,提示词只给"名字 + 一句话 + 完整路径",正文让 agent 按需读(渐进加载)。`asset-audit` 是运作活②的剧本,对应 §1 用例。仓里另有一份评审剧本 `mr-review` 和评审提示词:规范已入库,尚未编进二进制、也未派发(见 §3 ②「没建」)。

**关键取舍**:
- **不预建方法论技能**——原六份「阶段方法论」默认 workflow 没打包、一份没被真正派发过,删光:阶段方法论该由业界 workflow(mattpocock / proto-design,见 `standard/vendor`)提供,Workbench 每个环节挑一个最好的默认,要从实践里长出 Workbench 自己的方法论再建。阶段规范约束(references,如指标铁律、改仓规则)归 ④,不和技能混。
- **蒸馏是活的附属动作**——把一件做完的活提炼成带做法的技能,永远记着来自哪件活。技能正本编进二进制零 IO、全局一份不随项目复制(不进用户仓);"用过几次"每次现查 issue 列表聚合不落表不缓存、不显示胜率(无结算记录)。蒸馏今天没接:会话屏顶部按钮灰着、命令未接(见 §3 该删)。

代码 / 数据 / 没建见 §3 ④。

### ⑤ 桌面壳(层 D 壳)

**是什么**:Workbench MVP 的桌面应用壳(Dioxus / wry WebView,macOS+Windows)。壳只渲染和转发意图——健康什么颜色、活能不能转到那一列、指标有没有读数,全部由内核算好塞进 ViewModel;壳里没有一行业务判断,命令失败就把原话放进 toast 不假装做成了。**关键取舍**:终端挂在屏的外面(切面板不卸载,否则字节真丢);PTY 字节流和长命令进度走 broadcast 不走 ViewModel(一次性流,进 ViewModel 每次重渲染会被重写一遍拖垮界面);屏与屏之间只经共用 ViewModel 模块流转、守卫拦着不能互相引用。

代码 / 数据 / 没建见 §3 ⑤。

---

## §3 · 实现(代码层)

> 每个能力模块的代码落点、数据、依赖、没建。模块顺序同 §2(①-⑤)。dispatch 在 `app/mod.rs`,派发到 app/ 下各用例模块(issue / plan / ops / collect / health / bootstrap / chat_notify / session / tools / worktree,各自成篇见 §1)。

### 结构总览 · 三 crate 架构

Workbench MVP 由三个 Rust crate 组成,各管一件事、互锁而不互相渗透:

**bw(内核)**:本地零数据库——codehub/GitHub 的 issue+标签是唯一 issue 正本;仓文件解析(读 `.bw/*`)、现算推导(健康/走势/用量)、自己的一对 Command/Event、项目约定、两张运作活、项目群工厂全在这层。它是纯领域与编排,不直接碰终端、不直接碰远端协议。

**bw-engine(能力底座)**:本机 Orca 的本地 pipe 客户端(会话开工)、封存的 PTY 旧实现、每张活一棵 git worktree 的供给、git 读数、codehub/GitHub 两个远端。它只认裸的通用 id,不活、不持有业务语义——一个 id 背后是"活"还是"会话"由上层说。

**app-shell(壳)**:八个屏(项目墙 / 接入 / 设置 三个顶层 + 总览 / 计划 / 会话 / 配置 / 知识库 五个项目内入口)+ 内核桥(独立线程)+ ViewModel + 主题 + 适配模块。壳只渲染和转发意图,没有一行业务判断。

**一屏一模块,三守卫钉死。** 单文件动辄上万行、改一处散弹一片是走不下去的。Workbench 立三条规矩,且靠机制而非自觉:

1. **每屏只有一个公开出口**——屏内随便拆文件,但除这一个函数外不再有第二个能被外部引用;
2. **共享数据只经共用的 ViewModel 模块流转**——两屏都展示同一样东西时类型定义在共用模块里各自引用,**永远不允许一屏直接引用另一屏**;
3. **每个适配模块的 README 固定三段**——借自哪个项目哪个文件、借了什么、没借什么。以后持续借鉴只在该模块内增量,不散弹。

门禁里还有三条纯文本结构守卫(不编译,CI 照跑):屏与屏不互相引用、单文件 2000 行硬上限、用界面框架 hook 的函数必须是组件(后者是评审抓到真 bug 后补的——普通函数在渲染宏里被直接调用时 hook 落在调用方槽位,切屏类型一变整次渲染崩溃,编译期一点征兆都没有)。

### 运行机制 · 数据流

界面只发 Command、只收 Event;`bw/app` 的 `dispatch` 是唯一执行入口,跑用例 → 写 codehub issue 正本/仓文件 → recompute 现算 → 事件流回 UI。终端字节流不走 ViewModel、也不走事件总线——桥上单开一条 broadcast 通道,内核线程定时往里推(终端一秒几百批字节,每批重拼整份 ViewModel 会把界面拖垮,而且字节是一次性的流,进 ViewModel 每次重渲染都会被重新写进终端一遍)。

### ① 关键信息维护

**代码**:bw 的 `app/issue_store.rs`(互转主逻辑)、`model.rs`(`Issue`/`IssueId`/`IssueStatus` + `can_transition_to` 转移规则)、`app/issue.rs`(读写入口)、`repo/`(共用读写口 + 解析器:project / metrics;issue-policy 只留残留格式解析给测试)+ `local/`(`registry` projects.toml + `sessions` jsonl + `settings` settings.toml,运行时资产)+ `chat/`(`NotifyEvent` 枚举注册表)+ `standard/mod.rs`(模板渲染);bw-engine 的 `remote.rs`(`Remote` enum 工厂 + issue 存取六法 + MR 三件套)+ `codehub.rs` / `github.rs`(两臂)。
**数据**:issue 正本在 codehub/GitHub;仓文件是正本,解析结果只在内存现用;本地零库,远端读全走 CLI 不留缓存;本机运行时资产(`projects.toml`/`settings.toml`/`sessions/*.jsonl`)落 `asset_root`,纯运行时零正本,append-only 取末行为最新。
**依赖**:serde / toml 反序列化、sha2 算指纹;上游 `bw-engine/remote.rs`;对已删的 V3 crate 零依赖(史实见附录)。
**没建**:本地读缓存(MVP 不要)。"MR 检查失败"今天还判不出。已合入待点完成:详情查出已合入的 MR 号;待评审→完成时若没有开着的 MR,确认后只关 issue(人可能已经在网页合过)。C 类定时建提醒活没做。采集执行落在 `app/collect.rs`(用例「指标采集」),项目约定编排见用例「接入」。指标读数流水 `.bw/metrics/readings.jsonl`(键日历日,同天同指标只留一行;展示按周取那一周日期最大的一天)。

#### 二级特性 · 健康推导

**代码**:bw 的 `derive/`(`derive_project_health` 唯一判色纯函数 + `sealed.rs` 密封件 + `HealthInputs`)+ `app/health.rs`(只读采集 + `recompute_health` 唯一写入者)+ `trend.rs`(走势现算)。
**数据**:本地零库不存灯;结果只在 `local/registry.rs` 项目显示缓存里留两列服务项目墙;判据每次打开现算。
**依赖**:上游指标读数流水 + `.bw/metrics.toml` 目标定义;git / isoweek;只消费读数不负责采集。对已删的 V3 crate 零依赖(史实见附录)。
**没建**:C 类定时建提醒活没做(总览卡手填今天的数已接)。版本目标从 ops① 评论解析整段(多条从新到旧,认 `## 版本目标` / 旧评 `## 周目标` / `## 本周目标`);没读到就不打勾。点过采集或每日自动采过、流水里有本周或上周的行,灯可以因读数难看变红。

### ② 会话与执行

**Orca 客户端接口**(`bw-engine/orca.rs`,对标 `open_design.rs`):

- `connect() -> OrcaRuntime` — 读本机 `orca-runtime.json`,token 不落盘
- `ensure_repo` — 纳入、以及打开项目时先 `repo.show`。Orca 已认这个仓就原样返回,不盖遮罩、不再 `repo.add`;没有才 add。成功后再注入三条运作自动化(默认关)。同进程内存表只加速连点,不落盘。不跟开工 / 去会话绑在一起
- `refresh_worktrees` — 开工在 `git worktree add` 之后、create 之前:再写一次 `worktreeBasePath`(误写成 `.bw/worktrees` 的清掉)。Orca 没有「刷新扫描」RPC;刚 add 的树立刻 create 会 `selector_not_found`;只有 payload 带 `worktreeBasePath` 的 `repo.update` 才清这级缓存
- `reveal_tree` / `activate_worktree` — 去会话和开工成功后跟网页:只 `worktree.activate`(12s)。不 ensure、不 resume
- `create_session(worktree, agent, prompt, system)` — Claude:`agentArgs` 一条单行(`--append-system-prompt '<压成单行的系统提示词>' '<标题+正文>' --dangerously-skip-permissions --disallowedTools 'Bash(gh pr merge)'`)。Cursor:`agentArgs` 同一套拼法:`--force --trust '<压成单行的系统提示词>'`。标题+正文走 Orca `prompt` + `auto-submit`。`clientOperationId` 用 Orca 规定形状(13 位毫秒 + `-` + 32 hex)。Orca 回「等终端句柄超时」:窗已在,先停 5 秒再收 jsonl / 切树
- `web_embed_url(fallback)` — 给会话屏 iframe 的 loopback;先 `BW_ORCA_WEB_URL` 后本机设置。WebView2 部分导航丢 fragment,把 `#pairing=` 搬成 `?pairing=`

**代码**:会话屏 `app-shell/screens/session/mod.rs`(只剩 Orca/OD 两页签);开工在计划屏 → `run_issue` / `run_issue_orca`;路径 `bw-engine/workspace.rs`;Orca 客户端 `bw-engine/orca.rs`;OD `bw-engine/open_design.rs`(`discover_web_url` 探活 + `looks_loopback_http` 只放行 loopback);工具探活 bw 的 `app/tools.rs` + `bw-engine/claude_bin.rs`(候选路径)。
**数据**:issue 正本不变。会话正文不进 Workbench 库。token 不入库。worktree 目录不入库。系统提示词开工时现算、一次性灌进 Orca/OD,不落配置屏、不跟会话屏当前页签走。OD 探活结果是一次性 loopback url 挂在 `use_signal` 里不落库不缓存。
**依赖**:本机 Orca(官方包或源码桌面)+ named-pipe;会话屏 iframe 吃本机设置里的 pairing URL(开发期可被 `BW_ORCA_WEB_URL` 覆盖)。平台 Windows 命名管道 + macOS/Linux unix socket。`#![forbid(unsafe_code)]` 仍守。
**没建**:不能自己 mint 配对码,人从 Orca 桌面「给 web 配对」拿「Open in browser」贴进设置屏(存本机 `settings.toml`,带 token 不进仓 / Event 原文 / 日志);跟随在带这刀的 Orca 里已兑现、官方包还没有。`DeleteSession` 内核还在、会话屏没有按钮(见下「该删」)。账本路径未改。OD 导出产物→MR 的约定仍 defer(没加"OD 类活评审前 `design/` 非空"显式前置校验,今天靠"0 提交如实弹回"兜底);壳侧 `open_design` 适配模块未建(实际只有 claude_cli / codegraph / terminal_xterm)。**请评审**(规范已入库,按钮未接):剧本 `mr-review`、阶段规范 `review`、提示词 `REVIEW.md.tmpl` 和 `05-features/reviewer-agent/` 已在仓里;计划屏/会话屏没有按钮,内核没有评审命令。接到 Orca 上另开一张活。

### ③ 系统提示词与渐进加载

**代码**:bw 的 `app/bootstrap.rs`(`agent_system_prompt` 渲染模板 + `skill_pointer` + `references_for`)+ `standard/system_prompt.rs`(`SYSTEM_PROMPT_TMPL` + references 表)+ `standard/skills.rs`(四份运作剧本 `include_str!` + 评论校验脚本 sidecar)+ `app/mod.rs`(`ensure_skill_assets` / `ensure_prompt_assets`)。
**数据**:主提示词模板 + references + 技能正本都编进二进制,开工时摊到 `<asset_root>/`;提示词是一次性字符串经 `--append-system-prompt` 送进 CLI,不落盘不缓存。
**依赖**:standard::system_prompt、standard::skills、standard::render、bw_engine::LaunchPlan(`--add-dir`)、codehub issue 正本。
**没建**:`proto-design`(原型阶段默认 workflow)源还没 vendor 进来、未打包;vendor 摊是 dev 期从源码树 runtime 复制(分发态无源码树时降级为不摊,入口仍注入但子技能读不到);references 现四份已派发(指标 / 运作活①评论 / 改仓 / `.bw` 契约)+ 评审一份未派发;② 收口每周进展时也注入 `week-plan-comment`;运营推广/竞品阶段无业界默认(留白)。

### ④ 技能与蒸馏

**代码**:bw 的 `standard/skills.rs`(`SkillPack` + 四份 `include_str!` + `desc_of` + 评论校验脚本 sidecar)+ `app/mod.rs`(`asset_root` / `skills_dir` / `ensure_skill_assets`)+ `app/bootstrap.rs`(`SkillPointer`)+ `app/ops.rs`(`skill_slug` 只映射两个运作剧本);app-shell 的 `bridge/vm_panels.rs`(配置屏 skill_list + workflow_usage 现算)。`project-handbook` 在仓里,盘点不派发。
**数据**:四份正本编进二进制,开工摊到 `<asset_root>/skills/<slug>/SKILL.md`(全局一份);活挂的 workflow 名在 codehub issue 正本上;"用过几次"每次现查聚合不落表;提示词一次性字符串不落盘。
**依赖**:standard::skills、standard::system_prompt、bw_engine::LaunchPlan(`--add-dir`)、Issue 模型;无数据库无网络。
**没建**:蒸馏按钮灰着、命令未接(见下「该删」);配置屏「导入」按钮没接(见下「该删」)——用户自己的技能约定放进被管仓 `.claude/skills/<slug>/SKILL.md`(配置表扫成「项目自有」),不拷进 Workbench 资产目录;`skill_slug` 硬编码映射运作剧本 + mattpocock-skills;`proto-design` 源还没 vendor。活上的 workflow 人话名(如「更新指标与版本计划」)对应剧本目录 `week-planning`,详情可跳配置屏亮那一行。

### ⑤ 桌面壳

**代码**:app-shell 的 `main.rs`(Root)+ `bridge/`(独立线程持有 App + nav + vm_build/vm_derive/vm_kb/vm_panels 四分文件拼 VM)+ `vm.rs`(全体 ViewModel)+ `theme/` + `chrome/` + `screens/`(八屏各一目录)+ `adapters/`(一能力一目录)。Windows exe 图标走 `app.ico` + `build.rs`(`winres`),编不过只告警。换项目时内核桥只采打开的那个仓(issue 名单 / 周目标 / 发版 / 健康 / 版本列表 / 当前用户)就推 ViewModel 切页,不顺手刷墙上其他仓;每张活的 MR 号后台回填,不挡第一屏。还在项目墙才拉全墙。拖拽改状态写成功只补丁这一张,不重拉名单(ADR 0002)。
**数据**:本地零数据库——本机数据是 TOML/JSONL 落 `data_dir()` 下;codehub/GitHub issue+标签是唯一 issue 正本;壳自己不存任何业务数据,每个数字都是拼 ViewModel 那一刻从内核现算塞进来的。对照日志全仓一份 `bw.log`:`cargo run` 写到启动目录,直接跑 exe 写到项目目录(仓根或安装目录);`BW_LOG` 可改路径。一行是 `[时间] [模块] [文件] [行] [ok|err|warn] 正文`。E2E 标签(`[BW_OPEN]` 等)留在正文里。toast / 命令进出 / Orca RPC 都进这份文件。不写 token / pairing / 提示词正文。
**依赖**:bw(内核 App / Command / Model)、bw_engine(执行器 / 远端)、dioxus 0.7 hard-pin + wry、tokio;对已删的 V3 crate 零依赖(史实见附录);xterm.js 前端资产 `include_str!` 编进二进制不联网拉。
**没建**:Cursor 适配模块;MR 检查列、"等你输入"那种 agent 细粒度状态(要靠 hook 回传还没接);已结束的会话切走再回来回放仍空;Windows 安装包正源在 `.bw/release/pack/`(入口 `pack.cmd` / `e2e/e2e.cmd`,协议 ADR-0005)。计划屏「出包」走 `PackRelease`:两行弹窗吃出包 / 验包进度,不打标签;关弹窗后台继续,按钮三个点再点回来;停止再确认,杀进程树并清 `.bw/release/out/{version}` 与临时装目录。验包不过时「详情」列出 JSONL `cases`(哪条、过没过、报错原话)。「发版本」仍只走 `CutRelease`。`BW_CDP_PORT` 有值才开 WebView2 调试口;设置 / 接入深链打 `[BW_VIEW]`。会话左右栏可收,中栏终端跟着撑开。右侧「指南」全局都在,打开是仓里那份产品指南,不是另写的四章。指南下面是「上报问题」:弹窗写明会附对照日志,默认勾选;填标题后报到当前目录 git 的 workbench 仓,勾了附加就转圈「日志上传中」,成功走底栏 toast「问题已上报」。

### 该删(下一轮代码删除,本篇只记)

代码删除走单独一轮 worktree(开分支、cargo check + 门禁验证),不在本次文档编辑内:

- **legacy_pty 包**(`bw-engine/src/legacy_pty/`,4 文件):开工路径已不调用,外部仅一句注释 + `app-shell/adapters/claude_cli/README.md:7` 一条过时路径引用(一并修)。
- **蒸馏按钮**(会话屏顶部,灰着、命令未接):能力主张已记在 §2 ④,代码删。
- **配置屏「导入」按钮**(没接):用户技能走被管仓 `.claude/skills/`,不拷进 Workbench 资产目录。
- `**DeleteSession` 命令**(`command.rs` + `app/mod.rs` dispatch 接了,app-shell 无按钮):死命令。
- **issue-policy 残留解析**(`repo/` 里给测试用的旧格式):开工工具 / workflow / 周五盘点不再是仓文件,接入时不碰、盘点会删。
- **项目群历史 / 周报变体**:welink-cli 只发不读,`fetch_history` 稳定返 `HistoryUnsupported` 是正常返回值;周报(`weekly`)枚举 + 配置开关 + dispatch 槽都在,但无触发、无生成逻辑——保留接入点,删多余变体描述。
- **评审三件套 md**(`REVIEW.md.tmpl` / `references/review.md` / `mr-review`):零 `include_str!`、未编进二进制;主张已记在 §3 ②「请评审」,md 删或并入(下一轮议)。
- **预览·未合入灰态 / 蒸馏灰态占位**:未接,占位描述删。

### 留白(03 主张、未建,保留)

- 反馈站、进化站(五站后两站,03 主张)。
- 架构全景 4+1、大风险标记、审结果对话、原型 / 操作逻辑守卫、中间段自动跑、C 类定时、proto-design 打包。
- 评审派发(`mr-review` 等接按钮)——见 §3 ②「没建」。
- 群双向机器人、个人 Windows 弹窗——见 §1「项目群发送」没建。

---

## 附 · 这篇没写、但你可能在找的


| 你在找                                   | 去哪                                                                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 用例 / 旅程怎么编排                           | 本篇 §1                                                                                                                                                                                                  |
| 特性(能力模块设计层)                           | 本篇 §2                                                                                                                                                                                                  |
| 实现(代码落点 / 数据 / 依赖 / 没建)               | 本篇 §3                                                                                                                                                                                                  |
| 该删什么 / 留白什么                           | 本篇 §3 末尾                                                                                                                                                                                               |
| 怎么给 Workbench 开发(怎么建 / 跑 / 测 / 加特性)   | [`AGENTS.md`](../AGENTS.md)                                                                                                                                                                            |
| 主提示词 / reference / skill 各装什么、改流程同步哪份 | 本篇 §2 ④ 对照表(`AGENTS.md`「三层模型」指到这里)                                                                                                                                                                     |
| 产品命题                                  | [`README.md`](../README.md) + 本篇篇首导读                                                                                                                                                                   |
| 界面长什么样                                | 视觉语言 [`docs/04-design-system/`](04-design-system/README.md);八屏版式与旅程 [`docs/hifi/index.html`](hifi/index.html) + [`docs/hifi/README.md`](hifi/README.md);五站驾驶地图 [`docs/hifi/home.html`](hifi/home.html) |
| 版本变更                                  | [`CHANGELOG.md`](../CHANGELOG.md)                                                                                                                                                                      |
| 领域词                                   | [`CONTEXT.md`](../CONTEXT.md)                                                                                                                                                                          |
| 架构决策                                  | [`docs/02-adr/`](02-adr/)                                                                                                                                                                              |
| 老版本史实(V3 删除、旧 16 模块挪移地图)              | 本附录下两节                                                                                                                                                                                                 |


### V3 史实

V3 的六个 crate(bw-core / bw-engine / bw-store / bw-app / ui / app-desktop)已于 2026-08-24 删除(见 `v3` 分支)。当前实现不是从 V3 迁移来的:底座是拷过来接管后做了三件减法(断掉对 V3 内核的依赖、删只有 V3 用的出口、删两条零调用死链),内核是全新的库与全新的 Command/Event——旧库的二十张表与架在表上的用例整片接不上,改它等于拆了重装还会连累当时还在跑的 V3。名字里的版本号(`bw`、bin 名 `bw-dev`)是共存期的权宜,删旧壳那次一并改回不带版本号的名字。两个能力模块(① 关键信息维护、⑤ 桌面壳)的依赖行都注明「对已删的 V3 crate 零依赖」。

### 旧 16 模块 → 新位置挪移地图


| 旧模块                  | 去向                                                  |
| -------------------- | --------------------------------------------------- |
| 1 codehub-issue 正本   | §2/§3 ① 关键信息维护                                        |
| 2 仓文件解析              | §2/§3 ① 关键信息维护                                        |
| 3 项目约定               | §1 用例「接入」+ 名片事实进 §2 ①                               |
| 4 系统提示词              | §2/§3 ③(保留)                                         |
| 5 command-event 与状态机 | 状态机归 §2/§3 ①;dispatch 是内核工作方式不单列(见 §3 运行机制)           |
| 6 健康推导               | §2/§3 ① 关键信息维护·健康推导(二级特性,派生);指标展示进 §1 用例                        |
| 7 会话与执行              | §2/§3 ② 会话与执行                                       |
| 8 远端与工具探活            | 远端进 §2/§3 ① 关键信息维护;工具探活进 §2/§3 ② 会话与执行                |
| 9 open-design        | §2/§3 ② 会话与执行                                       |
| 10 项目群               | §1 用例「项目群发送」;`NotifyEvent` 注册表归 §2/§3 ①             |
| 11 桌面壳               | §2/§3 ⑤ 桌面壳(保留)                                     |
| 12 指标采集与读数           | §1 用例「指标采集」;读数/定义事实进 §2/§3 ①                        |
| 13 周循环与计划            | §1 用例「周循环与计划」                                       |
| 14 资产盘点与项目接入         | 接入进 §1 用例「接入」;盘点②进 §2/§3 ④ 技能与蒸馏(asset-audit skill) |
| 15 技能与蒸馏             | §2/§3 ④ 技能与蒸馏(保留 + asset-audit)                     |
| 16 app 编排与运行时        | 状态机 / asset_root 归 §2/§3 ①;dispatch 不单列             |


