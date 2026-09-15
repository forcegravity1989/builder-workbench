# SKILL.md 正文规范

> 适用于 `standard/skills/<slug>/SKILL.md`。写或改技能前读本文件。
> 结构来自 skill-md-spec(frontmatter + 8 节正文 + 纪律表),叠上本仓分层:SYSTEM / reference / skill 各写一层,现在只写到第一层(转得顺)。
> 优先参考 superpowers `writing-skills`:能让另一个 agent 按步骤跑通,不靠经验补缺。

索引:`AGENTS.md`「三层模型」→ [`../README.md`](../README.md)「各写什么」→ 本文件 → 各份 `SKILL.md` 第 4 节才是 SOP。

## 〇、适用边界

| 场景 | 怎么走 |
|---|---|
| **新 skill / 按规范重写** | 按本文件全章节建(frontmatter + 8 节 + 纪律表) |
| **存量小修**(断链、description 措辞、 sidecar) | 只补那一处。不重排章节、不顺手改叙事 |

本轮周期工作技能是按规范删掉重写,走第一行。`mr-review` 尚未编进注入链,不改。`vendor/` 里业界正文不改;本仓只写入口 `mattpocock-skills`。

不在 skill 下另开 `references/` 去复述 `standard/system-prompt/references/`。格式正本已经在那里,开工时按任务注入。

## 一、frontmatter

```yaml
---
name: skill-name-with-hyphens
description: Use when [具体触发条件]
---
```

- `name`:只用字母、数字、连字符。等于目录名,也是 `skill_slug` 认的名字。
- `description`:**只写何时用,不总结步骤。** agent 看得到 description、正文要自己打开;写成流程摘要就会只跟着 description 走(SDO 反模式)。
- 总字符数 ≤ 1024;`description` 建议 < 500 字符。
- 可选:`disable-model-invocation`、`allowed-tools`、`metadata`。本仓周期工作技能按 Issue 的 `workflow` 派发,不靠模型自触发,前两项一般不写。
- 不要用 `category:` 当触发条件(旧字段,新写不必)。

### description 质量

公式:**一句身份(WHAT)** + **何时用(WHEN)** + **必要时一句边界**。WHAT 不是步骤清单。

| 风险 | 样子 |
|---|---|
| 过宽 | 抢别的 skill 触发 |
| 过窄 | 永远加载不到,等于没有 |

正例:`Use when 更新指标与版本计划 Issue 开工(标题以「更新指标 + 制定版本计划」开头,或 workflow=更新指标与版本计划)。别处不用。`

反例:`复盘上周、补齐指标、确认版本、交流出版本目标……`(这是流程总结)

## 二、正文 8 部分(按顺序)

```markdown
# <slug>：<一句话标题>

## 1. 核心目标
<1-3 句:做什么、产出什么、不做什么。读者读完知道边界>

## 2. When to Use / When NOT to Use
<触发:症状/关键词/场景。与 description 互补——description 给索引,本节给读正文的人>
<不触发:明确边界,避免误用>

## 3. 前置依赖检查
<环境/文件/上游 skill/sidecar。没有就如实说,不编一本>

## 4. 标准执行流程
<SOP。每步:目的 + 动作 + 产物。分叉写明。每步开头说走到哪。一次只问人一件。人没点头不落仓、不建卡>

## 5. 参考资源
<列出要读的文件,每条一句话何时读。禁止把格式表抄进来>

## 6. error_handling
<表格:现象 → 原因 → 处理。含何时停、何时降级>

## 7. 示例
<1 个好例子:输入 → 动作 → 输出。不要多语言稀释>

## 8. 纪律表
<必须 / 禁止 / 越界信号 / 你不做的事。全场纪律听 SYSTEM,这里不复述>
```

**第 4 节就是 SOP。** 不写在 README,不写在 description。

## 三、长度与冗余

- 主体 < 500 词。超长 = 把 reference 抄进来了,或纪律/示例堆重复。
- 每节只说一次。交叉引用,不复述。
- 渐进披露:字段/标题/标签字面在 `system-prompt/references/`;skill 只点名。

## 四、anti-patterns

- ❌ 叙事故事(「在某次会话我们发现……」)
- ❌ 同一个例子写五种变体
- ❌ flowchart 节点里写代码
- ❌ 步骤名叫 step1 / helper2
- ❌ `description` 总结流程
- ❌ 复述 SYSTEM 纪律(待评审 / 只开 MR / 用用户的提交技能)
- ❌ 复述 reference 字段表、评论三标题字面
- ❌ 替人定北极星、版本目标、纳入清单
- ❌ `PROJECT.md`、新写 `bw:week`、连接器、V3 对照长文
- ❌ 打分表、质量门、四段 gate、代填正本(第二层,现在不写)
- ❌ 机械规则在两处各写一份(双源漂移)

## 五、判据

好的 `SKILL.md` 应能**机械执行**:另一个 agent 读完第 4 节能按步跑通,不需凭经验补缺。遇到「这段只能靠模型意会」= 越界,把事实挪到 reference,或把步骤写具体。

第一层目标:**人能跟着模型把这场走完,中途不迷路。** 每步报走到哪。一次问一件。结论(指标、版本、纳入)人定。

## 六、和别的文档的边界

| 文档 | 承载 |
|---|---|
| 本文件 | 以后怎么写 skill |
| `SKILL.md` | 这场怎么跑(第 4 节 = SOP) |
| `standard/system-prompt/SYSTEM.md.tmpl` | 哪个 Issue、读 `AGENTS.md`、加载哪份 reference、全场纪律 |
| `standard/system-prompt/references/*.md` | `.bw/` / 评论 / 标签 / 健康信号,界面认什么 |
| 被管仓 `AGENTS.md` | 那个项目怎么干 |
| 本仓 `AGENTS.md` | Workbench 开发规矩 |
| `docs/06-module/系统提示词与渐进加载.md` | 怎么注入与维护对照；写作分层正本仍在 `standard/README.md` |

`SKILL.md` 不承载:项目级设计、跨仓开发规矩、版本演进、业界 vendor 正文。

子技能只写被点名的那一站。入口只点名,不把子技能正文抄进来。

## 七、写完检查清单

- [ ] `name` 合规,与目录名一致
- [ ] `description` 以 `Use when` 起首,只写何时用,不总结流程
- [ ] `description` 不过宽、不过窄,有触发边界
- [ ] 正文 8 节齐全、顺序对
- [ ] 第 4 节每步有目的 + 动作 + 产物;分叉写明
- [ ] 主体 < 500 词
- [ ] 详细格式只点 reference,没内联抄表
- [ ] 无叙事故事;示例只有一个
- [ ] 纪律表含「你不做的事」,且不抄 SYSTEM
- [ ] 过时词已删(`PROJECT.md` / 新写 `bw:week` / 连接器)

## 八、本仓不适用(对照来源 §九)

来源里的编排器补遗(派发 `agent.md`、状态机脚本、S1–S7)是另一条产品线的做法。Workbench 周期工作技能**不派发独立 agent 文件**:子技能用相对路径点名,步骤写在被点名的那份 `SKILL.md` 第 4 节。不绑模型层级。
