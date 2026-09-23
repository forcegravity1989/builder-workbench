# 会议接入

现场核心记录直接编辑计划页签，写入 `review.live_notes`。页面不提供会议链接输入框；会后用户把链接交给会话，由会话写入 `review.meeting_url` 后再取转写。完整转写与整理纪要分别保留，不混成一段。原始转写不在页面手填：由转写脚本或会话写入 `review.transcript.text`，页面只编辑现场记录与纪要。

## 当前转写依赖边界

本分支有 `planning.py` 和 `assets/minutes-template.md`，但缺少旧 main 的 `scripts/fetch-emeeting-transcript.mjs`。planning.py 的默认配置仍指向这个缺失脚本，所以 init 并不代表可以直接抓取会议转写；旧 #219 的真实会议验证不能当作本分支验收。

运行时依赖与默认配置由周一屏迁移任务处理。本轮不补转写脚本或改执行逻辑。会话在执行 fetch-meeting 前必须先确认实际配置的脚本存在、来源与权限可用；缺失就如实报告，不编造转写，不盲目重试。

若用户已有可用的转写工具，可在工作树 `.bw/planning/.local/settings.json` 配置 `transcript_argv` 和 `minutes_spec`；该文件不提交个人路径或凭据。命令支持 `{url}`、`{output}`、`{workspace}`，不经 shell 拼接；脚本需在指定位置写 UTF-8 文本。只有依赖确认可用后，才按 planning.py 的 fetch-meeting / jobs 协议执行，并读回成功或具体错误。

缺脚本、登录态或有效转写时，可由用户提供文本或人工纪要；按 `manual` 记录，不冒充脚本产出。

## 子 agent 整理纪要

若 `ready_for_minutes`：

- `transcript`：脚本得到的完整转写文本。
- `live_notes`：该任务开始整理时的现场记录快照。
- `minutes_spec`：实际纪要模板（默认三节模板）。
- `output`：子 agent 应写出的 Markdown 文件。
- `id`、`source_hash`、`spec_hash`：回写时检查来源未变。

给子 agent 的任务必须点名这三个真实输入和唯一输出。要求严格按模板三节写，不新增章节、不添加无来源的负责人/日期/指标；保留分歧/待确认，不把建议改成决定，不改版本计划。主 agent 对照输入检查，再 `apply-minutes --job <id>`。若来源或模板已改，重新发起整理；不要强行接收旧结果。

计划页签三屏负责填写和保存；会话负责调用转写脚本与子 agent。用户在会话说“整理会议”后才执行该过程；页面不会在背后启动服务或模型。
