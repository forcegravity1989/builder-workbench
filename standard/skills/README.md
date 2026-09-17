# skills/

Workbench 自带技能。一个目录一份 `SKILL.md`,全部平级。开工时写入 Workbench 资产目录,不进用户仓。提示词只给名字 + 一句话 + 路径。

写或改 `SKILL.md` 前读 [`SKILL-MD-SPEC.md`](SKILL-MD-SPEC.md)。SOP 是各份正文第 4 节「标准执行流程」,不写在本 README。分层听上一级 [`../README.md`](../README.md)。

## Workbench 技能

| workflow | 目录 | 谁触发 | 现行做什么 |
|---|---|---|---|
| `更新指标与版本计划` | `week-planning/` | Orca 周一 09:00(默认关)或计划屏 Start | 本分支改为固定 HTML + 版本 JSON 的三屏规划；资源位于本目录，生产附件分发和自动化对接仍待完成 |
| `资产盘点` | `asset-audit/` | Orca 周五 15:00(默认关)或计划屏 Start | 盘 `.bw`(对照 `bw-assets.md`) + 盘项目本周改动 + 更新指标与版本计划 Issue 上追加每周进展 |
| — | `metrics-refresh/` | `week-planning` 指名 | 采集 / 添加采集脚本 |
| — | `project-handbook/` | 不派发 | 写仓根 `AGENTS.md` |

项目约定没有剧本:不起 agent,只写 `.bw/project.toml` 到 `bw/project`。

## workflow 入口

和Workbench 技能走同一条 `skill_pointer`。入口 body 指向 `../vendor/`。

| workflow | 目录 | 状态 |
|---|---|---|
| `mattpocock-skills` | `mattpocock-skills/` | 构建/优化/运维产品默认,已打包 |
| `proto-design` | — | 原型默认,源还没 vendor |

阶段方法论不预置,由 `vendor/` 提供。任务规范(指标 / 改仓 / `.bw` 格式)在 `../system-prompt/references/`,不进本目录。

`mr-review` 已收录,评审会话尚未派发。

## 共同规矩

最远「待评审」。指标不许写假数。盘点常没人在场,能做的先做。
