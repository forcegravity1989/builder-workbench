# STATUS — 纳入项目与项目信息记录

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-13）**：既有 intent/spec 基线保留；G3 跨主机项目墙对齐稿已补入同一特性，交互高保真已放在 [g3-project-wall-prototype.html](g3-project-wall-prototype.html)，并已按 5 条人工批注修订（批注与修订对照见本轮 commit/PR），待人确认；生产实现未修改。既有名片 PR 化、远端预探测、去重、编辑名片入口仍以 PR #285 和原 STATUS 边界为准。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | intent.md 保留基线并补入 G3 对齐增量；待本轮高保真确认 |
| 2 spec | ◐ | spec.md 保留既有 gate，并补入 G3 唯一主用例、行为规则与验收点 P-08–P-12；待本轮确认 |
| 3 实现设计 | ◐ | architecture「打开或接入项目 / 查看项目概况」与 06-module/关键信息维护 有散落记录；G3 继续复用 Orca runtime、仓库目录、worktree 激活和现有 BW 屏，交互边界见本轮高保真；原生侧栏收窄过滤（workbench-sidebar-repo-scope）已定位为 G3 实现期回退对象；生产实现尚未修改 |
| 4 TDD | ◐ | 合规存量：project-charter 7 例（shared，解析回写/保真补空含 [chat] 与尾换行保留/north_star 别名/无空可补不动/归一化）、workbench-wall-projects（组聚合；展示类用例已随 2026-09-30 环 4 盘点删除）、codehub repo-reads 5 例（2026-10-10 随预读假 absent 修复回补：--jq JSON 编码解析、空/null 分支、裸 view 回退、raw 读参数序、commit-not-found 归 ref-missing）；charter RPC 协议**无单测**（2026-09-30 用户冻结新增 vitest、总量 ratchet 门禁已立，待清理后回补）；「坏文件不覆盖」守卫以验收点 P-02 为据 |
| 5 验收点E2E | 待建 | 点位已定（spec P-01–P-12，P-08–P-12 为 G3 跨主机行为：批量导入/归并判据/健康连接诚实/刷新/删除边界）；用例注册按 2026-09-29 用户拍板暂缓，稳定后专项回补 |
| 6 旅程E2E | 待建 | 本轮先审唯一主旅程 G3-01：「导入 Builder 主机 → 墙上只见 .bw 项目 → 激活远端 worktree → 总览读回」；真壳验证待实现后再建 |

**已知债**：
1. **名片 PR 全链真实远端未验**——实现已落（bw/project 固定树提交 + push + gh/codehub-cli 开 PR + 待合入提示 + 更新主目录 + 编辑名片补录），但 gh/codehub-cli 登录态、GHES、WSL 仓、配对宿主、CodeHub 实机均未端到端跑过；未验前不宣称团队共享已可用。本机真壳受环境限制（node-pty 重建失败）未拉起。克隆前名片预读的 CodeHub 读侧已于 2026-10-10 对两个内源 host 实机验证（修复 --jq 引号假 absent 后）；MR 创建侧同日以同一代码链（createCodeHubMr 打包实跑）在真实 CodeHub 仓验证可开 MR——应用内曾出现一次单次失败，错误信息未留存，排除法定位为瞬时故障（查重/创建命令现均实测通过）；应用内端到端仍未跑过。
2. **CodeHub 侧「已合入未更新」无检测、chip 无跳转**——status 只查开放 MR（codehub-cli mr list opened）；GitHub 有 merged 态可提示「更新主目录」，CodeHub 合入后要等主检出读到名片才消失提示缺口，且 MR 无 web 链接可推时 chip 只显示号码、无「查看」入口。
3. **CodeHub MR 目标分支兜底 master**——沿 main 隐含假设（origin/HEAD 符号引用缺失时），已加 getRepoDefaultBranchName 兜底；内源默认分支为 master 的假设需实机复核。
4. 墙卡版本/周目标等无数据源占位已拍板随 G3 卡片重设计移除（2026-10-13 批注），实现未落；健康保持「无数据」不装绿，随版本周期数据接入再设计。「本机环境」探测条已删除，真实探测清单（claude/cursor-agent/gh/codehub-cli，三态，不探不会起的东西）随墙健康灯重新决策——main 正本证据：环境条 6 格与三态语义（`crates/app-shell/src/screens/wall/mod.rs` env_bar、`bridge/vm_build.rs probe_env`）、假红修复 07e076ff4（Windows PATHEXT）、假绿修复 e23e3e4ce（探的名字必须等于真起的进程）。
5. 克隆中断残留暂不处理（用户拍板，看实际反馈）。
6. 远端预探测对 GHES 主机走 githubHostExecOptions 的 host 限定，未实测。
