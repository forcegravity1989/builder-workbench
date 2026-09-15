# `.bw/` 现行格式

资产盘点 Issue 对照这份。步骤在 `skills/asset-audit/SKILL.md`。北极星 / 口径不在这里改。

Workbench 只认下面这些。没有的不补空壳(缺名片只记报告,补写走项目约定)。

本份只列 Workbench **读**的 `.bw/` 格式;全仓人持文档正本(architecture / 开发规矩 / 词表 / 变更记录 / 原则 / 架构决策 / 指南 / 设计系统 / 特性制品)的盘点在 asset-audit 剧本第 2 步,不在这份。

## `.bw/project.toml`

```toml
name = "workbench"
kind = ""
brief = "一句话产品"
benchmark = ""
opportunity = ""

# 在研版本不写在这里:从带版本标签的版本计划 Issue 中优先选最新未关闭项，其次选未发布的已关闭项，没有则为空。
# 里程碑日期不决定在研版本。旧 `current_version` 多一行不报错、不展示。

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
collect = { kind = "manual" }

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

示例中的人数指标使用手填的真实读数；`git-commits.py` 统计提交次数，不能替代按人去重的指标。是否采用自动采集由更新指标与版本计划 Issue 按项目口径确认，盘点不改指标定义。

`collect` 只有 `script`(必须有 `run`)和 `manual`。A 类(`retro = true`)吐按周 `points`;B 类吐一个 `value`。窗口由 Workbench 给。失败不写 0。

## `.bw/metrics/readings.jsonl`

B/C 类读数。写在指标记录分支 `bw/ledger`,不写主检出。键是日历日,同一天同一指标一行。

```jsonl
{"day":"2026-09-02","name":"手感","value":"8","source":"manual","collected_at":"2026-09-02T20:01:00+08:00"}
```

没有 `day`、只有旧 `week` 键的行不认。

## `.bw/scripts/` · `.bw/process-catalog.md`

有指标才有。脚本对不上上面的协议:能改到能跑就改;会动口径的停手,等用户执行更新指标与版本计划 Issue。

## 不在仓里

开工工具在本机 `settings.toml`。类别→workflow、周五盘点只认产品默认。

---

## 变更纪要

对照现行格式,这些整份可删(不要瘦一圈再写回去):

`.bw/standard.toml` · `.bw/managed.toml` · `.bw/PROJECT.md` · `.bw/issue-policy.toml` · `.bw/connectors.toml` · `.bw/plan/` · `.bw/scripts/` 中已确认没人再跑的旧采集脚本

项目中的 `docs/Workbench/`、`docs/plan/` 等知识文档目录只报告，不因目录名相同就删除。它们是否仍承担项目用途须另行确认；资产盘点的修改和提交范围仅为本场的 `.bw/` 改动。

`issue-policy.toml` 里若 `[cadence]` 不是 `fri 09:00`,评论写一句「他们改过盘点钟点,删掉后改用产品默认」。

| | 更新指标与版本计划 Issue | 资产盘点 Issue |
|---|---|---|
| 北极星 / 目标 / 采集方案 | 重定 | 不改;可疑只提醒创建更新指标与版本计划 Issue |
| 旧格式升到上面这样、迁读数、清残留 | — | 做 |
| 本周读数快照 / 版本目标 / 纳入 | 评论 | — |
| 每周进展 | 更新指标与版本计划 Issue 上追加 | 资产盘点时写到更新指标与版本计划 Issue |

需要用户合入的事项只写评论,不 merge:开着的项目约定 / 指标 / 指标记录 MR;本周没有更新指标与版本计划 Issue;指标读不动;残留 `issue-policy`;读数还躺在主检出。
