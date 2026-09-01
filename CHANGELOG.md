# CHANGELOG.md

版本变更记录。决策动机进 [`docs/adr/`](docs/adr/),不写这里。Workbench MVP 起记(2026-08-24);MVP 之前的 V1/V2/V3 史实在 git 历史与 `v3` 分支,不补抄。

本文件按**六站 + 底座**收口,不再按每次窗口一条流水往下堆。最近一次改动永远写在最上面。

## 最近 · 2026-09-01

post-sync 代码评审收口 4 处:5.10 版本账回正(5.10 实为运作活①周计划抬档、`0d586ce`;评审三件套落进已有 5.10、未编进二进制,不再记「5.9→5.10」);架构模块4「走同一条注入链」改述为「设计走、尚未编进/派发」(与模块7「请评审」口径一致);`orca.rs` 补回 `cursor_agent_cannot_ensure_claude_can` 丢的 `#[test]`(死函数转活,绿测现在真跑它);CHANGELOG 第 29 行「buddy 目录」→「Workbench 目录」(代码早已是 Workbench)。

## 最近 · 2026-08-31

**Builder 设计系统落仓**:Claude Design 项目「builder」的设计系统转成仓内规范资产 `docs/design-system/`(唯一样式表 + 机读 theme.json + 双语 spec + 14 张纯 HTML 示例页 + 参考照片),画布机器件(_ds_bundle.js/support.js/Canvas.dc.html/缩略图/manifest/oxlint 配置)全部剥离,templates/ 留在设计项目。readme→spec 改名避大小写撞名;README 记来源、剥离清单与双向演进剧本(DesignSync 拉回 / /design-sync 回推)。未接线到壳,hifi 仍是九屏视觉正本。

Cursor 开工 `agentArgs` 改回和 Claude 同一套:一条单行、值用 `shell_quote_single`(`--force --trust '<系统提示词>'`)。不再为 cmd 另拼双引号 / `--workspace`。create 前仍写 cursor-agent 认的 `.workspace-trusted`。标题+正文仍走 auto-submit。

计划屏拖拽 / 详情改状态:写远端成功后只改内存里这一张卡,不再全量拉 issue 名单。等待时中间转圈「issue 状态切换中」。写失败卡停在原列。开工 / 合入 / 建活 / 刷新仍全量重采。

运作活开工工具读被管仓 `.bw/issue-policy.toml` 的运维行(`category = "ops"`),不再写死 `claude_cli`。workflow 仍按标题推断,不打五阶段类别。配置 Cursor 要改运维那一行。

计划屏 Start / 总览「开始本周」撤遮罩挂上嵌页后,按 Open 同一条等 iframe onload(再短等配对)再 `worktree.activate`。遮罩期间不挂 iframe,开工里那次切树嵌页听不见。

点项目墙进项目:第一屏不再等每张活串行查 MR。名单、周目标、发版、健康、环境条并行拉齐就切页;MR 号后台最多 8 路回填。已完成的活直接查已合入,不再先打一遍 opened。

打开 / 接入项目先问 Orca `repo.show`。仓已在就不盖「正在让 Orca 认得这个仓」遮罩、不再 `repo.add`。`orca_repos_ready` 只是同进程连点加速,不落盘。Orca 没开仍不挡进项目。总览「开始本周」/ 计划屏 Start:点下去先立遮罩再切会话,busy 期间不挂 Orca iframe(嵌页是原生层,后到的 HTML 遮罩盖不住)。遮罩跟开工命令结束就撤,不等后面 gather;「开始本周」仍比 Start 多一段建运作活①。

## 最近 · 2026-08-29

Claude 开工把系统提示词压成单行 `--append-system-prompt`,标题+正文改成同一条启动命令的位置参数,不再靠句柄回来之后的 `auto-submit`。同一条命令补上 `--dangerously-skip-permissions` 和 `--disallowedTools 'Bash(gh pr merge)'`(原先只在 PTY `LaunchPlan` 里,Orca 漏了)。句柄超时后先停 5 秒再收 session id / 切树,对照日志打 `handle_timeout: wait` / `settle done`、`yolo=` 和 jsonl 前后有没有落下。Cursor 仍把 system 拼进 Orca `prompt`。

开工对照日志(stderr + `%TEMP%/bw-orca.log`,`BW_ORCA_LOG` 可改路径):是否跳过 create、句柄超时还是 ok、prompt/system/agentArgs 字数与换行数。不写 token / pairing / 提示词正文。两台机器各开一张活,把这份文件对一下就能看出差在哪一刀。

开工那几秒盖遮罩挡住嵌页。被管仓只在纳入和打开项目时 `repo.add` 进 Orca(这个进程里登过不再打),不跟开工 / 去会话绑。人不去 Orca 里手导 `workspaces/xx`。Orca 没开不推翻接入。

开工刚 `git worktree add` 完、create 之前再写一次 `worktreeBasePath`(回写已有值,误写成 `.bw/worktrees` 的清掉),刷掉 Orca 30s 扫描缓存。不刷会 `selector_not_found`。不把扫描根改成 Workbench 目录,否则 Orca 把新树当自己的工作区、开空窗、提示词灌不进你看见的那扇。不是再 `repo.add`。

计划屏 Open / 去会话先切到会话屏、等 Orca iframe onload(再短等配对)才 `worktree.activate`;没配对 URL 仍切树。连点只跟最后一张。不 ensure、不按当前全局工具 create。

创建版本:开始/结束必填(红星)。开始晚于结束日期框飘红、不能点创建。空日期不再传给 codehub(先前会回 `Failed to create milestone`)。

计划/版本收成一件事:周版本就是每周一按 ISO 周号固定出现的那个版本,人起名的版本是同一槽位,一张活只挂一个。先前文档写成「周与自定义版本互斥两套」,壳在版本视图里新建活会把本周和当前版本两套标签都打上,详情先显示本周再跳回。创建路径只写当前正在看的那个版本;内核两个都传来时丢掉周、只留版本。

待评审→完成:没有开着的 MR 时弹确认,确认后只关 issue(人可能已经在网页合过)。详情链接查出已合入的 MR,不再只认开着的。

计划屏周目标默认收成两行,右下角展开框打开整段,再点收起。

计划屏周计划/版本看板拖拽认十条:待办→进行中/拒绝/阻塞,进行中→阻塞/拒绝/待办,待评审→完成/拒绝,阻塞→进行中/拒绝。松手认当前子标题。详情加状态下拉,只列从当前状态能走到的那几条,和拖拽走同一条命令——列表用户不拖也能改。作废/阻塞仍要写原因。待办拖到「完成」仍不让过。

Open / 去会话只 `worktree.activate`,不再 `ensureAgentSession`(那条是 `--resume` 再开一扇 TUI)。`createAgentSession` 若回「Timed out waiting for terminal handle after creation」,渲染进程已经把窗拉起来了,当成功,再切树让配对网页跟上。▶开工已有会话也只切树。

会话屏嵌 Orca 走 iframe(和 Open Design 同路):新版 Orca SPA boot 调 `crypto.randomUUID()` 要 Secure Context,Windows 主 WebView 用 `with_windows_browser_args` 把 `http://dioxus.index.html` 当 secure + 关 `LocalNetworkAccessChecks`。开工走本地 pipe;`createAgentSession` 的 `clientOperationId` 用 Orca 规定形状(13 位毫秒-32 hex,误填 RPC 帧 id 会被 `agent_session_operation_invalid` 拒),Cursor 预设名是 `cursor`(不是 `cursor-agent`)。去会话先认会话记下的树(`resolve_issue_worktree`),不 `provision` 第二棵;只 `worktree.activate`,不 ensure。`#pairing=` 搬成 `?pairing=`(只搬家不 mint code);Orca 网页地址存本机 `settings.toml`(带 token 不进仓/Event/日志,`BW_ORCA_WEB_URL` 可覆盖);create/ensure 失败把 error code 露进 `IssueRan.summary` 与 stderr(不带 token)。修 `request_id` debug 下 `u64` 溢出→`wrapping_mul`;会话屏去掉 1600px 上限。

计划屏详情:点 Start / Open / 阻塞 / Cancel / Complete 后弹窗自动关。待评审 / 已完成 / 已取消也有 Open(去会话,不改状态)。业务活显示已有类别(不再误锁成「运作」),计划和负责人同一行。Start 建 worktree 时可改/补类别,没选不能开工。删除自定义版本走真命令 `DeletePlanVersion`:摘 `bw:plan:<name>` + 删同名里程碑,不碰 `bw:week`(周格式标题拒收);弹窗不再用 `ScheduleIssue { week_of: None }` 清周排期。

通知模块整改(#18):群通知从自由字符串重做成固定枚举事件注册表 `NotifyEvent`(本周版本计划 / 新建活纳入本周 / PR 合入 / 发版 / 周报)。`review`(进评审)移除。删通知页签整片(`screens/notify/`、`Panel::Notify`、`BW_PANEL=notify` 深链等全清)。决策见 `docs/adr/0003-通知模块整改-事件注册表与删页签.md`(原误编成 ADR-0002;导航快路径仍是 ADR-0002,别混)。

门禁收口:补三个冒烟示例(`merge_smoke` / `submit_smoke` / `real_demo_v4`)漏掉的 `CreateIssue.plan` 字段(#23 后漏,`cargo test` 编不过),`onboard_smoke` 去掉一个无用 `mut`;`plan.rs::looks_like_week` 的 `as_bytes().len()` 改 `len()`;`list_view.rs` 去掉被 `Cancelled` 盖住后不可达的 `_ => "dash"`。fmt / clippy / test(除 app-shell)/ 其余 guard 全绿。**仍红一项**:`guard-file-lines`——`bw-engine/codehub.rs` 1580 行(本分支加 42 行;`origin/master` 已 1538 超 1500),拆分留后续单独会话,不在本次收口 scope。

## 最近 · 2026-08-28

会话屏改嵌 Orca(仍在 `pierce/orca-session`)。人改口:会话屏只留 Orca / Open Design 两个组件,动作条和灌词条不要(开工在计划屏拖进进行中;停止/MR/评审/删会话不在这屏;buddy 不知 Orca 里当前哪条会话)。pipe 开工与 iframe 配对是两件事。先用安装版 Orca 验,web 地址用进程环境 `BW_ORCA_WEB_URL`,不建设置页。同一张活再开工接回上一场(从本机 Claude jsonl 收 session id,不编)。启动时设 `BW_ORCA_WEB_URL` 会话屏就能接到网页地址(不再先要求 pipe 连上)。

计划屏操作卡顿(#16):纯导航(切周 / 点总览 / 选卡片看详情 / 切页签 / 展开目录 / 后台采回发)走快路径,复用上次 gather、不重跑 git 子进程 / 远端 / OD 探活;真命令、换项目、刷新、`SelectSession` 仍走全量。`build()` 拆成 `gather`(贵、数据变更时跑)+ `assemble`(便宜、每次跑)。顺带去掉三处重复:`probe_env` 每重建跑两遍 → 探一次;打开项目 `app.issues` 拉两遍 → 拉一次;`build_ops` 的 `git::path_in_head` 跑两遍 → 算一次传参。决策见 [`docs/adr/0002`](docs/adr/0002-导航快路径-gather缓存.md),是 [ADR 0001](docs/adr/0001-codehub-issue-正本-本地零库.md)「优化(本地只读缓存、失效策略)留后续」那条的落地。

## 最近 · 2026-08-28(#23 源码同步)

**新增/优化** · 按 `docs/hifi/plan-23.html`(定稿高保真)把计划页整改落到源码,跨 bw + bw-engine + app-shell 三 crate。看板七列合并为四列(待办/进行中/待处理/已完成),两段列加子标题 tab(默认显示第一段,点切第二段);卡面重做(编号 + CodeHub 徽 + 标题 + 正文预览 + 计划位置 + 责任人头像 + 更新时间),删卡面开工按钮(入口移详情弹窗);详情从右侧抽屉改屏幕居中弹窗,字段精简(留标题/正文/链接/类别/计划/负责人,删 状态/工具/workflow/种类/来源/版本/指标/结清/分支/蒸馏);新增列表视图(预设 开放/分配我的/我的 + 计划/阶段下拉 + 搜索 + 行操作 schedule/Start/Open/Complete/Cancel);弹窗:新建issue(含负责人)、创建版本、排期(拖未排期→已排期)、Start(只读确认即 RunIssue)。左栏删除,改为右上角下拉视图切换(全部issue/各周/各版本)。

**新概念落内核**:`Issue` 加 `assignee`/`author`/`plan_version` 字段;`RemoteIssue` 透传 assignee/author;新命令 `SetIssueAssignee`/`CreatePlanVersion`/`ScheduleToPlan`/`EditIssue`;`build_board` 七列改四合并列;`CardItemVm` 加 assignee/author/plan_version/updated_at,`ProjectVm` 加 `plan_versions`/`current_user`/`viewing_plan`。

## 最近 · 2026-08-28

**优化** · 计划页独立高保真(`docs/hifi/plan-23.html`)视觉规范对齐 Builder design system(Claude 板)与 ADE 资源视觉调性。配色 token 全量切到 Builder Claude ramp(ivory `#faf9f5` 底 + 赭土 `#d97757` accent + slate `#4c73a5` 次声 + 暖色 status 三元组),衬线标题改系统无衬线栈(weight 600)、`--font-mono` 留给编号/计数。按设计原则整改结构:卡片重阴影改 hairline、看板列走 surface 底且不再嵌套卡片、卡片左色条装饰改 `.status-dot` 语义(todo/progress/review/done/blocked)、方角 chip 改 999px pill(`.tag` + 语义变体)、列表行对齐 `.list-row`(mono 编号左 + meta 右)、弹窗对齐 `.dialog` floating elevation、`:focus-visible` accent 描边、hover 走 ink tint。unicode 字符导航(✓▢⚑☰⚙)换 Lucide SVG(stroke 2,16px),加 `icon()` 帮助器与静态 `data-icon` 注水。JS 数据/状态机/事件逻辑原样保留,仅重写模板与样式块。涉及文件:`docs/hifi/plan-23.html`。

## 最近 · 2026-08-27

出包代码入库:本地 `D:\2026\buddy-setup` 的 `BuildersWorkbench-MVP.iss` + `AFTER-INSTALL-MVP.txt` 落到仓 `packaging/`,成为出包正源。脚本只吃「clone + cargo + 装过 buddy」必然有的东西,不依赖任何仓外暂存目录:装完说明、安装器图标(`crates/app-shell/app.ico`)走相对路径直接取;`bw-dev.exe` 从 `target\release\` 取(cargo 产物);`WebView2Loader.dll` 出包人先拷到 `target\release\`(cargo 落在带 hash 的 build 子目录,不稳);`codehub-cli` 默认从 `%USERPROFILE%\bin\codehub-cli.exe` 取(装 buddy 就有),可用 `BW_CODEHUB_CLI_SRC` 覆盖,没有则告警跳过、不阻断;`OutputDir=output` 落 `packaging\output\`(gitignore)。顺带修出包图标 bug:装完没图标是因 payload 的 `bw-dev.exe` 的 `.rsrc` 段没嵌 RT_ICON。根因在 `crates/app-shell/build.rs`:winres 把图标编进静态库 `libresource.a` 靠 `cargo:rustc-link-lib` 拉,但 GNU 链接器只从静态库拉能解析未定义符号的成员,资源对象没导出符号 → 整个被跳过,图标进不了 exe(只剩 mingw crt 自带的 manifest)。修法:GNU 下 build.rs 编完用 `cargo:rustc-link-arg` 把 `resource.o` 直接喂给链接器(对象文件一定被收入),图标真嵌进去;MSVC 走 rc 不受影响。重编验证 exe 的 `.rsrc` 含 RT_ICON/GROUP_ICON/version/manifest。`AGENTS.md` 顶层目录导览补 `packaging/`、`怎么建/怎么跑` 补出包命令,按可见物规矩记上。顺手修 `crates/bw/src/app/plan.rs` 两处存量 clippy(collapsible-if + cloned-ref-to-slice,master 上 week-plan 引入、挡着 workspace 门禁),让 `cargo clippy --workspace` 回绿。

运作活①剧本:指标要单独对人讲清北极星/滞后/引领再落文件;定计划先问已有 issue 纳入哪些;打完周标签还要挂 codehub 同名里程碑;业务指标不要重复总览已经在画的仓统计。周目标取评论整段展示(旧的一句话不用迁)。待办池里默认就是 Todo 的卡拖进「待办」现在会排期(先前状态相同被当成没动作)。移回待办池摘掉周标签,不再留下空的 `bw:week:`(空后缀过滤抽到 remote,codehub/github/mock 共用)。

## 最近 · 2026-08-27

**独立评审(规范入库,按钮未接)**:评审剧本 `mr-review`、阶段规范 `review`、评审主提示词 `REVIEW.md.tmpl` 和产物链 `changes/reviewer-agent/` 收进仓(落进已有 5.10,未编进二进制)。GitHub 仓的自动触发放 CI 层(`.github/workflows/claude-code-review.yml`,配好 secret 才生效)。工作台里的「请评审」按钮和独立评审会话**还没接到 Orca 会话屏**;CodeHub 仓要评 MR,等这条接到 Orca 之后。合入仍由人点。

## 2026-08-26

产品命名统一为 Builders' Workbench / Workbench / BW，工程标识保留 bw；废弃 buddy、loop-buddy。README 改产品门面；仓外起手 skill 改名为 `workbench-start`。

## 最近 · 2026-08-26

首次运作活①:`.bw/metrics.toml` 从零起草。北极星本轮**留空**(人要的是「被纳入项目是否又快又好」,MVP 阶段无用户效果数据、手填也无思路,诚实灰,不为点亮硬凑)。一条滞后「纳入管理项目数」(C 类手填)+ 一条引领「每周闭环 issue 数」(A 类,脚本 `.bw/scripts/codehub-closed-issues.py` 真采到=3)。代码仓指标(提交数 / MR 合入数)workbench 平台自记,不重复定义。判定与理由见 `docs/metrics.md`。

规范铺底 v5.9:buddy 自己的 `.bw/project.toml` 镜像 `standard_version` 漏停在 5.0(接入只在新建项目赋一次值,之后铺底从不 bump),而 standard.toml 已到 5.9、两者违约;这次把镜像同步到 5.9。3 个核心件仍 HumanEdited(载项目专属内容),managed.toml 如实记历史不 bump。根因(铺底代码不 bump 镜像字段)另开活修。

Windows 上 `bw-dev.exe` 嵌 `app.ico`(任务栏 / 资源管理器)。编不过只告警,不影响功能和 CI。

编辑项目名片开了 MR 却停在待办池:状态机不许待办池直接进评审中,漏了先跳进行中(规范铺底那条路)。合入仍走看板「评审中→已完成」,不给待办池另开合入口。

合入后「拉到最新」被主检出上未提交的 `.bw/project.toml` 挡住:接入会把名片先写在主检出上。拉之前把这两份预览让开(读数仍挪进账本),再快进;人的源码脏文件不动。

产品指南按 MVP 用户找信息重写:去掉「走过一遍 / 穿刺仓号」过程话,首页和末页加查找表;总览补「编辑项目名片」与顶栏刷新;盘点节律改回周五 09:00;「先记着的缺口」收成「规矩与查找」。

总览名片一次编完:四字段 + 在研版本 + 项目群,一张轻量活「编辑项目名片」+ 一次 MR。配置屏不再改这两项,只留探活和对账。正本仍是 `PROJECT.md` + `project.toml`。

旧格式指标:内核仍拒收 v1、不上屏。运作活① skill 重定指标,借鉴旧脚本、把已有读数迁进新流水、删 V3 废弃件。资产盘点 skill 顺手清 `.bw/` 里 V3 残留(connectors / docs/buddy / .bw/plan 等),走这张活的 MR。

B/C 读数同一天只留一行(再采覆盖);写到固定账本 worktree `bw/ledger`,不脏主检出。顶栏「刷新」先快进打开着的项目再重采——只重拼界面拉不到同事已合入的 `metrics.toml`。

定时默认:B 类日采 20:00;资产盘点周五 09:00;运作活①仍是人点「开始本周」(本周没有这张活/没有周目标才出按钮)。

计划屏左栏「全部」改成「issue总览」，字重和周行同一套，不再像标题。

OD unix socket 探活：`map` 改 `inspect`（设超时不改值）。本机 Windows clippy 编不到这段，CI ubuntu + rustc 1.98 会红。

CI `cargo test --workspace` 补 `--exclude app-shell`，与同文件 clippy 一致：这台 ubuntu 不编壳。本地门禁仍是 `--workspace`。

打 bundle 前的深度 review 收口(五路并行审查:bw 内核 / bw-engine / app-shell / 文档一致性 / 门禁+CI+standard)。基线 CI 全绿,逐条核验后修:

- **铁律**:`github::merge_pr` 补读回 PR state==MERGED 才算成功,与 codehub 臂同构(退出码靠不住,绝不假 Done)。
- **真 bug**:群通知 MR 号恒 0(`issue_from_remote` 的 `pr_number` 是 lossy 字段)。`chat_notify_issue` 加 `known_mr` 参:合入路径传合完的号(MR 已关、现查不到),评审/手动同步传 0 内部现查分支上开着的 MR。
- **mock 注入口**:`merge_and_settle` 改走 `remote_for`(统一工厂),不再直连 `Remote::for_project`。
- **铁律②**:健康推导 `week_counts_many` 失败时 `git_readable` 也落下(原:读不出却判红,该是灰)。
- **自狗食**:Workbench 自己的 `.bw/standard.toml` 抬到 5.8、enabled 收敛到模板默认三类(去掉没模板的 agents/defaults-core/cadence)、补铺 `.bw/issue-policy.toml`、`managed.toml` 加指纹。
- **门禁**:`guard-screen-hooks.sh` 第 34 行自赋值 no-op 改成真清 `#[component]` 标记(兑现注释承诺);`guard-kernel-ui-free.sh` 禁词正则吃 dioxus 全家桶(顶层+子 crate);新增 `guard-codegraph-clean.sh` 挡 codegraph.db 进 feature commit,接进 AGENTS 门禁与 CI。
- **文档对齐**:references「起手两份」改三份(指标铁律/运作活①评论/改仓规则);产品指南与填写规范「观测」改「读数」(V3 残留);`bw/Cargo.toml` 描述去掉「四张表的本机库」;`issue_store.rs` 模块注释「不接线 app 层」改「读写唯一入口」;`standard/README` skills 行补「+workflow 入口」;README「门禁与 CI 完全一致」改实话(app-shell 壳编译/Clippy 因 ubuntu 缺 WebKit/GTK 只本地跑);CI `cargo test` 加 `--workspace --exclude app-shell`(ubuntu 不编壳)。

留口(打 bundle 不冒险,记此后续):
- `push_and_open_mr` / `recent_weeks` 两处仍直连 `Remote::for_project`(mock 注入口,latent——mock 项目无远端,不炸;接 mock 远端测试时再收)。
- `Command::CreateIssue` 的 `origin` 字段签而不收(`origin_for(kind)` 是唯一事实源)——agent 拆出的活显示成「人建」,接上要动 `issue_store::create` + 三调用点,行为变更留待下次。
- `guard-no-cross-screen-import.sh` 只兜 `crate::screens::` 绝对路径,`super::` 相对跨屏靠评审兜底(已加注释)。
- 设置屏工作区输入框:内核规范化路径导致 value≠draft 的边角不同步,次要,改 use_effect 有渲染 panic 风险,留。

## 最近 · 2026-08-25

B/C 读数流水改日历日键,对齐 V3 一天一行,迁过去不亏周内点。每天 09:00 再采一轮(Workbench 开着)。折线仍画四周,一周取最后一天。总览手填卡能记下今天的数。旧流水只有 `week` 没有 `day` 的行不认。仓外起手 `workbench-start` 进仓。本文件按六站收口。OD 开工口径改回跟代码:`POST /api/runs` 灌提示词,不写建项深链。

## 第 0 站 · 接入与规范铺底

- 接入两步:选仓 → 名片。自动建运作活③「规范铺底」,写进自己的 worktree+MR,人的主分支一个字不碰。
- codehub 开着的 issue 为零时 `issue list` 返 null,jq 用 `(. // [])`,否则铺底查幂等键先炸。
- 铺底清单对齐现行五类;仓根 `AGENTS.md` 不预写。合入并完成接上一步一句进度。
- 接入一次铺 `.bw/issue-policy.toml`(开工映射 + 周五盘点节律)。指标空壳和业务脚本不预铺,跟运作活①走。配置屏不再二次铺底。
- 指南第 0 站写成实况:人点完成才合入。

## 第 1 站 · 总览、指标、健康

- 进项目自动采一轮指标和仓统计。北极星 / 滞后 / 引领每张卡固定折线,现值 + 相对上周。
- A 类不存、现算;B/C 进 `.bw/metrics/readings.jsonl`。按日历日存、按日采,展示按周取最后一天。
- C 类总览卡手填今天的数,同一天再记覆盖读回。
- 健康灯只从数据推:周目标从 ops① 评论读,没读到不打勾。
- 本周运作活①做过(含已完成)不再假催「开始本周」。总览不再放「去计划」。
- 项目墙「本周 x/y」与总览五段同口径,作废不进分母。
- 总览 / 知识库发版次数优先读远端 Release。

## 第 2–3 站 · 周计划与看板

- 周目标一句话从 ops① 评论读;挂评先过 `week-planning/check-week-comment.py`。人确认后当场建卡并打本周标签。
- 点某一周只看 `bw:week` 标签;没排周的只在「issue总览」。没有历史回填命令。
- 新建活可选业务活或运作活①②,都能填正文。运作活类别锁「运作」,内核拒改五阶段。
- 拖进进行中 = 开工。卡片和详情都能 ▶开工。没类别的业务活开工会说清楚。
- 作废写原因、打取消标签并关单。读回先认取消,不当完成。
- 周标签在 codehub 上投影同名里程碑,正本仍是标签。GitHub 不投。
- 发版弹窗默认在研号下一位,人可改。切在研号走总览名片编辑。

## 第 4 站 · 会话与干活

- Windows 开工找到 claude;粘贴走系统剪贴板。没 `--resume` id 不自动 `--continue`。
- 开始本周后第一屏不丢;SessionStart hook 收下会话 id。
- 会话能删:停 PTY、收 worktree、删 jsonl;远端 issue 不动。
- 左右栏可收,按钮加大;中栏终端跟着撑。
- 原型走 Open Design:嵌本机首页,`POST /api/runs` 灌系统提示词,不自动开跑。灌失败不假装。开工事件带 `tool` / `embed_url`(OD 这条 `embed_url` 空,壳不改 iframe)。
- 构建默认 workflow `mattpocock-skills` 开机即用;入口把 `/xxx` 写成去读那份文件。
- 右侧「指南」全局都在,打开就是仓里那份产品指南。

## 第 5 站 · 发版

- 先建远端 Release 再打发版标签。绿区强制 `--ref` 默认分支;旗标跟上现行 CLI(`--tag-name` / `--name` / `--description`)。
- 次数读远端 Release,读不到再退本机 git 标签。

## 第 6 站 · 资产盘点

- 周五到点自动建运作活②并开工,最远评审中。错过下次开着补建。
- `project-handbook` 只记遗留,不接首次会话。

## 底座 · 三 crate、规范、仓规

- V3 六 crate 与编译资产已删,全量在 `v3` 分支。crate 去版本号:`bw` / `bw-engine` / bin `bw-dev`。
- `docs/architecture.md` 唯一设计正本。系统提示词外置 + 四份运作剧本。默认 workflow 打包进二进制。
- 驾驭面:人走站和验收;窗口 AI 改代码与文档。仓外起手 `.claude/skills/workbench-start`。
- 知识库代码图在 Windows 上认 `codegraph.cmd`;这个仓没有图时当场 `init`。
- 对外宣讲按穿刺实况收口:正本在仓和代码平台、B 类读数随 MR 上仓、盘点到点建活绝不自动完成。
