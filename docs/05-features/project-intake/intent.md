# intent — 纳入项目与项目信息记录（project-intake）

> **状态：已 gate；G3 对齐增量待本轮确认**（2026-09-29 用户拍板补登记并确认命名，同日 gate 遗留决定收口；2026-10-13 对齐跨 Orca 主机项目墙视图）。行为细节与验收点见 [spec.md](spec.md)；本轮高保真见 [g3-project-wall-prototype.html](g3-project-wall-prototype.html)；链状态在 [STATUS.md](STATUS.md)。
>
> **维护约定**：本篇管价值与范围（02 §3.1 骨架）；gate 结论改写正文，不追加聊天流水。

## 用户与问题

- **谁**：使用 Workbench 的 Builder；需要查看共享项目的同团队成员沿用同一套 Orca/BW 视图，不新增 Leader 角色。
- **场景**：装好 Workbench 后第一件事是把手上的项目装进来。Orca 原生仓库列表只有路径与仓名，没有业务身份——这个项目做什么、对标谁、想做成什么；版本周期（计划/验收/指标）没有挂载对象。
- **现有做法为什么不够**：手动 clone、脑子记路径，项目信息散落无法跨会话、跨成员一致读回；杀进程重开后没有可重新计算的项目事实源。跨 Orca 主机时还要逐台添加 Builder 主机、逐个辨认哪些项目属于 BW，项目墙无法承担团队查看入口。

## 价值与依据

- **核心收益**：接入一次、填一次名片（名称/对标/想做什么/目标方向），此后项目墙、总览、版本周期、知识库都认这个项目——接入是全工作台主路径的起点。跨主机时复用 Orca 原生 Projects 和 runtime 目录，项目墙只展示已有 .bw/project.toml 的 BW 项目。
- **依据**（可追溯）：03 主张现行主路径「项目墙 / 看板 / 建卡开工 / 人点完成」，用户旅程始于「接入项目并确认基础信息」，接入时回答做什么/对标/成功标准；architecture 用例表「打开或接入项目」；能力已实现且在用（实现落点见文末）。
- **假设（标明）**：尚未经多个真实 Builder 的使用反馈验证；价值效果待 v0.5 收尾读回，不当成已证实。

## 目标体验

侧栏顶部项目名进入**项目墙**：每项目一张卡（名称、简述、对标、目标方向；多仓项目聚合为一张卡，组内增删仓自动建组/收组）。「+ 接入项目」两步——①选本地仓或克隆远端（`owner/repo` 简写归一化为 GitHub 地址；远端在填表前经平台 API 预读已有名片回填，「没查成」不冒充「没接管过」）；②填项目名片。提交即完成一串：写 `.bw/project.toml` **并经 PR 落入被管项目仓、由其 builders 合入**（合入后其他成员接入同一项目时直接读到已有名片、只补空字段，不重复建名片重复起 PR；主检出不留脏文件）；设单仓工作树基址 `.bw/worktrees`、可选挂入项目分组、激活项目落到总览。点卡切项目；总览项目卡展示名片的对标/目标方向。

> 现状与目标的差距：名片保真合并、落点总览、knowledge-map 与环境条删除、名片经 PR 落仓（`bw/project` 固定树 + 待合入提示 + 更新代码 + 编辑名片补录）、远端预探测与同远端去重均已实施（PR #285）；真实远端端到端与真壳未验，边界见 [STATUS](STATUS.md)。

## G3 对齐增量（本轮待确认）

G3 是本特性的跨 Orca 主机扩展，不新建 Team 项目数据库，也不修改 Orca 原生 Projects 的全量语义：

- **两层集合**：Orca Projects 保留当前应用、本机与已配对 Builder 主机返回的全部项目/工作树；BW 项目墙是其子集，只展示项目路径上能读到 .bw/project.toml 的项目。
- **统一事实源**：.bw/project.toml 继续是 BW 项目名片，也是项目墙纳入标记。通过 Orca 原生入口添加的项目，如果已有名片就能进入墙；通过 BW「接入项目」添加的项目会同时进入 Orca Projects 和 BW 项目墙。
- **批量导入边界**：项目墙的「导入 Builder 主机」只批量复用 Orca runtime 主机配对能力（对话框提供模板下载，结构为「主机名: 配对地址」清单；Builder 只需提供自己主机的配对地址），不批量 clone 项目。导入完成后刷新远端仓库目录，按各项目的 .bw/project.toml 决定墙上项目。
- **激活关系**：点墙卡激活项目落到总览（默认本机主注册）；切换 Builder 主机的工作树在 Orca Projects 原生列表进行，BW 总览、计划、验收和知识库沿用所选主机上下文。
- **主机来源**：墙卡以主机标签标明本机或 Builder 主机名（沿用 Orca 配对时取的名字），同一项目跨多个 runtime 仍可辨认；工作树明细与主机级选择归 Orca Projects 原生列表，墙不重复展示。
- **重复显示**：墙卡按 Orca 项目/主机/worktree 的稳定身份聚合；删除并重新添加主机、或多个 runtime 返回同一项目时，墙上只出现一个项目卡。
- **状态与连接**：状态灯/健康设计不归 G3（项目墙深度优化另行承载，铁律二仍约束其后续设计——无数据不装绿）；G3 只引入主机连接事实（由 Orca runtime 推导），用于导入反馈与离线如实提示。
- **删除边界**：删除只对本机注册提供、绝不动仓库文件；不提供删除 Builder 主机注册或其项目的入口，主机去留随配对管理。
- **主旅程**：在真实 Workbench/Orca 壳内完成「项目墙 → 导入 Builder 主机 → 看到带 .bw 的 Builder 项目 → 在 Orca Projects 切远端工作树 → BW 屏读回」。高保真只展开这一条旅程，未展开的 BW 屏继续复用现有实现。

## 范围与边界

- **做**：项目接入（本地/克隆）、名片信息记录与读回展示、名片 toml 经 PR 落被管仓并由 builders 合入、远端克隆前名片预探测、项目墙聚合与切换、仓库分组；G3 的 Builder 主机批量导入、.bw/project.toml 墙上纳入、跨主机来源展示和远端项目激活。
- **不做（现行边界，可追溯）**：旧 Rust 项目约定完整旅程中除名片 PR 之外的部分（常驻 worktree 供 Issue 运作、三条运作自动化随接入写入等——后者归 F5 定时工作执行裁决）；知识库分类地图（`.bw/knowledge-map.toml`）能力已删除（2026-09-29 用户拍板：知识库未成熟，归独立特性重新决策）；「本机环境」探测条已删除（2026-09-29 用户拍板：不探产品不会调用的工具；将来随墙健康灯按 main 正本清单——claude/cursor-agent/gh/codehub-cli、三态、灰不装绿——重新决策）；无专门可写性探测（仅路径授权 + 存在性 + git 校验）；墙上版本/周目标等无数据源占位与健康状态呈现本轮维持现状，其移除与状态设计归项目墙深度优化（leader PR 与用户后续 PR，2026-10-13 批注拍板：本 PR 不做非 G3 的墙美化）；铁律二仍约束后续状态设计（无数据不装绿）。
- **相邻特性**：总览指标（项目区读名片与仓库数据）、版本计划/验收（在接入的项目上跑周期）、知识库（接入产出仅名片；地图能力已移出本特性）。

## 成功判据与已定决定

**判据**：Builder 无文档能完成接入 → 墙上看到自己项目名片 → 切进总览；杀进程重开后名片与墙读回一致（铁律一）。

**已定决定（gate 结论）**：
- 名片字段（对标/成功标准）维持**选填**：接入门槛低，字段完整性在 PR 评审里协商，「接入时问」以预填引导落实（2026-09-29）。
- 名片 toml **必须经 PR 落被管仓并由 builders 合入**，本轮实施（2026-09-29 确认必要旅程；否则后来者重复填名片、本地留脏文件）。main v0.4 已交付正本：`crates/bw/src/app/project.rs`（create_project——名片只写项目约定专属工作树、主检出不动，已有名片 adopt 只补空字段；edit_project_card——专属 worktree → 写名片 → commit → `push_and_open_mr` → Issue 转 InReview）；实现在 Orca 上重新决策（复用固定树管线与 gh/codehub-cli 执行链，不照搬 Rust）。
- knowledge-map 草稿能力从本特性**删除**（2026-09-29），归知识库独立特性。
- 存量旧仓已有 toml（main v0.4 起写入，字段 `opportunity`）**无需补录**；读取端兼容更早的 `north_star` 字段。
- 克隆远端中断的残留场景暂不处理，看实际用户反馈再定。

## 实现落点（现状取证）

`src/renderer/src/workbench/`：`ProjectWallPage` / `OnboardProjectPage` / `OnboardCharterStep` / `EditCharterPage`（名片补录）/ `run-project-onboard` / `charter-port` / `charter-pr-notice` + `use-charter-pr-status`（待合入 chip）/ `project-charter`（renderer fs 包装）/ `workbench-wall-projects`（聚合）/ `switch-active-project` / `wall-project-repo-actions`（组升级/连带删组）；`src/shared/workbench/project-charter.ts`（纯函数核心：解析/渲染/保真补空 `fillBlankCharterInToml`，兼容 north_star）与 `charter.ts`（RPC 契约）；`src/main/workbench/charter-runtime.ts` + `charter-remote-probe.ts` + `charter-pr-status.ts`（bw/project 树提交与 PR、克隆前预探测、状态查询）；`src/main/codehub/mr-creation.ts` + `repo-reads.ts`（CodeHub MR 与远端 raw 读，命令形态按 main 正本）。散落文档：architecture 用例表与 §3、06-module/桌面壳与关键信息维护。存量合规单测：project-charter（shared：解析/回写/保真补空/归一化）、workbench-wall-projects（组聚合；展示类用例已随 2026-09-30 环 4 盘点删除）。
