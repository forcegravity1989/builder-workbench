# Changelog

## 2026-10-14 修复（preflight 预探测拦截 CodeHub 任务来源，探测瞬时失败被会话缓存固化）

- **变更类型**：修复（行为变更：任务来源可用性判定由 preflight 预探测改为调用时探测）
- **变更摘要**：正式版任务屏报「CodeHub 来源不可用……请显示 CodeHub 或安装 codehub-cli」，但设置开关已开、CLI 实际可用。根因：任务页生效来源列表在设置开关之外还要过 `preflightStatus.codehub.installed` 运行时过滤，而 preflight 探测（`execFile('codehub-cli', ['--version'])`）把「未安装」「跑不起来」「探测链故障」折叠为同一个 false 并缓存整个应用会话，启动瞬间的失败即固化成"未安装"，CodeHub 图标从来源选择器消失、自动切换被抑制。修复：删除 `TaskProviderAvailability.codehubInstalled` 维度，CodeHub 可用性由实际调用 codehub-cli 决定——CLI 缺失时自动切换照常发生，`runCodeHubCli` 的 ENOENT 分支（"codehub-cli is not installed or not on PATH"）经既有 `codehubError` 红条提示；设置开关与任务页生效列表归一。GitHub 模式横幅成因收敛为「设置隐藏」或「入口显式指定 GitHub」，文案去掉"安装 codehub-cli"、改为提示切换来源。设置面板的 codehub 安装徽章（`use-task-source-provider-readiness.ts`）保留为纯信息展示。
- **涉及文件**：
  - `src/shared/task-providers.ts`（`TaskProviderAvailability` 删 `codehubInstalled` 字段；`isTaskProviderAvailable` codehub 分支恒 true 并注明 lazy 探测原因）
  - `src/renderer/src/components/use-task-page-repo-selection.ts`（任务页来源过滤删 codehub preflight 维度及 deps）
  - `src/renderer/src/store/slices/ui/ui-slice-task-actions.ts`（`openTaskPage` 预取来源过滤删同维度）
  - `src/renderer/src/components/sidebar/SidebarTaskNavButton.tsx`（侧边栏默认来源解析删同维度）
  - `src/renderer/src/components/new-workspace/use-smart-workspace-field-availability.ts`（删凑类型的 `codehubInstalled: false`）
  - `src/renderer/src/components/task-page/github/List.tsx`（横幅注释与默认文案更新）
  - `src/renderer/src/i18n/locales/{zh,en,es,fr,ja,ko}.json`（`codehubSourceUnavailableHint` 文案收敛）
  - `src/shared/task-providers.test.ts`（过滤用例改造为验证 CodeHub 不再被运行时过滤；删 `codehubInstalled` 传参，不增执行例数）
- **验证**：`task-providers.test.ts` 11 例、受影响渲染层 4 套件 36 例全过；`typecheck`、`oxlint`、`oxfmt` 过。未验证：真壳 E2E（任务页 CodeHub 自动切换与错误红条）。

## 2026-10-13 修复（CodeHub 仓库停在 GitHub 任务列表时报错答非所问）

- **变更类型**：修复
- **变更摘要**：CodeHub 仓库（如 gtsllm-dfx）点进任务屏后，若 CodeHub 来源不可用（设置中被隐藏、或 codehub-cli 未装、或 `visibleTaskProviders` 被旧版本进程清洗），任务源停留在 GitHub，弹出「未检测到 GitHub 来源」——对 CodeHub 仓库答非所问（它本就没有 GitHub 来源）。修复：`selectTaskPageUnresolvedSourceRepos` 用 `isCodeHubGitRemote` 标记 CodeHub 仓库；GitHub 列表横幅对 CodeHub 仓库改报「CodeHub 来源不可用：该仓库是 CodeHub 项目。请在设置 → 任务中显示 CodeHub，或安装 codehub-cli」，并提供「打开设置」按钮直达任务设置面板（非 CodeHub 仓库保持原「未检测到 GitHub 来源」+ 重试不变）。
- **涉及文件**：
  - `src/renderer/src/components/task-page-cache-selectors.ts`（`TaskPageUnresolvedSourceRepo` 增 `codehub` 标记，selector 判定仓库 remote）
  - `src/renderer/src/components/task-page/github/List.tsx`（横幅按 `codehub` 分流：专属文案 + 打开设置按钮，替代无意义的 GitHub 重试）
  - `src/renderer/src/i18n/locales/{zh,en,es,fr,ja,ko}.json`（新增 `codehubSourceUnavailable`/`codehubSourceUnavailableHint`/`openTaskSettings` 三条文案）
  - `src/renderer/src/components/task-page-cache-selectors.test.ts`（扩展现有用例：CodeHub remote 标记 `codehub: true`，其余 `false`；不增执行例数）
- **验证**：`task-page-cache-selectors.test.ts` 全过；`typecheck`、`lint` 过（详见 PR）。

## 2026-10-10 新增（codehub-cli 执行观测埋点）

- **变更类型**：新增（可观测性）
- **变更摘要**：应用内曾出现一次 bw/project 已推、MR 未开出的失败，错误信息未留存，trace 只有 git.exec，codehub-cli 调用是盲区。为 `runCodeHubCli` 包一层 `withCodeHubSpan`（与 git.exec 同口径）：记子命令、参数个数、cwd，不复制参数值；失败经 span.fail 落 stderr 到 `main.trace.ndjson`。2026-10-10 开发壳内对真实 CodeHub 仓重试未复现（mr create 2190ms 成功已入 trace），后续按此观测。
- **涉及文件**：
  - `src/main/observability/instrumentation.ts`（新增 `withCodeHubSpan` + 子命令解析）
  - `src/main/codehub/cli.ts`（`runCodeHubCli` 包 span）
- **验证**：`typecheck:node`、`oxlint`、`oxfmt` 过；开发壳实跑 13 个 `codehub.exec` span（含 1 个失败 cause 落 trace：预读 404）。提交 `92015e6a8`。

## 2026-10-10 修复（CodeHub 仓接入项目读不到名片）

- **变更类型**：修复
- **变更摘要**：修复接入项目（克隆远端仓）点「下一步：基础信息」后 CodeHub 仓读不到项目名片、GitHub 正常的缺陷。根因：`codehub-cli project view --jq .default_branch` 输出 JSON 编码字符串（`"master"` 带引号），`viewCodeHubProject` 直接把带引号文本当默认分支传给 `repo file raw --ref`，触发 `404 Commit Not Found`，又被错误分类成 `absent`，UI 冒充「远端还没有名片」；GitHub 路径因 `JSON.parse` 正确解析而正常。修复为剥掉 `--jq` JSON 编码再当分支名，并把 `commit not found` 归入 `ref-missing`（「没查成」不冒充「没有名片」）。
- **涉及文件**：
  - `src/main/codehub/repo-reads.ts`（新增 `parseJqString` 剥 JSON 编码；`commit not found` 归 `ref-missing`）
  - `src/main/codehub/repo-reads.test.ts`（新增 5 例单测：--jq 编码解析、空/null 分支、裸 view 回退、raw 读参数序、commit-not-found 分类）
  - `docs/05-features/project-intake/STATUS.md`（环 4 证据回补、已知债 1 补预读侧实机验证记录）
- **验证**：TDD 红→绿（5/5）；codehub 相关 24 例全过；`typecheck:node`、`oxlint`、`oxfmt` 过；真实 CLI 端到端两个真实 CodeHub host（master/dev 分支）均 `adopted` 读到名片，GitHub 对照不受影响。

## 2026-09-30 修复（workbench 材料保存 CLI 通道全量被拒）

- **变更类型**：修复
- **变更摘要**：修复 `bw materials save`（acceptance 工作流、CLI 通道）必然失败的缺陷。根因：`material-human-guard.ts` 的 `assertHumanFieldsUntouched` 把含 `expectedRevision`/`document` 的完整保存参数直接传给 read 回调，而存储层 read 路径用 strict 的 `VersionMaterialReadSchema` 校验入参，两个保存专属键被报为 `Unrecognized keys`，导致 CLI 通道所有验收材料保存（含不含人工签字段的正常保存）全部被拒。修复为剥离保存专属键后再调用 read。人工结论字段保护（preparationReview / results[].decision 禁经 CLI 写入）语义不变。
- **涉及文件**：
  - `src/main/workbench/material-human-guard.ts`（剥离 `expectedRevision`/`document` 后再传 read）
  - `src/main/workbench/material-human-guard.test.ts`（新增回归测试：guard 传给 read 的载荷必须能通过 strict `VersionMaterialReadSchema`）
- **验证**：`vitest run src/main/workbench/material-human-guard.test.ts` 全过；重建 `out/main` 后经 CLI 实测 `bw materials save --create` 成功落盘并 `read` 回读一致。
