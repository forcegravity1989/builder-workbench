# `.bw/` 现行格式

运作活②对照这份。步骤在 `skills/asset-audit/SKILL.md`。北极星 / 口径不在这里改。

Workbench 只认下面这些。没有的不补空壳(缺名片只记报告,补写走项目约定)。

## `.bw/project.toml`

```toml
name = "workbench"
kind = ""
brief = "一句话产品"
benchmark = ""
opportunity = ""

# 在研版本不写在这里:看远端里程碑覆盖当天。旧 `current_version` 多一行不报错、不展示。

[chat]
provider = "welink"
group_id = "996840920634630304"
# 不写 notify = 默认 review / merged / release;notify = [] 是静音。
notify = ["merged", "release"]
```

不写 `standard_version`。不重写 `name` / `brief` / `benchmark` / `opportunity`。旧 `current_version` 不删不改不展示。

## `.bw/.gitignore`

写在约定树上,只这一条:

```
worktrees/
```

缺了就补,不扩写成别的忽略政策。

## `.bw/metrics.toml`(可选)

只认 `schema_version = 2`。旧格式整份拒收、不上屏。完整注释正本:`templates/metrics.toml.tmpl`。协议:`metrics.md`。

```toml
schema_version = 2

[north_star]
name = "周活跃构建者"
def = "本周至少提交一次的人数"
target = ">= 3"
collect = { kind = "script", run = ["python", ".bw/scripts/git-commits.py"], retro = true }

[[lagging]]
name = "已合入 MR"
def = "本周合入的 MR 数"
target = ">= 2"
collect = { kind = "script", run = ["python", ".bw/scripts/github-merged-prs.py"], retro = true }

[[leading]]
name = "手感"
def = "这周好不好用"
target = ">= 7"
collect = { kind = "manual" }
```

`collect` 只有 `script`(必须有 `run`)和 `manual`。A 类(`retro = true`)吐按周 `points`;B 类吐一个 `value`。窗口由 Workbench 给。失败不写 0。

## `.bw/metrics/readings.jsonl`

B/C 类读数。写在账本 `bw/ledger`,不写主检出。键是日历日,同一天同一指标一行。

```jsonl
{"day":"2026-09-02","name":"手感","value":"8","source":"manual","collected_at":"2026-09-02T20:01:00+08:00"}
```

没有 `day`、只有旧 `week` 键的行不认。

## `.bw/scripts/` · `.bw/process-catalog.md`

有指标才有。脚本对不上上面的协议:能改到能跑就改;会动口径的停手,等人走①。

## 不在仓里

开工工具在本机 `settings.toml`。类别→workflow、周五盘点只认产品默认。

---

## 变更纪要

对照现行格式,这些整份可删(不要瘦一圈再写回去):

`.bw/standard.toml` · `.bw/managed.toml` · `.bw/PROJECT.md` · `.bw/issue-policy.toml` · `.bw/connectors.toml` · `docs/Workbench/` · `.bw/plan/` · `docs/plan/` · 没人再跑的 V3 采集脚本

`issue-policy.toml` 里若 `[cadence]` 不是 `fri 09:00`,评论写一句「他们改过盘点钟点,删掉后改用产品默认」。

| | 运作活① | 运作活② |
|---|---|---|
| 北极星 / 目标 / 采集方案 | 重定 | 不改;可疑只提醒开① |
| 旧格式升到上面这样、迁读数、清残留 | — | 做 |
| 本周读数快照 / 版本目标 / 纳入 | 评论 | — |
| 每周进展 | ① 上追加 | ② 写到① |

人才能合的环只写评论,不 merge:开着的项目约定 / 指标 / 账本 MR;本周没有运作活①;指标读不动;残留 `issue-policy`;读数还躺在主检出。
