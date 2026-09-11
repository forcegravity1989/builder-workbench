# Issue 状态与版本标签

Issue + 标签是唯一正本。评论可以记录会议过程，但不参与状态、版本归属或遗留计算。

## 标签语义

- `bw:status:{todo|inprogress|inreview|blocked}`：执行状态，单值。开放 issue 没有可识别状态标签时按 `todo`；关闭且没有取消标签就是完成。
- `bw:status:cancelled`：取消并关闭；取消不等于完成。
- `bw:plan:<版本>`：计划纳入关系，可多值。同一 issue 可以同时带 A、B，表示它曾纳入 A、现在也纳入 B；纳入 B 只增加 B，不删除 A。
- `bw:released:<版本>`：实际在哪个版本交付，单值，由人点发版本时 Workbench 写入。
- `bw:category:{prototype|build|optimize|growth|ops}`：类别，单值。

回看已发布版本 A：带 `bw:plan:A` 但不带 `bw:released:A` 的 issue 显示「遗留」；若它除 A 外恰好还带一个 `bw:plan:B`，显示「遗留 B」。这是版本结果标识，不是执行状态。

## 谁可以改

- 人在 Workbench 点按钮或拖卡：程序按动作精确改标签。
- 模型完成代码并提 MR：只可把执行状态改到 `bw:status:inreview`，不得关闭 issue、不得合入、不得标完成。
- week-planning 模型在人确认纳入清单后：可增加指定 `bw:plan:<版本>`，必须保留已有其他 plan、status、released、category 标签，并在写后读回。
- 自动化和定时任务不得把 issue 推到完成。完成永远由人在 Workbench 点。

## 执行状态机

- 未排期 → 待办 / 进行中 / 取消 / 完成
- 待办 → 未排期 / 进行中 / 阻塞 / 取消 / 完成
- 进行中 → 待办 / 待评审 / 阻塞 / 取消 / 完成
- 待评审 → 进行中 / 阻塞 / 取消 / 完成
- 阻塞 → 待办 / 进行中 / 取消 / 完成
- 完成 → 待办 / 进行中

其中“完成”边只允许人触发；“遗留”不在这张状态机里。

## 远端直写纪律

CodeHub 的 `issue update --labels` 可能整张替换：先读回全部标签，只增加或删除目标标签，再把完整集合写回。GitHub 使用精确的 `--add-label` / `--remove-label`。任何 provider 都不得用“替换整个 `bw:plan:` namespace”的方式纳入新版本。

移出版本时只删除人明确指定的 `bw:plan:<版本>`；不清空其他计划版本，不从评论猜历史，不写顺延链。
