# spec — CodeHub 适配

> **状态：草案，待人 gate。** 价值见 [intent.md](intent.md)，证据见 [STATUS.md](STATUS.md)。
>
> **维护约定**：给实现和验收 CodeHub 行为的人读。任务页细节以 [ref/upstream.md](../../../ref/upstream.md) CodeHub 节为准，命令形状以 [codehub-cli 指南](../../03-guide/codehub-cli.md) 和本机 `--help` 为准。本篇写用户能观察到的规则。还没有可点原型，按 [02 §3.2](../../01-principles/02-working-backwards.md) 不能过规格 gate。

## 范围与入口

任务页在选中仓库的远程全部是 CodeHub、且 `codehub-cli` 在 PATH 上时，自动使用来源 `codehub`。这一步发生在 GitHub 列表之前。旧配置的可见来源里没有 `codehub` 时补一次；用户关掉之后不再加回。用户手动改过的来源不再被盖掉。

CLI 缺失时，错误是 `codehub-cli is not installed or not on PATH`。设置里的集成卡片只区分检查中、已安装、未安装，不探测登录。

主机按 `codehub`、`codehub.*`、`codehub-*`、`*.codehub.*` 识别。GitHub.com 的列表和更新路径保持原样。

## 完整用户旅程

1. Builder 打开一个 CodeHub 仓库的任务页，看到 Issues 或 MRs。
2. 用开放、我的、待评审、搜索缩小范围，点开一条，阅读标题和评论。
3. 需要结束时，Issue 选择完成、不计划或重复并关闭；或者 MR 直接关闭。
4. 在计划或验收里点开同一条任务，详情仍来自 CodeHub。
5. 看归档状态：CodeHub 仓库显示未知和固定原因，不显示成尚未创建，也不显示成已合入。
6. 开始验收时，从采用基线上已有 `data.json` 的版本目录选择当前计划。

## 行为规则与异常

### 任务列表与详情

列表种类是 Issue 和 MR。开放对应 `--state opened`。我的：Issue 用 `assigned_to_me`，MR 用 `created_by_me`。待评审只对 MR，用 `need_my_review`。MR 搜索走 `--search`。

每仓先取 30 条，用 `--limit` 再取，并多取一条判断后面还有没有。还有未加载内容时，空的已加载范围要说成「当前加载范围里没有」，不能说成项目没有 Issue。

详情读取 view 和评论的列出、新建、删除。Issue 可改标题。关闭顺序是先写评论再 `issue close`；评论失败则不关闭。三条评论正文是 `关闭原因: completed`、`关闭原因: not planned`、`关闭原因: duplicate of #<iid>`。重新打开不写评论。MR 可关闭。不提供草稿、Mark ready、表情、已读、修改评论正文。

### 计划与验收中的任务

关联引用的 `provider` 为 `codehub` 时，用 CodeHub 项目路径匹配仓库，不用 GitHub 的 `owner/repo` 去对。读取时先按 Issue 查看，失败再按 MR 查看。打开详情走任务页的 CodeHub 入口。CLI 没有返回链接且远程地址也拼不出网页链接时，读回失败并说明未返回链接。

### 归档

注册为 CodeHub 远程的仓库，归档 PR 状态保持未知，原因固定为「此来源的 PR 状态暂无法读回」。旅程灯只读模型写入材料的 workflow.stage，与 provider 无关；归档状态行按材料记录的 archivePr 薄读取，读不回就不显示合入状态，也不编造。GitHub 仓库按 archivePr 显示已合入／待合入／已关闭；尚未记录 PR 引用时显示尚未进入归档或 PR 链接待写入，各原因不要混用。

### 验收可选版本

采用基线上 `.bw/planning/<版本>/data.json` 能读成一份计划，该版本就出现在可选列表里。目录名不符合版本约定、文件读不成计划、或提交不在采用基线上的，不列入。未出现在基线上的计划仍可按验收规格做草案预验收。这条规则写在[验收规格](../version-acceptance/spec.md)，实现在版本历史服务的 `treePlans`。

### 失败

| 现象 | 结果 |
|---|---|
| 未安装 CLI | 明确未安装；不改走 `gh` |
| 仓库不是 CodeHub，或路径对不上 | 写操作在执行前拒绝 |
| 关闭评论失败 | Issue 保持原状态 |
| 归档 PR 状态读不回 | 未知，带上述固定原因 |
| 版本目录没有可读的 `data.json` | 不作为验收可选版本 |

## 验收

| 标识 | 场景 | 可观察结果 |
|---|---|---|
| C01 | 选中仓库全是 CodeHub，CLI 已安装 | 任务页来源是 CodeHub，不先显示 GitHub 空列表 |
| C02 | 列表有后续页，当前页搜索为空 | 文案指向当前加载范围，不断言项目没有 Issue |
| C03 | 关闭一条 Issue | 先出现对应关单评论，再变为关闭；评论失败时仍是打开 |
| C04 | MR 详情与新建 | 没有草稿开关，没有 Mark ready；可以关闭 |
| C05 | CLI 不在 PATH | 可见未安装说明；集成卡片不是「已登录」 |
| C06 | 计划或验收打开 CodeHub 任务 | 详情来自该项目路径上的 Issue 或 MR |
| C07 | 仓库远程是 CodeHub | 归档 PR 状态为未知，原因是此来源的 PR 状态暂无法读回；旅程灯仍按 workflow.stage 显示 |
| C08 | 采用基线上某版本目录有 `data.json` | 验收可以选择该版本的当前计划；坏目录不出现 |

旅程 CJ01：从 CodeHub 仓库打开任务，关闭一条 Issue，重启后再次列出该 Issue 仍为关闭。需要内部 CodeHub 与已登录的 CLI，本次未跑。

## 取舍与待决问题

任务列表不挂在 GitHub 的 `listWorkItems` 后面，避免远程解析失败时静默降级。归档不用「提交已经在分支上」代替平台合入证据，以免没数据时显示成已完成。

待决项见 [intent](intent.md)：边界是否含计划 / 验收、合入证据何时才允许离开未知。可点原型仍缺。
