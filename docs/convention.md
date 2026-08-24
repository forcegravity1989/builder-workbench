# convention.md — 规范与赋能模型

> **30 秒导读**:这是 buddy 给被管项目推的规范模型,也是 buddy 自己仓该长成的样子(dogfood)。三来源两路径 + 顶层文档集 + 边界 + buddy 自身符合度。给接手任何部分的人和 AI 看。改这份 = 改规范,过评审再合。`DESIGN.md` 指向它。

## 1 · 三来源两路径(buddy 给被管项目的赋能)

buddy 给一个项目赋能,走两条路径,信息落点分清:

### 路径 A · 轻量(不走会话)
**规范铺底**(运作活③)把 buddy 资产写进 `.bw/`,无 agent、无系统提示词。buddy 在活自己的 worktree+MR 里写,人主分支一个字节不碰。

`.bw/` 下的件(模板在 `standard/`):
| 件 | 是什么 |
|---|---|
| `PROJECT.md` | 项目名片(想做什么/对标/北极星/信息) |
| `metrics.toml` + `metrics/*.toml` | 指标定义(北极星 + 滞后/引领写法) |
| `issue-policy.toml` | 活的约定:开工工具声明 + 类别→工具→workflow 默认映射 + 评审/节律/看板 |
| `standard.toml` | 规范清单:铺的版本 + 启用/扩展大类 |
| `managed.toml` | 指纹清单,对账用 |
| `scripts/*` | 采集脚本 |
| `design/` | 设计产物目录说明 |
| `project.toml`、`sessions/`、`metrics/readings.jsonl` | 运行时(不铺) |

### 路径 B · 走会话
挂了 workflow 的活开工,agent 在活的工作区里跑。每次注入:
- **系统提示词**:`docs/buddy/system-prompt.md` 的三段静态(身份/铁律/规范索引)+ 运行时注入第四段剧本(issue 正文 + 挂的 workflow)。**不论哪个 workflow 都被这层兜住 buddy 统一要求**——要加"所有项目原型的 buddy 统一要求",加进提示词/渐进加载,不加进 workflow 本身。
- **渐进加载**:`standard/skills.rs` 把自带 10 份 skill `include_str!` 进二进制,开工时摊到 buddy 自己的资产目录 `<asset_root>/skills/`,提示词只给名字+一句话+路径,正文 agent 按需读。

**产出落点(路径 B)**:
- 顶层文档(README/AGENTS/CLAUDE/CHANGELOG)→ **project-handbook** 管(buddy 管 set,问人才写,从仓真读,MR);
- dev 过程件(CONTEXT/adr/spec/ticket)→ **workflow** 自己产;
- `.bw/` 永远路径 A,不进会话。

## 2 · 顶层文档集 + 边界

| 文件 | 谁写/维护 | 是什么 | 边界(不写什么) |
|---|---|---|---|
| `README.md` | project-handbook 式 | 项目入口 + 怎么跑 | 不放设计、不放铁律 |
| `AGENTS.md` | project-handbook 式(问人/从仓真读) | **唯一开发规矩正本**:怎么建/跑/测(每条命令真跑过)+ 门禁(以 CI 为准)+ 顶层目录导览 + 项目特有规矩 | 不重抄 `.bw/`;buddy 推给被管项目时"注入不写进仓"的铁律不写进用户的 AGENTS.md(走提示词) |
| `CLAUDE.md` | — | 一行 `@AGENTS.md` 导入 | 不放实质内容 |
| `CONTEXT.md` | grill/domain-modeling 式 | 领域术语表 | 只术语,不写实现/选型 |
| `CHANGELOG.md` | 开发 | 版本变更记录:本次合入了什么 | 不写为什么(动机进 `docs/adr/`) |
| `DESIGN.md` | 开发 | 设计指向:各模块设计、workflow 自带文档指过去 | 指路不重抄设计 |
| `docs/adr/` | grill/domain-modeling 式 | 架构决策,难回头一条一篇(决策+为什么+后果) | 不写流水账 |
| `docs/modules/` | 开发 | 每个特性模块一份自足设计(见下) | 模块边界清楚,便于不同人领不同模块 |
| `.bw/` | 规范铺底(无会话) | buddy 资产 | 人主分支不碰 |

## 3 · 特性模块自足设计(`docs/modules/`)

每个特性模块一份 `docs/modules/<slug>.md`,固定结构:**是什么 / 代码在哪几层(文件:行)/ 数据落哪 / 依赖什么 / 产出与验证 / 没建什么**。不同人凭一份模块设计接手该模块。清单见 [`docs/modules/`](modules/README.md)(16 份)。归口与边界切线见 [`docs/modules/README.md`](modules/README.md) §边界切线。

## 4 · 默认 workflow 的处置

issue-policy 默认 build→`mattpocock-skills`、原型→`proto-design`、可换 superpowers。**默认 workflow 是 buddy 默认给用户准备的,应打包进 buddy 统一管理**(像自带 10 份 skill 一样摊到资产目录,开机即用),不丢给鱼塘/外部自取。**现状(如实)**:打包未实现——`standard/skills/` 只含 buddy 自带 10 份,不含 mattpocock/proto-design;issue-policy 默认值已诚实化(不默认指向 buddy 没打包的东西)。full bundle 留后续单独做。

## 5 · 三条贯穿的规矩

1. **最远只到「评审中」**:agent 干完提 MR,完成永远是人点的那一下(Done 入边仅 InReview,`can_transition_to` 守卫)。
2. **不许伪造数据**:指标读数只能来自真实采集;采不到如实说;信号只能从数据派生,无数据=Unknown≠绿(代码里无 `set_signal`)。
3. **决策在仓库里不在聊天里**:跨会话只认 `AGENTS.md`+`CONTEXT.md`+`docs/`+`CHANGELOG.md`+`DESIGN.md`,不凭上一会话口头结论改代码。

## 6 · buddy 自身符合度

buddy 自己的仓按这套规范摆:`AGENTS.md` 是唯一开发规矩正本(吸收原 CLAUDE.md 实质)、`CLAUDE.md` 一行 `@AGENTS.md`、`README`/`CHANGELOG`/`CONTEXT`/`DESIGN` 各守边界、`docs/modules/` 16 份自足设计、`.bw/` 是 buddy 自己作为被管项目的资产。V3 六 crate 冻结在仓里(判据没满足、不删),`docs/skills/`+`docs/buddy/` 是 V3 编译资产随 V3 一起冻结/删——做 buddy MVP 工作时 V3 不是权威,别 grep 它当事实源。详见 `AGENTS.md` 的 V3 备注。
