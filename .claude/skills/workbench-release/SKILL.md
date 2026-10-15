---
name: workbench-release
description: Use when 在 Builder Workbench 仓出 Windows Workbench 安装包、把它发布为 GitHub Release、写 Release 版本描述，或出版本收尾验收报告。普通开发、PR 交付和 Orca 官方 release-cut 不用。
---

# workbench-release：Workbench 出包 · 发布 · 版本描述 · 验收报告

## 1. 核心目标

Builder Workbench 的版本交付入口，一条技能覆盖四件事：**出包**（Windows 安装包）、**发布**（授权后建 GitHub Release）、**版本描述**（Release 正文按规范写，不用 `--generate-notes`）、**验收报告**（版本收尾的叙事报告）。出包不等于发布；没有用户明确授权时不创建远端 Release、不打 tag。本技能是 **Workbench 专用**，不写成通用发布模板；已退役的 `version-report` 技能职责并入此处。

## 2. When to Use / When NOT to Use

- 用户说「出包」「打 Windows Workbench 包」→ 出包流程。
- 用户说「发版本」「发布 Release」→ 发布流程（先备版本描述正文）。
- 用户说「写版本描述 / Release 正文」→ 按 [版本描述规范](references/release-notes-spec.md) 写。
- 用户说「出版本收尾报告 / 验收报告」「版本收尾」→ 按 [验收报告规范](references/acceptance-report-spec.md) 产出。
- 不用于 Orca 正式版 `.github/workflows/release-cut.yml`，不替代普通 commit、PR、合入流程，不代替人工验收结论。

## 3. 前置依赖检查

在仓库根目录确认 `package.json`、`config/scripts/build-win-workbench.mjs`、`config/scripts/release-win-workbench.mjs` 存在。记录 `git status --short` 与 `git rev-parse HEAD`。发布前确认 `gh auth status`、远端仓库、目标标签空闲。出版收报告前确认 `.bw/planning/<版本>/{data,acceptance}.json` 与 `docs/05-features/README.md` 可读。

## 4. 标准执行流程

发布脚本 `config/scripts/release-win-workbench.mjs` 承接机械步骤（版本→tag→出包核对→上传→建 Release→读回）；**叙事正文一律由人/模型按规范写好后经 `--notes-file` 传入，脚本绝不自动拼正文**。

### A. 出包

1. 运行 `node config/scripts/build-win-workbench.mjs`（或发布脚本带 `--build`）。
2. 核对三产物：`dist/orca-windows-setup.exe`、`dist/orca-windows-setup.exe.blockmap`、`dist/latest.yml`。
3. 汇报产物路径、大小、HEAD 和未验证项。**不创建标签或 Release**。

### B. 版本描述（Release 正文）

1. 复制 [`assets/release-notes-template.md`](assets/release-notes-template.md)，按 [版本描述规范](references/release-notes-spec.md) 逐节填写：**人话**，六节节名固定，按**用户认得出的功能**讲这版有什么变化、按**用户能走的流程**讲体验。**不是** `--generate-notes` 的 PR 罗列，也不是已合 issue / 目标 / 验收屏内容的堆叠。特性树（`docs/05-features/README.md`）与注册旅程只作**取材与查漏依据**，正文**不出现**旅程编号（PJ/AJ/MJ/RJ/CJ）、文件名、逐条 issue 号、六环 `●◐○` 矩阵。
2. 诚实边界（已验/未验同段、缺数 Unknown 不填 0、未做到写原因与下一步），追溯只留末尾一行源码号（出包后补资产校验值）。存为 `release-notes.md`。

### C. 发版本

1. **必须获得用户对正式发布和标签的明确授权**。未指定版本时以 `package.json` 版本形成 `v<version>`，先展示确认。
2. 先**预演**（只读，不写远端）：

   ```bash
   node config/scripts/release-win-workbench.mjs --version <version>
   ```

   脚本核对三资产、HEAD 是否在远端、工作区是否干净、`gh` 是否登录、标签是否已占用，打印将执行的 `gh release create` 与资产 size/sha256（供版本描述末尾「来源」节引用），并列出阻断项。
3. 授权后**正式发布**（带按规范写好的正文）：

   ```bash
   node config/scripts/release-win-workbench.mjs --publish --version <version> --notes-file release-notes.md
   ```

   脚本建 tag、上传三资产、`--notes-file` 建 Release（rc 版自动 `--prerelease`），再 `gh release view` 读回 url/tag/target/assets。**不用 `--generate-notes`**。
4. 汇报读回的链接、标签、提交与资产列表。

### D. 验收报告（版本收尾）

1. 复制 [`assets/acceptance-report-template.html`](assets/acceptance-report-template.html)，按 [验收报告规范](references/acceptance-report-spec.md) 填六节（**人话、给领导看**）：这版想做成什么 → 实际交付了什么（按功能）→ 目标达成到什么程度（达成 / 部分 / 未达 + 做到·没做到·下一步）→ 关键流程能走到哪 → 工作完成情况（按能力，不列 issue 号）→ 还没做到 / 风险与下一步。正文**不出现**旅程编号、文件名、逐条 issue 号、六环矩阵。
2. 事实从开发侧正本读回（版本计划材料、任务跟踪、特性现状清单、自动检查与出包读回），页脚一句话说明事实依据；缺数如实 Unknown，完成由人确认，报告不代替人工结论。
3. 输出到 `.bw/planning/<版本>/acceptance-report.html`，截图放 `.bw/planning/<版本>/shots/`；在 `acceptance.json` 的 `preparedArtifacts` 登记 `kind=showcase`、`location`、`candidateRef`。随工作分支提 PR。

## 5. 参考资源

- `config/scripts/build-win-workbench.mjs`：Windows Workbench 唯一出包入口。
- `config/scripts/release-win-workbench.mjs`：发布机械流程（预演 / 发布 / 读回）。
- [版本描述规范](references/release-notes-spec.md) + [骨架模板](assets/release-notes-template.md)：Release 正文写法。
- [验收报告规范](references/acceptance-report-spec.md) + [骨架模板](assets/acceptance-report-template.html)：版本收尾报告写法（给领导看的人话；结构可参考 `docs/05-features/version-acceptance/showcase-v0.5-g1.html`，但不沿用其编号与六环矩阵）。
- `docs/05-features/README.md`：特性矩阵正本（7 特性 × 六环）——**作者取材与查漏用**，确保按功能讲全；矩阵格值与编号不进正文。
- `config/electron-builder.config.cjs`：产物名（`orca-windows-setup.${ext}`）。`src/renderer/src/workbench/SYNC.md`：打包环境与边界。

## 6. error_handling

| 现象 | 处理 |
|---|---|
| 出包脚本失败 | 保留首个真实错误，定位构建或依赖问题；不发布旧产物 |
| 任一发布资产缺失 | 停止发布，重新出包并核对 `dist/` |
| 标签或 Release 已存在 | 停止并报告现状，不覆盖、不删除 |
| HEAD 不在远端 / `gh` 未登录 / 工作区脏 | 停止发布，说明需要的 push、登录或清理动作 |
| `--publish` 未带 `--notes-file` | 脚本拒绝，不回退 `--generate-notes`；先按规范写正文 |
| 正文缺节 / 是 PR 罗列 / 混入旅程编号·文件名·issue 号·六环矩阵 / 末尾无源码号 | 不合版本描述规范（非人话或不可溯），退回重写，不发布 |
| 验收报告事实无来源 | 留空标注 Unknown，不编造读数/编号/哈希；不预填达成 |

## 7. 示例

输入：「出包并发版本 v0.6.0-rc.20261101.1」。动作：`build-win-workbench.mjs` 出包 → 按规范写 `release-notes.md`（人话讲本版功能变化与用户能走的流程）→ `release-win-workbench.mjs --version …` 预演核对 → 授权后 `--publish --notes-file release-notes.md` → `gh release view` 读回。输出：Release URL、标签、提交、三资产与 SHA-256。版本收尾另按 D 出验收报告并归档登记。

## 8. 纪律表

| 必须 | 禁止 | 越界信号 | 你不做的事 |
|---|---|---|---|
| 区分出包 / 发布 / 版本描述 / 验收报告；发布后读回；正文说人话、按功能与流程组织、末尾留源码号 | 未授权建 Release 或打 tag；上传旧包；用 `--generate-notes`；把 issue/目标/用例扁平罗列当正文；把旅程编号·文件名·issue 号·六环矩阵等黑话写进正文；编造读数 | 需覆盖标签、删 Release、改官方 release-cut、无来源写成绩 | 不合并 PR、不关闭 Issue、不替用户决定版本号、不替人确认版本达成 |
