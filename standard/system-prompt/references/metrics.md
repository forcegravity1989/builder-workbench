# 指标采集(Workbench 要能画出灯)

主提示词的铁律照守。这里只讲怎么采、怎么写 `.bw/metrics.toml`。
北极星该量什么由人在会话里定,不在这份里下结论。

## 先判能不能回溯

今天能采到这个数,「上周三那天的值」现在还能算出来吗?

- 能 → **A 类**:一个字不存,要看几周就现算几个窗口。
- 不能 → **B 类**:记进 `.bw/metrics/readings.jsonl`(同一天同一指标一行,当天再采覆盖)。写在账本 worktree,不写主检出。手填同一份流水。

判 B 之前先找带时间戳的接口。GitHub star 用 stargazers + `star+json` 头能拿到时刻,是 A,不是 B。

## 采集只有两种

1. 脚本 `collect = { kind = "script", run = [...], retro = true|false }`
2. 手填 `collect = { kind = "manual" }`

连 git / GitHub / codehub / 内网 / 本地文件,全是脚本自己的事。Workbench 只起进程、传窗口、读 stdout 的 JSON。

总览已经在画的仓统计(提交数、合入 MR、开放 issue)不要再写进业务指标。

## 窗口和输出

Workbench 追加 `--since YYYY-MM-DD --until YYYY-MM-DD --granularity week`(左闭右开)。脚本不准自己定窗口。stdout 必须 UTF-8。

- A 类吐 `{"points":[{"week":"YYYY-Www","value":…},…]}`。只吐 `{"value":…}` 会只剩最后一周一个点。
- B 类吐 `{"value":…}`。B 仍要有 `run`;不写 `run` 采不到。

字段:`name` / `def` / `target` / `collect`。不要写 `definition`。

## 失败不写 0

非零退出、超时、非 JSON、缺字段 = 这次没采到。`0` 是真值。空段不画,不补前值。
