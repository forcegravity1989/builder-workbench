# Plan · 项目规范知识库(milestone:分批活清单)

> **30 秒导读**:这是什么——本次变更的**实施计划件**,即这个 milestone 的分批施工清单(改哪些文件/顺序/风险/什么算做完)。给谁看——规格 gate 过后按批施工的会话、审 PR 的人。现在作数吗——**待规格 gate 过后生效**;按 `principles/01`,本篇默认不进人 gate(未命中大风险清单:不动数据、不扩权限、不改对外契约),规格认过即可开工。

## Milestone 分批(每批一张活、一个 PR)

| 批 | 活标题(幂等键) | 交付 | 依赖 |
|---|---|---|---|
| KB1 | 知识文档总账进规范 | `standard/templates/knowledge-catalog.md`(正文 = spec §3)+ 铺底/对账登记 + `standard/VERSION` 抬位 + `standard/README` 清单行 | 规格 gate |
| KB2 | 资产盘点吃总账出体检 | `standard/skills/asset-audit/SKILL.md` 加体检段(逐件判据命令、三态口径、评论表格式 = spec §4)| KB1 |
| KB3 | 缺口自动建活 | 剧本建活规则(幂等标题「补 <文件名>」/「<正本名>回填」,查开着的同名活)+ BW 自狗食跑一轮留证据 | KB2 |
| KB4 | 新鲜度进过程指标 | `process-catalog.md` 补「设计正本更新间隔」条目(能算的给脚本,暂缓的写等什么);手册修正频次已有,只补互指 | KB1 |
| KB5 | 手册回路对齐(#123) | 与既有活 #123(错两次进手册)互指收口:体检引用其结论,不重查;若 #123 未施工,本批注明等它 | KB2 |

活按 `AGENTS.md` 标签词表建在 codehub/GitHub;**建活动作留给规格 gate 过后的会话或人**(本篇只定清单,不趁写计划先斩后奏)。

## 改哪些文件(汇总)

```
standard/templates/knowledge-catalog.md     新增(KB1)
standard/VERSION                            抬位(KB1)
standard/README.md                          模板清单补行(KB1)
standard/skills/asset-audit/SKILL.md        体检段 + 建活规则(KB2/KB3)
standard/templates/process-catalog.md       新鲜度条目(KB4)
crates/bw/src/standard/*                    仅当铺底登记需要(KB1;倾向零 Rust,复用既有模板机制)
changes/spec-knowledge-base/                本产物链四件
```

## 顺序与风险

1. KB1 先行——总账是唯一口径正本,剧本与指标都引用它。
2. **风险·剧本膨胀**:asset-audit 正文变长,超注入护栏 → 渐进加载已兜(提示词只给路径);若单文件过长,体检段拆支撑文件(技能是文件夹,`CONTEXT.md`「技能」词条)。
3. **风险·判据误报**:新鲜度阈值(默认 4 周)在总账里、人可改;体检三态里「未查到」独立成态,不冒充缺口。
4. **风险·与铺底机制的缺口**:脚本/总账落进已接入项目的机制与过程指标包共用同一个待接缺口(见 `changes/process-metrics/plan.md` 风险 4)——KB1 不解这个缺口,新项目走铺底、老项目随规范升级对账,升级流程未建就先手动铺(如实标注)。
5. **风险·标准过重**:地板件锁 7 类不再加;想加新件必须回本 spec 过规格 gate,不许剧本里私加。

## 完成的定义

R1–R5(见 `spec.md`)全绿;五批活全走完(或明确砍掉并记偏差);BW 自己仓的体检表挂在真实运作活②评论里可读回。
