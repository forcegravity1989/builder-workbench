# 有了 Orca，怎样判断 BW 对交付的帮助？

> 给评估总览、指标、计划与验收价值的 Builder 和产品评审者。本文从外部研究和一次 BW 历史记录提炼三个判断，把真实项目仍需验证的问题单列。外部研究截至 2026-10-09，来源变化或取得可追溯的试用结果时复核。现行产品取舍见[项目总览意图](../05-features/overview-metrics/intent.md)，七份专题、来源日期和反证见[原研究](https://github.com/forcegravity1989/builder-workbench/blob/705d33dd5427a287bce996315108caf8742441e2/docs/10-reference/ai-native-delivery-2026/README.md)。

## 一次交付应当观察什么

**代码产出和用户结果需要分别取证。** Anthropic 的内部问卷和访谈发现，工程师会借助 AI 做过去搁置的工作。METR 指出，AI 改变了人选择的任务。比较同一任务的耗时，只能回答速度问题。在 BW 中，PR 合入可以作为工程进展的证据。要判断用户有没有受益，还要知道谁拿到了哪个版本、尝试了什么、在哪一步成功或受阻。[Anthropic 内部研究，2025-12-02](https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic) · [METR 对任务选择的分析，2026-05-08](https://metr.org/blog/2026-05-08-task-substitution-and-uplift/)

**读数的含义取决于它数了什么。** BW v0.5 验收里，G3 在 10 月 5 日至 8 日的窗口内读到 0。指标只数白名单内有已合入计划活动的项目，每个项目按周去重。实际有多少人试用了 BW，需要另外取证。原计划和验收采用的指标定义也有变化，直接用实际值除以原目标会给出误导性的达成率。保留观察窗口、统计对象和原始记录，才知道哪一个问题仍然没有答案。[当时的计划](https://github.com/forcegravity1989/builder-workbench/blob/5202485e0773eef8c2c19da540d59bbd07bd45bc/.bw/planning/v0.5/data.json) · [指标定义](https://github.com/forcegravity1989/builder-workbench/blob/5202485e0773eef8c2c19da540d59bbd07bd45bc/.bw/metrics.toml) · [当时的验收](https://github.com/forcegravity1989/builder-workbench/blob/5202485e0773eef8c2c19da540d59bbd07bd45bc/.bw/planning/v0.5/acceptance.json)

**BW 的增量价值，要看反馈有没有改变下一次决定。** Orca 已能把工作树、Issue、PR 和检查结果带到执行现场。DORA 的小批量交付建议强调尽早拿到反馈。Spotify 的设计伙伴预览展示了把一次失败操作追溯到具体问题的做法。回到 BW，可以看上一次用户卡住后，Builder 是否据此缩小了本版范围、优先修了阻断，或向共享 SE 请求了具体帮助？这些资料说明了可借鉴的做法，效果仍须在 BW 项目上观察。[Orca 评审与 Issue 文档](https://www.onorca.dev/docs/review/github) · [DORA 小批量交付](https://dora.dev/capabilities/working-in-small-batches/) · [Spotify 早期预览，2026-09-30](https://confidence.spotify.com/blog/confidence-loop)

## 怎样在一个项目里检验

从一位 Builder 最近的一次真实交付入手，用原生 Orca、Issue 和已有材料还原当时的承诺、实际使用结果和下一步。再观察一次使用 BW 的可比交付，记录团队规模、任务难度或用户条件的差异。下表是研究提出的观察方法，是否开展试用由项目负责人决定。

| 想知道什么 | 值得保留的观察 |
|---|---|
| 用户是否更早用上了 | 两次交付分别记下范围确定和首位真实用户尝试的时间，再比较等待时长。记录对方尝试的任务和遇到的阻断。到观察截止仍无人尝试，就记为尚未发生。 |
| 计划或验收帮助作了什么决定 | 哪条反馈使 Builder 优先修复、暂缓候选需求或停止投入。若两种做法都能支持同一决定，记下各自花了多少时间。 |
| 整理成本由谁承担 | Builder 为材料多花了多久，共享 SE 或 Leader 是否少翻了一段会话、少追问一次进度，又能否据此提供帮助。 |

一次复测跑通可以支持这次修复。持续价值还要看以后是否再次使用、同类阻断是否减少，以及节省的时间能否覆盖整理成本。如果原生工具已能用更少步骤支持同样的决定，这就是精简 BW 流程的依据。
