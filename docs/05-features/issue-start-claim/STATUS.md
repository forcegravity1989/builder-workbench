# 开工认领状态

> **30 秒导读**：记录开工认领特性六环链状态、验收点证据与缺口。读者：接手开发、评审与验收的人；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)。

## 六环链状态

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 已确认 | 2026-10-30 人拍板（方向「开工把当前开 worktree 的用户标记为责任人」）；来源 [#512](https://github.com/forcegravity1989/builder-workbench/issues/512) |
| spec | 已认可 | 2026-10-30 人拍板（追加语义＋CodeHub 一起交付）；行为随实现交付评审 |
| 实现设计 | 已实施 | 薄挂载不升独立 design：BW 模块 `issue-start-claim.ts`＋quick/full 两链创建结果站点一行调用，锚点见 spec「实现锚点」；typecheck 通过 |
| 核心算法/数据协议 | — | 准入为两条件谓词，不立单测（spec「E2E/单测」：为 2 行谓词对冲删除存量看护净值为负）；ratchet 基线 222 不动 |
| 验收点 E2E | ◐ 部分 | 验收点 1/3/6/7 已真壳验证（2026-10-30，见下矩阵）；2/4/5 留白 |
| 用户旅程 E2E | ○ 待验证 | 跨机旅程（验收点 5）以第二实例刷新读回验证，待真壳 |

## 验收点矩阵

验证方式：dev 真壳（真实 Electron main RPC＋真实 git worktree＋真实 gh 凭证），发起经 CDP 调 `runBackgroundWorktreeCreation`（composer 确认后的同一真实执行链，非按钮点击；按钮→该入口接线为原生既有代码）。

| # | 验收点 | 状态 | 证据或缺口 |
|---|---|---|---|
| 1 | GitHub Issue 开工认领读回 | ✅ 已验证 | 2026-10-30 对 #512 开工：真实 worktree（分支 `kanadead/issue-512-claim-verify`）创建成功，`gh issue view 512` 独立读回 assignees=[kanadead]；`linkedTaskSourceContext` 走省略现构路径 |
| 2 | CodeHub Issue 开工认领读回 | 留白 | 需真实 CodeHub 环境（本机 repo remote 非 CodeHub）；认领失败面已由验收点 3 覆盖 |
| 3 | 认领失败不阻断开工 | ✅ 已验证 | CodeHub viewer 失败场景：工作区照常创建（分支 `kanadead/codehub-fail-verify`），toast 原文「工作区已创建，但 Issue #1 … 责任人标记失败：Error invoking remote method 'codehub:viewer': Error: Repository remote is not CodeHub」 |
| 4 | 追加不覆盖 | ◐ 部分 | GitHub 侧 `gh issue edit --add-assignee` 只加不删已证＋单账号真壳 add 验证；双账号并集场景未造（需动他人 assignee 数据）；CodeHub `--assignee` 追加语义仓内无证据，待真实环境验证（spec「幂等与追加」） |
| 5 | 跨机可见 | 留白 | 需第二实例刷新读回；责任人列呈现为原生 AssigneesCell 既有能力（本次未改其代码） |
| 6 | 不自动摘除 | ✅ 已验证 | 删除验证 worktree 与分支后，#512 assignee 保持 [kanadead] |
| 7 | 负面边界 | ✅ 已验证 | 以 `type:'pr'` 意图对 PR #517 开工：assignees 保持空，零写入；#512 认领不受影响 |

验证产物（worktree/分支）已清理；#512 的 assignee 保留——开工者认领即特性语义。

## 实现边界（2026-10-30 首期交付）

- 认领挂在创建器真实创建结果处，与版本绑定同站点；Open（已有工作区再打开）不经过创建结果，天然不触发。
- 不预读 assignee：直接 add，平台侧去重；已有其他责任人时追加不移除。
- 全部异常（viewer 未登录、add 失败、repo 未注册）只 toast「工作区已创建，但 Issue #n 标题 责任人标记失败：<原因>」，不阻断激活/启动流，不重试不虚报。
- full 链镜像随休眠链同构交付，恢复使用即同语义，无需再实现。
