---
name: mattpocock-skills
description: Use when a build/optimize/ops活开工且挂了 workflow=mattpocock-skills——build 阶段默认 workflow,走 grill-with-docs→implement→code-review 的 SOP
---

# build 阶段默认 workflow:grill-with-docs → implement → code-review

这件活走 mattpocock-skills 的标准 build 链。三步,每步读对应技能正文(在 buddy
资产目录的 `vendor/mattpocock-skills/skills/engineering/` 下;资产根 = 这份入口
所在的 `skills/` 目录的上一级),照它干,别跳步。

## 1. 对齐 —— `/grill-with-docs`

路径:`vendor/mattpocock-skills/skills/engineering/grill-with-docs/SKILL.md`

逼问式访谈磨利这个活的目标与设计,顺带产出 ADR 与词表。**对齐完再动手**——
没对齐就写代码是这链最常见的翻车点。读它的正文照它问。

## 2. 实现 —— `/implement`

路径:`vendor/mattpocock-skills/skills/engineering/implement/SKILL.md`

按 spec/tickets 干活,内部走 TDD。它收尾会自己调 code-review——别替它调。

## 3. 评审 —— `/code-review`

路径:`vendor/mattpocock-skills/skills/engineering/code-review/SKILL.md`

双轴评审(规范轴 + spec 轴),并行子 agent,并排报告。有遗留就回 step 2。

## 收尾

干完提 MR(活自己的分支,正常提交 + `gh pr create` / `codehub-cli mr create`),
把 MR 地址打屏。**合并永远是人**(`gh pr merge` / `codehub-cli mr merge` 一律不许
执行);**最远到「评审中」**,「完成」永远由人点——主系统提示词的四铁律照守,
这份入口只讲怎么做,不讲那些。
