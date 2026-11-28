# 预订验收会议

> 本文给 BW 会议助手会话在预订、改期或取消验收会议前完整读取；只规定本步骤的方法、产物与失败边界，完整旅程在 SKILL.md。行为或协议变化时维护，不记录开发流水。

建会、改期、取消用 welink-cli，不依赖 Orca 云连接器，也不依赖额外安装的会议技能。边界固定：**先预览后执行**——创建、改期、取消每一项外部写入都先给人完整预览，经确认后才执行；对未变化的预览给出一次明确同意即视为本次执行的一次确认，预览有变化原确认即失效、须重新确认。不代订会议室、不推断发言人、不做未经预览的外部写入。会议工具缺失或未登录时如实转告缺什么、请人安装或登录，不虚构步骤、不绕道。

- **预订会议**：收到预订请求 → 按下面顺序执行，参数或工具版本不明确时读取该子命令 `--help`：
  1. 材料预检：用第 8 步的 `bw materials read` 读回验收材料，核对版本与归属；再把读回的原文以 `--expected-revision <刚读回的修订>` 原样保存一次（内容不变、修订不变、幂等）。读不到或保存被拒（只读共享、无写权限）时，说明补救操作（由宿主授权写或换有写权限的宿主）并停止，不进入建会。
  2. 先跑 `welink-cli auth status`。未登录且无法自动刷新时如实请人先登录，不继续预订。
  3. 定与会人：读项目根 `.bw/project.toml` 的 `[chat].group_id`（项目绑定的项目群），执行 `welink-cli im query-group-member --group-id "<群号>"`，取 `memberAccount`，只保留 `TYPE_OWNER`/`TYPE_ADMIN`/`TYPE_NORMAL`，排除 `TYPE_AGENT_ASSISTANT`/`TYPE_ASSISTANT` 等机器人。**没有绑定项目群、`.bw/project.toml` 读不到或 `group_id` 为空时，先请人提供群号**；人没有群号，再请人直接给与会人工号。不猜、不编与会人。
  4. 定时间：缺省按本周五验收会时段；时间或与会人仍缺时只问缺的那一项，不重复追问。会议室不是 `meeting create` 的参数，不作为阻塞项。
  5. 生成完整预览（项目、版本、起止时间、与会人、议题），不执行外部写入；人确认后再创建。
  6. 用毫秒时间戳创建（AI 听随会议创建默认开启，无单独参数，不伪造开启步骤）：
     ```bash
     welink-cli meeting create --start-time <开始毫秒> --end-time <结束毫秒> --subject "<标题>" --meeting-user-list <工号...>
     ```
     创建中断或没拿到明确回执时，先从命令输出找回 `meetingId` 并用 `meeting info` 核实是否已建；找不到 ID 时如实告知人并请人在 WeLink 里核对，不盲目重建，避免重复建会。
  7. 用 `welink-cli meeting info --meeting-id <meetingId>` 读回 `meetingId`、`jumpUrls` 与时间；`meetingNo` 不是会议主键，不要拿它当 ID。建会与读回的响应里另有 32 位 `enMeetingId`（eMeeting 侧主键），一并记下；读不到就缺省，不猜。
  8. 把会议信息写回验收材料 `meeting`：`{title, time, id?, enMeetingId?, link?, attendees?}`——`id` 存 `meetingId`；`enMeetingId` 存 eMeeting 侧 32 位 ID；`link` 取 `jumpUrls` 中 `type=basic`（缺省用 `summary`）的地址；`attendees` 存实际传给 `--meeting-user-list` 的工号；`time` 用「MM-DD(周X) HH:mm–HH:mm」的人读写法。写回用原生材料服务，`--repo-id`/`--worktree-id` 用开工读回的原生身份：
     ```bash
     ORCA bw materials read --repo-id <id> --worktree-id <id> --host-id <host> --workflow acceptance --version <版本>
     ORCA bw materials save --repo-id <id> --worktree-id <id> --host-id <host> --workflow acceptance --version <版本> --expected-revision <revision> --input-stdin
     ```
     先读拿 `revision`，以最新读回的材料为底稿**只改 `meeting` 字段**，其余字段（含人工结论）原样保留，把完整 JSON 草稿通过标准输入传入，再带 `--expected-revision` 保存，不直接改文件；完整参数见[版本材料](../../../references/version-records.md)。保存被拒或修订冲突时，会议已建成的先把会议 ID 与链接告诉人，再重新 `read` 拿最新修订把**同一会议**重写进 `meeting`，不重复建会；重试仍失败保留草稿并如实说明。写回后把标题、时间、会议 ID、与会人数与会议页面链接回执给人。
  9. 已预订不重复订；恢复会话或重复请求时先读材料 `meeting`，已有会议先用 `meeting info` 读回核对再继续，指向同一会议。改期用 `welink-cli meeting update`，取消用 `welink-cli meeting cancel`，由人说明后同样先预览再执行；改期与取消后同样只合并写回材料 `meeting`（取消后无 `info` 可读，材料按实际结果更新）。已知事实：入会链接里的 `enMeetingId` 每次 `meeting info` 查询都会轮换，材料里存的 `link` 可能已不是最新，会上打不开时重新 `meeting info` 取一条，会议号才是稳定标识。
