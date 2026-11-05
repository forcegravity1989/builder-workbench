# 预订会议与纪要同步

> 本文给版本验收会话在对应动作前完整读取；只规定本步骤的方法、产物与失败边界，完整旅程在 SKILL.md。行为或协议变化时维护，不记录开发流水。

建会、改期、取消、写入纪要草稿都由本流程自带,不依赖额外安装的会议技能:建会改期取消用 welink-cli;写入纪要草稿用**用户自己的浏览器**(本机 Chrome/Edge 经 CDP 驱动,步骤与自带脚本见[纪要同步](minutes-sync.md)),**不用 Orca 内置浏览器**。浏览器或 Node 缺失时如实说明缺什么、请人补齐,不虚构写入步骤。边界固定:**先预览后执行**——创建会议、写入纪要草稿,每一项外部写入都先给人完整预览,经确认后才执行;对未变化的预览给出一次明确同意即视为本次执行的一次确认,预览有变化原确认即失效、须重新确认,不在建会、写草稿之间重复索取确认。**只把纪要写入会议草稿**,由人在会议系统复核并手动点击发送,你不代发;不代订会议室、不推断发言人、不做未经预览的外部写入。会议工具缺失或未登录时如实转告缺什么、请人安装或登录,不虚构步骤、不绕道。

- **预订会议**:收到预订请求 → 按下面顺序执行,参数或工具版本不明确时读取该子命令 `--help`:
  1. 先跑 `welink-cli auth status`。未登录且无法自动刷新时如实请人先登录,不继续预订。
  2. 定与会人:读项目根 `.bw/project.toml` 的 `[chat].group_id`(项目绑定的项目群),执行 `welink-cli im query-group-member --group-id "<群号>"`,取 `memberAccount`,只保留 `TYPE_OWNER`/`TYPE_ADMIN`/`TYPE_NORMAL`,排除 `TYPE_AGENT_ASSISTANT`/`TYPE_ASSISTANT` 等机器人。**没有绑定项目群、`.bw/project.toml` 读不到或 `group_id` 为空时,先请人提供群号**;人没有群号,再请人直接给与会人工号。不猜、不编与会人。
  3. 定时间:缺省按本周五验收会时段;时间或与会人仍缺时只问缺的那一项,不重复追问。会议室不是 `meeting create` 的参数,不作为阻塞项。
  4. 生成完整预览(起止时间、与会人、议题),不执行外部写入;人确认后再创建。
  5. 用毫秒时间戳创建(AI 听随会议创建默认开启,无单独参数,不伪造开启步骤):
     ```bash
     welink-cli meeting create --start-time <开始毫秒> --end-time <结束毫秒> --subject "<标题>" --meeting-user-list <工号...>
     ```
  6. 用 `welink-cli meeting info --meeting-id <meetingId>` 读回 `meetingId`、`jumpUrls` 与时间;`meetingNo` 不是会议主键,不要拿它当 ID。建会与读回的响应里另有 32 位 `enMeetingId`(eMeeting 侧主键,写入纪要草稿靠它定位会议),一并记下;读不到就缺省,不猜。
  7. 向项目群发会议通知(独立外部写入:正文全文+收件群单独预览,经人确认后执行,不因建会已确认而免确认)。收件群取 `.bw/project.toml` 的 `[chat].group_id`(与定与会人同一来源),读不到或为空先请人给群号,不猜;正文含标题、时间(人读写法)、会议号(`meetingId`,稳定标识)、入会链接、议题(按验收屏四分区:验收准备、Showcase、会议纪要、归档 PR 及发版本),用 `\n` 分行。已知事实:入会链接里的 `enMeetingId` 每次 `meeting info` 查询都会轮换,通知发当时读回的那条;材料里存的 `link` 可能已不是最新,会上打不开时重新 `meeting info` 取一条,会议号才是稳定标识。WeLink 建会/改期时会议系统是否已自动通知与会人未核实,按仍需向项目群发一条处理。确认后执行:
     ```bash
     welink-cli im send-to-group --group-id "<群号>" --text "<正文>"
     ```
     发送后把 `msgId`/`resultCode` 如实回执;发不出去就说没发出去,不假装已通知。通知发送事实不进验收材料,只在会话中回执。
  8. 把会议信息写回验收材料 `meeting`:`{title, time, id?, enMeetingId?, link?, attendees?}`——`id` 存 `meetingId`;`enMeetingId` 存 eMeeting 侧 32 位 ID(同步纪要定位会议用);`link` 取 `jumpUrls` 中 `type=basic`(缺省用 `summary`)的地址;`attendees` 存实际传给 `--meeting-user-list` 的工号;`time` 用「MM-DD(周X) HH:mm–HH:mm」的人读写法。写回用原生材料服务,`--repo-id`/`--worktree-id` 用开工读回的原生身份:
     ```bash
     ORCA bw materials read --repo-id <id> --worktree-id <id> --host-id <host> --workflow acceptance --version <版本>
     ORCA bw materials save --repo-id <id> --worktree-id <id> --host-id <host> --workflow acceptance --version <版本> --expected-revision <revision> --input-stdin
     ```
     先读拿 `revision`，把完整 JSON 草稿通过标准输入传入，再带 `--expected-revision` 保存,不直接改文件;完整参数见[版本材料](../../../references/version-records.md)。写回后告知人板面「验收会议」行已读回标题、时间、会议 ID、与会人数与会议页面。
  9. 已预订不重复订;改期用 `welink-cli meeting update`,取消用 `welink-cli meeting cancel`,由人说明后同样先预览再执行。改期与取消后同样向项目群发通知(口径同第 7 步,单独预览确认):改期正文补一句原时间与改期说明(原时间从材料 `meeting.time` 读),改期后重新 `meeting info` 取新链接再发;取消后无 `info` 可读,正文用材料已存信息。
- **同步会议纪要**:先读验收材料 `meeting` 定位目标会议——优先用 `enMeetingId`,没有就解析 `link`,两者都缺时如实说明并请人从 eMeeting 复制该会议的链接,不猜;材料尚未预订会议时说明先在准备区预订。把材料中已形成的纪要按固定样式渲染成草稿——按目标分节(目标句作小标题),节内共识与遗留逐条,只写人已填写或确认的内容,不虚构、不补写 → 按[纪要同步](minutes-sync.md)的步骤用用户自己的浏览器写入该会议的纪要草稿(浏览器连接、写入与幂等/中断规则以该 reference 为准):完整预览(含写回目标会议)经人确认后写入 → 返回纪要链接并提醒人最终发送是手动动作。已写入且草稿未变化的重复执行直接跳过、不重复写入;草稿或目标会议有变化时不盲覆盖,先向人说明再按新预览确认。中断或状态不确定时先打开会议系统核对草稿是否已写入,不直接重试覆盖。
