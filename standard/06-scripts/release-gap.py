#!/usr/bin/env python3
"""距上次发版天数 —— buddy 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:每个周末(周日)距最近一次发版日的天数,读 `.bw/releases.md`(发版记录
正本)的「发版日」列。这是 DORA「部署频率」的单人版:数字越小说明发得越勤,
一路涨说明这条产线在断供。

回填的历史发版行**参与计算**(它如实解释历史)。要不要给这条设目标、让回填行
影响点灯,由人自己决定——模板里目标默认留空(留空 = 永不参与见红)。

那一周还没有任何发版记录的,不出点(断开)——不是 0:0 天意味着当天刚发版。
文件还不存在(项目从没发过版)时如实报错,等第一次发版后才有数。

自己复算:

    grep '^|' .bw/releases.md

铺一次就归这个项目,buddy 之后再也不覆盖它。
"""

import argparse
import datetime
import json
import sys
from pathlib import Path

RELEASES = Path(".bw/releases.md")


def weeks_in(since: datetime.date, until: datetime.date):
    out, cur = [], since - datetime.timedelta(days=since.weekday())
    while cur < until:
        y, w, _ = cur.isocalendar()
        out.append((f"{y}-W{w:02d}", cur))
        cur += datetime.timedelta(days=7)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    args = ap.parse_args()

    if args.granularity != "week":
        print(f"只支持 --granularity week,收到 {args.granularity}", file=sys.stderr)
        return 2

    if not RELEASES.is_file():
        print("还没有 .bw/releases.md(发版记录)——这条指标等第一次发版后才有数",
              file=sys.stderr)
        return 2

    # 只认 buddy 那张表的行:`| 版本号 | 发版日 | 说明 | 包含的活 | 来源 |`。
    # 第二列解析成日期;表头、分隔行、别的表格自然解析不出,跳过、不猜。
    dates = []
    for line in RELEASES.read_text(encoding="utf-8").splitlines():
        if not line.lstrip().startswith("|"):
            continue
        parts = line.split("|")
        if len(parts) < 3:
            continue
        try:
            dates.append(datetime.date.fromisoformat(parts[2].strip()))
        except ValueError:
            continue

    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    for label, monday in weeks_in(since, until):
        sunday = monday + datetime.timedelta(days=6)
        latest = max((d for d in dates if d <= sunday), default=None)
        if latest is not None:
            points.append({"week": label, "value": (sunday - latest).days})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
