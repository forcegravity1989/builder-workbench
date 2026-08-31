# 0002 · 纯导航走快路径:复用上次 gather,不重跑 git/远端/OD 探活

- 状态:已接受(2026-08-27)
- 相关:[`0001`](0001-codehub-issue-正本-本地零库.md)(其「后果」明确把「本地只读缓存、失效策略」留后续)、[`docs/architecture.md`](../architecture.md)(§内核桥:一条独立线程拿 `bw::App`)

## 决策

1. **把一次 `build()` 拆成 `gather()` + `assemble()` 两段**。`gather` 跑所有跟「在看哪一周 / 选中哪张活 / 展开哪个目录」**无关**的贵 I/O:环境探活(`probe_env`)、打开项目的 issue 列表(`app.issues`)、健康三判据(`collect_health_inputs` 的 git 子进程)、Release(`load_releases` 的远端/git)、会话列表、项目墙卡片。`assemble` 只做依赖 `UiState` 视图字段的重切:看板按周过滤、四段计数、运作活状态点、指标读数、会话工作台、知识库扫描——全是纯内存或本机文件读。
2. **纯导航请求走快路径**:`ViewWeek` / `ViewAll` / `SelectIssue` / `FocusSkill` / `OpenDoc` / `DropDrafts` / `SessionTab` / `ToggleDir` / `OpenFile` / `KbTab` 以及后台回发(`KbComputed` / `RepoStatsComputed` / `MetricsCollected` / `ReposListed` / `RepoPicked` / `PrNumbersFilled`)只跑 `assemble`,复用上次的 `gather`,**不起任何 git 子进程、不打远端、不重探 OD**。
3. **数据真变时才重 gather**:`Req::Cmd`(真命令)、`Req::Open`(换项目)、`Req::Refresh`(拉仓)、`Req::FlushOrcaReveal`(内发 `ReopenSession`)、`sched_tick`(可能到点建活)走 `gather + assemble`。`SelectSession` 只记账等嵌页,走快路径。失效策略 = **按事件失效**:只有改了底层 issue/项目/git 状态的请求才刷 `gather`,导航请求一律不刷。
4. **换项目两波采**:第一波并行拉齐切页要用的远端(`issue list` 各项目一起、周目标评论两两并行、发版、环境条)和本机 git,推完 ViewModel 就切页。第二波 `mr list` 后台最多 8 路,按活回填 `pr_number`;已完成直接查已合入。回填走 `PrNumbersFilled`,对不上项目或 gather 世代就丢掉。同进程 `mr_cache` 命中的第一屏就带号。
5. **顺带去掉 `build()` 内的重复**:`probe_env` 原来每重建跑两遍(顶层环境条 + `build_config`),现在 `gather` 里探一次、`assemble` 复用;打开项目的 `app.issues` 原来拉两遍(项目墙循环 + `build_project`),现在 `gather` 里拉一次、项目墙与 `assemble` 共用;`build_ops` 原来跑两遍 `git::path_in_head`(本周 + 看的那周,结果其实一样),现在 `ops3_landed` 在 `gather` 里算一次、传参给 `build_ops`。

## 为什么

- 根因(从代码核对):内核循环末尾 `bridge/mod.rs` 对**除 PTY/终端/节拍外的每个 `Req`** 都 `vm_build::build()`。`build()` 是「全屏一锅端」——不管点的是计划屏切周、还是会话屏展开目录,它把项目墙、总览健康、会话工作台、配置屏技能表、环境条全重算一遍。ADR 0001 自己在「后果」里写明「本地零缓存,每次现算有 IO 成本……优化(本地只读缓存、失效策略)留后续」——这就是那条后续。
- 症状(#16):计划界面操作卡顿。落在计划屏最冤的两下是左栏切周、点「issue总览」——纯视图切换,数据没变,却要等 OD 探活(没开 OD 时命名管道 400ms 超时 ×2 = 最多 800ms)+ 十来个 git 子进程 + 远端取 Release。
- 导航请求不碰 issue/项目/git 状态:它只改 `UiState` 的 `viewing_week` / `view_all` / `selected_issue` / `session_*` / `expanded_dirs` 等视图字段。这些字段只影响 `assemble` 那一段的重切,不影响 `gather` 采的任何数。所以复用 `gather` 不是「用旧数据假装新鲜」,是「数据本就没变」。

## 后果

- 切周 / 点总览 / 选卡片看详情 / 切页签 / 展开目录 这些**纯导航**不再卡;真命令、换项目、刷新仍走第一波 gather(合理,数据真变了)。换项目第一屏可以没有 MR 号,回填后再拼一版。
- `gather` 缓存的是「上一次全量采集的结果」;导航期间若有同事在远端改了 issue / 合了 MR,本机要等下一次真命令或刷新才看到——这与「刷新」按钮的语义一致(刷新就是「去拉新的」),不是回退。
- 会话工作台(`build_workbench`)仍跑 git(`list_dir` / `changed_files` / `ahead_behind` / `file_diff`),但它被一个「会话相关 ui 字段」键缓存住:切周时键不变、直接复用;展开目录 / 切会话时键变、重算。`gather` 刷新时键失效。
- `FlushOrcaReveal` 走全量:它内发 `ReopenSession`。`SelectSession` 只记账等嵌页,走快路径。
- 这条不改四铁律:`gather` 仍是现算(不是把数写进库)、`assemble` 仍是现算的重切;`Derived<Signal>` 密封、settle-once、状态机卫不变——只是「什么时候重算贵的那段」从「每次请求」收紧到「数据真变时」。
