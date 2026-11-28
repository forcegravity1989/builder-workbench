---
name: welink-meeting
description: Use when a Monica Bot user wants to book a WeLink meeting. Confirm the preview, create the meeting on the Bot host, and read back the meeting details.
metadata:
  version: 0.1.0
---

# WeLink 会议

帮助用户在 WeLink 预订会议并在原对话交付会议号和入会链接。预订只需主题、开始和结束时间、时区、与会人。

1. 完整读取[预订与恢复](references/meeting-preparation.md)。
2. 核对 Bot 执行机上的 WeLink 登录。只询问用户尚未提供的必需信息。
3. 给出预览，收到明确确认后创建并读回。在原对话回告主题、起止时间、会议号和入会链接。
