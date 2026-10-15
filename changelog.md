# Changelog

## 2026-10-15 新增（验收屏原型新增「出包」部分 · CodeHub/CloudDragon 变体高保真）

- **变更类型**：新增（原型）
- **变更摘要**：验收屏右半屏在「准备交付」与「展示验收」之间新增「出包」部分，并同步插入旅程轴第 4 节点。第一行为流水线名称下拉框（数据源 CloudDragon 流水线列表页，范围选「当前项目下的流水线」，原型内置 7 条真实抓取的流水线名，默认 gtsllm-dfx）+ 出包按钮（正式界面经 Playwright 同步点击 CloudDragon 对应行的出包按钮）；第二行为最新一条制品包信息（评审结论：验收只关心最终产物，不展示流水线执行历史），按验收屏既有行式组件语言排版——项目名称、版本号（行尾下载按钮）、创建时间、包文件，数据对齐 CloudDragon 制品仓库服务版本包页真实解析结果；下载按钮对应页面下载（正式界面先选目录，再经 Playwright 点击该版本的下载按钮保存）。旅程节点灯色随最新包有无推导（有包绿 / 无包灰）。
- **涉及文件**：
  - `docs/05-features/version-acceptance/prototype/package-panel.jsx`（新建：出包工具栏 + 最新包信息行组件，内置真实抓取的流水线名与制品包 mock）
  - `docs/05-features/version-acceptance/prototype/screen.jsx`（验收内容插入「出包」区块插槽）
  - `docs/05-features/version-planning/prototype/journey.js`（旅程轴插入「出包」节点，签名扩展 packageTone/packageHint）
  - `docs/05-features/version-planning/prototype/app.jsx`（LATEST_PACKAGE、triggerPackage/downloadPackage、灯色推导、stageGo 滚动锚点、传参）
  - `docs/05-features/version-planning/prototype/layout.jsx`（latestPackage/triggerPackage/downloadPackage 透传）
  - `docs/05-features/version-planning/prototype/style.css`（.package-sheet/.package-toolbar/.package-artifact 行式样式，对齐 delivery-row 组件语言）
  - `docs/05-features/version-planning/prototype/vendor.js`（末尾追加 lucide Download 图标组件，v8 快照未含该图标；受 build.cjs --check 依赖校验守护）
  - `docs/05-features/version-planning/prototype/build.cjs`（冻结依赖清单加 Download）
  - `docs/05-features/version-planning/prototype/runtime.js`（重建产物）
- **验证**：`node build.cjs --check` 通过（runtime 与源码一致 + monday/friday/overview 三屏合成 DOM 启动 + Download 依赖存在性校验）；真实 Chrome 交互验证 8 项全过（旅程 4 节点、7 个流水线选项、四行包信息与 2 个包文件、出包/下载点击提示、旅程节点高亮 + 灯色绿、无页面错误）。

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
