# intent — Windows 出包与发布

> **维护约定**：给维护本仓、出包和发布 Workbench 的人读取。本篇只定义用户结果、价值、范围和排除。操作契约见 [spec.md](spec.md)，当前证据见 [STATUS.md](STATUS.md)。已确认的决定直接改写正文，不在文档中追加讨论流水。

## 用户与问题

BW 维护者需要得到可安装的 Windows Workbench，并在明确授权后把同一份产物发布到 GitHub Release。出包、发布、版本描述和验收报告必须能从同一个版本与提交读回，避免把 Orca 发布、旧 Rust 出包入口或 PR 标题清单误当作 Workbench 发布结果。

## 目标结果

- 在仓根用固定入口构建 Windows 安装包，并核对安装包、`.blockmap` 和 `latest.yml` 三个产物。
- 只有人在确认版本、正文和发布动作后，才触发 GitHub Actions 完成出包、建标签、上传资产、创建 Release 并读回结果。本机脚本保留为试用和 Actions 不可用时的兜底。
- Release 正文按人能读懂的功能组织。版本收尾报告按已交付能力、目标和证据组织，并从开发侧正本读回事实。
- 构建失败、产物缺失、标签占用、提交未推远端、未登录或缺少正文时停止在可诊断状态，不覆盖已有发布结果。

## 价值与归属

这是一项 BW 团队的研发保障能力，服务维护本仓的开发者和版本负责人。它不改写 Builder 面向用户的产品主张，也不替被管项目的计划、验收或部署材料建立另一套正本。技能 [workbench-release](../../../.claude/skills/workbench-release/SKILL.md) 承载执行入口，发布与验收报告的正文规范分别见 [版本描述规范](../../../.claude/skills/workbench-release/references/release-notes-spec.md) 和 [验收报告规范](../../../.claude/skills/workbench-release/references/acceptance-report-spec.md)。

本能力没有独立的 Builder 用户结果，不映射探索 BW 的 W01–W05 用户旅程。历史标识 RJ01 仅用于追溯这条研发发布链，不作为当前用户旅程 E2E 登记。

## 范围与排除

- **范围内**：Windows Workbench 本机出包、授权后的 GitHub Release、版本描述和版本收尾验收报告。
- **范围外**：Orca 的 `release-cut`、PR 门禁 workflow、被管项目的版本计划与验收归档、Builder 用户侧的产品旅程。
- **实现边界**：固定发布动作由 `.github/workflows/bw-release.yml` 承接。`config/scripts/build-win-workbench.mjs` 和 `release-win-workbench.mjs` 作为本机出包与发布兜底，不自动生成 Release 正文。

## 成功判据

同一次提交可以构建三个发布资产，且只出包不会创建标签或 Release。明确授权后，发布页的标签、目标提交和资产与这次出包一致。Release 正文只有规范要求的变化章节，验收报告能从具名来源读回事实并登记归档。未知、缺失和未验证项如实保留，版本完成仍由人确认。
