# 当前活跃特性

> **30 秒导读**：这一页是 `eng-features` 的人可读索引。Agent 开特性或对账先读这里，再进对应目录的 `intent.md` / `spec.md`。已实现或已拒绝的特性不在本表——约束已吸收进 [`../architecture.md`](../architecture.md) / [`../06-module/`](../06-module/) 的，以契约为准。分层与吸收规则见 [`../01-principles/04-ai-native-docs.md`](../01-principles/04-ai-native-docs.md)。

`docs/05-features/` 目录里可以留下史；**当前活跃集以本表为准**。`STATUS` 变为 shipped / rejected 时：把仍约束实现的句子写入契约，然后从本表和 `.bw/knowledge-map.toml` 的 `eng-features` section 拿掉该目录。

| id | 状态 | 给用户的新价值 | 先读 |
|---|---|---|---|
| [`native-session-execution`](native-session-execution/) | 提议 | 开工后在工作台里看跑、停止、接回，不再嵌外部 Orca 页 | [`intent.md`](native-session-execution/intent.md) · [`spec.md`](native-session-execution/spec.md) |
| [`scoreboard-and-forecast`](scoreboard-and-forecast/) | draft | 总览上看清达标、离目标的差距、按期交付把握 | [`intent.md`](scoreboard-and-forecast/intent.md) · [`STATUS.md`](scoreboard-and-forecast/STATUS.md) |
| [`process-metrics`](process-metrics/) | in_review | 过程指标成为可看的事实，健康灯有数可依 | [`STATUS.md`](process-metrics/STATUS.md) |
| [`reviewer-agent`](reviewer-agent/) | in_review | PR 自动评审；工作台内「请评审」按钮尚未接上 | [`STATUS.md`](reviewer-agent/STATUS.md) |

不在活跃集（目录可留作史，默认不加载）：

| id | 状态 | 吸收到 |
|---|---|---|
| `capability-panel` | 已实现 | 设置屏现行行为以真壳为准；模块心智若有取舍进 `06-module/` |
