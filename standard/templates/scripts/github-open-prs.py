#!/usr/bin/env python3
"""同时开着的 MR 数 —— buddy 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:每个周末时点(下周一 00:00 之前的那一刻)**还开着**的 PR 存量。这是并行
度的仓本位口径:本机「进行中」的活数仓看不见,同一时刻开着几张 PR 仓远端记得
一清二楚。

存量和「未处理 issue」同款算法:某时点还开着几张 = 到那一刻开过的减去关掉的,
拿同一份流水换个时刻就算得出来,不需要谁提前存。合入的 PR,`closedAt` 就是
合入时刻。每周都出点——存量为 0 是真实的 0(这周末确实一张都没开着),不是
「没数」。

自己复算:

    gh pr list --state all --json createdAt,closedAt --limit 1000

铺一次就归这个项目,buddy 之后再也不覆盖它。
"""

import argparse
import datetime
import json
import subprocess
import sys

CAP = 1000


def weeks_in(since: datetime.date, until: datetime.date):
    out, cur = [], since - datetime.timedelta(days=since.weekday())
    while cur < until:
        y, w, _ = cur.isocalendar()
        out.append((f"{y}-W{w:02d}", cur))
        cur += datetime.timedelta(days=7)
    return out


def ts(raw):
    try:
        return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError, AttributeError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    args = ap.parse_args()

    if args.granularity != "week":
        print(f"只支持 --granularity week,收到 {args.granularity}", file=sys.stderr)
        return 2

    try:
        proc = subprocess.run(
            ["gh", "pr", "list", "--state", "all", "--json",
             "createdAt,closedAt", "--limit", str(CAP)],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print("本机没有 gh(GitHub CLI),或者不在 PATH 里", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print(f"gh pr list 失败:{e.stderr.strip()}", file=sys.stderr)
        return 2

    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"gh 的输出不是 JSON:{e}", file=sys.stderr)
        return 2

    if len(rows) >= CAP:
        print(f"PR 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    spans = []  # (开出时间戳, 关闭时间戳或 None)
    for r in rows:
        c = ts(r.get("createdAt"))
        if c is None:
            continue
        spans.append((c, ts(r.get("closedAt"))))

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    for label, monday in weeks_in(since, until):
        # 周末时点 = 下周一 00:00(本机时区);左闭右开和别的脚本一致。
        t = datetime.datetime.combine(
            monday + datetime.timedelta(days=7), datetime.time(0, 0), tz
        ).timestamp()
        open_count = sum(
            1 for (c, closed) in spans if c < t and (closed is None or closed >= t)
        )
        points.append({"week": label, "value": open_count})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
