---
name: orca-boundary-review
description: >-
  Review the current Orca/BW boundary on a user-configured periodic run. Read the
  current BW repository first, compare only relevant public Orca changes, and
  propose stable documentation updates for human decision. Do not use for
  ordinary BW implementation work or automatic synchronization.
metadata:
  version: 0.1.0
---

# Orca/BW 边界周期复核

> 30 秒导读：这是给用户配置在 Orca Automation 中周期运行的复核方法。它先读当前 BW，再核对 Orca 的公开版本和变化，只输出与 BW 边界有关的候选；人决定后，才把采纳的稳定结论写回现有正本。它不执行代码同步，不自动改代码，不关闭 Issue，也不把未采纳事项写成仓内待办。

## 适用时机

- 用户配置的月度、版本周期或重大 Orca release 后复核。
- 需要判断 Orca 的公开变化是否影响 BW 当前同步边界。

不要在普通 BW 问题处理中触发本 Skill。日常工作只看当前 BW 仓库和真实调用链，不因不确定上游而等待上游。

## 固定读取顺序

1. 核对当前仓根、分支、HEAD、工作树状态和目标仓权限；不覆盖已有未提交内容。
2. 读取 [AGENTS.md](../../../AGENTS.md)、[ref/upstream.md](../../../ref/upstream.md)、[docs/architecture.md](../../../docs/architecture.md) 和 [SYNC.md](../../../src/renderer/src/workbench/SYNC.md)。
3. 按候选影响范围读取对应的 `docs/05-features/` 正本和实际源码调用链。不要为了找变化全库重做无关盘点。
4. 读取 Orca 官方公开 release、changelog、roadmap、issue/PR；记录来源 URL、版本/commit 和核对日期。不能访问或无法确认时写 `Unknown`，不从旧快照推断当前状态。
5. 只比较会影响 BW 复用、薄挂载、provider/宿主路由、目录归属或同步冲突的变化。普通 Orca 产品新闻不进入 BW 文档。

## 输出格式

给人审的候选表只包含：

| 字段 | 内容 |
|---|---|
| Orca 变化 | release、commit 或公开变更的简短事实 |
| BW 关联 | 影响的现行正本、代码边界或同步取舍 |
| 证据 | 官方来源、仓内文件和实际调用链 |
| 建议 | 保持现状、更新已有正本、或需要人重新决策 |
| 影响范围 | 需要检查的入口、合并边界或验证方式 |

候选不等于决定。没有人采纳的候选只留在本次会话或用户指定的审核结果中，不写入 `ref/upstream.md`，不新建历史报告，不新增“待处理边界”栏目。

## 采纳后的落点

- 当前开发约束 → `AGENTS.md`。
- 当前 BW 产品能力和数据流 → `docs/architecture.md` 或对应特性正本。
- Orca 版本锚点、与 BW 有关的稳定差异和同步取舍 → `ref/upstream.md`。
- 叠层代码路径、运行入口和调试方式 → `src/renderer/src/workbench/SYNC.md`。
- 需要人重新定义的产品目标 → 对应特性的 `intent.md` / `spec.md`，先完成用户决定。

更新 `ref/upstream.md` 时覆盖当前快照字段，不追加月报；无效、重复或已被新正本吸收的旧记录直接删除，详细历史由 Git 追溯。

## 禁止事项

- 不把 `origin/main` 当作 Orca upstream，不在普通复核里拉取或合并上游代码。
- 不自动修改 Orca 源码、BW 运行时代码、分支、PR、Issue 或自动化设置。
- 不把完整 Orca release notes、完整源码目录树或所有上游 issue 镜像进 BW。
- 不用文件存在、静态扫描或 release 摘要冒充真实 Electron、远端、到点自动化或模型行为验证。
- 不把未核对、未采纳或已失效的内容写成当前规范。
