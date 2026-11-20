# spec — Windows 出包与发布

> **维护约定**：给执行出包、发布、写版本描述和整理验收报告的人读取。本篇只写当前操作契约和可观察结果。价值与范围见 [intent.md](intent.md)，证据和未验证边界见 [STATUS.md](STATUS.md)。脚本协议、命令或正文规范变化时同步本篇与技能，细节只在技能和引用的规范中维护。

## 入口与归属

操作入口是仓根的 [workbench-release 技能](../../../.claude/skills/workbench-release/SKILL.md)。固定发布动作使用 `.github/workflows/bw-release.yml`，本机脚本是试用和 Actions 不可用时的兜底。普通提交、PR 和 Orca 官方 `release-cut` 不走这条入口。

## 出包

1. 记录当前工作区状态和 `git rev-parse HEAD`。
2. 运行 `pnpm run build:win:workbench`。
3. 核对 `dist/workbench-windows-setup.exe`、`dist/workbench-windows-setup.exe.blockmap` 和 `dist/latest.yml`。
4. 汇报产物路径、大小、构建提交和仍未验证的项目。

构建脚本以 Workbench 壳配置运行 Electron 构建，并以 `--publish never` 结束。出包阶段不创建标签或 GitHub Release。

## 发布

发布前由人确认版本、目标提交和 Release 正文。workflow 触发命令为

```text
gh workflow run bw-release.yml --ref main -f version=<version> -F notes=@release-notes.md
```

workflow 在 GitHub runner 上完成版本注入、出包、建标签、上传三个资产、创建 Release，再通过 `gh release view <tag> --json url,tagName,isPrerelease,assets` 读回。`-rc` 版本按 workflow 规则作为预发布版本。

Actions 不可用时，可先用 `node config/scripts/release-win-workbench.mjs --version <version>` 预演，再在授权后使用 `--publish --version <version> --notes-file release-notes.md`。缺少 `--notes-file` 时脚本拒绝发布，不回退到自动生成正文。

## 版本描述与验收报告

Release 正文按[版本描述规范](../../../.claude/skills/workbench-release/references/release-notes-spec.md)和模板编写。正文只有「这版有什么变化」一节，按用户能理解的功能组织，缺失或延期写出原因与下一步，不放旅程编号、文件名、逐条 Issue 号、六环矩阵或 PR 标题清单。

版本收尾按[验收报告规范](../../../.claude/skills/workbench-release/references/acceptance-report-spec.md)和模板产出六节报告。事实从版本计划、任务跟踪、特性现状和发布读回中具名引用，缺失读数写为 Unknown。报告写入 `.bw/planning/<版本>/acceptance-report.html`，截图放在对应 `shots/`，并在 `acceptance.json` 的 `preparedArtifacts` 登记 `kind=showcase`。报告不代替人的完成确认。

## 异常与阻断

| 条件 | 结果 |
| --- | --- |
| 构建失败 | 保留首个真实错误，不使用旧 `dist/` 发布 |
| 三个资产缺任一项 | 不创建 Release |
| 标签或 Release 已存在 | 停止并报告现状，不覆盖或删除 |
| HEAD 未推远端、未登录或工作区不满足发布前提 | 不创建 Release，说明需要补齐的前提 |
| Release 正文缺失或不合规范 | 不发布，退回重写 |
| 验收报告事实没有来源 | 标记 Unknown，不填造读数或达成结论 |
| 用户只要求出包 | 只执行出包 |

发布不合并 PR、不关闭 Issue，也不替人修改版本号或确认版本达成。

## 验收点与历史旅程标识

| 标识 | 前提与动作 | 可观察结果 |
| --- | --- | --- |
| R01 | 仓根可构建，只出包 | 三个产物齐全，远端没有新增标签或 Release |
| R02 | 已有产物但未授权发布 | 停在汇报或预演，远端无变化 |
| R03 | 人授权、标签空闲、提交已推远端 | 发布页读回同一标签、目标提交和三个资产 |
| R04 | 标签占用、资产缺失、提交未推远端或未登录 | 停止并说明原因，已有 Release 不变 |
| R05 | 提供 Release 正文 | 只有规范要求的变化章节，内容按功能组织且可读 |
| R06 | 版本收尾材料齐备 | 六节验收报告产出并登记到 `preparedArtifacts` |
| RJ01（历史） | 出包 → 写正文 → 授权发布 → 读回 → 整理验收报告 | 仅作历史链路标识，不作为 W01–W05 用户旅程登记 |

R01–R06 是发布工具的操作验收点。它们不构成 `tests/e2e` 中的 Workbench 业务 E2E。
