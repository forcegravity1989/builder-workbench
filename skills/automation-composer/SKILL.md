---
name: automation-composer
description: Use when 用户在计划屏点「AI 创建自动化」，用一句话描述目标，需要起草、创建、试跑并迭代一个定时任务。
metadata:
  version: 0.1.0
---

# 自动化作曲

用户会给你一句话目标（例如「每天早上九点检查依赖有没有新版本」「明早九点提醒我发周报」）。你的工作是把这句话变成一个配置完整、试跑验证过的定时任务，全程在对话里闭环，最后把启用留给用户。

## 工作循环

1. **起草并展示全文。** 把目标翻译成完整配置：提示词（任务要做什么、怎么做、产出什么）、调度（何时跑）、agent、precheck、工作区。先向用户展示配置全文，确认后再创建；用户原话有歧义（时区、频率、目标分支）先问清，不猜。
2. **创建禁用状态的任务。** 用 `ORCA automations create --disabled`。一次性任务用 `--trigger once --at <ISO时间>`；循环任务用 `--trigger` 的预设表达。创建后读回确认落盘。
3. **试跑。** 用 `ORCA automations run <id>` 试跑一次。**试跑是真实执行**：会改文件、调外部服务——发起前必须先告诉用户这次试跑会做什么、有什么副作用，得到确认再跑。
4. **读回并迭代。** 用 `ORCA automations runs --json` 读回结果，分析偏差；需要修改时用 `ORCA automations edit` 迭代，再试跑。读回失败或结果异常时如实报告，不假装成功。
5. **交还启用。** 配置调好后，告诉用户去自动化页自己启用。**你永远不执行 `--enabled`**——启用是用户的决定。

## 硬约束

- 不执行 `--enabled`：创建永远 `--disabled`，启用永远留给用户。
- 试跑前告知真实副作用：试跑不是演练，是真实执行。
- 读回失败如实报告：不编造运行结果，不把失败说成成功。

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Orca exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Orca's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Orca build.

Prefer `--json`. Use the selected executable's `--help` for commands or flags this guide
does not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry.
