#!/usr/bin/env python3
"""任务交付周期 —— 可回溯采集脚本(retro = true),GitHub 远端版。

口径(2026-11-13 与项目负责人确认):
- 起点:Issue 创建时刻(本仓 Issue 正本在 GitHub,`gh issue list`)。
- 终点:该 Issue **最早创建**的关联 PR 的创建时刻(产出待评审 PR 即止,
  不等到合入)。
- 配对:PR 行首「关联 #N」行与 Fixes/Closes 子句里的每个编号都参与配对
  (一行多个、多行、顿号/逗号/空格分隔都算);只认本仓 Issue,引用到 PR 编号的跳过。
- 一个 Issue 只取最早创建的关联 PR(返工 PR 不重复计)。若这个最早 PR 早于
  Issue 创建(事后补单,周期为负),该 Issue 不进样本,不回退改用更晚的 PR。
- 聚合:按 PR 创建时刻在指标时区(BW_METRICS_TIMEZONE,IANA,必须显式)的
  自然日/ISO 周分桶,取该桶内配对时长的中位数,单位小时,保留 1 位小数。
- 无配对样本的桶不出点(中位数无定义,不是 0);0h 是有效读数。

统计对象仓库 = BW_METRICS_DATA_ROOT(缺省按脚本位置解析仓根)的 git remote
origin,解析出 GitHub owner/repo;不是 GitHub 远端则如实报错,不猜。

**一趟拉全,本地按周分桶**:gh 不支持按创建时刻做区间搜索的稳定语义,
直接拉全部 Issue 与 PR 后本地过滤;拉满 --limit 上限即失败,不把可能截断的
结果当完整历史。

诚实语义(metrics 协议 references/metrics.md):
- 未结束的本周/本日或被 --until 截断的部分桶,点位带 coverage={start,end},
  value 按真实覆盖范围算中位数;完整且已结束的自然桶不声明。
- gh 未认证 / 调用失败 / 输出坏 JSON / 远端不是 GitHub / 时区未设 /
  整个窗口没有配对样本 → 退出码 2、stdout 无 JSON:「没采到」而不是写 0。

依赖:Python ≥ 3.11;gh 已认证;Windows 需 `pip install tzdata`。
解释器 token 按采集宿主填写:本仓宿主是 Windows,`python` 可用而 `python3` 不存在,
所以目录登记 `python`;宿主没有 `python` 时需按宿主调整 run。
自己复算(在仓根):

    BW_METRICS_TIMEZONE=Asia/Shanghai BW_METRICS_DATA_ROOT=. \
        python .bw/scripts/task-cycle-hours.py \
        --since 2026-09-28 --until 2026-11-09 --granularity week
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
FETCH_LIMIT = 2000
GITHUB_REMOTE_RE = re.compile(
    r"^(?:https://github\.com/|git@github\.com:)([^/]+)/([^/]+?)(?:\.git)?$"
)
# 本仓 PR 正文约定「关联 #N」行,一行可列多个编号;兼容 Fixes/Closes 子句。每个编号都配对。
LINK_RE = re.compile(
    r"^[ \t]*关联[ \t]*(#[0-9]+(?:[ \t]*[、,，][ \t]*#[0-9]+)*)", re.MULTILINE)
CLOSE_RE = re.compile(
    r"\b(?:fix(?:es)?|close[sd]?)[ \t]*[:：]?[ \t]*"
    r"(#[0-9]+(?:[ \t]*[、,，]?[ \t]*#[0-9]+)*)",
    re.IGNORECASE)
HASH_RE = re.compile(r"#(\d+)")


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def gh_json(repo: str, args: list[str], what: str, fields: str = "number,createdAt") -> list[dict]:
    cmd = ["gh", *args, "--repo", repo, "--json", fields,
           "--limit", str(FETCH_LIMIT)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                              stdin=subprocess.DEVNULL)
    except OSError as error:
        die(f"gh 无法启动:{error}")
    if proc.returncode != 0:
        die(f"gh 调用失败(未认证或网络不通):{(proc.stderr or proc.stdout).strip()[:300]}")
    try:
        items = json.loads(proc.stdout)
    except json.JSONDecodeError:
        die(f"gh 输出不是合法 JSON({what})")
    if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
        die(f"gh 输出不是{what}数组")
    if len(items) >= FETCH_LIMIT:
        die(f"{what}达到 {FETCH_LIMIT} 条上限,无法证明历史完整;需要分页改造后再采")
    return items


def parse_instant(value: object, label: str) -> dt.datetime:
    if not isinstance(value, str) or not value:
        die(f"{label} 没有 createdAt,无法计时")
    try:
        when = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        die(f"{label} createdAt 解析失败:{value}")
    if when.tzinfo is None:
        die(f"{label} createdAt 没有明确时区:{value}")
    return when


def linked_issue_numbers(body: object) -> list[int]:
    if not isinstance(body, str):
        return []
    numbers: list[int] = []
    for match in (*LINK_RE.finditer(body), *CLOSE_RE.finditer(body)):
        for number in HASH_RE.findall(match.group(1)):
            value = int(number)
            if value not in numbers:
                numbers.append(value)
    return numbers


def build_pairs(prs: list[dict], issues: list[dict]) -> list[tuple[dt.datetime, dt.datetime, int]]:
    """返回 (issue_created, pr_created, pr_number):每 Issue 只取最早 PR,排除负周期。"""
    issue_created: dict[int, dt.datetime] = {}
    for item in issues:
        number = item.get("number")
        if not isinstance(number, int):
            continue
        issue_created[number] = parse_instant(item.get("createdAt"), f"Issue #{number}")
    pr_numbers = {item.get("number") for item in prs if isinstance(item.get("number"), int)}

    earliest: dict[int, tuple[dt.datetime, int]] = {}
    skipped_pr_ref = 0
    skipped_unknown = 0
    for item in prs:
        number = item.get("number")
        if not isinstance(number, int):
            continue
        created = parse_instant(item.get("createdAt"), f"PR #{number}")
        for issue in linked_issue_numbers(item.get("body")):
            if issue not in issue_created:
                if issue in pr_numbers:
                    skipped_pr_ref += 1
                else:
                    skipped_unknown += 1
                continue
            previous = earliest.get(issue)
            if previous is None or created < previous[0]:
                earliest[issue] = (created, number)
    if skipped_pr_ref:
        print(f"跳过 {skipped_pr_ref} 个引用到 PR 编号的配对", file=sys.stderr)
    if skipped_unknown:
        print(f"跳过 {skipped_unknown} 个引用不到本仓 Issue 的配对", file=sys.stderr)

    pairs = []
    negative = 0
    for issue, (pr_created, pr_number) in earliest.items():
        start = issue_created[issue]
        if pr_created < start:
            negative += 1
            continue
        pairs.append((start, pr_created, pr_number))
    if negative:
        print(f"排除 {negative} 对 PR 早于 Issue 的事后补单", file=sys.stderr)
    return pairs


def median_hours(durations: list[float]) -> float:
    ordered = sorted(durations)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        value = ordered[middle]
    else:
        value = (ordered[middle - 1] + ordered[middle]) / 2
    return round(value, 1)


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


def build_points(
    pairs: list[tuple[dt.datetime, dt.datetime, int]], granularity: str,
    since: dt.date, until: dt.date, tz: ZoneInfo, now: dt.datetime,
) -> list[dict]:
    """按指标时区的自然桶取中位数;空桶不出点,部分覆盖声明 coverage。"""
    points: list[dict] = []

    def emit(label_key: str, label: str, bucket: list[float],
             span_start: dt.datetime, span_end: dt.datetime,
             natural_start: dt.datetime, natural_end: dt.datetime) -> None:
        if not bucket:
            return  # 中位数无样本不出点,不是 0
        if span_start >= min(span_end, now):
            return
        point: dict = {label_key: label, "value": median_hours(bucket)}
        coverage = coverage_if_partial(span_start, span_end, natural_start, natural_end, now)
        if coverage:
            point["coverage"] = coverage
        points.append(point)
        print(f"{label}:中位 {point['value']}h({len(bucket)} 对)", file=sys.stderr)

    if granularity == "week":
        monday = since - dt.timedelta(days=since.weekday())
        while monday < until:
            week_end = monday + dt.timedelta(days=7)
            natural_start = dt.datetime.combine(monday, dt.time.min, tz)
            natural_end = dt.datetime.combine(week_end, dt.time.min, tz)
            span_start = dt.datetime.combine(max(monday, since), dt.time.min, tz)
            span_end = dt.datetime.combine(min(week_end, until), dt.time.min, tz)
            bucket = [
                (created - start).total_seconds() / 3600
                for start, created, _ in pairs
                if span_start <= created < span_end
            ]
            iso = monday.isocalendar()
            emit("week", f"{iso.year}-W{iso.week:02d}", bucket,
                 span_start, span_end, natural_start, natural_end)
            monday = week_end
    else:
        day = since
        while day < until:
            natural_start = dt.datetime.combine(day, dt.time.min, tz)
            natural_end = natural_start + dt.timedelta(days=1)
            bucket = [
                (created - start).total_seconds() / 3600
                for start, created, _ in pairs
                if natural_start <= created < natural_end
            ]
            emit("day", day.isoformat(), bucket,
                 natural_start, natural_end, natural_start, natural_end)
            day += dt.timedelta(days=1)
    return points


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
    proc = subprocess.run(
        ["git", "-C", str(data_root), "remote", "get-url", "origin"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if proc.returncode != 0:
        die(f"读不到 {data_root} 的 origin 远端:{proc.stderr.strip()[:200]}")
    url = proc.stdout.strip()
    match = GITHUB_REMOTE_RE.match(url)
    if not match:
        die(f"origin 不是 GitHub 远端({url}),本脚本只采 GitHub Issue/PR;没采到,不猜")
    repo = f"{match.group(1)}/{match.group(2)}"

    issues = gh_json(repo, ["issue", "list", "--state", "all"], " Issue ")
    prs = gh_json(repo, ["pr", "list", "--state", "all"], " PR ", "number,createdAt,body")
    now = dt.datetime.now(tz)
    pairs = [(start, created.astimezone(tz), number)
             for start, created, number in build_pairs(prs, issues) if created < now]
    print(f"{repo}:拉回 Issue {len(issues)} 条、PR {len(prs)} 条,有效配对 {len(pairs)} 对",
          file=sys.stderr)

    points = build_points(pairs, args.granularity, since, until, tz, now)
    if not points:
        die("窗口内没有可用配对样本,按协议报采集失败,不写 0")

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    print(file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
