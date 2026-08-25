#!/usr/bin/env python3
"""首审等待 —— buddy 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:按 PR **开出**的那一周分桶,从开出到**首条评审事件**(正式 review 或
PR 评论,取更早的)的中位时长,单位小时。

**单人仓大多数 PR 没有评审事件,这条常年可能是空的——空如实。** 不拿合入时刻
凑数:「合了」和「有人来看过」是两回事。没有任何评审事件的 PR 不参与计算;
一整周都没有的,不出点(断开)。

自己复算:

    gh pr list --state merged --json createdAt,reviews,comments --limit 1000

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


def median(xs):
    xs = sorted(xs)
    mid = len(xs) // 2
    return xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / 2


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
            ["gh", "pr", "list", "--state", "merged", "--json",
             "createdAt,reviews,comments", "--limit", str(CAP)],
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
        print(f"已合并 PR 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    pairs = []  # (开出时间戳, 首审等待小时数)
    for r in rows:
        c = ts(r.get("createdAt"))
        if c is None:
            continue
        events = []
        for rv in r.get("reviews") or []:
            t = ts(rv.get("submittedAt"))
            if t is not None:
                events.append(t)
        for cm in r.get("comments") or []:
            t = ts(cm.get("createdAt"))
            if t is not None:
                events.append(t)
        first = min((t for t in events if t >= c), default=None)
        if first is None:
            continue
        pairs.append((c, (first - c) / 3600))

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    for label, monday in weeks_in(since, until):
        lo = datetime.datetime.combine(monday, datetime.time(0, 0), tz).timestamp()
        hi = lo + 7 * 24 * 3600
        waits = [h for (c, h) in pairs if lo <= c < hi]
        if waits:
            points.append({"week": label, "value": round(median(waits), 1)})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
