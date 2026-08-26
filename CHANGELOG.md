# CHANGELOG.md

版本变更记录。决策动机进 [`docs/adr/`](docs/adr/),不写这里。Workbench MVP 起记(2026-08-24);MVP 之前的 V1/V2/V3 史实在 git 历史与 `v3` 分支,不补抄。

本文件按**六站 + 底座**收口,不再按每次窗口一条流水往下堆。最近一次改动永远写在最上面。

## 最近 · 2026-08-26

产品命名统一为 Builders' Workbench / Workbench / BW，工程标识保留 bw；废弃 buddy、loop-buddy。README 改产品门面；仓外起手 skill 改名为 `workbench-start`。

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
- 发版弹窗默认在研号下一位,人可改。切在研号走配置屏。

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
