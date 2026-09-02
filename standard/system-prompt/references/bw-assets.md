# Workbench 给被管项目的 `.bw/` 现行契约

> 这份是给运作活②的阶段规范:当前 Workbench **认什么、整份删什么、格式长什么样**。
> 步骤在 `skills/asset-audit/SKILL.md`。本周这个项目发生了什么不写这里,每次现算。
> 北极星 / 口径不在这里改——那是运作活①。

## 该有

| 路径 | 是什么 | ② 可以动吗 |
|---|---|---|
| `.bw/project.toml` | 项目约定(名片):`name` / `kind` / `brief` / `benchmark` / `opportunity` / `current_version` / 可选 `[chat]` | **不重写意图字段**。旧行 `standard_version` 新写入不再写;看见可删这一行 |
| `.bw/.gitignore` | 忽略 `worktrees/`(写在约定树上) | 缺了就补这一条,不扩写成别的忽略政策 |
| `.bw/metrics.toml` | 指标定义,只认 `schema_version = 2` | 没有这份不补空壳。有旧格式:升到 2,迁已有读数,不改北极星/目标/口径。协议细节读同目录 `metrics.md` |
| `.bw/metrics/readings.jsonl` | B/C 类读数。键是日历日,同一天同一指标一行 | 写在账本 `bw/ledger`,不写主检出。旧键 `week`、没有 `day` 的行不认,升格式时按 `metrics.md` 迁 |
| `.bw/scripts/` | 采集脚本,Workbench 只起进程、传窗口、读 JSON | 旧脚本对不上现行协议:改到能跑,或在评论里写清缺哪、等人走①重定 |
| `.bw/process-catalog.md` | 过程指标目录(有播种才有) | 缺了不补。还在但指到已删脚本的,只记评论 |

没有 `.bw/project.toml` 只记报告,不在这次补写(补写走项目约定)。

## 整份可删

新规范不再铺、也不再读。还在的,在这张活自己的工作目录里删掉,随盘点 MR 走。拿不准的(不像 Workbench 铺的)只写报告。

- `.bw/standard.toml`
- `.bw/managed.toml`
- `.bw/PROJECT.md`
- `.bw/issue-policy.toml`(若 `[cadence]` 不是产品默认 `fri 09:00`,评论里写一句「他们改过盘点钟点,删掉后改用产品默认」)
- `.bw/connectors.toml`
- `docs/Workbench/`(整棵)
- `.bw/plan/`
- `docs/plan/`
- 确认没人再跑的 V3 采集脚本

不要瘦一圈再写回去。不要把「疑似没人用」的业务文件当残留删。

## 现行格式(对照用,正本在解析器与模板)

- 名片字段见上表。`[chat].notify`:`None` = 默认三样;`[]` = 静音。新写入不写 `standard_version`。
- 指标:`schema_version = 2`;字段 `name` / `def` / `target` / `collect`。`collect` 只有 `script`(要有 `run`)和 `manual`。A 类脚本吐按周 `points`;B 类吐一个 `value`。窗口由 Workbench 给。失败不写 0。
- 读数在账本 `bw/ledger`,不在主检出。主检出上的脏读数应先挪进账本。
- 开工工具在本机 `settings.toml`,不在仓里。类别→workflow 和周五盘点只认产品默认。

内核读到旧 `metrics.toml` 整份拒收、不上屏、不在打开项目时改仓。让它重新能读,是这次盘点的事。

## 和运作活①的分工

| 事 | 谁 |
|---|---|
| 北极星 / 滞后 / 引领该衡量什么、目标、采集方案重定 | ① |
| 旧格式升到现行、迁读数、清残留、让当前 Workbench 读得动 | ② |
| 本周读数快照、版本目标、纳入清单 | ① 的评论 |

② 发现口径可疑,只在评论里提醒人开①,不自己改定义。

## 未闭环的环(现算,不写进本文件当清单正本)

对照本周远端和仓,点名写进本张活的评论。人才能合的,只写评论,不替人点、不 merge。

- 开着的项目约定 / 指标定义 / 账本 MR
- 本周没有运作活①(标题 `更新指标 + 制定版本计划`,本 ISO 周)
- `.bw/metrics.toml` 读不动(旧 schema / 缺字段 / 脚本对不上现行协议)
- 残留 `issue-policy.toml` 还在
- 账本 `bw/ledger` 开着或主检出上还躺着该进账本的读数
