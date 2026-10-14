# STATUS — 纳入项目与项目信息记录

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-13）**：既有 intent/spec 基线保留；G3 跨主机项目墙对齐稿已补入同一特性，交互高保真已放在 [g3-project-wall-prototype.html](g3-project-wall-prototype.html)，按两轮人工批注修订（批注与修订对照见本轮 commit/PR），待人确认；**G3 生产实现已随本轮落码**（侧栏收窄过滤整体回退、项目墙 `.bw/project.toml` 判据与跨主机稳定身份归并、「导入 Builder 主机」批量配对壳、墙卡来源标签/工作树计数/删除边界/整墙刷新）；掉卡边缘与工作树计数口径已由用户拍板（见 spec 取舍已决 5 与 G3 行为规则）。非 G3 墙卡元素（版本/健康占位、状态灯设计）不由本特性承载，归项目墙深度优化（leader PR #349 与用户后续 PR，用户明示本 PR 先合入、不关注非 G3 美化）。既有名片 PR 化、远端预探测、去重、编辑名片入口仍以 PR #285 和原 STATUS 边界为准。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | intent.md 保留基线并补入 G3 对齐增量；待本轮高保真确认 |
| 2 spec | ◐ | spec.md 保留既有 gate，并补入 G3 唯一主用例、行为规则与验收点 P-08–P-12；待本轮确认 |
| 3 实现设计 | ◐ | architecture「打开或接入项目 / 查看项目概况」与 06-module/关键信息维护 有散落记录；G3 生产实现已落码：墙判据与跨主机归并为纯函数 `workbench-wall-projects`（只认当前配对主机目录内的注册行，远端身份 + ProjectGroup 归并，同主机重复注册去重）；判据读取 `use-wall-adoptions` + `charter-port.readRepoCharter`（本机/SSH 走 fs 桥，runtime 主机走新增 `workbench.charter.read` RPC，复用 charter owner 路由，不另造平行读取）；主机连接事实 `wall-host-facts`（runtime 状态推导，未知不装在线）；导入壳 `builder-hosts-import` + `ImportBuilderHostsDialog`（只调用原生 `runtimeEnvironments.verifyAndAddFromPairingCode`，同名已配对跳过=幂等）；原生侧栏收窄过滤（workbench-sidebar-repo-scope）已整体回退删除，Orca Projects 恢复全量 | 
| 4 TDD | ◐ | 合规存量：project-charter 7 例（shared，解析回写/保真补空含 [chat] 与尾换行保留/north_star 别名/无空可补不动/归一化）、codehub repo-reads 5 例（2026-10-10 随预读假 absent 修复回补：--jq JSON 编码解析、空/null 分支、裸 view 回退、raw 读参数序、commit-not-found 归 ref-missing）；2026-10-13 G3 轮：workbench-sidebar-repo-scope.test.ts 随回退删除（对冲额度），workbench-wall-projects 扩为 6 例（组聚合、跨主机身份归并、已删主机残留行剔除、同主机重复注册去重、工作树按 host-qualified 身份去重计数），builder-hosts-import 4 例（清单协议解析、模板占位地址如实报无效、坏结构拒绝、同名已配对幂等计划）——均为核心算法纯函数/数据协议两类；charter RPC 协议仍无单测（2026-09-30 用户冻结新增 vitest 边界内，`workbench.charter.read` 同 status 走真壳验证）；「坏文件不覆盖」守卫以验收点 P-02 为据 |
| 5 验收点E2E | 待建 | 点位已定（spec P-01–P-12，P-08–P-12 为 G3 跨主机行为：批量导入与模板/归并判据/连接与离线诚实/刷新/删除边界）；用例注册按 2026-09-29 用户拍板暂缓，稳定后专项回补 |
| 6 旅程E2E | 待建 | G3-01「导入 Builder 主机 → 墙上只见 .bw 项目 → Orca Projects 切远端工作树 → BW 屏读回」已定义、未注册；稳定后专项回补，不造用例凑数 |

**已知债**：
1. **名片 PR 全链真实远端未验**——实现已落（bw/project 固定树提交 + push + gh/codehub-cli 开 PR + 待合入提示 + 更新主目录 + 编辑名片补录），但 gh/codehub-cli 登录态、GHES、WSL 仓、配对宿主、CodeHub 实机均未端到端跑过；未验前不宣称团队共享已可用。本机真壳受环境限制（node-pty 重建失败）未拉起。克隆前名片预读的 CodeHub 读侧已于 2026-10-10 对两个内源 host 实机验证（修复 --jq 引号假 absent 后）；MR 创建侧同日以同一代码链（createCodeHubMr 打包实跑）在真实 CodeHub 仓验证可开 MR——应用内曾出现一次单次失败，错误信息未留存，排除法定位为瞬时故障（查重/创建命令现均实测通过）；应用内端到端仍未跑过。
2. **CodeHub 侧「已合入未更新」无检测、chip 无跳转**——status 只查开放 MR（codehub-cli mr list opened）；GitHub 有 merged 态可提示「更新主目录」，CodeHub 合入后要等主检出读到名片才消失提示缺口，且 MR 无 web 链接可推时 chip 只显示号码、无「查看」入口。
3. **CodeHub MR 目标分支兜底 master**——沿 main 隐含假设（origin/HEAD 符号引用缺失时），已加 getRepoDefaultBranchName 兜底；内源默认分支为 master 的假设需实机复核。
4. 墙卡版本/周目标等无数据源占位与健康/状态灯设计不归 G3（2026-10-13 批注拍板：本 PR 不做非 G3 的墙美化），维持现状、归项目墙深度优化——leader PR #349 与用户后续 PR；铁律二仍约束后续状态设计（无数据不装绿）。「本机环境」探测条已删除，真实探测清单（claude/cursor-agent/gh/codehub-cli，三态，不探不会起的东西）随墙健康灯重新决策——main 正本证据：环境条 6 格与三态语义（`crates/app-shell/src/screens/wall/mod.rs` env_bar、`bridge/vm_build.rs probe_env`）、假红修复 07e076ff4（Windows PATHEXT）、假绿修复 e23e3e4ce（探的名字必须等于真起的进程）。
5. 克隆中断残留暂不处理（用户拍板，看实际反馈）。
6. 远端预探测对 GHES 主机走 githubHostExecOptions 的 host 限定，未实测。
