## 这个模块是什么

buddy MVP 自己的那对命令/事件枚举(界面只发命令、只收事件,内核是唯一执行点)+ 活的生命周期状态机与合法转移表(「完成」永远只能从「评审中」来,而且只能由人显式点)+ 回执带「真发生了什么」而不是「命令收到了」。它是一切用例的通路与守卫,本身不持有持久化。

## 代码在哪几层

- `crates/bw-v4/src/command.rs:1-9` —— 模块顶注:「界面只发 `Command`、只收 `Event`,别的一概不做」。
- `crates/bw-v4/src/command.rs:34-188` —— `Command` 枚举全表。其中 `RunIssue`(`:120`,「唯一的干活入口。跑完最远只到『评审中』」)、`SubmitIssueWork`(`:127`,「由人点……最远只到『评审中』」)、`TransitionIssue`(`:130`,「合法性由 `can_transition_to` 守;『完成』只能从『评审中』来,而且只能是人显式发这条命令」)是状态机的三个命令侧入口。
- `crates/bw-v4/src/command.rs:201-369` —— `Event` 枚举。回执写实况,不写「收到」:`IssueRan`(`:272`,带 `ok` 与执行器原样 `summary`)、`IssueTransitioned`(`:292`,带 `settled` 表示这次是不是真结清了)。
- `crates/bw-v4/src/model.rs:151-162` —— `IssueStatus` 七态(Backlog/Todo/InProgress/InReview/Done/Blocked/Cancelled)。
- `crates/bw-v4/src/model.rs:180-205` —— `can_transition_to`:转移表**唯一**事实源,每一处转移守卫都问它。`(InReview, Done)`(`:195`)是 Done 的唯一入边,产品铁律。逐字拷自 V3,一条边没加没减。
- `crates/bw-v4/src/app/issue.rs:50-183` —— `run_issue`:干成只推 InReview(`:159` 注「最远到『评审中』。这一步不是人点的,所以到此为止」);干砸原地停,可重试。
- `crates/bw-v4/src/app/issue.rs:265-299` —— `transition_issue`:先问 `can_transition_to`(`:278`),不合法返 `IllegalTransition`,不悄悄改成合法转移;`settled = to == Done`(`:287`)。
- `crates/bw-v4/src/app/mod.rs:378-476` —— `dispatch`:命令的唯一入口,一条 `match` 派发到底;`AppError::IllegalTransition`(`:76-77`)是状态机拒绝时的如实回声。
- `docs/archive/v4-prototype/design.md:967-975` —— §12.3 设计正本:「回执里带的是『真发生了什么』,不是『命令收到了』」。

## 数据落哪

本模块**不落库**。状态机是内存态求值:`can_transition_to` 是纯函数,转移成立后把新状态交给 `issue_store::set_status`(见 `issue.rs:88/125/161/285`)写远端正本——那一段归模块 1。`Event` 由 `dispatch` 回给调用方(桌面壳/headless),不持久化,只活在当次运行里。

## 依赖什么

- `crate::model` 的 `IssueStatus`/`IssueId` 等领域类型(本 crate 自持,不再从 `bw-core` 借)。
- `issue_store` 模块(模块 1):转移落盘的唯一出口,本模块只判断「能不能转」,不判断「怎么存」。
- `v4_engine` 的执行器 trait:▶跑 那条命令的下游,但状态推进的判定在本模块,不在执行器。

## 产出与验证

- 转移表是纯函数,可单测每一条边(在/不在)。
- E2E 读回:▶跑 一张活,无论执行器成功与否,状态停在 InReview 或原地,绝不到 Done;人发 `TransitionIssue { to: Done }`,只有从 InReview 来才成立,否则收 `IllegalTransition`。
- 回执诚实:`IssueRan` 的 `ok` 与 `summary` 来自执行器(mock 自带【mock】字样);`IssueTransitioned` 的 `settled` 区分「这次真结清了」与「已经结过」。

## 没建什么(如实标 defer)

- issue↔codehub 标签映射与持久化、共享重算,归 `docs/modules/codehub-issue-正本.md`(模块 1),本模块点名 `issue_store` 时只说自己这半。
- V3 那对 Command/Event 枚举不继承、不引用;转移表是逐字拷贝,不是重新推导。
- `Event` 不做事件溯源、不落库,fire-and-forget 给 UI。
- `command.rs` 只列已接线的命令;会话屏、项目群、回填那几条随后续刀落地再加(见 `command.rs:7-8`)。
