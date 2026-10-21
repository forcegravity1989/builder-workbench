# 版本工作区 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为主干 main 的 Electron/Orca 叠层。[高保真修订 8](version-workspace-prototype.html?rev=8) 是形态依据，不是持久化或真实宿主执行证据。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 已确认 | 2026-10-20 评审定稿（含版本级清理与跨宿主汇总决定） |
| spec | 已确认 | 同上；高保真修订 8 为形态依据 |
| 实现设计 | 已定稿，P1/P2/P4/P3a 已实施 | P1a 绑定契约、P1b 目录合并、P2 版本准备、P4 任务范围与开工链、P3a 侧栏版本树与主侧版本化已按 design 接线要求落地；P3b/P5–P7 待实施，生产验证缺口见下 |
| 核心算法/数据协议 | ◐部分 | P1 用例已登记：叠层 7 例（绑定契约校验/读回规范化 2、目录合并/悬空治理/缓存分隔 3、owner 与实例校验+读回确认 2）+ Orca 核心侧扩展 3 例（merge 投影、worktree.set 白名单、能力门控）；对冲删 7 例（use-version-minutes 装配 6、overview-zone-series 展示形态 1）。P2 新增 2 例（宿主端去重/预检重发现、失败保留与创建结果核对），对冲删 2 例 zone-series 展示形态。P4 新增 4 例（同号不同来源/两版不串开、多候选与排除、目标/流程/父级建议、创建上下文解析），对冲删 4 例 metrics-port 路由装配矩阵；P3a 新增 1 例（绑定树跨版/用途围栏），对冲删 1 例 workbench-nav 槽位映射装配（均经连夜工作包预授权，负面清单口径，明细在 commit/PR）。ratchet 226 恰在基线。P5 自动化键用例随实施登记 |
| 验收点 E2E | 待实施 | 协议用例随实施登记；J 系列判据待真壳 |
| 用户旅程 E2E | 待验证 | J1–J9 真壳旅程待人验证 |

## P1 实施证据与边界（2026-10-21）

P1a/P1b 已实施并通过单测与 typecheck：绑定契约 `src/shared/workbench/version-binding.ts`（schema 1，workflow 与 goalId/taskSource 一致性 refine，读回规范化脏数据一律未绑定）；原生挂载：`WorktreeMeta.workbenchVersionBinding`（undefined 保留/null 清除）、`worktree.set` 白名单、`mergeWorktree` 投影规范化、runtime capability `workbench.version-binding.v1`（无能力对端不下发、双方向门控）；BW 薄 helper `workbench.versionBinding.read/set`（原生身份定位、owner 验证、identity 选择器写入、读回确认才返回，不接受客户端路径）；目录合并 `src/shared/workbench/version-catalog.ts` + 装载器（已提交材料 ∪ 存活绑定，去重保留材料来源，已清理版本条目保留、状态 retired 收起回看，绑定从登记现算故删树无悬空，草稿与目标从已保存计划派生、缓存按 owner/项目/仓库/版本/修订分隔）。

单测级读回证明：绑定经真实持久化链 round-trip（写合并→序列化压缩→载入补默认→投影）后一致；权限撤销/登记消失时 resolver 拒绝且零写入；写入被丢弃时读回不一致报未确认、不虚报成功。**未验证**：真实 Electron 重启、共享宿主配对读写（共享端读 owner 绑定、不在访问者机建树的真实链路）、权限撤销真机行为、v0.7/v0.8 双版本真壳导航——归 J6/J9 与真壳验证，由人在专门会话执行；P1 未接任何 UI 消费方（侧栏版本树为 P3）。

## P2 实施证据与边界（2026-10-21）

新建版本准备已实施并通过单测与 typecheck：BW 薄服务 `workbench.versionWorkspace.prepare`（`src/main/workbench/version-workspace-prepare.ts`）在归属 runtime 上编排——宿主端预检（登记清单+Git detected 扫描+分支 ref 核对，不只信 renderer 列表）→ 原生 `dedupeWorktreeCreate`（确定性 clientMutationId，双击/多窗口/共享端 in-flight 收敛）→ 原生创建（`bw/<version>/plan|acceptance`，基线沿项目 worktree base 配置）→ 创建结果核对（uniquify 分支不绑定不标成功，误建树沿原生删除链默认口径 best-effort 清理、不附豁免）→ instanceId 围栏写绑定 → 空计划 create-only 初始化（同一材料事务核心，已有材料不覆盖；SSH 宿主经 relay `initializeEmptyPlan` 窄操作）。步骤链非原子：失败保留已成功结果、逐步回报，重试即重入按真实登记补齐。分支命名与 J2 判据定稿见 design「P2 落地」节。不启动 agent、不激活视图、不启用自动化、不 commit/push 材料。

协议单测证明（fake runtime 忠实映射原生 dedupe/创建/删除语义）：并发双击恰每用途一次创建、两调用方同树同绑定、材料只初始化一次；重入全 existing 零创建不覆盖；验收步失败保留计划步全链、重试补齐恰两棵；分支不符零绑定；外部占用与非法版本名如实拒绝。**未验证**：真实 Electron 创建/删除、真实 Git 分支占用与 setup 行为、双窗口并发、共享宿主创建（J2 真壳归人）；P2 无 UI 入口（「＋ 新建版本」按钮与进屏导航为 P3），prepare 暂无生产调用方。推前检视处置：并发空计划初始化的 CAS 竞态已修（后到者 revision-conflict 幂等收敛为 existing，不透出误导冲突），但该修复与清理失败、winner-adoption 分支尚无直接单测（协议测试 fake 为原子 create-only），随 P3 接入口或 J2 真壳按环 4 补看护；「创建成功但绑定未写入」窗口不在自动补齐范围（重入按占用如实拒绝），design P2 节已写明边界。提醒项处置：instanceId 已在创建链收紧为事实必填（缺实例身份报错不写）；numericTarget 覆盖留白待 P6 总览接线时按环 4 复审。

## P4 实施证据与边界（2026-10-21 连夜工作包）

任务范围与目标/Issue 开工已实施并通过单测与 typecheck：**任务屏 BW 范围**——`TaskPageData.workbenchTaskScope`（shared/workbench/task-scope.ts）可选携带版本+目标+计划材料完整任务引用集；范围阶段（use-task-page-workbench-scope）经原生 provider 逐条读取（GitHub 单条查询/CodeHub viewTask，限并发 6）、原生排序、按原生页大小物化本地分页；缺数据任务保留位置/数量/原因（无法读取/另一来源未展开/未接入 provider 分别如实标注），读取失败如实缺席；范围不进搜索 query 或 provider 缓存键，有范围时跳过无范围 landing/quiet 刷新、CodeHub 全量拉取、resume 缓存与位置写入、查询持久化与来源自动切换，详情往返携带范围。**统一 Start/Open 解析器**——shared/version-workspace-match.ts 纯函数核：Issue 树按绑定 (version, workflow=issue, taskSource)＋原生 linked 编号双重证明；仅 BW 范围路径替换「首个未归档树」语义（唯一→直开、多候选→选择器、绝不取第一棵），PR 行与无范围路径逐字不变；列表行、CodeHub 行、详情弹窗三处同口径。**目标开工**——openGoalStartComposer（goal-start-action.ts，事件驱动供侧栏菜单接线；初版 hook 包装经评审无消费方已删）复用同一原生创建器：名称建议 `<version>-<G序号>`、业务上下文进原生备注字段（可见可改、随树存为工作区备注），不伪造目标 Issue、不做隐藏提示注入；唯一同项目同宿主目标树在原生父级选择器预选（可改可取消，repo 切换即清除旧建议）。**创建结果绑定**——提交时按创建器最终仓库+最终任务来源把 workbenchCreation 上下文解析为绑定（改仓库即失效），quick/background 链随 WorktreeCreationRequest 序列化字段进后台创建（Retry 原样重放）、full 链镜像；写入发生在真实创建结果处（早于取消/激活分支），instanceId 必填围栏、读回确认、失败保留树＋「重试写绑定」（不重复建树）、取消（未创建）零绑定。

协议单测（环 4 正清单）：同号不同来源与同 Issue 两版各按绑定证明命中（无绑定旧树不猜归属）；跨宿主多候选全部返回且稳定排序、归档/脏绑定不入候选；目标/流程树匹配、已清理版本空集如实、父级建议仅唯一时给出；创建上下文 goal/issue 各得其形、改仓库/缺证明不绑定、重试幂等；绑定树跨版读写与用途混用一律拒绝（main 侧，J1 前置）。对冲删除经连夜工作包预授权（负面清单口径）：metrics-port 路由 it.each 4 例（与 version-material-port 路由矩阵重复看护同一共享实现）。**未验证（如实留白，归 J3/J4 真壳）**：真实 provider 读取的范围列表（分页/搜索/详情往返）、真实创建器全流程（父级预选可见性、备注预填、绑定写入与重试）、跨宿主实例的选择器与激活、CodeHub 范围路径、混合 provider 范围的「未展开」呈现（本仓自身为 GitHub，CodeHub 环境未验）。已知边界（含推前检视处置后余项）：范围视图隐藏 Issues/PRs 页签、预设 chips 与 PR 筛选（服务端查询机制不适用），搜索输入=物化全集上的客户端过滤（先过滤再分页，跨页命中不产假阴性），全部 resume 持久化写点已门控；范围引用装载前去重（防重复行/计数虚增），行序=引用序确定性输出（GitHub 再按原生惯例排序）；绑定写入的「重试写绑定」为本会话 toast 动作，错过后的常驻补绑定入口留 P3b；telemetrySource 沿 'sidebar'（原生词汇表封闭，不扩 Orca union）；CodeHub 范围视图 MR 页签下列头化妆性不匹配（引用通常为 Issue，登记 J4 观察）；冷挂载 hydration 竞态窗口极窄（taskResumeApplied 门控后装载，登记）；任务来源严格相等是解析器承重假设（多注册行同项目边缘如实呈现 Start，归 J3/J4 真壳观察）；relay binding 线上格式无用例级看护（归 J6 真壳）。

## P3a 实施证据与边界（2026-10-21 连夜工作包）

侧栏版本树与版本化定位已实施并通过单测与 typecheck：**侧栏**——高保真修订 8 结构（项目墙入口＋项目总览/任务/自动化/知识库＋分隔＋版本区）；版本平铺、retired 默认收起可展开回看、版本感知排序（compareMaterialVersions，P2 延后项①收口）；流程行=业务入口＋本树入口合一（点名称进屏、箭头展开原生 WorktreeCardAgents、有树时「···」沿原生 WorktreeContextMenu）；目标目录行点击=同一任务屏目标筛选（P4 范围），「···」接 P4 目标开工/查看任务/打开工作区（唯一→直开、多候选→选择器、无→如实提示转开工）；版本行删除图标接清理占位对话框（如实说明未接入、指引原生单树删除——确认单与原生删除链执行留后续交付）；「＋新建版本」轻表单（单一必要输入、重名/非法名就地提示保留输入）接归属宿主 prepare（capability `workbench.version-workspace.v1` 门控），部分成功保留＋逐步回报＋「重试补齐」=重入；已存在版本可经「准备流程工作区」补绑定升级（spec「进入需要编辑的旧版时再准备」）。**目录装载**——多计划树入口（各版绑定树按自身 owner 路由＋旧固定树），草稿读取失败进 problem 通道（P1 延后项收口），retired 版本目标从已提交计划派生（readPlan 固定来源，只读回看不要求树）；collect 的 projectId 过滤前提收口。**provider/定位**——绑定树唯一→原生激活链（不进「进屏即 ensure 树」路径）；多实例如实报错引导侧栏选择；无绑定树仅在旧固定树已存在时走旧 artifacts 路径（旧上下文显式保留，不强迫一次迁完），两者皆无如实拒绝不悄悄建树；无浏览版本时原 ensure 语义逐字不变；旧固定树的侧栏选版在每次进屏时按 树×版本 同步一次原生选版偏好（重进屏会重新应用侧栏版本——侧栏是版本决定方；屏内下拉的临时改选在下次进屏被侧栏版本覆盖，P3b 移除屏内选版后该重叠消失），绑定树不写选版（绑定即单一正本）；流程识别绑定优先（cycleWorkflowForWorktree），板面挂载无需改 AppWorkspaceShell。**main 侧版本化**——材料授权按绑定解析：绑定树期望分支 bw/<version>/<workflow>、跨版读写拒绝（cross-version）、用途不混、list 只呈现绑定版本；服务层+执行器双围栏；common-dir/写前再授权/事务核保留；选版 RPC 绑定树恒回绑定版本、select(他版) 拒绝；SSH 窄执行器命令增可选 binding 字段（无绑定树不带字段，旧对端行为不变）。**自动化护栏（P5 前防回归）**——绑定树跳过旧身份 automation ensure（creationKey 无版本维度，复用会错挂旧版树），start/configure 如实拒绝并指引本树会话区直接新建，不假报就绪；legacy 树零变化（skip 参数缺省，既有 12 例看护全绿）。延后项收口：F8 分支 ref 匹配提共享单实现（reusable-branch-ref.ts，main/renderer 同口径）；本地 IPC updateMeta 显式 undefined 键剥除（与 worktree.set 语义对齐）。

已知边界（P3a 检视登记）：目录现算的触发=登记指纹变化/仓库集变化/手动刷新——计划材料保存或 PR 合入不即时刷新侧栏目标目录（会话内缓存时滞，下次登记事件或重载即新）；版本展开姿态一经用户接管（localStorage），其后新出现的 working 版本默认收起（可展开）；侧栏点击在导航校验前写入浏览版本（无树版本报错后浏览版本仍指向它——任务/目标行照常可用，属意内）；父级建议在 repo 行缺失时跳过宿主过滤（原生创建期校验兜底，不建议错树只可能建议出待校验项）；绑定树读取失败不回落旧固定树草稿（两份工作副本不互相冒充），已提交材料回落时如实透出草稿失败原因。

**未验证（如实留白）**：J1 双版本真壳导航（v0.7 legacy＋新建 v0.9 绑定树并行、切版不串）、J2 真壳创建/失败恢复经新表单入口、J5 旧材料/旧会话回看、J9 清理（本轮仅占位）、共享宿主上的目录汇总与配对树读取、侧栏在真壳的视觉/滚动/明暗主题核对——全部归人真壳会话。已知边界与偏差：全局「任务」入口（SidebarTaskNavButton）保留（高保真未画，移除属收窄 Orca 能力，留人决定）；每版本「总览」行未渲染（版本总览属 P6，不做假入口）；绑定树板内「新建计划/验收」与配置自动化被护栏拒绝（自动化版本身份属 P5，屏内按钮改绑属 P3b）；屏内选版下拉仍在（G3 D1/P3b 移除），绑定树上 list 只回绑定版故下拉仅一版、跨版 select 被 main 拒绝；目标树/任务树在目录体内为业务分组平铺（原生 lineage 嵌套仍在原生侧栏呈现）；计划/验收板只读回看模式（retired 版本直接读已提交材料进板）未实现——板改造属计划屏窗口/P3b，本轮 retired 版本的材料回看经任务/目标入口与旧固定树路径如实可达。



## 定稿设计的证据边界

[高保真修订 8](version-workspace-prototype.html?rev=8) 与 [旅程报告](version-workspace-journey.html) 于 2026-10-20 评审定稿：多版本并行、版本平铺回看、逻辑目标目录、目标工作树按需创建、原生创建器与工作区复用、不新增冻结操作、版本下方统一保留当前项目与私人项目的原生工作区入口；版本收尾为版本级清理：版本行删除图标＋与 Orca 同口径确认对话框，复用原生删除链与预检，默认只删本机 owned 树，材料与版本目录保留。新建版本准备计划/验收两树，侧栏入口合并流程树；原型按整屏标注计划/验收复用，目标仅筛选同一任务屏。初始 v0.7 在制、v0.6 演示已归档回看；新增版本由用户创建。

本轮修改设计资料与原型，未改 Electron 生产代码、真实工作树、自动化或会话记录。项目总览及其他既有屏幕仅标复用位置。所有新建、父树选择、清理与会话均为内存演示，刷新清空。图标操作与业界依据见 spec，不把参考当实现证据。

修订 7 的浏览器检查及提交前门禁结果留在 PR 验证记录。未验证 Electron 真壳、共享宿主、实际工作树创建/删除/跨宿主确认单、provider 写回、原生会话历史和旧共享树迁移；前版浏览器结果不能证明本版生产接线。
