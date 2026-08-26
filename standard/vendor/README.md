# standard/vendor/ — vendor 进仓的业界技能库

buddy 默认给被管项目带的 workflow(构建类 `mattpocock-skills`)的**原样副本**。vendor 进仓,而不是让用户自取——默认就该 buddy 打包统一管理(见 `docs/architecture.md` 的「系统提示词与渐进加载」模块:打包未实现,这里先备好源)。

## 两个库(均为 MIT,原 LICENSE 原样保留)

| 目录 | 上游 | 版本 | 版权 | 技能数 | 用途 |
|---|---|---|---|---|---|
| `mattpocock-skills/` | https://github.com/mattpocock/skills | 1.2.0 | Copyright (c) 2026 Matt Pocock | 41 | **build 阶段默认 workflow**(grill-with-docs → implement → code-review) |
| `mohit-pm-claude-skills/` | https://github.com/mohitagw15856/pm-claude-skills | main@`f508142` (2026-08-04) | Copyright (c) 2026 Mohit Aggarwal | 2 | 指标框架两件(北极星/指标树),部分 vendor |

两个库都是 MIT 许可,允许再分发,条件是保留版权声明与许可全文——各自目录下的 `LICENSE` 是上游原件,**不要删、不要改**。技能正文一字未改:这是副本,不是 fork。

`mohit-pm-claude-skills/` 是**部分 vendor**——上游是数百个通用 PM/生活技能的大型库(与"指标"关注点多数无关),只挑了 `metrics-framework` 与 `metric-tree-builder` 两件。

## 为什么 vendor(它解决的真实问题)

默认 workflow 不能写成"指向某台机器的插件缓存目录"——别人 clone 跑不起来。vendor 进仓,路径按 `CARGO_MANIFEST_DIR` 解析,任何机器都成立。**这是"默认带、开机即用"的前提**。

## 现状(如实)

**打包机制未实现**——buddy 还没把这些 vendor 库摊进自己的资产目录、注入提示词(issue-policy 默认值已诚实化,不指向没打包的)。这里先备好源,full bundle 是后续 subagent 任务(见 `docs/architecture.md` 的「没建什么」)。proto-design(原型阶段默认 workflow)的源**还没 vendor 进来**——也是 gap。

## 诚实的局限

这是某一时刻的快照,不自动跟上游同步。上游发新版后这里仍是旧版,直到有人手工重新 vendor 并更新上表版本号——要的是"clone 即可复现同一份数据",代价是会落后于上游,有意的取舍。
