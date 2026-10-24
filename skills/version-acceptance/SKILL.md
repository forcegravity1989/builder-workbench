---
name: version-acceptance
description: Use when 在 BW 验收屏准备周五验收会议的材料(出包、部署、验收证据报告)、支持 Showcase 展示与会议纪要、归档验收结果并发布版本,或对应 Orca 周期运行启动。制定新版本计划使用 week-planning。
metadata:
  version: 0.8.0
---

# 版本验收

先告诉用户本次验收要走的旅程，用右侧验收屏看得见的四个分区名：验收准备 → Showcase → 会议纪要 → 归档 PR 及发版本，并说明现在在哪一区。入口已给出版本就直接恢复该版材料，不再选第二次；计划归档 PR 未合入时验收不能开始，如实说明即可。每步完成打一行回执直接继续，不中断等确认，开场不做发散探查。勾勾表的达成/不达成、Issue 备注与遗留标记、纪要条目及其确认都由人在界面落——你不代勾、不代笔、不代确认。

然后加载版本匹配的验收指南：

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
ORCA skills get version-acceptance
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
