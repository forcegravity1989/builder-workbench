# spec · 开工认领（Issue Start Claim）

> **30 秒导读**：定义「Issue 开工创建工作区成功 → 自动把当前用户 add 为该 Issue 责任人」的完整行为、异常与验收。读者：实现者与验收者；行为变化时更新。意图见 [intent.md](intent.md)；链状态与证据见 [STATUS.md](STATUS.md)（随实现建）。原型：本特性不新增界面（复用原生责任人列），按 [01 §4.2](../../01-principles/01-document-organization.md) 非 UI 变更豁免以行为契约代替可点原型，体验对照见 [prototype.html](prototype.html)（静态示意，非交付界面）。

- 状态：**已认可**（2026-10-30 人拍板：方向「开工把当前开 worktree 的用户标记为责任人」＋追加语义＋CodeHub 一起交付；本篇行为随实现交付评审）

## 范围与入口

**入口**：一切「为 Issue 创建新工作区」的开工——任务屏 Issue 行 Start、计划板 Issue 行开工、版本工作区目标行开工。它们都汇入同一个原生创建器，认领挂在创建结果处，与入口无关、与是否携带 BW 版本上下文（`workbenchCreation`）无关。

**对象**：GitHub Issue 与 CodeHub Issue（BW 开工面已就绪的两个 provider）。PR 开工、GitLab/Linear/Jira 不认领。

**呈现**：零新增界面。任务屏原生责任人列（`AssigneesCell`）与 GitHub/CodeHub 平台原生视图即全部呈现。

## 完整用户旅程

1. A 在任务屏对一个 open Issue 点 **Start**（或从计划板/目标行开工），进入原生创建器，确认后创建工作区。
2. 创建成功瞬间（真实创建结果处，与版本绑定写入同站点），BW 读取该 repo 所属宿主的平台登录账号，把 A add 为该 Issue 责任人；A 无额外操作。
3. A 的工作区照常激活、终端照常启动——认领是 fire-and-forget 伴飞动作，不插入任何等待。
4. B（另一实例）刷新任务屏：该 Issue 行责任人列显示 A。B 不再误判「无人做」，转做别的任务或与 A 对齐。
5. GitHub/CodeHub 网页上同样可见认领；Issue 关闭、工作区删除后责任人保持（摘除是人的动作）。

## 行为规则与异常

**触发判定**（认领准入）：创建器返回真实创建结果 && 创建意图 `linkedWorkItem.type === 'issue'` && provider ∈ {github, codehub}。三条缺一即静默跳过（PR、无关联、其他 provider 均不认领）。Open（已有工作区再打开）不经过创建结果，天然不触发。

**认领者身份**：工作区所属 repo 的宿主登录账号——本地项目读本机，远程项目读 owning runtime（与创建动作同一执行位置，正是「当前开 worktree 的用户」）：
- GitHub：`lookupGitHubViewerForSource`（`github.repoViewer`，自带 owning-runtime 路由）；
- CodeHub：`codehubApi.viewer`（`.username`，`use-task-scope-viewers.ts` 同链）。

**写动作**（复用原生 mutation 面，不新增 RPC）：
- GitHub：`runIssueUpdate({ …, updates: { addAssignees: [login] } })`（`github.updateIssue` / slug 变体，自带远程路由）；
- CodeHub：`codehubApi.assignIssue`（service `assignCodeHubIssue` → `codehub issue update --assignee`）。

**幂等与追加**：不预读 assignee 列表、不判断是否已含自己——直接 add，平台侧天然去重；已有其他责任人时**追加不移除**（指派语义保留，开工事实叠加）。追加语义的证据边界：GitHub 侧 `gh issue edit --add-assignee` 只加不删已证（`src/main/github/issue-update.ts` 映射）；CodeHub 侧 `codehub issue update --assignee` 的追加/整表替换语义**仓内无证据，待真实 CodeHub 环境验证**——若实测为替换语义，须先改为显式并集写入再放行 CodeHub 认领（与验收点 2/4 留白一并安排）。

**异常**（全部不阻断开工）：
- viewer 读取失败 / 未登录：跳过认领，toast 如实提示「工作区已创建，但 Issue #<n> <标题> 责任人标记失败：<原因>」；
- add 失败（权限、网络、平台错误）：同上，不重试不虚报（工作区已保留，责任人可人工补）；
- 创建本身失败：无认领（未到达创建结果处）。

**不自动摘除**：Issue 关闭、工作区删除、验收完成均不 remove assignee——完成由人确认（铁律），摘除同样是人的动作。

**实现锚点**（BW 自有模块 + 原生薄挂载，与版本绑定同模式）：
- quick/background 链：`src/renderer/src/lib/worktree-creation-flow-execute.ts` 真实创建结果处（`writeWorkbenchCreationBinding` 同站点）一行调用；
- full 链：`src/renderer/src/hooks/composer-state/full-creation-execution.ts` 同构镜像（当前休眠，恢复即同语义）；
- 认领逻辑住 BW 模块 `src/renderer/src/workbench/issue-start-claim.ts`（决策 + 执行 + 提示），原生文件不引新词条。

## 验收与衡量

| # | 验收点 | 可观察结果 |
|---|---|---|
| 1 | GitHub Issue 开工 | 创建成功后 `gh issue view <n>` 读回 assignee 含当前用户；任务屏责任人列显示 |
| 2 | CodeHub Issue 开工 | `codehub viewTask` 读回 assignees 含当前用户 |
| 3 | 认领失败不阻断 | 平台凭证失效时开工：工作区创建、激活、终端全部正常，toast 提示认领失败及原因 |
| 4 | 追加不覆盖 | 已指派 B 的 Issue 由 A 开工：assignee = A + B，B 不被移除（CodeHub 侧待真实环境验证，见「幂等与追加」） |
| 5 | 跨机可见 | 第二实例（连同一远程项目）刷新任务屏，Issue 行责任人列显示开工者 |
| 6 | 不自动摘除 | Issue 关闭 / 删树后 assignee 保持不变 |
| 7 | 负面边界 | PR/MR 开工、GitLab/Linear/Jira 关联开工：不发生任何 assignee 写入 |

**E2E**：真壳对真实 Issue 开工，平台侧独立读回 assignee（验收点 1/2）；跨机可见（验收点 5）以双实例真壳或第二实例刷新读回验证。**单测**：准入判定是两条件谓词，不立单测（[02 环 4](../../01-principles/02-working-backwards.md) 数量控制与 ratchet——为 2 行谓词对冲删除有价值的存量看护净值为负）；负面边界由验收点 7 与真壳 Review 守。

## 取舍与待决问题

**已放弃的选项**：
- 共享开工台账（`.bw/` 协作文件）：可携带版本/目标上下文，但同步非实时、并发写需事务化、SSH 读取要扩窄执行器——留作后续增强（版本工作区内「目标下谁在做哪个 Issue」的更细呈现）；
- worktree 命名约定解析：脆弱、无 owner 信息；
- 改 Orca worktree 元数据存储为共享：动执行核，无必要。

**已决问题**（2026-10-30 人拍板）：
1. 已有其他责任人时仍追加自己——开工可见性最大化，平台 add 天然去重，不移除他人；
2. CodeHub 与 GitHub 首期一起交付——viewer/assignIssue 能力均已就绪，两 provider 开工面对称。
