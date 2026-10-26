# Issue #439：版本工作区反馈处理计划

> 给继续处理 [Issue #439](https://github.com/forcegravity1989/builder-workbench/issues/439) 的开发者与评审者读取。本文记录本次九项反馈的调查依据、处理顺序与验证要求，防止跨轮遗漏；行为正本仍在各特性 spec，执行结果与证据进 PR，不维护变更流水或另立遗留台账。范围、候选方案、已核实证据或后续实施安排变化时更新。
>
> **本轮范围：局部高保真与必要文档。** 生产修复、性能测量及双主机 Electron 验证尚未开展；源码定位与浏览器原型均不能证明产品问题已修复。调查基线为 `a977aa48d1a2ab35483b2aef6499ee83ed5af864`。

## 已明确的边界与本轮候选

- 沿现有高保真修正反馈涉及的局部，保留计划、验收、版本导航与原生会话的整体布局；优先复用 Orca 创建器、右击菜单、会话恢复和宿主路由。
- 新建版本默认接续紧邻的上一版本；先确定前版，再检查验收来源。前版只有计划而无可用验收来源时提示未完成验收，回顾暂空，不跳到更早版本，不阻止本版规划。恢复既有计划沿用已保存的固定来源，读取失败可重试，不替换来源。
- 两屏初始态候选均为单张简短启动卡，开始后呈现原有四区；计划目标尚未形成时保持空态，不放示例目标。启动反馈须与原生会话实际打开状态一致，不能依靠模型声称“板面已亮起”。验收仍保留已合入计划的现有门槛。
- 绑定关系独立于会话是否存在、是否运行；有绑定的树应可见，会话沿 Orca 原生侧栏恢复。候选将单树绑定/解绑放进原生右击菜单，移除版本上的重复常驻“绑定已有工作树”按钮，本轮不引入批量绑定。解绑仅解除版本归属，保留树、文件和会话。
- Showcase 去掉“勾勾表 · 人判 N/N”；目标头展示未关闭、遗留、已关闭及未知数。遗留是未关闭 Issue 中的人工标记子集，不与未关闭相加；读回失败单列未知，不推断完成。

## 九项反馈与处理落点

| #439 项 | 已核实依据与未核实边界 | 下一步处理与完成判据 |
|---|---|---|
| 1. 新建版本说明冗余 | [NewVersionDialog](../../../src/renderer/src/workbench/NewVersionDialog.tsx) 的表单及成功反馈展示固定树、agent 等实现说明；既有原型也有同类文字。 | 先收敛现有高保真的表单和成功反馈，只保留版本、必要输入、动作结果与失败原因。随后同步界面；不能因此改变创建两棵流程树、失败保留输入等行为。 |
| 2. 计划/验收初始态不一致 | [PlanningGoals](../../../src/renderer/src/workbench/version-planning/PlanningGoals.tsx) 在四区中放空目标启动卡；[AcceptanceEmptyBoard](../../../src/renderer/src/workbench/version-acceptance/AcceptanceEmptyBoard.tsx) 隐藏四区显示独立空板。[use-acceptance-board](../../../src/renderer/src/workbench/version-acceptance/use-acceptance-board.ts) 仍以计划归档合入为初始化门槛。 | 原型演示两屏单短卡、打开会话中、进入四区及启动失败；计划四区中的目标保持空白。验收补计划未合入/无法核对的阻塞状态。生产阶段核验启动卡不会在会话已打开后反复出现。 |
| 3. 上版来源、助手话术与板面脱节，回顾读取慢 | [version-workspace-prepare](../../../src/main/workbench/version-workspace-prepare.ts) 已初始化空计划；[week-planning Skill](../../../standard/skills/week-planning/SKILL.md) 仍要求助手创建材料并让人选择“同版上周或上一版”。[planning-progress-source](../../../src/renderer/src/workbench/version-planning/planning-progress-source.ts) 已完成固定验收及其计划的身份核验，[use-prior-carryovers](../../../src/renderer/src/workbench/version-planning/use-prior-carryovers.ts) 已负责遗留解析。实际耗时尚未测量。 | 原型覆盖正常回顾、前版无验收、读取失败重试、首次版本无前版；前版无验收时两行空白并提示，保留打开前版验收的入口。后续同步 Skill、[版本材料契约](../../../standard/system-prompt/references/version-records.md) 与宿主初始化职责，复用程序解析。分别计时来源定位、固定材料读取、Issue 实时读回，不将慢统一归因于模型。 |
| 4. Showcase 文案与目标计数 | [AcceptanceGoalRows](../../../src/renderer/src/workbench/version-acceptance/AcceptanceGoalRows.tsx) 存在人判总数，[AcceptanceGoalRow](../../../src/renderer/src/workbench/version-acceptance/AcceptanceGoalRow.tsx) 头部只显示关联 Issue 总量。人工遗留与原生关闭状态是不同事实。 | 原型按上述四类读数表达，去掉人判总数。后续沿现有 Issue 身份与人工标记推导；覆盖遗留且未关闭、遗留后已关闭、读回失败及零任务，防止重复计数、把未知算关闭或自动改人工标记。 |
| 5. 计划、验收、任务三屏仍慢 | [use-cycle-task-reads](../../../src/renderer/src/workbench/version-cycle/use-cycle-task-reads.ts) 缓存改善重复进屏；[task-port](../../../src/renderer/src/workbench/task-port.ts) 的板面读取仍逐项调用。[task-scope-load](../../../src/renderer/src/workbench/task-scope-load.ts) 的批量读取有本机 GitHub 范围，不能证明远端或 CodeHub 同样改善。尚无本轮性能基线。 | 后续先测首次进入、再次进入、切目标、手动刷新，分别记录本机 GitHub、远端宿主与 CodeHub 的调用数/耗时/首个可读内容时间；按实测瓶颈复用原生查询、已有缓存或批量能力，不先扩架构。成功与失败状态均保留真实读数及重试入口。 |
| 6. 多主机断链拖垮版本栏 | [version-catalog-load](../../../src/renderer/src/workbench/version-catalog-load.ts) 首次主干目录读取位于局部容错之外；[use-version-catalog](../../../src/renderer/src/workbench/use-version-catalog.ts) 外层失败会清空目录。调用链与现象吻合，尚未双主机复现。 | 原型只让断链树显示不可用，其余版本及本地入口可操作。后续在原宿主路由下隔离单来源失败，保留已知绑定身份并区分过期数据；不得把远端读取转成本机路径访问。以双主机断开、重连、权限拒绝验证影响范围。 |
| 7. 恢复会话后绑定树才出现 | [version-catalog](../../../src/shared/workbench/version-catalog.ts) 读取树的 `workbenchVersionBinding`，但过滤归档树；[use-version-catalog](../../../src/renderer/src/workbench/use-version-catalog.ts) 同样过滤归档计划树。目录消费的 `worktreesByRepo` 还是原生 visible 子集，而非完整 detected 登记（[原生可见性投影](../../../src/renderer/src/store/slices/worktrees/listing/worktree-host-ownership.ts)）；需对照两份集合及会话恢复前后的变化。此次会话丢失、树归档或登记同步异常的根因尚未确认，不能定性为会话数据损坏。 | 已绑定树的可见性不依赖会话列表。原型演示“树存在、暂无会话”及原生恢复入口；后续分别复现零会话、树归档、共享登记迟到、重启恢复。沿 Orca 机制找回树下会话，不新增 BW 会话副本或伪造可恢复状态。 |
| 8. 解绑与重复绑定入口 | [version-binding-service](../../../src/main/workbench/version-binding-service.ts) 已支持 `binding: null`；[version-nav-rows](../../../src/renderer/src/workbench/version-nav-rows.tsx) 已挂载 [WorktreeContextMenu](../../../src/renderer/src/components/sidebar/WorktreeContextMenu.tsx)，[WorkbenchVersionNav](../../../src/renderer/src/workbench/WorkbenchVersionNav.tsx) 另有版本级绑定入口。 | 在原生右击菜单接单树“绑定版本/解除版本绑定”，去掉重复常驻按钮；无批量绑定。覆盖未绑定、已绑定、解除后从版本目录移除但原生树/会话仍在、宿主拒绝时绑定不变。多实例仍须明确正在操作哪棵树。 |
| 9. 版本栏无法滚动 | [WorkbenchSidebarNav](../../../src/renderer/src/workbench/WorkbenchSidebarNav.tsx) 将版本区放入导航结构，[WorkbenchVersionNav](../../../src/renderer/src/workbench/WorkbenchVersionNav.tsx) 没有独立纵向滚动容器；布局能够解释长列表不可达，仍需实际窗口验证。 | 原型演示多版本、多树与窄/矮窗口滚动。生产阶段沿原生侧栏布局分配滚动范围，确保最后一项可达，展开/收起与右击菜单不被裁剪，项目入口及原生工作区仍可操作。 |

## 实施顺序与验证

1. **本轮：形成可评审的局部高保真。** 在 [版本工作区](version-workspace-prototype.html)、[版本计划](../version-planning/spec.md)、[版本验收](../version-acceptance/spec.md) 既有原型中落实相关候选，补对应 spec；核查链接、构建产物和交互状态。浏览器验证只证明原型，不标记九项生产问题已解决。
2. **后续：先补事实与口径，再改依赖它的实现。** 复现第 5—7 项并记录性能/宿主证据；确认前版排序和现有固定引用的兼容行为。按确认后的局部设计依次处理新建/启动、回顾与 Skill、绑定/目录容错/滚动、Showcase 与读取性能，保持原生身份及权限边界。
3. **随生产改动验证。** 跑受影响的现有测试与仓库门禁；确需新增测试时限核心推导、材料或宿主协议，不为文案与装配新增测试。真实 Electron 至少覆盖新建→计划会话→空目标→形成目标、前版缺验收/读取失败、计划未合入的验收门槛、单树解绑、零会话绑定树、滚动和重启读回；跨宿主项另做双主机断链/恢复。
4. **交付时逐项写证据。** 按 #439 九项在 PR 标明已实现、未验证或仍有实现缺口；界面验证附实际执行路径、期望与真壳截图，性能给前后可比较读数。未完成工作继续挂原 Issue，不把本计划当成完成证明，也不自动关闭 Issue。

## 实现前仍需确认的具体问题

- **非数字版本名的“前版”顺序。** 现有 [compareMaterialVersions](../../../src/shared/workbench/version-catalog.ts) 是点分数字/字符串比较，不是完整语义版本协议；用户自定义名字可能没有自然前后。不要按 mtime、侧栏“在制优先”顺序或首次读到的验收猜。原型可演示明确的相邻数字版本，任意名字的规则在实施时确认。
- **可用验收来源与验收完成的区别。** 只有目录读取成功且确认前版缺少可用验收来源时才显示缺失提示；存在文件但读取失败、格式损坏、尚未归档或人工结论未填写须按真实状态表达。不得由文件存在、stage 或 PR 合入自动判断人的验收已完成。
- **性能与丢失现象的根因。** 现有源码只是排查入口；以实际宿主、材料规模、请求链和原生登记复现结果确定修复层级，不把假设写成既定原因。
