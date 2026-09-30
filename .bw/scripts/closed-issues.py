#!/usr/bin/env python3
"""每周闭环的 issue 数 —— 可回溯采集脚本(retro = true),GitHub 远端版。

口径:**远端**上 closed 时刻落在这一周的 issue 数。本仓 Issue 正本在 GitHub,
走 `gh issue list --state closed`;本机合并提交 / PR 合入不算(口径不同)。
反映『有人提活 + 项目自己闭环快』,对「纳入 workbench 管理的项目数」有预测性。

前身 codehub-closed-issues.py 的前提「本仓远端是 codehub」已不成立(Issue 正本
迁到 GitHub),按『被替代方案不留双路径』删除,由本脚本接替;将来某个被管项目
的 Issue 正本在 CodeHub,铺入该项目时再按 codehub-cli 改写项目侧脚本。

统计对象仓库 = BW_METRICS_DATA_ROOT(缺省按脚本位置解析仓根)的 git remote
origin,解析出 GitHub owner/repo;不是 GitHub 远端则如实报错,不猜。

**一趟拉全,本地按周分桶**,不按周发查询:gh 的 closed:日期限定符按 UTC,
与指标时区(BW_METRICS_TIMEZONE,IANA,必须显式)有边界差,所以搜索窗口
向两侧各放宽 1 天,再按 closedAt 换算到指标时区的本地日期精确归周。

诚实语义(metrics 协议 references/metrics.md):
- 计数指标:窗口内某周真实为 0 是有效测量,正常出 0 点(与中位数类指标
  「无事件不出点」不同——0 个闭环是事实,不是没数据)。
- 未结束的本周或被 --until 截断的部分周,点位带 coverage={start,end},
  value 按真实覆盖范围计数;完整且已结束的自然周不声明。
- gh 未认证 / 调用失败 / 输出坏 JSON / 远端不是 GitHub / 时区未设 →
  退出码 2、stdout 无 JSON:「没采到」而不是写 0。
- 拉满 --limit 上限即警告可能截断(需要更深历史时分窗口补采)。

依赖:Python ≥ 3.11;gh 已认证;Windows 需 `pip install tzdata`。
自己复算(在仓根):

    BW_METRICS_TIMEZONE=Asia/Shanghai BW_METRICS_DATA_ROOT=. \
        python .bw/scripts/closed-issues.py \
        --since 2026-09-01 --until 2026-09-29 --granularity week
"""

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SCRIPT_ROOT = Path(__file__).resolve().parent.parent.parent  # .bw/scripts/x.py → 仓根
FETCH_LIMIT = 1000
GITHUB_REMOTE_RE = re.compile(
    r"^(?:https://github\.com/|git@github\.com:)([^/]+)/([^/]+?)(?:\.git)?$"
)


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def warn(msg: str) -> None:
    print(f"警告:{msg}", file=sys.stderr)


def resolve_repo(data_root: Path) -> str:
    proc = subprocess.run(
        ["git", "-C", str(data_root), "remote", "get-url", "origin"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if proc.returncode != 0:
        die(f"读不到 {data_root} 的 origin 远端:{proc.stderr.strip()[:200]}")
    url = proc.stdout.strip()
    match = GITHUB_REMOTE_RE.match(url)
    if not match:
        die(f"origin 不是 GitHub 远端({url}),本脚本只采 GitHub Issue;没采到,不猜")
    return f"{match.group(1)}/{match.group(2)}"


def fetch_closed(repo: str, since: dt.date, until: dt.date) -> list[dt.datetime]:
    """一趟拉全窗口(两侧各放宽 1 天兜 UTC/本地边界差),返回 closedAt 时刻列表。"""
    lo = (since - dt.timedelta(days=1)).isoformat()
    hi = until.isoformat()  # until 开区间,放宽 1 天正好覆盖
    cmd = [
        "gh", "issue", "list", "--repo", repo, "--state", "closed",
        "--search", f"closed:{lo}..{hi}",
        "--json", "number,closedAt", "--limit", str(FETCH_LIMIT),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        die(f"gh 调用失败(未认证或网络不通):{(proc.stderr or proc.stdout).strip()[:300]}")
    try:
        items = json.loads(proc.stdout)
    except json.JSONDecodeError:
        die("gh 输出不是合法 JSON")
    if len(items) >= FETCH_LIMIT:
        warn(f"拉满 {FETCH_LIMIT} 条,可能有截断;需要更深历史时分窗口补采")
    out = []
    for it in items:
        raw = it.get("closedAt")
        if not isinstance(raw, str) or not raw:
            continue  # closedAt 缺失的条目无法归周,如实跳过
        try:
            out.append(dt.datetime.fromisoformat(raw.replace("Z", "+00:00")))
        except ValueError:
            warn(f"issue #{it.get('number')} closedAt 解析失败,跳过:{raw}")
    return out


def coverage_if_partial(
    span_start: dt.datetime, span_end: dt.datetime,
    natural_start: dt.datetime, natural_end: dt.datetime, now: dt.datetime,
) -> dict | None:
    if span_start == natural_start and span_end == natural_end and span_end <= now:
        return None
    return {
        "start": span_start.isoformat(timespec="seconds"),
        "end": min(span_end, now).isoformat(timespec="seconds"),
    }


def main() -> int:
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    args = ap.parse_args()

    tz_name = os.environ.get("BW_METRICS_TIMEZONE", "").strip()
    if not tz_name:
        die("BW_METRICS_TIMEZONE 未设置:归周边界必须是明确时区,不猜")
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        die(f"BW_METRICS_TIMEZONE 不是有效 IANA 时区:{tz_name}"
            f"(Windows 的 Python 无系统时区库,需 pip install tzdata)")
    try:
        since = dt.date.fromisoformat(args.since)
        until = dt.date.fromisoformat(args.until)
    except ValueError as e:
        die(f"--since/--until 要 YYYY-MM-DD:{e}")
    if args.granularity not in ("week", "day"):
        die(f"只支持 --granularity week|day,收到 {args.granularity}")
    if until <= since:
        die(f"窗口左闭右开,--until 必须晚于 --since:{since}..{until}")

    data_root = Path(os.environ.get("BW_METRICS_DATA_ROOT") or SCRIPT_ROOT)
    repo = resolve_repo(data_root)
    closed = [m.astimezone(tz) for m in fetch_closed(repo, since, until)]
    print(f"{repo}:窗口拉回 closed issue {len(closed)} 条(含放宽日,归桶时精确过滤)",
          file=sys.stderr)

    now = dt.datetime.now(tz)
    points: list[dict] = []

    def emit(label_key: str, label: str, count: int,
             span_start: dt.datetime, span_end: dt.datetime,
             natural_start: dt.datetime, natural_end: dt.datetime) -> None:
        point: dict = {label_key: label, "value": count}
        coverage = coverage_if_partial(span_start, span_end, natural_start, natural_end, now)
        if coverage:
            point["coverage"] = coverage
        points.append(point)
        print(f"{label}:闭环 {count} 条", file=sys.stderr)

    if args.granularity == "week":
        monday = since - dt.timedelta(days=since.weekday())
        while monday < until:
            week_end = monday + dt.timedelta(days=7)
            natural_start = dt.datetime.combine(monday, dt.time.min, tz)
            natural_end = dt.datetime.combine(week_end, dt.time.min, tz)
            span_start = dt.datetime.combine(max(monday, since), dt.time.min, tz)
            span_end = dt.datetime.combine(min(week_end, until), dt.time.min, tz)
            count = sum(1 for m in closed if span_start <= m < span_end)
            iso = monday.isocalendar()
            emit("week", f"{iso.year}-W{iso.week:02d}", count,
                 span_start, span_end, natural_start, natural_end)
            monday = week_end
    else:
        day = since
        while day < until:
            natural_start = dt.datetime.combine(day, dt.time.min, tz)
            natural_end = natural_start + dt.timedelta(days=1)
            count = sum(1 for m in closed if natural_start <= m < natural_end)
            emit("day", day.isoformat(), count,
                 natural_start, natural_end, natural_start, natural_end)
            day += dt.timedelta(days=1)

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    print(file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
