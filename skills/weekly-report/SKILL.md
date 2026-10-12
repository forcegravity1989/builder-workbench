---
name: weekly-report
description: Use when 根据项目真实目标、Issue、PR/MR、验收和指标提炼项目周报，或 BW 项目“更新周报”会话启动；保留人工补充，输出宿主固定七栏报告。制定目标与签署验收使用各自流程。
---

# 项目周报

根据宿主已给定的项目、周期与工作区更新周报。先简短说明“核对事实 → 提炼变化 → 保存周报”，读取真实项目进展，保留人工补充；沿用固定七栏模板。

加载版本匹配的周报指南与按需参考：

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

```text
ORCA skills get weekly-report
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
