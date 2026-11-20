# intent — CodeHub 适配

> **维护约定**：给产品、设计、实现和验收者读取。本篇只维护 CodeHub 来源适配的用户结果、价值、范围和归属。当前行为与判据见 [spec.md](spec.md)，证据边界见 [STATUS.md](STATUS.md)。不在正文记录提交、讨论或逐次验证流水。

## 用户结果

使用 CodeHub 仓库的 Builder 可以在 Monica 中查找、查看和处理 Issue／MR，并在版本计划和版本验收中继续使用同一来源的任务与归档信息。CodeHub 来源能正确保持“读不到平台证据”的未知状态。

任务列表、详情和处理动作属于[任务管理](../task-management/intent.md)。CodeHub 登录、CLI 和来源连接属于[内部集成](../connectors/intent.md)。本目录只维护 CodeHub 作为来源时的差异与边界。

## 价值与依据

CodeHub 仓库使用 `codehub-cli` 完成任务读写，避免把 GitHub CLI 或 GitHub 的项目身份误用于内部仓库。计划和验收按 CodeHub 项目路径读回任务，归档状态按平台记录读回，缺少证据时显示未知并说明原因。

## 范围

- 识别 CodeHub 远程、选择 `codehub-cli`、读取登录状态并给出缺失或未登录原因。
- 提供 Issue／MR 列表、详情、评论、关闭、重开、标签和 MR 检查项、文件变更及行评论。
- 在计划和验收中按 CodeHub 项目路径打开任务，并按来源读取归档 MR 状态。
- 从主干基线上的 `.bw/planning/<版本>/data.json` 读取可选验收版本。该规则对所有来源生效，通用行为由[版本验收](../version-acceptance/intent.md)维护。

## 排除与归属

- 不把 CodeHub 收敛为 GitHub Enterprise 或 GitLab，也不新增草稿 MR、Mark ready、表情、已读或修改评论正文。
- 不为 CodeHub 建立独立 Explore 用户旅程或第二条跨特性 E2E。W03「构建交付」承接任务处理，W04「验收成果」承接计划、归档和版本选择。
- CJ01 是历史 CodeHub 旅程标识，仅映射到 W03/W04 的来源适配片段，不单独登记旅程 E2E。

## 成功判据

CodeHub 仓库中的任务能按真实项目身份列出和打开，关闭 Issue 时先写原因评论，失败则保留打开状态。计划和验收能打开同一任务，归档读不回时保持未知。退出并重启后，页面仍从 CLI 和平台事实重新读取，而不是从本地状态推断结果。
