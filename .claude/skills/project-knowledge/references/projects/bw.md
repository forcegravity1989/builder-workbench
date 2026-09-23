# BW 项目适配

> 30 秒导读：给治理 BW 知识或适配开发方法的执行者读取。这里只映射目标路线、资料职责和证据边界，不承载产品设计、开发规矩或迁移进度。目标分支的知识归属、入口或验证方式变化时同步本篇与扫描映射。

## 先识别目标路线

核对目标仓根、分支/HEAD、远端 URL 与 PR base，再读该树的 AGENTS、docs 地图和 `ref/upstream.md`。Skill 的加载目录仅定位方法；另一工作树的内容不是本次业务工作目录。并行任务记录所用版本，不覆盖别人的未提交内容。

`bw-orca` 是 Electron/Orca 叠层；`main` 是另一条 Rust 路线，按需用固定提交读历史意图或方法来源，不合并来覆盖目标树。两者同属 BW 也不能互换命令、实现结论或验收证据。Orca upstream 与 BW origin 先核对 URL，不把 `origin/main` 默认解释为 Orca 上游。

开发命令和门禁读当前 AGENTS、package.json 与 `.github/workflows/pr.yml`；壳与出包入口读 `src/renderer/src/workbench/SYNC.md`。按当前实现定位 `tests/e2e/`、`tests/playwright.config.ts` 和受影响 Vitest，不能将 Rust 的 `.bw/release/verify`、suite 或 WebView2 深链当 Electron 验证设施。

## 四类职责与实际落点

沿用一套 BW 产品知识，加按需 Orca 工程参考；下表是编辑路由，不重新设计知识库 UI 分类，也不声明这些文件已全部被模型加载。

| 职责 | 目标仓中的入口 | 编辑与验证边界 |
|---|---|---|
| BW 产品知识 | README、CONTEXT、docs/README；docs/01-principles、architecture、06-module、实际在用的 05-features | 原则慢变；产品目标、规格、当前实现和验证各有来源，不能用旧代码推翻已认可意图 |
| Orca 工程参考 | ref/upstream.md 及按需主题 | 解释执行核工程边界；核对对应源码/协议与上游版本，不复制为第二套 BW 产品规格 |
| 本仓开发方法 | AGENTS、CLAUDE 导入、.claude/skills/workbench-start 与 project-knowledge；当前构建/测试/CI | AGENTS 是开发规矩，Skill 是执行方法；本包不自动接入桌面或向外分发 |
| 产品分发资产 | standard/README.md 与其实际系统提示词、references、skills | 供被管项目使用；文件存在、实际派发/加载、模型遵守分开验证。改开发方法不顺带改 standard |

视觉知识按 `docs/04-design-system/` 和 `docs/hifi/` 的现行约定读取。受保护或归别人负责的区域只报告本次影响，不擅改；全景扫描可读不等于拥有编辑权限。

指标按目标任务需要核对实际定义与采集协议，不因旧分支示例恢复缺失配置，没数据就是 Unknown。候选口径不直接写正式定义；知识治理不替产品实现采集器、加载/保存、来源选择或演示数据接线。

## 清理、迁入与新判断

职责与格式尚未对齐的治理，按 [评审流程](../review-workflow.md) 提供 HTML 决策报告。用户已经明确批准的范围直接实施；不要重做相同审批。原文头部、原则 01 与 AGENTS 决定正文可写什么，Skill 类型契约只是候选写法。

目标分支的删除决定按真实计划/PR 与工作树核对。已批准退役的 `docs/02-adr/`、`docs/03-guide/`、`docs/metrics.md` 或特性目录不因旧链接、扫描清单和历史方法而恢复，也不为保留空目录造占位文件。有价值且仍适用的内容先找现有正本，职责扩展按已有授权处理；历史从固定 Git 提交追溯，不复制一套新归档。

`docs/05-features/` 中保留的 `reviewer-agent/`、`version-planning/` 只是可定位的材料，不证明六环齐全、平台迁移完成或产品特性全集已确定。不要从 main 搬旧矩阵、旧绿灯或过去的 STATUS；实际处理某特性时再按目标分支原则 02 补链。

迁移时在现有 spec/STATUS/PR 分开记录：

| 对象 | 要保留的来源 | 不能据此推出 |
|---|---|---|
| 用户目标与已认可决定 | intent/spec 及人的认可记录 | 所有旧交互/实现仍适合 Orca |
| 当前实现 | 目标工作树提交、源码与真实读写方 | 目标行为正确或已被人验收 |
| 当前验证 | 同平台/版本/环境的用例与执行证据 | 未运行环节、其他版本或价值效果通过 |
| 历史证据 | 固定来源分支/提交、旧报告及当时平台 | Electron 已通过；旧目录必须带回 |

迁移中的旅程、边界和验收取舍交回 [workbench-start](../../../workbench-start/SKILL.md)；知识整理只同步已确定部分，不提前启动迁移实现。周一屏旧 HTML 方案仅按需追溯 [历史参考](../../../workbench-start/references/week-screen-v04.md)，不能覆盖当前原生三屏。

## 扫描与交接

[bw-scan.json](bw-scan.json) 遍历目标树实际存在的 docs、ref 和两个开发 Skill。它不维护退役文件清单，不要求恢复目录；`selected-path-missing` 只是选定范围缺失的观察。HTML/TOML 仅列资产，读取方、标题锚点和语义另查。

在原任务/PR 记录旧内容去向、头部边界与授权、检查结果、跨范围遗留和方法反馈。纯方法/文档修改报告静态与脚本检查，不伪造桌面或模型行为成绩。依赖知识基线 PR 时明确先后，待人合入后纳入实际目标基线，再复核路径、适配、示例和扫描；未集成不可称下一迁移阶段已就绪。
