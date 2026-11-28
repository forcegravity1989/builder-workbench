# 预订与恢复

> 创建或恢复 WeLink 会议前完整读取。本文维护会议命令、确认和异常处理。CLI 行为变化时更新。

1. 在 Bot 执行机运行 `welink-cli auth status`。核对 `User Token` 有效，`EXPIRED` 按未登录处理。命令缺失或登录失效，请人在该执行机用 Monica 的「设置 → 集成 → WeLink」安装或登录。准备完成后重查状态。
2. 预览主题、起止时间、时区和与会人。用人给出的工号；只给了姓名且无法唯一确认时，询问对应工号。用户确认原样预览后才执行。更改时间、人员或主题后重新确认。
3. 运行 `welink-cli meeting create --subject "<主题>" --start-time <开始毫秒> --end-time <结束毫秒> --meeting-user-list <工号...>`。每次确认只提交一次。拿到会议 ID 后运行 `welink-cli meeting info --meeting-id <meetingId>` 核对时间、会议号和入会链接。主键用 `meetingId`，对人展示会议号；取 `jumpUrls` 的 `basic`，缺省用 `summary`。
4. 若创建响应中断或结果未知，先核对本次记录和 `welink-cli meeting list`，按主题、时间与组织者查找候选，再用 `meeting info` 核实。候选有歧义或暂无可核实结果时，在原对话请用户从 WeLink 确认，暂停重试。已知会议 ID 时只读回同一场。
