#!/usr/bin/env python3
"""每日观测预采集 —— 项目侧数据准备脚本(不是指标协议脚本)。

两类脚本严格区分(裁决见 #284):
- 本脚本是 BW 项目自有的数据准备,由人挂定时(内部 Orca 自动化)每天跑,把白名单
  各项目的观测事实写进仓内数据文件并提交推送。存储归项目自有,BW 平台不管。
- 指标协议脚本(plan-cycle-hours.py)只读数据文件,秒级返回,注册在 metrics.toml。

数据文件:.bw/metrics/daily-observation.jsonl,协议 bw/daily-observation/v1,
一天一行、按 day 幂等重写(当天重跑不产生重复行),一行覆盖当日全部项目:

    {"schema":"bw/daily-observation/v1","day":"2026-09-29","ran_at":"<本行写入时刻>",
     "projects":[{"name":<白名单 name>,"remote":<白名单 remote>,"provider":"github"|"codehub",
                  "signals":{"pr_merges":[{"pr":<编号 int>,"merged_at":"<provider 真源 ISO>"}]}}]}

语义约束:
- 只记事实,不算数值。中位数、周去重等计算全在指标脚本,信号只能从数据推导。
- day = 事件 merged_at 的 UTC 日期(合入日归属);首跑回填会重建真实的历史逐日行。
  周/日读数归属由指标脚本按 BW_METRICS_TIMEZONE 从 merged_at 现算,不依赖 day。
- (remote, pr) 是全局幂等键,跨行去重;merged_at 一律取 provider 真源
  (GitHub mergedAt / CodeHub MR 合入时刻),不用 updatedAt 之类代替。
- v1 只采 pr_merges 信号(「计划制定时长」指标的唯一数据依赖)。其他特性要用没
  要观测,等对应指标定义成立时在 signals 里加 key,不盲目扩张。
- 不做老化;文件膨胀成为真问题时再决策。

增量策略:对每个 remote,取文件内已有 merged_at 最大值往前重叠 7 天作为拉取下界;
文件里没有该项目事件时全量回填(--limit 1000,拉满即警告可能截断)。漏跑几天
下次自愈(重叠窗口兜底),不需要精确调度;--full 忽略水位强制重拉。

provider 路径:
- github:`gh pr list --repo <remote> --state merged --json number,mergedAt`,
  增量时加 `--search merged:>=<下界>`。本机 gh 需已认证。
- codehub:`codehub-cli mr list -p <remote> --state merged`。**此分支按 CLI 协议
  书写、尚未在内部环境核实**(开发机没有 codehub-cli),命令形状以实机 --help 为准,
  核实有出入直接改这里。单项目失败不阻断其他项目。

失败语义:白名单缺失/为空/解析不了 → 退出码 2;个别项目查不到(无凭据、网络不通、
CLI 缺失)→ stderr 警告并跳过,采到多少记多少;全部项目失败 → 退出码 2。
采不到不造数据,文件宁可缺也不掺假。

--commit 时:先 git pull --ff-only(单写者前提下保持线性),写入后 commit+push;
无新增事件则静默退出、不产生空提交。定时自动化用 --commit;本机试跑不加,
只写工作区文件,由人检视后随分支提交。

自己复算(cwd 任意,路径按脚本所在位置解析仓根):
    python .bw/scripts/collect-daily-observation.py            # 只写文件
    python .bw/scripts/collect-daily-observation.py --commit   # 写入并提交推送
"""

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    import tomllib  # Python ≥ 3.11 标准库
except ModuleNotFoundError:  # pragma: no cover
    sys.stderr.reconfigure(encoding="utf-8")
    print("需要 Python ≥ 3.11(标准库 tomllib 读白名单)", file=sys.stderr)
    sys.exit(2)

SCHEMA = "bw/daily-observation/v1"
OVERLAP_DAYS = 7
FETCH_LIMIT = 1000
ROOT = Path(__file__).resolve().parent.parent.parent  # .bw/scripts/x.py → 仓根
WHITELIST = ROOT / ".bw" / "managed-projects.toml"
OBSERVATION = ROOT / ".bw" / "metrics" / "daily-observation.jsonl"


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(2)


def warn(msg: str) -> None:
    print(f"警告:{msg}", file=sys.stderr)


def load_whitelist() -> list[dict]:
    if not WHITELIST.is_file():
        die(f"白名单不存在:{WHITELIST}")
    try:
        data = tomllib.loads(WHITELIST.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        die(f"白名单解析失败:{e}")
    projects = data.get("projects") or []
    if not projects:
        die("白名单为空,没有可采集的项目")
    for p in projects:
        for field in ("name", "provider", "remote"):
            if not p.get(field):
                die(f"白名单条目缺字段 {field!r}:{p}")
        if p["provider"] not in ("github", "codehub"):
            die(f"未知 provider:{p['provider']}(只支持 github|codehub)")
    return projects


def parse_instant(text: str) -> dt.datetime | None:
    try:
        when = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=dt.timezone.utc)


def load_observation() -> tuple[dict[str, dict], dict[str, set[int]], dict[str, dt.datetime]]:
    """返回 (day→行, remote→已收 pr 集合, remote→已有最大 merged_at)。"""
    lines: dict[str, dict] = {}
    seen: dict[str, set[int]] = {}
    newest: dict[str, dt.datetime] = {}
    if not OBSERVATION.is_file():
        return lines, seen, newest
    for lineno, raw in enumerate(OBSERVATION.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        try:
            row = json.loads(raw)
        except json.JSONDecodeError:
            warn(f"数据文件第 {lineno} 行损坏,本行按缺失处理(其余行保留原样重写)")
            continue
        if row.get("schema") != SCHEMA or not row.get("day"):
            warn(f"数据文件第 {lineno} 行 schema/day 异常,按缺失处理")
            continue
        lines[row["day"]] = row
        for project in row.get("projects") or []:
            remote = project.get("remote")
            if not isinstance(remote, str):
                continue
            for ev in (project.get("signals") or {}).get("pr_merges") or []:
                pr = ev.get("pr")
                if isinstance(pr, int):
                    seen.setdefault(remote, set()).add(pr)
                merged = parse_instant(ev.get("merged_at") or "")
                if merged and (remote not in newest or merged > newest[remote]):
                    newest[remote] = merged
    return lines, seen, newest


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")


def fetch_github(remote: str, lower: dt.datetime | None) -> list[tuple[int, str]] | None:
    """返回 [(pr 号, mergedAt ISO)];None = 采集失败(已警告)。"""
    cmd = [
        "gh", "pr", "list", "--repo", remote, "--state", "merged",
        "--json", "number,mergedAt", "--limit", str(FETCH_LIMIT),
    ]
    if lower is not None:
        cmd += ["--search", f"merged:>={lower.date().isoformat()}"]
    proc = run(cmd)
    if proc.returncode != 0:
        warn(f"github {remote}:gh 调用失败:{(proc.stderr or proc.stdout).strip()[:300]}")
        return None
    try:
        items = json.loads(proc.stdout)
    except json.JSONDecodeError:
        warn(f"github {remote}:gh 输出不是合法 JSON")
        return None
    if len(items) >= FETCH_LIMIT:
        warn(f"github {remote}:拉满 {FETCH_LIMIT} 条,可能有截断;需要更深历史时分窗口补采")
    out = []
    for it in items:
        number, merged = it.get("number"), it.get("mergedAt")
        if isinstance(number, int) and isinstance(merged, str) and parse_instant(merged):
            out.append((number, merged))
    return out


def fetch_codehub(project: dict, lower: dt.datetime | None) -> list[tuple[int, str]] | None:
    """CodeHub MR 合入事件。命令形状未在内网核实,以实机 --help 为准;失败如实警告。"""
    cmd = [
        "codehub-cli", "mr", "list", "-p", project["remote"],
        "--state", "merged", "--json", "iid,merged_at", "--limit", str(FETCH_LIMIT),
    ]
    if project.get("host"):
        cmd += ["-H", project["host"]]
    proc = run(cmd)
    if proc.returncode != 0:
        warn(
            f"codehub {project['remote']}:codehub-cli 调用失败(本机可能没有该 CLI,"
            f"或命令形状有出入——此路径未在内网核实):"
            f"{(proc.stderr or proc.stdout).strip()[:300]}"
        )
        return None
    try:
        items = json.loads(proc.stdout)
    except json.JSONDecodeError:
        warn(f"codehub {project['remote']}:输出不是合法 JSON")
        return None
    out = []
    for it in items:
        iid, merged = it.get("iid"), it.get("merged_at")
        when = parse_instant(merged) if isinstance(merged, str) else None
        if isinstance(iid, int) and when:
            if lower is not None and when < lower:
                continue
            out.append((iid, merged))
    return out


def merge_into_lines(
    lines: dict[str, dict],
    projects: list[dict],
    new_by_remote: dict[str, list[tuple[int, str]]],
    ran_at: str,
) -> int:
    """把新事件按 merged_at 的 UTC 日期归入对应 day 行;返回写入的事件数。"""
    meta = {p["remote"]: p for p in projects}
    written = 0
    for remote, events in new_by_remote.items():
        project = meta[remote]
        for pr, merged_at in events:
            when = parse_instant(merged_at)
            assert when is not None  # fetch 阶段已过滤
            day = when.astimezone(dt.timezone.utc).date().isoformat()
            row = lines.get(day)
            if row is None:
                row = {"schema": SCHEMA, "day": day, "ran_at": ran_at, "projects": []}
                lines[day] = row
            row["ran_at"] = ran_at
            entry = next((p for p in row["projects"] if p.get("remote") == remote), None)
            if entry is None:
                entry = {
                    "name": project["name"],
                    "remote": remote,
                    "provider": project["provider"],
                    "signals": {"pr_merges": []},
                }
                row["projects"].append(entry)
            merges = (entry.setdefault("signals", {}).setdefault("pr_merges", []))
            if any(ev.get("pr") == pr for ev in merges):
                continue
            merges.append({"pr": pr, "merged_at": merged_at})
            merges.sort(key=lambda ev: ev["merged_at"])
            written += 1
    return written


def write_observation(lines: dict[str, dict]) -> None:
    OBSERVATION.parent.mkdir(parents=True, exist_ok=True)
    tmp = OBSERVATION.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8", newline="\n") as fh:
        for day in sorted(lines):
            fh.write(json.dumps(lines[day], ensure_ascii=False, separators=(",", ":")) + "\n")
    os.replace(tmp, OBSERVATION)


def main() -> int:
    sys.stderr.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--commit", action="store_true",
                    help="写入后 commit+push(定时自动化用);缺省只写工作区文件")
    ap.add_argument("--full", action="store_true",
                    help="忽略水位,按 provider 全量重拉(仍按 (remote,pr) 去重)")
    args = ap.parse_args()

    projects = load_whitelist()
    if args.commit:
        proc = run(["git", "-C", str(ROOT), "pull", "--ff-only"])
        if proc.returncode != 0:
            die(f"git pull --ff-only 失败,先人工核对分支状态:{proc.stderr.strip()[:300]}")
    lines, seen, newest = load_observation()

    new_by_remote: dict[str, list[tuple[int, str]]] = {}
    failed = 0
    for project in projects:
        remote, provider = project["remote"], project["provider"]
        lower = None if args.full else newest.get(remote)
        if lower is not None:
            lower = lower - dt.timedelta(days=OVERLAP_DAYS)
        fetched = (
            fetch_github(remote, lower) if provider == "github"
            else fetch_codehub(project, lower)
        )
        if fetched is None:
            failed += 1
            continue
        known = seen.get(remote, set())
        fresh = [(pr, merged) for pr, merged in fetched if pr not in known]
        for pr, _ in fresh:
            known.add(pr)
        new_by_remote[remote] = fresh
        print(f"{provider} {remote}:拉到 {len(fetched)} 条,新增 {len(fresh)} 条")

    if failed == len(projects):
        die("所有项目都采集失败,数据文件未更新(没采到,不造数据)")

    ran_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    written = merge_into_lines(lines, projects, new_by_remote, ran_at)
    if written == 0:
        print("无新增事件,数据文件不变")
        return 0
    write_observation(lines)
    print(f"写入 {written} 条事件,共 {len(lines)} 个 day 行 → "
          f"{OBSERVATION.relative_to(ROOT).as_posix()}")

    if args.commit:
        rel = OBSERVATION.relative_to(ROOT).as_posix()
        for cmd in (
            ["git", "-C", str(ROOT), "add", rel],
            ["git", "-C", str(ROOT), "commit", "-m",
             f"chore(metrics): 每日观测预采集 +{written} 条 PR 合入事件"],
            ["git", "-C", str(ROOT), "push"],
        ):
            proc = run(cmd)
            if proc.returncode != 0:
                die(f"git 操作失败:{(proc.stderr or proc.stdout).strip()[:300]}")
        print("已提交并推送")
    return 0


if __name__ == "__main__":
    sys.exit(main())
