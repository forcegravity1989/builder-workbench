# spec — Windows 出包与发布 · 版本描述 · 验收报告

> **状态：草案，待人 gate（#332 增量）。** 价值见 [intent.md](intent.md)，证据见 [STATUS.md](STATUS.md)。
>
> **维护约定**：给执行出包 / 发布、写 Release 版本描述、出版收报告的人，以及验收这条入口的人读。本篇写操作契约和可观察结果。无界面；按 [01 §4.2](../../01-principles/01-document-organization.md) 用脚本协议代替可点原型，正本是 [workbench-release 技能](../../../.claude/skills/workbench-release/SKILL.md)。命令、产物名、版本描述规范或验收报告规范变化时同步本篇与技能，只在一处写细步骤。

## 范围与入口

在 Builder Workbench 仓根执行。出包入口 `pnpm run build:win:workbench`（脚本 `config/scripts/build-win-workbench.mjs`）；发布入口 `pnpm run release:win:workbench`（脚本 `config/scripts/release-win-workbench.mjs`，机械全流程：版本→tag→上传三资产→建 Release→读回）。技能在用户说「出包」「发版本」「写版本描述」「出验收报告」时使用；普通提交、PR 和 Orca 官方 release-cut 不走这里。

出包脚本设置 `WORKBENCH_SHELL`、`VITE_WORKBENCH_SHELL`、`ORCA_PRODUCT_NAME=Workbench`，再依次构建 relay、CLI、electron-vite、内置技能校验、web 资源、Electron 运行时，最后用 `electron-builder` 打 Windows NSIS 包，`--publish never`。pnpm 的调用方式由 `config/scripts/pnpm-cli-invocation.mjs` 解析。发布脚本不重造构建，需要出包时带 `--build` 复用出包脚本。

**叙事正文不由脚本生成**：Release 版本描述与验收报告均按规范由人/模型写好后传入（版本描述经 `--notes-file`），脚本绝不自动拼正文、不用 `gh --generate-notes`。规范正本：[版本描述规范](../../../.claude/skills/workbench-release/references/release-notes-spec.md)、[验收报告规范](../../../.claude/skills/workbench-release/references/acceptance-report-spec.md)。

## 完整路径

### 出包

1. 记录 `git status --short` 与 `git rev-parse HEAD`。
2. 运行 `pnpm run build:win:workbench`。
3. 核对三个产物：`dist/orca-windows-setup.exe`、`dist/orca-windows-setup.exe.blockmap`、`dist/latest.yml`。
4. 汇报路径、大小、HEAD，以及尚未验证的项。

出包结束时远端没有新标签，也没有新的 GitHub Release。

### 版本描述（Release 正文）

按 [版本描述规范](../../../.claude/skills/workbench-release/references/release-notes-spec.md) 与 [骨架模板](../../../.claude/skills/workbench-release/assets/release-notes-template.md) 写 `release-notes.md`：读者是升级试用的人与领导，**说人话**，六节节名固定（标题定位 / 下载与安装 / 这版有什么变化 / 升级后你可以这样用 / 验证到哪还没验到哪 / 来源），按**用户认得出的功能**讲变化、按**用户能走的流程**讲体验。特性树（`docs/05-features/README.md`）与注册旅程只作**取材与查漏依据**，正文不得出现旅程编号（PJ/AJ/MJ/RJ/CJ）、文件名、逐条 issue 号、六环 `●◐○` 矩阵；不得是 `--generate-notes` 的 PR 罗列，也不得是已合 issue / 目标 / 验收屏内容的堆叠。追溯只留末尾一行源码号（出包后补资产校验值）。

### 发版本

前提是用户明确授权这次正式发布和标签。未指定版本时，用 `package.json` 的 `version` 形成 `v<version>`，先展示再写远端。

1. **预演**（只读）：`node config/scripts/release-win-workbench.mjs --version <version>`。脚本核对三资产存在、HEAD 在远端、工作区干净、`gh` 已登录、标签空闲，打印将执行的 `gh release create` 与资产 size/sha256，列出阻断项；不写远端。
2. **发布**（授权后）：`node config/scripts/release-win-workbench.mjs --publish --version <version> --notes-file release-notes.md`。脚本建 tag、上传三资产、以 `--notes-file` 建 Release（rc 版自动 `--prerelease`），再 `gh release view <tag> --json url,tagName,isDraft,isPrerelease,assets` 读回。
3. 汇报读回的 url、tag、target、三资产。

`--publish` 缺 `--notes-file` 时脚本拒绝执行，不回退自动生成正文。

### 验收报告（版本收尾）

按 [验收报告规范](../../../.claude/skills/workbench-release/references/acceptance-report-spec.md) 与 [骨架模板](../../../.claude/skills/workbench-release/assets/acceptance-report-template.html) 产出六节**人话**报告（给领导 / 验收人看）：这版想做成什么 / 实际交付了什么（按功能）/ 目标达成到什么程度（达成·部分·未达 + 做到·没做到·下一步）/ 关键流程能走到哪 / 工作完成情况（按能力，不列 issue 号）/ 还没做到·风险与下一步。正文不得出现旅程编号、文件名、逐条 issue 号、六环矩阵。事实从开发侧正本读回（版本计划材料、任务跟踪、特性现状清单、自动检查与出包读回），页脚一句话说明事实依据；缺数如实 Unknown，完成由人确认，报告不代替人工结论。输出到 `.bw/planning/<版本>/acceptance-report.html`，截图放 `.bw/planning/<版本>/shots/`，在 `acceptance.json` 的 `preparedArtifacts` 登记 `kind=showcase`、`location`、`candidateRef`。

## 行为规则与异常

| 现象 | 结果 |
|---|---|
| 构建脚本失败 | 保留首个真实错误；不拿旧的 `dist/` 去发布 |
| 三个资产缺任何一个 | 不创建 Release |
| 标签或 Release 已存在 | 停住并报告现状；不覆盖、不删除 |
| HEAD 不在远端 / `gh` 未登录 / 工作区脏 | 不创建 Release；说明需要的 push、登录或清理 |
| `--publish` 未带 `--notes-file` | 拒绝发布；不回退 `--generate-notes` |
| 版本描述缺节 / 是 PR 罗列 / 混入旅程编号·文件名·issue 号·六环矩阵 / 末尾无源码号 | 不合规范（非人话或不可溯），退回重写，不发布 |
| 验收报告事实无来源 | 留空标注 Unknown；不编造读数 / 编号 / 哈希；不预填达成 |
| 用户只说了出包 | 只出包 |

发布不合并 PR，不关闭 Issue，不替人改版本号，不替人确认版本达成。

## 验收

| 标识 | 前提 | 操作 | 预期 | 不允许 |
|---|---|---|---|---|
| R01 | 仓根可构建 | 只出包 | `dist/` 有上述三个文件；`gh release list` 没有这次新标签 | 出包过程创建标签或 Release |
| R02 | 已有三个产物，人未授权发布 | 停在出包汇报或预演 | 远端 Release 不变 | 因「包已经打好」自动发布 |
| R03 | 人授权标签，HEAD 已在远端，标签空闲，三个资产属于该 HEAD | 按技能发布并 `gh release view` | 读回的 url、tag、target、三个资产与这次 HEAD 一致 | 资产来自另一次构建 |
| R04 | 标签已存在，或资产缺失，或 HEAD 不在远端，或 `gh` 未登录 | 尝试发布 | 停住并说明原因；原 Release 仍在 | 覆盖或删除已有 Release |
| R05 | 已写 `release-notes.md` | 对照版本描述规范核验正文 | 六节齐全、节名固定；说人话、按用户认得出的功能与能走的流程组织；末尾有源码号；已验/未验同段、缺数 Unknown | 用 `--generate-notes` 或粘 PR 标题清单；把 issue/目标/用例扁平罗列当正文；正文混入旅程编号·文件名·issue 号·六环矩阵等黑话 |
| R06 | 版本收尾材料齐 | 对照验收报告规范产出并归档 | 六节齐全；说人话（给领导看）；按功能与目标组织、达成 / 未达写清原因与下一步；登记进 `acceptance.json` `preparedArtifacts`（kind=showcase） | 正文混入旅程编号·文件名·issue 号·六环矩阵；裸列 Issue 号；编造读数；报告代替人工确认达成 |

旅程 RJ01：从一次已知 HEAD 出包 → 按规范写版本描述 → 授权发布 → `gh release view` 独立读回 → 版本收尾出验收报告并归档登记。真机出包与发布尚未执行，成绩写在 STATUS，不在本表预填通过。

## 取舍与待决问题

被放弃的做法：复用 Orca `release-cut`，或恢复 `.bw/release/pack`。前者发布对象不是 Workbench 壳，后者属于已删除的 Rust 出链。发布脚本不复用 Orca 的 `verify-release-required-assets.mjs`（那是多平台资产闸，Workbench 只 3 个 Windows 资产）；只复用 `create-draft-release.mjs` 的 `truncateReleaseBody`（正文截断与形态无关）。Workbench rc tag 形态是 `vX.Y.Z-rc.YYYYMMDD.N`，与 Orca 的 `vX.Y.Z-rc.N` 不同，故 tag 解析用本脚本自带的 `parseWorkbenchReleaseTag`。

**已裁决（#332）**：`version-report` 技能退役，其版本收尾报告职责并入本技能，改为「叙事 + 按特性组织、事实具名溯源」的验收报告（规范见上），不再走 `report.py` 确定性回填扁平模板；出包步骤统一到 `build:win:workbench`，不再指向已删除的 `.bw/release/{pack,verify,e2e}`。原「version-report 是否改走本入口」待决项据此关闭。

仍待决：是否补 Actions 出包（本次不写进范围，草案按本机出包 + 授权发布）。
