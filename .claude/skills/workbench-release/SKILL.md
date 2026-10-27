---
name: workbench-release
description: Use when 在 Builder Workbench 仓出 Windows Workbench 安装包、把它发布为 GitHub Release、写 Release 版本描述，或出版本收尾验收报告。普通开发、PR 交付和 Orca 官方 release-cut 不用。
---

# workbench-release：Workbench 出包 · 发布 · 版本描述 · 验收报告

## 1. 核心目标

Builder Workbench 的版本交付入口，一条技能覆盖四件事：**出包**（Windows 安装包）、**发布**（授权后建 GitHub Release）、**版本描述**（Release 正文按规范写，不用 `--generate-notes`）、**验收报告**（版本收尾的叙事报告）。出包与发布的固定动作由 `.github/workflows/bw-release.yml` 在 GitHub runner 上承接——本地机器受公司代理限制传不了大安装包；本地只做版本决策、正文写作、授权与读回。出包不等于发布；没有用户明确授权时不触发发布 workflow、不打 tag。本技能是 **Workbench 专用**，不写成通用发布模板；已退役的 `version-report` 技能职责并入此处。

## 2. When to Use / When NOT to Use

- 用户说「出包」「打 Windows Workbench 包」→ 为发版本而出包并入 B（随 workflow 出）；只要试用包不发版 → `gh workflow run bw-package.yml --ref <分支>`（ADHOC prerelease）或 C.1 本地出包。
- 用户说「发版本」「发布 Release」→ 发布流程（先备版本描述正文）。
- 用户说「写版本描述 / Release 正文」→ 按 [版本描述规范](references/release-notes-spec.md) 写。
- 用户说「出版本收尾报告 / 验收报告」「版本收尾」→ 按 [验收报告规范](references/acceptance-report-spec.md) 产出。
- 不用于 Orca 正式版 `.github/workflows/release-cut.yml`，不替代普通 commit、PR、合入流程，不代替人工验收结论。

## 3. 前置依赖检查

确认 `.github/workflows/bw-release.yml` 在目标分支上存在、`gh auth status` 已登录且有仓库写权限。记录 `git rev-parse HEAD` 并核对与 `origin/main` 一致（发布从主干 HEAD 出）。确认目标标签 `v<version>` 空闲。走兜底路径时另确认 `package.json`、`config/scripts/build-win-workbench.mjs`、`config/scripts/release-win-workbench.mjs` 存在。出版收报告前确认 `.bw/planning/<版本>/{data,acceptance}.json` 与 `docs/05-features/README.md` 可读。

## 4. 标准执行流程

出包、上传与建 Release 的固定动作由 `.github/workflows/bw-release.yml` 在 GitHub runner 上承接（版本→tag→出包→三资产上传→建 Release→读回）；**叙事正文一律由人/模型按规范写好后经 `notes` 输入传入，workflow 绝不自动拼正文**。本地机器受公司代理限制传不了大安装包，固定动作不本地复刻；GitHub Actions 不可用时才走 C 兜底。

### A. 版本描述（Release 正文）

1. 复制 [`assets/release-notes-template.md`](assets/release-notes-template.md)，按 [版本描述规范](references/release-notes-spec.md) 填写：**人话**，正文只有【这版有什么变化】一节（节名固定，不加节、不拆节），按**用户认得出的功能**讲这版有什么变化。**不是** `--generate-notes` 的 PR 罗列，也不是已合 issue / 目标 / 验收屏内容的堆叠。特性树（`docs/05-features/README.md`）与注册旅程只作**取材与查漏依据**，正文**不出现**旅程编号（PJ/AJ/MJ/RJ/CJ）、文件名、逐条 issue 号、六环 `●◐○` 矩阵。
2. 诚实边界（没做到的写原因与下一步、缺数如实写不填 0、不冒充绿）。存为 `release-notes.md`，**经人确认**后再进入发版本。

### B. 发版本（触发 bw-release.yml）

1. **必须获得用户对正式发布和标签的明确授权——触发 workflow 即正式发布**。产品版本号必须由人指定（`package.json` 里是上游 Orca 基线版本，不作为 Workbench 发布版本）；先展示确认。
2. 授权后触发（正文传绝对路径）：

   ```bash
   gh workflow run bw-release.yml --ref main -f version=<version> -F notes=@<release-notes.md 绝对路径>
   ```

   workflow 在 GitHub runner 上出包并创建 Release：tag `v<version>` 指向主干 HEAD、标题 `Workbench <version>`、上传 `workbench-windows-setup.exe` / `.exe.blockmap` / `latest.yml` 三资产；版本号含 `-rc` 时自动标记 prerelease。**包内与 `latest.yml` 的版本就是输入的 `<version>`——tag / 清单 / 包内自报三处必须一致，应用内更新链靠这一个字符串比新旧（#338）**；版本格式非法或清单账本不一致时 workflow 拒绝发布。
3. 监控运行（约 6-10 分钟）：

   ```bash
   gh run list --workflow bw-release.yml --limit 1
   gh run watch <run-id>
   ```

4. 读回核对：`gh release view v<version>` 确认 tag 指向、三资产齐全、正文完整；资产 size/sha256 供版本描述末尾「来源」节引用。汇报链接、标签、提交与资产列表。

### C. 兜底：本地出包与外携发布（仅当 GitHub Actions 不可用）

1. 本地出包：`node config/scripts/build-win-workbench.mjs --version <version>`（注入产品版本号，与 workflow 同口径），核对三产物（`dist/workbench-windows-setup.exe`、`.exe.blockmap`、`dist/latest.yml`），汇报产物路径、大小、HEAD 和未验证项。**不创建标签或 Release**。
2. 预演：`node config/scripts/release-win-workbench.mjs --version <version>`；授权后 `--publish --version <version> --notes-file release-notes.md`（rc 版自动 `--prerelease`）。脚本自带账本门禁：`latest.yml` 版本与发布版本不一致即阻断。
3. 本机网络传不了大资产（公司代理限制上传体积）时，把三产物 + `release-notes.md` + 发布命令打成套件 zip，交不受限网络执行，发布后读回核对。

### D. 验收报告（版本收尾）

1. 复制 [`assets/acceptance-report-template.html`](assets/acceptance-report-template.html)，按 [验收报告规范](references/acceptance-report-spec.md) 填六节（**人话、给领导看**）：这版想做成什么 → 实际交付了什么（按功能）→ 目标达成到什么程度（达成 / 部分 / 未达 + 做到·没做到·下一步）→ 关键流程能走到哪 → 工作完成情况（按能力，不列 issue 号）→ 还没做到 / 风险与下一步。正文**不出现**旅程编号、文件名、逐条 issue 号、六环矩阵。
2. 事实从开发侧正本读回（版本计划材料、任务跟踪、特性现状清单、自动检查与出包读回），页脚一句话说明事实依据；缺数如实 Unknown，完成由人确认，报告不代替人工结论。
3. 输出到 `.bw/planning/<版本>/acceptance-report.html`，截图放 `.bw/planning/<版本>/shots/`；在 `acceptance.json` 的 `preparedArtifacts` 登记 `kind=showcase`、`location`、`candidateRef`。随工作分支提 PR。

## 5. 参考资源

- `.github/workflows/bw-release.yml`：出包与发布的固定动作（workflow_dispatch：`version` + `notes` 两输入）。
- `config/scripts/build-win-workbench.mjs` / `config/scripts/release-win-workbench.mjs`：C 兜底路径的本地出包与发布脚本。
- `.github/workflows/bw-package.yml`：试用包流水线（ADHOC prerelease，验收屏出包区块用），与正式发布无关。
- [版本描述规范](references/release-notes-spec.md) + [骨架模板](assets/release-notes-template.md)：Release 正文写法。
- [验收报告规范](references/acceptance-report-spec.md) + [骨架模板](assets/acceptance-report-template.html)：版本收尾报告写法（给领导看的人话；结构可参考 `docs/05-features/version-acceptance/showcase-v0.5-g1.html`，但不沿用其编号与六环矩阵）。
- `docs/05-features/README.md`：特性矩阵正本（7 特性 × 六环）——**作者取材与查漏用**，确保按功能讲全；矩阵格值与编号不进正文。
- `config/electron-builder.config.cjs`：产物名（`workbench-windows-setup.${ext}`）。`src/renderer/src/workbench/SYNC.md`：打包环境与边界。

## 6. error_handling

| 现象 | 处理 |
|---|---|
| 出包脚本失败 | 保留首个真实错误，定位构建或依赖问题；不发布旧产物 |
| 任一发布资产缺失 | 停止发布，重新出包并核对 `dist/` |
| `latest.yml` 版本与发布版本不一致 | 账本门禁阻断（workflow 与本地脚本同口径）；用注入版本重新出包，不改 tag 迁就脏包，不手改清单 |
| 标签或 Release 已存在 | 停止并报告现状，不覆盖、不删除 |
| workflow 运行失败 | `gh run view <run-id> --log-failed` 定位首错；远端可能有半成品 Release，如实报告，不覆盖、不删除 |
| `gh workflow run` 找不到 bw-release.yml | 该 workflow 须先合入目标分支，才能在该 ref 上触发 |
| HEAD 不在远端 / `gh` 未登录 / 工作区脏 | 停止发布，说明需要的 push、登录或清理动作 |
| `--publish` 未带 `--notes-file` | 脚本拒绝，不回退 `--generate-notes`；先按规范写正文 |
| 正文不是【这版有什么变化】单节 / 是 PR 罗列 / 混入旅程编号·文件名·issue 号·六环矩阵 | 不合版本描述规范（非人话），退回重写，不发布 |
| 验收报告事实无来源 | 留空标注 Unknown，不编造读数/编号/哈希；不预填达成 |

## 7. 示例

输入：「出包并发版本 v0.6.0-rc.20261101.1」。动作：按规范写 `release-notes.md`（人话讲本版功能变化）并经人确认 → 授权后 `gh workflow run bw-release.yml --ref main -f version=0.6.0-rc.20261101.1 -F notes=@release-notes.md` → `gh run watch` 监控 → `gh release view` 读回。输出：Release URL、标签、提交、三资产与 SHA-256。版本收尾另按 D 出验收报告并归档登记。

## 8. 纪律表

| 必须 | 禁止 | 越界信号 | 你不做的事 |
|---|---|---|---|
| 区分出包 / 发布 / 版本描述 / 验收报告；固定动作触发 bw-release.yml，不本地复刻；发布后读回；正文说人话、只有【这版有什么变化】一节、按功能组织 | 未授权触发发布 workflow 或打 tag；上传旧包；用 `--generate-notes`；把 issue/目标/用例扁平罗列当正文；把旅程编号·文件名·issue 号·六环矩阵等黑话写进正文；编造读数 | 需覆盖标签、删 Release、改官方 release-cut、无来源写成绩 | 不合并 PR、不关闭 Issue、不替用户决定版本号、不替人确认版本达成 |
