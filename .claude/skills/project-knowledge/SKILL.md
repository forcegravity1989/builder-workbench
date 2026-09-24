---
name: project-knowledge
description: >-
  Keep a project's knowledge base small, right and fresh. Scan Git hot spots
  and knowledge signals, apply the deletion / drift / trade-off tests, present
  ranked optimization candidates as an HTML report, then fix one block at a
  time together with its references. Use for 知识库治理、定期扫描、文档瘦身、
  逐篇整改、记录取舍、清理过时或重复的文档. Ordinary coding only syncs the
  knowledge it touches; it does not start a scan.
metadata:
  version: 0.5.0-pilot
---

# 项目知识库治理

> 30 秒导读：用三条检验看每篇文档——**删除测试**（删掉它，会不会有人再问起）、**漂移检验**（这个精确细节会不会悄悄过期）、**取舍检验**（读者问「为什么不那样做」时有没有答案）。两种模式：**扫描**产出候选报告交人挑，**整改**一次做完一块。原则正本在目标仓（BW 是[原则 01 §0](../../../docs/01-principles/01-document-organization.md)），本包只提供做法和工具。

## 先认准目标树

动手前核对仓根、分支与 HEAD、远端和 PR base，再读该树的 AGENTS 与文档地图。Skill 从哪个目录加载只说明方法来源，不决定在哪棵树上工作；同一仓的不同分支可能是不同技术路线，命令、实现结论和验收证据不能互换。BW 的路线与资料落点见 [BW 适配](references/projects/bw.md)。

## 三条检验

| 检验 | 问什么 | 常见处置 |
|---|---|---|
| 删除测试 | 删掉这篇或这段，同样的知识会在别处被重新问出、重新写出吗？ | 不会且没人读 → 删；只是转述别处 → 并回正本、留链接；会 → 留下，补好头部让它能被找到 |
| 漂移检验 | 这是会随代码或运行变化的精确值吗（计数、清单、PR 号串成的状态、读数、行号）？它的正本在哪？ | 改写成心智模型加取数方式或链接；协议值、命令这类契约值保留并注明来源 |
| 取舍检验 | 读者会问「为什么不那样做」吗？答案写了吗？ | 补一句「选 A 不选 B，因为……；代价是……」；难回头的写 ADR；原因不明就查 Git/PR 或问人，不编 |

三条检验都服务于同一个目标：文档少而深，每篇接口小（头部说清给谁、何时读、管什么）、独有价值多。字数只是成本的旁证，不是质量分；约束、原因与取舍不能为了变短删掉。

## 模式一：扫描 → 候选报告

定期或在用户说「扫一下知识库」时使用。完整步骤、报告格式和误报说明见 [扫描流程](references/scan.md)。

1. **定范围**：用户给了方向就用；否则用 Git 热点——近期改动多的代码区域和文档优先。
2. **收信号**：运行扫描脚本，得到热点、没人链接、超长、重复、漂移细节、缺取舍、断链等信号。信号只是线索。
3. **读原文**：对热点和信号涉及的文档读原文，套三条检验，并对照代码现状，把线索变成候选。
4. **出报告**：写一份仓外 HTML，每个候选一张卡，标**强 / 值得探索 / 推测**，末尾给首选推荐。
5. **交人挑**：问「先做哪一项？」。人挑之前不改文件。
6. **记否决**：人否决某项且理由以后用得上，把理由写进目标文档的取舍段或 ADR，下次扫描不再重提。

## 模式二：整改一块

人挑中的候选，或用户直接点名「整改某篇」时使用。一块 = 一篇主文档加必要的关联件，一个 PR 交付。

1. **读依据**：目标树的 AGENTS、知识原则、目标文档头部、入站引用和实际读取方；查工作树有没有并行修改。
2. **逐段处置**：用三条检验判断每段的去向，写法按[文档契约](references/document-contracts.md)中对应类型。

   | 处置 | 什么时候 | 同步做什么 |
   |---|---|---|
   | 保留 | 必要、准确、放对了地方 | 去掉重复说法，约束与来源留着 |
   | 合并 | 同一事实多处维护 | 定唯一正本，其他地方改成链接 |
   | 迁移 | 有价值但放错了地方 | 优先放进已有正本，改入站引用，删旧正文 |
   | 删除 | 过时、无独立价值或已有可靠替代 | 确认没有读取方依赖；历史从 Git 找回，不另建归档 |
   | 归档 | 历史决定仍需追溯 | 标明当时状态与现行替代，退出默认读取路径 |

3. **同步引用**：入口索引、链接、章节引用（包括「见某篇某节」这类普通文字）、示例和读取这些内容的代码。
4. **验证**：对改过的 Markdown 跑链接检查；涉及命令或行为的按影响实际验证；没做的写明未验证。
5. **交付**：PR 附一张处置表——原段落 | 处置 | 去向 | 验证 | 遗留。结论回正本，过程留 PR，不另建台账。

用户只要评审时只给发现、不改文件；确定的小修（一条断链、一个错字）直接修，不出报告。

## 不做什么

- 不做全库一次性重写；一次一项，合入后再扫下一轮。
- 不删必要约束：铁律、授权边界、协议值、人才能做的决定。
- 不为扫描零告警改写正确的文档；信号误报就调映射或脚本。
- 候选报告、扫描信号是投影，不当第二份正本，也不在里面维护任务状态。
- 不恢复已按决定退役的目录或文件，也不为保留空目录造占位文件。

## 工具

需要 Node.js 与 Git；都只读，输出必须在目标仓之外。

```text
node <本Skill>/scripts/scan-knowledge.mjs --root <目标仓> --profile <映射.json> --out <仓外目录> [--days 90] [--check]
node <本Skill>/scripts/check-links.mjs --root <目标仓> --file AGENTS.md --file docs/README.md
node --test <本Skill>/scripts/check-links.test.mjs <本Skill>/scripts/scan-knowledge.test.mjs
```

扫描输出 `signals.json`（全量）和 `signals.md`（给人看的摘要）；`--check` 只在断链或读取失败时返回 1。链接检查只看本地文件链接和 `@` 导入，锚点、外链、HTML 不查。BW 的映射是 [bw-scan.json](references/projects/bw-scan.json)；其他项目复制后按自己的目录改。

## 方法怎么进化

真实任务里出现误判、多余打断或漏改引用时：项目事实错了修项目，做法错了修本包，检查误报修脚本或映射；然后在[固定案例](evals/cases.md)里补一条能复现的案例，PR 写明依据并升版本号。没有新偏差就不改，不为「每轮都有反哺」硬加规则。

## 来源

做法借自 Matt Pocock 的技能：[improve-codebase-architecture](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md)（热点定范围 → HTML 候选卡 → 挑一项质询 → 否决理由留档）、[codebase-design](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)（深模块与删除测试，这里用在文档上）、[domain-modeling](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)（ADR 一段话，只在难回头、没有上下文会让人意外、确有取舍时写）。使用文档按 [Diátaxis](https://diataxis.fr/) 的读者需要组织。
