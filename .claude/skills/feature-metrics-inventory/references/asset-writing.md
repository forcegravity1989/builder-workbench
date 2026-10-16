# 落盘落点与交接

> 30 秒导读：站 5 读本篇。落点总表 + 各落点写入纪律 + 与 metrics-refresh 的交接边界。本 Skill 不新增任何资产格式：全部写入沿既有协议正本；`.bw/` 不放白名单外文件，盘点进度从资产现算（无状态文件）。

## 落点总表

| 盘点产出 | 被管项目落点 | BW 自身落点 | 界面可见性 |
|---|---|---|---|
| 名片 | `.bw/project.toml` 补空（固定分支 + PR 流，只补空不覆盖） | README / 原则 03 对照校准，不另写 | 总览项目卡（想做什么/对标/目标方向） |
| 北极星 | `.bw/metrics.toml` `[north_star]`（可缺席） | 同左（现行有意缺席，不硬立） | 总览北极星卡（含「未配置」诚实态） |
| 特性定义 + 旅程 | 特性卡文档，默认 `docs/features.md`（见下） | `docs/05-features/<id>/` 既有正本 | 界面不读文档 |
| 特性归属（机器可读） | `metrics.toml` 各指标的 `feature` 字段 | 同左 | 总览指标页签分组 |
| 指标定义 | `.bw/metrics.toml` `[[leading]]`/`[[lagging]]` + `leads` | 同左 | 总览指标区（引领/滞后配对展示） |
| 采集脚本 | `.bw/scripts/`（metrics-refresh SOP 负责） | 同左 | 读数来源 |
| 本次结论与未决项 | PR 描述 / Issue 记录 | 同左 | 不进界面，不另建台账 |

## project.toml 写入纪律

- 字段语义：`name` / `kind` / `brief`（想做什么）/ `benchmark`（对标）/ `opportunity`（目标方向，**定性**）。
- **保真补空**：只补空字段；已填字段要改须人显式确认并留 PR 记录。
- 走固定分支 + PR 流，人审人合；协议细节以 bw-assets 与关键信息维护正本为准：[bw-assets](../../../../standard/system-prompt/references/bw-assets.md)、[关键信息维护](../../../../docs/06-module/关键信息维护.md)。
- **量化北极星不进 project.toml**：`opportunity` 历史别名是 north_star，现行语义是定性目标方向；量化北极星只落 metrics.toml `[north_star]`。

## metrics.toml 写入纪律

schema、字段约束、脚本 stdout、窗口与 coverage 纪律全部以[指标协议](../../../../standard/system-prompt/references/metrics.md)为正本，此处只列盘点侧要点：

- `feature` 字段 = 特性名（稳定标签），界面按它分页签；`leads` 只写在引领上、值 = 它盯的滞后指标 `name`，同 feature 组内必须唯一解析（解析不唯一会被报 ambiguous-relation——这正好暴露「一个特性配了多条滞后」，回站 4 收敛）。
- `target` 是意图声明不是事实，可空；实际读数不可手填；没配置 = not-configured，坏文件 = invalid-definition——向人解释时不混用。
- **特性改名 = 显式迁移步骤**：同步改所有相关指标的 `feature` 值、特性卡文档标题与主干行、计划材料中的引用；逐项列给人确认后一次改完，不顺手改（改名是常态，断链是事故）。

## 特性卡文档规范（被管项目）

- 默认单文件 `docs/features.md`，结构：头部维护约定（给谁看/管什么/何时更新）→ **一行主干**（特性按叙述顺序各一句话）→ 每特性一张卡（模板 [../assets/feature-card.md](../assets/feature-card.md)）→ **Not Now 清单与变更记录**（日期/改了什么/谁确认）。
- 项目已有特性/路线文档时**就地对齐**（补旅程线与指标指针），不建第二份正本；落点选择记入 PR。
- BW 自身不建 features.md：特性正本是 `docs/05-features/`，特性卡内容按其目录头部约定拆进对应特性的 intent/spec/STATUS。
- 特性卡文档是人读正本，界面不消费——所以写给人看：人话、旅程一行箭头、指标附口径与来源指针；不堆实现细节。
- 状态只用三值：active / completed（人确认 + 日期）/ canceled（原因 + 日期）；「有意搁置」进 Not Now 并可见，不静默删除（Linear 把 Canceled 做成一等状态的同款理由）。

## 与 metrics-refresh 的交接

| 本 Skill（上半程） | metrics-refresh（下半程） |
|---|---|
| 盘出名片/北极星/特性/指标候选与口径 | 配置写入维护树、采集脚本实现、试采、合入 |
| 产出：人确认的口径卡（8 字段）+ feature 归属 + leads 关系 | 产出：合入主干的 metrics.toml + 脚本 + 总览可见读数 |
| 交接物：口径卡与采集方式草案随 PR/Issue 留存 | 入口：「配置指标」工作流或其 SOP |

「盘完」≠「总览可见」：指标没有采集脚本时在界面是问题不是读数；交接时向人说清当前走到哪一步、还差什么。

## 通用纪律

- `.bw/` 不新增白名单外文件（本 Skill 无状态文件；进度从资产现算，见 SKILL.md 站 0）。
- 一切写入走项目 PR 流，人审人合；本 Skill 不新增合入、关闭 Issue 或确认完成的授权。
- 写后读回：逐字段展示给人核对；然后做 reader test（无上下文新会话读落盘文件答三问，答不出打回对应站）。

## 外部主张来源

- Linear changelog「Initiative properties」（2026-07-02）：Proposed/Canceled 为一等状态，理由是「有意搁置必须可见」。
- 本篇其余内容为仓内正本的读法摘要（指标协议、bw-assets、关键信息维护、metrics-refresh SOP），正本见文内各链接；协议变更时以正本为准并同步本篇摘要。
