# Plan · 过程指标接入(本批:规范包,活 #118)

> **30 秒导读**:这是什么——本次变更的**实施计划件**(playbook 格式:改哪些文件 / 什么顺序 / 风险 / 什么证明算做完)。给谁看——审 PR 的人对着它核「合入的 diff 还对不对得上计划」。现在作数吗——**施工中**(2026-08-25;下表如实标注每步做没做,含施工中撞到并解决的真实风险)。上游:`intent.md` → `spec.md` → 本篇。

## 改哪些文件

```
standard/06-scripts/github-review-wait.py        新增
standard/06-scripts/github-first-pass.py         新增(两步拉取,见风险 1)
standard/06-scripts/github-rework-rounds.py      新增(同上)
standard/06-scripts/github-first-review-wait.py  新增
standard/06-scripts/github-intent-lead.py        新增(两步拉取)
standard/06-scripts/github-lead-time.py          新增(两步拉取)
standard/06-scripts/github-open-prs.py           新增
standard/06-scripts/github-issue-survival.py     新增
standard/06-scripts/handbook-changes.py          新增
standard/06-scripts/release-gap.py               新增
standard/04-metrics/process-catalog.md           新增(26 条总账)
standard/04-metrics/metrics.toml.tmpl            追加过程指标示例段
standard/skills/metrics-refresh/SKILL.md         加「过程指标包」荐入节 + 三处引子
standard/VERSION                                 5.0 → 5.1
crates/bw-v4/src/standard/mod.rs                 登记 11 份铺底件(十脚本 + 目录)
docs/v4-prototype/design.md                      §4.2 两处实况小修
docs/changes/2026-08-25-process-metrics/         本产物链三件(试验)
```

## 顺序与进度

| # | 步 | 状态 |
|---|---|---|
| 1 | 按标准建活:#118(本批)+ #119~#124(等前置的能力,各写明解锁哪些指标) | ✔ 已建 |
| 2 | 写十份脚本(协议照既有三份) | ✔ |
| 3 | 目录 + 模板示例 + 剧本荐入节 + VERSION + 铺底登记 + design 小修 | ✔ |
| 4 | 全部脚本对本仓真跑读回 + 复算抽查 | ✔(输出见下「证明」) |
| 5 | 门禁全过(fmt / clippy / wasm / 守卫 / 两壳 / cargo test) | ✔ 全绿(fmt 抓到一处折行已收;测试 12+3 通过) |
| 6 | 一件独立 commit → push → PR 挂 #118,评审对着本篇核偏差 | 本次提交即此步(PR 合入后活走完) |

## 风险(施工中已真实撞到的记进来,不删)

1. **【已撞、已解】GraphQL 节点预算**:`gh pr list --json commits --limit 1000` 被 API 拒(原话:遍历到 authors 连接要 100 万节点,超 50 万上限);降 `--limit` 到 400 **无效**(预算是 commits×authors 连接本身撑爆的)。解法:四份吃提交清单的脚本改**两步拉取**——先拉轻字段清单(1000 上限照旧),再只对**落在时间窗内**的 PR 逐张 `gh pr view --json commits`。次数随窗内数据量走、不随周数走;单 PR 接口是稳定端点,与「不按周发搜索查询」纪律不冲突。
2. **【已量化】两步拉取的耗时**:约 1.5 秒/张,四周重窗口(约 60 张合入)单脚本约 90 秒。「点了才采」可接受;#120 做定时采集编排时要预算这个时长。
3. **【预期内】空数据形态**:`release-gap` 在没有 `.bw/releases.md` 的仓如实报错等首次发版;`first-review-wait` 在单人仓大概率稀疏——都是正确行为,验收时别当失败。
4. **口径边界**:首过率把「开出后追加提交」一律记返工(BW 流程是干完才开 MR,合理;先开空 PR 再干活的流程不适用,intent-lead 明确跳过负值)。

## 证明(真实读回,本仓 = forcegravity1989/loop-buddy,窗口 2026-07-28 → 08-25)

```
github-review-wait   {"points": [W31:0.7, W32:0.2, W33:0.1, W34:2.1]}(小时)
github-first-pass    {"points": [W31:57, W32:76, W33:100, W34:31]}(%)
github-rework-rounds {"points": [W31:0.6, W32:0.4, W33:0.0, W34:6.8]}
github-first-review-wait {"points": [W32:0.4, W34:0.4]}(稀疏如实)
github-intent-lead   {"points": [W31:29.4, W32:2.0, W33:0.0, W34:0.3, W35:0.1]}(小时)
github-lead-time     {"points": [W31:17.5, W32:4.4, W33:57.3, W34:3.0]}(小时)
github-open-prs      {"points": [W31:0, W32:1, W33:3, W34:3, W35:5]}
github-issue-survival {"points": [W31:100, W32:100]}(%)
handbook-changes     {"points": [W31:1, W32:4, W33:1, W34:12, W35:0]}
release-gap          (exit 2)还没有 .bw/releases.md —— 如实,等首次发版
```

复算抽查:`gh pr list --state open --json number --jq 'length'` = **5**,与 open-prs 最新点 **5** 一致。

顺带一读:这批数字自己就会说话——W34(上周)首过率掉到 31%、返工冲到 6.8,那正是「兼容核查 + 试点站」返工密集的一周;这就是过程指标想让人看见的东西。

## 完成的定义

R1~R5(见 `spec.md`)全绿;PR 合入即活 #118 走完;合入的 diff 与本篇偏差在 PR 描述「偏差」段写明。
