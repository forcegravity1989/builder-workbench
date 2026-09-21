# 会议接入

现场核心记录直接编辑页面，写入 `review.live_notes`。页面不提供会议链接输入框；会后用户把链接交给会话，由会话写入 `review.meeting_url` 后再取转写。完整转写与整理纪要分别保留，不混成一段。原始转写不在页面手填：由转写脚本或会话写入 `review.transcript.text`，页面只编辑现场记录与纪要。

## 内置转写脚本与纪要模板

Skill 自带华为 eMeeting 转写脚本（`scripts/fetch-emeeting-transcript.mjs`，经 #219 真实会议验证）和最简纪要模板（`assets/minutes-template.md`：本周 Top3 目标、周五交付件、数字指标变化，只有这三节）。init 后默认配置即可用，无需会话另行提供：

```json
{
  "transcript_argv": ["node", "<PACK>/scripts/fetch-emeeting-transcript.mjs", "{url}", "{output}"],
  "minutes_spec": "<PACK>/assets/minutes-template.md"
}
```

需要换脚本或规范时，只改工作树 `.bw/planning/.local/settings.json`（Git 忽略，不提交个人路径或凭据）。支持 `{url}`、`{output}`、`{workspace}` 替换；不经过 shell 拼接。脚本必须在指定输出位置生成 UTF-8 文本。

## 获取转写的前置条件

转写经本机已登录 Chrome 抓取，会话环境连不到内网不影响用户本机执行：

- Chrome 已登录华为域（脚本经 CDP proxy 新开 tab，天然携带登录态，不动已有标签页）。
- CDP proxy 运行中：先 `node check-deps.mjs --browser chrome` 启动（监听 localhost:3456）。
- 会议已结束且已生成「语音转文字」。

会话把有效会议链接写入 `review.meeting_url` 并保存后，再执行脚本并读取任务：

```
python <PACK>/scripts/planning.py --workspace <工作目录> --version v0.4 fetch-meeting
python <PACK>/scripts/planning.py --workspace <工作目录> --version v0.4 jobs --wait 30
```

任务落在 `failed.error` 时按原因处理，不重试盲跑：

| 失败原因 | 处理 |
|---|---|
| CDP proxy 未启动 | 先启动 web-access 代理，再执行 fetch-meeting；链接与现场文字不丢失 |
| 找不到「语音转文字」标签 | Chrome 未登录华为域或页面结构变化；请用户确认登录态，结构变化时报告缺口，不改用编造转写 |
| 转写内容为空 | 会议未生成转写或未加载完成；确认后改走人工纪要，不伪造转写稿 |
| 抓取超时或内网不可达 | 报告原因，请用户确认内网可达后重试；连续失败改走人工纪要 |

人工退路：用户手写或粘贴纪要后按 `manual` 状态处理，不冒充脚本产出。

## 子 agent 整理纪要

若 `ready_for_minutes`：

- `transcript`：脚本得到的完整转写文本。
- `live_notes`：该任务开始整理时的现场记录快照。
- `minutes_spec`：实际纪要模板（默认三节模板）。
- `output`：子 agent 应写出的 Markdown 文件。
- `id`、`source_hash`、`spec_hash`：回写时检查来源未变。

给子 agent 的任务必须点名这三个真实输入和唯一输出。要求严格按模板三节写，不新增章节、不添加无来源的负责人/日期/指标；保留分歧/待确认，不把建议改成决定，不改版本计划。主 agent 对照输入检查，再 `apply-minutes --job <id>`。若来源或模板已改，重新发起整理；不要强行接收旧结果。

本地 HTML 负责填写和保存；会话负责调用转写脚本与子 agent。用户在会话说“整理会议”后才执行该过程；页面不会在背后启动服务或模型。
