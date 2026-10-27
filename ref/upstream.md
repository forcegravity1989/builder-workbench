# Upstream Orca — 当前快照与同步记录

> **本篇维护约定**
>
> - **读者与时机**：处理 Orca/BW 边界、核对上游版本、或实际合并/rebase Orca 时读取；仓外会话从 [AGENTS.md](../AGENTS.md) 的任务表进入。
> - **职责与边界**：只记录与 BW 边界有关的 Orca 当前快照、稳定差异、旧 main 迁移来源和同步取舍；不承载 BW 产品设计、日常开发规则、完整 Orca release notes、完整源码树或未解决事项清单。
> - **记录方式**：当前快照覆盖同一组字段，不追加月报。每次核对更新版本/日期/范围；历史由 Git 追溯。无法核对的字段写 `Unknown`，不能用旧基线冒充当前版本。
> - **更新触发**：上游基线或公开版本变化、BW 增删影响同步的钩子、稳定目录边界变化、或同步取舍改变时更新；普通 BW 功能开发不更新本篇。
>
> 本篇的“当前”只表示最近一次有来源的核对，不代表仓库已经跟随该版本。BW 当前产品行为读 [architecture](../docs/architecture.md)，叠层运行入口读 [SYNC](../src/renderer/src/workbench/SYNC.md)。

## 0. 30 秒快照

### 0.1 上游版本锚点

| 项               | 本次核对结果                                                       |
| ---------------- | ------------------------------------------------------------------ |
| Orca 仓库        | [stablyai/orca](https://github.com/stablyai/orca)                  |
| 最近公开版本     | [v1.4.222](https://github.com/stablyai/orca/releases/tag/v1.4.222) |
| 发布时间         | 2026-10-07                                                         |
| 发布锚点         | `4bb6f20`（release 页面短 SHA）                                    |
| 本次核对日期     | 2026-10-11                                                         |
| BW fork baseline | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`，2026-09-15             |
| 本次核对范围     | 公开 release、仓库顶层目录、与 BW 边界直接相关的能力摘要           |

公开版本不是本仓当前同步基线；本仓的 fork baseline 仍是单独的历史锚点。没有完成一次实际代码比较时，不把“最新 release”写成“已同步”。

### 0.2 与 BW 边界直接相关的能力

当前公开版本的变化重点涉及 agent/orchestration workers、workspaces/worktrees、terminal 与远程运行、native chat（实验能力）、编辑器/Markdown/search、provider/account 与 Windows/WSL。BW 只复用其中与自身旅程有关的 Orca 执行核；具体 BW 产品行为不在这里重复。

BW 依赖的稳定 Orca 原生能力是：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、provider 与 `src/main` runtime。BW 不为这些能力另建平行实现。

### 0.3 上游目录定位

下面只列同步时需要定位的稳定目录层级，不是完整源码清单：

| 层级         | 上游目录                                                                           | 用途                                                               |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 产品与执行   | `src/`、`native/`、`cloud/`、`mobile/`                                             | 桌面/原生/远程/移动产品与执行代码；合并时按实际文件和调用链判断    |
| 资源与 Skill | `resources/`、`skills/`、`skill-guides/`、`skill-stubs/`                           | 原生资源与能力分发；Workbench 自有 Skill 以本仓 `standard/` 为正源 |
| 工程与验证   | `config/`、`tests/`、`docs/`、`.github/`、`.husky/`、`Casks/`、`examples/plugins/` | 构建、测试、参考和发布辅助；不因此把上游工程文档变成 BW 产品正本   |

## 1. 上游身份与 fork 基线

| 项               | 值                                                                       |
| ---------------- | ------------------------------------------------------------------------ |
| Orca GitHub      | `https://github.com/stablyai/orca`                                       |
| BW 仓远程        | `origin` = `https://github.com/forcegravity1989/builder-workbench.git`   |
| BW `origin/main` | 产品主干（原 `bw-orca`）；旧 Rust 路线归档为 `archive/main-pre-orca`     |
| Orca 本地远程    | 建议名 `orca-upstream`；使用前必须核对 URL，不能把 `origin` 当 Orca 上游 |
| fork baseline    | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`（2026-09-15）                 |

执行实际 Orca 同步前，先在独立分支核对远程身份和当前主干：

```bash
git fetch origin main
git remote get-url orca-upstream
git fetch orca-upstream main
git merge orca-upstream/main
```

这些命令只适用于明确开展 Orca 升级；日常 BW 任务不因本篇而检查上游。旧 Rust main 只做定向迁移和重新决策，不整支合并。

## 2. BW 相对 Orca 的稳定边界记录

### 2.1 已删除或迁移的上游内容

- **Orca Mobile 产品已删除**：`mobile/` Expo 客户端、桌面 Mobile 产品页、Mobile 导航和对应 CI 不应在同步时恢复。
- **配对协议能力仍保留**：`src/shared/mobile-relay-*`、`mobile-e2ee-*`、`DeviceScope`、session 镜像、emulator、relay/pairing 等活体协议不等同于 Mobile 产品，不因删除产品页一起删除。
- **产品文档正本已替换**：仓根 `AGENTS.md`、`README.md`、`CONTEXT.md`、`CLAUDE.md` 与 `docs/` 是 BW 正本；上游工程参考进入 `ref/`，不覆盖 BW 产品文档。
- **上游对外文档站不作为 BW 产品站**：`docs/site/`、README 多语言/营销素材和专项工程笔记不自动恢复；需要时从 Git 历史追溯来源。

### 2.2 目录和挂载边界

| 层级                  | BW 落点                                                                             | 同步取舍                                                                   |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Orca 原生执行核       | TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、`src/main` runtime | 原生优先；不大段改写，不复制会话、任务、工作树、连接或调度内核             |
| BW UI 叠层            | `src/renderer/src/workbench/`                                                       | 保留 BW 导航和业务板；与原生界面冲突时人工处理                             |
| BW 业务契约与事务     | `src/shared/workbench/`、`src/main/workbench/`                                      | 业务落在 BW 自有模块，不塞进 Orca 工作树、连接和调度类                     |
| 宿主适配与 relay 组合 | `src/relay/workbench/`、原生 RPC/CLI 注册入口                                       | 复用原生身份、路由和窄执行器，只登记 BW 入口                               |
| 产品分发规范          | `standard/`                                                                         | 是给被管项目的规范正源，不与 `.claude/skills/` 或 Orca 根级 Skill 目录合并 |

实现位置和运行入口的细节见 [SYNC](../src/renderer/src/workbench/SYNC.md)；当前产品能力见 [architecture](../docs/architecture.md)。

### 2.3 需要在同步时保留的稳定扩点

只记录会影响 Orca 合并取舍的契约，不展开全部文件清单：

- `automation.runNow` 的可选 `oneShotPrompt`、capability 门控和 renderer/headless 两条派发语义；一次性上下文不写回保存的自动化提示。
- 自动化编辑器的显式 `target/draft` 请求契约；BW 预填入口依赖该原生能力。
- 任务详情的 source context、return-to-previous-view 和 worktree history replay；BW 不另建任务详情和历史系统。`openTaskPage({ preselectedRepoId })` 的预选优先级（显式预选 > 持久化 defaultRepoSelection > 全部项目）同为稳定契约：BW 侧栏任务入口靠它在 BW 壳内默认收窄到当前项目，页内筛选仍可改。
- 计划屏 G3 与验收屏 v10 接线依赖的原生扩展点（2026-10-21 起，验收侧 2026-10-22 接入同一批）：① `lookupGitHubWorkItemForSource({ type: 'pr' })` + `openTaskPage({ openGitHubWorkItem })` → 原生 `task-page/Content` 按 `type==='pr'` 落 PullRequestPage，BW 归档卡打开原生 PR 页全靠此链（CodeHub 走 `viewTask(kind:'mr')` + `openCodeHubTask`），上游合并保留 type 参数与 PR 路由；② `openAgentSendPopoverTargetMode`（source union `'diff-notes'|'browser-annotations'`）是 BW 对象级动作与板面批注发送进入 target mode 的入口，BW 沿用 `'browser-annotations'` 不扩 union（埋点归因混入浏览器批注，要区分先交人决策）；**2026-10-22 起弹窗内会话行发送改走 `ReviewNotesSendMenuContent` 自身链（`sendNotesToActiveAgentSession` + QuickLaunch），BW `plan-send-menu.tsx` 合并该原生菜单组件与 target mode——上游合并需同时保 `openAgentSendPopoverTargetMode` 签名与 `ReviewNotesSendMenuContent`/QuickLaunch 的 props 稳定，菜单内部变化会静默破坏两屏的全部对象级注入动作——计划屏的拆解 Issue / 整理纪要 / 板面批注发送，以及验收屏 v10 起经同一包装件递交的部署 / 整理纪要 / 发起归档 / 发布 / 板面批注发送（`plan-send-menu.tsx` 名字带 plan 但已是两屏共用件，`assistant` 参数只改用户可见文案里的 AI 角色名）**；③ `AppWorkspaceShell` 的 `vc-board-titlebar` 内 `vc-session-toggle` 改为仅 `workflow === 'acceptance'` 渲染（计划屏收折 chip 迁入板面页头，经 `PLAN_CHAT_TOGGLE_EVENT` window 事件桥与壳 `use-plan-column-resize` 同步），上游合并保留该条件渲染与拖拽带结构。
- BW 版本绑定与版本准备的原生契约接缝（G2 #383 P1/P2）：`WorktreeMeta.workbenchVersionBinding` 附属字段（undefined 保留 / null 清除）、`worktree.set` 白名单、`mergeWorktree` 投影规范化、runtime capability `workbench.version-binding.v1`（写入与清除双方向门控，无能力对端不下发）；BW 薄 helper `workbench.versionBinding.read/set`（原生身份定位、owner 验证、instanceId 围栏、读回确认才返回）；`workbench.versionWorkspace.prepare`（capability `workbench.version-workspace.v1`：宿主端预检 → 原生 `dedupeWorktreeCreate` → 创建结果核对 → 绑定写入 → 空计划 create-only 初始化）与 SSH relay `initializeEmptyPlan` 窄操作（无绑定树带旧固定分支围栏）。上游合并须保留白名单、投影规范化与能力双向门控——静默剥掉绑定字段会造成「写入被丢弃」假成功，由读回确认链兜底暴露。本地 IPC `worktrees.updateMeta` handler 语义（H-1 收窄后）：仅 `workbenchVersionBinding` 键显式 undefined=保留（剥除后合并）；其余键沿原生本地 IPC 线约 present-but-undefined=spread 清除（baseRef/pushTarget 两条原生清除链依赖），上游合并不得把该 handler 改回全局剥除或全局清除任一极端。
- TaskPage 的 BW 入口上下文 `workbenchTaskScope`（#439）：版本入口在同一原生任务页预选可取消的版本标签，沿原生查询与分页；仅目标入口点读完整材料引用后按原生条件过滤分页，缺数据引用保留原因。Issue/PR、预设、仓库和筛选不再隐藏。入口条件不写全局 resume 查询，取消版本同时清目标；详情往返保留当前仍有效的上下文。Issue Start/Open 只有明确引用/绑定证明时带入 BW 创建归属，无证明沿原生。CodeHub 版本标签查询与目标 @me 身份依赖真实 CLI 契约，未接通时明确提示并允许取消条件，不把有上限的列表过滤冒充完整结果。上游合并保留这些薄挂载与 #451 的显式 taskSource 恢复。
- `AppWorkspaceShell` activity 视图的 BW 页面挂载：按 `workbench/project-page-state` 模块态渲染项目墙/接入/名片补录/版本总览（G2 #383 P6 增 version-overview 分支）页面，activeView 切换即清模块态，不扩原生 TopLevelView union；上游合并保留该懒加载分支序列。
- 工作树版本偏好、Git history 的窗口/固定 revision/`committedAt`、GitHub/CodeHub 的真实 `mergedAt` 字段透传。
- 原生创建器的 BW 预填通道（G2 #383 P4）：`ComposerStateInput`/`ComposerModalData` 的可选 `initialNote`（原生备注种子，可见可改；BW 目标开工不再自动传入，也不为它预读计划）、`initialParentWorktreeId`（父级建议种子；选择器与创建期 `resolveWorktreeCreateParent` 校验仍是权威，repo 切换清除旧建议）、`workbenchCreation`（`shared/workbench/creation-context.ts` 的版本/目标/任务来源上下文，提交时按最终仓库+最终任务来源解析为绑定，仓库变更即失效）。绑定写入发生在**真实创建结果处**：`WorktreeCreationRequest.workbenchVersionBinding`（quick/background 链，纯可序列化、Retry 原样重放）与 full 链的镜像写入均调 BW `workbench/post-create-version-binding.ts`（instanceId 必填围栏、读回确认、失败保留树并提供「重试写绑定」，不重复建树、不阻塞原生激活流）。上游合并保留原生可选字段、请求字段与钻透链（composer-target-store → target-state → identity/source-context state → modal → quick/full execution → flow-execute）及 repo 变更清父级语义；无这些字段的原生调用方行为逐字不变。
- Terminal→TabGroupSplitLayout 链的 `reserveClosedExplorerToggleSpace` 宿主参数（默认 true=Orca 原行为；BW 计划/验收双栏传 false，避免右上角预留位吃掉侧栏收起后的宽度）；上游合并时保留传参与默认值。
- WSL/SSH/配对沿用原生宿主身份和执行路由；BW 不新增本机专属连接层。
- 配对会话的 editor 标签发布与终端一样阻止镜像回声（#388）：`isMobilePublishableOpenFile` 排除 `mirroredFromRuntimeSession === true` 的文件，覆盖普通文件、Markdown 与预览的分组及 fallback 发布入口。上游同步时保留该过滤；不能按 `runtimeEnvironmentId` 是否存在排除文件，用户主动打开的远端文件仍沿原有语义发布。
- 客户端检查、下载与安装复用上游更新链，更新源和提示身份按产品解析（#338）：`src/shared/release-channel.ts` 的仓库常量在 Workbench 构建（`WORKBENCH_SHELL` define / env，renderer bundle 同名 define 在 electron.vite.config.ts）下全部解析为 `forcegravity1989/builder-workbench`——BW 没有 hourly/daily/adhoc 专属仓，四个通道指向同一公开仓、开发通道列表自然为空；`updater-setup` / `updater-release-feed` / `updater-prerelease-feed` 的 feed 与 atom 源均从 `MAIN_RELEASE_REPO` 派生。BW 侧曾对 Workbench 禁用整条更新链（检查/下载/安装弹「手动更新」），已按上游原形恢复；上游同步时保留该产品感知间接层，不恢复 stablyai 硬编码 URL，也不再引入 Workbench 禁用分支。Workbench 不请求 Orca 官网的推广配置与更新介绍，也不启动推广轮询；更新卡使用原生简版和本仓 GitHub Release 说明链接，提示中的产品名与发布源使用同一身份。后台每日检查、唤醒/聚焦补查与用户选择下载、重启的原生行为保持。Windows Workbench 发布更新以本地 generic feed 薄适配 GitHub 发布包的整包断点续传（#421），暂禁用该路径差分下载；校验和安装仍归原生更新器，取舍与恢复规则见 [客户端更新](../docs/06-module/客户端更新.md)。BW Windows 包未签名：出包必须走省略 publisherName 的未签名通道并注入产品版本号（账本三处一致门禁在 `release-win-workbench.mjs`）。
- 原生 provider 标签和身份抽取保持单一实现；不要把已经去重的实现合回来。
- 原生内置浏览器对普通 HTTPS 域名的 `ERR_CERT_AUTHORITY_INVALID` 也提供现有“仍然继续”入口（`browser-certificate-trust-controller.ts`），不恢复 localhost／回环地址限制。默认仍拒绝；沿用原生 renderer 按钮与 agent RPC `browser.certificate.proceed` 两条显式继续入口（RPC 不另设人工确认）。授权是会话级例外（Chrome SSL exception 语义）：同一应用会话内按端点＋叶子证书指纹放行全部标签页，跨域提交（如 SSO 往返）不吊销；不落盘，重启应用或端点换叶子证书都要重新确认，且换证书时拒绝并不再提供“继续”入口（fail closed）。其他证书错误、子帧与非 HTTPS 首次请求不扩大授权。上游同步时保留这项入口范围与会话级信任语义。
- BW Skill 分发登记保持一致：`resources/skills/current-manifest.json` 与 `snapshot-registry.json` 必须继续登记 `bw-knowledge-docs`、`metrics-refresh`、`version-acceptance`、`week-planning`。manifest/registry 由 `config/scripts/generate-skill-bundle-manifest.mjs` 从根级 `skills/` 生成；三个产品流程的正文正源仍是 `standard/skills/`，运行时指南由 `config/scripts/generate-bundled-skill-guides.mjs` 生成，不手改生成物。
- 跨主机项目墙（G3）依赖原生 runtime 配对链：BW「导入 Builder 主机」批量壳只调用 `runtimeEnvironments.verifyAndAddFromPairingCode`（与原生 AddRemoteHostDialog 同一 IPC）与环境列表/状态快照，不建平行配对存储；主机名唯一（大小写敏感）是重复导入幂等的判据。上游合并需保留该链的 renderer API。
- 共享链接回显沿原生 `DeviceRegistry` 和 E2EE 身份：renderer 仅持久化公开引用，`mobile:restoreRuntimePairingUrl` 只读恢复同一链接，不创建/轮换授权，不改变监听范围；撤销或身份不匹配不恢复。同步时保留这条回显链，不能用生成接口替代读取。
- runtime 配对 env id 每次配对随机新发（`addEnvironmentFromPairingCode` randomUUID）、runtime 主机仓不落本地盘、注册行身份为 (repoId, executionHostId)：**删除主机会留下残留注册行**（Orca 原生列表按项目身份分组故不受影响）。BW 项目墙以「只认当前配对目录内的行 + 稳定身份归并」构造性过滤；上游合并不得假定 env id 稳定或把残留行改成持久身份语义。
- 设置→集成页按 BW #323 收敛为 GitHub / CodeHub / WeLink / CloudBuild 四卡（代码托管 / 项目群 / 构建三组；CloudBuild 为 #366 增补，2026-10-19）：六张隐藏卡的组件、状态推导与词条保留在仓（人拍板 2026-10-16），但 `IntegrationsPane` 渲染名单与 `integrations-search` 目录是 BW 口径；preflight 增加 `welink-cli` / `cb` 探测与 codehub / welink / cb 的 `auth status` 读回（`PreflightStatus.welink` / `cloudbuild`、`codehub.authenticated`），welink 读回把 EXPIRED 判未登录（人拍板 2026-10-16，BW 口径），cb 存活探测用 `version` 子命令（`--version` 是未知旗标）、登录判定按输出标记（`Token Expires` 行且不带 `(expired)` 后缀，退出码恒 0 不可信，BW 口径照 welink EXPIRED 拍板），探测经 `command-path-resolver.ts` 的 `resolveCommandOnLocalPath` 解析真实文件、`.cmd` / `.bat` 经 `cmd.exe` 执行（`preflight-command-exec.ts`，修 npm 全局 CLI 装完仍报未安装的 Windows 盲区，BW 口径）。各卡登录按钮在卡内展开上游 `OnboardingInlineCommandTerminal` 内嵌终端（粘贴命令不回车、人按回车，OSC 133;D 感知命令结束自动复查；2026-10-19 人拍板，远端范围不给按钮）；该上游组件内 `TerminalPane` 改传 `isVisible={entered}`（BW 口径，2026-10-19 真壳白屏修复：组件在 0fr 展开动画容器内挂载终端，恒真 isVisible 使 WebGL 渲染器在无盒状态下解析 PTY 输出、展开时模型 diff 跳过预展开单元格导致画布空白；改随 `entered` 挂起渲染、动画完成翻可见走 TerminalPane 既有的 reveal-repaint 链从缓冲重绘，上游合并保留该传参）；codehub / welink 安装由应用后台执行各自自包含 npm 命令（含内网 registry 与 `--strict-ssl=false`，人确认 2026-10-16，不动机器 npm 配置，不占会话栏），cloudbuild 为**两步**（`npm config set @hw-cloudbuild:registry <内网源>` → `npm install -g @hw-cloudbuild/cloudbuild-cli`，人指定 2026-10-19，会写机器 npm 配置、不带 `--strict-ssl=false`，runner 按序执行、任一步失败即中止）；gh 安装保持外链。CodeHub / WeLink / CloudBuild 卡片共用一个 `BwCliIntegrationCard` 骨架（每卡为文案 / 探测字段 / 登录命令的薄配置），与本机范围判定因上游文件 max-lines 预算拆入 BW 自有新文件（`bw-cli-integration-cards.tsx`、`use-local-cli-scope.ts`，经 barrel 导出），codehub / welink / cloudbuild auth 读回与 BW 三 CLI 探测编排（`probeBwClis` / `readBwCliAuths`，回调注入探测函数避免循环依赖）在 `bw-cli-auth-status.ts`、安装链路（`bw-cli-install-commands.ts`、`bw-cli-install.ts`、preload `bw-cli-install-api.ts` / `cli-install-bridge.ts`、渲染端 `cli-install-action.ts`）同为 BW 自有文件（主进程模块由 agent-detection / register-core-handlers 直接引入，不经 renderer barrel）。上游合并保留该渲染名单、探测字段与 shim 路由、登录内嵌终端分支与 welink EXPIRED / cb 过期标记语义，不恢复六卡渲染，也不把 BW 卡合回上游卡模块。

相关行为正本分别在 `docs/05-features/`、`docs/architecture.md` 和源码契约中；本篇只保留同步时必须知道的取舍。

### 2.4 CodeHub 边界

CodeHub 是独立的 `TaskProvider`，不塞回 GitHub 的 `listWorkItems`，也不通过 `gh`/`glab` 降级处理。CodeHub service、`codehub:*` RPC、任务来源和 GitHub 更新路径保持分离；详细行为见 [CodeHub 特性](../docs/05-features/codehub/STATUS.md) 与 [CodeHub 指南](../docs/03-guide/codehub-cli.md)。

### 2.5 从旧 Rust main 吸收的内容

- `standard/` 的系统提示词、references、skills 和模板已作为内容目录合入；旧 Rust `crates/bw` 的集中注入器和旧周一屏脚本不复刻。
- reviewer-agent 召唤制 CI 已迁入默认主干；其现行状态见 [reviewer-agent STATUS](../docs/05-features/reviewer-agent/STATUS.md)。
- 旧 Rust 旅程、ADR、release/出包入口和历史绿灯不作为当前 Electron 行为证据。

### 2.6 CI / E2E 边界（2026-10-13 隔离）

- 旧 Orca CI/E2E 源保留在仓内不删：旧 workflow、`tests/e2e/` 用例与 helper、`config/scripts/` runner 与契约测试、`tests/tools/` 下 Windows 更新/崩溃 E2E 工具，便于对照 upstream 和后续按需迁移；它们不属于 Workbench 当前流水线的测试集合，冻结为归档源，不随本仓 pr.yml 演进更新（旧契约测试断言的是旧 workflow 结构，属历史身份）。
- 29 个旧 workflow（含 `release-ref-validation.yml`、`track-community-prs.yaml`、`issue-os-labeler.yaml`；`skill-update-roundtrip.yml` 为 2026-10-14 补充降级，见下条）摘除 `pull_request` / `push` / `schedule` / `workflow_call` / `pull_request_target` / `issues` 自动触发，只留 `workflow_dispatch`。注意：`workflow_dispatch.inputs`、`env`、`permissions`、`concurrency` 已随自动触发一并精简，**手动入口不保证可运行**——它们是归档占位，不是维护好的手动链；恢复任何一条旧链必须单独评审其触发器、额度和对 Workbench 的实际价值。
- 隔离后仍会自动触发的 legacy workflow 只剩本 fork 命不中或空转的：paths 门控的 `cloud-verify.yml`（`cloud/**`）、`docs.yml`（`docs/site/**`）；job 级门控空转的 `readme-downloads-badge` / `cloud-monitor-relay-clock-skew` / `cloud-power-relay-staging`（schedule，job 被 `github.repository == 'stablyai/orca'` 或 `vars.ORCA_CLOUD_OPERATIONS_ENABLED` 门控）、`cloud-recover-relay-staging-c4-image` / `cloud-requeue-relay-staging-c4-recovery`（`workflow_run`，同一 vars 门控）、`release-policy.yml`（release 事件，`stablyai/orca` 门控）。**补充（2026-10-14，PR #353）**：`skill-update-roundtrip.yml` 原列本条（假设 paths 命不中），但触及 `resources/skills/**` 的 PR 即触发且**结构性必红**——`verify-skill-update-roundtrip.mjs` 的 historicalRelease/seedPlacement 需物化 release-mapping 命名的 Orca v1.4.x release tag，本 fork 只有 `v0.4.0` 与三个 `v0.5.0-rc.*`（#352、#353 与 main push 09076a6e 各 13 检查全红实证）。经人拍板降级为 dispatch-only（第 29 个），矩阵收窄为 windows-latest（BW 只发 Windows 安装包，macOS/ubuntu 场景不需要），守护契约测试 `skill-update-roundtrip-workflow.test.mjs` 同步改写为钉住隔离状态与 Windows-only 矩阵。
- Workbench 自动检查只有 `.github/workflows/pr.yml`（verify：lint / typecheck / 定向 vitest / build:desktop；e2e：`test:e2e:workbench` 单条 Electron 冒烟）；外部代码评审仍由 `.github/workflows/claude-code-review.yml` 召唤制承担。pr.yml 不用 `paths` 过滤——触发级过滤会让被排除的 PR 完全没有检查上报（旧 `code_paths` 探测器规避的正是这个坑）。
- `tests/playwright.config.ts` 只发现 `tests/e2e/workbench-cycle-smoke.spec.ts`；`config/vitest.config.ts` 只 include `src/**/*.test.ts(x)`。`package.json` 不保留旧 E2E 专项入口；Workbench 壳是构建期烘焙（`isWorkbenchShell()` 读 `import.meta.env.VITE_WORKBENCH_SHELL`），所以 `tests/e2e/global-setup.ts` 在 `electron-vite build --mode e2e` 的子进程 env 里固定注入 `WORKBENCH_SHELL=1 VITE_WORKBENCH_SHELL=1 ORCA_PRODUCT_NAME=Workbench`——单一来源，Windows cmd、POSIX shell 与 CI 一致（不用 `dev:workbench` 那种 POSIX env 前缀写法，那种写法在 Windows cmd 下不成立）。
- `config/reliability-gates.jsonc` 只登记仍属当前 Workbench 检查范围的 gate（121→63）；`release-cut.yml` 不保留旧 E2E 发布证据 job。lint 与 reliability-gates 链暂保留在 verify 内，待 Workbench 专属质量门禁定义后再替换，避免在没有等价门禁时静默削弱检查。
- 新链 helper 与保留源的配对关系（副本，不是共享；改保留源不会传导过来，需自觉防漂移）：`tests/e2e/helpers/workbench-app.ts` ↔ `orca-app.ts`；`tests/e2e/helpers/workbench-test-repo.ts` ↔ `seeded-test-repo.ts`。种子仓的持久化文件名与产品无关（`orca-data.json`，见 `src/main/persistence/loading-store/user-data-path.ts`）。
- 本次隔离不表示 Orca runtime 源码已删除；保留的历史源文件也不表示它们仍属于当前交付门禁。

## 3. 同步取舍

1. **产品文档冲突**：`docs/`、`AGENTS.md`、`CONTEXT.md`、`README.md`、`CLAUDE.md` 以 BW 正本为准；上游工程说明只进入 `ref/`。
2. **上游参考文档**：`ref/` 可以按实际需要吸收 upstream `docs/reference/**` 或 `STYLEGUIDE.md`；不得把 `ref/` 再拷回 `docs/`。
3. **叠层外源码冲突**：BW 自有 `workbench/` 模块以外，默认优先保留 Orca；只有本篇登记的稳定契约、RPC/CLI 注册、relay 组合和已确认的去重边界需要人工合并。
4. **叠层内冲突**：`workbench/**` 与挂载钩子按 BW 现行实现人工合并，不能用上游整段覆盖。
5. **生成物与本机状态**：`.omc/**`、本机 profile、`dist/`、`out/` 不进入产品提交；生成的 Skill/指南按各自正源更新。
6. **CodeHub**：保留独立 provider 和 service；GitHub.com 继续走 Orca 原生 GitHub 路径，不把 CodeHub 收成 GitHub Enterprise 或 GitLab。

合并后按 [SYNC](../src/renderer/src/workbench/SYNC.md) 的 Electron 入口做受影响冒烟；源码存在不等于真实 Electron、远端或模型旅程已验证。

## 4. 关联正本

- [AGENTS.md](../AGENTS.md)：本仓开发规范、任务读取路径和验证/交付规则。
- [docs/architecture.md](../docs/architecture.md)：BW 当前产品旅程、能力归属和 Electron 数据流。
- [SYNC.md](../src/renderer/src/workbench/SYNC.md)：叠层代码边界、运行入口和调试方式。
- [docs/05-features/](../docs/05-features/README.md)：特性定义、状态和验证证据。
