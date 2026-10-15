# Changelog

## 2026-10-15 新增（release skill：发布脚本化 + 版本描述规范 + 验收报告，#332）

- **变更类型**：新增（BW 开发方法资产）
- **变更摘要**：#332【v0.6|G1】把出包 → tag → release 上传的机械步骤落到 `config/scripts/release-win-workbench.mjs`（预演只读列阻断项 + `--publish` 授权发布 + `gh` 读回；叙事正文经 `--notes-file` 传入，**不用** `--generate-notes`，`--publish` 缺正文即拒绝）。定义 Workbench 专用**版本描述规范**（六节人话骨架：标题定位 / 下载与安装 / 这版有什么变化 / 升级后你可以这样用 / 验证到哪还没验到哪 / 来源；读者是升级试用的人与领导，按**用户认得出的功能**与**用户能走的流程**组织，**禁止**旅程编号 PJ/AJ/MJ/RJ/CJ、文件名、逐条 issue 号、六环 `●◐○` 矩阵进正文——特性树与注册旅程只作取材与查漏依据；取代 `--generate-notes` 的扁平 PR 罗列）与**验收报告规范**（六节人话、给领导看：这版想做成什么 / 实际交付了什么 / 目标达成程度 / 关键流程 / 工作完成情况 / 未达与下一步；结构参考 `docs/05-features/version-acceptance/showcase-v0.5-g1.html` 但不沿用其编号与矩阵），各配骨架模板。`version-report` 技能退役，版本收尾报告职责并入 workbench-release，出包统一到 `build:win:workbench`（不再指向已删除的 `.bw/release/*`）。新增验收点 R05（版本描述合规范）、R06（验收报告合规范）。tag 解析用自带 `parseWorkbenchReleaseTag`（Workbench rc 形态 `vX.Y.Z-rc.YYYYMMDD.N` 与 Orca 的 `-rc.N` 不同），仅复用 `create-draft-release.mjs` 的 `truncateReleaseBody`。
- **涉及文件**：
  - `config/scripts/release-win-workbench.mjs`（新增发布脚本）+ `config/scripts/release-win-workbench.test.mjs`（18 例单测：15 纯函数 tag 解析/资产核对/gh 参数/授权闸 + 3 守卫集成阻断项聚合）
  - `.claude/skills/workbench-release/SKILL.md`（重写为出包/发布/版本描述/验收报告四件事 + 脚本流程）；新增 `references/{release-notes-spec,acceptance-report-spec}.md`、`assets/{release-notes-template.md,acceptance-report-template.html}`
  - `.claude/skills/version-report/`（退役删除：SKILL.md / assets / references / scripts/report.py）
  - `docs/05-features/workbench-release/{intent,spec,STATUS}.md`（#332 增量 + 裁决 version-report 退役待人 gate）、`docs/05-features/README.md`（第 7 行 TDD ○→◐、R01–R06）、`src/renderer/src/workbench/INVENTORY.md`、`package.json`（`release:win:workbench`）
- **验证**：`release-win-workbench.test.mjs` 18/18 过；`typecheck`、`oxlint`（新脚本 + 测试）、`check:readme-local-links` 过；改动文档相对链接 0 断链；`grep version-report` 除 `.bw/planning/v0.4` 历史归档与「已退役」说明散文外归零。**真实发布与验收报告产出（RJ01/R05/R06）留白**：需本机 Windows 出包 + `gh` 登录 + 人授权，属人跑，STATUS 记 ○/◐ 不预填通过。

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
