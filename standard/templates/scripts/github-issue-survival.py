#!/usr/bin/env python3
"""活存活率 —— buddy 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:本周**关闭**的远端 issue 里,「完成关闭」(stateReason = COMPLETED)的
占比(0-100 的百分数)。另一头是「不做了」(NOT_PLANNED)。量的是端出来的
想法有多少真走到了头——playbook 叫它 intent 的存活率。

BW 的机制保证了这个口径的硬度:合入 PR 经 `Closes #n` 连带完成关闭 issue,
所以「完成关闭」背后是真合入,造不了假。重开过又关的按当前 stateReason 算。
`gh issue list` 天然不含 PR。没有关闭动作的周不出点(断开)。

自己复算:

    gh issue list --state all --json closedAt,stateReason --limit 1000

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
            ["gh", "issue", "list", "--state", "all", "--json",
             "closedAt,stateReason", "--limit", str(CAP)],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print("本机没有 gh(GitHub CLI),或者不在 PATH 里", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print(f"gh issue list 失败:{e.stderr.strip()}", file=sys.stderr)
        return 2

    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"gh 的输出不是 JSON:{e}", file=sys.stderr)
        return 2

    if len(rows) >= CAP:
        print(f"issue 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    closes = []  # (关闭时间戳, 是不是完成关闭)
    for r in rows:
        t = ts(r.get("closedAt"))
        if t is None:
            continue
        closes.append((t, r.get("stateReason") == "COMPLETED"))

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    for label, monday in weeks_in(since, until):
        lo = datetime.datetime.combine(monday, datetime.time(0, 0), tz).timestamp()
        hi = lo + 7 * 24 * 3600
        wk = [done for (t, done) in closes if lo <= t < hi]
        if wk:
            points.append({"week": label,
                           "value": round(100 * sum(wk) / len(wk))})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
