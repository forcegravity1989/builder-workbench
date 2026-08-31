#!/usr/bin/env python3
"""变更前置时间 —— Workbench 铺的现成采集脚本(可回溯,retro = true)。过程指标包。

口径:按**合入**的那一周分桶,从这张 PR 分支上最早一笔提交的作者时刻到合入的
中位时长,单位小时。这是 DORA 四件套里的「变更前置时间」(lead time for
changes):动手到上主干隔了多久。

分支上一笔提交都没有、或首笔提交晚于合入时刻(数据异常)的 PR 跳过;没有合入
的周不出点(断开)。

**两步拉取,不是一趟**:列表带 commits 字段会撞 GraphQL 节点预算(真机原话:
「遍历到 authors 连接要 100 万节点,超 50 万上限」,把 --limit 压到 400 也一样)。
所以先拉轻字段清单,再**只对落在时间窗内的 PR** 逐张取提交——次数随窗内数据量
走,不随周数走;单 PR 接口是稳定端点,和「不按周发搜索查询」那条纪律不冲突。

自己复算:

    gh pr list --state merged --json number,mergedAt --limit 1000
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


def ts(raw):
    try:
        return datetime.datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError, AttributeError):
        return None


def median(xs):
    xs = sorted(xs)
    mid = len(xs) // 2
    return xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / 2


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


def first_commit_at(number: int):
    """这张 PR 分支上最早一笔提交的作者时刻;一笔都没有给 None。"""
    detail = gh_json(["pr", "view", str(number), "--json", "commits"],
                     f"gh pr view {number}")
    return min(
        (t for commit in detail.get("commits") or []
         if (t := ts(commit.get("authoredDate"))) is not None),
        default=None,
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    args = ap.parse_args()

    if args.granularity != "week":
        print(f"只支持 --granularity week,收到 {args.granularity}", file=sys.stderr)
        return 2

    rows = gh_json(["pr", "list", "--state", "merged", "--json",
                    "number,mergedAt", "--limit", str(CAP)],
                   "gh pr list")
    if len(rows) >= CAP:
        print(f"已合并 PR 超过 {CAP} 条,一趟拉不全 —— 这次不给数,免得少算",
              file=sys.stderr)
        return 2

    tz = datetime.datetime.now().astimezone().tzinfo
    since = datetime.date.fromisoformat(args.since)
    until = datetime.date.fromisoformat(args.until)
    weeks = weeks_in(since, until)
    if not weeks:
        json.dump({"points": []}, sys.stdout, ensure_ascii=False)
        return 0
    lo_all = datetime.datetime.combine(weeks[0][1], datetime.time(0, 0), tz).timestamp()
    hi_all = datetime.datetime.combine(
        weeks[-1][1] + datetime.timedelta(days=7), datetime.time(0, 0), tz
    ).timestamp()

    pairs = []  # (合入时间戳, 前置小时数) —— 只查窗内的
    for r in rows:
        m = ts(r.get("mergedAt"))
        if m is None or not (lo_all <= m < hi_all):
            continue
        first = first_commit_at(r["number"])
        if first is None or first > m:
            continue
        pairs.append((m, (m - first) / 3600))

    points = []
    for label, monday in weeks:
        lo = datetime.datetime.combine(monday, datetime.time(0, 0), tz).timestamp()
        hi = lo + 7 * 24 * 3600
        leads = [h for (m, h) in pairs if lo <= m < hi]
        if leads:
            points.append({"week": label, "value": round(median(leads), 1)})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
