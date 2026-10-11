# Changelog

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
