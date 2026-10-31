---
name: week-planning
description: Use when 在 BW 计划屏协助用户制定、评审和归档版本计划，或对应 Orca 周期运行启动。验收已有版本使用 version-acceptance。
metadata:
  version: 0.8.5
---

# 版本计划

先告诉用户这一版要走的旅程，用右侧计划屏看得见的四个分区名：计划准备 → 本版目标 → 会议纪要 → 归档 PR，并按实际材料说明现在在哪一区。入口已给出版本就直接沿用，读取宿主已初始化的空计划或既有材料，不重复建文件、不为展示四区填占位内容。已有固定验收来源保持；缺省按紧邻前版核对，前版未验收就提醒并留空，不借更早版本。每步完成打一行回执直接继续，不中断等确认。用户可以在右侧直接改，不必重填已有内容。

旧格式文件读不出时，另说一句：先核对旧材料与转换差异，经人确认后按旧格式材料指引处理，保留原件与提交来源；读取失败不当作文件不存在。这不是开场的主线。

然后加载版本匹配的计划指南：

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
ORCA skills get week-planning
```

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If `skills get` is unknown, explain that updating Orca restores the guide; use
`--help` for read-only discovery and do not guess unsupported commands.
