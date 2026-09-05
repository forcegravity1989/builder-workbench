#!/usr/bin/env python3
"""手册修正频次 —— Workbench 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:仓根 `AGENTS.md` 与 `CLAUDE.md`(项目自己的开发手册)每周被提交改动的
次数,数当前分支的本仓 git 历史。playbook 的用法:错两次的纠正就该进手册——
这条曲线是那个回路在不在转的最便宜信号:长期为 0 多半说明手册没人喂,而不是
没有错。

每周都出点——0 是真实的 0(这周确实没人改手册)。「重复错误有没有被抓到」
那一半是另一条指标(由资产盘点剧本产出),不在本脚本。

自己复算:

    git log --oneline -- AGENTS.md CLAUDE.md

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

    # 和 git-commits.py 同款:数当前分支,不带 --all(否则一次 fetch 就能把
    # 数字刷上去)。%ct 是提交者时刻的时间戳。
    try:
        proc = subprocess.run(
            ["git", "log", "--pretty=%ct", "--", "AGENTS.md", "CLAUDE.md"],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print("本机没有 git,或者不在 PATH 里", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print(f"git log 失败:{e.stderr.strip()}", file=sys.stderr)
        return 2

    stamps = []
    for line in proc.stdout.split():
        try:
            stamps.append(int(line))
        except ValueError:
            continue

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    if args.granularity == "day":
        for label, day in days_in(since, until):
            lo = datetime.datetime.combine(day, datetime.time(0, 0), tz).timestamp()
            hi = lo + 24 * 3600
            points.append({"day": label,
                           "value": sum(1 for t in stamps if lo <= t < hi)})
    else:
        for label, monday in weeks_in(since, until):
            lo = datetime.datetime.combine(monday, datetime.time(0, 0), tz).timestamp()
            hi = lo + 7 * 24 * 3600
            points.append({"week": label,
                           "value": sum(1 for t in stamps if lo <= t < hi)})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
