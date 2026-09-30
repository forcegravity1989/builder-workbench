# spec — Windows 出包与发布

> **状态：草案，待人 gate。** 价值见 [intent.md](intent.md)，证据见 [STATUS.md](STATUS.md)。
>
> **维护约定**：给执行出包或发布的人、以及验收这条入口的人读。本篇写操作契约和可观察结果。无界面；按 [01 §4.2](../../01-principles/01-document-organization.md) 用脚本协议代替可点原型，正本是 [workbench-release 技能](../../../.claude/skills/workbench-release/SKILL.md)。命令或产物名变化时同步本篇和技能，只在一处写细步骤。

## 范围与入口

在 Builder Workbench 仓根执行。入口是 `pnpm run build:win:workbench`，脚本为 `config/scripts/build-win-workbench.mjs`。技能在用户说「出包」或「发版本」时使用；普通提交、PR 和 Orca 官方 release-cut 不走这里。

脚本设置 `WORKBENCH_SHELL`、`VITE_WORKBENCH_SHELL`、`ORCA_PRODUCT_NAME=Workbench`，再依次构建 relay、CLI、electron-vite、内置技能校验、web 资源、Electron 运行时，最后用 `electron-builder` 打 Windows NSIS 包，`--publish never`。pnpm 的调用方式由 `config/scripts/pnpm-cli-invocation.mjs` 解析，以便在 pnpm 不是直接可执行文件的环境里运行。

## 完整路径

### 出包

1. 记录 `git status --short` 与 `git rev-parse HEAD`。
2. 运行 `pnpm run build:win:workbench`。
3. 核对三个产物：`dist/orca-windows-setup.exe`、`dist/orca-windows-setup.exe.blockmap`、`dist/latest.yml`。
4. 汇报路径、大小、HEAD，以及尚未验证的项。

出包结束时远端没有新标签，也没有新的 GitHub Release。

### 发版本

前提是用户明确授权这次正式发布和标签。未指定标签时，用 `package.json` 的 `version` 形成 `v<version>`，先展示再写远端。

1. 确认三个产物来自待发布的 HEAD，且该提交已在远端。对不上就重新出包或停住。
2. `gh release view <tag>`。已有同名 Release 则停住。
3. 执行技能中的 `gh release create`，资产是上述三个文件，`--target` 为该 HEAD，标题为 `Workbench <version>`。
4. `gh release view <tag> --json url,tagName,isDraft,isPrerelease,assets` 读回链接和资产。

## 行为规则与异常

| 现象 | 结果 |
|---|---|
| 构建脚本失败 | 保留首个真实错误；不拿旧的 `dist/` 去发布 |
| 三个资产缺任何一个 | 不创建 Release |
| 标签或 Release 已存在 | 停住并报告现状；不覆盖、不删除 |
| HEAD 不在远端，或 `gh` 未登录 | 不创建 Release |
| 用户只说了出包 | 只出包 |

发布不合并 PR，不关闭 Issue，不替人改版本号。

## 验收

| 标识 | 前提 | 操作 | 预期 | 不允许 |
|---|---|---|---|---|
| R01 | 仓根可构建 | 只出包 | `dist/` 有上述三个文件；`gh release list` 没有这次新标签 | 出包过程创建标签或 Release |
| R02 | 已有三个产物，人未授权发布 | 停在出包汇报 | 远端 Release 不变 | 因「包已经打好」自动发布 |
| R03 | 人授权标签，HEAD 已在远端，标签空闲，三个资产属于该 HEAD | 按技能发布并 `gh release view` | 读回的 url、tag、target、三个资产与这次 HEAD 一致 | 资产来自另一次构建 |
| R04 | 标签已存在，或资产缺失，或 HEAD 不在远端，或 `gh` 未登录 | 尝试发布 | 停住并说明原因；原 Release 仍在 | 覆盖或删除已有 Release |

旅程 RJ01：从一次已知 HEAD 出包，授权发布，再用 `gh release view` 独立读回。真机出包与发布尚未执行，成绩写在 STATUS，不在本表预填通过。

## 取舍与待决问题

被放弃的做法：复用 Orca `release-cut`，或恢复 `.bw/release/pack`。前者发布对象不是 Workbench 壳，后者属于已删除的 Rust 出包链。

待决项与 [intent](intent.md) 相同：是否补 Actions 出包，以及 version-report 是否改走本入口。
