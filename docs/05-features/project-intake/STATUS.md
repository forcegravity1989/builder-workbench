# STATUS — 纳入项目与项目信息记录

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-09-30）**：intent 已 gate；spec 已确认（PR 简化形态、CodeHub 经 codehub-cli 开 MR、同远端去重做、原型豁免、单批交付）；名片 PR 化、远端预探测、去重、编辑名片入口已实现（PR #285），**真壳与真实远端端到端未验**。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ● | [intent.md](intent.md) 已 gate（2026-09-29 遗留决定收口）；带入来源 = 2026-09-29 用户拍板补登记 |
| 2 spec | ● | [spec.md](spec.md) 已确认（2026-09-30 用户 gate；原型豁免——在用补链特性以真壳与 PR 截图为对照） |
| 3 实现设计 | ◐ | architecture「打开或接入项目 / 查看项目概况」有散落记录；工程实现全部复用既有件（ensureNamedWorktree 固定树管线、workspace-resolver、createGitHubPullRequest、codehub mutations、hostedReview.forBranch、git.fastForward、normalizeGitRemoteUrl），无特性级 design 文档 |
| 4 TDD | ◐ | 合规存量：project-charter 7 例（shared，解析回写/保真补空含 [chat] 与尾换行保留/north_star 别名/无空可补不动/归一化）、workbench-wall-projects；charter RPC 协议与 CodeHub 原语**无单测**（2026-09-30 用户冻结新增 vitest，待清理后回补）；「坏文件不覆盖」守卫以验收点 P-02 为据 |
| 5 验收点E2E | 待建 | 点位已定（spec P-01–P-07）；用例注册按 2026-09-29 用户拍板暂缓，稳定后专项回补 |
| 6 旅程E2E | 待建 | 候选主旅程已定义：「接入项目 → 墙上见名片 → 切换进总览 → 重启读回一致」；同上暂缓 |

**已知债**：
1. **名片 PR 全链真实远端未验**——实现已落（bw/project 固定树提交 + push + gh/codehub-cli 开 PR + 待合入提示 + 更新主目录 + 编辑名片补录），但 gh/codehub-cli 登录态、GHES、WSL 仓、配对宿主、CodeHub 实机均未端到端跑过；未验前不宣称团队共享已可用。本机真壳受环境限制（node-pty 重建失败）未拉起。
2. **CodeHub 侧「已合入未更新」无检测、chip 无跳转**——status 只查开放 MR（codehub-cli mr list opened）；GitHub 有 merged 态可提示「更新主目录」，CodeHub 合入后要等主检出读到名片才消失提示缺口，且 MR 无 web 链接可推时 chip 只显示号码、无「查看」入口。
3. **CodeHub MR 目标分支兜底 master**——沿 main 隐含假设（origin/HEAD 符号引用缺失时），已加 getRepoDefaultBranchName 兜底；内源默认分支为 master 的假设需实机复核。
4. 墙卡版本/周目标/健康为占位 Unknown（用户拍板暂不细设计）；「本机环境」探测条已删除，真实探测清单（claude/cursor-agent/gh/codehub-cli，三态，不探不会起的东西）随墙健康灯重新决策——main 正本证据：环境条 6 格与三态语义（`crates/app-shell/src/screens/wall/mod.rs` env_bar、`bridge/vm_build.rs probe_env`）、假红修复 07e076ff4（Windows PATHEXT）、假绿修复 e23e3e4ce（探的名字必须等于真起的进程）。
5. 克隆中断残留暂不处理（用户拍板，看实际反馈）。
6. 远端预探测对 GHES 主机走 githubHostExecOptions 的 host 限定，未实测。
