# architecture.md — Workbench MVP 设计正本

> **30 秒导读**:这是什么——Workbench MVP 的**唯一设计正本**,一篇讲清三个 crate 怎么互锁、Workbench 怎么给被管项目赋能、16 个模块各自解决什么问题。**给谁看**——理解 Workbench 设计的人和 AI:要判断"某条为什么这么定"、要接手某个模块、要往规范里加东西。**现在还作数吗**——作数,这是当下唯一作数的设计总览(V3 史实已随 V3 删除,见 `v3` 分支)。**怎么和别处衔接**——开发规矩(怎么建/跑/测/加特性)在 `AGENTS.md`,不在本篇;每个模块的核心设计在本篇 §3;还没干的活在各模块「没建什么」段;界面长什么样看 `docs/hifi/index.html`(演示数据仍是旧方案,现行见该目录 README)。`DESIGN.md` 指向本篇。看不懂的词查 `CONTEXT.md`。接入 / 名片 / 开工工具 / 周五盘点的**方案正本是 §3 模块 3「项目约定」**,别处现在时表述必须跟它一致。

**写作约定**:正文说人话,实现名字(命令名、函数名、表名)只在必要时作为"代码锚点"出现、不逐文件:行罗列;代号在当篇第一次出现带一句人话说明。

---

## §1 · 三 crate 架构

Workbench MVP 由三个 Rust crate 组成,各管一件事、互锁而不互相渗透:

**bw(内核)**:本地零数据库——codehub/GitHub 的 issue+标签是唯一 issue 正本;仓文件解析(读 `.bw/*`)、现算推导(健康/走势/用量)、自己的一对 Command/Event、项目约定、两张运作活、项目群工厂全在这层。它是纯领域与编排,不直接碰终端、不直接碰远端协议。

**bw-engine(能力底座)**:本机 Orca 的本地 pipe 客户端(会话开工)、封存的 PTY 旧实现、每张活一棵 git worktree 的供给、git 读数、codehub/GitHub 两个远端。它只认裸的通用 id,不活、不持有业务语义——一个 id 背后是"活"还是"会话"由上层说。

**app-shell(壳)**:八个屏(项目墙 / 接入 / 设置 三个顶层 + 总览 / 计划 / 会话 / 配置 / 知识库 五个项目内入口)+ 内核桥(独立线程)+ ViewModel + 主题 + 适配模块。壳只渲染和转发意图,没有一行业务判断。

**V4 对 V3 零依赖。** V3 的六个 crate(bw-core / bw-engine / bw-store / bw-app / ui / app-desktop)已于 2026-08-24 删除(见 `v3` 分支)。V4 不是从 V3 迁移来的:底座是拷过来接管后做了三件减法(断掉对 V3 内核的依赖、删只有 V3 用的出口、删两条零调用死链),内核是全新的库与全新的 Command/Event——旧库的二十张表与架在表上的用例整片接不上,改它等于拆了重装还会连累当时还在跑的 V3。名字里的版本号(`bw`、bin 名 `bw-dev`)是共存期的权宜,删旧壳那次一并改回不带版本号的名字。

**一屏一模块,三守卫钉死。** 老 Workbench 走不下去的原因之一是单文件动辄上万行、改一处散弹一片。V4 立三条规矩,且靠机制而非自觉:

1. **每屏只有一个公开出口**——屏内随便拆文件,但除这一个函数外不再有第二个能被外部引用;
2. **共享数据只经共用的 ViewModel 模块流转**——两屏都展示同一样东西时类型定义在共用模块里各自引用,**永远不允许一屏直接引用另一屏**;
3. **每个适配模块的 README 固定三段**——借自哪个项目哪个文件、借了什么、没借什么。以后持续借鉴只在该模块内增量,不散弹。

门禁里还有三条纯文本结构守卫(不编译,CI 照跑):屏与屏不互相引用、单文件 2000 行硬上限、用界面框架 hook 的函数必须是组件(后者是评审抓到真 bug 后补的——普通函数在渲染宏里被直接调用时 hook 落在调用方槽位,切屏类型一变整次渲染崩溃,编译期一点征兆都没有)。

---

## §2 · 工作流模型:Workbench 怎么给被管项目赋能

### 三来源两路径

Workbench 给一个项目赋能走两条路径,信息落点分清:

- **路径 A · 轻量(不走会话)**:项目约定把名片写进常驻树 `bw/project`,无 agent、无系统提示词。不写人的主检出。
- **路径 B · 走会话**:挂了 workflow 的活开工,agent 在活的工作区里跑。系统提示词兜底 Workbench 统一要求,workflow 自己管流程。

三类产出各有落点:**顶层文档**(README / AGENTS / CLAUDE / CHANGELOG)是项目自己的,盘点不代写。**dev 过程件**(CONTEXT / adr / spec / ticket)由 workflow 自己产。**名片** `.bw/project.toml` 走路径 A。运作活②走路径 B:对照 `references/bw-assets.md` 清残留、升格式、点未闭环的环,不重写名片意图。

### 系统提示词(文件 + references + 技能指针)

每张活开工时给 agent 的系统提示词:主提示词是**外置的 `standard/system-prompt/SYSTEM.md.tmpl`**(哪张活、读被管仓 `AGENTS.md`、按任务加载哪份 reference、和 BW 状态机怎么配合),`{{...}}` 占位在运行时填——活的信息、本活要读的 references 阶段规范、本活挂的技能。三层各写什么见 [`standard/README.md`](../standard/README.md)。**不论哪个 workflow 都被这层兜住 Workbench 统一要求**——要加"所有项目都该遵守的统一要求",改这份 md,不加进 workflow 本身,也不硬编码在 Rust `format!` 里。

references(`standard/system-prompt/references/*.md`)是「干某类活需要额外知道的 Workbench 规范」(指标铁律、改仓规则、`.bw` 现行契约),按活的 category/workflow 匹配后摊到 `<asset_root>/system-prompt/references/`、提示词只给路径。技能同理。分工与同步对照表在 §3 模块 4。文件不在硬盘就如实少一段不指,不编路径。这就是渐进加载:提示词放索引,正文让 agent 按需读(单个技能正文均值八千多字符,而注入护栏上限约六千字符,整包塞进提示词根本装不下)。

### 默认 workflow

类别→workflow 是产品编译默认:构建/优化/运维默认 `mattpocock-skills`、原型/运营推广空着。**默认 workflow 由 Workbench 打包统一管理**(像自带技能一样摊到资产目录、开机即用),不写进被管仓。现状:**`mattpocock-skills` 已打包**——Workbench 写一份入口 SKILL.md(body 是 grill→implement→review SOP,指向 vendor 库子技能路径)作 SkillPack 走 `skill_pointer` 注入,vendor 库整树摊到 `<asset>/vendor/`(dev 期从源码树 runtime 摊,分发态 defer);`proto-design`(原型)源还没 vendor 进来、未打包。

### 数据流

界面只发 Command、只收 Event;`bw/app` 的 `dispatch` 是唯一执行入口,跑用例 → 写 codehub issue 正本/仓文件 → recompute 现算 → 事件流回 UI。终端字节流不走 ViewModel、也不走事件总线——桥上单开一条 broadcast 通道,内核线程定时往里推(终端一秒几百批字节,每批重拼整份 ViewModel 会把界面拖垮,而且字节是一次性的流,进 ViewModel 每次重渲染都会被重新写进终端一遍)。

### 四铁律(设计不变量)

这四条从 V1 一路到 V4 没变,是设计约束,守它们的代码机制只点一句、不展开实现:

1. **杀进程重开,所有数字能重算、前后一致**——健康 / 走势 / 用量全部现算,`recompute_*` 是唯一写入者。
2. **信号只能从数据推导;没数据就是 Unknown,不是绿**——`Derived<Signal>` 密封类型,store 层根本没有 `set_signal` 方法,手工把项目点绿在类型上就没有这条路。
3. **完成永远由人点;同一件活绝不记两次**——状态机 `can_transition_to` 守卫,Done 的唯一入边是 InReview;定时任务只自动建活、绝不自动完成。
4. **记录只追加、不修改;事后抹不掉**——跨天只追加。同一日历日同一指标只留一行(当天再采或再手填,覆盖这一行,不是再叠一行)。落点是仓文件 `.bw/metrics/readings.jsonl` 与 codehub issue 评论。采/手填写在固定账本 worktree(`bw/ledger`),不写人的主检出;合进主干跟运作活①走。

---

## §3 · 16 模块核心设计

> 每个模块的核心设计见本篇 §3;这里只写核心设计:这个模块解决什么问题、怎么设计的、关键取舍。代码落点指到 crate/目录级。

### 1 · codehub-issue-正本

**是什么**:codehub/GitHub 的 issue+标签是唯一 issue 正本,本地零数据库。这个模块是 `Issue` 领域对象与远端 issue+标签的互转层:状态、排期(版本)、发版号、类别全部以标签表达,两台 Workbench 接同一个 codehub 仓读出来的是同一份活态——这就是"共享正本",leader 看 4/7 进展无盲区。排期只有一个槽:打 `bw:plan:<版本名>`,里程碑标题同字;每个里程碑都是一个版本,名字不设限(`vX.X` 只推荐)。旧 `bw:week:` 不认。标题是 ISO 周号(`2026-W36`)的旧里程碑不当版本,不进下拉、不当在研。关键取舍是放弃本地读缓存(MVP 卡点认了),读全走 CLI。业务活的开工工具和 workflow 不另打标签,读回时用 `bw:category:*` 去查本机 settings,没有就用产品默认。运作活不打五阶段类别;开工工具跟构建(配置屏「构建」那条本机设置),workflow 仍按标题推断(①版本计划 / ②资产盘点)。

**代码**:bw 的 `app/issue_store.rs`(互转主逻辑)、`model.rs`(`Issue`/`IssueId`)、`app/issue.rs`(读写入口)。
**数据**:issue 正本在 codehub/GitHub 的 issue+标签;本地零库,不留读缓存。
**依赖**:上游 `bw-engine/remote.rs`(`Remote` 三变体分发,调 codehub-cli / gh);下游命令层(模块5)经它落盘,壳查询经 `App::issues` 读回。
**没建**:本地读缓存(MVP 不要)。"MR 检查失败"今天还判不出。已合入待点完成:详情会查出已合入的 MR 号;待评审→完成时若没有开着的 MR,确认后只关 issue(人可能已经在网页合过)。

### 2 · 仓文件解析

**是什么**:把项目仓 `.bw/` 下的配置/定义文件解析成内存结构供各屏现读现用。仓是正本——人、agent、第二台机器要看的都住仓里走 MR,本地不存第二份;这一层是读写正本的唯一入口,别处不许自己拼路径读 `.bw/*.toml`。关键取舍是不做 `deny_unknown_fields`(人手写多一个字段就整份崩代价太大),metrics 只认 `schema_version=2`、内核读到旧格式整份拒收(不上屏、不在打开项目时改仓)。北极星/口径重定跟运作活①;旧格式升到现行、迁读数、清残留跟运作活②。不写进系统提示词、不做内核静默迁移。现行 `.bw` 契约在 `references/bw-assets.md`。

**代码**:bw 的 `repo/`(共用读写口 + 解析器:project / metrics;issue-policy 只留残留格式解析给测试;旧仓还有 managed / standard)+ `standard/mod.rs`(模板渲染)。
**数据**:不落本地库,仓文件就是正本,解析结果只在内存里现用;写回手写渲染而非 `toml::to_string`,为把注释留给人看。
**依赖**:serde / toml 反序列化、sha2 算指纹;对 V3 任何 crate 零依赖。
**没建**:采集执行落在 `app/collect.rs`(模块12),项目约定编排见模块3。B/C 读写 `.bw/metrics/readings.jsonl` 已接(键是日历日,同一天同一指标只留一行;展示按周取那一周日期最大的一天)。C 类定时建提醒活没做。

### 3 · 项目约定

**是什么**:Workbench **第一次纳入**一个项目时自动建一张轻量活「项目约定」,只写 `.bw/project.toml`(外加 `.bw/.gitignore` 忽略 `worktrees/`),落在常驻分支 `bw/project` 上,开 MR 等人合。全程不起 agent。默认分支 HEAD 已有名片、或已经开着项目约定 / 残留「编辑项目名片」/ 残留「规范铺底」就整段不跑——主检出上未合入的脏文件不算已接入。没合进默认分支、或后来改名片时 MR 还开着,总览常驻横幅(一条,不另叠旧标题横幅)。之后改名片 / 项目群复用同一标题、同一棵树。在研版本不进仓文件:看远端里程碑覆盖当天(`start ≤ 今天 ≤ due`),多个取最后创建,总览编辑表单下拉可切(只读行带「· 本周」)。旧 `current_version` 解析时丢掉,多一行不报错、不驱动展示。开工工具跟人走本机,不进仓。类别→workflow 和周五盘点只认产品默认。关键取舍是**不写主检出**、完成永远人点、常驻分支合入后不删。仓根一个字不写。

**代码**:bw 的 `app/bootstrap.rs`(第一次接入)+ `app/project.rs`(改名片)+ `bw-engine` `PROJECT_BRANCH`。
**数据**:仓里站着的只有名片 `project.toml`。不铺 `issue-policy.toml`(开工工具 / workflow / 周五盘点不再是仓文件)。不铺 `PROJECT.md` / `standard.toml` / `managed.toml`。指标空壳不预铺。旧仓残留由每周资产盘点在运作活②的 worktree 里删,随盘点 MR 走。
**依赖**:git、worktree、issue_store。
**没建**:节律目录 / 鱼塘 `pond/` 未建。旧仓里的 `.bw/standard.toml` / `managed.toml` / `PROJECT.md` / `issue-policy.toml` 接入时不碰,每周资产盘点会删。

### 4 · 系统提示词与渐进加载

**是什么**:每张活开工渲染一份系统提示词,主提示词是**外置的 `standard/system-prompt/SYSTEM.md.tmpl`**(哪张活、读被管仓 `AGENTS.md`、按任务加载哪份 reference、和 BW 状态机怎么配合),`{{...}}` 占位在运行时填:活的信息、本活要读的 references 阶段规范、本活挂的技能。写作分层(SYSTEM / reference / skill 各写什么、现在写到哪一层)正本在 [`standard/README.md`](../standard/README.md),本模块只写怎么注入。references(`standard/system-prompt/references/*.md`)是「干某类活需要额外知道的 Workbench 规范」(指标格式、周计划评论、改仓规则、`.bw` 现行契约),按活的 category/workflow 匹配后摊到 `<asset_root>/system-prompt/references/`、提示词只给路径,agent 按需读。技能同理摊到 `<asset_root>/skills/`。关键取舍:**正文一律不塞进提示词**(只给「一句话 + 完整路径」),references/技能文件不在硬盘就如实少一段不编路径,主提示词不硬编码在 `format!` 里(改身份/纪律 = 改 md)。**归一**:技能注入只有**一个模型**——`skill_pointer`(workflow→slug→`SkillPack`→入口 SKILL.md 路径)。运作剧本(week-planning 等)的入口 body 自足;业界 workflow(mattpocock-skills)的入口 body 是 SOP 链 + 指向 `vendor/` 库子技能路径(库由 `ensure_vendor_assets` 摊)。两类同机制,不另开第二条注入路径。

三层各装什么、改了哪条流程要同步哪份——对照表就在本模块下面。`AGENTS.md`「三层模型」指到这里。仓根 `standard/README` 记现行目录结构。改 `standard/` 之前先对表。被管项目里的 agent 看不见本篇,现场对照靠开工注入的 reference 路径。

**分工**(改提示词 / 加 reference / 改 skill 之前先对):

| 层 | 装什么 | 不装什么 | 改它何时 |
|---|---|---|---|
| **主提示词** `SYSTEM.md.tmpl` | 哪张活、读仓根 `AGENTS.md`、按任务加载哪份 reference、和 BW 状态机怎么配合、references/技能的**名字+一句话+路径** | 文件清单、格式版本、某类活的步骤、四段 gate | 所有活都该守的契约变了 |
| **阶段规范** `references/*.md` | 干**这一类**活必须对照的现行契约 | 怎么一步步干;本周这个项目发生了什么 | 这类活的协议变了 |
| **技能** `skills/*/SKILL.md` | SOP:先干什么、产出落哪、人点什么 | 现行文件枚举当正本(会漂);铁律副本 | 这类活的步骤变了 |

本周项目侧变化(`git log`、开着的 MR、账本)每次现算,不写进上述任何一层。

**维护**(产品流程变了,同步哪份;目录变了就改 `standard/README` 那张表):

| 变了什么 | 同步哪份 | 谁在开工时读到 |
|---|---|---|
| 所有活都守的纪律(最远评审中 / 只提 MR / 提交优先用户技能) | `SYSTEM.md.tmpl`(评审会话另改 `REVIEW.md.tmpl`) | 每张活 |
| 指标协议(可回溯、窗口、不许写 0、schema) | `references/metrics.md` + `templates/metrics.toml.tmpl` | 运作活①;② 升格式时 skill 会再指过去 |
| 运作活①评论三标题 + 周五每周进展 | `references/week-plan-comment.md` + `week-planning` / `asset-audit` skill / 校验脚本(只查周初三标题) | 运作活①;运作活②(只写进展) |
| 改仓:分支 / 提 MR / 合并是人 / 0 提交不装前进 | `references/build.md` | 构建/优化/运维业务活;运作活②(改 `.bw` 也是改仓) |
| `.bw` 该有、整份可删、现行格式、和①的分工 | `references/bw-assets.md` | 运作活② |
| 独立评审只评不改 | `references/review.md` + `REVIEW.md.tmpl` + `mr-review`(尚未派发) | 评审会话 |
| 某张运作活怎么干 | 对应 `skills/<slug>/SKILL.md` | 挂了那个 workflow 的活 |
| 哪类活注入哪份 reference | `app/bootstrap.rs` 的 `want_ref` | 开工渲染 |

漏同步的结果就是周五盘点还在找已经不存在的登记表——协议变了只改内核、不改 reference,现场 agent 对不上。

**评审会话另有一份外置主提示词** `standard/system-prompt/REVIEW.md.tmpl`(独立评审身份 + 只评不改/绝不合并/意见落 MR 评论),渲染与摊开同机制;阶段规范 `review`、评审剧本 `mr-review` **设计走同一条注入链,但尚未编进二进制、未派发**(见模块7「请评审」)。

**代码**:bw 的 `app/bootstrap.rs`(`agent_system_prompt` 渲染模板 + `skill_pointer` + `references_for`)+ `standard/system_prompt.rs`(`SYSTEM_PROMPT_TMPL` + references 表)+ `standard/skills.rs`(四份运作剧本 `include_str!` + 评论校验脚本 sidecar)+ `app/mod.rs`(`ensure_skill_assets` / `ensure_prompt_assets`)。评审三件套(`REVIEW.md.tmpl` / `references/review.md` / `mr-review`)已入库但**未编进二进制、未派发**——见模块7「没建」。
**数据**:主提示词模板 + references + 技能正本都编进二进制,开工时摊到 `<asset_root>/`;提示词是一次性字符串经 `--append-system-prompt` 送进 CLI,不落盘不缓存。
**依赖**:standard::system_prompt、standard::skills、standard::render、bw_engine::LaunchPlan(`--add-dir`)、codehub issue 正本。
**没建**:`proto-design`(原型阶段默认 workflow)源还没 vendor 进来、未打包;vendor 摊是 dev 期从源码树 runtime 复制(分发态无源码树时降级为不摊,入口仍注入但子技能读不到——bundle 进二进制留后续);references 现四份已派发(指标 / 运作活①评论 / 改仓 / `.bw` 契约)+ 评审一份未派发;② 收口每周进展时也注入 `week-plan-comment`;运营推广/竞品阶段无业界默认(留白)。

### 5 · command-event-与状态机

**是什么**:Workbench MVP 自己的 Command/Event 枚举(界面只发命令、只收事件,内核是唯一执行点)+ 活的生命周期状态机与合法转移表。"完成"永远只能从"评审中"来、且只能由人显式点;回执带"真发生了什么"而不是"命令收到了"。关键取舍是转移表逐字拷自 V3(一条边没加没减),Event 不做事件溯源、fire-and-forget 给 UI。右侧「Issue」上报走 `ReportWorkbenchIssue`:host/path 从当前目录 git 的 origin 现读,对照日志有文件就附上,回执 toast 写「issue上报成功」,不写打开着的被管项目。

**代码**:bw 的 `command.rs`(Command/Event 枚举)+ `model.rs`(`IssueStatus` 七态、`can_transition_to` 唯一事实源)+ `app/mod.rs`(dispatch)+ `app/issue.rs`(run_issue / transition_issue / report_workbench_issue)。
**数据**:本模块不落库;状态机是内存态求值,转移成立后把新状态交给 issue_store(模块1)写远端正本;Event 只活在当次运行里不持久化。
**依赖**:crate::model 领域类型(本 crate 自持);issue_store 是转移落盘唯一出口;bw_engine 执行器 trait(▶跑下游,但状态推进判定在本模块)。
**没建**:V3 那对 Command/Event 枚举不继承不引用。会话屏已接 `ReopenSession` / `DeleteSession` / `CancelRun`;项目群跟名片走同一条改项目约定命令(`EditProjectCard`)。在研版本不走这条命令。

### 6 · 健康推导

**是什么**:把项目本周真实状态(仓里有没有提交、有没有指标读数、上周有没有交付)算成一盏健康灯。它是"健康难造假"铁律的代码保障:灯只能从数据推导、绝不手设,没数据是诚实的灰(不是绿),连着两周没动是真停了的红。关键取舍是密封类型 `DerivedHealth`——构造点 `mint` 是 `pub(super)`,全仓无 `set_signal`,手工把项目点绿在类型上就没有这条路;判定先判红再判绿,且是纯函数(同输入同输出)。

**代码**:bw 的 `derive/`(`derive_project_health` 唯一判色纯函数 + `sealed.rs` 密封件 + `HealthInputs`)+ `app/health.rs`(只读采集 + `recompute_health` 唯一写入者)+ `trend.rs`(走势现算)。
**数据**:本地零库不存灯;结果只在 `local/registry.rs` 项目显示缓存里留两列服务项目墙;判据每次打开现算。
**依赖**:上游模块12的读数流水 + `.bw/metrics.toml` 目标定义;git / isoweek;只消费读数不负责采集。对 V3 任何 crate 零依赖。
**没建**:C 类定时建提醒活没做(总览卡手填今天的数已接)。版本目标从 ops① 评论解析整段(多条从新到旧,认 `## 版本目标` / 旧评 `## 周目标` / `## 本周目标`);没读到就不打勾。点过采集或每日自动采过、流水里有本周或上周的行,灯可以因读数难看变红。

### 7 · 会话与执行

**是什么**:会话屏只剩两个组件——**Orca**、**Open Design**。旧三栏和后来加上的动作条、灌词条都不要:停止 / 开 MR / 推评审 / 删会话在 Orca 里做,或在计划屏拖列;Workbench 也不知道人在 Orca 里点了哪条会话,灌词条对着「当前会话」会骗人。开工入口在**计划屏**(拖进「进行中」或详情 ▶开工),同一条 `run_issue`:开/复用 worktree,没会话才打 Orca `createAgentSession`,有会话只切树。铁律挂启动参数(Cursor 拼进用户话)。Orca create 若回 `Timed out waiting for terminal handle after creation`,渲染进程已经把 tab/agent 拉起来了,当成功,再 `worktree.activate` 让配对网页跟上。**去会话 / Open**只 `worktree.activate`,不 `ensure`(那条是 `--resume` 再开一扇)。先切到会话屏、等嵌页 iframe onload(再短等配对 WS)才 activate——人还在计划屏时切树,配对网页听不见;没配对 URL 仍切树(桌面还能跟)。计划屏 Start / 总览「开始本周」遮罩期间不挂 iframe;撤遮罩挂上后按 Open 同一条再 activate——开工里那次切树嵌页听不见。连点两张只切最后一张。切树成功就算成功,树上已有的 TUI 由 Orca 自己记着。会话屏只是把本机已开的 Orca web / OD 嵌进来给人看。完成仍由人点(计划屏拖进已完成 / 合入)。

**两条通道别混**:本地 pipe 是 Workbench 对 Orca 桌面下命令(开工、接回),同机读 `orca-runtime.json` 的 token,不需要配对。嵌网页是把本机已开的 Orca web 给人看,要带 `#pairing=` 才能看见桌面那份状态;配对码 Orca 不经 pipe 发,人从桌面「给 web 配对」拿完整 URL,贴进本机 `settings.toml`(设置屏可改;开发期 `BW_ORCA_WEB_URL` 可覆盖)。没喂 URL 则这块如实空着,开工不受影响。

**网页跟随是 Orca 内核,不是 Workbench 第二条 RPC。** create 句柄交成功后,带这刀的 Orca 会推配对网页;句柄超时那条路 Orca 不发跟随,Workbench 自己再 `worktree.activate`(`notifyClients`)。官方安装包今天没有跟随这刀,开工和桌面切换仍成立,嵌进去的网页可能停在旧位置,人要点侧栏。Workbench 不绕 URL / postMessage。源码桌面+浏览器已人眼过;Workbench 会话屏 iframe **能亮**已人验。去会话 / Open 先挂嵌页再切树;Start / 「开始本版本」撤遮罩挂上嵌页后再切一次。配对网页能跟上;create 句柄成功那条跟随仍看 Orca 带不带这刀。

**嵌网页走 iframe**(Orca 和 Open Design 同一条路)。新版 Orca SPA boot 调 `crypto.randomUUID()`,只在 Secure Context 有。Workbench 父页是 `http://dioxus.index.html`(dioxus 虚拟主机,非 localhost / 非 https),默认不算 secure,子 iframe 跟着不算 → SPA 一抛、纯白。旧版 Orca 不调这个 API,所以一度能嵌。Windows 主 WebView 用 `with_windows_browser_args` 把该 origin 当 secure 对待(`--unsafely-treat-insecure-origin-as-secure=http://dioxus.index.html`),并关掉 `LocalNetworkAccessChecks`(iframe 嵌 loopback)。不另开顶级 wry 窗、不 `build_as_child`。顶级 `load_url` 仍会把 `http(s)` 扔给系统浏览器,所以嵌页必须是 iframe,不能把主 WebView 导航到 pairing URL。

**新 worktree**:`issue_worktree_path` 只写 `<仓根>/.bw/worktrees/issue-<n>`,分支仍 `bw/issue-<n>`。目录忽略提交(本仓 `.gitignore` 已写;被管仓铺底或开工时补 `.bw/worktrees/`,没有才补,不改人别的 ignore 规则)。**旧平级兄弟不迁、不删**;接回时先看会话记下的路径,没有再看新目录,再没有才看旧兄弟。账本 worktree 这版不动。

**PTY 封存**:`interactive_cli` / `pty_backend` / `terminal_manager` 整包挪到 `bw-engine` 的 `legacy_pty/`,开工路径不再调用。新模块 `orca`(对标 `open_design.rs`)接口一次定住:

- `connect() -> OrcaRuntime` — 读本机 `orca-runtime.json`,token 不落盘
- `ensure_repo` — 纳入、以及打开项目时先 `repo.show`。Orca 已认这个仓就原样返回,不盖「正在让 Orca 认得」遮罩、不再 `repo.add`;没有才 add。同进程内存表只加速连点,不落盘。不跟开工 / 去会话绑在一起。人不去 Orca 里手导 `workspaces/xx`。计划屏 Start 和总览「开始本版本」点下去先立遮罩再切会话,那几秒不挂 Orca iframe(嵌页是原生层,后到的 HTML 遮罩盖不住);撤遮罩挂上后按 Open 同一条等 onload 再 `worktree.activate`
- `refresh_worktrees` — 开工在 `git worktree add` 之后、create 之前:再写一次 `worktreeBasePath`(回写 Orca 已有值;误写成 `.bw/worktrees` 的清掉)。Orca 没有「刷新扫描」RPC;`path:` 走 30s `worktreeScanCache`,刚 add 的树立刻 create 会 `selector_not_found`;只有 payload 带 `worktreeBasePath` 的 `repo.update` 才清这级缓存。不把扫描根改成 Workbench 目录(Orca 会把那当自己的工作区根、新树开空窗、提示词灌不进你看见的那扇)。不 `repo.add`、不用 Orca 的 `worktree.create`(树已在会和 git 打架)
- `reveal_tree` / `activate_worktree` — 去会话和开工成功后跟网页:只 `worktree.activate`(12s)。不 ensure、不 resume
- `create_session(worktree, agent, prompt, system)` — Orca 预设名是 `claude` / `cursor`(`cursor-agent` 是启动二进制,打出去会被 `Unknown agent preset` 拒)。Claude:`agentArgs` 一条单行(`--append-system-prompt '<压成单行的系统提示词>' '<标题+正文>' --dangerously-skip-permissions --disallowedTools 'Bash(gh pr merge)'`,和 PTY 开工同一套旗标),不走句柄回来之后的 `auto-submit`(Windows 上多行 `agentArgs` 打进 shell 每个换行是 Enter,启动变慢并撞 10 秒句柄超时,窗在词不在)。Cursor:没有 `--append-system-prompt`;`agentArgs` 和 Claude 同一套拼法(一条单行、值用 `shell_quote_single`):`--force --trust '<压成单行的系统提示词>'`。Orca cwd 已是这棵树,不另传 `--workspace`。create 前写 cursor-agent 认的 `~/.cursor/projects/<slug>/.workspace-trusted`(Orca 预写的 slug 会留下 `.bw` 的点,对不上仍弹框)。标题+正文走 Orca `prompt` + `auto-submit`。`clientOperationId` 用 Orca 规定形状(13 位毫秒 + `-` + 32 hex,不是 RPC 帧 id),形状不对立刻 `agent_session_operation_invalid` 被拒。Orca 回「等终端句柄超时」:窗已在,先停 5 秒再收 jsonl / 切树,对照日志记下超时与 jsonl 前后。create 成功后只给 Claude 短等 jsonl 收 session id;Cursor 不等;然后切树。对照日志见模块11,不再另写 `%TEMP%/bw-orca.log`
- `web_embed_url(fallback)` — 给会话屏 iframe 的 loopback;先 `BW_ORCA_WEB_URL` 后本机设置。WebView2 部分导航会丢 fragment,把 `#pairing=` 搬成 `?pairing=`(Orca 两边都认,只搬家不 mint code)

**代码**:会话屏 `app-shell/screens/session/mod.rs`(只剩 Orca/OD 两页签);开工在计划屏 → `run_issue` / `run_issue_orca`;路径 `bw-engine/workspace.rs`;Orca 客户端 `bw-engine/orca.rs`;PTY 封存 `bw-engine/legacy_pty/`。
**数据**:issue 正本不变。会话正文不进 Workbench 库。token 不入库。worktree 目录不入库。系统提示词开工时现算、一次性灌进 Orca/OD,不落配置屏、不跟会话屏当前页签走。
**依赖**:本机 Orca(官方包或源码桌面)+ named-pipe;会话屏 iframe 吃本机设置里的 pairing URL(开发期可被 `BW_ORCA_WEB_URL` 覆盖)。`#![forbid(unsafe_code)]` 仍守。
**没建**:不能自己 mint 配对码,人从 Orca 桌面「给 web 配对」拿「Open in browser」贴进设置屏(存本机 `settings.toml`,带 token 不进仓 / Event 原文 / 日志);开发期 `BW_ORCA_WEB_URL` 可覆盖。跟随在带这刀的 Orca 里已兑现、官方包还没有;去会话 / Open 先挂嵌页再切树;Start / 「开始本版本」撤遮罩挂上后再切一次。`DeleteSession` 内核还在,会话屏没有按钮。稿未改。账本路径未改。不做:自己 mint pairing、postMessage、会话 URL、新 crate、Cursor 专模块、`worktree-orca-adapter`、迁旧树、源码版与安装版并行。人不去 Orca 手导仓——纳入 / 打开项目走 `ensure_repo`,不跟开工 / 去会话绑。**请评审**(规范已入库,按钮未接):剧本 `mr-review`、阶段规范 `review`、提示词 `REVIEW.md.tmpl` 和 `05-features/reviewer-agent/` 已在仓里;计划屏/会话屏没有按钮,内核没有评审命令。接到 Orca 上另开一张活。




### 8 · 远端与工具探活

**是什么**:两件互锁的事。一是远端分发层:`Remote` enum 按 provider 把 issue 正本读写、MR 开合、Release、走势时序统一路由到 `gh` 或 `codehub-cli`,调用方只见方法不见 provider 分支。二是开工工具与探活:工具跟人走本机 `settings.toml`,探活分三种机制(候选路径 / 版本命令 / 套接字握手),探不通如实回灰。关键取舍是 MR 合入后复跑 `mr view` 读回 state 真变 `merged` 才算成功(退出码靠不住绝不假 Done);选了 Cursor 探活失败就拒绝开工,不悄悄退回 Claude CLI。运作活开工工具跟构建,不写死 Claude。codehub `issue list --state opened` 在零开着的活时返 null,jq 用 `(. // [])` 收成空列表——不兜的话铺底查幂等键先炸,建不出新活也开不出 MR。绿区建 Release 强制 `--ref`,取 `project view` 的默认分支(空则 `master`,跟开 MR 同口径);`gh` 自己从默认分支打,不传。打/改 `bw:plan:<名>` 之后,codehub 臂用 `codehub-cli api`(`/api/v4/.../milestones`)投影一个同名里程碑并挂上这张 issue——不当正本,失败不回滚标签。GitHub 臂不投。旧 `bw:week:` 不认、不再投影周里程碑。

**代码**:bw-engine 的 `remote.rs`(`Remote` enum 工厂 + issue 存取六法 + MR 三件套)+ `codehub.rs` / `github.rs`(两臂)+ `claude_bin.rs`(候选路径)+ `open_design.rs`(套接字握手);bw 的 `app/tools.rs`(工具注册探活)。
**数据**:issue 正本在 codehub/GitHub;开工工具在本机 `settings.toml`;本地零库——远端读全走 CLI 不留缓存,探活结果只在内存走一圈不落盘。
**依赖**:bw-engine 的 tokio_cmd、OS keyring(codehub-cli token)、本机 `gh` / `codehub-cli` / `agent` / Open Design 进程;自身 `Remote` 依赖两臂。
**没建**:本地读缓存(MVP 不要)。"MR 检查失败"今天还判不出。已合入的 MR 号详情能查(`state=all`);开着没仍走 `open_mr_for_branch`。Cursor 能力清单(空数组);新增 provider 仍需填一条臂;GitHub 里程碑投影。

### 9 · open-design

**是什么**:Open Design(OD)是"本机网页内嵌类"开工工具:不起 CLI、不 spawn agent,开工 = 在会话屏的内嵌标签里用本机已开的 OD 干。本模块覆盖探活、会话屏内嵌标签、产物入仓约定三件。关键取舍是 OD 不进 Executor 体系、只是本机资源发现,探不到返 None 不 panic;内嵌只用 iframe + 一次探活,够不上一个适配模块的体量,所以没单开 adapter 目录。

**代码**:bw-engine 的 `open_design.rs`(`discover_web_url` 探活 + `looks_loopback_http` 只放行 loopback);app-shell 的 `screens/session/mod.rs`(`OpenDesignView` iframe 组件);bw 的 `app/issue.rs`(run_issue 的 open_design 分支不开 CLI)+ `app/tools.rs`(probe)。
**数据**:零持久化;探活结果是一次性 loopback url 挂在 `use_signal` 里不落库不缓存;OD 产物不在 Workbench 库——是 OD 导出后落进 issue worktree 的文件。
**依赖**:只碰本机命名管道/socket + env,不依赖任何远端或 Executor;平台 Windows 命名管道 + macOS/Linux unix socket。
**没建**:壳侧 `open_design` 适配模块未建(实际只有 claude_cli / codegraph / terminal_xterm);OD 导出产物→MR 的约定仍 defer——没加"OD 类活评审前 `design/` 非空"显式前置校验,今天靠"0 提交如实弹回"兜底。**开工口径**:探活拿 loopback 首页,iframe 打开这一页。`start_run` 对 OD `POST /api/runs` 灌 `{prompt, systemPrompt}`(身份+铁律+技能指针),HTTP 2xx 算灌上了;**不解析会话 URL**,`embed_url` 空 = 壳不改 iframe。超时跟探活一样 400ms。探不到 / POST 失败不假装灌进去了(回执不写「已灌」,会话仍开、默认停在 Open Design 标签)。不自动开跑。不 `POST /api/projects`、不深链某一会话、不 `PUT` 用户消息——文档曾写成建项深链,代码几轮之后停在这条,以代码为准。OD 收不了 Workbench 技能文件(自有 162 份 `skillId`),铁律在 systemPrompt 里、OD 的 AI best-effort 读;不进 `InteractiveExecutor`。不 `postMessage`。V3(`v3` 分支)两条路分开:「原型+进度」只嵌 OD 首页、提示词注入未做;看板「▶ 跑」跳工作流终端。Windows WebView2 关 `LocalNetworkAccessChecks`。**仍 defer**:导出怎么落进 issue worktree(`linkedDir` 实测没生效);会话屏是否只留 OD、去掉终端标签。

### 10 · 项目群

**是什么**:适配项目本来就有的一个群(今天只有 WeLink)。Workbench 往群里发一类**固定枚举事件**——本周版本计划 / 新建活纳入本周 / PR 合入 / 发版 / 周报,每件可在总览单项开关。事件挂在 `NotifyEvent` 注册表上(加新事件=加 variant + 动作点调一次统一 dispatch,不散落硬编码字符串,见 ADR-0003)。定计划时拉一段上周群历史当参考。不是发明新的协作面,也不做双向机器人。关键取舍是发送不落库(没有"已发送"账本 / 去重键 / 重试队列,发送即完成),重复触发允许真的重发一条是已接受的知情代价;群号是项目的事(走仓文件+MR)、登录是机器的事(Workbench 不碰不存凭证)。

**代码**:bw 的 `chat/`(`ChatGroup` trait + 工厂 + `welink` / `mock` / `none` 三实现 + `NotifyEvent` 枚举注册表 + `notify_text`)+ `app/chat_notify.rs`(`chat_send` 统一 dispatch / `chat_notify_issue`)+ `repo/project_file.rs`(`[chat]` 段)。触发点:`start_week_planning`(本周版本计划)、`create_issue` 带 `week_of`(新建活纳入本周)、合入路径(PR 合入)、`cut_release`(发版)。
**数据**:配置在 `.bw/project.toml [chat]` 段(正本走总览「项目约定」那张轻量活+MR,和名片四字段同一张);发送不落库;探活与时间戳只写本机设置文件不开表。
**依赖**:`welink-cli`(npm 全局装,用户自己 `auth login`,Workbench 不碰凭证)经 bw_engine::tokio_cmd shell-out;`Box<dyn ChatGroup>` + async_trait。
**没建**:群摘要 defer——welink-cli 天生拉不了群历史(只发不读),`fetch_history` 稳定返 `HistoryUnsupported` 是正常返回值不是错;不做双向机器人、群里点按钮改活状态、一个项目多个群、除 WeLink 外任何一家正式实现(WeLink 实现由同事补,Workbench 侧只留接口)。**周报**(`weekly`)是已注册事件项(枚举 + 配置开关 + dispatch 槽都在),但本轮**无触发、无生成逻辑**——后续单独会话补,接入点已留(见 ADR-0003)。**个人 Windows 弹窗**本轮不建,后续单独会话——通知页签已删,个人提醒改走 OS 弹窗(推送式,不是点进来才看得见的列表),未落地前「有几张等你合入」由项目墙 ⚑ + 项目轨头部徽章撑着。

### 11 · 桌面壳

**是什么**:Workbench MVP 的桌面应用壳(`bw-dev`,Dioxus 0.7 / wry WebView,macOS+Windows)。壳只渲染和转发意图——健康什么颜色、活能不能转到那一列、指标有没有读数,全部由内核算好塞进 ViewModel;壳里没有一行业务判断,命令失败就把原话放进 toast 不假装做成了。关键取舍是终端挂在屏的外面(切面板不卸载,否则字节真丢);PTY 字节流和长命令进度走 broadcast 不走 ViewModel;屏与屏之间只经 `Vm` 共享数据结构(守卫拦着不能互相 import)。

**代码**:app-shell 的 `main.rs`(Root)+ `bridge/`(独立线程持有 App + nav + vm_build/vm_derive/vm_kb/vm_panels 四分文件拼 VM)+ `vm.rs`(全体 ViewModel)+ `theme/` + `chrome/` + `screens/`(八屏各一目录)+ `adapters/`(一能力一目录)。Windows exe 图标走 `app.ico` + `build.rs`(`winres`),编不过只告警。换项目时内核桥第一波并行拉 issue 名单 / 周目标 / 发版 / 健康 / 版本列表 / 当前用户就推 ViewModel 切页;每张活的 MR 号后台回填,不挡第一屏。拖拽改状态写成功只补丁这一张,不重拉名单(ADR 0002)。
**数据**:本地零数据库——本机数据是 TOML/JSONL 落 `data_dir()` 下;codehub/GitHub issue+标签是唯一 issue 正本;壳自己不存任何业务数据,每个数字都是拼 ViewModel 那一刻从内核现算塞进来的。对照日志全仓一份 `bw.log`:`cargo run` 写到启动目录,直接跑 exe 写到项目目录(仓根或安装目录);`BW_LOG` 可改路径。一行是 `[时间] [模块] [文件] [行] [ok|err|warn] 正文`。E2E 标签(`[BW_OPEN]` 等)留在正文里。toast / 命令进出 / Orca RPC 都进这份文件。不写 token / pairing / 提示词正文。
**依赖**:bw(内核 App / Command / Model)、bw_engine(执行器 / 远端)、dioxus 0.7 hard-pin + wry、tokio;对 V3 任何 crate 零依赖;xterm.js 前端资产 `include_str!` 编进二进制不联网拉。
**没建**:Cursor 适配模块;蒸馏按钮、MR 检查列、"等你输入"那种 agent 细粒度状态(要靠 hook 回传还没接);已结束的会话切走再回来回放仍空;Windows 安装包正源在 `.bw/release/pack/`（入口 `pack.cmd` / `e2e/e2e.cmd`，协议 ADR-0005）;删旧壳判据一条都不满足。计划屏「出包」走 `PackRelease`:两行弹窗吃出包 / 验包进度,不打标签;关弹窗后台继续,按钮三个点再点回来;停止再确认,杀进程树并清 `.bw/release/out/{version}` 与临时装目录。验包不过时「详情」列出 JSONL `cases`（哪条、过没过、报错原话）。「发版本」仍只走 `CutRelease`。`BW_CDP_PORT` 有值才开 WebView2 调试口;设置 / 接入深链打 `[BW_VIEW]`。会话左右栏可收,中栏终端跟着撑开。右侧「指南」全局都在,打开是仓里那份产品指南,不是另写的四章。指南下面是「Issue」:填标题后把本机对照日志报到当前目录 git 的 workbench 仓,中间转圈「日志上传中」,成功走底栏 toast「issue上报成功」。

### 12 · 指标采集与读数

**是什么**:把 `.bw/metrics.toml` 里定义的指标真采一遍、读出来。一条判据贯穿全设计:"今天能采到这个数,上周三那天的值现在还能算出来吗"——能就是可回溯(A 类),一个字都不存每次现算;不能就落进只追加的读数流水(B 类)。采集方式只有脚本和手填两种。关键取舍是 `MetricClass` 枚举是整个设计分水岭,脚本窗口由 Workbench 给不是脚本自己决定,失败一律如实绝不写 0(None = 这周没采到,不是 0)。

**代码**:bw 的 `repo/metrics_file.rs`(`MetricClass` / `CollectPlan` / `read`)+ `repo/readings_file.rs`(流水读写)+ `app/collect.rs`(`collect_all` / `collect_one` / `run_script`);app-shell 的 `bridge/mod.rs`(命令/事件对)+ `screens/overview/mod.rs`(采按钮)。业务采集脚本由运作活①跟人写进项目仓,Workbench 不预铺。
**数据**:可回溯(A 类)一个字不存现算;不可回溯(B 类)与手填(C 类)进同一份 `.bw/metrics/readings.jsonl`(键是日历日 `YYYY-MM-DD`,同一天同一指标只留一行,当天再采覆盖)。写在固定账本 worktree,分支 `bw/ledger`、目录是主仓兄弟 `<仓名>-bw-ledger`,不写人的主检出;读的时候主检出(已合入的历史)和账本叠在一起,同一天以账本为准。合进主干跟运作活①走。指标定义 `.bw/metrics.toml`(人手写正本);A 类采集结果本机纯缓存丢了重算。
**依赖**:仓文件解析器读定义;bw_engine::tokio_cmd 起子进程;isoweek 算 ISO 周号;serde_json 解析 stdout;不认识任何远端系统,只会"起进程、传窗口、读 JSON"。
**没建**:C 类定时建提醒活没做。脚本 stdout 必须 UTF-8、A 类必须吐按周 `points` 已写进 `references/metrics.md` 与模板顶部注释。总览业务指标按 `feature` 分页签(空=主要)、按 `leads` 把引领叠到对应滞后的一张图上(空=该页签第一条滞后);图例勾选显隐;周/天可切。只吐当下一个 `value` 的落在窗口最后一周一个孤点,前几周断开,不把整张卡打成没采到。更多 SDLC 指标另窗。本会话第一次打开一个项目会自动采一轮指标和仓统计;B 类另有每日 20:00 自动采(Workbench 开着、今天还没试过才跑,戳在 Workbench 资产目录 `collect-stamp/<slug>`,不进被管仓;失败也盖戳避免 60 秒重打)。**记账键是日历日**,与 V3 `observation` 一天一行对齐,迁过去不亏周内点;折线按周画,一周取最后一天。V3 没有「每条指标自选日/周粒度」——当时全局日采、按日存、面板按 8 周画。C 类在总览卡手填今天的数,和 B 类同一份流水、同一套覆盖。B 类没写 `run` 仍采不到——脚本在被管项目里,Workbench 只负责跑和记账。旧流水只有 `week`、没有 `day` 的行不认。顶栏「刷新」会先把打开着的项目主检出快进到远端(脏的若是读数流水,先挪进账本)。不碰主检出上的名片。人的源码脏文件不动。只重拼界面、不拉仓,会继续看见旧的 `metrics.toml`。

### 13 · 周循环与计划

**是什么**:项目里的"计划屏":中栏版本头/四列看板 + 屏幕居中的活详情弹窗,把"这个版本干什么"和"活的推进状态"装在一个界面里。**计划版本、自建版本、发版号是同一个里程碑名**——三处同一串(`bw:plan:<名>` / 里程碑标题 / Release)。每个里程碑都是一个版本,名字不设限(推荐 `vX.X`)。ISO 周只做节律(周初定版本计划、健康时间窗、周五盘点),不当排期名;标题是周号的旧里程碑不进下拉、覆盖当天也不标「本周」。在研版本看覆盖当天的里程碑(多个取最后创建,总览编辑表单下拉可切,只读行带「· 本周」),不进 `.bw/project.toml`。一张活只属于一个版本。版本列表、发版、看板计数全部现算——没有周计划索引表、没有发版表。关键取舍是发版先建 codehub Release 成功再给活打 `bw:released:<名>` 标签(顺序不能反,否则重复点会重复打标签账对不上);出包是左侧另一颗按钮(ADR-0005),不和发版本绑在一起,发版号就是当前视图那个里程碑名、不能另填;看板拖拽落定那一刻标签就是新的(排期是 issue 数据,不走 MR)。拖拽 / 详情改状态:等 `codehub-cli` 写标签成功再挪卡,中间转圈「issue 状态切换中」;成功只改内存里这一张(`last_gather` 补丁),不重拉本仓更不拉别的项目。写失败停在原列、失败原话进 toast。开工 / 合入 / 建活 / 顶栏刷新仍全量现拉。松手认的是当前子标题那段,不是列头。计划/版本认十条:待办→进行中(开工)/拒绝/阻塞;进行中→阻塞/拒绝/待办;待评审→完成/拒绝;阻塞→进行中(只改标签,不开工)/拒绝。完成只能从待评审来。详情有状态下拉,选项只列十条里从当前状态能走到的(列表用户不拖看板也靠这一份);选了走和拖拽同一条命令——待办→进行中开工、待评审→完成(有开着的 MR 就合入,没有则确认后只关 issue)、拒绝/阻塞写原因、阻塞→进行中只改标签。底栏只留 Start / Open / Complete。拖进「进行中」从待办来=开工(▶跑),确认后切到会话屏;从阻塞来只解除阻塞。详情点 Start / Open / Complete 或改状态下拉后弹窗自动关;Start 确认框建 worktree,业务活可改或补类别(没打的必须选,开工工具按映射走),运作活锁「运作」。垃圾卡作废要人写原因(进 issue 评论),打 `bw:status:cancelled` 并关掉远端 issue(codehub 不能删)。读回先认取消标签,关着的作废卡不是已完成。总览/计划上的运作活点:①②开着的写它的状态,本周已关的写「已完成」(标题或本 ISO 周创建的版本标签都认);③「已完成」仍只看默认分支 HEAD 有没有 `.bw/project.toml`,关过但没合入的旧铺底不冒充完成。「开始本版本」只在本周没有覆盖中的里程碑、且没有开着的运作活①时出现(上周那张还开着也挡住)。有光杆未打版本标签的运作活①就复用,没有再新建。里程碑默认起止是本周周一到周五。

**代码**:bw 的 `app/plan.rs`(用例)+ `app/release_ship.rs`(`PackRelease` 出包→验包)+ `app/ops.rs`(运作活①②标题幂等键与定时)+ `isoweek.rs` + `trend.rs`(近 N 周走势全现算);app-shell 的 `screens/plan/`(mod / kanban / detail / plan_dialogs)。
**数据**:零本地库——codehub/GitHub issue+标签是唯一正本;排期只有一个槽(Workbench 直接改标签):`bw:plan:<版本名>`,一张活只挂一个。codehub 上顺带投影同名里程碑,计划屏仍只认标签。旧 `bw:week:` 忽略,不迁旧标。删除未发布的版本 = 摘 `bw:plan:<名>` + 删同名里程碑;已发的不能删、不能改名。出包 = 仓里 `.bw/release/pack/pack.cmd` 与 `e2e/e2e.cmd`,产物在 `{仓根}/.bw/release/out/{version}/`。发版 = 远端建 Release + 打 `bw:released:<名>`,号锁死当前版本视图。在研版本看远端里程碑覆盖当天,不进仓文件;项目群跟名片四字段同一张轻量活「项目约定」,总览编辑,不写主检出。总览/知识库发版次数优先读远端 Release,读不到再退本机 git 标签。进计划屏默认就是全部 issue。点某个版本只看挂了那个版本的活;没挂版本的只在全部 issue。项目墙「本周 x/y 完成」跟总览五段同一口径,作废不进分母。
**依赖**:issue_store、repo::project_file、git(`pull_ff`)、isoweek、trend、bw_engine::remote(建 Release / 查 MR)、bw_engine::github(`issue_branch` 确定性);节律用产品默认 `fri 09:00`。
**没建**:"预览·未合入"做成灰态(从活 worktree 读未合入的 metrics.toml 与 ops① 评论重渲染周头未接);"蒸馏"灰态(见模块15);给活挂指标的命令没接(建活时"推的指标"列恒空);macOS 页面内拖放还没真机验证过一次。版本目标在总览「版本计划与进展」、计划屏版本头显示 `## 版本目标` **整段**(一句或一段都行,旧的一句话评论不用迁);计划屏默认收成两行,右下角展开框打开整段,再点收起。每周进展同样从该版本运作活①评论现算(`## 每周进展`,周五②收口追加,只追加不改周初那条);没有就空着。总览不另开「发版记录」(历史版本在版本页签)。项目墙卡片仍截短。正本是 ops① 评论,多条从新到旧。纳入清单和读数快照留在评论里,人点开运作活看。范围内的活认 `bw:plan:<版本名>`。剧本要求人先确认本周版本(推荐 `vX.X`),再当场建卡并打 `bw:plan:<名>` + `bw:category:*`,打完还要挂 codehub 同名里程碑(起止默认本周周一到周五);替身路径仍走 `ConfirmWeekDraft`。不再写 `bw:week:*`。挂评前用 `week-planning/check-week-comment.py` 校验标题。计划屏「新建活」可选业务活或运作活①②,都能填正文。业务活打 `bw:category:*`;运作活不打五阶段类别,标题按本周幂等。业务活工具和 workflow 读回时按类别查本机 settings,没有就用产品默认(原型默认 Open Design,workflow 空着等 proto-design 打包);运作活开工工具跟构建,workflow 仍按标题。总览不再放「去计划」(侧栏下一格就是计划)。

### 14 · 资产盘点与项目接入

**是什么**:两件互锁的事。资产盘点(运作活②)每周先对照 `references/bw-assets.md` 盘 Workbench 给项目的 `.bw/`(清残留、升格式让当前工作台读得动、点出未闭环的环),再盘项目本周提交与开着的 MR(建议只落这张活的评论,不改业务代码),再按 `week-plan-comment.md` 给本周在研版本那张运作活①追加一条每周进展(找不到①才写在②上并说一句)。定时建的说明写 `mode: weekly`。开工工具跟构建。项目接入把一个仓弄到本机、落一行项目、把名片写进「项目约定」常驻树(不写主检出)。默认分支已有名片、或开着项目约定/残留旧标题的仓接入时不重开约定。没有单独的「历史回填」命令,也不按 git 周去建假文件。健康灯只看本周。

**代码**:bw 的 `app/project.rs`(接入 / 名片 / 群)+ `git.rs`(`first_commit_date` / `tags_with_dates` / `week_counts_many` 现算);standard/skills 的 `asset-audit`。`project-handbook` 在仓里,盘点不派发。
**数据**:零本地库;名片四字段只落 `.bw/project.toml`;`project` 表只有定位与显示缓存;历史呈现不写仓文件。
**依赖**:crate::git / isoweek / repo::project_file / standard、worktree、issue_store;外部 bw_engine::github / codehub(clone、list/create Release)。

**没建**:`mode: first`(给老 issue 打 `bw:plan:<名>`、补记、问人写 AGENTS.md);`BackfillHistory` 已删。五条历史探测判据只实现前三条(提交数 / 标签 / CHANGELOG),远端已关闭 issue、已合并 MR 两条没对应查询。每周定时已接:节律只认产品默认 `fri 09:00`,Workbench 开着每 60 秒判一次「本周这一刻过了没有」;过了且没有开着的「资产盘点 YYYY-Www」就建一张并开工,最远评审中。错过(当时没开着)下次开着照样补建,不另记触发表。运作活①仍是人触发,总览「开始本版本」看本周有没有覆盖中的里程碑、以及有没有开着的运作活①。运作活没有五阶段类别,详情锁死显示「运作」,内核拒改。旧铺底残留由盘点对照 `bw-assets.md` 在这张活的 worktree 里删,走 MR,不在主检出动手。

### 15 · 技能与蒸馏

**是什么**:Workbench 自带**四份运作剧本**(week-planning / asset-audit / metrics-refresh / project-handbook),编译期 `include_str!` 进二进制,开工前摊到 Workbench 自己的资产目录,提示词只给"名字 + 一句话 + 完整路径",正文让 agent 按需读(渐进加载)。仓里另有一份评审剧本 `mr-review` 和评审提示词(见模块7「没建」):规范已入库,尚未编进二进制、也未派发。**不预建方法论技能**——原来预置的六份「阶段方法论」(原型/构建/优化/运营推广/运维/竞品)默认 workflow 没打包、`skill_slug` 也不识别,一份没被真正派发过,属「预先搞的一堆没用的」,删光:阶段方法论该由业界 workflow(mattpocock / proto-design,见 `standard/vendor`)提供,Workbench 每个环节挑一个最好的默认,要从实践里长出 Workbench 自己的方法论到时候再建。阶段规范约束(references,如指标铁律、改仓规则)归模块4,不和技能混。蒸馏是活的附属动作——把一件做完的活提炼成带做法的技能,永远记着来自哪件活。关键取舍是技能正本编进二进制零 IO、全局一份不随项目复制(不进用户仓),"用过几次"每次现查 issue 列表聚合不落表不缓存(且不显示胜率——没有结算记录,这一列直接不放)。

**代码**:bw 的 `standard/skills.rs`(`SkillPack` + 四份 `include_str!` + `desc_of` + 评论校验脚本 sidecar)+ `app/mod.rs`(`asset_root` / `skills_dir` / `ensure_skill_assets`)+ `app/bootstrap.rs`(`SkillPointer`)+ `app/ops.rs`(`skill_slug` 只映射两个运作剧本);app-shell 的 `bridge/vm_panels.rs`(配置屏 skill_list + workflow_usage 现算)。
**数据**:四份正本编进二进制,开工摊到 `<asset_root>/skills/<slug>/SKILL.md`(全局一份);活挂的 workflow 名在 codehub issue 正本上;"用过几次"每次现查聚合不落表;提示词一次性字符串不落盘。
**依赖**:standard::skills、standard::system_prompt、bw_engine::LaunchPlan(`--add-dir`)、Issue 模型;无数据库无网络。
**没建**:蒸馏——会话屏顶部按钮灰着,命令未接;配置屏「导入」按钮没接——用户自己的技能约定放进被管仓 `.claude/skills/<slug>/SKILL.md`(配置表扫成「项目自有」),不拷进 Workbench 资产目录;`skill_slug` 硬编码映射运作剧本 + mattpocock-skills;`proto-design` 源还没 vendor。活上的 workflow 人话名(如「更新指标与版本计划」)对应剧本目录 `week-planning`,详情可跳配置屏亮那一行。

### 16 · app编排与运行时

**是什么**:Workbench MVP 的编排大脑:界面发一条 Command,`App::dispatch` 是唯一入口,一条 match 派发到各用例模块,守卫也在这一层——状态能不能转、活能不能结第二次,动仓之前先问清楚。它还管 Workbench 自己的本机资产目录(`asset_root`):项目注册表、全局设置、会话记录,全是纯运行时、零正本——仓和 codehub issue 才是正本。关键取舍是回执带"真发生了什么"不是"命令收到了";`ProgressLine` 无人订阅就丢,报不出去绝不让命令失败(报了"clone 好了"而仓不在以仓为准);运行时零正本——删 `asset_root` 重新接入就回来。

**代码**:bw 的 `app/mod.rs`(`App` 七件 + `dispatch` 唯一入口 + `AppError` / `IllegalTransition` + 远端工厂 + `with_progress`)+ `app/progress.rs`(`StepState` / `ProgressLine`)+ `local/`(`registry` projects.toml + `sessions` jsonl + `settings` settings.toml)。
**数据**:编排层自己不落库——`App.terminal` 纯内存(进程死了就没了,会话身份在 `sessions/` jsonl 里才接得回);本机运行时数据全在 `asset_root` 下三个文件(`projects.toml` / `settings.toml` / `sessions/<slug>/<iid>.jsonl`,append-only 取末行为最新);正本是仓和 codehub issue,这里全是缓存与过程数据。
**依赖**:crate::model / command(本 crate 自持)、crate::derive(`DerivedHealth` 密封)、bw_engine(执行器 + PTY + 远端经 `remote_factory` 注入)、repo / standard。
**没建**:各用例模块(issue / plan / ops / collect / health / bootstrap / chat_notify / session / tools / worktree)业务各自成篇,本模块只讲 dispatch 怎么派发;状态机定义(`can_transition_to`)归模块5,这里只讲 dispatch 调到守卫、`IllegalTransition` 怎么回;`issue_store`(模块1)已接线 app 层各用例,`remote_for` 是统一拿远端的口子。

---

## 附 · 这篇没写、但你可能在找的

| 你在找 | 去哪 |
|---|---|
| 某个模块的核心设计 | 本篇 §3(16 模块) |
| 还没干的活 / 某条功能做了没有 | 各模块的「没建什么」段(不另开清单,要做派 subagent) |
| 怎么给 Workbench 开发(怎么建 / 跑 / 测 / 加特性) | [`AGENTS.md`](../AGENTS.md) |
| 主提示词 / reference / skill 各装什么、改流程同步哪份 | 本篇 §3 模块 4 对照表(`AGENTS.md`「三层模型」指到这里) |
| Workbench 给被管项目推的规范模型 | 本篇 §2 |
| 产品命题 | [`README.md`](../README.md) + 本篇 §1 |
| 界面长什么样 | [`docs/hifi/index.html`](hifi/index.html) + [`docs/hifi/README.md`](hifi/README.md) |
| 版本变更 | [`CHANGELOG.md`](../CHANGELOG.md) |
| 领域词 | [`CONTEXT.md`](../CONTEXT.md) |
| 架构决策 | [`docs/02-adr/`](02-adr/) |
| V3 史实 | `v3` 分支(V3 已删,仓里不留历史) |
