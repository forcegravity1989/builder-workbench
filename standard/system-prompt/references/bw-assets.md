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

## `.bw/metrics.toml`（可选）

协议沿 schema_version=2，正式业务定义只采用 script + retro=true 的日/周历史来源。完整格式见 [metrics](metrics.md) 与 [模板](../../templates/metrics.toml.tmpl)。指标目录读取最新已合入来源，配置草稿与正式目录分开；盘点不替模型配置指标，也不自动合并材料工作树。

manual、retro=false 或空北极星标需要配置历史采集，不代写数字、定义或目标。源数据及存储由用户项目或服务拥有。旧 readings/ledger 只作历史识别，不恢复每日自动化、记账分支或日写回；不自动删除历史记录。计划 baseline 与验收归档证据原样保留，新采集不锁旧配置。改变口径走独立“配置指标”会话，由人确认；盘点只报告缺口。

## `.bw/scripts/`

有指标才有。脚本对不上上面的协议:能改到能跑就改;会动口径的停手,交独立指标配置任务由人确认。

## 不在仓里

开工工具在本机 `settings.toml`。类别→workflow、周五盘点只认产品默认。

---

## 变更纪要

对照现行格式,这些整份可删(不要瘦一圈再写回去):

`.bw/standard.toml` · `.bw/managed.toml` · `.bw/PROJECT.md` · `.bw/issue-policy.toml` · `.bw/connectors.toml` · `.bw/plan/` · `.bw/process-catalog.md`(旧过程指标目录,产品已不再分发) · `.bw/scripts/` 中已确认没人再跑的旧采集脚本

项目中的 `docs/Workbench/`、`docs/plan/` 等知识文档目录只报告，不因目录名相同就删除。它们是否仍承担项目用途须另行确认；资产盘点的修改和提交范围仅为本场的 `.bw/` 改动。

`issue-policy.toml` 里若 `[cadence]` 不是 `fri 09:00`,评论写一句「他们改过盘点钟点,删掉后改用产品默认」。

| | 版本计划 / 独立指标配置 | 资产盘点 Issue |
|---|---|---|
| 北极星 / 目标 / 采集方案 | 重定 | 不改；可疑交独立指标配置任务 |
| 格式核对、保留历史、清已确认残留 | — | 做 |
| 采用的实测证据 / 版本目标 | 版本材料；指标定义另走配置 | — |
| 每周进展 | [版本材料协议](version-records.md) | 按 asset-audit 写入明确版本的 summary.progress，保留来源，不代做指标配置或完成确认 |

需要用户合入的事项只写评论,不 merge:开着的项目约定 / 指标 MR;本周版本材料缺失;指标读不动;残留 `issue-policy`。
