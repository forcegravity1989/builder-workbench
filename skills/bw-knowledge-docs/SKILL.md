---
name: bw-knowledge-docs
description: >-
  Maintain Workbench knowledge-base role map (`.bw/knowledge-map.toml`) for AI-native
  project docs. Use when onboarding a repo, KB classification looks wrong, reviewing a
  draft knowledge map, or restructuring docs into user/engineering roles.
---

# Workbench 文档维护

仓与仓的**路径不同**，但 AI-native 项目的**文档角色**一致。不要把单仓路径写死进 Workbench 代码；真相在该仓的 `.bw/knowledge-map.toml`。

详细角色与维护策略见同目录 [`roles.md`](roles.md)。

## 何时用

- 项目刚接入，地图 `status = "draft"`
- 知识库分组不对（该进契约的进了参考等）
- 文档目录重组后需要重映角色

## 步骤

1. **列仓内文档**：Markdown / MDX，以及 `.bw/project.toml`。跳过生成物与无关树（常见：`node_modules/`、构建产物、`docs/review-evidence/`）。
2. **按角色归类**（见 `roles.md`）：先定「这份文档干什么」，再填路径；不要先猜目录名。
3. **写 / 改** `.bw/knowledge-map.toml`：
   - `[[section]]`：`role` + `paths`（精确文件或目录前缀，目录以 `/` 结尾）
   - `[[exclude]]`：明确不进知识库的前缀
   - 冲突时：**更长 / 更精确的 path 优先**；exclude 优先于 section
4. **把 `status` 改为 `"reviewed"`**，并简述你改了哪几段角色。
5. **完成标准**：每个进知识库的文档都能落到唯一 role；用户文不对账；契约与当前活跃特性可对账；参考 / Agent 入口侧栏即可。

## 禁止

- 把某个仓库的路径白名单提交进 Orca/Workbench 运行时代码
- 把实现现状写回愿景 / 契约「正本」来消对账差异
- 用「文档很多」当理由把整棵 `docs/` 丢进同一 role

## 地图骨架

```toml
version = 1
status = "draft"

[[section]]
role = "eng-features"
paths = ["docs/features/"]

[[section]]
role = "eng-contract"
paths = ["docs/architecture.md"]

[[exclude]]
paths = ["docs/review-evidence/"]
```
