#!/usr/bin/env python3
"""按明确时区统计指定 Git 提交可达的提交数，输出实际覆盖窗口。

BW_METRICS_TIMEZONE 必须显式设置为 IANA 时区；服务另传
BW_METRICS_DATA_ROOT / BW_METRICS_DATA_COMMIT，避免把采集脚本工作树
当成被统计分支。独立运行时数据源默认为当前目录的 HEAD，开始时固定为 SHA。
设置上述环境变量后复算：python git-commits.py --since 2026-03-02 --until 2026-03-09 --granularity week

不带 --all；不使用会提前停止遍历的 git log --since。读取全部可达提交时刻，
按真实日历边界和本次观测截止时刻过滤。铺入项目后由项目维护，不自动覆盖。
"""

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def calendar_start(day, timezone):
    """当地日期首次出现的秒；支持重复/跳过午夜，整日不存在则拒绝。"""
    nominal = int(dt.datetime.combine(day, dt.time.min, dt.timezone.utc).timestamp())
    for sample in range(nominal - 172800, nominal + 172801, 3600):
        if dt.datetime.fromtimestamp(sample, timezone).date() != day:
            continue
        before, inside = sample - 3600, sample
        while inside - before > 1:
            middle = (before + inside) // 2
            if dt.datetime.fromtimestamp(middle, timezone).date() == day:
                inside = middle
            else:
                before = middle
        return inside
    raise ValueError(f"时区中的日期不存在：{day}")


def collect_points(stamps, since, until, granularity, timezone, observed_until):
    step = 7 if granularity == "week" else 1
    points, day = [], since
    while day < until:
        end_day = day + dt.timedelta(days=step)
        start = calendar_start(day, timezone)
        end = min(calendar_start(end_day, timezone), observed_until)
        if end > start:
            year, week, _ = day.isocalendar()
            label = f"{year}-W{week:02d}" if granularity == "week" else day.isoformat()
            points.append({
                granularity: label,
                "value": sum(1 for stamp in stamps if start <= stamp < end),
                "coverage": {
                    "start": dt.datetime.fromtimestamp(start, dt.timezone.utc).isoformat(),
                    "end": dt.datetime.fromtimestamp(end, dt.timezone.utc).isoformat(),
                },
            })
        day = end_day
    return points


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", required=True)
    parser.add_argument("--until", required=True)
    parser.add_argument("--granularity", choices=("week", "day"), default="week")
    args = parser.parse_args()
    try:
        since = dt.date.fromisoformat(args.since)
        until = dt.date.fromisoformat(args.until)
        if since >= until:
            raise ValueError("since 必须早于 until，结束日期不包含在内")
        if args.granularity == "week" and (since.weekday() != 0 or until.weekday() != 0):
            raise ValueError("周查询须使用周一到周一边界；任意日期范围请按 day 查询")
        timezone_name = os.environ.get("BW_METRICS_TIMEZONE")
        if not timezone_name:
            raise ValueError("请显式设置 BW_METRICS_TIMEZONE；不猜测本机时区")
        timezone = dt.timezone.utc if timezone_name == "UTC" else ZoneInfo(timezone_name)
        root = os.environ.get("BW_METRICS_DATA_ROOT", os.getcwd())
        requested_ref = os.environ.get("BW_METRICS_DATA_COMMIT", "HEAD")
        observed_until = dt.datetime.now(dt.timezone.utc).timestamp()

        def git(*arguments):
            return subprocess.run(
                ["git", "-C", root, *arguments], capture_output=True,
                text=True, check=True, encoding="utf-8",
            ).stdout.strip()

        commit = git("rev-parse", "--verify", "--end-of-options", f"{requested_ref}^{{commit}}")
        stamps = [int(value) for value in git("log", "--pretty=format:%ct", commit).split()]
        points = collect_points(stamps, since, until, args.granularity, timezone, observed_until)
        json.dump({"points": points}, sys.stdout, ensure_ascii=False)
        return 0
    except ZoneInfoNotFoundError:
        print("Python 无法读取指定 IANA 时区；请核对时区名和此宿主的时区数据。", file=sys.stderr)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        detail = error.stderr.strip() if isinstance(error, subprocess.CalledProcessError) else str(error)
        print(f"采集失败：{detail}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
