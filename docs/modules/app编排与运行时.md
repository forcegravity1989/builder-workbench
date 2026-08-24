## 这个模块是什么

buddy MVP 的编排大脑:界面发一条 `Command`,`App::dispatch` 是唯一入口,一条 `match` 派发到各用例模块(issue/plan/ops/collect/health...),守卫也在这一层——状态能不能转、活能不能结第二次,动仓之前先问清楚。它还管 buddy 自己的本机资产目录(`asset_root`):项目注册表、全局设置、会话记录,全是纯运行时、零正本——仓和 codehub issue 才是正本。

## 代码在哪几层

- `crates/bw-v4/src/app/mod.rs:1-19` —— 模块顶注:「界面发一条 Command,这里执行它,回一串 Event。守卫也在这里——状态能不能转、活能不能结第二次,都在动库/动仓之前问清楚」。
- `crates/bw-v4/src/app/mod.rs:61-82` —— `AppError`:编排层所有用例的出错口径。`IllegalTransition`(`:76-77`,「状态机不许这么转。如实弹回,不悄悄改成一个合法的转移」)是状态机拒绝时的回声。
- `crates/bw-v4/src/app/mod.rs:85-109` —— `App` 结构体七件持有:`workspaces_root`(`:87`)/`executor`(`:90`,干活后端)/`terminal`(`:93`,纯内存 PTY 会话)/`pty_enabled`(`:95`)/`progress`(`:98`)/`asset_root`(`:105`)/`remote_factory`(`:108`)。
- `crates/bw-v4/src/app/mod.rs:379-476` —— `dispatch`:命令唯一入口,一条 `match` 派发到底,每条 Command 路由到一个用例方法。
- `crates/bw-v4/src/app/mod.rs:127-160` —— 远端工厂:默认真 `Remote::for_project`(codehub/gh,`:129-131`);`with_remote_factory`(`:150-153`)是 mock 注入的唯一口子;`remote_for`(`:158-160`)是内部模块拿远端的统一派发。
- `crates/bw-v4/src/app/mod.rs:187-197` —— `with_progress` 接通道、`step` 报一步(没人订就丢,报不出去绝不让命令失败)。
- `crates/bw-v4/src/app/progress.rs:1-10` —— 顶注:「这条通道只负责让人看得见,不承担任何账目。真话仍以 Event、库里的行、仓里的文件为准」。
- `crates/bw-v4/src/app/progress.rs:14-30` —— `StepState`(Doing/Ok/Fail)+ `ProgressLine`(step/state/text);`:32-54` 三个构造器。界面按 `step` 号原地覆盖旧行——「正在 clone…」被「clone 好了」换掉,不堆成两行。
- `crates/bw-v4/src/app/mod.rs:220-376` —— App 上的薄方法群(`project`/`projects`/`upsert_project`/`conversation_for_issue`/`workspace_of`...),全是对 `local/` 的转发。
- `crates/bw-v4/src/app/issue.rs:279,304`、`crates/bw-v4/src/app/ops.rs:189` —— `IllegalTransition` 实际抛出点(dispatch 路由过去后,用例模块调 `can_transition_to` 不通过时返)。
- `crates/bw-v4/src/local/mod.rs:1-26` —— 顶注:三件东西(registry/settings/sessions),「仓是正本:这里全是本机过程数据与显示缓存,删掉 asset_root 不会丢任何劳动成果」。
- `crates/bw-v4/src/local/registry.rs:1-7` —— `projects.toml`:buddy 纳管的项目清单(定位字段 + 显示缓存 + 本机设置),替代旧 `project` 表 + `app_meta` 的 `notify_seen` 键。
- `crates/bw-v4/src/local/registry.rs:22-50` —— `ProjectEntry`(含 `notify_seen`/`cron_enabled` 两个本机扩展);`:108-289` `ProjectRegistry` 无状态全量读写(load/save/upsert/remove/cache_health/set_notify_seen...)。
- `crates/bw-v4/src/local/sessions.rs:1-9` —— `sessions/<slug>/<iid>.jsonl`:append-only,每行一条 JSON,取最后一条=最新状态;替代旧 `claude_conversation` 表。`:57-171` `SessionStore`(read 取末行/append 追加/list 扫目录/remove_project 清目录)。
- `crates/bw-v4/src/local/settings.rs:1-6` —— `settings.toml`:全局本机设置,今天只有 `workspaces_root`(`:12-18`),替代旧 `app_meta` 键;「本机设置,不进仓」。
- `docs/archive/v4-prototype/design.md:185-188` —— §3.4「留本地的(零正本,纯运行时)」;`:967-975` §12.3「回执里带的是真发生了什么,不是命令收到了」+「没有一条命令要求改动状态机或信号只能从数据推导这条铁律」。

## 数据落哪

编排层自己不落库——`App.terminal` 是纯内存(进程死了就没了,会话**身份**在 `sessions/` 的 jsonl 里才接得回)。本机运行时数据全在 `asset_root` 下三个文件:`projects.toml`(项目注册表+健康缓存+notify_seen)、`settings.toml`(工作区根目录)、`sessions/<slug>/<iid>.jsonl`(append-only 会话)。**正本是仓和 codehub issue**——这里全是缓存与过程数据,删掉重新接入就回来。

## 依赖什么

- `crate::model` / `crate::command`:领域类型与命令/事件枚举(本 crate 自持)。
- `crate::derive`:`DerivedHealth` 密封类型——健康灯只能经它进 `cache_project_health`,没有手设口子。
- `v4_engine`:`InteractiveExecutor`(干活后端)+ `TerminalManager`(PTY 生命周期)+ `Remote`(codehub/gh 远端,经 `remote_factory` 注入)。
- `crate::repo` / `crate::standard`:仓文件解析与自带技能包(`ensure_skill_assets` 摊到 `asset_root/skills/`)。

## 产出与验证

- `dispatch` 是命令唯一入口:深链启动 + 文件读回核对每条命令真做了什么;回执带「真发生了什么」,不是「命令收到了」。
- 守卫读回:不合法转移收 `IllegalTransition`,不悄悄改成合法转移;健康灯只从 `DerivedHealth` 进 `projects.toml`,手设不了。
- 回执通道:`ProgressLine` 无人订阅就丢,报不出去绝不影响命令;报了「clone 好了」而仓不在,以仓为准。
- 运行时零正本:删 `asset_root`,项目和仓还在远端,重新接入即恢复。

## 没建什么(如实标 defer)

- 各用例模块本身(issue/plan/ops/collect/health/backfill/bootstrap/chat_notify/session/tools/worktree)的业务各自成篇,本模块只讲 dispatch 怎么派发到它们、守卫从哪返。
- 状态机定义(`can_transition_to` 转移表)归 `command-event-与状态机` 模块,这里只讲 dispatch 调到守卫、`IllegalTransition` 怎么回。
- `issue_store`(codehub issue 持久化映射层,`mod.rs:27-29`)已接线 app 层各用例(`issue.rs`/`project.rs`/`plan.rs`/`ops.rs`/`session.rs`/`backfill.rs`/`bootstrap.rs` 都调它);`remote_for` 是它统一拿远端的口子。
