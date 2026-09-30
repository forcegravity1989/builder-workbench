#!/usr/bin/env python3
"""白名单被管项目指标 —— 可回溯采集脚本(retro = true),一脚本两条滞后指标。

    --metric adoption       纳入 workbench 管理的项目数
    --metric monday-screen  使用周一屏的被管理项目数

正本是仓内白名单 `.bw/managed-projects.toml`(人维护),不是 BW 本机注册表 ——
指标要能在仓内独立复算,克隆本仓即可对着名单核。

口径(#217 拍板;要改口径直接改这里):

- adoption:白名单在册、且项目仓 `.bw/` 真实落盘 = 纳入。本地条目查磁盘;远端
  克隆查 HEAD 树(新克隆二者等价)。周归属按条目 `since`(纳入日)起累计逐周
  计入;在册但 `.bw/` 未落盘不计,stderr 给警告(这是可读到的真实反例,不算
  采集失败)。
- monday-screen:沿仓库当前 HEAD 的 **Git 历史**提取各项目
  `.bw/planning/<版本>/data.json` 每个已提交版本里的顶层 `updated_at` 与
  `confirmation.{results,review_ready,plan}.at`;任一时间戳落在某周,该项目该周
  计 1(同项目同周去重)。为什么读历史不读工作区文件:这两个字段是「最后一次
  写入」的可变值(week-planning 的 save 每次覆写 updated_at,内容变更会清空
  confirmation),读当前文件会让同一窗口的历史读数随后续编辑漂移;Git 历史
  不可变,同一命令永远复算出同一组周值。三条推论,都是口径的一部分:
    * 仅 progress_updates + updated_at 变化的提交不计 —— 那是资产盘点等
      自动化写入(planning.py 的 replace 造不出人的 confirmation),自动化
      使用不等于人使用周一屏;
    * 重建数据(如本仓 v0.3)时间戳全为 null,归不到任何周 —— 重建不等于使用;
    * 未合入 HEAD 的草稿(如常驻规划工作树上的当周编辑)不计,归档为准 ——
      这保证任何机器克隆默认分支都复算出同一读数,代价是当周使用要等归档
      后才出现在读数里。

远端读取(条目没给 local 时,克隆到临时目录,采完即删;需要历史提交,所以用
`--filter=blob:none --no-checkout` 的无工作区部分克隆,git show 按需取 blob):

- codehub:`codehub-cli project view -p <remote> -H <host> --template {{.ssh_url_to_repo}}`
  取 SSH 地址再 `git clone` —— 与 bw-engine `remote/codehub.rs::clone_repo`
  同协议。**此分支尚未在内部环境核实**(开发机没有 codehub-cli),含服务端是否
  支持 partial clone;核实有出入直接改这里。
- github:`gh repo clone <remote> <目录> -- --filter=blob:none --no-checkout`
  —— 与 `remote/github.rs::clone_repo` 同协议。

失败语义(metrics 协议 references/metrics.md):白名单缺失/为空/解析不了、条目
缺字段、local 路径不存在、ssh_url 取不到、克隆失败、git 历史读不出(本地条目
不是 git 仓)→ 退出码 2、stderr 如实报错,stdout 不留 JSON ——「没采到」而不是
写 0。历史里个别 data.json 版本损坏 → stderr 警告并跳过该版本(历史版本的
损坏不阻断当前采集)。窗口内某周真实为 0(当周没纳入/没归档活动)是有效测量,
正常出点。

服务运行(bw-orca 采集执行器):BW_METRICS_DATA_ROOT / BW_METRICS_DATA_COMMIT
给出已解析的数据目标,不能把采集器 cwd(配置隔离检出)当数据分支——白名单、
条目 local 相对路径、BW 自身的 Git 历史遍历都以数据目标为准(历史钉在
DATA_COMMIT);其余白名单项目是外部数据源,各按其自身 HEAD。BW_METRICS_TIMEZONE
必须显式为 IANA 时区(归周边界),不设即报错不猜。未结束的本周/本日或被
--since/--until 截断的部分窗口,点位带 coverage={start,end},value 按真实覆盖
范围计算;完整且已结束的自然周不声明。依赖:Python ≥ 3.11;Windows 的 Python
无系统时区库,需 `pip install tzdata`。

自己复算(在仓根,数据目标缺省即当前目录 HEAD):

    BW_METRICS_TIMEZONE=Asia/Shanghai BW_METRICS_DATA_ROOT=. \
        python .bw/scripts/managed-projects.py --metric monday-screen \
        --since 2026-08-31 --until 2026-09-21 --granularity week
"""

import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    import tomllib  # Python ≥ 3.11 标准库
except ModuleNotFoundError:  # pragma: no cover
    sys.stderr.reconfigure(encoding="utf-8")
    print("需要 Python ≥ 3.11(用标准库 tomllib 读白名单),本机版本不够", file=sys.stderr)
    sys.exit(2)

WHITELIST_DEFAULT = ".bw/managed-projects.toml"
PROVIDERS = ("github", "codehub")
CONFIRM_STAGES = ("results", "review_ready", "plan")
# 只认版本目录正下方的 data.json;revisions/ 等快照子目录不重复计
DATA_JSON_RE = re.compile(r"^\.bw/planning/[^/]+/data\.json$")
# 判断「仅自动化写入」时忽略的字段:progress_updates 是盘点会话追加的数组,
# updated_at 每次 save 都覆写
AUTO_ONLY_IGNORED = ("updated_at", "progress_updates")


def run(cmd, cwd=None, env=None):
    """子进程统一入口:吞 stdin(无人值守不许停下等输入,与 Rust 远端协议同款)。
    encoding 必须显式 UTF-8:Windows 的 text=True 默认走 locale(gbk),git show
    吐出的 data.json 是 UTF-8 中文,gbk 解码会在读线程里直接崩。errors=replace
    保证任何字节都不炸;坏字节只会让 JSON 解析失败走既有的警告跳过分支。"""
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace",
                          stdin=subprocess.DEVNULL, env=env)


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


def resolve_repo(entry: dict, clones: list, data_root: Path):
    """取条目指向的项目仓。返回 (路径, 是否远端克隆, 错误话)。
    local 相对路径按数据目标(BW_METRICS_DATA_ROOT)解析,不按采集器 cwd——
    服务运行时 cwd 是配置隔离检出,不是被统计的树。
    远端用 --filter=blob:none --no-checkout:monday-screen 要历史提交,不需要
    工作区;adoption 对远端查 HEAD 树。克隆目录登记进 clones 待清理。"""
    name = entry["name"]
    if entry["local"]:
        p = Path(entry["local"])
        if not p.is_absolute():
            p = data_root / p
        if not p.is_dir():
            return None, False, f"{name} 的 local 路径不存在:{p} —— 不静默跳过"
        return p, False, None
    dest = Path(tempfile.mkdtemp(prefix="bw-metrics-"))
    clones.append(dest)
    if entry["provider"] == "codehub":
        try:
            proc = run(["codehub-cli", "project", "view", "-p", entry["remote"],
                        "-H", entry["host"], "--template", "{{.ssh_url_to_repo}}"])
        except FileNotFoundError:
            return None, False, f"本机没有 codehub-cli 或不在 PATH,读不了 codehub 项目 {name}"
        if proc.returncode != 0:
            return None, False, f"取 {name} 的 SSH 地址失败(codehub-cli project view):{proc.stderr.strip()}"
        ssh_url = proc.stdout.strip()
        # --template 对 null 字段输出 "<no value>";空/非 ssh:// 不喂给 git(Rust clone_repo 同款守卫)
        if not ssh_url.startswith("ssh://"):
            return None, False, f"{name} 无 SSH clone 地址(ssh_url_to_repo 为空或老仓?):{ssh_url!r}"
        # BatchMode:无人值守采集,SSH 不许停下来等人输密码/确认指纹
        env = dict(os.environ,
                   GIT_SSH_COMMAND="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new")
        try:
            proc = run(["git", "clone", "--filter=blob:none", "--no-checkout",
                        ssh_url, str(dest)], env=env)
        except FileNotFoundError:
            return None, False, f"本机没有 git 或不在 PATH,克隆不了 codehub 项目 {name}"
    else:
        try:
            proc = run(["gh", "repo", "clone", entry["remote"], str(dest),
                        "--", "--filter=blob:none", "--no-checkout"])
        except FileNotFoundError:
            return None, False, f"本机没有 gh 或不在 PATH,克隆不了 github 项目 {name}"
    if proc.returncode != 0:
        return None, False, f"{name} 克隆失败:{proc.stderr.strip()}"
    return dest, True, None


def check_adopted(repo: Path, remote: bool, name: str):
    """`.bw/` 是否真实存在:本地查磁盘(工作区事实),远端查 HEAD 树(新克隆等价)。
    返回 (adopted, 错误话)。"""
    if not remote:
        return (repo / ".bw").is_dir(), None
    try:
        proc = run(["git", "cat-file", "-e", "HEAD:.bw"], cwd=repo)
    except FileNotFoundError:
        return False, f"本机没有 git 或不在 PATH,核验不了 {name} 的 .bw/"
    if proc.returncode != 0 and proc.stderr.strip():
        # 区分「对象不存在」(未纳入,正常)与 git 本身出错(没采到)
        if "fatal" in proc.stderr and "HEAD:.bw" not in proc.stderr:
            return False, f"{name} 的 HEAD 树读不出来:{proc.stderr.strip()}"
    return proc.returncode == 0, None


def parse_stamp(raw, where: str, stamps: set):
    """校验并收一个时间戳;null 是契约内(未到该阶段/重建数据),坏值警告跳过。"""
    if raw is None:
        return
    if not isinstance(raw, str):
        print(f"警告:{where} 的时间戳不是字符串:{raw!r},跳过", file=sys.stderr)
        return
    try:
        dt = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        print(f"警告:{where} 的时间戳不是 ISO-8601:{raw!r},跳过", file=sys.stderr)
        return
    stamps.add(dt.timestamp())


def planning_stamps(repo: Path, name: str, ref: str = "HEAD"):
    """沿 ref(服务运行钉 BW_METRICS_DATA_COMMIT,独立运行 HEAD)的 Git 历史
    收 data.json 出现过的全部有效时间戳。
    返回 (stamps 集合, 错误话)。历史不可变 ⇒ 读数不随后续编辑漂移。"""
    try:
        proc = run(["git", "-c", "core.quotepath=off", "log", ref,
                    "--format=%x1e%H", "--name-only", "--diff-filter=ACMR",
                    "--", ".bw/planning"], cwd=repo)
    except FileNotFoundError:
        return None, f"本机没有 git 或不在 PATH,读不了 {name} 的归档历史"
    if proc.returncode != 0:
        return None, (f"{name} 的 git 历史读不出({repo}):{proc.stderr.strip()}"
                      f" —— 周一屏使用无法复算,这次不给数")
    # 输出是「␞<sha>」行后跟该提交动过的路径行;git log 新提交在前
    versions: dict = {}  # path -> [sha, …] 新在前(git log 序),遍历时 reversed
    sha = None
    # 不能用 splitlines():它把 \x1e 本身也当行边界,sha 行会丢前缀
    for line in proc.stdout.split("\n"):
        if line.startswith("\x1e"):
            sha = line[1:]
        elif line.strip() and sha and DATA_JSON_RE.match(line.strip()):
            versions.setdefault(line.strip(), []).append(sha)
    stamps: set = set()
    for path, shas in versions.items():
        prev = None  # 上一个已提交版本,用来识别「仅 progress_updates 变化」
        for s in reversed(shas):
            blob = run(["git", "show", f"{s}:{path}"], cwd=repo)
            if blob.returncode != 0:
                print(f"警告:{name} 的 {s[:9]}:{path} 取不出 blob,跳过该版本", file=sys.stderr)
                continue
            try:
                data = json.loads(blob.stdout)
            except ValueError as e:
                print(f"警告:{name} 的 {s[:9]}:{path} 不是合法 JSON({e}),跳过该版本",
                      file=sys.stderr)
                continue
            if not isinstance(data, dict):
                print(f"警告:{name} 的 {s[:9]}:{path} 不是 JSON 对象,跳过该版本", file=sys.stderr)
                continue
            conf = data.get("confirmation")
            if conf is not None and not isinstance(conf, dict):
                print(f"警告:{s[:9]}:{path} 的 confirmation 不是对象,按缺确认处理", file=sys.stderr)
                conf = None
            # 人的确认动作:任何历史版本出现过就收(后来被内容变更清空也不抹掉事实)
            for stage in CONFIRM_STAGES:
                c = (conf or {}).get(stage)
                # 契约:每个阶段是 null 或 {"at": ISO-8601, "actor": …};取 at
                parse_stamp(c.get("at") if isinstance(c, dict) else c, f"{s[:9]}:{path}", stamps)
            # updated_at:仅 progress_updates 变化的版本不计(自动化写入不是人用周一屏);
            # 首个已提交版本没有对照,视为真实活动
            if prev is None or _content(prev) != _content(data):
                parse_stamp(data.get("updated_at"), f"{s[:9]}:{path}", stamps)
            prev = data
    return stamps, None


def _content(data: dict):
    """去掉自动化/易变字段后的内容指纹,用于识别「仅 progress_updates 变化」。"""
    return json.dumps({k: v for k, v in data.items() if k not in AUTO_ONLY_IGNORED},
                      sort_keys=True, ensure_ascii=False)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 默认 gbk,中文会乱码
    sys.stderr.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser()
    ap.add_argument("--metric", required=True, choices=("adoption", "monday-screen"))
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    ap.add_argument("--granularity", default="week")
    ap.add_argument("--whitelist", default=WHITELIST_DEFAULT,
                    help="沙箱测试用的白名单路径覆盖(相对路径按数据目标解析);"
                         "Workbench 注册的 argv 不带它")
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

    tz_name = os.environ.get("BW_METRICS_TIMEZONE", "").strip()
    if not tz_name:
        print("BW_METRICS_TIMEZONE 未设置:归周边界必须是明确时区,不猜", file=sys.stderr)
        return 2
    try:
        tz = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        print(f"BW_METRICS_TIMEZONE 不是有效 IANA 时区:{tz_name}"
              f"(Windows 的 Python 无系统时区库,需 pip install tzdata)", file=sys.stderr)
        return 2
    data_root = Path(os.environ.get("BW_METRICS_DATA_ROOT") or Path.cwd()).resolve()
    data_commit = os.environ.get("BW_METRICS_DATA_COMMIT", "").strip()

    whitelist_path = Path(args.whitelist)
    if not whitelist_path.is_absolute():
        whitelist_path = data_root / whitelist_path
    entries, err = load_whitelist(whitelist_path)
    if err:
        print(err, file=sys.stderr)
        return 2

    clones: list[Path] = []
    try:
        projects = []
        for entry in entries:
            repo, remote, err = resolve_repo(entry, clones, data_root)
            if err:
                print(err, file=sys.stderr)
                return 2
            proj = {"since": entry["since"], "adopted": False, "stamps": set()}
            if args.metric == "adoption":
                adopted, err = check_adopted(repo, remote, entry["name"])
                if err:
                    print(err, file=sys.stderr)
                    return 2
                proj["adopted"] = adopted
                if not adopted:
                    print(f"警告:{entry['name']} 在白名单在册,但 {repo} 的 .bw/ 未落盘 —— 不计入纳入数",
                          file=sys.stderr)
            else:
                # 数据提交只钉 BW 自身(仓库=数据根);其余白名单项目是外部
                # 数据源,BW 的 DATA_COMMIT 对它们的仓没有意义,各按自身 HEAD
                ref = data_commit if (data_commit and repo.resolve() == data_root) else "HEAD"
                stamps, err = planning_stamps(repo, entry["name"], ref)
                if err:
                    print(err, file=sys.stderr)
                    return 2
                proj["stamps"] = stamps
            projects.append(proj)
    finally:
        for d in clones:
            shutil.rmtree(d, ignore_errors=True)

    now = datetime.datetime.now(tz)

    def coverage_if_partial(span_start, span_end, natural_start, natural_end):
        """点位窗口与自然窗口不一致(被 --since/--until 截断)或尚未结束时返回
        coverage;完整且已结束的自然窗口返回 None。部分窗口不得伪装成完整周/日。"""
        if span_start == natural_start and span_end == natural_end and span_end <= now:
            return None
        end = max(min(span_end, now), span_start)
        return {"start": span_start.isoformat(timespec="seconds"),
                "end": end.isoformat(timespec="seconds")}

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
            nxt = cur + datetime.timedelta(days=1)
            natural_start = datetime.datetime.combine(cur, datetime.time.min, tz)
            natural_end = datetime.datetime.combine(nxt, datetime.time.min, tz)
            point = {"day": cur.isoformat(), "value": value_in(cur, nxt)}
            cov = coverage_if_partial(natural_start, natural_end, natural_start, natural_end)
            if cov:
                point["coverage"] = cov
            points.append(point)
            cur = nxt
    else:
        for label, monday in weeks_in(since, until):
            week_end = monday + datetime.timedelta(days=7)
            lo, hi = max(monday, since), min(week_end, until)
            natural_start = datetime.datetime.combine(monday, datetime.time.min, tz)
            natural_end = datetime.datetime.combine(week_end, datetime.time.min, tz)
            span_start = datetime.datetime.combine(lo, datetime.time.min, tz)
            span_end = datetime.datetime.combine(hi, datetime.time.min, tz)
            point = {"week": label, "value": value_in(lo, hi)}
            cov = coverage_if_partial(span_start, span_end, natural_start, natural_end)
            if cov:
                point["coverage"] = cov
            points.append(point)

    json.dump({"points": points}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
