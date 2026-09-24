# BW 项目适配

> 30 秒导读：给治理 BW 知识的执行者读取。只映射目标路线、资料职责和证据边界，不承载产品设计、开发规矩或迁移进度。目标分支的知识归属、入口或验证方式变化时，同步本篇与 [bw-scan.json](bw-scan.json)。

## 先认准路线

同一个仓里有两条技术路线：`bw-orca` 是 Orca Electron 执行核上的产品叠层，是当前主要工作分支；`main` 是另一条 Rust 路线。开工前核对仓根、分支与 HEAD、远端和 PR base，再读该树的 AGENTS、docs 地图和 `ref/upstream.md`。

- 新分支从 `bw-orca` 拉，PR 的 base 也是 `bw-orca`；需要 `main` 的历史意图时按固定提交读，不合并过来覆盖目标树。
- 两条路线的命令、实现结论和验收证据不能互换：开发命令和门禁读当前 AGENTS、package.json 与 `.github/workflows/pr.yml`，壳与出包入口读 `src/renderer/src/workbench/SYNC.md`；Rust 的 `.bw/release/verify`、suite 和 WebView2 深链不是 Electron 的验证设施。
- Orca upstream 与 BW origin 先核对 URL，不把 `origin/main` 当成 Orca 上游。

## 四类资料与落点

| 职责 | 入口 | 编辑边界 |
|---|---|---|
| BW 产品知识 | README、CONTEXT、docs/README；docs/01-principles、architecture、06-module、在用的 05-features | 原则慢变；目标、规格、当前实现和验证各有来源，不用旧代码推翻已认可意图 |
| Orca 工程参考 | ref/upstream.md 及按需主题 | 解释执行核的工程边界；随上游同步，不复制成第二套 BW 产品规格 |
| 本仓开发方法 | AGENTS、CLAUDE、.claude/skills/ | AGENTS 是开发规矩，Skill 是执行方法；不自动接入桌面或向外分发 |
| 产品分发资产 | standard/ | 供被管项目使用；文件存在、实际派发、模型遵守分开验证；改开发方法不顺带改它 |

视觉按 `docs/04-design-system/` 与 `docs/hifi/` 的现行约定读取；归别人负责的区域只报告影响，不擅改。

## 退役与保留

- `docs/02-adr/`、`docs/03-guide/`、`docs/metrics.md` 等在 bw-orca 上已按决定清空或删除，不因旧链接、旧清单或 main 上的版本而恢复，也不建占位文件；有内容时按原则 01 在对应层新建。
- `docs/05-features/` 里保留的特性目录只是可定位的材料，不证明六环齐全或迁移完成；不从 main 搬旧矩阵、旧绿灯或旧 STATUS。

## 迁移时证据分列

迁移时在现有 spec、STATUS 或 PR 里把四类来源分开：用户目标与已认可决定（intent/spec 与认可记录）、当前实现（目标树的提交与源码）、当前验证（同平台同版本的执行证据）、历史证据（固定来源提交与当时平台）。任何一类都不能推出另一类，比如旧平台通过不代表 Electron 已通过，已认可的目标不代表旧交互仍适合 Orca。旅程、边界和验收的取舍交回 [workbench-start](../../../workbench-start/SKILL.md)，知识整理只同步已经确定的部分。
