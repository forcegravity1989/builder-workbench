# Cursor 会话反哺执行

> Cursor 在提取本仓开发会话、生成 workflow 指标评论时按需读取。本文维护 Cursor transcript 的定位、提取命令与失败处理；六项口径、标注语义与发布规则归[真实任务反馈](workflow-feedback.md)，验证规则归[开发规范](../../../../docs/development.md)。提取入口、记录格式或脚本变化时更新。Codex 入口见 [codex.md](codex.md#会话反哺)，Claude 入口见 [claude.md](claude.md#会话反哺)。

## 会话反哺

原始记录在用户目录 `.cursor/projects/<项目 slug>/agent-transcripts/<会话 ID>/<会话 ID>.jsonl`（Windows 为 `%USERPROFILE%\.cursor\projects`）。项目 slug 是工作区路径去掉盘符冒号、把分隔符换成 `-`。按会话 ID 定位该文件，不扫描所有正文。同一会话目录下的续接片段可以一并传入。`subagents/` 里的子 agent 记录不要并入。不要读凭据或用工具回显冒充会话导出。

```bash
node .claude/skills/workbench-start/scripts/cursor-session-feedback.mjs extract --input 原始.jsonl --out 提取.json
# 同一会话目录下有续接片段时，显式传入全部片段。
node .claude/skills/workbench-start/scripts/cursor-session-feedback.mjs extract --input 首段.jsonl --input 续段.jsonl --out 提取.json
node .claude/skills/workbench-start/scripts/cursor-session-feedback.mjs schema
```

提取只把 `<user_query>` 里的人话当用户消息。后台任务结束时注入的 “Briefly inform the user about the task result” 跟进、只有时间戳的空行、工具回显和子 agent 记录都不算新的人工输入。查询标签之外还剩下来源不明的正文时保留缺口，不当作人工输入。用户行缺少 `message` 或正文时也记缺口，避免还有其他有效输入时被报成完整覆盖；只有时间戳、系统通知或后台任务跟进的空轮次不记缺口。模型 `AskQuestion` 工具调用保留为提问身份（`question`），助手文本为 `assistant`，纯工具调用不计消息。同一会话多片段按文件顺序拼接，真实重复发送留给模型判断。正文不可读、损坏或截断保留缺口，不能生成零值。

按 `schema` 逐条标注原始消息，引用首次完成交付、人审和重新交付的证据。完整覆盖须有本次开工消息，并核对提取出的全部用户输入。结合上下文判断语义，由脚本生成指标评论；计数、校验与评论渲染复用与 Codex 相同的 `workflow-feedback-report.mjs`，仅提取入口与来源标注（`来源：Cursor`）不同。原始记录有缺口，或现有脚本无法划清本次交付范围时，相应指标保留未知。Cursor 的宿主权限批准不形成可提取的转录消息，权限计数只覆盖模型结构化提问（如 `AskQuestion`）；转录中的 0 轮不代表没有发生权限批准，须在缺口或反哺中说明，不能当作已核对的零。沙箱自动审核无需人工回答时不计。

```bash
node .claude/skills/workbench-start/scripts/cursor-session-feedback.mjs report --input 提取.json --annotations 标注.json --out 评论.md --json 指标.json
# 已有指标评论时按 bw-workflow-feedback 标记核对作者和 ID，再 PATCH 同一评论。
gh api --method PATCH repos/OWNER/REPO/issues/comments/评论ID -f body="$(cat 评论.md)"
# 首次交付还没有指标评论时，使用下面的发布命令。
gh pr comment PR编号 --body-file 评论.md
```

读回脚本评论，核对 `bw-workflow-feedback` 标记和指标覆盖。符合筛选条件时读取当前标题，若已有 `[AI] ` 前缀则跳过标题更新。

```bash
gh pr view PR编号 --json title,comments
gh pr edit PR编号 --title "[AI] 原 PR 标题"
gh pr view PR编号 --json title
# 快速浏览最近 100 条。正式统计须取齐窗口内的交付，再精确匹配前缀。
gh pr list --state all --limit 100 --json number,title,url --jq '.[] | select(.title | startswith("[AI] "))'
```

`report` 会重读全部原始来源，核对用户输入、提问及引用的交付证据；助手后续进展不影响快照，新增人工输入或提问则要求重跑。新增输入后重跑 `extract`、标注和 `report`，按当前授权发布或更新原评论。过程尚未完整时展示已观察次数，完整过程发生率保持未知。补历史时若标记缺失或有歧义，先读正文核对具体指标评论，避免覆盖验证 Review。脚本通过只证明本次计数与协议。
