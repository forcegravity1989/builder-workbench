#!/usr/bin/env python3
"""返工轮数 —— Workbench 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:本周合入的 PR,平均每张「开出之后追加的提交数」。它是首过率的另一面:
首过率数「零追加的占比」,这条数「追加了几个」。同一份数据,两种读法,各自
独立成脚本——一条指标一个脚本,不搞共享状态。

**两步拉取,不是一趟**:列表带 commits 字段会撞 GraphQL 节点预算(真机原话:
「遍历到 authors 连接要 100 万节点,超 50 万上限」,把 --limit 压到 400 也一样)。
所以先拉轻字段清单,再**只对落在时间窗内的 PR** 逐张取提交——次数随窗内数据量
走,不随周数走;单 PR 接口是稳定端点,和「不按周发搜索查询」那条纪律不冲突。

没有合入的周不出点(断开)。

自己复算:

    gh pr list --state merged --json number,createdAt,mergedAt --limit 1000
    gh pr view <号> --json commits   # 窗内每张

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
    try:
        return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError, AttributeError):
        return None


def gh_json(argv, what):
    try:
        proc = subprocess.run(["gh", *argv], capture_output=True, text=True, check=True)
    except FileNotFoundError:
        print("本机没有 gh(GitHub CLI),或者不在 PATH 里", file=sys.stderr)
        raise SystemExit(2)
    except subprocess.CalledProcessError as e:
        print(f"{what} 失败:{e.stderr.strip()}", file=sys.stderr)
        raise SystemExit(2)
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        print(f"{what} 的输出不是 JSON:{e}", file=sys.stderr)
        raise SystemExit(2)


def late_commits(number: int, created: float) -> int:
    """这张 PR 开出之后追加的提交数。取不到就整次失败,绝不悄悄当 0。"""
    detail = gh_json(["pr", "view", str(number), "--json", "commits"],
                     f"gh pr view {number}")
    late = 0
    for commit in detail.get("commits") or []:
        t = ts(commit.get("committedDate"))
        if t is not None and t > created:
            late += 1
    return late


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    args = ap.parse_args()

    if args.granularity not in ("week", "day"):
        print(f"只支持 --granularity week|day,收到 {args.granularity}", file=sys.stderr)
        return 2

    rows = gh_json(["pr", "list", "--state", "merged", "--json",
                    "number,createdAt,mergedAt", "--limit", str(CAP)],
                   "gh pr list")
    if len(rows) >= CAP:
        print(f"已合并 PR 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    if args.granularity == "day":
        buckets = [("day", label, day) for label, day in days_in(since, until)]
        span = datetime.timedelta(days=1)
    else:
        buckets = [("week", label, monday) for label, monday in weeks_in(since, until)]
        span = datetime.timedelta(days=7)
    if not buckets:
        json.dump({"points": []}, sys.stdout, ensure_ascii=False)
        return 0
    lo_all = datetime.datetime.combine(buckets[0][2], datetime.time(0, 0), tz).timestamp()
    hi_all = datetime.datetime.combine(
        buckets[-1][2] + span, datetime.time(0, 0), tz
    ).timestamp()

    prs = []  # (合入时间戳, 开出后追加的提交数) —— 只查窗内的
    for r in rows:
        c, m = ts(r.get("createdAt")), ts(r.get("mergedAt"))
        if c is None or m is None or not (lo_all <= m < hi_all):
            continue
        prs.append((m, late_commits(r["number"], c)))

    points = []
    for key, label, start in buckets:
        lo = datetime.datetime.combine(start, datetime.time(0, 0), tz).timestamp()
        hi = datetime.datetime.combine(start + span, datetime.time(0, 0), tz).timestamp()
        wk = [late for (m, late) in prs if lo <= m < hi]
        if wk:
            points.append({key: label,
                           "value": round(sum(wk) / len(wk), 1)})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
