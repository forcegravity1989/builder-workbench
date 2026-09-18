#!/usr/bin/env python3
"""白名单被管项目指标 —— 可回溯采集脚本(retro = true),一脚本两条滞后指标。

    --metric adoption       纳入 workbench 管理的项目数
    --metric monday-screen  使用周一屏的被管理项目数

正本是仓内白名单 `.bw/managed-projects.toml`(人维护),不是 BW 本机注册表 ——
指标要能在仓内独立复算,克隆本仓即可对着名单核。

口径(#217 拍板;要改口径直接改这里):

- adoption:白名单在册、且项目仓 `.bw/` 目录真实落盘 = 纳入。周归属按条目
  `since`(纳入日)起累计逐周计入;在册但 `.bw/` 未落盘不计,stderr 给警告
  (这是可读到的真实反例,不算采集失败)。
- monday-screen:扫各项目 `.bw/planning/*/data.json`,收顶层 `updated_at` 与
  `confirmation.{results,review_ready,plan}.at`;任一时间戳落在某周,该项目该周
  计 1(同项目同周去重)。重建数据(如本仓 v0.3)时间戳全为 null,归不到任何周
  —— 重建不等于使用。

远端读取(条目没给 local 时,浅克隆到临时目录,采完即删):

- codehub:`codehub-cli project view -p <remote> -H <host> --template {{.ssh_url_to_repo}}`
  取 SSH 地址再 `git clone --depth 1` —— 与 bw-engine `remote/codehub.rs::clone_repo`
  同协议。**此分支尚未在内部环境核实**(开发机没有 codehub-cli),核实有出入直接改这里。
- github:`gh repo clone <remote> <目录> -- --depth 1` —— 与 `remote/github.rs::clone_repo` 同协议。

失败语义(metrics 协议 references/metrics.md):白名单缺失/为空/解析不了、条目
缺字段、local 路径不存在、ssh_url 取不到、克隆失败、data.json 不是合法 JSON →
退出码 2、stderr 如实报错,stdout 不留 JSON ——「没采到」而不是写 0。窗口内某周
真实为 0(当周没纳入/没归档活动)是有效测量,正常出点。

自己复算(cwd = 仓根,BW 自己走本地读盘):

    python .bw/scripts/managed-projects.py --metric monday-screen \
        --since 2026-08-31 --until 2026-09-21 --granularity week
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import tomllib  # Python ≥ 3.11 标准库
except ModuleNotFoundError:  # pragma: no cover
    sys.stderr.reconfigure(encoding="utf-8")
    print("需要 Python ≥ 3.11(用标准库 tomllib 读白名单),本机版本不够", file=sys.stderr)
    sys.exit(2)

WHITELIST_DEFAULT = ".bw/managed-projects.toml"
PROVIDERS = ("github", "codehub")
CONFIRM_STAGES = ("results", "review_ready", "plan")


def weeks_in(since: datetime.date, until: datetime.date):
    """窗口内的 ISO 周,旧的在前。until 是开区间右端。"""
    out, cur = [], since - datetime.timedelta(days=since.weekday())
    while cur < until:
        y, w, _ = cur.isocalendar()
        out.append((f"{y}-W{w:02d}", cur))
        cur += datetime.timedelta(days=7)
    return out


def load_whitelist(path: Path):
    """解析并校验白名单。返回 (entries, 错误话);错误话非 None = 没采到。"""
    if not path.is_file():
        return None, f"白名单不存在:{path}(正本应在仓内 {WHITELIST_DEFAULT},由人维护)"
    try:
        with path.open("rb") as f:
            data = tomllib.load(f)
    except (tomllib.TOMLDecodeError, OSError) as e:
        return None, f"白名单读不出来:{path}:{e}"
    raw = data.get("projects")
    if not isinstance(raw, list) or not raw:
        return None, f"白名单里一条 [[projects]] 都没有:{path} —— 没有可观察对象,不给数"
    entries, seen = [], set()
    for i, e in enumerate(raw):
        where = f"白名单第 {i + 1} 条"
        if not isinstance(e, dict):
            return None, f"{where}不是表"
        name = str(e.get("name") or "").strip()
        provider = str(e.get("provider") or "").strip()
        remote = str(e.get("remote") or "").strip()
        if not name or provider not in PROVIDERS or not remote:
            return None, (f"{where}缺字段:name / provider({'|'.join(PROVIDERS)}) / remote 都必填,"
                          f"收到 name={name!r} provider={provider!r} remote={remote!r}")
        key = (provider, remote.lower())
        if key in seen:
            return None, f"{where}重复:{provider} {remote} 出现多条 —— 去重计数以条目唯一为前提,请先合并"
        seen.add(key)
        local = str(e.get("local") or "").strip()
        host = str(e.get("host") or "").strip()
        if provider == "codehub" and not local and not host:
            return None, f"{where}({name}):codehub 远端读取需要 host = 区别名(codehub-cli -H)"
        since_raw = str(e.get("since") or "").strip()
        try:
            since = datetime.date.fromisoformat(since_raw)
        except ValueError:
            return None, f"{where}({name})的 since 不是 YYYY-MM-DD:{since_raw!r}"
        entries.append({"name": name, "provider": provider, "remote": remote,
                        "local": local, "host": host, "since": since})
    return entries, None


def resolve_repo(entry: dict, clones: list):
    """取条目指向的项目仓根目录;远端条目浅克隆到临时目录并登记进 clones 待清理。
    返回 (路径, 错误话)。"""
    name = entry["name"]
    if entry["local"]:
        p = Path(entry["local"])
        if not p.is_dir():
            return None, f"{name} 的 local 路径不存在:{p} —— 不静默跳过"
        return p, None
    dest = Path(tempfile.mkdtemp(prefix="bw-metrics-"))
    clones.append(dest)
    if entry["provider"] == "codehub":
        try:
            proc = subprocess.run(
                ["codehub-cli", "project", "view", "-p", entry["remote"],
                 "-H", entry["host"], "--template", "{{.ssh_url_to_repo}}"],
                capture_output=True, text=True,
            )
        except FileNotFoundError:
            return None, f"本机没有 codehub-cli 或不在 PATH,读不了 codehub 项目 {name}"
        if proc.returncode != 0:
            return None, f"取 {name} 的 SSH 地址失败(codehub-cli project view):{proc.stderr.strip()}"
        ssh_url = proc.stdout.strip()
        # --template 对 null 字段输出 "<no value>";空/非 ssh:// 不喂给 git(Rust clone_repo 同款守卫)
        if not ssh_url.startswith("ssh://"):
            return None, f"{name} 无 SSH clone 地址(ssh_url_to_repo 为空或老仓?):{ssh_url!r}"
        # BatchMode:无人值守采集,SSH 不许停下来等人输密码/确认指纹
        env = dict(os.environ,
                   GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new")
        proc = subprocess.run(["git", "clone", "--depth", "1", ssh_url, str(dest)],
                              capture_output=True, text=True, env=env)
    else:
        try:
            proc = subprocess.run(
                ["gh", "repo", "clone", entry["remote"], str(dest), "--", "--depth", "1"],
                capture_output=True, text=True,
            )
        except FileNotFoundError:
            return None, f"本机没有 gh 或不在 PATH,克隆不了 github 项目 {name}"
    if proc.returncode != 0:
        return None, f"{name} 浅克隆失败:{proc.stderr.strip()}"
    return dest, None


def scan_project(repo: Path, name: str):
    """读一个项目仓的纳入证据与周一屏时间戳。返回 (adopted, stamps, 错误话)。"""
    if not (repo / ".bw").is_dir():
        return False, [], None
    stamps = []
    planning = repo / ".bw" / "planning"
    if planning.is_dir():
        for dj in sorted(planning.glob("*/data.json")):
            try:
                data = json.loads(dj.read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                return False, [], f"{name} 的 {dj} 读不出/不是合法 JSON:{e} —— 归档件损坏,这次不给数"
            conf = data.get("confirmation")
            if conf is not None and not isinstance(conf, dict):
                print(f"警告:{dj} 的 confirmation 不是对象,按缺确认处理", file=sys.stderr)
                conf = None
            raws = [data.get("updated_at")]
            for s in CONFIRM_STAGES:
                c = (conf or {}).get(s)
                # 契约:每个阶段是 null 或 {"at": ISO-8601, "actor": …};取 at
                raws.append(c.get("at") if isinstance(c, dict) else c)
            for raw in raws:
                if raw is None:
                    continue  # null 在数据契约内(未到该阶段/重建数据),不算异常
                if not isinstance(raw, str):
                    print(f"警告:{dj} 的时间戳不是字符串:{raw!r},跳过", file=sys.stderr)
                    continue
                try:
                    dt = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
                except ValueError:
                    print(f"警告:{dj} 的时间戳不是 ISO-8601:{raw!r},跳过", file=sys.stderr)
                    continue
                stamps.append(dt.timestamp())
    return True, stamps, None


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 默认 gbk,中文会乱码
    sys.stderr.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser()
    ap.add_argument("--metric", required=True, choices=("adoption", "monday-screen"))
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    ap.add_argument("--whitelist", default=WHITELIST_DEFAULT,
                    help="沙箱测试用的白名单路径覆盖;Workbench 注册的 argv 不带它")
    args = ap.parse_args()

    if args.granularity not in ("week", "day"):
        print(f"只支持 --granularity week|day,收到 {args.granularity}", file=sys.stderr)
        return 2
    try:
        since = datetime.date.fromisoformat(args.since)
        until = datetime.date.fromisoformat(args.until)
    except ValueError as e:
        print(f"--since/--until 要 YYYY-MM-DD:{e}", file=sys.stderr)
        return 2

    entries, err = load_whitelist(Path(args.whitelist))
    if err:
        print(err, file=sys.stderr)
        return 2

    clones: list[Path] = []
    try:
        projects = []
        for entry in entries:
            repo, err = resolve_repo(entry, clones)
            if err:
                print(err, file=sys.stderr)
                return 2
            adopted, stamps, err = scan_project(repo, entry["name"])
            if err:
                print(err, file=sys.stderr)
                return 2
            if not adopted:
                print(f"警告:{entry['name']} 在白名单在册,但 {repo / '.bw'} 未落盘 —— 不计入纳入数",
                      file=sys.stderr)
            projects.append({"since": entry["since"], "adopted": adopted, "stamps": stamps})
    finally:
        for d in clones:
            shutil.rmtree(d, ignore_errors=True)

    tz = datetime.datetime.now().astimezone().tzinfo
    if args.metric == "adoption":
        # 状态量:纳入日早于桶末就计入(累计);除名 = 从白名单删条目
        def value_in(lo: datetime.date, hi: datetime.date) -> int:
            return sum(1 for p in projects if p["adopted"] and p["since"] < hi)
    else:
        def value_in(lo: datetime.date, hi: datetime.date) -> int:
            lo_ts = datetime.datetime.combine(lo, datetime.time(0, 0), tz).timestamp()
            hi_ts = datetime.datetime.combine(hi, datetime.time(0, 0), tz).timestamp()
            return sum(1 for p in projects if any(lo_ts <= t < hi_ts for t in p["stamps"]))

    points = []
    if args.granularity == "day":
        cur = since
        while cur < until:
            points.append({"day": cur.isoformat(),
                           "value": value_in(cur, cur + datetime.timedelta(days=1))})
            cur += datetime.timedelta(days=1)
    else:
        for label, monday in weeks_in(since, until):
            points.append({"week": label, "value": value_in(monday, monday + datetime.timedelta(days=7))})

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
