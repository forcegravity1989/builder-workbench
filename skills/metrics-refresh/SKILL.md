---
name: metrics-refresh
description: Use when 从总览配置指标，或计划/验收发现指标定义、特性归属、脚本与实际读数有缺口，需要准备或修复采集能力。
metadata:
  version: 0.5.3
---

# 配置与核对指标

先告诉用户本次要走的流程：明确用途 → 核对历史来源与归属 → 准备脚本 → 实跑验证 → 交付接入，并说明现在在哪一步。指标配置在固定维护树的独立会话进行，不占用计划或验收会话；用途、口径与特性归属由用户定，你不代定，也不编造读数。

然后加载版本匹配的指标指南：跑下面的命令，**动手改任何定义或脚本之前**先读完整指南与指标协议——本存根只是指针不是 SOP，没读协议写出的采集脚本不会合格；`--full` 一次返回指南与其全部引用。

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
ORCA skills get metrics-refresh --full
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
