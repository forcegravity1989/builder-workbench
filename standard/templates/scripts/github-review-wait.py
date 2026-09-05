#!/usr/bin/env python3
"""评审等待 —— Workbench 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:本周**合入**的 PR,从开出到合入的中位时长,单位小时。合没合入看远端,
那个造不了假。

没有合入的周**不出点**(走势图断开)——不补 0:0 小时是「秒合」,不是「没数」。

**一趟拉全,本地按周分桶**,不按周去发查询(搜索接口不稳,真机撞到过断连)。

自己复算:

    gh pr list --state merged --json createdAt,mergedAt --limit 1000

铺一次就归这个项目,Workbench 之后再也不覆盖它。
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


def days_in(since: datetime.date, until: datetime.date):
    """窗口内的日历日,旧的在前。until 是开区间右端。"""
    out, cur = [], since
    while cur < until:
        out.append((cur.isoformat(), cur))
        cur += datetime.timedelta(days=1)
    return out


def ts(raw):
    # `2026-08-17T01:02:03Z` → 时间戳。解析不出来的给 None,不猜。
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

    if args.granularity not in ("week", "day"):
        print(f"只支持 --granularity week|day,收到 {args.granularity}", file=sys.stderr)
        return 2

    try:
        proc = subprocess.run(
            ["gh", "pr", "list", "--state", "merged", "--json",
             "createdAt,mergedAt", "--limit", str(CAP)],
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

    # 顶到上限 = 可能被截断了。宁可整条线不画,也不端一个少算的数出去。
    if len(rows) >= CAP:
        print(f"已合并 PR 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    pairs = []  # (合入时间戳, 等待小时数)
    for r in rows:
        c, m = ts(r.get("createdAt")), ts(r.get("mergedAt"))
        if c is None or m is None or m < c:
            continue
        pairs.append((m, (m - c) / 3600))

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    if args.granularity == "day":
        for label, day in days_in(since, until):
            lo = datetime.datetime.combine(day, datetime.time(0, 0), tz).timestamp()
            hi = lo + 24 * 3600
            waits = [h for (m, h) in pairs if lo <= m < hi]
            if waits:
                points.append({"day": label, "value": round(median(waits), 1)})
    else:
        for label, monday in weeks_in(since, until):
            lo = datetime.datetime.combine(monday, datetime.time(0, 0), tz).timestamp()
            hi = lo + 7 * 24 * 3600
            waits = [h for (m, h) in pairs if lo <= m < hi]
            if waits:
                points.append({"week": label, "value": round(median(waits), 1)})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
