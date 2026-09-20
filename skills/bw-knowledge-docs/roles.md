# AI-native 文档角色

Workbench 知识库分组 key = 下表 `role`。路径因仓而异；**维护策略跨仓一致**。

| role | 名称 | 干什么 | 谁改 / 何时改 | 对账 |
|------|------|--------|---------------|------|
| `user-docs` | 产品帮助 | 给终端用户看的帮助 / 文档站正文 | 用户可见行为变了 | 否 |
| `user-readme` | 对外 README | 访客入口、定位与功能墙 | 定位或对外卖点变了 | 否 |
| `eng-principles` | 愿景和原则 | 客群、主张、长期不变的「为什么」 | 人拍板后改 | 弱 |
| `eng-contract` | 设计与契约 | UI/架构/兼容等难回头约定 | 人确认契约错了才改 | **是** |
| `eng-features` | 当前活跃特性 | 推进中的 intent / spec / roadmap | 开特性或里程碑推进时 | **是** |
| `eng-reference` | 工程参考 | howto、运维、备忘 | 实现/平台知识更新时 | 否 |
| `eng-agents` | Agent 入口 | AGENTS / CLAUDE 等约束日常改动 | 规矩或用词变了 | 否 |
| `eng-bw` | 项目约定 | `.bw/` 名片与知识地图 | 接入 / 改名片 / 审地图 | 否 |

## 归类提示（启发式，可被地图覆盖）

- 文件名 / 路径含 `intent`、`spec`、`roadmap`、`plan`、`feature` → 先考虑 `eng-features`
- `adr`、`styleguide`、`architecture`、`compat`、`boundary`、契约 → `eng-contract`
- `reference`、`howto`、`runbook` → `eng-reference`
- `principle`、`vision` → `eng-principles`
- 仓根 `README*` → `user-readme`；仓根 `AGENTS.md` / `CLAUDE.md` → `eng-agents`
- 文档站「给用户看的正文」目录 → `user-docs`；站点工程元数据 → exclude

## 对账纪律

- 对账只盯 **契约** 与 **当前活跃特性**
- 对不上：改实现，或提交给人改设计；**不把现状写回正本**
