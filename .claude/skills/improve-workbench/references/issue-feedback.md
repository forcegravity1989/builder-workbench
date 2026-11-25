# 提单阶段反哺

> 真实 Issue 写后读回时使用，维护提单阶段的采集、报告、评论和样本标记。交付后的 PR 指标继续由 workbench-start 管理。

1. 核对当前会话的实际 provider、会话 ID 和原始记录。按确定的会话和续接片段取材。Codex 查 `CODEX_HOME`（未设置时用用户目录 `.codex`）下的 `sessions` 与 `archived_sessions`。Claude 查 `.claude/projects` 中对应项目和会话的 JSONL。Cursor 查 `.cursor/projects` 下对应工作区的 `agent-transcripts`。只用当前账号允许读取的记录。无法读取时保留未知，从已提交的授权材料写定性候选。
2. 用包内 `scripts/` 对应的 `codex-session-feedback.mjs`、`claude-session-feedback.mjs` 或 `cursor-session-feedback.mjs`。从 BW 源码直接打开本 Skill 时，同一脚本在 `.claude/skills/workbench-start/scripts/`。确认 Node 和脚本可执行，按以下顺序操作；将 `<脚本>` 与文件占位符替换成可访问的实际路径。续接片段可重复传 `--input`。

   ```text
   node <脚本> extract --input <原始记录> --out <本地提取.json>
   node <脚本> schema
   node <脚本> report --input <本地提取.json> --annotations <本地标注.json> --out <本地评论.md>
   ```

3. 按 schema 逐条核对真正的人输入和模型提问。用 `scope: "issue-only"`、真实 `issueUrl` 和实际工作流版本。填写可公开的会话简称，留下本地原证据定位。PR URL、首交、评审与交付覆盖字段留空或未知。只观察过部分过程时不填写零；真实原话与同一消息的转发只计一次，无法核对来源的批注或转述保留为材料。
4. 检查生成评论的公开内容，再沿写权限发布。先读现有评论，按 `bw-workflow-feedback` 标记、同一 Issue 和作者找到该提单阶段的评论并原位更新。没有匹配项则用已核实的 Issue 评论工具新建，例如已具相应权限时用 `gh issue comment <已核验 Issue URL> --body-file <本地评论.md>`。写后独立读回评论。环境、脚本、来源或权限不足时，说明保留了哪些材料，公开评论仍待处理。
5. 确实采用本流程且可核对报告时，读取 BW 目标仓的 `bw:improve-workbench` 标签，确认其描述为本流程的反馈样本后添加到 Issue，并在写后读回。该标签不表示处理状态；不要给未采用本流程的历史 Issue 批量补标。标签缺失、描述不符或权限不足时报告具体原因，交维护者处理，不另造同义标签。已有的 Bug/Feature、工作计划标签和 Issue 状态继续按各自规则使用。
