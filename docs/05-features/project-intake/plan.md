# plan — 小项目组聚合的最小修复

> **读者与时机**：实现者、评审者在修改项目聚合和验证交付前读。本文只管 [spec 小项目组聚合修复](spec.md#小项目组聚合修复规格草案)的代码落点、步骤、风险与证明方式，不重定义产品行为或记录执行流水。源码落点、实施顺序或验证入口变化时更新。
> **状态：设计草案，未开始产品实现。** 复用既有 [intent](intent.md)，新增行为以 spec 确认为先；计划不另设必批 gate。关联 [Issue #342](https://github.com/forcegravity1989/builder-workbench/issues/342)；[原型](minimal-aggregation-prototype.html)是模拟交互，不是实际验收。基线为 `cb580816`；当前链状态见 [STATUS](STATUS.md)。

## 交付范围

用已存在的 Orca provider/Git 远端身份，把同仓不同目录的项目视图归到一起；工作空间与会话保留原宿主。Leader 继续配对多个项目主机，不实现角色。只修身份读回、分组和 Unknown 来源恢复；必要时修复这些操作路径上的宿主限定与计数归属。

不新增 `project_id`、名片字段、账号/团队记录、权限、别名映射表、跨主机归并/撤销协议、迁移文件或业务数据库；不改名片 PR/纳入判据、现有极简卡片和右栏配置。原生仓库注册、配对、会话镜像、认证和执行能力继续复用。真正必须改核心授权或新增协议时停在方案层，不作为小修悄悄带入。

## 现有调用链与修复落点

| 层 | 现有文件 | 仅在确认受影响时修改 |
|---|---|---|
| 仓库身份 | `src/shared/project-host-setup-projection.ts`、`src/shared/git-remote-identity.ts` | 复用 `getProjectIdentityKey` 的 provider 优先、通用远端、host-local 降级顺序；检查通用非默认端口与路径大小写，不按名字或目录生成跨机身份 |
| 所属宿主探测 | `src/main/repo-git-remote-identity.ts`、`src/main/repo-git-remote-identity-enrichment.ts` | 查明远端未加载、无远端、不可达的区分与晚到更新；沿所属宿主读取，不在观察端探测别人的本地路径，不新增全库轮询 |
| 目录读回 | `src/renderer/src/store/repos/repo-catalog-identity.ts`、`all-host-repo-catalog-actions.ts`、`src/renderer/src/store/projects/project-host-routing.ts` | 保留现有目录合并、连接命名空间与过期回执保护；排查 repo/project/setup 到达顺序及错误的裸 ID 索引 |
| 归并视图 | `src/renderer/src/workbench/workbench-wall-projects.ts`；`src/renderer/src/components/sidebar/worktree-list/grouping/` 下的 `project-grouping.ts`、`worktree-grouping.ts`、`worktree-group-keys.ts`、`host-labels.ts` | 墙与 BW 侧栏复用已有同仓身份口径；跨主机行键带宿主，不能用裸 repoId 隐式并卡；同机独立检出保留为同一项目下不同执行位置；不重写原生显式多仓分组，不过滤原生列表 |
| Unknown 呈现 | 上述分组及其既有 rows/listing 消费者 | 缺 repo/setup 时先按宿主核对目录状态；已知信息继续显示，未知处给原因及原生刷新/设置入口；来源恢复后重新分组，不通过删会话消除 Unknown |
| 定位与计数 | `src/renderer/src/workbench/switch-active-project.ts`、`use-wall-readings.ts`、`wall-card-readings.ts`；复用 `repo-host-identity.ts`、`worktree/host-qualified-identity.ts` | 项目入口与实际执行位置分开；避免按裸 repoId 取首行；原生路由已提供宿主限定时直接复用。会话归属保留宿主维度，沿现有新鲜度/离线口径，不另建会话统计源 |

不预先把表内所有文件都改一遍。现有 helper 足够则复用，只改真实缺口；缺少共用纯函数时在现有身份/分组模块内抽取，不建立第二套项目目录。

## 实施顺序

### 1. 对应现场，固定最小输入

- [ ] 记录两位成员的注册与宿主、远端身份、project/setup/worktree 对应关系及侧栏分组键；不记录配对 token、私钥或会话正文。
- [ ] 对应两个症状：重复入口是身份未读回还是侧栏按 checkout 拆组；Unknown 是目录晚到、宿主错误还是原生登记失效。当前源码分析不代替真实双机复现。
- [ ] 独立读回各宿主 `git remote -v` 和原生目录，选取同仓异目录/同名不同仓两组输入；只保留能改变修复方向的证据。

### 2. 先修身份读回与防误并

- [ ] 让既有 provider/通用远端身份通过原生探测和目录合并到达两个视图；区分 pending、无远端和不可达。
- [ ] host-local 回退只在所属宿主内有效，移除裸 repoId 的跨机误归并；只修实际定位到的远端规范化错误。
- [ ] 若规范化修复改变已有推导键，核对现有 `reconcileFetchedRepos` / project compatibility 合并能否保留原生偏好与引用；不能证明时说明影响并另议，不新造 ID 迁移系统。未知 SSH 别名继续独立，提示核对原生远端。

### 3. 再修分组、Unknown 与打开路径

- [ ] BW 侧栏默认项目分组与墙采用同仓身份；审视 `setupByRepoId`、repoMap、分组缓存和同机多 checkout 分组，不以隐藏真实工作空间换取单标题。
- [ ] 更新分组键、主机标签、展开/定位等实际消费者；视图变更限 BW 壳路径，原生内容可见性、非项目分组模式与显式多仓分组保持基线。
- [ ] 恢复来源后通过现有刷新与目录推送重算；不持久化新的关联或提示卡。项目墙继续严格名片判据，Unknown 原因在原生侧栏/连接处解释。
- [ ] 校验项目打开、会话定位和计数携带正确宿主；修复已证明的串主机或重复归属，不改自动化目标或现有会话实例。

### 4. 先验证核心，再走一条真实旅程

沿既有用例维护，不为 UI/文案/装配新增 Vitest。身份规范化、同仓归并、宿主限定和计数归属属于核心算法/数据协议，可调整对应已有用例；确需新增遵守 ≤10 例及叠层 ratchet 同交付对冲，不 skip 失败静音。

```bash
pnpm exec vitest run --config config/vitest.config.ts src/shared/git-remote-identity.test.ts src/main/repo-git-remote-identity.test.ts src/main/repo-git-remote-identity-enrichment.test.ts src/renderer/src/workbench/workbench-wall-projects.test.ts src/renderer/src/workbench/wall-card-readings.test.ts
pnpm run check:vitest-count-ratchet
pnpm run lint
pnpm run typecheck
```

命令按实际受影响文件裁剪，新增/删改测试与结果写入实现 PR。不会因为只写了本计划就运行生产测试或声称已通过。

| 验证层 | 覆盖 spec | 证明方式 |
|---|---|---|
| 核心算法与既有协议 | P-09 防误并、P-13 归属 | 同仓标准 HTTPS/SSH；异仓/端口；host-local 裸 ID 碰撞；同工作空间 ID 跨主机。断言目标行为，不镜像实现 |
| 真壳聚合主旅程 | P-08/P-09/P-10/P-11 | 两个实际 BW runtime 注册同仓异名异目录 → 导入配对 → 刷新 → 一张墙卡/一个项目标题、多工作空间 → 打开两边会话并独立核对 cwd → 断连/恢复 → 刷新归位 |
| Leader 跨项目 | P-08/P-11 | 连接 A/B 项目所需主机合集，核对两个项目、各自来源及原生文件/会话可读；无角色开关，无项目级隔离承诺 |
| 重启与不破坏原件 | P-06/P-07/P-13/P-14 | 杀完整 Electron 进程重开、删除再导入主机；从原生目录、Git/文件与宿主会话独立读回分组、执行位置和数字；核对未迁移目录/工作树/自动化 |

真壳入口沿 `pnpm run dev:workbench` 与 `tests/playwright.config.ts`。在现有 `tests/e2e/` 结构内先登记并运行聚合主旅程，记录与上述判据的双向映射；稳定后再补独立异常旅程。真实双机、真实会话、完整进程重启缺任一项就明列未验，HTML 原型和 renderer 重载不替代。

### 5. 交付与知识同步

- [ ] 回写本特性 spec/STATUS、特性矩阵及受影响的 architecture/模块正本，只记录实际已实现边界；本轮设计 PR 只同步草案入口与状态，不把目标写成现行能力。
- [ ] 按 AGENTS 运行提交前 lint-staged；推前独立 subagent 按原则 02 横切站 B 四维检视，处理发现项。
- [ ] 独立分支提交、push、开 PR；正文以 `关联 #342` 开头，不使用关闭关键字，不自动合入或关闭 Issue。
- [ ] 实现 PR 另发验证 Review，新增/修改判据给真壳截图四件套，截图分支和固定 SHA 地址沿 AGENTS；设计 PR 只报告文档与原型检查、明确未实现/未验。

## 风险与停线条件

正常视图修复不扩大权限或新增持久化身份，计划不单独升 gate。若现场证明必须新建业务项目身份、跨主机迁移实际数据、改变核心认证/权限/宿主协议，停止依赖该变化的代码，交回具体方案决定。信息不足时继续调查，不凭现在的代码反向认定产品意图，也不把不同仓库的业务归并塞入本轮。
