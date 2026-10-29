# spec — PR 评审通知与顺滑进入（pr-review-notify）

> **30 秒导读**：两方案并行落地，共用同一跳转协议（解析 PR → `openTaskPage` 落到任务屏 `PullRequestPage`）：**方案一** WeLink 群聊面板——项目群配置沿用 `.bw/project.toml [chat]`（本仓已配），浮动面板看历史/发文本（welink-cli `im send-to-group`），未读红点按 `query-history-message` 的 msgId 游标推进，worktree 右键「发送评审」自动展开并预填，接收侧识别评审消息、点击跳转；**方案二** 原生通知——不经 WeLink，发送方经 Orca 既有 agent-hook 端点（HTTP＋token，远程连接场景已在用）向接收方投递评审事件，接收方弹 Windows 系统通知（`notifications:dispatch`），点击经 IPC 路由到同一跳转协议。两案均用户点击后跳转。行为正本见本篇，意图见 [intent.md](intent.md)，可点原型见 [prototype.html](prototype.html)。
>
> **状态**：草案（2026-10-28 调研结论落笔，随实现修订；规格 gate 随交付 PR 人审）。
>
> **维护约定**：实现者、审这批改动的人读。行为口径、验收点、消息与负载格式变化时更新；不记过程流水。

## 调研结论（已核证据）

| 落点 | 证据 |
|---|---|
| 群配置已存在 | 本仓 `.bw/project.toml [chat]`：`provider="welink"`、`group_id="996840920634630304"`、`notify=["merged","release"]`；`project-charter.ts` 现只解析顶层字符串字段、忽略 `[chat]` 表——需补表解析 |
| welink-cli 收发 | 本机实测：`im send-to-group --group-id --text/--image/--file`；`im query-history-message` 返回 `respData.chatInfo[]`（`msgId` 数字游标、`sender` 账号、`contentType` TEXT_MSG/CARD_MSG、`serverSendTime`、`content`、`at`）；群内已有「项目助手」机器人（CARD_MSG 回执），评审消息与其共存 |
| 浮动面板模式 | `useFloatingWorkspacePanel`：开合持久化、窗口事件外部展开（`openMaximized`）、焦点归还、`shouldMountPanel`/`showToggleButton` |
| worktree 右键 | 版本工作区树行右键菜单（#439 绑定/改绑/解绑同款挂点） |
| PR 详情跳转 | `openTaskPage({taskSource:'github', openGitHubWorkItem, openGitHubInitialTab})` → `TaskPageContent` 渲染 `PullRequestPage`（原生评审动作齐备） |
| 原生通知链 | `notifications:dispatch`（source 现为 agent-task-complete/terminal-bell/test）＋ `native-notification-delivery` 点击回调 → `webContents.send('ui:activateWorktree')` 路由到 renderer——点击导航模式已存在 |
| agent-hook 通道 | `RelayAgentHookServer`：HTTP＋token 鉴权，端点坐标发布到 `~/.orca-relay/agent-hooks`；远程连接（SSH/WSL）场景下远端 agent 即经此 POST 事件回应用——「现有远程连接就能接收」的原生落点；跨用户缺口在端点坐标交换 |

## 共用底座：跳转协议

评审消息/事件携带最小负载：`{ repo: string（owner/name）, prNumber: number, title: string, sender: string }`。接收侧解析后：

1. 按 `repo` 定位本机接入的项目（项目墙/接入清单）；未接入如实提示「本机没有该项目」，不猜。
2. 取该 PR 工作项（缓存或 `gh` 读回），`openTaskPage({ taskSource: 'github', openGitHubWorkItem, openGitHubSourceContext })` 落到 `PullRequestPage`。
3. 跳转只由用户点击触发（面板消息点击 / 系统通知点击），任何链路不自动导航。

## 方案一：WeLink 群聊面板

### 配置与登录态

- `[chat]` 表解析进 charter（`provider` 仅 `welink`；`group_id` 必填；`notify` 沿用既有语义，本特性不消费）。`provider` 非 welink 或缺 `group_id` ⇒ 未配置态。
- welink-cli 登录态沿用 connectors 口径：未安装/未登录/EXPIRED ⇒ 面板呈现引导态（指到设置 → 集成 WeLink 卡），不装绿。

### 浮动面板

- 入口：浮动按钮（照 `FloatingTerminalToggleButton` 模式，独立于浮动工作区按钮），按钮可拖拽、位置按锚点持久化；收起时未读消息以红点计数。
- 展开：最近历史消息列表（`query-history-message`）——TEXT_MSG 渲染文本（内嵌图片坐标串剥离成「[图片]」）；CARD_MSG 解析 JSON：引用回复卡显示回复正文＋被引用摘要、标题链接卡显示标题＋可点链接（系统浏览器打开），解析不了回落「[卡片]」占位；IMAGESPAN_MSG 解析图片坐标串显示文件名/大小/可点链接＋随图文字，解析不了回落「[图片]」占位。面板可拖拽（标题栏），位置持久化。底部输入框＋发送按钮（`im send-to-group`，纯文本）。
- 未读游标：本地持久化「已读到的 msgId」；轮询发现更新消息 ⇒ 计数；展开面板视作已读、清零。轮询间隔实现期定（面板展开时更密，收起时更疏），不承诺实时。
- 面板开合状态持久化，重启读回。

### 发送评审（worktree 右键）

- 版本工作区树行右键菜单新增「发送评审」：拼装评审消息预填输入框＋面板自动展开（窗口事件，照 `openMaximized` 模式），发送仍由人点发送按钮。
- 拼装口径：`【评审请求】PR #<编号> <标题>`＋仓库＋分支＋PR 链接各一行。worktree 无对应 PR（`gh` 查不到该分支的 PR）⇒ 菜单项如实置灰或提示，不猜；PR 在而标题查不到 ⇒ 占位「（标题获取失败）」照常拼装（识别协议键在「链接：」行，标题只作展示）。项目未配置 `[chat]` 或 worktree 属非活跃项目 ⇒ 「发送评审」置灰（预填事件由活跃项目面板接收，错投即静默失效）；「发送评审通知」不受此限。
- 消息格式即识别协议：接收侧只认 `【评审请求】` 前缀＋可解析的仓库/编号行；解析失败按普通文本消息处理，不跳转。

### 接收与跳转

- 轮询识别评审消息 ⇒ 面板内该消息呈可点击态（含 PR 标识）；点击 ⇒ 跳转协议。
- 本机未接入该 repo ⇒ 点击后如实提示，不跳转。

## 方案二：原生通知

- 传输（实现已定，2026-10-29）：接收方主进程起 **BW 自有监听器**（薄挂载，复用 agent-hook 的 loopback＋token＋端点文件发布模式，不侵入其 agent-state 协议）——仅听 `127.0.0.1` 随机端口，POST `/review-request` 须带匹配 token；坐标发布到 `~/.orca-relay/agent-hooks/bw-review-request.cmd|.env`（同用户诊断用）。发送方接收端坐标手填 `userData/review-peers.json`（`{peers:[{name,host,port,token}]}`，不入 git），右键「发送评审通知」经主进程向全部 peers POST（5s 超时，逐 peer 如实回报成败）。负载 `sender` 取本机用户名（方案二不经 WeLink 无账号体系，正文只作人读标识，token 才是凭据）。loopback 口径下跨网段不承诺（同机双用户/远程连接转发场景可用）。
- 通知：接收方主进程收到评审事件 ⇒ `notifications:dispatch`（新增 source `review-request`），标题「PR 评审请求」、正文「<sender> 请求评审 PR #<编号> <标题>」；不进移动推送面（本机评审协作事件）。
- 点击：扩展通知点击路由——新增 IPC `ui:openPrReview` 携负载进 renderer，走共用跳转协议；BW 不在前台时点击先拉前台（沿用 `safelyRevealWindow`）。
- 降噪：沿用通知设置既有开关面（source 级开关照 agent-task-complete 先例，设置页「PR 评审请求」），不另造协议；突发去重键按 `repo#prNumber`（评审请求无 worktree 身份，按 worktree 键会把第二个 PR 的请求吞进冷却窗）。

## 验收点

| # | 场景 | 期望 |
|---|---|---|
| N01 | 打开已配 `[chat]` 的项目 | 浮动按钮可见；未配置项目无按钮 |
| N02 | 面板输入文本点发送 | `im send-to-group` 送达，群里可见该文本 |
| N03 | 展开面板 | 历史消息渲染（TEXT_MSG 文本、CARD_MSG 引用卡/链接卡解析、IMAGESPAN_MSG 图片条目，解析不了回落占位），按 serverSendTime 排序 |
| N04 | 收起状态群里有新消息 | 红点计数＝未读数；展开后清零 |
| N05 | worktree 右键「发送评审」 | 面板自动展开、评审消息预填输入框；人点发送后群里可见 |
| N06 | 该 worktree 无对应 PR | 菜单项置灰或如实提示，不发出 |
| N07 | 接收侧收到评审消息 | 面板内可点击态；点击落到该 PR 的 `PullRequestPage` |
| N08 | 评审消息指向未接入的 repo | 点击后如实提示「本机没有该项目」，不跳转 |
| N09 | welink-cli 未登录，或 EXPIRED 且历史确实拉不到 | 面板引导态指到集成卡，不装绿；EXPIRED 而 IM 命令自动续期后历史可拉 ⇒ 面板照常工作（登录信号不阻塞能力） |
| N10 | 方案二：发送方投递评审事件 | 接收方弹 Windows 通知（标题/正文如上） |
| N11 | 方案二：点击系统通知 | BW 前台＋落到该 PR 详情页 |
| N12 | 杀进程重开 | `[chat]` 配置、未读游标、面板开合读回一致 |
| N13 | 拖动浮动按钮/面板 | 可拖到视口内任意位置（夹取不越界），重启后位置读回一致 |

旅程 **NJ01**（双用户真实评审，两案各走一遍）：A 在版本工作区右键「发送评审」发送 → B 侧收到提示（方案一红点/方案二通知）→ B 点击 → 落到 PR 详情页开始评审（原生评审动作）→ 全程 B 不手动找项目找 PR。

## 已定与已弃

**已定**（owner，2026-10-28）：范围只做 PR 评审通知与进入；两方案并行调研开发、后定保留或取舍；接收侧用户点击后才跳转、不自动导航；方案二不经 WeLink（现有远程连接可接收，评估原生能力——结论：通道/通知/点击路由原生齐备，缺口为端点交换与新事件源，可补）；方案一通道 welink-cli 个人登录态；群配置沿用 `[chat]`。

**已弃**：早前「助手服务 AK/SK＋WebSocket」通道、任务屏 Issue 行入口、会议/纪要/远端入口/公共信息四主题（git 留史）。

## 待决（实现期）

1. 方案一轮询间隔与游标存储位置（store 持久化面）。
2. 方案二端点坐标交换已落 `review-peers.json` 手填（不入 git）；仍待决：token 即凭据，跨用户共享的安全口径（如共享主机端点文件的读取边界）。
3. 评审消息格式的防误判边界（群内「项目助手」CARD_MSG 与人手打【评审请求】的区分）。
4. 两方案保留/取舍判据（NJ01 各跑一轮后 owner 定）。
