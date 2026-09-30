# intent — Windows 出包与发布（workbench-release）

> **状态：草案，待人 gate。** 从已落地提交回写：`5b7907b12`（技能与出包脚本）、`2ff486012`（本机 pnpm 调用可移植）。聊天和源码都不是 gate。
>
> **维护约定**：给判断「BW 开发者怎样打出 Windows 安装包、怎样把它发布成 GitHub Release」的人读。本篇只回答为谁、做什么、做到哪。操作契约在 [spec.md](spec.md)，链状态在 [STATUS.md](STATUS.md)。价值或边界变化时改对应段落，不追加讨论流水。

## 用户与问题

BW 仓的开发者需要一份可安装的 Windows Workbench，并在人明确要求时把它放到 GitHub Release 上。Orca 上游的 `release-cut` 打的是 Orca 自己的发布，不能拿来当 Workbench 安装包。旧 Rust 出包入口 `.bw/release/pack` 也不在本分支。

## 价值与依据

核心收益是：在本仓根目录用一条固定入口打出 Windows 安装包；只有人点名发版本时，才把同一次产物发布到 GitHub Release，并读回链接和资产。

依据是上述两笔提交，以及技能 [workbench-release](../../../.claude/skills/workbench-release/SKILL.md)。这是开发方法资产（[02 §6.3](../../01-principles/02-working-backwards.md)）：用户是维护本仓的人，不是被管项目里的 Builder。放进特性目录，是为了和 reviewer-agent 一样能在[特性矩阵](../README.md)里看见链走到哪。

## 目标体验

开发者在仓根说「出包」。技能运行 `pnpm run build:win:workbench`，成功后核对 `dist/orca-windows-setup.exe`、同名 `.blockmap` 和 `dist/latest.yml`，汇报路径、大小和当前 HEAD。这一步不打标签、不建 Release。

开发者另行明确「发版本」并给出或确认标签后，技能确认安装包来自已推到远端的那个 HEAD、标签尚未占用，再创建 GitHub Release，然后用 `gh release view` 读回地址和三个资产。

## 范围与边界

- **做**：本机 Windows Workbench 安装包；在明确授权下，把这次安装包发布为 GitHub Release。
- **范围外**：Orca 的 `.github/workflows/release-cut.yml`；仓库里已有的 PR 门禁 workflow（它们不跑这条出包）；被管项目的版本材料归档（计划 / 验收）；版本收尾 HTML 报告技能 [version-report](../../../.claude/skills/version-report/SKILL.md)。后者的出包步骤仍指向 `.bw/release/pack`，和本技能不是同一条入口。
- **分层**：按 02 §6.3，这是 BW 开发团队的发布工具，不改写 [03](../../01-principles/03-press-release-faq-flywheel.md) 里 Builder 的产品主张。

这里的「归档」指把安装包放进 GitHub Release。它不代替计划或验收材料的归档。

## 成功判据与待决问题

**判据**：同一次 HEAD 上，出包得到三个资产且没有创建 Release；授权发布后，`gh release view` 读到的标签、目标提交和三个资产与这次出包一致。缺资产、标签已存在、HEAD 不在远端或 `gh` 未登录时停住，不覆盖已有 Release。

**待决（需 gate）**：

1. 特性是否就停在「本机出包 + 授权后的 GitHub Release」。草案按已落地技能书写，不把尚未存在的 Actions 出包流水线写进范围。
2. 是否把 version-report 的出包步骤改到 `build:win:workbench`。草案保持两条入口分开，等有人决定再改那份技能。
