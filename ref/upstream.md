# Upstream Orca — 同步说明

> **本篇维护约定**
> - **读者与时机**：在 `bw-orca` 分支上合并 / rebase upstream Orca、排查二次开发冲突时读取。仓外会话从 [AGENTS.md](../AGENTS.md) 的任务表进到这里。
> - **职责与边界**：只记 upstream 仓身份、本分支相对 upstream 的删/藏/迁、从 Workbench `main` 合入了什么、以及明确的遗留；不写 Workbench 产品正本（那在仓根与 `docs/`）。
> - **更新触发**：换 upstream 基线、增删叠层钩子、再删/迁文档或源码、或遗留项落地时更新。

## Upstream 仓

| 项 | 值 |
|---|---|
| GitHub | https://github.com/stablyai/orca |
| 默认远程名 | `origin` |
| 本分支基线 commit | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`（`fix(automations): stop tick latency counting against the missed-run grace (#20819)`，2026-09-15） |
| 本仓分支 | `bw-orca`（由本地 `workbench` 二次开发叠层落成） |

拉取更新：

```bash
git fetch origin
git merge origin/main
# 或：git rebase origin/main
```

冲突取舍见下文「同步注意事项」。

## 本分支相对 upstream 删 / 迁了什么

### 源码：Orca Mobile 产品（已从本分支删除）

相对基线仍保留桌面执行核；**手机 App 与桌面「Orca Mobile」产品页已从 git 删掉**，不是隐藏：

| 处置 | 路径 | 说明 |
|---|---|---|
| **删除** | `mobile/` | Expo / iOS / Android 客户端整树 |
| **删除** | `src/renderer/src/components/mobile/` | 桌面 Mobile 页（配对 Hero / QR / 安装）。模拟器设置不再引用这里的品牌图标，否则设置页整页加载失败 |
| **删除** | `MobileSettingsPane`、侧栏「Orca Mobile」入口、mobile CI workflows | 设置里的手机安装页、导航、发版流水线 |
| **未删（协议残留）** | `src/shared/mobile-relay-*`、`mobile-e2ee-*`、`DeviceScope`、session 镜像、emulator | 桌面远端配对 / 驱动 overlay / 模拟器仍走这些线；不是手机 App |

合并 upstream 时：不要把 `mobile/` 或 Mobile 页重新合回来。协议文件若 upstream 改了，优先取 upstream，除非叠层已摘钩子。

### 文档（本轮 `bw-orca` 落仓）

产品文档已换成 **Workbench `main`**（导入时 tip：`25f38bc80211f9656e229ef31b0e5a10ae28226a`），正本在仓根 `AGENTS.md` / `CONTEXT.md` / `README.md` / `CLAUDE.md` 与 `docs/`。

从 upstream Orca 文档树中：

| 处置 | 路径 | 说明 |
|---|---|---|
| **保留 → `ref/`** | 原 `docs/reference/**`（约 40 篇） | upstream 工程参考，便于对照协议与平台边界 |
| **保留 → `ref/STYLEGUIDE.md`** | 原 `docs/STYLEGUIDE.md` | UI 叠层仍可能要对照 Orca 设计约束；勿与 Workbench `docs/04-design-system/` 混为正本 |
| **删除（不进本分支）** | `docs/site/**`（~123） | Orca 对外文档站 |
| | `docs/assets/**`、`docs/readme/**` | README 多语言与营销素材 |
| | `docs/relay-region-correction/**`、`docs/review-evidence/**` | 专项工程笔记 / PR 证据 |
| | `docs/agent-skill-sharing-implementation-checklist.md`、`docs/workbench-transformation-plans.html` | 清单与历史改造页 |
| | 根目录原 Orca `AGENTS.md` / `README.md` | 已由 Workbench 同名正本替换 |

`.gitignore` 中旧的 `docs/**` 白名单已去掉，改为跟踪整棵 Workbench `docs/` 与 `ref/`。

### 产品面（Workbench 壳二次开发，非删源文件）

代码仍在仓内；壳开启时（`WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1`）通过 `isWorkbenchShell()` **隐藏或绕过**，不是从 git 删除 upstream 目录：

| 取舍 | 落点 |
|---|---|
| 独立「会话 / 配置」导航不建 | `src/renderer/src/workbench/` 四屏导航 |
| Feature wall 营销向导尽量跳过 | 壳路由 / bootstrap |
| 左栏 Artifacts / Skills 并列入口收起 | `WorkbenchSidebarNav` 等 |
| 项目导航不再重复设置 / 帮助 | `WorkbenchSidebarNav`。壳里只留侧栏底栏那一对；Orca 底栏菜单不改 |
| 知识库文档清单各大类默认可收起 | `KnowledgeDocsGuide`。项目约定在最上，其次 Agent 入口；每个大类默认折叠，点标题展开。分类与地图顺序不改 |
| Orca Mobile 产品页 / Expo App | **已删除**，见上文「源码」；不是隐藏 |
| 崩溃「发送诊断报告」弹窗关闭 | `RecoverableRenderErrorBoundary` + `AppRootSurfaces` |
| 叠层 UI / 皮肤 / 计划·总览·知识库·项目墙 | `src/renderer/src/workbench/**` |
| 任务页工具条收成一行 | `task-page/ListChrome.tsx`、`github/ModeControls.tsx`、`github/Filters.tsx`、`ProviderFilters.tsx`、`Content.tsx`、`SidebarTaskNavButton.tsx`。壳开启时不渲染来源条和侧栏「任务」上的来源小图标，去掉 Projects。Issues / PRs、范围预设、Filters 仍在同一行，中间用分隔线隔开。Orca 原任务页不改 |
| 品牌 / 独立 profile / 打包 | `workbench-product.ts`、`dev:workbench`、`build:mac:workbench` |

细节清单见 `src/renderer/src/workbench/INVENTORY.md`、`SYNC.md`。

**未删的 upstream 执行核**（合并时优先保 upstream，除非叠层钩子）：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、`src/main` runtime。

## 从 Workbench `main` 增加了什么

| 类别 | 落点 | 状态 |
|---|---|---|
| 产品文档正本 | 仓根 `AGENTS.md` / `CONTEXT.md` / `README.md` 与 `docs/` | 已换入 |
| 壳叠层（Orca 上新写，非 Rust 直译） | `src/renderer/src/workbench/` | 已在本分支 |
| **`standard/`（系统提示词 / skill / templates）** | 仓根 `standard/` | 已从 `main` 合入。计划页新开会话注入 `SYSTEM.md.tmpl` 与 week-planning 指针；main 上 `crates/bw` 的 `ensure_*` / `agent_system_prompt` 全量注入仍未在 Electron 复刻。 |

叠层留在 `src/renderer/src/workbench/`，不要另开 npm / workspace 包。`standard/` 合入后仍是内容目录（提示词与技能），不是运行时包。

## 同步注意事项

**先读仓根 [AGENTS.md](../AGENTS.md)**（Workbench 开发约定：任务读取路径、四铁律、文档维护、门禁与交付）。本文件不重复那些规矩；这里只补 **Orca upstream ↔ 本分支** 的合并纪律：

1. **文档冲突**：`docs/`、`AGENTS.md`、`CONTEXT.md`、`README.md`、`CLAUDE.md` → 以 Workbench 产品正本为准，不要用 upstream Orca 文档盖回来。upstream 工程说明只进 `ref/`。
2. **`ref/`**：可随 upstream `docs/reference/**` / `STYLEGUIDE.md` 增量更新；新增篇目放 `ref/`，并在本文件补一行。不要把 `ref/` 拷回 `docs/`。
3. **叠层外源码冲突**：`src/renderer/src/workbench/**` 以外 → 优先取 upstream；本分支只保留 `isWorkbenchShell()` 一类一行钩子。
4. **叠层内冲突**：`workbench/**` 与挂载钩子 → 取本分支 / 手合。
5. **不要**把 `.omc/**`、本机 profile、`dist/` / `out/` 打进产品提交。
6. 日常热加载：`REMOTE_DEBUGGING_PORT=9337 pnpm run dev:workbench`（见 `SYNC.md`）。Agent 自动化再加 `ORCA_BACKGROUND_LAUNCH=1`。

合并后建议：

```bash
pnpm run dev:workbench
# 冒烟：总览 / 计划 / 知识库 / 项目墙；计划页 week-plan 会话仍钉在专用会话
```
