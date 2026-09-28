# Orca BW 窗口布局调查证据

这些截图全部是修前调查截图，不能作为本次修复后的视觉验收。

- 调查工作树基线：`1b34cba5edb0def3b64cdd0f334cc0786bf75c17`（v0.5 已合入）。
- 修复源码提交：`b677464890804a2613b22be8a78eb3ac30e6643f`。
- 环境：Windows，实际 Electron 窗口；截图对应逻辑视口约 `1280 × 802`，设备缩放比 `1.25`。原生窗口尺寸和 DOM 几何见对应 JSON。
- 截图使用隔离的调查 profile 与 Git 仓库；项目墙中的「布局调查项目」不是用户的真实项目列表。
- 调查截图没有独立绑定 renderer 运行时的 Git 提交；上述基线来自调查工作树。不可将它们视为对某提交的完整真壳验收。
- 截图和 DOM 测量没有验证 OS 拖窗、双击标题栏、最小化、最大化、关闭。

## 修前观察

| 屏幕 | 执行路径 | 修前观察 | 证据 |
|---|---|---|---|
| 总览 | BW 侧栏 → 总览 | 1280 宽时尚未触发 1120px 整页上限；调查另测 1536 宽，侧栏 280、内容槽 1256、页面内容 1120，右侧差额 136。1536 测量未保留独立截图。 | `before/overview-1280.png` / JSON |
| 版本计划 | BW 侧栏 → 计划 | 左侧有 Orca 顶部条，中心缺标题栏；「版本计划」贴窗口上沿。 | `before/plan-1280.png` / JSON |
| 版本验收 | BW 侧栏 → 验收 | 中心同样缺标题栏。 | `before/acceptance-1280.png` / JSON |
| 任务 | BW 侧栏 → 任务 | 截图记录现有标题栏与内容布局。 | `before/tasks-1280.png` / JSON |
| 自动化 | BW 侧栏 → 自动化 | 中心缺标题栏。 | `before/automations-1280.png` / JSON |
| 知识库 | BW 侧栏 → 知识库 | 外围填满内容槽；阅读正文存在局部行宽限制。 | `before/knowledge-1280.png` / JSON |
| 执行 | BW 侧栏 → 执行 | 截图记录 Orca 原生终端工作区。 | `before/terminal-1280.png` / JSON |
| 项目墙 | BW 侧栏 → 项目墙 | 全窗口覆盖层遮住原有外壳；页面按钮与固定窗口按钮重叠。调查中正常点「关闭」被「最大化」按钮拦截。 | `before/wall-1280.png` / JSON |

## 修复后的静态和测试证据

`validation/final-tests.log` 对应修复源码树：相关 Vitest 共 2 个文件、6 项测试通过。提交时 Husky / lint-staged 执行 oxlint、ReactDoctor、oxfmt，通过；`git diff --check` 通过。

`validation/renderer-build.log` 记录本机 renderer 构建因内存分配失败而中断；不能记为构建通过。广域 typecheck 和构建没有得到通过结论。

## 待补验

用户因本机内存不足明确要求暂停此处真壳启动；不再在这台机器启动 Electron。修后截图、全屏幕双宽度矩阵、侧栏展开/收起、原生拖窗及窗口按钮行为均尚未完成。接入项目页和设置等原生入口的完整覆盖也未完成；macOS / Linux 未验证。

后续应在资源充足的机器上检出修复提交或已协调的集成提交，使用隔离 profile，以 `pnpm run dev:workbench` 启动；覆盖实际存在的所有顶层入口，至少两种逻辑宽度（含大于旧上限的宽度），记录构建版本、逻辑尺寸、DPI、侧栏状态，再补修后截图与 OS 行为结果。计划屏原型和高保真由其他窗口负责，本次不修改。

本证据分支 `shots/codex/orca-window-layout` 永不合入；PR 中图片链接固定到该分支的提交 SHA。
