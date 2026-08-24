# codehub issue 正本(issue↔标签映射 + 共享重算)

> 30 秒导读:这是 buddy MVP 数据层模块之一,讲 issue 的正本在哪、怎么和 codehub 标签互转、两台 buddy 怎么从同一正本重算一致。讲的是持久化与映射,**不讲**状态机与合法转移(那在 `command-event-与状态机.md`)。作数。

## 这个模块是什么

把 bw-v4 的 `Issue` 领域对象 ↔ codehub/GitHub 的 issue+标签互转的映射层。issue 的状态、周排期、发版关联全部以远端 issue 的标签为正本,本地零数据库——两台 buddy 接同一个 codehub 仓,读出来的是同一份活态。

## 代码在哪几层

- `crates/bw-v4/src/app/issue_store.rs:52-75` — `create()`:远端真开 issue,标签 = `bw:status:todo` + `bw:week:*` + 调用方塞的额外标签
- `crates/bw-v4/src/app/issue_store.rs:78-95` — `fetch()`/`list()`:`view_issue` 单查带回正文(list 不带),逐条映射回 `Issue`
- `crates/bw-v4/src/app/issue_store.rs:100-159` — `set_status`/`set_week`/`set_released`:改 `bw:status:*`/`bw:week:*`/`bw:released:*` 标签(namespace-replace 换掉旧的);**Done 不打标签,走 `close_issue`**
- `crates/bw-v4/src/app/issue_store.rs:163-180` — `find_open_by_title()`:B 类轻量活在途复用的幂等键(固定枚举标题,同一张不建第二张)
- `crates/bw-v4/src/app/issue_store.rs:224-263` — `issue_from_remote()`:远端 issue 快照 → `Issue`,从标签反解 status/week/version,`created_at`/`settled_at` 从 RFC3339 解析
- `crates/bw-v4/src/app/issue_store.rs:339-377` — `status_label`/`parse_status_from_labels`/`parse_week`/`parse_released`:标签 ↔ 字段的双向辅助
- `crates/bw-v4/src/app/issue.rs:10-11,339-365` — 正本读写入口:`issue_or_err`(单读)与 `issues`(列项目全部活,从远端现读,**失败不吞**,返 `Err` 让 UI 显式横幅、保留上一份已知好的 VM);`create_issue`/`run_issue`/`transition_issue` 归模块5
- `crates/bw-v4/src/model.rs:57-97` — `IssueId` = `(project_id, iid)`,`from_remote` 是唯一生产构造方式(issue 身份由远端号定义,不再是随机 UUID)
- `crates/bw-v4/src/command.rs:84-97` — `CreateIssue`/`ScheduleIssue` 命令(正本读写相关);`RunIssue`/`TransitionIssue`/`BlockIssue` 归模块5

## 数据落哪

**codehub/GitHub 的 issue + 标签 = 唯一 issue 正本**(标题=标识,`bw:status:*`/`bw:week:*`/`bw:released:*` 标签=状态/排期/版本,issue closed=Done)。**本地零数据库**——读都走 CLI,不留读缓存。**lossy**:`branch`/`pr_number`/`sort_order`/`metric_key` 读回时一律给默认值;`body` 只在 `view_issue` 单查时带回,列表查询不带(填空串)。

## 依赖什么

- **上游**:`v4_engine::remote`(`RemoteIssue`/`IssueFilter`/`Remote` enum,Github/Codehub/Mock 三变体做远端分发,调 codehub-cli/gh);`crates/bw-v4/src/model.rs`(`Issue`/`IssueId`/`IssueStatus`/`IssueKind`)
- **下游**:`issue.rs` 的命令层(模块5)经 `issue_store` 走远端;`app-shell` 的查询经 `App::issues`/`App::issue_or_err` 读回

## 产出与验证

`codehub-cli` / `gh` 直接读回 issue 的标签与状态:建活后标签是 `bw:status:todo` + `bw:week:*`;状态转移后标签换掉(Done 则 issue closed)。**两台 buddy 从同一 codehub 重算一致**——第二台读同一仓的 issue 列表,映射回 `Issue` 后活态、周排期、版本完全相同,这就是共享正本的含义。headless 指挥器建活后用 `gh issue view` 读回标签核对;`issues()` 失败返 `Err` 不吞,UI 横幅可见。

## 没建什么

- 本地读缓存(MVP 不要,读都走 CLI,卡点认了)
- `Backlog`/`Cancelled` 在 codehub 映射里没有对应标签,`set_status` 如实弹回 `AppError::Refused`,不编一个标签
- 列表查询不带正文(只有 `view_issue` 单查带 `body`),需要正文的地方多走一次单查
