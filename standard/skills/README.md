# skills/

Workbench 自带技能。一个目录一份 `SKILL.md`,全部平级。开工摊到 Workbench 资产目录,不进用户仓。提示词只给名字 + 一句话 + 路径。

写或改 `SKILL.md` 前读 [`SKILL-MD-SPEC.md`](SKILL-MD-SPEC.md)。SOP 是各份正文第 4 节「标准执行流程」,不写在本 README。分层听上一级 [`../README.md`](../README.md)。

## 运作剧本

| workflow | 目录 | 谁触发 | 现行做什么 |
|---|---|---|---|
| `更新指标与版本计划` | `week-planning/` | 人点「开始本版本」 | 带人复盘、更新指标、确认版本与纳入;人点头后落盘 |
| `资产盘点` | `asset-audit/` | 定时(产品默认周五 09:00) | 盘 `.bw`(对照 `bw-assets.md`) + 盘项目本周改动 + ① 上追加每周进展 |
| — | `metrics-refresh/` | `week-planning` 指名 | 采 / 荐入脚本 |
| — | `project-handbook/` | 不派发 | 写仓根 `AGENTS.md` |

项目约定没有剧本:不起 agent,只写 `.bw/project.toml` 到 `bw/project`。

## workflow 入口

和运作剧本走同一条 `skill_pointer`。入口 body 指向 `../vendor/`。

| workflow | 目录 | 状态 |
|---|---|---|
| `mattpocock-skills` | `mattpocock-skills/` | 构建/优化/运维产品默认,已打包 |
| `proto-design` | — | 原型默认,源还没 vendor |

阶段方法论不预置,由 `vendor/` 提供。阶段规范(指标 / 改仓 / `.bw` 格式)在 `../system-prompt/references/`,不进本目录。

`mr-review` 已入库,评审会话尚未派发。

## 共同规矩

最远「评审中」。指标不许写假数。盘点常没人在场,能做的先做。
