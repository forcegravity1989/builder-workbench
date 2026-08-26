# architecture.md — buddy MVP 设计正本

> **30 秒导读**:这是什么——buddy MVP 的**唯一设计正本**,一篇讲清三个 crate 怎么互锁、buddy 怎么给被管项目赋能、16 个模块各自解决什么问题。**给谁看**——理解 buddy 设计的人和 AI:要判断"某条为什么这么定"、要接手某个模块、要往规范里加东西。**现在还作数吗**——作数,这是当下唯一作数的设计总览(V3 史实已随 V3 删除,见 `v3` 分支)。**怎么和别处衔接**——开发规矩(怎么建/跑/测/加特性)在 `AGENTS.md`,不在本篇;每个模块的核心设计在本篇 §3;还没干的活在各模块「没建什么」段;界面长什么样看 `docs/hifi/index.html`。`DESIGN.md` 指向本篇。看不懂的词查 `CONTEXT.md`。

**写作约定**:正文说人话,实现名字(命令名、函数名、表名)只在必要时作为"代码锚点"出现、不逐文件:行罗列;代号在当篇第一次出现带一句人话说明。

---

## §1 · 三 crate 架构

buddy MVP 由三个 Rust crate 组成,各管一件事、互锁而不互相渗透:

**bw(内核)**:本地零数据库——codehub/GitHub 的 issue+标签是唯一 issue 正本;仓文件解析(读 `.bw/*`)、现算推导(健康/走势/用量)、自己的一对 Command/Event、规范铺底、三张运作活、项目群工厂全在这层。它是纯领域与编排,不直接碰终端、不直接碰远端协议。

**bw-engine(能力底座)**:交互式 `claude` 执行器、伪终端(PTY)内嵌终端、每张活一棵 git worktree 的供给、git 读数、codehub/GitHub 两个远端。它只认裸的通用 id,不活、不持有业务语义——一个 id 背后是"活"还是"会话"由上层说。

**app-shell(壳)**:九个屏(项目墙 / 接入 / 设置 三个顶层 + 总览 / 计划 / 会话 / 通知 / 配置 / 知识库 六个项目内入口)+ 内核桥(独立线程)+ ViewModel + 主题 + 适配模块。壳只渲染和转发意图,没有一行业务判断。

**V4 对 V3 零依赖。** V3 的六个 crate(bw-core / bw-engine / bw-store / bw-app / ui / app-desktop)已于 2026-08-24 删除(见 `v3` 分支)。V4 不是从 V3 迁移来的:底座是拷过来接管后做了三件减法(断掉对 V3 内核的依赖、删只有 V3 用的出口、删两条零调用死链),内核是全新的库与全新的 Command/Event——旧库的二十张表与架在表上的用例整片接不上,改它等于拆了重装还会连累当时还在跑的 V3。名字里的版本号(`bw`、bin 名 `bw-dev`)是共存期的权宜,删旧壳那次一并改回不带版本号的名字。

**一屏一模块,三守卫钉死。** 老 buddy 走不下去的原因之一是单文件动辄上万行、改一处散弹一片。V4 立三条规矩,且靠机制而非自觉:

1. **每屏只有一个公开出口**——屏内随便拆文件,但除这一个函数外不再有第二个能被外部引用;
2. **共享数据只经共用的 ViewModel 模块流转**——两屏都展示同一样东西时类型定义在共用模块里各自引用,**永远不允许一屏直接引用另一屏**;
3. **每个适配模块的 README 固定三段**——借自哪个项目哪个文件、借了什么、没借什么。以后持续借鉴只在该模块内增量,不散弹。

门禁里还有三条纯文本结构守卫(不编译,CI 照跑):屏与屏不互相引用、单文件 1500 行硬上限、用界面框架 hook 的函数必须是组件(后者是评审抓到真 bug 后补的——普通函数在渲染宏里被直接调用时 hook 落在调用方槽位,切屏类型一变整次渲染崩溃,编译期一点征兆都没有)。

---

## §2 · 工作流模型:buddy 怎么给被管项目赋能

### 三来源两路径

buddy 给一个项目赋能走两条路径,信息落点分清:

- **路径 A · 轻量(不走会话)**:规范铺底(运作活③)把 buddy 资产写进项目仓的 `.bw/`,无 agent、无系统提示词。buddy 在活自己的 worktree+MR 里写,人的主分支一个字节不碰。
- **路径 B · 走会话**:挂了 workflow 的活开工,agent 在活的工作区里跑。系统提示词兜底 buddy 统一要求,workflow 自己管流程。

三类产出各有落点:**顶层文档**(README / AGENTS / CLAUDE / CHANGELOG)归 `project-handbook` 这份剧本管——buddy 管该有的集合,问过人才写、从仓真读、走 MR;**dev 过程件**(CONTEXT / adr / spec / ticket)由 workflow 自己产;`.bw/` 永远走路径 A,不进会话。

### 系统提示词(文件 + references + 技能指针)

每张活开工时给 agent 的系统提示词:主提示词是**外置的 `standard/system-prompt/SYSTEM.md.tmpl`**(身份 + 四铁律 + 读项目规范件的指引),`{{...}}` 占位在运行时填——活的信息、本活要读的 references 阶段规范、本活挂的技能。**不论哪个 workflow 都被这层兜住 buddy 统一要求**——要加"所有项目都该遵守的统一要求",改这份 md + 抬 `standard/VERSION`,不加进 workflow 本身,也不硬编码在 Rust `format!` 里。

references(`standard/system-prompt/references/*.md`)是「干某类活需要额外知道的 buddy 规范」(指标铁律、改仓规则),按活的 category/workflow 匹配后摊到 `<asset_root>/system-prompt/references/`、提示词只给路径。技能同理。文件不在硬盘就如实少一段不指,不编路径。这就是渐进加载:提示词放索引,正文让 agent 按需读(单个技能正文均值八千多字符,而注入护栏上限约六千字符,整包塞进提示词根本装不下)。

### 默认 workflow

`issue-policy.toml` 里类别→工具→workflow 的默认映射:构建/优化/运维默认 `mattpocock-skills`、原型类默认 `proto-design`,可换。**默认 workflow 应由 buddy 打包统一管理**(像自带技能一样摊到资产目录、开机即用),不丢给鱼塘/外部自取。现状:**`mattpocock-skills` 已打包**——buddy 写一份入口 SKILL.md(body 是 grill→implement→review SOP,指向 vendor 库子技能路径)作 SkillPack 走 `skill_pointer` 注入,vendor 库整树摊到 `<asset>/vendor/`(dev 期从源码树 runtime 摊,分发态 defer),issue-policy 已回填默认值;`proto-design`(原型)源还没 vendor 进来、未打包。

### 数据流

界面只发 Command、只收 Event;`bw/app` 的 `dispatch` 是唯一执行入口,跑用例 → 写 codehub issue 正本/仓文件 → recompute 现算 → 事件流回 UI。终端字节流不走 ViewModel、也不走事件总线——桥上单开一条 broadcast 通道,内核线程定时往里推(终端一秒几百批字节,每批重拼整份 ViewModel 会把界面拖垮,而且字节是一次性的流,进 ViewModel 每次重渲染都会被重新写进终端一遍)。

### 四铁律(设计不变量)

这四条从 V1 一路到 V4 没变,是设计约束,守它们的代码机制只点一句、不展开实现:

1. **杀进程重开,所有数字能重算、前后一致**——健康 / 走势 / 用量全部现算,`recompute_*` 是唯一写入者。
2. **信号只能从数据推导;没数据就是 Unknown,不是绿**——`Derived<Signal>` 密封类型,store 层根本没有 `set_signal` 方法,手工把项目点绿在类型上就没有这条路。
3. **完成永远由人点;同一件活绝不记两次**——状态机 `can_transition_to` 守卫,Done 的唯一入边是 InReview;定时任务只自动建活、绝不自动完成。
4. **记录只追加、不修改;事后抹不掉**——V4 里这条的落点从库表换成仓文件(`.bw/metrics/readings.jsonl` 只追加)与 codehub issue 评论。

---

## §3 · 16 模块核心设计

> 每个模块的核心设计见本篇 §3;这里只写核心设计:这个模块解决什么问题、怎么设计的、关键取舍。代码落点指到 crate/目录级。

### 1 · codehub-issue-正本

**是什么**:codehub/GitHub 的 issue+标签是唯一 issue 正本,本地零数据库。这个模块是 `Issue` 领域对象与远端 issue+标签的互转层:状态、周排期、发版关联、类别全部以标签表达,两台 buddy 接同一个 codehub 仓读出来的是同一份活态——这就是"共享正本",leader 看 4/7 进展无盲区。关键取舍是放弃本地读缓存(MVP 卡点认了),读全走 CLI。业务活的开工工具和 workflow 不另打标签,读回时用 `bw:category:*` 去查 `.bw/issue-policy.toml`。

**代码**:bw 的 `app/issue_store.rs`(互转主逻辑)、`model.rs`(`Issue`/`IssueId`)、`app/issue.rs`(读写入口)。
**数据**:issue 正本在 codehub/GitHub 的 issue+标签;本地零库,不留读缓存。
**依赖**:上游 `bw-engine/remote.rs`(`Remote` 三变体分发,调 codehub-cli / gh);下游命令层(模块5)经它落盘,壳查询经 `App::issues` 读回。
**没建**:本地读缓存(MVP 不要);"已合入待点完成"与"MR 检查失败"两类待处理今天还判不出——`open_mr_for_branch` 只答 MR 开着没、答不了合没合。

### 2 · 仓文件解析

**是什么**:把项目仓 `.bw/` 下的配置/定义文件解析成内存结构供各屏现读现用。仓是正本——人、agent、第二台机器要看的都住仓里走 MR,本地不存第二份;这一层是读写正本的唯一入口,别处不许自己拼路径读 `.bw/*.toml`。关键取舍是不做 `deny_unknown_fields`(人手写多一个字段就整份崩代价太大),metrics 只认 `schema_version=2`、旧格式整份拒收不迁移。

**代码**:bw 的 `repo/`(共用读写口 + 五个解析器:project / metrics / issue-policy / managed / standard)+ `standard/mod.rs`(章程模板渲染)。
**数据**:不落本地库,仓文件就是正本,解析结果只在内存里现用;写回手写渲染而非 `toml::to_string`,为把注释留给人看。
**依赖**:serde / toml 反序列化、sha2 算指纹;对 V3 任何 crate 零依赖。
**没建**:采集执行落在 `app/collect.rs`(模块12),规范铺底编排见模块3。B/C 读写 `.bw/metrics/readings.jsonl` 已接(只追加,键是日历日,同一天同一指标最后一行为准;展示按周取那一周日期最大的一天)。C 类定时建提醒活没做。

### 3 · 规范铺底

**是什么**:buddy 接入项目时自动建一张运作活③"规范铺底",把二进制里编进的 `standard/` 模板渲染成 `.bw/` 骨架文件,写进这张活自己的 worktree+分支、开 MR 等人合。全程不起 agent(路径 A 轻量),buddy 自己写文件、记指纹、提交,人的主分支一个字节不碰。关键取舍是"完成永远人点"——MR 开着才推评审中,没写出东西原地不动、不留分支不留号;仓根一个字不写(`AGENTS.md` 是项目自己的文件,归资产盘点首次模式问过人才写)。

**代码**:bw 的 `standard/`(模板/版本)+ `standard/bootstrap.rs`(写件/探测)+ `app/bootstrap.rs`(建活→开树→写→提交→推分支→开 MR 编排)+ `repo/managed_file.rs`(指纹对账)。
**数据**:铺进项目仓 `.bw/`;零本地库;仓根一个字不写。
**依赖**:repo::managed_file、git、standard、worktree、issue_store;外部 sha2 / serde。
**没建**:升级流程(对账代码在,但"过期→看差异→建活→提 MR"动作未实现);节律(cadence)目录 / 鱼塘 `pond/` 未建。接入一次铺名片 + `issue-policy.toml`(映射与周五资产盘点节律);指标正文和业务脚本跟运作活①会话走,不预铺空壳,也不再从配置屏二次铺底。

### 4 · 系统提示词与渐进加载

**是什么**:每张活开工渲染一份系统提示词,主提示词是**外置的 `standard/system-prompt/SYSTEM.md.tmpl`**(身份 + 四铁律 + 读项目规范件的指引),`{{...}}` 占位在运行时填:活的信息、本活要读的 references 阶段规范、本活挂的技能。references(`standard/system-prompt/references/*.md`)是「干某类活需要额外知道的 buddy 规范」(指标铁律、改仓规则),按活的 category/workflow 匹配后摊到 `<asset_root>/system-prompt/references/`、提示词只给路径,agent 按需读。技能同理摊到 `<asset_root>/skills/`。关键取舍:**正文一律不塞进提示词**(只给「一句话 + 完整路径」),references/技能文件不在硬盘就如实少一段不编路径,主提示词不硬编码在 `format!` 里(改身份/铁律 = 改 md + 抬 `standard/VERSION`,规范对账测得出落后)。**归一**:技能注入只有**一个模型**——`skill_pointer`(workflow→slug→`SkillPack`→入口 SKILL.md 路径)。运作剧本(week-planning 等)的入口 body 自足;业界 workflow(mattpocock-skills)的入口 body 是 SOP 链 + 指向 `vendor/` 库子技能路径(库由 `ensure_vendor_assets` 摊)。两类同机制,不另开第二条注入路径。

**代码**:bw 的 `app/bootstrap.rs`(`agent_system_prompt` 渲染模板 + `skill_pointer` + `references_for`)+ `standard/system_prompt.rs`(`SYSTEM_PROMPT_TMPL` + references 表)+ `standard/skills.rs`(四份运作剧本 `include_str!`)+ `app/mod.rs`(`ensure_skill_assets` / `ensure_prompt_assets`)。
**数据**:主提示词模板 + references + 技能正本都编进二进制,开工时摊到 `<asset_root>/`;提示词是一次性字符串经 `--append-system-prompt` 送进 CLI,不落盘不缓存。
**依赖**:standard::system_prompt、standard::skills、standard::render、bw_engine::LaunchPlan(`--add-dir`)、codehub issue 正本。
**没建**:`proto-design`(原型阶段默认 workflow)源还没 vendor 进来、未打包;vendor 摊是 dev 期从源码树 runtime 复制(分发态无源码树时降级为不摊,入口仍注入但子技能读不到——bundle 进二进制留后续);references 起手三份(指标铁律 / 运作活①评论格式 / 改仓规则,按实践长);运营推广/竞品阶段无业界默认(留白)。

### 5 · command-event-与状态机

**是什么**:buddy MVP 自己的 Command/Event 枚举(界面只发命令、只收事件,内核是唯一执行点)+ 活的生命周期状态机与合法转移表。"完成"永远只能从"评审中"来、且只能由人显式点;回执带"真发生了什么"而不是"命令收到了"。关键取舍是转移表逐字拷自 V3(一条边没加没减),Event 不做事件溯源、fire-and-forget 给 UI。

**代码**:bw 的 `command.rs`(Command/Event 枚举)+ `model.rs`(`IssueStatus` 七态、`can_transition_to` 唯一事实源)+ `app/mod.rs`(dispatch)+ `app/issue.rs`(run_issue / transition_issue)。
**数据**:本模块不落库;状态机是内存态求值,转移成立后把新状态交给 issue_store(模块1)写远端正本;Event 只活在当次运行里不持久化。
**依赖**:crate::model 领域类型(本 crate 自持);issue_store 是转移落盘唯一出口;bw_engine 执行器 trait(▶跑下游,但状态推进判定在本模块)。
**没建**:V3 那对 Command/Event 枚举不继承不引用。会话屏已接 `ReopenSession` / `DeleteSession` / `CancelRun`;项目群有自己的命令,缺口在对应模块「没建」段。

### 6 · 健康推导

**是什么**:把项目本周真实状态(仓里有没有提交、有没有指标读数、上周有没有交付)算成一盏健康灯。它是"健康难造假"铁律的代码保障:灯只能从数据推导、绝不手设,没数据是诚实的灰(不是绿),连着两周没动是真停了的红。关键取舍是密封类型 `DerivedHealth`——构造点 `mint` 是 `pub(super)`,全仓无 `set_signal`,手工把项目点绿在类型上就没有这条路;判定先判红再判绿,且是纯函数(同输入同输出)。

**代码**:bw 的 `derive/`(`derive_project_health` 唯一判色纯函数 + `sealed.rs` 密封件 + `HealthInputs`)+ `app/health.rs`(只读采集 + `recompute_health` 唯一写入者)+ `trend.rs`(走势现算)。
**数据**:本地零库不存灯;结果只在 `local/registry.rs` 项目显示缓存里留两列服务项目墙;判据每次打开现算。
**依赖**:上游模块12的读数流水 + `.bw/metrics.toml` 目标定义;git / isoweek;只消费读数不负责采集。对 V3 任何 crate 零依赖。
**没建**:C 类定时建提醒活没做(总览卡手填今天的数已接)。周目标一句话从 ops① 评论解析(多条从新到旧,认 `## 周目标` / 旧评 `## 本周目标`);没读到就不打勾。点过采集或每日自动采过、流水里有本周或上周的行,灯可以因读数难看变红。

### 7 · 会话与执行

**是什么**:路径 B 的产品特性——交互式 `claude` 嵌在桌面里,体验对齐本机终端(回显、接着聊、复制粘贴)。▶跑 把 CLI 起在伪终端(PTY)里,活在 issue 自己的 git worktree 里干,人看得见、随时能停。run 成功只推"评审中","完成"永远由人点。会话身份进 sessions jsonl(进程死了靠 `--resume` id 接回),进程态纯内存。字节流走 broadcast,不走 ViewModel。开工找 claude 与探活同一条候选链。`--resume` id 由 SessionStart hook 写到 buddy 资产目录,节拍收进 jsonl。选中会话只有记下了 id 才接回;没有 id 不跑 `claude --continue`。没订户时不抽走有界环,挂件订上后能要回活着的第一屏。复制走网页兜底,粘贴由壳读系统剪贴板。作废一张活不会自动拆本机会话——人在会话屏点「删除会话」、确认弹窗之后,才停 PTY、强制收这棵 worktree、删 jsonl;远端 issue 不动(作废关单是另一条命令)。

**代码**:bw-engine 的 `interactive_cli.rs`(执行器)+ `pty_backend.rs`(平台接缝)+ `terminal_manager.rs`(集中管理);bw 的 `app/session.rs`(生命周期)+ `app/worktree.rs`(每活一棵 worktree)+ `app/issue.rs`(`cleanup_issue_worktree`)。
**数据**:会话身份落 sessions jsonl;进程态纯内存;issue 状态与 `settled_at` 正本是 codehub issue+标签,现读远端 `closed_at` 不自己写。
**依赖**:async_trait + tokio mpsc、conpty-oxide(Win)/ portable-pty + nix(Unix,`#![forbid(unsafe_code)]`);bw-engine 不依赖任何 V3 crate。
**没建**:Cursor 适配(supported=false);蒸馏按钮;agent 四态回报(今天只有"运行中/空闲"两态,"等你输入"不猜);MR 卡"检查过没过"列;已结束的会话切走再回来回放仍空(活着的第一屏已能回放)。作废不自动删会话——要人点「删除会话」。

### 8 · 远端与工具探活

**是什么**:两件互锁的事。一是远端分发层:`Remote` enum 按 provider 把 issue 正本读写、MR 开合、Release、走势时序统一路由到 `gh` 或 `codehub-cli`,调用方只见方法不见 provider 分支。二是开工工具声明与探活:工具声明住项目仓 `.bw/issue-policy.toml`,探活分三种机制(候选路径 / 版本命令 / 套接字握手),探不通如实回灰。关键取舍是 MR 合入后复跑 `mr view` 读回 state 真变 `merged` 才算成功(退出码靠不住绝不假 Done);选了 Cursor 探活失败就拒绝开工,不悄悄退回 Claude CLI。codehub `issue list --state opened` 在零开着的活时返 null,jq 用 `(. // [])` 收成空列表——不兜的话铺底查幂等键先炸,建不出新活也开不出 MR。绿区建 Release 强制 `--ref`,取 `project view` 的默认分支(空则 `master`,跟开 MR 同口径);`gh` 自己从默认分支打,不传。打/改 `bw:week` 之后,codehub 臂用 `codehub-cli api`(`/api/v4/.../milestones`)投影一个同名里程碑并挂上这张 issue——不当正本,失败不回滚标签。GitHub 臂不投。

**代码**:bw-engine 的 `remote.rs`(`Remote` enum 工厂 + issue 存取六法 + MR 三件套)+ `codehub.rs` / `github.rs`(两臂)+ `claude_bin.rs`(候选路径)+ `open_design.rs`(套接字握手);bw 的 `app/tools.rs`(工具注册探活)。
**数据**:issue 正本在 codehub/GitHub;工具声明在 `.bw/issue-policy.toml`;本地零库——远端读全走 CLI 不留缓存,探活结果只在内存走一圈不落盘。
**依赖**:bw-engine 的 tokio_cmd、OS keyring(codehub-cli token)、本机 `gh` / `codehub-cli` / `agent` / Open Design 进程;自身 `Remote` 依赖两臂。
**没建**:本地读缓存(MVP 不要);MR 合没合的查询仍缺(只答开着没);Cursor 能力清单(空数组);新增 provider 仍需填一条臂;GitHub 里程碑投影。

### 9 · open-design

**是什么**:Open Design(OD)是"本机网页内嵌类"开工工具:不起 CLI、不 spawn agent,开工 = 在会话屏的内嵌标签里用本机已开的 OD 干。本模块覆盖探活、会话屏内嵌标签、产物入仓约定三件。关键取舍是 OD 不进 Executor 体系、只是本机资源发现,探不到返 None 不 panic;内嵌只用 iframe + 一次探活,够不上一个适配模块的体量,所以没单开 adapter 目录。

**代码**:bw-engine 的 `open_design.rs`(`discover_web_url` 探活 + `looks_loopback_http` 只放行 loopback);app-shell 的 `screens/session/mod.rs`(`OpenDesignView` iframe 组件);bw 的 `app/issue.rs`(run_issue 的 open_design 分支不开 CLI)+ `app/tools.rs`(probe)。
**数据**:零持久化;探活结果是一次性 loopback url 挂在 `use_signal` 里不落库不缓存;OD 产物不在 buddy 库——是 OD 导出后落进 issue worktree 的文件。
**依赖**:只碰本机命名管道/socket + env,不依赖任何远端或 Executor;平台 Windows 命名管道 + macOS/Linux unix socket。
**没建**:壳侧 `open_design` 适配模块未建(实际只有 claude_cli / codegraph / terminal_xterm);OD 导出产物→MR 的约定仍 defer——没加"OD 类活评审前 `design/` 非空"显式前置校验,今天靠"0 提交如实弹回"兜底。**开工口径**:探活拿 loopback 首页,iframe 打开这一页。`start_run` 对 OD `POST /api/runs` 灌 `{prompt, systemPrompt}`(身份+铁律+技能指针),HTTP 2xx 算灌上了;**不解析会话 URL**,`embed_url` 空 = 壳不改 iframe。超时跟探活一样 400ms。探不到 / POST 失败不假装灌进去了(回执不写「已灌」,会话仍开、默认停在 Open Design 标签)。不自动开跑。不 `POST /api/projects`、不深链某一会话、不 `PUT` 用户消息——文档曾写成建项深链,代码几轮之后停在这条,以代码为准。OD 收不了 buddy 技能文件(自有 162 份 `skillId`),铁律在 systemPrompt 里、OD 的 AI best-effort 读;不进 `InteractiveExecutor`。不 `postMessage`。V3(`v3` 分支)两条路分开:「原型+进度」只嵌 OD 首页、提示词注入未做;看板「▶ 跑」跳工作流终端。Windows WebView2 关 `LocalNetworkAccessChecks`。**仍 defer**:导出怎么落进 issue worktree(`linkedDir` 实测没生效);会话屏是否只留 OD、去掉终端标签。

### 10 · 项目群

**是什么**:适配项目本来就有的一个群(今天只有 WeLink)。buddy 只做两件事:往群里发一条通知(评审中 / 合入 / 发版);定计划时拉一段上周群历史当参考。不是发明新的协作面,也不做双向机器人。关键取舍是发送不落库(没有"已发送"账本 / 去重键 / 重试队列,发送即完成),重复触发允许真的重发一条是已接受的知情代价;群号是项目的事(走仓文件+MR)、登录是机器的事(buddy 不碰不存凭证)。

**代码**:bw 的 `chat/`(`ChatGroup` trait + 工厂 + `welink` / `mock` / `none` 三实现)+ `app/chat_notify.rs`(`chat_send` / `chat_notify_issue`)+ `repo/project_file.rs`(`[chat]` 段)。
**数据**:配置在 `.bw/project.toml [chat]` 段(正本走轻量活+MR);发送不落库;探活与时间戳只写本机设置文件不开表。
**依赖**:`welink-cli`(npm 全局装,用户自己 `auth login`,buddy 不碰凭证)经 bw_engine::tokio_cmd shell-out;`Box<dyn ChatGroup>` + async_trait。
**没建**:群摘要 defer——welink-cli 天生拉不了群历史(只发不读),`fetch_history` 稳定返 `HistoryUnsupported` 是正常返回值不是错;不做双向机器人、群里点按钮改活状态、一个项目多个群、除 WeLink 外任何一家正式实现(WeLink 实现由同事补,buddy 侧只留接口)。

### 11 · 桌面壳

**是什么**:buddy MVP 的桌面应用壳(`bw-dev`,Dioxus 0.7 / wry WebView,macOS+Windows)。壳只渲染和转发意图——健康什么颜色、活能不能转到那一列、指标有没有读数,全部由内核算好塞进 ViewModel;壳里没有一行业务判断,命令失败就把原话放进 toast 不假装做成了。关键取舍是终端挂在屏的外面(切面板不卸载,否则字节真丢);PTY 字节流和长命令进度走 broadcast 不走 ViewModel;屏与屏之间只经 `Vm` 共享数据结构(守卫拦着不能互相 import)。

**代码**:app-shell 的 `main.rs`(Root)+ `bridge/`(独立线程持有 App + nav + vm_build/vm_derive/vm_kb/vm_panels 四分文件拼 VM)+ `vm.rs`(全体 ViewModel)+ `theme/` + `chrome/` + `screens/`(九屏各一目录)+ `adapters/`(一能力一目录)。
**数据**:本地零数据库——本机数据是 TOML/JSONL 落 `data_dir()` 下;codehub/GitHub issue+标签是唯一 issue 正本;壳自己不存任何业务数据,每个数字都是拼 ViewModel 那一刻从内核现算塞进来的。
**依赖**:bw(内核 App / Command / Model)、bw_engine(执行器 / 远端)、dioxus 0.7 hard-pin + wry、tokio;对 V3 任何 crate 零依赖;xterm.js 前端资产 `include_str!` 编进二进制不联网拉。
**没建**:Cursor 适配模块;蒸馏按钮、MR 检查列、"等你输入"那种 agent 细粒度状态(要靠 hook 回传还没接);已结束的会话切走再回来回放仍空;Windows 安装包不在本仓;删旧壳判据一条都不满足。会话左右栏可收,中栏终端跟着撑开。右侧「指南」全局都在,打开是仓里那份产品指南,不是另写的四章。

### 12 · 指标采集与读数

**是什么**:把 `.bw/metrics.toml` 里定义的指标真采一遍、读出来。一条判据贯穿全设计:"今天能采到这个数,上周三那天的值现在还能算出来吗"——能就是可回溯(A 类),一个字都不存每次现算;不能就落进只追加的读数流水(B 类)。采集方式只有脚本和手填两种。关键取舍是 `MetricClass` 枚举是整个设计分水岭,脚本窗口由 buddy 给不是脚本自己决定,失败一律如实绝不写 0(None = 这周没采到,不是 0)。

**代码**:bw 的 `repo/metrics_file.rs`(`MetricClass` / `CollectPlan` / `read`)+ `repo/readings_file.rs`(流水读写)+ `app/collect.rs`(`collect_all` / `collect_one` / `run_script`);app-shell 的 `bridge/mod.rs`(命令/事件对)+ `screens/overview/mod.rs`(采按钮)。业务采集脚本由运作活①跟人写进项目仓,buddy 不预铺。
**数据**:可回溯(A 类)一个字不存现算;不可回溯(B 类)与手填(C 类)追加进 `.bw/metrics/readings.jsonl`(只追加,键是日历日 `YYYY-MM-DD`,同一天同一指标最后一行为准);展示按周时取那一周日期最大的一天。指标定义 `.bw/metrics.toml`(人手写正本);A 类采集结果本机纯缓存丢了重算。
**依赖**:仓文件解析器读定义;bw_engine::tokio_cmd 起子进程;isoweek 算 ISO 周号;serde_json 解析 stdout;不认识任何远端系统,只会"起进程、传窗口、读 JSON"。
**没建**:C 类定时建提醒活没做。脚本 stdout 必须 UTF-8、A 类必须吐按周 `points` 已写进 `references/metrics.md` 与模板顶部注释。北极星/滞后/引领每张卡固定一块折线,卡顶一行现值 + 相对上周(序列里最后两个已知数;不够就「—」);多条引领同一行并排。只吐当下一个 `value` 的落在窗口最后一周一个孤点,前几周断开,不把整张卡打成没采到。本会话第一次打开一个项目会自动采一轮指标和仓统计;B 类另有每日 09:00 自动采(buddy 开着、今天还没试过才跑,戳在 buddy 资产目录 `collect-stamp/<slug>`,不进被管仓;失败也盖戳避免 60 秒重打)。**记账键是日历日**,与 V3 `observation` 一天一行对齐,迁过去不亏周内点;折线按周画,一周取最后一天。V3 没有「每条指标自选日/周粒度」——当时全局日采、按日存、面板按 8 周画。C 类在总览卡手填今天的数。B 类没写 `run` 仍采不到——脚本在被管项目里,buddy 只负责跑和记账。旧流水只有 `week`、没有 `day` 的行不认。

### 13 · 周循环与计划

**是什么**:项目里的"计划屏":左栏窄周列表 + 中栏周头/六列看板 + 右侧活详情抽屉,把"这周干什么"和"活的推进状态"装在一个界面里。周用 ISO 周文本(`2026-W34`,周一为起点)表示,按机器本地时区判定"现在哪一周"。周列表、发版、看板计数全部现算——没有周计划索引表、没有发版表。关键取舍是发版先建 codehub Release 成功再给活打 `bw:released` 标签(顺序不能反,否则重复点会重复打标签账对不上),版本号按版本号幂等;看板拖拽落定那一刻标签就是新的(排期是 issue 数据,不走 MR)。拖进「进行中」= 开工(▶跑),确认后切到会话屏;卡片和详情上的「▶ 开工」是同一条命令。垃圾卡作废要人写原因(进 issue 评论),打 `bw:status:cancelled` 并关掉远端 issue(codehub 不能删)。读回先认取消标签,关着的作废卡不是已完成。总览/计划上的运作活点:①②开着的写它的状态,本周已关的写「已完成」(标签或标题里的周号都认);③「已完成」仍只看默认分支 HEAD 有没有 `.bw/standard.toml`,关过但没合入的旧铺底不冒充完成。

**代码**:bw 的 `app/plan.rs`(用例)+ `app/ops.rs`(运作活①②标题幂等键与定时)+ `isoweek.rs` + `trend.rs`(近 N 周走势全现算);app-shell 的 `screens/plan/`(mod / kanban / detail)。
**数据**:零本地库——codehub/GitHub issue+标签是唯一正本;排期 = 给 issue 打 `bw:week:YYYY-Www` 标签(buddy 直接改);codehub 上顺带投影同名里程碑,计划屏仍只认标签;发版 = 远端建 Release + 打 `bw:released:vX` 标签按版本号幂等;发版弹窗默认号 = 在研号自增一位,人可改。总览/知识库发版次数优先读远端 Release,读不到再退本机 git 标签。点某一周只看打了那一周标签的活;没打周标签的只在「全部」。项目墙「本周 x/y 完成」跟总览五段同一口径,作废不进分母。
**依赖**:issue_store、repo::project_file、git(`pull_ff`)、isoweek、trend、bw_engine::remote(建 Release / 查 MR)、bw_engine::github(`issue_branch` 确定性);节律规则读 `.bw/issue-policy.toml`。
**没建**:"预览·未合入"做成灰态(从活 worktree 读未合入的 metrics.toml 与 ops① 评论重渲染周头未接);"蒸馏"灰态(见模块15);给活挂指标的命令没接(建活时"推的指标"列恒空);切在研版本要不要建活走 MR 张力未消解留给人拍;macOS 页面内拖放还没真机验证过一次。周目标在总览「本周计划进度」、计划屏周头、项目墙卡片各显示**一句话**;正本是 ops① 评论 `## 周目标`,多条从新到旧。纳入清单和读数快照留在评论里,人点开运作活看。范围内的活认 `bw:week` 标签。剧本要求人确认后当场建卡并打 `bw:week` + `bw:category:*`;替身路径仍走 `ConfirmWeekDraft`。挂评前用 `week-planning/check-week-comment.py` 校验标题。计划屏「新建活」可选业务活或运作活①②,都能填正文。业务活打 `bw:category:*`;运作活不打五阶段类别,标题按本周幂等。工具和 workflow 读回时查 issue-policy,不另打标签(原型默认 Open Design,workflow 空着等 proto-design 打包)。总览不再放「去计划」(侧栏下一格就是计划)。

### 14 · 资产盘点与项目接入

**是什么**:两件互锁的事。资产盘点(运作活②)一个包两种模式——每周模式盘这周变化、首次模式给老仓已有 issue 挂上周标签(需要周目标再补一张运作活①,评论写明补记);项目接入把一个仓弄到本机、落一行项目、把名片四字段与群配置写进仓文件(不落库)。没有单独的「历史回填」命令,也不按 git 周去建假文件。历史要出现在计划屏某一周,就是给那些 issue 打 `bw:week:YYYY-Www`。补记不假装当时写过,健康灯只看本周。

**代码**:bw 的 `app/project.rs`(接入 / 名片 / 群)+ `git.rs`(`first_commit_date` / `tags_with_dates` / `week_counts_many` 现算);standard/skills 的 `asset-audit` + `project-handbook` 两份剧本。
**数据**:零本地库;名片四字段落 `.bw/PROJECT.md` + `.bw/project.toml`;`project` 表只有定位与显示缓存;历史呈现不写仓文件。
**依赖**:crate::git / isoweek / repo::project_file / standard、worktree、issue_store;外部 bw_engine::github / codehub(clone、list/create Release)。
**没建**:首次模式打标签+补记靠 agent 会话,没有 buddy 先算证据文件那一层;`BackfillHistory` 已删;五条历史探测判据只实现前三条(提交数 / 标签 / CHANGELOG),远端已关闭 issue、已合并 MR 两条没对应查询;project-handbook 写 `AGENTS.md` 只记遗留、不接首次会话。每周模式定时已接:读 `.bw/issue-policy.toml` 的 `ops2_schedule`(模板默认 `fri 20:00`),buddy 开着每 60 秒判一次「本周这一刻过了没有」;过了且没有开着的「资产盘点 YYYY-Www」就建一张并开工,最远评审中。错过(当时没开着)下次开着照样补建,不另记触发表。运作活没有五阶段类别,详情锁死显示「运作」,内核拒改。

### 15 · 技能与蒸馏

**是什么**:buddy 自带**四份运作剧本**(week-planning / asset-audit / metrics-refresh / project-handbook),编译期 `include_str!` 进二进制,开工前摊到 buddy 自己的资产目录,提示词只给"名字 + 一句话 + 完整路径",正文让 agent 按需读(渐进加载)。**不预建方法论技能**——原来预置的六份「阶段方法论」(原型/构建/优化/运营推广/运维/竞品)默认 workflow 没打包、`skill_slug` 也不识别,一份没被真正派发过,属「预先搞的一堆没用的」,删光:阶段方法论该由业界 workflow(mattpocock / proto-design,见 `standard/vendor`)提供,buddy 每个环节挑一个最好的默认,要从实践里长出 buddy 自己的方法论到时候再建。阶段规范约束(references,如指标铁律、改仓规则)归模块4,不和技能混。蒸馏是活的附属动作——把一件做完的活提炼成带做法的技能,永远记着来自哪件活。关键取舍是技能正本编进二进制零 IO、全局一份不随项目复制(不进用户仓),"用过几次"每次现查 issue 列表聚合不落表不缓存(且不显示胜率——没有结算记录,这一列直接不放)。

**代码**:bw 的 `standard/skills.rs`(`SkillPack` + 四份 `include_str!` + `desc_of`)+ `app/mod.rs`(`asset_root` / `skills_dir` / `ensure_skill_assets`)+ `app/bootstrap.rs`(`SkillPointer`)+ `app/ops.rs`(`skill_slug` 只映射两个运作剧本);app-shell 的 `bridge/vm_panels.rs`(配置屏 skill_list + workflow_usage 现算)。
**数据**:四份正本编进二进制,开工摊到 `<asset_root>/skills/<slug>/SKILL.md`(全局一份);活挂的 workflow 名在 codehub issue 正本上;"用过几次"每次现查聚合不落表;提示词一次性字符串不落盘。
**依赖**:standard::skills、standard::system_prompt、bw_engine::LaunchPlan(`--add-dir`)、Issue 模型;无数据库无网络。
**没建**:蒸馏——会话屏顶部按钮灰着,命令未接;配置屏「导入」按钮没接——用户自己的技能约定放进被管仓 `.claude/skills/<slug>/SKILL.md`(配置表扫成「项目自有」),不拷进 buddy 资产目录;`skill_slug` 硬编码映射运作剧本 + mattpocock-skills;`proto-design` 源还没 vendor。活上的 workflow 人话名(如「更新指标与周计划」)对应剧本目录 `week-planning`,详情可跳配置屏亮那一行。

### 16 · app编排与运行时

**是什么**:buddy MVP 的编排大脑:界面发一条 Command,`App::dispatch` 是唯一入口,一条 match 派发到各用例模块,守卫也在这一层——状态能不能转、活能不能结第二次,动仓之前先问清楚。它还管 buddy 自己的本机资产目录(`asset_root`):项目注册表、全局设置、会话记录,全是纯运行时、零正本——仓和 codehub issue 才是正本。关键取舍是回执带"真发生了什么"不是"命令收到了";`ProgressLine` 无人订阅就丢,报不出去绝不让命令失败(报了"clone 好了"而仓不在以仓为准);运行时零正本——删 `asset_root` 重新接入就回来。

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
| 怎么给 buddy 开发(怎么建 / 跑 / 测 / 加特性) | [`AGENTS.md`](../AGENTS.md) |
| buddy 给被管项目推的规范模型 | 本篇 §2 |
| 产品命题 | [`README.md`](../README.md) + 本篇 §1 |
| 界面长什么样 | [`docs/hifi/index.html`](hifi/index.html) + [`docs/hifi/README.md`](hifi/README.md) |
| 版本变更 | [`CHANGELOG.md`](../CHANGELOG.md) |
| 领域词 | [`CONTEXT.md`](../CONTEXT.md) |
| 架构决策 | [`docs/adr/`](adr/) |
| V3 史实 | `v3` 分支(V3 已删,仓里不留历史) |
