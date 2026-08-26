---
name: mattpocock-skills
description: Use when a build/optimize/ops活开工且挂了 workflow=mattpocock-skills——build 阶段默认 workflow,走 grill-with-docs→implement→code-review 的 SOP
---

# build 阶段默认 workflow:grill-with-docs → implement → code-review

这件活走 mattpocock-skills 的标准 build 链。先读完这份入口,再按下面的路径
去读下一步的 `SKILL.md`,照正文干,别跳步。

**`/xxx` 在这里的意思**:读本入口已经写明的那份文件。不是调 Skill 工具,
不是凭一个斜杠名去技能库里猜。叶子技能正文里还会再写 `/grilling`、
`/domain-modeling`、`/tdd`、`/code-review`——那些也按下面的路径读。

资产根 = 这份入口所在 `skills/` 目录的上一级。下面路径都相对资产根。

## 1. 对齐 —— grill-with-docs

路径:`vendor/mattpocock-skills/skills/engineering/grill-with-docs/SKILL.md`

逼问式访谈磨利这个活的目标与设计,顺带产出 ADR 与词表。**对齐完再动手**——
没对齐就写代码是这链最常见的翻车点。读它的正文照它问。

它正文会点到这两份,接着读:

- grilling:`vendor/mattpocock-skills/skills/productivity/grilling/SKILL.md`
- domain-modeling:`vendor/mattpocock-skills/skills/engineering/domain-modeling/SKILL.md`

## 2. 实现 —— implement

路径:`vendor/mattpocock-skills/skills/engineering/implement/SKILL.md`

按 spec/tickets 干活,内部走 TDD。它收尾会自己去读 code-review——别替它提前读。

它正文会点到 TDD,读:

- tdd:`vendor/mattpocock-skills/skills/engineering/tdd/SKILL.md`

## 3. 评审 —— code-review

路径:`vendor/mattpocock-skills/skills/engineering/code-review/SKILL.md`

双轴评审(规范轴 + spec 轴),并行子 agent,并排报告。有遗留就回 step 2。

## 收尾

干完提 MR(活自己的分支,正常提交 + `gh pr create` / `codehub-cli mr create`),
把 MR 地址打屏。**合并永远是人**(`gh pr merge` / `codehub-cli mr merge` 一律不许
执行);**最远到「评审中」**,「完成」永远由人点——主系统提示词的四铁律照守,
这份入口只讲怎么做,不讲那些。
