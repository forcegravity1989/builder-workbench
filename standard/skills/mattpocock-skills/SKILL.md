---
name: mattpocock-skills
description: Use when 构建/优化/运维活开工且 workflow=mattpocock-skills。
---

# mattpocock-skills：build 默认 workflow 入口

## 1. 核心目标

按 grill → implement → code-review 读 vendor 里的技能,照它们的正文干。本篇只指路,不复述业界步骤,不复述 SYSTEM。

## 2. When to Use / When NOT to Use

- 用:活上挂了 `mattpocock-skills`(产品给构建/优化/运维的默认)。
- 不用:运作活、原型、运营推广、空 workflow。

`/xxx` 在这里 = 读本入口写明的那份文件,不是去技能库猜名字。

## 3. 前置依赖检查

资产根 = 本文件所在 `skills/` 的上一级。下面路径相对资产根。缺文件就停,说哪份不在,不编步骤。`build.md` 已注入。

## 4. 标准执行流程

**第 1 步 · 对齐**  
走到对齐。读 `vendor/mattpocock-skills/skills/engineering/grill-with-docs/SKILL.md`,照它问。它点到的接着读:

- `vendor/mattpocock-skills/skills/productivity/grilling/SKILL.md`
- `vendor/mattpocock-skills/skills/engineering/domain-modeling/SKILL.md`

没对齐不写代码。

**第 2 步 · 实现**  
走到实现。读 `vendor/mattpocock-skills/skills/engineering/implement/SKILL.md`。它收尾会自己去 code-review,别提前读。它点到 TDD 时读 `vendor/mattpocock-skills/skills/engineering/tdd/SKILL.md`。改仓落点见 `build.md`。

**第 3 步 · 评审**  
走到评审。读 `vendor/mattpocock-skills/skills/engineering/code-review/SKILL.md`。有遗留回第 2 步。干完开 MR,地址打屏。

## 5. 参考资源

- 上列 vendor 路径:步骤正文在那里。
- `build.md`(已注入):worktree、分支、评论/打标不是改仓。

## 6. error_handling

| 现象 | 处理 |
|---|---|
| vendor 文件不在 | 停,报路径,不编 SOP |
| 还没对齐就想写代码 | 回到第 1 步 |
| 评审有遗留 | 回第 2 步 |

## 7. 示例

构建活挂 `mattpocock-skills`。先读 grill-with-docs 把目标和 ADR 问清,再 implement,最后 code-review,开 MR。

## 8. 纪律表

| | |
|---|---|
| 必须 | 按路径读完再干;对齐完再动手 |
| 禁止 | 跳步;改 `vendor/` 正文 |
| 你不做的事 | 复述 SYSTEM 纪律;发明第三条注入链 |
