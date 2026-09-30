# Upstream Orca — 同步说明

> **本篇维护约定**
> - **读者与时机**：在 `bw-orca` 分支上合并 / rebase upstream Orca、排查二次开发冲突时读取。仓外会话从 [AGENTS.md](../AGENTS.md) 的任务表进到这里。
> - **职责与边界**：只记 upstream 仓身份、本分支相对 upstream 的删/藏/迁、从 Workbench `main` 合入了什么、以及明确的遗留；不写 Workbench 产品正本（那在仓根与 `docs/`）。
> - **更新触发**：换 upstream 基线、增删叠层钩子、再删/迁文档或源码、或遗留项落地时更新。

## Upstream 仓

| 项 | 值 |
|---|---|
| GitHub | https://github.com/stablyai/orca |
| BW 仓远程 | `origin` = `https://github.com/forcegravity1989/builder-workbench.git`；`origin/main` 是 Rust 路线 |
| Orca 远程建议名 | `orca-upstream`；需先核对 URL，不能把 `origin` 当作上游 Orca |
| 本分支基线 commit | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`（`fix(automations): stop tick latency counting against the missed-run grace (#20819)`，2026-09-15） |
| 本仓分支 | `bw-orca`（由本地 `workbench` 二次开发叠层落成） |

同步 Orca 前先检查 `git remote -v`；若 `orca-upstream` 尚未配置，添加为上表 Orca GitHub URL，已有同名远程则先核对身份。同步在从最新 `bw-orca` 创建的独立分支上完成并评审：

```bash
git fetch origin bw-orca
git remote get-url orca-upstream
git fetch orca-upstream main
git merge orca-upstream/main
```

这些是明确开展 Orca 升级时的步骤；`origin/main` 不能代替 `orca-upstream/main`。从 Rust main 带入特性或方法时做定向迁移和重新决策，不整支合并。

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

`.gitignore` 中旧的 `docs/**` 白名单已去掉，改为跟踪整棵 Workbench `docs/` 与 `ref/`。v0.5 准备阶段清空旧 ADR、指南及 metrics.md，特性只留 reviewer-agent 与 version-planning；历史从 Git 查，不在后续同步时自动恢复。设计系统与 hifi 由对应同事维护。

### 产品面（Workbench 壳二次开发，非删源文件）

代码仍在仓内；壳开启时（`WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1`）通过 `isWorkbenchShell()` **隐藏或绕过**，不是从 git 删除 upstream 目录：

| 取舍 | 落点 |
|---|---|
| 独立「会话 / 配置」导航不建 | `src/renderer/src/workbench/` 多屏导航（总览 / 计划 / 任务 / 验收 / 自动化 / 知识库） |
| Feature wall 营销向导尽量跳过 | 壳路由 / bootstrap |
| 左栏 Artifacts / Skills 并列入口收起 | `WorkbenchSidebarNav` 等 |
| 项目导航不再重复设置 / 帮助 | `WorkbenchSidebarNav`。壳里只留侧栏底栏那一对；Orca 底栏菜单不改 |
| 知识库文档清单各大类默认可收起 | `KnowledgeDocsGuide`。项目约定在最上，其次 Agent 入口；每个大类默认折叠，点标题展开。分类与地图顺序不改 |
| Orca Mobile 产品页 / Expo App | **已删除**，见上文「源码」；不是隐藏 |
| 崩溃「发送诊断报告」弹窗关闭 | `RecoverableRenderErrorBoundary` + `AppRootSurfaces` |
| 叠层 UI / 皮肤 / 计划·总览·知识库·项目墙 | `src/renderer/src/workbench/**` |
| 任务页工具条收成一行 | `task-page/ListChrome.tsx`、`github/ModeControls.tsx`、`github/Filters.tsx`、`ProviderFilters.tsx`、`Content.tsx`、`SidebarTaskNavButton.tsx`。壳开启时不渲染来源条和侧栏「任务」上的来源小图标，去掉 Projects。Issues / PRs、范围预设、Filters 仍在同一行，中间用分隔线隔开。Orca 原任务页不改 |
| CodeHub 评审 | 见下文「CodeHub」。不把 CodeHub 当成 GitHub Enterprise 或 GitLab |
| 壳内不加星弹窗 | `AppRootSurfaces`。`isWorkbenchShell()` 时不挂 `StarNagCard` / `StarNagToastHost` / `StarNagAgentValueMomentObserver`。设置里的 Star 与 GitHub API Budget 不动 |
| 品牌 / 独立 profile / 打包 | `workbench-product.ts`、`dev:workbench`、`build:mac:workbench` |

细节清单见 `src/renderer/src/workbench/INVENTORY.md`、`SYNC.md`。

BW 业务契约与材料服务分别位于 `src/shared/workbench/`、`src/main/workbench/`，宿主侧事务复用入口位于 `src/relay/workbench/`，RPC 方法注册在 `src/main/runtime/rpc/methods/workbench-{materials,metrics,history,archive}.ts`。叠层外以 RPC/CLI 注册和 relay 组合等薄挂载为主，例外是 `workbench/` 目录之外的 BW 业务文件：`src/cli/handlers/workbench-materials.ts` 与 `src/cli/specs/workbench-materials.ts` 是业务 handler（承载材料读写与校验，非纯注册），`src/cli/bundled-skill-guides.ts` 内嵌 BW 技能指南（由 `config/scripts/generate-bundled-skill-guides.mjs` 从 `standard/skills/` 正源生成，勿手改）。复用的原生执行与读取模块：runProcess / runWslProcess（进程与 WSL 执行）、prepareWorktreeCreateCheckout / readGitBlobAtOidPath（隔离检出与固定修订 blob 读取）、worktreeBasePath（工作树基址）、hostedReview.forBranch / repo.show（归档评审与仓库身份）、githubHostExecOptions / parseWslPath（GitHub 宿主执行选项与 WSL 路径解析）；落点为 `src/main/workbench/metrics/metrics-execution-core.ts`、`src/main/workbench/archive-evidence-runtime.ts`、`src/renderer/src/workbench/archive-port.ts`。复用原生身份、配对路由与 SSH 通道，具体业务不进入 Orca 工作树类。

**未删的 upstream 执行核**（合并时优先保 upstream，除非叠层钩子）：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、`src/main` runtime。

### v0.5 版本周期特性对 Orca 原生文件的扩点

以下改动均为薄挂载 / 扩展点性质，BW 业务不进 Orca 内核；合并 upstream 时保留这些扩点：

| 类别 | 落点 | 说明 |
|---|---|---|
| 壳槽位 | AppWorkspaceShell / sidebar/index | BW 下 artifacts 仅准备固定树，terminal 原生工作区旁挂 CycleWorkspaceShell 右板；原生项目列表保留（计划/验收同样显示，2026-09-29 CodeHub 适配批恢复）。原生 Terminal 保持唯一挂载，RightSidebar 全部复用。tab-bar-surface 的 BW 启动按钮薄挂载已撤除（2026-09-29 验收可用性批）：新建计划/验收入口在右板首行协作卡片，TabBar 恢复纯原生 |
| 原生历史面板 | AiVaultPanel / Header / VirtualList、ai-vault-session-row-actions | BW 专用 workspaceHost/onOpenSession 嵌入 props 已移除，直接复用原生侧栏；行级复制/打开/删除 handler 抽取仍由原生列表使用 |
| 打开自动化运行 | `components/automations/automation-run-workspace-action.ts` | 抽取 `openAutomationRunTerminal`，原生运行页与 BW 手动启动共用；按运行的真实 pane/PTY 聚焦，不创建替代会话。调用时保留工作树宿主身份，定时调度不调用此入口 |
| 自动化一次性运行上下文 | `shared/rpc-contract/automation-params.ts`（AutomationRunNow）、`shared/automations-types.ts`（AutomationDispatchRequest.oneShotPrompt）、`shared/protocol-version.ts`（automation.run-now-one-shot-prompt.v1）、`shared/automation-run-prompt.ts`、`main/runtime/rpc/methods/automations.ts` / `automation-schemas.ts`、`main/runtime/orca-runtime-automation-operations.ts`、`main/runtime/runtime-automation-controller.ts`、`main/automations/{service,refused-manual-run,headless-dispatch,headless-dispatch-runner}.ts`、`main/startup/main-process-automations.ts`、`renderer/hooks/automation-dispatch-handler.ts`、`components/automations/{automation-scoped-list-client,automation-capability-probe}.ts` | `automation.runNow` 增加可选 `oneShotPrompt`：只随本次运行在派发端与已保存提示合并为单次递交，不写回自动化记录；旧宿主会静默剥离该字段，客户端按 capability 门控并诚实报错。BW 用它把数据文件问题带入手动运行。合并 upstream 时保留该可选参数、capability 常量与两条派发路径（renderer / headless）的合并语义 |
| 开工链 | `launch-agent-in-new-tab` / `launch-ai-vault-session` / `launch-agent-web-host-tab` | `activate:false` 后台启动不抢页面、selectWorktree、hostTabId 透出 |
| 会话/终端类型 | `web-runtime-session-types`、`web-runtime-terminal-create-operation`、`activate-ai-vault-structured-session` 导出 | 结构化会话激活与终端创建操作扩点 |
| 自动化编辑器预填 | `AutomationEditorDialog`、`automation-editor-request`、`use-automation-editor-request`、`use-automation-create-destination` / `use-automation-draft-effects` / `use-automation-editor-actions`、`ui-slice-contract-core` / `ui-slice-view-actions`（openAutomationEditor）等 14+ 原生文件 | 特性批之前的提交 0e25e81b7（feat(automations): open the native editor with an explicit target，2026-09-25）落定 openAutomationEditor 显式 target/draft 契约；本分支 `version-cycle/use-cycle-automation-draft.ts`（「配置自动化」预填）依赖该契约。合并 upstream 时保留显式 target/draft 扩点与请求形状 |
| 任务详情与返回 | `task-page-source-context`、`use-task-page-detail-routing`、`use-task-page-provider-state`、codehub detail hook、`worktree-nav-view-history-replay`、`ui-slice-contract-core`（TaskPageData / openTaskPage options）、`ui-slice-task-actions`（tasks 哨兵跳过 / returnToPreviousView）、`worktree-nav-history`（codehub 变体） | 详情按来源返回走 openTaskPage 的 returnToPreviousView（跳过 tasks 哨兵回 BW 来源视图）；屏内上下文由 cycle-view-state 与 view-memory（sessionStorage）恢复。CodeHub 外部详情入口 / source context / history replay 接通 |
| 工作树元数据 | `runtime-managed-worktree-metadata`、`worktree-metadata-merge`、`src/shared/worktree/types.ts` / `meta-types.ts` | 承载 `workbenchSelectedVersion` 流程选版偏好；字段定义在 shared/worktree 的 types.ts 与 meta-types.ts |
| Git 历史窗口与分页 | `src/shared/git-history*`、`src/shared/rpc-contract/git-params.ts`、`src/main/runtime/rpc/methods/git.ts`、`src/main/ipc/filesystem/filesystem-git-status-handlers.ts`、`src/relay/git-handler-read-operations.ts` | git.history 增加可选 since / skip / revision，支持固定提交上的窗口分页；新增 committedAt（%ct），原 timestamp 保留作者时间。原有每页上限与未传新参数时的调用语义保留；合并 upstream 时保留解析及 IPC/RPC/relay 透传 |
| PR/MR 合入时间 | `src/shared/github/work-item-types.ts`、`src/main/github/client/map/work-item.ts` / `work-item-field-coercion.ts`、`src/shared/codehub-tasks.ts`、`src/main/codehub/work-items.ts` | GitHub CLI/REST 与 CodeHub MR 列表/详情透传可选 mergedAt；原缺失字段保持缺失，不用 updatedAt 代替。合并 upstream 时保留真实合入时间字段及映射，总览据此统计趋势 |
| WSL | `wsl-runner` | outputTruncated 透传 |
| Mobile 残留清理 | settings 死簇 20 文件删除、`settings-navigation-types` / `capability-sections` 移除 'mobile' key、i18n 单 key 修正；**2026-09-27 第二批（用户决策「不遗留」）**：showMobileButton 全链（`global-settings-types` / `default-global-settings` / app menu / IPC settings 白名单 / Appearance 项与搜索目录 / SidebarNav 谓词）、TopLevelView `'mobile'` 成员全链（`top-level-view` lookup、`client-ui-params` zod enum、right-sidebar-visibility、openMobilePage/closeMobilePage/previousViewBeforeMobile、hydration）、`mobile-page.css`、feature-interaction `'mobile-pairing'` 死 id、死 catalog 键剪枝（「362 键」为键名并集口径，各语言实删数不等：en≈365 / fr≈354 / es≈323，ja/ko/zh 与 es 接近）、死 locale 规则实测 ≈40+ 条（原记 29 条不准） | 活体保留：mobileClientTabSelectionsByDeviceId（client-session-tab-selection 活链）、MobileEmulator/emulator-pane、relay/pairing、`driver.kind==='mobile'`、设置页指活配对功能的 Relay 文案。合并 upstream 时 `'mobile'` 视图成员与 showMobileButton 以本分支删除为准 |
| 原生清理/去重 | `task-provider-identity-label.ts`（自 task-source-context-summary 抽出）、`automation-source-display.ts` / `automation-target-availability.ts`（getProviderLabel 收敛单一实现）、`task-providers.ts`（索引检查改 lint 合规写法） | 基线门禁债清理（824ae01be）中的行为不变重构；合并 upstream 时保留 provider 标签单一实现与身份标签抽取，不把重复实现合回来 |
| 配置 | `tsconfig.cli` include、`oxlint-dead-classes.json` 对 workbench 子树关闭 Tailwind 类审计（BW 自有 CSS 设计系统，与既有 feature-wall-* allow 同机制）、`reliability-gates.jsonc` 清 671 行死登记（4 条纯 mobile gate 删除、3 条混合 gate 修剪）、ci-shard-timings | 门禁登记与实际文件面对齐 |
| 门禁脚本 | `config/scripts/check-readme-local-links.mjs`、`config/scripts/audit-localization-coverage.mjs` | 前者把 `docs/readme/` 缺失视为「无翻译 README」而非 ENOENT 崩溃；后者新增目录级豁免机制（`config/localization-coverage-exclusions.json`，entry 必须带 pathPrefix+reason），合并 upstream 时保留 |

**遗留项裁决（2026-09-26 用户决策）**：`verify:localization-coverage` 对 BW 中文叠层的 457 个候选走目录级豁免（`config/localization-coverage-exclusions.json`，workbench 子树，条目必须带 reason；原生组件里的专名 `codehub-cli` 与 BW 壳侧栏「任务」标签走 allowlist 复核条目 2 条）；`check-readme-local-links` 已容错 `docs/readme/` 缺失（见「待迁移的工程边界」）；showMobileButton 死开关链、store `'mobile'` activeView 残留、MobilePane 死簇与 i18n 孤儿键按用户决策「不遗留」在本批删除（见上表 Mobile 残留清理行）。**仍登记的后续任务**：relay collect 信任面重推导（wire 只传 name+definitionHash，远端从 configurationCommit 重解 run；需 SSH 实机验证配套，见 `src/relay/workbench/metrics-handler.ts` 注释）。

### CodeHub（`codehub-cli`，任务来源与 GitHub / GitLab 并列）

CodeHub 是独立的 `TaskProvider`（`'codehub'`），和 GitHub、GitLab 同级。任务列表走 `codehub:listTasks`，调用 `codehub-cli issue list` / `mr list`。不挂在 `listWorkItems` 后面，也不等 GitHub 来源解析失败再降级。选中的仓库远程全是 CodeHub，且 `codehub-cli` 已装好时，任务页自动切到 CodeHub。壳里没有来源条，所以这一步必须发生在进 GitHub 列表之前。

CodeHub 不是 `HostedReviewProvider`，也不走 `gh` / `glab`。调用 PATH 上的 `codehub-cli`，不写死安装路径。缺命令时错误是 `codehub-cli is not installed or not on PATH`。主机按 `codehub`、`codehub.*`、`codehub-*`、`*.codehub.*` 识别（例如 `codehub-g.huawei.com`），不用裸的 `includes('codehub')`。GitHub.com 行为不改。

| 处置 | 路径 | 说明 |
|---|---|---|
| **新增** | `src/shared/codehub.ts` | `isCodeHubHost` / `isCodeHubUrl` / `isCodeHubGitRemote` / `parseCodeHubRemote`。嵌套项目路径保留，去掉 `.git`，拒绝 github |
| **新增** | `src/main/codehub/cli.ts`、`service.ts`、`issue-state.ts` | 使用 Orca 已登记的 `gitRemoteIdentity`，通过原生命令执行器调用 `codehub-cli`。与 gh/glab 一样，SSH 仓库的托管平台 API 在所属 runtime 调用，不使用远端路径作本机 cwd；WSL 沿用项目运行环境。关闭先评论原因再 close，评论失败不关闭；重开不写评论。不写 `bw:status:*` |
| **原生边界** | `src/main/github/issue-update.ts`、`project-view/mutations.ts` | 保持 upstream 的 GitHub 更新路径，不因另一个 remote 是 CodeHub 而切换平台。CodeHub 写入由自己的 service 承接 |
| **新增** | `src/shared/codehub-api.ts`、`src/main/ipc/codehub.ts`、`src/main/runtime/rpc/methods/codehub.ts`、`src/preload/codehub.ts`、renderer `lib/codehub-api.ts` | IPC 与 `codehub.*` RPC 使用同一参数校验和 service。桌面、Web/配对按原生 repo owner 路由，不进 `gh:*`；未知仓库、路径不符或非 CodeHub 身份在执行前拒绝 |
| **改调用** | `task-providers.ts`、任务页 `Content` / `ProviderFilters`、`use-task-page-codehub-loading.ts`、`use-task-page-provider-state.ts`、设置加载 | 来源 `'codehub'`。列表是 Issues / MRs。选中仓库全是 CodeHub 时自动切来源。旧配置的可见来源没有 `codehub` 时补一次，之后用户关掉就不再加回。手动改来源后不再盖回去。`en-runtime-required.json` 经官方工具再生成（824ae01be）：删 codehubNoLoadedMatches / codehubLoadedScope / codehubLoadMore 3 个 CodeHub 列表加载文案键，新增 `codehubDuplicateOf`（Detail 重复关闭占位） |
| **改调用** | `viewed-sync.ts` | CodeHub 的 PR 已读在发请求、toast、乐观更新之前直接返回 |
| **改调用** | `checks-panel/active-content.tsx` | CodeHub 不传 `onEditComment`、`onSetReaction`。评论仍可 list / create / delete |
| **改调用** | `HostedReviewActions.tsx`、`HostedReviewStateActions.tsx`、`CreateHostedReviewComposer.tsx`、创建评审的两处 hook、`empty-content*`、`commit-surface.tsx` | CodeHub 不提供草稿和 Mark ready。创建时草稿强制为 false。已是草稿的远端 MR 没有合并按钮；新建 MR 不会是草稿。关闭仍在 |
| **改调用** | `AppRootSurfaces.tsx` | 壳开启时不挂加星弹窗。崩溃「发送诊断报告」那一处原有的壳判断不动 |
| **改调用** | `preflight-api.ts`、`agent-detection.ts`、设置「集成 / 评审供应商」 | `PreflightStatus.codehub` 只有 `{ installed }`。探测顺序是 `git --version`、`gh --version`、`glab --version`、`codehub-cli --version`，然后才是 `gh` / `glab` 的 `auth status`。不探测 CodeHub 登录。卡片状态是 checking / available / not-installed，有 Re-check。功能墙的连接列表不加这张卡 |
| **新增** | `docs/03-guide/codehub-cli.md` | `codehub-cli` 用法短文。命令形状以本机 `--help` 为准 |

定向测试覆盖 GitHub 混合 remote 更新隔离、CodeHub 注册仓库与执行环境、RPC/客户端路由、列表加载范围；平台请求使用模拟边界，不能代替内部 CodeHub 实机验收。

任务页 CodeHub 的工具条跟 GitHub 同一行：Issues / MRs、项目、开放 / 我的（议题是分配给我，MR 还有待评审）、筛选条件、搜索、加号、刷新。开放对应 `--state opened`；我的对应 `issue list --scope assigned_to_me` 或 `mr list --scope created_by_me`；待评审对应 `mr list --scope need_my_review`。MR 搜索走 `--search`。列表按每仓 30 条开始，用已有 `--limit` 逐次加载更多，并多取一条判断截断；有未加载内容时明确标出搜索范围，不把已加载范围的空结果说成项目没有 Issue。点一行打开 CodeHub 详情，读取 view 与评论 list/create/delete。Issue 可改标题、按完成 / 不计划 / 重复关闭或重新打开；MR 可关闭。已读、表情、草稿和改正文仍未接入。

合并时保留独立 CodeHub provider 与薄挂载，GitHub 更新路径沿用 upstream。改预检探测顺序时，同步 `preflight-host-cli-status.test.ts` 的命令 mock 次序。

## 从 Workbench `main` 增加了什么

| 类别 | 落点 | 状态 |
|---|---|---|
| 产品文档正本 | 仓根 `AGENTS.md` / `CONTEXT.md` / `README.md` 与 `docs/` | 已换入 |
| 壳叠层（Orca 上新写，非 Rust 直译） | `src/renderer/src/workbench/` | 已在本分支 |
| **`standard/`（系统提示词 / skill / templates）** | 仓根 `standard/` | 已从 `main` 合入。计划/验收屏与「配置指标」开工注入渲染后 SYSTEM.md.tmpl 与对应 Skill 发现 Stub（week-planning / version-acceptance / metrics-refresh，投影在根级 `skills/`）；planning.py 等旧周一屏脚本已退役删除。main 上 `crates/bw` 的 `ensure_*` / `agent_system_prompt` 全量注入不复刻。BW 四技能（bw-knowledge-docs / metrics-refresh / version-acceptance / week-planning）已登记进原生 `resources/skills/current-manifest.json` 与 `snapshot-registry.json`（b41b4ca78），合并 upstream 时保留该登记 |
| reviewer-agent 召唤制 CI | `.github/workflows/claude-code-review.yml`、`.github/scripts/check-pr-review.mjs` | 2026-09-29 用户拍板迁入（main 将被 bw-orca 覆盖，独立评审机制不随覆盖丢失）。脚本原文照迁，回执路径兼容 main 现行触发定义；默认分支仍为 main 期间召唤走 main 定义、检出本分支 head 后跑本分支脚本，bw-orca 成默认分支后接管。改 workflow 的 PR 被防篡改校验跳过，首场真实召唤待合入后下一条合格 PR。明细见 [reviewer-agent STATUS](../docs/05-features/reviewer-agent/STATUS.md) |

BW 自有模块留在 renderer/main/shared/relay 各自的 `workbench/` 目录，不另开 npm / workspace 包；例外是 CLI 业务 handler 与内嵌指南生成（`src/cli/handlers|specs/workbench-materials.ts`、`src/cli/bundled-skill-guides.ts`、`config/scripts/generate-bundled-skill-guides.mjs`），位于原生 CLI 与 config 树内，见上文「产品面」。`standard/` 合入后仍是内容目录（提示词与技能），不是运行时包。

## 同步注意事项

**先读仓根 [AGENTS.md](../AGENTS.md)**（Workbench 开发约定：任务读取路径、四铁律、文档维护、门禁与交付）。本文件不重复那些规矩；这里只补 **Orca upstream ↔ 本分支** 的合并纪律：

1. **文档冲突**：`docs/`、`AGENTS.md`、`CONTEXT.md`、`README.md`、`CLAUDE.md` → 以 Workbench 产品正本为准，不要用 upstream Orca 文档盖回来。upstream 工程说明只进 `ref/`。
2. **`ref/`**：可随 upstream `docs/reference/**` / `STYLEGUIDE.md` 增量更新；新增篇目放 `ref/`，并在本文件补一行。不要把 `ref/` 拷回 `docs/`。
3. **叠层外源码冲突**：BW 自有 `workbench/` 模块以外 → 优先取 upstream；本分支只保留界面条件分支、RPC/CLI 注册及 relay 组合等薄挂载。上文扩点表所列条目（含自动化编辑器预填契约、CLI 业务 handler、原生清理/去重）为例外，合并保留要求以表内各行为准。
4. **叠层内冲突**：`workbench/**` 与挂载钩子 → 取本分支 / 手合。
5. **不要**把 `.omc/**`、本机 profile、`dist/` / `out/` 打进产品提交。
6. 日常热加载：`REMOTE_DEBUGGING_PORT=9337 pnpm run dev:workbench`（见 `SYNC.md`）。Agent 自动化再加 `ORCA_BACKGROUND_LAUNCH=1`。
7. **CodeHub**：任务来源、`codehub:*` IPC、预检和设置集成卡片冲突时，保留上文「CodeHub」里的分支。不要把列表塞回 `listWorkItems`。GitHub.com 仍按 upstream。不要把 CodeHub 收成 GitHub Enterprise 或 GitLab。

合并后建议：

```bash
pnpm run dev:workbench
# 冒烟：总览 / 计划 / 任务 / 验收 / 知识库 / 项目墙；计划、验收屏固定树会话仍按各自身份恢复
```

## 待迁移的工程边界

- `.github/workflows/docs.yml` 仍指向已删的 `docs/site`，交由 CI/CD 迁移处理，不能作为 BW 文档链已就绪的证据。（`config/scripts/check-readme-local-links.mjs` 已容错 `docs/readme/` 缺失，在本分支通过。）
- BW 的 CI/CD、独立评审与正式出包链需按 Electron 验证；源码中保留旧入口不代表已经可交付。
- `standard/` 的路径解析只覆盖部分入口，知识库分类、保存与工作树来源仍需在对应特性迁移时重新决策；当前行为边界见 [architecture](../docs/architecture.md)。
