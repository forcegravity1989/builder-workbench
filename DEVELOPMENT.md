# Builders' Workbench — 开发指南

> **30 秒导读**:本文是给开发者(人或 AI)的日常操作手册:工作区布局、常用命令、headless 例子清单、验证方式——**这几样以本文为正本,别处只指过来**。产品是什么见 `plan/07`;**现在在做什么**见 `docs/README.md`「现在的节奏」(当前:一心 V4,设计正本 `docs/v4-prototype/design.md`);给 AI 的工作纪律(含写作纪律)见 `CLAUDE.md`;术语见 `CONTEXT.md`。**现在作数**(2026-08-25 门禁收口与 V4 口径刷新)。

## 工作区布局

```
crates/
  bw-core/      领域内核:StageKind(五阶段,每阶段自带角色/方法论/DoD/交棒文案/
                反模式等静态元数据)+ MaturityPeriod(时期)+ Issue 状态机与合法
                转移表 + 度量派生链类型 + 技能规范机检 + 自带技能包正本
                (include_str! docs/skills、docs/buddy)。零 IO 零 UI,必须 wasm32 可编译。
  bw-engine/    InteractiveExecutor trait:InteractiveCliExecutor(交互式 `claude`,内嵌
                终端走 pty_backend.rs:Windows conpty-oxide / macOS·Linux portable-pty)+
                MockInteractiveExecutor(无工作区时的自标注替身)+ workspace.rs(项目仓 /
                issue worktree 供给)+ evidence.rs(从工作区采集 git/docs/测试真实状态,
                回流成观测)+ github/codehub/metrics_file/connectors_file(gh/codehub CLI
                与 .bw/*.toml)。2026-07 的 `claude -p` 按阶段循环旧引擎已于 2026-08-18 删除。
  bw-store/     SQLite(sqlx):schema.sql + add_column_if_missing 迁移守卫;
                交棒/观测等只追加表;store 不做业务判断(哑存储)
  bw-app/       编排大脑:App + Command/Event 总线,所有用例与守卫都在这层;
                hook_listener(claude hook 回报)、调度器 tick、PTY 字节抽干
  ui/           纯函数 selector + ViewModel(state → 可渲染 DTO)
  app-desktop/  真壳(Dioxus 0.7,hard-pin =0.7.9):kernel 桥(独立 tokio 线程)+ 各屏
                (wall/create/op/各 Hub)+ 深链 + BW_FLOW 进程内点击脚本

  ── 以下三个是 V4 的,和上面的 V3 链条并存;V4 对 V3 的 crate 零依赖 ──
  bw-v4/        V4 内核:四张表的本机库(project/issue/claude_conversation/app_meta)+
                仓文件解析(.bw/PROJECT.md、.bw/*.toml、.bw/plan/周文件、.bw/releases.md)+
                现算推导(健康灯、指标读数、周列表)+ 自己的一对命令/事件 + 标准件铺设
                + 三张运作活(周计划 / 资产盘点 / 规范铺底)与内嵌终端的 PTY 生命周期。
                领域类型自持(状态机、信号、五类别从 bw-core 拷来接管,不再依赖它)。
  v4-engine/    V4 能力底座:交互式 claude 执行器 + PTY 后端 + worktree 供给 + git 读数
                + GitHub/codehub 远端。2026-08-21 从 bw-engine 拷来接管(不是复用——
                bw-engine 依赖 bw-core,会把 V3 顺着传递进来),id 一律裸 UUID。
  app-shell/    V4 新壳(Dioxus 0.7):九屏(项目墙/总览/计划/会话/通知/配置/知识库/
                落地/设置)+ theme(视觉沿用 V3)+ bridge(独立 tokio 线程跑 bw-v4)
                + adapters/(一个外部能力一个目录,各带一份 README:claude_cli /
                terminal_xterm / chat_group)。
                二进制名 `bw-v4-dev`,和老壳 `builders-workbench` 各跑各的。

  standard/     规范件正本(和 crates/ docs/ 平级),include_str! 编进二进制。改它就是
                改产品行为。06-defaults/ops/ 下是三张运作 workflow 的 SKILL.md 正本,
                铺底时被复制进项目仓 .claude/skills/。
```

`default-members` 只含无头内核 + ui,故日常 `cargo check` **不编译 Dioxus**;桌面壳需显式 `-p app-desktop`。Web 版是「以后也许」——架构靠 wasm32 keepalive 与 `Store` trait 留着门,仓里没有 app-web crate。

## 常用命令

```bash
# V4(当前主线;库文件 workbench-v4.db):
cargo check -p bw-v4              # 日常最快的编译检查(V4 内核,不编 Dioxus)
cargo run -p app-shell            # 启动 V4 新壳(二进制名 bw-v4-dev)
./scripts/bundle-desktop.sh v4    # 打成 dist/BW-V4.app(macOS;Windows 包见 LEFTOVERS)
cargo run -p bw-v4 --example real_demo_v4 -- <db> <workspaces-root>   # V4 指挥器:不开界面跑完主环

# V3(旧壳,并存等删、不再投入;库文件 workbench.db):
cargo check -p bw-app             # V3 内核+应用的编译检查
cargo run -p app-desktop          # 启动 V3 桌面应用(BW_DB=path 可覆盖数据库位置)

# 提交前门禁(每个 commit 前全过):
./scripts/gate.sh
```

**门禁清单的正本是 [`scripts/gate.sh`](scripts/gate.sh) 这份脚本本身**,别处不再复述命令。要点两句:①CI 是它的子集——CI 那台 Linux 没有 WebKit/GTK,两个桌面壳在那边链接不过,所以壳的编译、以及新壳 app-shell 的 clippy 只在本机跑(V3 旧壳不 lint:等删的代码不返工);②三个结构守卫(屏与屏不互相引用、单文件行数上限、用 Dioxus hook 的函数必须是组件)是纯文本检查,CI 里照跑。

**环境变量**:`BW_DB`(数据库路径;默认 macOS `~/Library/Application Support/BuildersWorkbench/workbench.db`)· `BW_OPEN=<项目名>` + `BW_PANEL=progress|workflow|routine|artifact|version|issues`(启动深链到指定项目/面板,stderr 打 `[BW_OPEN]` 即渲染证明)· `BW_HUB=skill|agent|workflow|cron|connector|knowledge|activity|notify|settings` / `BW_SEL=skill|agent|workflow|cron|connector:<uuid>`(深链到 Hub / 组件详情)· `BW_WORKSPACES`(工作区根)· `BW_CLAUDE_BIN`(覆盖 `claude` 二进制路径)· `BW_FLOW=<command-file>`(进程内点击/断言脚本,验收流用)。

**V4 新壳的环境变量**(自成一套,别和上面那套混用):`BW_DB`(默认 `~/Library/Application Support/BuildersWorkbench/workbench-v4.db`)· `BW_OPEN=<项目 slug 或名字>` + `BW_PANEL=overview|plan|session|notify|config|kb` · `BW_VIEW=onboard|settings`(直接开落地页/设置页)· `BW_WORKSPACES` · `BW_PTY_DEBUG=1`(内嵌终端把初始化结果与键盘字节打进 stderr)· `BW_KB_DUMP=1`(把知识库三个页签的数字打进 stderr:每组几个文件、代码图头一名是谁多大、资产五个区块各几条,好拿 `ls` / `codegraph files -j` / `cat .bw/releases.md` 当场对)。启动时 stderr 打两行:`[BW_OPEN] …`(深链解析结果)与 `[BW_BOOT] projects=N db=…`(界面已渲染的证明);项目群走假群时每发一条打一行 `[BW_CHAT_SENT] …`。

## headless 例子(不开界面直接驱动内核;每个都有现役用途)

| 例子 | 干什么 | 跑法 |
|---|---|---|
| `real_demo` | **唯一指挥器**:两个演示项目各走一圈产品主环——每阶段建活 → 指派阶段角色 → ▶跑(mock 交互执行器,项目无真实工作区)→ 代人点「完成」→ 蒸馏成技能 → 交棒到下一阶段;产出 evidence JSON。不碰 claude、不碰网关;同库重跑幂等 | `cargo run -p bw-app --example real_demo -- <db> <workspaces-root> [--only <slug>]` |
| `seed_fixture` | 给 e2e 种子库(`e2e/fixtures/demo.db`)补三张 fixture Issue | 见 `e2e/fixtures/README.md` |
| `verify_migration` | 打开一份**存量**库验证 schema 迁移不崩(只开不删) | `cargo run -p bw-app --example verify_migration -- <db>` |
| `verify_stage_catalog` | 技能五角色静态归类表自证(条数/重名/五阶段计数) | `cargo run -p bw-app --example verify_stage_catalog` |
| `audit_skills` | 按 `plan/16` 技能规范巡检整库(`--fix` 只做台账允许的修补) | `cargo run -p bw-app --example audit_skills -- <db> [--fix]` |
| `import_skill_library` / `import_skill_package` / `import_ecc_agents` | 灌库:从目录/单包/ECC 仓导入技能与队友(**应用内无导入界面,这是唯一路径**) | 各文件头有用法 |
| `sync_metrics_files` / `render_metrics` | 把各项目 `.bw/metrics.toml` 同步进库 / 把库里指标渲染成一页 HTML(配 `docs/skills/metrics-render`) | 各文件头有用法 |
| `build_aihot_fixture` | 从真实日常库再生 `examples/aihot/bw-aihot.db` 样板间 | 见 `examples/README.md` |
| `real_demo_v4`(bw-v4) | **V4 指挥器**:建项目 → 铺标准件 → 起周计划(建运作活①并开工)→ 建活 → ▶跑(mock 交互执行器)→ 代人点完成 → 发版 → 定时那一跳(自动建运作活②并开工)→ 现算健康灯;产出 evidence JSON。不碰 claude、不碰网关;同库重跑幂等 | `cargo run -p bw-v4 --example real_demo_v4 -- <db> <workspaces-root> [--project <slug>]` |
| V4 各模块 smoke(bw-v4) | 一个模块一个不开界面的读回脚本:接入铺底、指标采集(定义摊开 + 真采 + 每条标复算命令)、提交开 MR、合入结清、系统提示词、走势、设置。都不碰 claude、不碰网关 | `cargo run -p bw-v4 --example <onboard\|metrics\|submit\|merge\|prompt\|trend\|settings>_smoke`(各文件头有用法) |
| `pty_smoke`(v4-engine 与 bw-engine 各一份) | 走 ▶跑/▶开工 同一条 PTY 路径起 `bash -c 'echo pty-ok'` 读回;`-- --teardown` 验证丢输入端后进程组被连坐;`-- --abort` 验证中止丢弃任务后子进程照样被收尾、不留孤儿 | `cargo run -p v4-engine --example pty_smoke [-- --teardown\|--abort]`(V3 侧把 `-p v4-engine` 换成 `-p bw-engine`) |

2026-08-17 前 `crates/bw-app/examples/` 有 41 个例子,29 个是历史批次的一次性验证脚本(「已发货 commit 的收据」),已删,git 历史可找回。

## 共享代码图谱

仓库内的 `.codegraph/codegraph.db` 是给全体成员共用的代码关系快照。先安装
`scripts/codegraph-version` 指定的 CodeGraph 版本;理解跨文件调用链或影响面时,
优先运行 `codegraph explore`、`callers`、`callees`、`impact`,不要先把大量源码整份
读进上下文。改代码后运行 `codegraph sync`,让本地查询保持最新。

功能分支不要提交数据库:PR 上的 `CodeGraph / verify shared graph` 会独立增量更新并
检查图谱和 SQLite 完整性;合入 `main` 且常规 `CI` 通过后,
`CodeGraph / publish shared graph` 由 GitHub Actions 串行刷新数据库并提交。这样只有
机器人写共享的二进制快照,并行 PR 不会围绕数据库产生合并冲突。需要本地复核同一套
门禁时运行:

```bash
./scripts/verify-codegraph.sh
```

## 怎么验证

**行为正确性靠端到端验证,不靠测试基线**(2026-07-17 起的纪律;验证哲学与「什么算真」见 `CLAUDE.md`「核心纪律」,操作细节以本节为正本)。三句话:

1. 任何「已完成/数字是 X」的说法,必须能用 `sqlite3` 从数据库独立查出来核对,或直接打开仓文件对照(「读回」);
2. 深链启动(`BW_OPEN=<项目名> BW_PANEL=<面板>`)后 stderr 出现 `[BW_OPEN]` / `[BW_BOOT]` 日志,就是「界面真的渲染了」的证明;
3. 产品的不可违反约束(完成永远由人点、信号绝不手设等)钉在类型和守卫里,编译过就守住了,配合 `/code-review` 与 E2E 抽查。

**用 computer-use 摸桌面应用(2026-07-30 踩出来的坑,别重踩)**:`~/Applications/BWDev.app` 是长期稳定的验证壳,任何 worktree 跑一次 `./scripts/point-bwdev-here.sh v3|v4`(编译 + 把对应壳的最新二进制拷进这个 app)即可接上——computer-use 认的「已安装应用」名单里,同一次会话现造的新 app 认不出来,必须提前存在。**截图真实可用,点击与键盘永久受阻**(两种打包方式都测过,是 Dioxus/wry 这层更深的窗口限制,不是权限问题)。所以验证手段是:用深链环境变量**直接在终端调用** `Contents/MacOS/bwdev-launcher`(不要用 `open -a`,环境变量传不进去)把目标视图摆到位,再让 computer-use 截图。另外,agent 自己的 `screencapture` 在沙箱里只看得到壁纸、拿不到真实窗口像素——真实证据要么由 computer-use 当场截图看,要么把命令原样给用户在自己屏幕上核验。

**关于内联单元测试(如实表述)**:仓里现存一批内联测试(伙伴 V1/V2 引入,V4 底座拷入时也带了一些),CI 的 `cargo test` 在跑,它们必须过。纪律是:**不要求写、现存的随 CI 跑、改到就顺手维护、不建回归大坝**——别把「补测试」当成交付物,也别删掉在跑的。

## 两条不可妥协(已钉进类型与 CI)

1. **UI 无关内核**:两个壳之外的全部 crate 禁依赖 dioxus/tauri/wry/leptos(`guard-kernel-ui-free.sh` 逐个查);wasm32 check 保住将来出 Web 版的可能性。UI 相关改动只准进两个壳(`app-shell`;V3 的 `app-desktop` 已冻结)。
2. **健康永远推导**:信号只能从真实数据推导,不能手动设置(信号类型密封,存储层没有任何设置信号的方法,唯一写入者是重算函数);数据记录只追加,一个观测=一个点;**无数据 = Unknown ≠ 绿**。

## 五阶段方法论(V3 内核;V4 里降级为活的类别)

> V4 没有项目阶段轴——五阶段在 V4 里降级成了**活的类别**(原型/构建/优化……),项目不再「处于某个阶段」,交棒界面也不随 V4 搬迁。下表描述的是仍在跑的 V3 行为与这套方法论本身;方法论的打法在 V4 由自带技能与运作剧本(`standard/skills/`)承载。

项目分五个持续运营的阶段,每段一个主持角色、一套打法,首尾相接成环(运维复盘回流原型):

| # | 阶段 | 角色 | 方法论 | 求什么 | 循环节奏 |
|---|---|---|---|---|---|
| 1 | 原型 | 原型师 | 假设驱动探索 | 求真 | 小时级 · 48h 一圈 |
| 2 | 构建 | 构建师 | 规格驱动交付 | 求成 | 天级 · Spec→合入 |
| 3 | 优化 | 优化师 | 度量驱动打磨 | 求简 | 天—周级 · 基线→回归 |
| 4 | 运营推广 | 运营推广师 | 增长实验 | 求增 | 周级 · 实验批次 |
| 5 | 运维 | 运维师 | 可靠性工程 SRE | 求稳 | 持续 · 无终点 |

每阶段的核心问题/方法循环/DoD 清单/AI 编队/反模式,全是 `bw-core` 里 `StageKind` 的**静态方法论元数据**——通用打法,不随项目现编。从一个阶段推进到下一阶段叫「交棒」(`HandoffStage` 命令):DoD 没勾满不会拦你,但会记成「带险交棒」永久留痕。

## 创建流(概要)

**V4 的接入**:两张卡(仓从哪来 → 意图)填完落项目行,buddy 自动建一张「规范铺底」轻量活,把 `.bw/` 骨架写进活自己的分支、开 MR 等人合;探测到仓有历史再自动起一次资产盘点的首次模式做历史回填。全部细节见 `docs/v4-prototype/design.md` 第 4 章。

**V3 的创建流**(仍在跑的旧壳行为):同样是「仓 → 意图」两卡,创建落地时自动配好标配 Issue。拍板记录见 `plan/13`(GitHub 为正本:issue = GitHub issue、验收 = merge、`.bw/metrics.toml` 正本),术语见 `CONTEXT.md`「创建流」一节。

## 历史沿革(一段话)

本仓库 2026-07 上旬完成过一次大迁移:从原型的「七控制点线性向导」整体迁移到「五阶段=角色=方法论 · 交棒制 · 闭环回流」模型(过程记录在 `docs/archive/plan/00~05` 与 `docs/archive/iterations/`,均已标注为历史档案);2026-07-17 删除单元测试基线,转向端到端验证;2026-07-22 确立领域语言词表(`CONTEXT.md` + `docs/adr/0001`),`ProjectCycle→MaturityPeriod` 等改名即出自那次决定;2026-08 上旬伙伴会话按 `docs/v1-prototype/` → `v2` → `v3` 迭代产品化(交互式指标环、内嵌终端、调度统一、最简多人、内嵌 Open Design);2026-08-17 减负重构(删死码与一次性脚本、补 macOS PTY 后端、归档冻结文档、拆大文件),取舍全在 `docs/superpowers/specs/2026-08-17-debt-reduction-refactor-design.md`;2026-08-19 起 V4 立项并建成(仓是正本、库只留四张表、健康与数字全部现算,三个新 crate 与 V3 并存、零依赖),2026-08-21 定下「一心 V4,V3 不再投入、等删」的节奏,设计正本收敛为 `docs/v4-prototype/design.md` 一篇。旧版本文的「P0/P1/P2 里程碑」编号属于 `plan/00` 的旧路线图,现已不再使用(代号消歧见 `docs/code-schemes.md`)。
