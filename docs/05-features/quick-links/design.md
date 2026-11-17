# design — 与「端口」同构的「常用链接」入口复用与落点（quick-links）

> **状态：设计建议草案（2026-11-13），随原型一起供评审。** 为什么做读 [intent.md](intent.md)，目标行为读 [spec.md](spec.md)。此篇只给「复用哪些现成能力、代码落在哪、怎么存」，不是已定实现设计；评审确认后再落地。

## 一、复用清单（优先复用，不重建）

| 能力 | 现成落点 | 本特性怎么用 |
|---|---|---|
| 状态栏入口与挂载 | `components/status-bar/StatusBarSurface.tsx`（`:255` 处与 `PortsStatusSegment` 并列挂载）、`use-status-bar-controller.ts`（`showPorts` 等可见项）、`StatusBarVisibilityMenu.tsx`（`toggleStatusBarItem`） | 在 `PortsStatusSegment` 旁挂 Monica 自有 `QuickLinksStatusSegment`；在 `StatusBarItem` 枚举与可见项里登记新项（如 `quick-links`） |
| 面板外壳与行结构 | `components/status-bar/PortsStatusSegment.tsx`（Popover 触发 + `PopoverContent side="top" align="end"` ~24rem、头 `icon+标题+计数`、体 `max-h` 滚动）、`ports-status-popover-rows.tsx`（行 `grid` + hover 动作簇 + 地址次行） | `QuickLinksStatusSegment` 直接照此结构：触发段（图标+计数）、popover 头、可滚动行区、分组头、行内 hover 动作（打开/复制/编辑/删除） |
| 在内置浏览器打开 | `store` 的 `createBrowserTab(worktreeId, url, { activate: true })`；端口打开链 `lib/workspace-port-actions.ts` 的 `openWorkspacePortInBrowser` + `resolvePortOpenInOrcaBrowser`（`Shift+Ctrl`/`⇧⌘` → `window.api.shell.openUrl`） | 抽一个薄 `openQuickLinkInBrowser({ worktreeId, url, event })`：普通点击 `createBrowserTab`；修饰键走 `shell.openUrl`。**不新造浏览器通道** |
| i18n | `translate(...)`，词条在 `en.json` 等 | 入口标题、按钮、空态、错误提示走 `translate`，其余语言回退英文 |
| 服务/端口识别 | Orca 端口扫描（`local-workspace-port-scanner` / `WorkspacePortScanner` 30s 共享轮询） | **不接、不改、不重复**。常用链接与端口扫描完全隔离 |

## 二、落点（已定：状态栏入口 + popover，与端口同构）

- **入口**：新增 Monica 自有 `QuickLinksStatusSegment`（图标 + 条目数），挂在 `StatusBarSurface` 里 `PortsStatusSegment` 相邻处（`:255` 附近），沿用其 `compact`/`iconOnly` 传参；点击弹出自己的 popover，`side="top" align="end" sideOffset={8}`、`w-[24rem]`，与端口面板互斥（同一时刻只开一个）。这是人 2026-11-13 评审确定的方案，取代先前「右栏子分区 / 独立窗口」。
- **可见项**：在 `StatusBarItem` 枚举（`src/shared/ui-chrome-types.ts`、RPC 参数 `client-ui-params.ts`）与默认可见项、`StatusBarVisibilityMenu` 里登记新项，使其与端口一样可开关。
- **面板内容**：参考 `ports-status-popover-rows`——分组头（项目名 + 计数）+ 链接行（名称主、地址次、点击整行在内置浏览器打开、hover 动作簇 复制/编辑/删除）+ 空态。产品界面内不写说明性注释文案。
- **目录**：组件本体放 Monica 自有目录（如 `src/renderer/src/monica/quick-links/`），对上游文件的改动只在 `StatusBarSurface` 的一处最小挂载 + 枚举登记，降低上游同步冲突面，并在 [ref/upstream.md](../../../ref/upstream.md) 记差异。

## 三、数据与持久化（项目级，本地零业务数据库）

- **原则**：遵守本仓「本地零业务数据库」，用项目级小 JSON 文件，**不用 sqlite**。参考既有项目级落点（`.bw/project.toml`、`.bw/milestones.json`、`.bw/planning/<版本>/` 材料链）。
- **格式**：项目根下 `.bw/quick-links.json`：
  ```json
  {
    "schemaVersion": 1,
    "links": [
      { "id": "ql_xxx", "name": "内部设计规范", "url": "https://design.internal/docs" }
    ]
  }
  ```
- **读写链（已实现）**：**复用既有 `window.api.fs` 桥**（`pathExists`/`readFile`/`createDir`/`writeFile`，按 `connectionId` 兼容 SSH），渲染端 `quick-links-store.ts` 直接读写；**不新增主进程 store、不新增 IPC**（fs 桥已对工作区路径鉴权）。坏文件/版本不符视为空列表并保留原文件不覆盖，避免误删。持久化失败保留内存态并提示，不假装已保存。
- **「项目」口径（已定）**：按当前激活仓库（`useActiveRepo` 的 `path` + `connectionId`）决定文件归属，切项目即切文件；打开时复用该项目的 `activeWorktreeId` 调 `createBrowserTab`。
- **改动前建议 vs 落地差异**：早期设想「新增薄主进程读写（照 `version-document-store`）」，实现时判断 fs 桥已足够且更贴合「优先复用、少加上游耦合」，故采用渲染端 fs 桥方案。

## 四、明确不做

- 不建端口扫描 / 服务识别 / 停止进程（Orca 已有）。
- 不给链接探活、健康检查、状态灯、自愈（无信号，不造假绿；避「收藏夹病」）。
- 不做书签分类树 / 标签 / 导入导出 / 跨项目全局聚合（v1 边界）。

## 五、与原型的关系

[prototype.html](prototype.html) 是纯前端演示假体：数据在内存、刷新重置；「打开」只弹提示、不真开浏览器。它用于确认布局与交互，不代表能力已交付；真实持久化与打开链以落地实现与真壳证据为准。
