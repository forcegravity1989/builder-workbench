# `.bw/metrics.toml` — 指标定义

Workbench 只认这份。没有文件不是错,界面显示「还没定出来」。
名片正本是 `.bw/project.toml`,不是这份;空着就问人,不把名片字段抄进这里。
`schema_version` 必须是 `2`,旧格式整份拒收、不迁移。字段骨架照仓里模板
`standard/templates/metrics.toml.tmpl`(被管仓没有这份,按下面写即可)。

北极星可以缺席。三层键:`[north_star]`、`[[lagging]]`、`[[leading]]`。
每条:`name` / `def` / `target` / `collect`。不要写 `definition`。
可选:`feature`(所属特性,空=总览「主要」页签;有值画出「XX特性」)、`leads`(只写在引领上,值是它盯的那条滞后的 `name`;空=挂到同页签第一条滞后)。总览按 `feature` 分页签、按 `leads` 把引领叠到对应滞后的一张图上,不另建特性表。

## 采集

只有两种,没有第三种:

```
collect = { kind = "script", run = ["python", ".bw/scripts/x.py"], retro = true }
collect = { kind = "manual" }
```

`run` 是 argv,不走 shell。`kind=script` 且 `run` 空 = 写了一半,采不起来。

Workbench 起脚本时:工作目录是仓根,追加
`--since YYYY-MM-DD --until YYYY-MM-DD --granularity week|day`(左闭右开),超时 900 秒。
只认 **stdout 的一个 JSON 对象**。往文件里写不算数。

- `retro = true`(A):周粒度吐 `{"points":[{"week":"2026-W35","value":8},…]}`;天粒度吐 `{"points":[{"day":"2026-09-01","value":2},…]}`。点号要对上窗口;少给的断开,不补前值。只吐 `{"value":8}` 会落成最后一周一个点。
- `retro = false`(B):吐 `{"value":12}`。Workbench 记进指标记录 `.bw/metrics/readings.jsonl`(键是日历日,同一天同一指标一行)。不要自己往主检出写流水。
- `kind = "manual"`:不跑脚本,人在总览手填。

`value` 可以是数或给人看的字符串。失败(非零退出、超时、不是 JSON、没数据)记「没采到」,**不要写 0**。

总览已经在画的仓统计(提交、合入 MR、开放 issue)不要再写进业务指标。
