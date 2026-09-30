# Changelog

## 2026-09-30 修复（workbench 材料保存 CLI 通道全量被拒）

- **变更类型**：修复
- **变更摘要**：修复 `bw materials save`（acceptance 工作流、CLI 通道）必然失败的缺陷。根因：`material-human-guard.ts` 的 `assertHumanFieldsUntouched` 把含 `expectedRevision`/`document` 的完整保存参数直接传给 read 回调，而存储层 read 路径用 strict 的 `VersionMaterialReadSchema` 校验入参，两个保存专属键被报为 `Unrecognized keys`，导致 CLI 通道所有验收材料保存（含不含人工签字段的正常保存）全部被拒。修复为剥离保存专属键后再调用 read。人工结论字段保护（preparationReview / results[].decision 禁经 CLI 写入）语义不变。
- **涉及文件**：
  - `src/main/workbench/material-human-guard.ts`（剥离 `expectedRevision`/`document` 后再传 read）
  - `src/main/workbench/material-human-guard.test.ts`（新增回归测试：guard 传给 read 的载荷必须能通过 strict `VersionMaterialReadSchema`）
- **验证**：`vitest run src/main/workbench/material-human-guard.test.ts` 全过；重建 `out/main` 后经 CLI 实测 `bw materials save --create` 成功落盘并 `read` 回读一致。
