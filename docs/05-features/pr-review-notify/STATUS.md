# STATUS — PR 评审通知与顺滑进入（pr-review-notify）

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-29）**：特性随 [#199](https://github.com/forcegravity1989/builder-workbench/issues/199) 会议评审范围扭转起草（此前两草案 welink-review-invite / welink-iteration-flow 随扭转废弃删除，git 留史）。聚焦 PR 评审请求的顺滑通知与进入，双方案并行开发完成、后定保留或取舍：①WeLink 群聊面板链路（历史/发送/未读红点＋右键「发送评审」预填＋接收侧点击跳转）；②原生通知链路（右键「发送评审通知」→ BW 自有 loopback 监听器 → Windows 通知 → 点击跳转）。两案均**用户点击后跳转**，不自动导航（owner 2026-10-28 纠正）。**意图 gate 已过**（2026-10-28 owner「调研并进行开发」）。2026-10-29 owner 亲测反馈两增补已落：浮动按钮/面板照浮动工作区模式可拖拽（位置持久化）、CARD_MSG/IMAGESPAN_MSG 真实解析渲染（此前占位）。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ● | intent.md 定稿；gate 经人确认（2026-10-28「调研并进行开发」＋方案二不经 WeLink、两案点击后才跳两条纠正入文） |
| 2 spec | ◐ | spec.md：调研结论、共用跳转协议、两方案行为口径（方案二传输/降噪实现决策已回写）、验收点 N01–N12 与旅程 NJ01；可点原型 [prototype.html](prototype.html) 26 项 Playwright DOM 断言通过；规格 gate 随交付 PR 人审 |
| 3 实现设计 | ● | 两案代码落盘：方案一群聊面板链路（`[chat]` 配置→浮动面板→welink-cli 收发→未读游标→右键预填→消息点击跳转）；方案二原生通知链路（`review-request-payload` 协议＋loopback 监听器＋`bw-review:sendReviewRequest` IPC＋source `review-request` 通知面＋`ui:openPrReview` 点击路由）；2026-10-29 增补：按钮/面板拖拽定位（`project-chat-position.ts` 锚点持久化＋视口夹取）、消息内容解析（`welink-chat-content.ts`：引用回复卡/标题链接卡/图片坐标串，解析不了回落占位）；门禁全绿（tsc node/web、oxlint、oxfmt、vitest 47+122 例） |
| 4 TDD | ◐ | 新增 pr-review-message.test.ts 4 例（拼装/识别/拒判）＋project-charter.test.ts 2 例（[chat] 表解析）；方案二协议解析入 `parseReviewRequestBody`（负载校验随监听器拒判路径 live 验证 403/400）；ratchet 基线 222 不动——新增 6 例以同交付删 6 例对冲（trunk-sync 1、knowledge-repo 1、overview-sdlc 1、material-port 2、snapshot 1） |
| 5 验收点E2E | ◐ | 方案一 N01–N09 关键链路真壳 live 验证（右键菜单启用、prForBranch 真实 PR #378、compose 预填、历史 31 条、点击跳转 PR 详情页）；N03 解析口径 2026-10-29 复验（真实群历史：引用回复卡正文＋被引用摘要、AI创会链接卡、图片条目文件名/大小/随图文字，坐标串与卡片 JSON 不裸露）；N13 拖拽 live（真实鼠标拖按钮/面板标题栏、右缘夹取、拖后开合态保持、X 不被劫持、reload 后按钮/面板位置读回一致）；「发送评审」置灰门（未配置 [chat]/非活跃项目，检视后补）代码已落、未逐态真壳复验；方案二 N10 live（POST→通知投递 delivered、错 token 403、AUMID 计数佐证）；N11 点击跳转自动化受阻于本机勿扰环境（toast/通知中心无法程序化点击），留 NJ01 人手旅程验证 |
| 6 旅程E2E | 待建 | NJ01（双用户真实评审，两案各走一遍）已定义未运行 |
