# 版本工作区 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为主干 main 的 Electron/Orca 叠层。[高保真修订 8](version-workspace-prototype.html?rev=8) 是形态依据，不是持久化或真实宿主执行证据。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 已确认 | 2026-10-20 评审定稿（含版本级清理与跨宿主汇总决定） |
| spec | 已确认 | 同上；高保真修订 8 为形态依据 |
| 实现设计 | 已定稿，P1/P2 已实施 | P1a 绑定契约、P1b 目录合并、P2 版本准备（两棵流程树）已按 design 接线要求落地；P3–P7 待实施，生产验证缺口见下 |
| 核心算法/数据协议 | ◐部分 | P1 用例已登记：叠层 7 例（绑定契约校验/读回规范化 2、目录合并/悬空治理/缓存分隔 3、owner 与实例校验+读回确认 2）+ Orca 核心侧扩展 3 例（merge 投影、worktree.set 白名单、能力门控）；对冲删 7 例（use-version-minutes 装配 6、overview-zone-series 展示形态 1）。P2 新增 2 例（宿主端去重/预检重发现、失败保留与创建结果核对），对冲删 2 例 zone-series 展示形态（均经人确认方案 A）；ratchet 226 恰在基线。P4 任务关联、P5 自动化键用例随实施登记 |
| 验收点 E2E | 待实施 | 协议用例随实施登记；J 系列判据待真壳 |
| 用户旅程 E2E | 待验证 | J1–J9 真壳旅程待人验证 |

## P1 实施证据与边界（2026-10-21）

P1a/P1b 已实施并通过单测与 typecheck：绑定契约 `src/shared/workbench/version-binding.ts`（schema 1，workflow 与 goalId/taskSource 一致性 refine，读回规范化脏数据一律未绑定）；原生挂载：`WorktreeMeta.workbenchVersionBinding`（undefined 保留/null 清除）、`worktree.set` 白名单、`mergeWorktree` 投影规范化、runtime capability `workbench.version-binding.v1`（无能力对端不下发、双方向门控）；BW 薄 helper `workbench.versionBinding.read/set`（原生身份定位、owner 验证、identity 选择器写入、读回确认才返回，不接受客户端路径）；目录合并 `src/shared/workbench/version-catalog.ts` + 装载器（已提交材料 ∪ 存活绑定，去重保留材料来源，已清理版本条目保留、状态 retired 收起回看，绑定从登记现算故删树无悬空，草稿与目标从已保存计划派生、缓存按 owner/项目/仓库/版本/修订分隔）。

单测级读回证明：绑定经真实持久化链 round-trip（写合并→序列化压缩→载入补默认→投影）后一致；权限撤销/登记消失时 resolver 拒绝且零写入；写入被丢弃时读回不一致报未确认、不虚报成功。**未验证**：真实 Electron 重启、共享宿主配对读写（共享端读 owner 绑定、不在访问者机建树的真实链路）、权限撤销真机行为、v0.7/v0.8 双版本真壳导航——归 J6/J9 与真壳验证，由人在专门会话执行；P1 未接任何 UI 消费方（侧栏版本树为 P3）。

## P2 实施证据与边界（2026-10-21）

新建版本准备已实施并通过单测与 typecheck：BW 薄服务 `workbench.versionWorkspace.prepare`（`src/main/workbench/version-workspace-prepare.ts`）在归属 runtime 上编排——宿主端预检（登记清单+Git detected 扫描+分支 ref 核对，不只信 renderer 列表）→ 原生 `dedupeWorktreeCreate`（确定性 clientMutationId，双击/多窗口/共享端 in-flight 收敛）→ 原生创建（`bw/<version>/plan|acceptance`，基线沿项目 worktree base 配置）→ 创建结果核对（uniquify 分支不绑定不标成功，误建树沿原生删除链默认口径 best-effort 清理、不附豁免）→ instanceId 围栏写绑定 → 空计划 create-only 初始化（同一材料事务核心，已有材料不覆盖；SSH 宿主经 relay `initializeEmptyPlan` 窄操作）。步骤链非原子：失败保留已成功结果、逐步回报，重试即重入按真实登记补齐。分支命名与 J2 判据定稿见 design「P2 落地」节。不启动 agent、不激活视图、不启用自动化、不 commit/push 材料。

协议单测证明（fake runtime 忠实映射原生 dedupe/创建/删除语义）：并发双击恰每用途一次创建、两调用方同树同绑定、材料只初始化一次；重入全 existing 零创建不覆盖；验收步失败保留计划步全链、重试补齐恰两棵；分支不符零绑定；外部占用与非法版本名如实拒绝。**未验证**：真实 Electron 创建/删除、真实 Git 分支占用与 setup 行为、双窗口并发、共享宿主创建（J2 真壳归人）；P2 无 UI 入口（「＋ 新建版本」按钮与进屏导航为 P3），prepare 暂无生产调用方。推前检视处置：并发空计划初始化的 CAS 竞态已修（后到者 revision-conflict 幂等收敛为 existing，不透出误导冲突），但该修复与清理失败、winner-adoption 分支尚无直接单测（协议测试 fake 为原子 create-only），随 P3 接入口或 J2 真壳按环 4 补看护；「创建成功但绑定未写入」窗口不在自动补齐范围（重入按占用如实拒绝），design P2 节已写明边界。提醒项处置：instanceId 已在创建链收紧为事实必填（缺实例身份报错不写）；numericTarget 覆盖留白待 P6 总览接线时按环 4 复审。

## 定稿设计的证据边界

[高保真修订 8](version-workspace-prototype.html?rev=8) 与 [旅程报告](version-workspace-journey.html) 于 2026-10-20 评审定稿：多版本并行、版本平铺回看、逻辑目标目录、目标工作树按需创建、原生创建器与工作区复用、不新增冻结操作、版本下方统一保留当前项目与私人项目的原生工作区入口；版本收尾为版本级清理：版本行删除图标＋与 Orca 同口径确认对话框，复用原生删除链与预检，默认只删本机 owned 树，材料与版本目录保留。新建版本准备计划/验收两树，侧栏入口合并流程树；原型按整屏标注计划/验收复用，目标仅筛选同一任务屏。初始 v0.7 在制、v0.6 演示已归档回看；新增版本由用户创建。

本轮修改设计资料与原型，未改 Electron 生产代码、真实工作树、自动化或会话记录。项目总览及其他既有屏幕仅标复用位置。所有新建、父树选择、清理与会话均为内存演示，刷新清空。图标操作与业界依据见 spec，不把参考当实现证据。

修订 7 的浏览器检查及提交前门禁结果留在 PR 验证记录。未验证 Electron 真壳、共享宿主、实际工作树创建/删除/跨宿主确认单、provider 写回、原生会话历史和旧共享树迁移；前版浏览器结果不能证明本版生产接线。
