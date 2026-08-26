# 0001 · codehub/GitHub issue + 标签 = 唯一 issue 正本,本地零数据库

- 状态:已接受(2026-08-22 重定调,2026-08-24 仓整改落地)
- 相关:[`CONTEXT.md`](../../CONTEXT.md)(Issue/活、仓、读数)、[`docs/architecture.md`](../architecture.md)(§2 工作流模型、§3 codehub-issue-正本 + app编排与运行时)

## 决策

1. **issue 的唯一正本是 codehub/GitHub 的 issue + 标签**,不是本地库。状态走 `bw:status:*` 标签、排期走 `bw:week:*`、版本走 `bw:released:*`;issue closed = Done。
2. **本地零数据库**——不再有 20 张表的 SQLite issue 库;本地只留运行时零正本(`session.jsonl`、本机设置、`asset_root` 下的 skills 摊开),落在 `asset_root`。
3. **健康、指标读数、周列表、发版记录、产物登记、文件树、diff 全部现算**,一张索引表都没有。`recompute_*` 是唯一写入(健康);读数只追加(不可回溯/手填)或现算(可回溯)。
4. **第二台 buddy 纳入同一仓**:从同一份仓 + 同一个 codehub 项目能重算出一致的名片/指标定义/周排期/活态。活态不再本机私有;leader 直接读 codehub issue 看进展。两机健康灯可能因各自本地运行时而异,不是 bug。

## 为什么

- "健康难造假"铁律要求杀进程重开所有数字能重算——本地库是第二份正本,会漂移、能被手改;去掉本地库,正本只在 codehub/git,现算永远一致。
- 第二台 buddy 的"盲区"根因是本地库私有——issue 正本共享后,leader 不需要库同步就有同一份事实。
- 20 张表与 V4 旅程(规范铺底/运作活/项目群)接不上;砍到零库后,数据归属一句话讲清:`.bw/` 仓文件(项目级配置)+ codehub issue(活态)+ 现算(健康/读数/计数)。

## 后果

- 读回不再用 `sqlite3`,改 `codehub-cli` / `gh` / `git` / `cat .bw/…`。
- `Derived<Signal>` 仍密封、`set_signal` 仍不存在——健康 derive-only 不变,只是原料从本地库观测变成现算/读数流水。
- 同一活绝不记两次(settle-once)的 `settled_at` 现读远端 issue 的 `closed_at`,不自己写。
- 代价:本地零缓存,每次现算有 IO 成本;MVP 体量下可接受,优化(本地只读缓存、失效策略)留后续。
