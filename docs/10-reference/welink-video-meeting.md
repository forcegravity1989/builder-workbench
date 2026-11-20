# WeLink 视频会议与 eMeeting 页面

> 给要接视频会议、议题和纪要的人。2026-11-18 记录。没有打开已登录的 WeLink 视频会议窗口，所以这里没有窗口布局。有记载的是命令帮助、eMeeting 页面地址，以及本机 `meeting-minutes` 脚本实际点到或调用的控件和接口。打不开内网页面时，打开同目录 [welink-video-meeting.html](welink-video-meeting.html)。

## 命令侧

`welink-cli` 1.0.18 的 `meeting` 子命令见 [welink-cli.md](welink-cli.md)。其中没有控制视频会议窗口的子命令。

`meeting create` 的帮助只有 `--subject`、`--start-time`、`--end-time`、`--meeting-user-list`。帮助里没有 AI 听、视频、纪要、议题参数。

议题用另外的命令写入同一场会：`topic-create`、`topic-update`、`topic-delete`、`topic`、`topic-materials`。`topic-create` 帮助里的议题类别例子是：汇报类、决策类、学习类、研讨类、演示类、审批类。

本机 `meeting-minutes` 的技术参考另写了一句：AI 听由 `welink-cli meeting create` 创建视频会议时默认开启。这次 `--help` 里看不到对应开关。

同一份技术参考还写了这些标识：

| 值 | 用途 |
|---|---|
| 建会返回的数字 `response.id` | `topic-create --meeting-id` |
| 建会返回的 32 位 `response.enMeetingId` | eMeeting 链接、转写、议题读取、纪要接口 |
| 某些查询返回的 64 位 ID | 不是纪要接口的 ID，不能截断后拿去当 `enMeetingId` |
| 建会响应 `onlineMeeting.onlineMeetingMsg` | Host / Guest 链接和会议 ID |

eMeeting 没有会议室字段。技术参考写：房间只进入本场本地记录和群通知。

## eMeeting 页面

脚本使用的地址：

| 页面 | 地址 |
|---|---|
| AI 摘要 | `https://w3.huawei.com/emeeting/#/aiSummary/{32位enMeetingId}/4` |
| 纪要 | `https://w3.huawei.com/emeeting/#/meeting/minutes/{32位enMeetingId}` |

打开这些页要浏览器已登录 `w3.huawei.com`。

### AI 摘要页上脚本点到的东西

`fetch-emeeting-transcript.mjs` 打开 AI 摘要页后：

- 在页面正文里找这些提示：`内容过短`、`未检测到足够的有效内容`、`未生成纪要`。找到就认为这场会没有转写稿。
- 按文字精确点击「语音转文字」。
- 读 `[class*=overflow-auto]` 容器里的文字，当作转写稿。

脚本写明：靠 DOM 抓取，页面改版会失效。

### 纪要页上脚本调用的东西

`emeeting-api.mjs` 打开纪要页，在页面登录态下调用：

| 动作 | 接口 |
|---|---|
| 读纪要 | `GET /emeeting/server/api/meeting/v1/getMeetingSummryText/{enMeetingId}` |
| 读议题 | `GET /emeeting/server/api/v1/meeting/{enMeetingId}/topic/list` |
| 写纪要 | `POST /emeeting/server/api/meeting/v1/addMeetingSummryText` |

写的时候分块提交。会议级正文对应「本次会议主要内容」，`topicId` 不传。每个议题再提交一次，带该议题的 `topicId` 和 HTML。请求体里 `saveHistory` 为 `false`。脚本注释写：这是草稿，不产生历史版本。

议题列表读回的字段：`topicId`、`name`、`topicCategory`，以及 `roleKey === "topicReporter"` 的汇报人（姓名和工号）。

`meeting-minutes` 写明：只把草稿写入 eMeeting，由人在 eMeeting 页面点击「发送纪要」。脚本里没有发送动作。

读回的纪要正文是转义后的 HTML。写入要送原始 HTML。
