#!/usr/bin/env python3
"""距上次发版天数 —— Workbench 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:每个周末(周日)距最近一个 **git 标签**日期的天数。发版的正本就是打标签
——Workbench 的交付判据读的也是标签日期,两边同源。这是 DORA「部署频率」的单人版:
数字越小说明发得越勤,一路涨说明这条产线在断供。

那一周还没有任何标签的,不出点(断开)——不是 0:0 天意味着当天刚发版。
仓里一个标签都没有时输出空序列,界面如实显示「尚无观测」。

自己复算:

    git tag --list --format='%(creatordate:short) %(refname:short)'

铺一次就归这个项目,Workbench 之后再也不覆盖它。
"""

import argparse
import datetime
import json
import subprocess
import sys


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
            ["git", "tag", "--list", "--format=%(creatordate:short)"],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print("本机没有 git,或者不在 PATH 里", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print(f"git tag 失败:{e.stderr.strip()}", file=sys.stderr)
        return 2

    dates = []
    for line in proc.stdout.splitlines():
        try:
            dates.append(datetime.date.fromisoformat(line.strip()))
        except ValueError:
            continue

    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    if args.granularity == "day":
        for label, day in days_in(since, until):
            latest = max((d for d in dates if d <= day), default=None)
            if latest is not None:
                points.append({"day": label, "value": (day - latest).days})
    else:
        for label, monday in weeks_in(since, until):
            sunday = monday + datetime.timedelta(days=6)
            latest = max((d for d in dates if d <= sunday), default=None)
            if latest is not None:
                points.append({"week": label, "value": (sunday - latest).days})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
