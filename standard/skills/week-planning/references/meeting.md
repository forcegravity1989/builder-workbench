# 会议接入

现场核心记录直接编辑页面，写入 `review.live_notes`。会后填写会议链接，完整转写与整理纪要分别保留，不混成一段。

内部入口由用户提供；本次仓库中尚未找到。只在工作树 `.bw/planning/.local/settings.json` 配置，不将个人脚本位置或凭据提交到仓库：

```json
{
  "transcript_argv": ["python", "内部真实脚本的绝对路径", "--url", "{url}", "--output", "{output}"],
  "minutes_spec": "内部会议纪要规范的绝对路径"
}
```

这是参数占位说明，不是已知脚本的调用格式。拿到真实脚本后先读其帮助/代码，按真实参数填写。支持 `{url}`、`{output}`、`{workspace}` 替换；不经过 shell 拼接。脚本必须在指定输出位置生成 UTF-8 MD。若脚本用另一种输出接口，写一个最小适配调用真实脚本；不得用编造转写替代。

用户把会议链接保存后，在会话执行脚本并读取任务：

```
python <PACK>/scripts/planning.py --workspace <工作目录> --version v0.4 fetch-meeting
python <PACK>/scripts/planning.py --workspace <工作目录> --version v0.4 jobs --wait 30
```

若 `needs_config`：补齐配置后再次执行 fetch-meeting；保存的链接与现场文字不会丢失。若 `ready_for_minutes`：

- `transcript`：脚本得到的完整发言 MD。
- `live_notes`：该任务开始整理时的现场记录快照。
- `minutes_spec`：实际纪要规范。
- `output`：子 agent 应写出的 Markdown 文件。
- `id`、`source_hash`、`spec_hash`：回写时检查来源未变。

给子 agent 的任务必须点名这三个真实输入和唯一输出。要求严格按规范写；保留分歧/待确认，不把建议改成决定，不添加无来源负责人/日期/指标，不改版本计划。主 agent 对照输入检查，再 `apply-minutes --job <id>`。若来源或规范已改，重新发起整理；不要强行接收旧结果。

本地 HTML 负责填写和保存；会话负责调用转写脚本与子 agent。用户在会话说“整理会议”后才执行该过程；页面不会在背后启动服务或模型。
