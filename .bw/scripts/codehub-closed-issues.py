#!/usr/bin/env python3
"""每周闭环的 issue 数 —— 可回溯采集脚本(retro = true)。

口径:**远端**上 closed 时刻落在这一周的 issue 数。本仓远端是 codehub,走
`codehub-cli issue list --state closed`,不走 gh。

为什么收这条:workbench 平台本身会记项目级**代码仓**指标(提交数 / MR 合入数),
那些不进 `.bw/config/metrics.toml` 免得重复记。issue 闭环数是**工作管理**类指标(活被
提出又被解决),平台不代记,所以这里自己采。

**一趟拉全,本地按周分桶**,不按周去发查询。

自己复算:

    codehub-cli issue list --state closed --json iid,closed_at --limit 1000

铺一次就归这个项目,Workbench 之后再也不覆盖它 —— 要改口径直接改这里。
"""

import argparse
import datetime
import json
import subprocess
import sys

CAP = 1000


def weeks_in(since: datetime.date, until: datetime.date):
    """窗口内的 ISO 周,旧的在前。until 是开区间右端。"""
    out, cur = [], since - datetime.timedelta(days=since.weekday())
    while cur < until:
        y, w, _ = cur.isocalendar()
        out.append((f"{y}-W{w:02d}", cur))
        cur += datetime.timedelta(days=7)
    return out


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 默认 gbk,中文会乱码

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
            ["codehub-cli", "issue", "list", "--state", "closed",
             "--json", "iid,closed_at", "--limit", str(CAP)],
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError:
        print("本机没有 codehub-cli,或者不在 PATH 里", file=sys.stderr)
        return 2
    except subprocess.CalledProcessError as e:
        print(f"codehub-cli issue list 失败:{e.stderr.strip()}", file=sys.stderr)
        return 2

    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"codehub-cli 的输出不是 JSON:{e}", file=sys.stderr)
        return 2

    # 顶到上限 = 可能被截断了。宁可整条线不画,也不端一个少算的数出去。
    if len(rows) >= CAP:
        print(f"已闭环 issue 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    tz = datetime.datetime.now().astimezone().tzinfo
    stamps = []
    for r in rows:
        raw = r.get("closed_at")
        if not raw:
            continue
        # codehub 给 `2026-08-26T14:14:17.510+08:00`;Python 3.11+ 的 fromisoformat 认。
        # 兼容可能出现的 `Z` 结尾。
        try:
            stamps.append(
                datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
            )
        except ValueError:
            continue

    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    points = []
    for label, monday in weeks_in(since, until):
        lo = datetime.datetime.combine(monday, datetime.time(0, 0), tz).timestamp()
        hi = lo + 7 * 24 * 3600
        points.append({"week": label, "value": sum(1 for t in stamps if lo <= t < hi)})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
