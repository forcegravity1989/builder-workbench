# skills/

Workbench 产品技能源码。一个目录一份 `SKILL.md`，全部平级。本篇给维护技能目录的人读取，只列职责、适用任务与实际覆盖；目录或加载入口变化时更新。当前规划入口仅在工作树/主项目找到文件后提供路径，不保证任意被管项目已获整套技能。

写或改 `SKILL.md` 前读 [`SKILL-MD-SPEC.md`](SKILL-MD-SPEC.md)。SOP 在各份正文的执行流程，方法与协议按需引用，不写在本 README。分层听上一级 [`../README.md`](../README.md)。

## Workbench 技能

| 业务流程 | 目录 | 适用任务（不代表已自动派发） | 内容职责 |
|---|---|---|---|
| 版本计划 | [week-planning](week-planning/SKILL.md) | 新单页配套设计稿；原注入和材料服务待同步 | 先可见 SOP，再交流目标、评审、真实任务与归档 |
| 版本验收 | [version-acceptance](version-acceptance/SKILL.md) | 新增配套设计稿，尚未接入运行 | 原承诺、真实结果、人的结论与未达安排 |
| `资产盘点` | `asset-audit/` | 资产盘点任务；运行时派发待迁移验证 | 盘 `.bw`(对照 `bw-assets.md`) + 盘项目本周改动 + 同版本周一屏 JSON 更新执行进展 |
| 指标准备 | [metrics-refresh](metrics-refresh/SKILL.md) | 总览/计划/验收出现定义或采集缺口时 | 复用指标协议，核对或补齐真实来源 |
| — | `project-handbook/` | 不派发 | 写仓根 `AGENTS.md` |

当前接入写工作区 `.bw/project.toml`；旧 Rust 的 `bw/project` 常驻工作树与 MR 旅程尚未迁入，不能作为现行操作要求。

## workflow 入口

以下是保留的历史入口；其 vendor 依赖未迁入，本分支不能按已打包能力使用。

| workflow | 目录 | 状态 |
|---|---|---|
| `mattpocock-skills` | `mattpocock-skills/` | 入口内容存在；vendor 缺失，未形成可用的默认派发 |
| `proto-design` | — | 原型默认,源还没 vendor |

本分支不因旧入口存在而自动恢复 vendor。任务规范(指标 / 改仓 / `.bw` 格式)在 `../system-prompt/references/`,不进本目录。

`mr-review` 已收录,评审会话尚未派发。

## 共同规矩

最远「待评审」。指标不许写假数。盘点常没人在场,能做的先做。
