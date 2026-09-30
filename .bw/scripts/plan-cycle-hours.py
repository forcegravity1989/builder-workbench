#!/usr/bin/env python3
"""计划制定时长 —— 可回溯指标协议脚本(retro = true),注册在 .bw/metrics.toml。

指标口径(#284 拍板):白名单项目在窗口内合入的 PR,从该 ISO 周周一 09:00
(BW_METRICS_TIMEZONE 时区)到 PR 合入时刻(mergedAt,provider 真源)的时长,
周点位取中位数(小时,1 位小数)。测的是周交付节奏:本周的活是周初就滚起来,
还是拖到周末才合入。

数据依赖(本脚本只读本地文件,不查远端,秒级):
- .bw/managed-projects.toml  白名单 = 统计范围的当前事实(除名项目的事件不计,
  与「纳入项目数」同一约定);
- .bw/metrics/daily-observation.jsonl  项目侧预采集写的合入事件账
  (bw/daily-observation/v1,collect-daily-observation.py 维护)。

服务运行时数据目标经 BW_METRICS_DATA_ROOT / BW_METRICS_DATA_COMMIT 传入,
不能把采集器 cwd 当数据分支;BW_METRICS_TIMEZONE 必须显式为 IANA 时区。
依赖:Python ≥ 3.11;Windows 的 Python 无系统时区库,需 `pip install tzdata`。
独立复算(在仓根):

    BW_METRICS_TIMEZONE=Asia/Shanghai BW_METRICS_DATA_ROOT=. \
        python .bw/scripts/plan-cycle-hours.py \
        --since 2026-09-01 --until 2026-09-29 --granularity week

诚实语义(metrics 协议 references/metrics.md):
- 窗口左闭右开;week 点位标 ISO 周(YYYY-Www),day 点位标 YYYY-MM-DD。
- 没有合入事件的周/日**不出点**——中位数没有「0 小时」的诚实说法,不补 0。
- 整个窗口一个事件都没有、数据文件缺失/为空、白名单不可读、时区未设 →
  退出码 2、stdout 无 JSON:「没采到」而不是写 0。
- 未结束的本周/本日,或被 --until 截断的部分窗口,点位带 coverage={start,end}
  (带时区偏移的 ISO 时间),value 按真实覆盖范围计算;覆盖不越出自然窗口。
- 早于周一 09:00 合入的 PR 时长为负(如周一凌晨合入上周的活),如实保留,
  不截到 0——那是事实的一部分。
- 事件账里 (remote, pr) 跨行去重;单行损坏警告并跳过,不阻断其余数据。
"""

import argparse
import datetime as dt
import json
import os
import statistics
import sys
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    import tomllib  # Python ≥ 3.11 标准库
except ModuleNotFoundError:  # pragma: no cover
    sys.stderr.reconfigure(encoding="utf-8")
    print("需要 Python ≥ 3.11(标准库 tomllib / zoneinfo)", file=sys.stderr)
    sys.exit(2)

SCHEMA = "bw/daily-observation/v1"
ANCHOR = dt.time(9, 0)  # 周一 09:00,项目时区
SCRIPT_ROOT = Path(__file__).resolve().parent.parent.parent  # .bw/scripts/x.py → 仓根


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def warn(msg: str) -> None:
    print(f"警告:{msg}", file=sys.stderr)


def parse_instant(text: str) -> dt.datetime | None:
    try:
        when = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return when if when.tzinfo else when.replace(tzinfo=dt.timezone.utc)


def scope_remotes(data_root: Path) -> set[str]:
    whitelist = data_root / ".bw" / "managed-projects.toml"
    if not whitelist.is_file():
        die(f"白名单不存在:{whitelist}")
    try:
        data = tomllib.loads(whitelist.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        die(f"白名单解析失败:{e}")
    remotes = {
        p["remote"] for p in (data.get("projects") or [])
        if isinstance(p.get("remote"), str)
    }
    if not remotes:
        die("白名单为空,统计范围不成立")
    return remotes


def load_events(data_root: Path, remotes: set[str]) -> dict[tuple[str, int], dt.datetime]:
    path = data_root / ".bw" / "metrics" / "daily-observation.jsonl"
    if not path.is_file():
        die(f"事件账不存在:{path} —— 预采集尚未跑过,未采到(不写 0)")
    events: dict[tuple[str, int], dt.datetime] = {}
    empty = True
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        empty = False
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            warn(f"事件账第 {lineno} 行损坏,跳过(不阻断其余数据)")
            continue
        if row.get("schema") != SCHEMA:
            warn(f"事件账第 {lineno} 行 schema 非 {SCHEMA},跳过")
            continue
        for project in row.get("projects") or []:
            remote = project.get("remote")
            if remote not in remotes:
                continue  # 白名单即当前事实:除名项目的事件不计
            for ev in (project.get("signals") or {}).get("pr_merges") or []:
                pr = ev.get("pr")
                merged = parse_instant(ev.get("merged_at") or "")
                if isinstance(pr, int) and merged and (remote, pr) not in events:
                    events[(remote, pr)] = merged
    if empty:
        die(f"事件账为空:{path} —— 未采到(不写 0)")
    return events


def median_hours(
    moments: list[dt.datetime], anchor: dt.datetime
) -> tuple[float, int] | None:
    if not moments:
        return None
    hours = [(m - anchor).total_seconds() / 3600 for m in moments]
    return round(statistics.median(hours), 1), len(hours)


def coverage_if_partial(
    span_start: dt.datetime, span_end: dt.datetime,
    natural_start: dt.datetime, natural_end: dt.datetime, now: dt.datetime,
) -> dict | None:
    """点位窗口与自然窗口不一致(被 --since/--until 截断)或尚未结束时返回
    coverage;完整且已结束的自然窗口返回 None。部分窗口不得伪装成完整周/日。"""
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
        die("BW_METRICS_TIMEZONE 未设置:锚点(周一 09:00)必须是明确时区,不猜")
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
    events = load_events(data_root, scope_remotes(data_root))
    print(f"事件账可用事件 {len(events)} 条(白名单范围内,已按 remote+pr 去重)",
          file=sys.stderr)

    now = dt.datetime.now(tz)
    points: list[dict] = []

    def emit(label_key: str, label: str, moments: list[dt.datetime],
             anchor: dt.datetime, span_start: dt.datetime, span_end: dt.datetime,
             natural_start: dt.datetime, natural_end: dt.datetime) -> None:
        result = median_hours(moments, anchor)
        if result is None:
            return  # 没有事件的周/日不出点,不补 0
        value, count = result
        point = {label_key: label, "value": value}
        coverage = coverage_if_partial(span_start, span_end, natural_start, natural_end, now)
        if coverage:
            point["coverage"] = coverage
        points.append(point)
        print(f"{label}:样本 {count} 条,中位 {value} 小时", file=sys.stderr)

    if args.granularity == "week":
        monday = since - dt.timedelta(days=since.weekday())
        while monday < until:
            week_end = monday + dt.timedelta(days=7)
            natural_start = dt.datetime.combine(monday, dt.time.min, tz)
            natural_end = dt.datetime.combine(week_end, dt.time.min, tz)
            span_start = dt.datetime.combine(max(monday, since), dt.time.min, tz)
            span_end = dt.datetime.combine(min(week_end, until), dt.time.min, tz)
            moments = [
                m.astimezone(tz) for m in events.values()
                if span_start <= m.astimezone(tz) < span_end
            ]
            iso = monday.isocalendar()
            anchor = dt.datetime.combine(monday, ANCHOR, tz)
            emit("week", f"{iso.year}-W{iso.week:02d}", moments, anchor,
                 span_start, span_end, natural_start, natural_end)
            monday = week_end
    else:
        day = since
        while day < until:
            natural_start = dt.datetime.combine(day, dt.time.min, tz)
            natural_end = natural_start + dt.timedelta(days=1)
            moments = [
                m.astimezone(tz) for m in events.values()
                if natural_start <= m.astimezone(tz) < natural_end
            ]
            anchor = dt.datetime.combine(day - dt.timedelta(days=day.weekday()), ANCHOR, tz)
            emit("day", day.isoformat(), moments, anchor,
                 natural_start, natural_end, natural_start, natural_end)
            day += dt.timedelta(days=1)

    if not points:
        die(f"窗口 {since}..{until} 内没有合入事件:未采到(不写 0)。"
            f"若预采集久未运行,先在数据准备侧补采")
    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    print(file=sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
