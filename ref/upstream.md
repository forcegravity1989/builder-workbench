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

| 项               | 本次核对结果                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Orca 仓库        | [stablyai/orca](https://github.com/stablyai/orca)                                                                                         |
| 已采用基线       | 执行核和原生桌面组件均以 [v1.4.272](https://github.com/stablyai/orca/releases/tag/v1.4.272) 为基线                                        |
| 已采用标签时间   | 2026-11-23 12:03:15 UTC                                                                                                                   |
| 已采用源码锚点   | `6272306c5a5a59ed1c6b604896610bfadde180cc`                                                                                                |
| 官方最新发布     | 截至本次核对为 [v1.4.274](https://github.com/stablyai/orca/releases/tag/v1.4.274)，2026-11-24 22:52:16 UTC；尚未同步                      |
| 本次核对日期     | 2026-11-25                                                                                                                                |
| BW fork baseline | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`，2026-09-15                                                                                    |
| 本次核对范围     | [#778](https://github.com/forcegravity1989/builder-workbench/issues/778) 的执行核、桌面组件、原生 Bot、连接器、跨主机群组及迁回的 BW 入口 |

公开版本不是本仓当前同步基线；本仓的 fork baseline 仍是单独的历史锚点。没有完成一次实际代码比较时，不把“最新 release”写成“已同步”。

### 0.2 与 BW 边界直接相关的能力

执行核负责会话、调度、终端进程、Git 工作树、宿主路由和 Agent provider。原生桌面组件提供 Chat、终端界面、TaskPage、Automations、Explorer/SC/Diff 和 Bots。BW 复用两层实现，由 BW 叠层定义自己的导航、项目和版本工作区。

[#778](https://github.com/forcegravity1989/builder-workbench/issues/778) 以 v1.4.272 为桌面与执行基线，迁回 Workbench 导航、项目与版本工作区、材料以及现有内部集成的入口。Bot Home、Chat、待处理事项、工作派发、自动化、连接器和跨主机群组使用同一提交的原生实现。连接器继续沿上游账号和服务，内部账号、WeLink 和 CodeHub 沿 BW 现有集成。早期桌面走查范围见 [PR #785 验证记录](https://github.com/forcegravity1989/builder-workbench/pull/785#issuecomment-7134631514)。

2026-11-27 核对 [#785](https://github.com/forcegravity1989/builder-workbench/pull/785) 的代码提交 `cad6c0916491732d676efc139ff762dc50d2c0ad`（当时 main 为 `6a1db93382174766ee55520aa53544de0bab03a4`）。该提交关联的 10 项检查全部通过，包括 [Workbench CI 的 5 项检查（含 Electron E2E）](https://github.com/forcegravity1989/builder-workbench/actions/runs/45819829454)、[Issue 关联](https://github.com/forcegravity1989/builder-workbench/actions/runs/45819818071)和 [Cloud Verify 的 4 项检查](https://github.com/forcegravity1989/builder-workbench/actions/runs/45819829420)。这些运行覆盖远端自动检查；内部双机验收以 A、B 使用的临时包提交及实测结果为据。

配对协作以 Orca 共享地址为入口，材料由工作树所属的本机或配对宿主读写。旧直连 SSH 项目的材料通道与尚未上线的旧团队只读邀请无需迁移。Orca 原生普通 SSH 工作区仍沿上游入口。

BW 主干的团队主机同步、成员只读访问、权限调整和访问日志沿现有实现接入新版宿主接口。团队身份由带团队访问标记的链接传递。升级旧配置时，[团队主机同步](../src/main/workbench/team-collaboration/team-host-sync.ts)须按目录中的团队链接补齐自动登记主机缺失的访问类型；即使地址和令牌相同，也要让已有连接以成员身份重新认证。手工配对沿原入口，共享设置继续挂载 BW 原组件。

Agent Dashboard 随新版采用原生会话看板。旧独立窗口地图的右键启动入口随新版移除，Agent 从所属工作区启动。

### 0.3 上游目录定位

下面只列同步时需要定位的稳定目录层级，不是完整源码清单：

| 层级         | 上游目录                                                                           | 用途                                                               |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 产品与执行   | `src/`、`native/`、`cloud/`、`mobile/`                                             | 桌面/原生/远程/移动产品与执行代码；合并时按实际文件和调用链判断    |
| 资源与 Skill | `resources/`、`skills/`、`skill-guides/`、`skill-stubs/`                           | 原生资源与能力分发；Workbench 自有 Skill 以本仓 `standard/` 为正源 |
| 工程与验证   | `config/`、`tests/`、`docs/`、`.github/`、`.husky/`、`Casks/`、`examples/plugins/` | 构建、测试、参考和发布辅助；不因此把上游工程文档变成 BW 产品正本   |

### 0.4 智能体同步矩阵

智能体接入以 §0.1 的 Orca v1.4.272 为基线。下表按 Git 文件内容核对 BW 与该标签的主进程专项目录。目录以 `src/main/` 为根。

| 智能体         | 已核对的目录                                              | 相对该标签的差异                                                                                                                                                                            |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex          | `codex/`、`codex-accounts/`、`codex-cli/`、`codex-usage/` | 实现一致。BW 增加两个测试文件，核对托管配置镜像与[套接字路径保护](../src/main/codex/codex-daemon-socket-path-guard.test.ts)。路径过长时关闭后台服务自启动的逻辑已由该基线提供。             |
| Cursor         | `cursor/`、`cursor-accounts/`                             | 目录内容一致。额度读取另有 BW 账号归属保护，见 §2.7。                                                                                                                                       |
| Claude Code    | `claude/`、`claude-accounts/`、`claude-usage/`            | 目录内容一致。                                                                                                                                                                              |
| DSH            | `dsh/`                                                    | 实现一致。BW 增加 hooks 包和接入协议的两个测试文件。目录外保留[终端标题识别](../src/shared/agent-status/title/providers/dsh-terminal-title.ts)，避免与 Gemini 状态混淆。启动与续接见 §2.7。 |
| GitHub Copilot | `copilot/`                                                | 目录内容一致。                                                                                                                                                                              |
| OpenCode       | `opencode/`、`opencode2/`、`opencode-usage/`              | 目录内容一致。                                                                                                                                                                              |

升级时用目标标签重新比较这些目录，并沿实际调用链核对共享的启动、账号与额度、会话恢复和宿主路由。按新基线替换本表，保留仍生效的 BW 差异。CLI 版本和登录状态取决于执行宿主，各智能体的实机验证范围见交付 PR。

### 0.5 共享主机与网页批注采用索引

| 模块 / 已合入依据                                                                                                   | 原生采用                                                                           | BW 改造取舍                                                                                                            | 未带入的边界                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 共享主机 · [#592](https://github.com/forcegravity1989/builder-workbench/pull/592) · v251                            | 网络配对/重配、连接和订阅恢复、目录清理、关闭意图、宿主 Agent 配置及实际启动消费者 | 保留批量导入壳、材料草稿/回执、结构化会话关闭和浏览器防回显适配；必要接口适配单列于 PR                                 | 不迁 managed server、WSL 生命周期、process-host 或 Mobile 产品；上游该功能仍为 Beta                                            |
| 网页批注 · [#579](https://github.com/forcegravity1989/builder-workbench/pull/579) · v250，#592 补 v251 导航截图取消 | 原生收起/展开、贴图/截图传递、精简/详情反馈、同文档 fragment 判据                  | 删除 BW #470/#511 独立折叠状态、外部 tray flag、自写图片预览与重复读取；保留必要基线适配、内层滚动定位和跨文档清理规则 | 不代表整个浏览器同步；双人实时互见和共同批注另由 [#576](https://github.com/forcegravity1989/builder-workbench/issues/576) 跟踪 |

以上两行记录专项同步的固定来源。现行桌面基线见 §0.1，升级时按 §2.3 和 §2.7 核对在新版调用链上的 BW 行为。

### 0.6 Orca 模块与本仓采用范围

| 模块               | v1.4.272 采用范围                                                                                                                                                                                                                         | BW 改造与升级时的检查入口                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 桌面框架与公共界面 | 标题栏、菜单、状态栏、设置容器、原生工作区界面                                                                                                                                                                                            | BW 品牌、导航、帮助和引导，固定 → 版本 → 项目布局，知识库与设置挂载。见 §2.3                                               |
| 执行与会话         | Git 工作树、终端进程、Chat、CLI/RPC、任务与自动化的公共链路                                                                                                                                                                               | 材料与固定工作区、版本绑定、计划/验收 Skill 草稿、CodeHub 任务。见 §2.3–2.4。智能体专项目录的源码对照见 §0.4               |
| 远程与共享宿主     | Orca 配对、宿主目录、远端会话与路由                                                                                                                                                                                                       | BW 团队共享、访问控制、访问日志、批量纳入、材料读写落到所属主机。核对本机与已配对宿主的同名项目。见 §0.2、§0.5、§2.3、§2.7 |
| 浏览器与批注       | 原生页面、标签、配置、浏览器同步及批注公共依赖随基线更新                                                                                                                                                                                  | W3 专用配置与退出清理、远程镜像防回显、批注定位及浮动提单交接。见 §2.3、§2.7                                               |
| Bots 及云端能力    | Bot、连接器、跨主机群组的桌面及主进程代码采用固定版，依赖兼容的 Orca 账号和服务。云端按服务核对：v1.4.272 的 `cloud/apps/{connector-wake,relay-edge,relay-ingress}` 与 `cloud/packages/cloud-database` 未迁入。实际部署版本由服务环境核实 | BW 内部登录、集成、遥测及产物分享仍走原产品链路。见 §0.2、§2.1、§2.3                                                       |
| 移动端、资源与工程 | 保留共享配对协议，按桌面依赖采用原生资源及构建组件                                                                                                                                                                                        | Orca Mobile 产品已移除，BW 文档、Skill、打包和验证按仓内规则维护。见 §2.1、§2.2、§2.6                                      |

### 0.7 BW 桌面入口核对

按 Orca v1.4.272 与 #785 的 `e1e7aa3a95b6fc431afcd94c130b04d7d17da589` 源码核对。这里的「可打开」指临时桌面包有可达入口。实际连接、安装、账号和双机结果以对应环境的验收为准。

| 能力                  | BW 桌面入口和条件                                                                                                          | 后续同步取舍                                                                                                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 看板            | 设置 → 实验功能 → Agent Dashboard，开启后使用工作区侧栏入口。看板显示运行中的 Agent 状态                                   | 现有开关即可体验。工作区启动 Agent 的路径见 §0.2。[开关](../src/renderer/src/components/dashboard/settings/AgentDashboardExperimentalSetting.tsx)、[入口](../src/renderer/src/components/sidebar/chrome/SidebarNav.tsx)                                                    |
| 工作区看板与空间检查  | 工作区侧栏底部的看板图标。磁盘占用检查从底部状态栏「资源」里的「空间」打开，资源项受状态栏显示配置控制                     | 两条路径均有原生入口。知识库继续走 BW 最左导航。[看板](../src/renderer/src/components/sidebar/chrome/SidebarToolbar.tsx)、[资源](../src/renderer/src/components/status-bar/resources/ResourceUsageStatusSegment.tsx)                                                       |
| 浮动工作区            | 通过悬浮按钮或快捷键打开，Windows 默认 `Ctrl+Alt+A`。可在设置搜索「浮动工作区」调整按钮位置和使用方式                      | 复用原生全局终端、浏览器及 Markdown 标签页。同步时沿现有浮动入口核对 BW 的批注交接。[主窗口](../src/renderer/src/app-shell/AppWorkspaceShell.tsx)、[快捷键](../src/shared/keybindings/definitions-core-1.ts)                                                               |
| Skills                | 设置 → 分享技能 → 打开技能。桌面主窗口可打开原生 Skills 页。分享与安装链接沿上游服务                                       | BW 通过已有设置入口进入 Skills，并沿项目分发内部完整包。外部发布停用，用户可主动导入原有链接。见 §2.3 的产品入口与服务去向。                                                                                                                                               |
| 插件与浏览器设置      | 设置 → 插件（Alpha）。设置 → 浏览器可以查看本机浏览器配置的密码、CSV 导入与扩展选项                                        | 插件操作取决于来源与权限。密码区仅桌面本机浏览器会话范围显示，扩展选项也要求本机范围。[插件导航](../src/renderer/src/components/settings/navigation/settings-navigation-remote-sections.ts)、[浏览器设置](../src/renderer/src/components/settings/browser/BrowserPane.tsx) |
| Bots 与自动化         | 工作区侧栏的 Bots，最左导航的自动化。Bots 可用性受设置及宿主能力影响                                                       | 本机 Bot 和自动化可从现有入口进入。跨主机群组与云连接器按实际宿主、Orca 账号及服务能力核对。[Bots 侧栏](../src/renderer/src/components/sidebar/index.tsx)、[BW 导航](../src/renderer/src/workbench/WorkbenchRail.tsx)                                                      |
| GitHub Projects       | 原生任务页的 Projects 模式仍在代码中，BW 紧凑任务栏省略该模式，恢复任务状态时回到 Issue/PR 列表                            | 可局部接回模式入口，需同时接通模式恢复，并复验 GitHub 项目权限、BW 版本范围和详情返回。[任务工具栏](../src/renderer/src/components/task-page/ListChrome.tsx)、[模式恢复](../src/renderer/src/components/task-page/use-task-page-resume-restoration.ts)                     |
| 其他原生集成          | BW 集成页列 GitHub、CodeHub、WeLink、CloudBuild。GitLab、Bitbucket、Azure DevOps、Gitea、Linear、Jira 的原生集成卡留在源码 | 单卡展示可定向接回。任务、评审、宿主账号和权限需要按平台验收，GitLab、Linear、Jira 还涉及任务来源入口。[集成页](../src/renderer/src/components/settings/integrations/IntegrationsPane.tsx)、[任务来源](../src/renderer/src/components/task-page/SourceBar.tsx)             |
| Orca 帐户与应用导航栏 | 帐户可从需要登录的 Bot 流程打开。实验设置中的原生 App rail 开关保留，BW 主窗口始终挂载自己的最左导航                       | Orca 帐户选用对应 Bot 的宿主和连接器。恢复整条原生导航会改变 BW 已有面板位置。单个工具入口可接到 BW 导航。[Bot 登录](../src/renderer/src/components/bots/BotHostSignInButton.tsx)、[主窗口](../src/renderer/src/app-shell/AppWorkspaceShell.tsx)                           |

工件云端分享与 Mobile 的取舍见 §2.1。前者同时涉及界面、运行时 RPC 和数据去向，后者涉及独立移动产品及发包。

## 1. 上游身份与 fork 基线

| 项               | 值                                                                       |
| ---------------- | ------------------------------------------------------------------------ |
| Orca GitHub      | `https://github.com/stablyai/orca`                                       |
| BW 仓远程        | `origin` = `https://github.com/forcegravity1989/builder-workbench.git`   |
| BW `origin/main` | 产品主干（原 `bw-orca`）；旧 Rust 路线归档为 `archive/main-pre-orca`     |
| Orca 本地远程    | 建议名 `orca-upstream`；使用前必须核对 URL，不能把 `origin` 当 Orca 上游 |
| fork baseline    | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`（2026-09-15）                 |

执行实际 Orca 同步前，先在独立工作树核对远程身份、当前主干和该模块的固定来源：

```bash
git fetch origin main
git remote get-url orca-upstream
git fetch orca-upstream tag v1.4.272
git rev-parse 'v1.4.272^{commit}'
```

每轮先固定目标 tag/SHA。定向同步按 §0.4–0.5 选择模块及必要依赖。桌面基线升级同时检查执行核、原生桌面组件和 §2.3 的 BW 挂载，核对完成后更新已采用版本。日常 BW 任务不因本篇而检查上游。旧 Rust main 只做定向迁移和重新决策，不整支合并。

## 2. BW 相对 Orca 的稳定边界记录

### 2.1 已删除或迁移的上游内容

- **Orca Mobile 产品已删除**：`mobile/` Expo 客户端、桌面 Mobile 产品页、Mobile 导航和对应 CI 不应在同步时恢复。
- **配对协议能力仍保留**：`src/shared/mobile-relay-*`、`mobile-e2ee-*`、`DeviceScope`、session 镜像、emulator、relay/pairing 等活体协议不等同于 Mobile 产品，不因删除产品页一起删除。
- **产品文档正本已替换**：仓根 `AGENTS.md`、`README.md`、`CONTEXT.md`、`CLAUDE.md` 与 `docs/` 是 BW 正本；上游工程参考进入 `ref/`，不覆盖 BW 产品文档。
- **BW 产物分享沿用自管服务**。浏览器、编辑器、设置与 [CLI](../src/cli/artifacts/artifacts.ts) 通过 `workbench.share.*` 访问 `services/bw-share`。同步时核对 BW 壳的 `artifacts` 槽只承载 BW 项目画布，BW 运行时停用 Orca 云端产物分享 RPC。原生技能分享、终端本地产物及 Bot 文件附件各自沿现行入口。见 [产物分享规格](../docs/05-features/artifact-sharing/spec.md)。
- **上游对外文档站不作为 BW 产品站**：`docs/site/`、README 多语言/营销素材和专项工程笔记不自动恢复；需要时从 Git 历史追溯来源。
- **上报出口统一为 WeLink 群空间**：反馈、崩溃报告、诊断包和用户开启后的产品遥测共用 `src/main/workbench/reporting/` 的 welink-cli onebox 客户端。反馈与诊断保留原生入口、附件降级和确认流程；原 onorca.dev HTTP 上传链及 `ORCA_DIAGNOSTICS_TOKEN_URL` 配置已删除。遥测默认关闭、仅在设置开启，原生 consent、burst cap、validator 与 SDK 队列保留，由 BW bootstrap 注入 posthog-node 自定义 fetch，汇入独立遥测目录。同步时吸收原生管线语义，保留传输注入和默认关闭边界，不恢复 onorca.dev 或 PostHog 网络发送，也不另建上报出口。

### 2.2 目录和挂载边界

| 层级                 | BW 落点                                                                     | 同步取舍                                                                   |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Orca 执行核          | `src/main` runtime、会话与调度、terminal/PTY、worktree、宿主路由与 provider | 复用原生执行能力，按 §2.3 保留 BW 的接口与宿主适配                         |
| Orca 原生桌面组件    | Chat、TaskPage、Automations、终端界面、Explorer/SC/Diff、Bots               | 复用原生组件，按 §2.3 接回 BW 的产品入口与交互                             |
| BW UI 叠层           | `src/renderer/src/workbench/`                                               | 保留 BW 导航和业务板；与原生界面冲突时人工处理                             |
| BW 业务契约与事务    | `src/shared/workbench/`、`src/main/workbench/`                              | 业务落在 BW 自有模块，不塞进 Orca 工作树、连接和调度类                     |
| 宿主适配与运行时组合 | `src/main/workbench/`、原生 RPC/CLI 注册入口                                | 材料由所属本机或配对 runtime 处理。普通 SSH 工作区沿原生通道               |
| 产品分发规范         | `standard/`                                                                 | 是给被管项目的规范正源，不与 `.claude/skills/` 或 Orca 根级 Skill 目录合并 |

实现位置和运行入口的细节见 [SYNC](../src/renderer/src/workbench/SYNC.md)；当前产品能力见 [architecture](../docs/architecture.md)。

### 2.3 需要在同步时保留的稳定扩点

- Windows Workbench 的首次配置在 D 盘存在时预设原生 `workspaceDir`，仅挂在 `loaded-state-parsing.ts` 的无配置、无备份分支；路径正源为 `workbench-product.ts` 的 `WORKBENCH_DEFAULT_WINDOWS_WORKSPACE_DIR`，原生新建项目默认解析器识别该预设并使用兄弟 `projects`，避免工作树嵌入主仓。产品行为见[项目纳入规格](../docs/05-features/project-intake/spec.md#数据归属)。上游同步保留首次加载限定，不改成启动时覆盖已有设置。

每项按用户场景记录 Orca 提供的能力、BW 保留的差异、源码挂载位置和升级时的验收依据。产品规格与验证结果沿原入口查阅。

- **桌面窗口与重复入口**。BW 标题栏用原色 20px 图标，浅色主题下也保留其原色。Windows 三点应用菜单收起原生帮助子菜单，桌面左下帮助提供「关于 BW」和「报告崩溃」。[关于弹窗](../src/main/startup/gpu-recovery/gpu-lifecycle.ts)沿用 BW 产品名，版本显示安装包实际写入的 BW 版本。试用包版本来源见 [BW 发布规格](../docs/05-features/workbench-release/spec.md)。主机状态入口在 BW 左侧导航，底部状态栏只在其他壳显示同一入口。升级时核对[标题栏](../src/renderer/src/app-shell/chrome/TitlebarLeftControls.tsx)、[桌面帮助](../src/renderer/src/components/sidebar/chrome/help-menu-controller.tsx)和[底部状态栏](../src/renderer/src/components/status-bar/StatusBarSurface.tsx)的实际显示位置。

- **升级时选择本机配置**。同一配置的 JSON 与 SQLite 出现分歧时，BW 的[恢复弹窗](../src/main/persistence/profile-state/startup/profile-state-startup-recovery-dialog.ts)默认选中保存时间较新的副本。时间相同或任一时间未知时不标推荐，默认退出。用户仍可选任一副本，归档和恢复沿原生流程。
- **共享主机手动断开**。桌面和 Web 保留用户的断开选择，重启或刷新后仍暂停自动重连。用户主动点连接或重新配对后才解除暂停。升级时核对当前连接状态和保存的重连偏好，Web 侧沿[设置接口](../src/renderer/src/web/preload-api/runtime/web-runtime-environments-api.ts)和[启动恢复](../src/renderer/src/web/web-preload-api.ts)检查。

- **设置作用域**。BW 桌面采用 v1.4.272 的[页头主机选择](../src/renderer/src/components/settings/page/settings-page-renderer.tsx)。有已登记宿主或当前指向远端时，在多数设置页显示。Bots 和 W3 账号页保留各自的作用域。切换宿主时分别核对 Agent、终端和 Git 的读写目标，以及 BW 自有集成与隐私入口。

- **批注交接与任务开工**。BW 批注复用原生 React Grab、浮动终端和草稿投递，改进 Skill 只由本机桌面准备。选中的批注带入浮窗中的未发送草稿，失败时重试同一个会话。GitHub、CodeHub 任务链接继续提供「在任务中打开」，BW 浮窗中的本仓 GitHub Issue 另有「开始修复」，沿原生工作区创建器选中实际宿主并预填草稿。升级时沿 [批注快捷键](../src/renderer/src/hooks/app-commands/use-global-keybindings.ts)、[助手入口](../src/renderer/src/workbench/improvement/open-assistant.ts)和[链接动作](../src/renderer/src/lib/browser/navigation/http-link-destinations.ts)核对。用户路径及证据见 [贡献 BW 规格](../docs/05-features/bw-contribution/spec.md)。

- **左侧导航与工作区侧栏**。BW 壳由 [AppWorkspaceShell](../src/renderer/src/app-shell/AppWorkspaceShell.tsx) 挂载 [WorkbenchRail](../src/renderer/src/workbench/WorkbenchRail.tsx)，保留 BW 图标、导航和主机状态入口。[WorktreeSidebar](../src/renderer/src/app-shell/WorktreeSidebar.tsx) 将 [WorkbenchSidebarNav](../src/renderer/src/workbench/WorkbenchSidebarNav.tsx) 接入原生侧栏。[Sidebar](../src/renderer/src/components/sidebar/index.tsx) 在 BW 壳把原生 Bots 放在工作区块上方，工作区列表模式下工作区块不可折叠。[WorktreeList](../src/renderer/src/components/sidebar/worktree-list/listing/WorktreeList.tsx) 复用原生列表，在已固定之后、项目工作区之前插入 BW 版本区。上游升级时按「Bots → 已固定 → 版本 → 项目」核对顺序，同时确认空主机状态下图标和入口仍可见，以及版本区下的新建、计划和验收入口仍可用。版本行为见 [版本工作区设计](../docs/05-features/version-workspace/design.md)。
- **BW 侧栏筛选与项目移除**。BW 侧栏按宿主和原有工作区条件筛选，项目筛选控件及旧项目筛选值在 BW 壳内停用。项目墙、设置和主工作树的「移除项目」沿所选宿主的登记打开确认，核对宿主、路径和登记身份后只移除该登记。配对同名项目须核对工作树的逻辑宿主。见 [筛选入口](../src/renderer/src/components/sidebar/worktree-list/controls/workspace-options-menu-items.tsx)、[设置入口](../src/renderer/src/components/settings/page/settings-project-section-renderer.tsx)和[主工作树移除](../src/renderer/src/components/sidebar/workspace-actions/deletion/delete-worktree-flow.ts)。
- **BW 的 W3 账户与浏览器会话**。设置提供 W3 登录，GitHub 继续使用现有集成。W3 专用浏览器配置可作为本机普通网页新标签和从本机工作区终端或 Chat 打开的普通链接的默认配置，优先尊重显式选择和已有项目配置。文档预览、配对和 SSH 工作区继续使用各自的原生路由。同步原生浏览器配置、标签创建和持久化时保留专用配置的隔离、公开列表过滤及退出清理。Orca 账户仍承接官方 Bot 的连接器授权。见 [W3 规格](../docs/05-features/w3-account/spec.md)、[浏览器配置解析](../src/renderer/src/store/slices/browser/profiles/browser-new-tab-profile.ts)、[工作区链接入口](../src/renderer/src/lib/browser/workspace/workspace-browser-link-open.ts)和 [W3 宿主入口](../src/main/ipc/w3-account-ipc.ts)。

- **底部帮助与首次设置**。BW 沿用原生首次设置和入门清单。[帮助菜单](../src/renderer/src/components/sidebar/chrome/help-menu-controller.tsx)提供「BW 入门」「探索 BW」，在入门里可重开初始设置（[PR #610](https://github.com/forcegravity1989/builder-workbench/pull/610)）。同步[首次设置向导](../src/renderer/src/components/onboarding/OnboardingFlow.tsx)时，BW 页头使用原色产品图标，对话框无障碍名称、页头名称、欢迎语和各步骤中的产品文案使用 Workbench 品牌。向导的[任务来源步骤](../src/renderer/src/components/onboarding/IntegrationsStep.tsx)提供 GitHub 与 CodeHub，也允许以后在设置的集成页连接或重试。[步骤跳过规则](../src/renderer/src/components/onboarding/onboarding-flow-state.ts)在 BW 要求两个 CLI 均已安装才自动略过该步，Orca 沿原生入口和规则。同步 [SetupGuideModal](../src/renderer/src/components/setup-guide/SetupGuideModal.tsx) 和 feature-wall 时保留 BW 入门清单的连接集成分流：各复用一张 GitHub 和 CodeHub 卡，当前环境任一登录即可完成任务与评审来源设置，WeLink 报告为可选，CloudBuild 在设置页；Orca 继续使用原生分步入口。保留 BW 当前项目的准备脚本目标；BW 入门撤下「启用 Orca CLI」，可见步骤、进度、默认选中与遥测共用七项定义，清单不主动探测 Orca CLI、Skills 和桌面权限。原生 Orca 清单、设置中的 CLI 管理和按需能力配置保留。首次设置完成或跳至项目设置时，无项目的 BW 从项目墙打开原生 `AddRepoDialog`；首次添加弹窗及从空墙重开的弹窗保留注册与刷新，取消或添加成功都留墙，由用户点项目卡进入工作区。常规添加保持原生工作区交接。同步 onboarding 与原生添加链时保留这一分流，见[引导矩阵](../docs/04-design-system/guidance.md)、[项目纳入规格](../docs/05-features/project-intake/spec.md)与 [PR #628](https://github.com/forcegravity1989/builder-workbench/pull/628)。
- W03 构建交付在 BW 探索目录复用 W01/W02 播放器。同步浏览器页工具栏、源代码管理页头、差异打开和 contextual tours 时保留 BW 帮助入口及「在界面中跟做」接线。浏览器引导及其工具栏锚点随当前聚焦的本地页面挂载，已保留的后台页不能取消前台引导；离开当前页面时沿原生机制取消。探索跟做在弹窗关闭后定位可操作的浏览器。源代码管理问号在筛选展开时也可回看，打开差异完成本次引导。引导指向现有控件，样例不改变工作树、GitHub、批注或评审通知协议。见 [探索规格](../docs/05-features/explore-workbench/spec.md#w03-构建交付)。
- 网页批注继承 Orca v1.4.250 的相关模块，保留本基线必要适配与内层滚动标记修复；来源、取舍和验证见 [PR #579](https://github.com/forcegravity1989/builder-workbench/pull/579)。共享主机恢复复核另按上述 v1.4.251 补入导航取消未完成截图及旧快照回写的约束，仍沿用本仓文档失效时清除批注的行为；不因此迁入批注留存改造或远程实时批注。
- `automation.runNow` 的可选 `oneShotPrompt` 和 `automation.run-now-one-shot-prompt.v1` 能力门控。主进程在 `src/main/automations/dispatch/automation-dispatch-request.ts` 准备本轮启动提示，终端与 Chat 共用该入口。已保存的自动化提示继续由原生自动化定义维护。
- 手动「开始计划／验收」在所属工作树准备完整 Skill 包，再通过[原生会话草稿入口](../src/renderer/src/workbench/open-workflow-draft.ts)预填一句带有 `SKILL.md` 路径和版本的请求，由用户发送。普通原生新建与历史恢复沿 Orca 会话链，定时运行沿原生自动化。同步时保留草稿投递和工作树归属校验，见 [会话与执行](../docs/06-module/会话与执行.md)。
- 自动化编辑器的显式 `target/draft` 请求契约；BW 预填入口依赖该原生能力。
- BW 在[任务页入口](../src/renderer/src/components/task-page/TaskPage.tsx)分流 GitHub 与 CodeHub。[GitHub 列表](../src/renderer/src/components/task-page/github/listing/use-task-page-github-list-state.ts)把仓库和来源组合成查询键并写入独立的返回对象，父层保留原始仓库选择键供下次刷新使用。同步后复验同一仓库内刷新列表和切换 Issue/PR。
- 任务详情的 source context、return-to-previous-view 和 worktree history replay；BW 不另建任务详情和历史系统。`openTaskPage({ preselectedRepoId })` 的预选优先级（显式预选 > 持久化 defaultRepoSelection > 全部项目）同为稳定契约：BW 侧栏任务入口靠它在 BW 壳内默认收窄到当前项目，页内筛选仍可改。
- 计划屏 G3 与验收屏 v10 接线依赖的原生扩展点（2026-10-21 起，验收侧 2026-10-22 接入同一批）：① `lookupGitHubWorkItemForSource({ type: 'pr' })` + `openTaskPage({ openGitHubWorkItem })` → 原生 `task-page/Content` 按 `type==='pr'` 落 PullRequestPage，BW 归档卡打开原生 PR 页全靠此链（CodeHub 走 `viewTask(kind:'mr')` + `openCodeHubTask`），上游合并保留 type 参数与 PR 路由；② `openAgentSendPopoverTargetMode`（source union `'diff-notes'|'browser-annotations'`）是 BW 对象级动作与板面批注发送进入 target mode 的入口，BW 沿用 `'browser-annotations'` 不扩 union（埋点归因混入浏览器批注，要区分先交人决策）；**2026-10-22 起弹窗内会话行发送改走 `ReviewNotesSendMenuContent` 自身链（`sendNotesToActiveAgentSession` + QuickLaunch），BW `plan-send-menu.tsx` 合并该原生菜单组件与 target mode——上游合并需同时保 `openAgentSendPopoverTargetMode` 签名与 `ReviewNotesSendMenuContent`/QuickLaunch 的 props 稳定，菜单内部变化会静默破坏两屏的全部对象级注入动作——计划屏的拆解 Issue / 整理纪要 / 板面批注发送，以及验收屏 v10 起经同一包装件递交的部署 / 整理纪要 / 发起归档 / 发布 / 板面批注发送（`plan-send-menu.tsx` 名字带 plan 但已是两屏共用件，`assistant` 参数只改用户可见文案里的 AI 角色名）**；③ 计划和验收的会话折叠/展开都由板面页头提供（验收空态也有入口），经 `PLAN_CHAT_TOGGLE_EVENT` 与壳的 `use-plan-column-resize` 同步；`AppWorkspaceShell` 的 `vc-board-titlebar` 只保留拖拽带，不恢复第二个切换按钮。
- BW 版本绑定与版本准备的原生契约接缝（G2 #383 P1/P2）：`WorktreeMeta.workbenchVersionBinding` 附属字段（undefined 保留 / null 清除）、`worktree.set` 白名单、`mergeWorktree` 投影规范化、runtime capability `workbench.version-binding.v1`（写入与清除双方向门控，无能力对端不下发）；BW 薄 helper `workbench.versionBinding.read/set`（原生身份定位、owner 验证、instanceId 围栏、读回确认才返回）；`workbench.versionWorkspace.prepare`（capability `workbench.version-workspace.v1`：绑定优先复用 → 共用固定工作区准备 → 创建结果核对 → 绑定写入 → 空计划 create-only 初始化）。上游合并须保留白名单、投影规范化与能力双向门控——静默剥掉绑定字段会造成「写入被丢弃」假成功，由读回确认链兜底暴露。本地 IPC `worktrees.updateMeta` handler 语义（H-1 收窄后）：仅 `workbenchVersionBinding` 键显式 undefined=保留（剥除后合并）；其余键沿原生本地 IPC 线约 present-but-undefined=spread 清除（baseRef/pushTarget 两条原生清除链依赖），上游合并不得把该 handler 改回全局剥除或全局清除任一极端。
- BW 固定工作区共用入口 `workbench.fixedWorkspace.ensure`（capability `workbench.fixed-workspace.v1`）：最终 runtime 组合根薄委托到 `main/workbench/fixed-workspace-*`，renderer 与版本准备不各自建树。复用原生 Git 选项、宿主路由、创建/登记/删除能力；本地缺失时探测真实远端并定向 fetch，无覆盖准备精确本地分支后交原生创建，PR/MR 不改变分支身份。旧直连 SSH 材料工作区不在本次迁移范围；配对宿主继续通过原生 runtime 执行这些操作。上游同步须保留 RPC/capability 登记与该薄委托。
- TaskPage 的 BW 入口上下文 `workbenchTaskScope`（#439）：版本入口在同一原生任务页预选可取消的版本标签，沿原生查询与分页；仅目标入口点读完整材料引用后按原生条件过滤分页，缺数据引用保留原因。Issue/PR、预设、仓库和筛选不再隐藏。入口条件不写全局 resume 查询，取消版本同时清目标；详情往返保留当前仍有效的上下文。Issue Start/Open 只有明确引用/绑定证明时带入 BW 创建归属，无证明沿原生。CodeHub 标签沿原生 listTasks 下推，保留每仓 250 条及 hasMore 提示；目标 @me 按条目 repo 查询真实宿主用户。保留 codehub.viewer 的 Repo 校验和原生 owning-runtime 路由，以及 github.repoViewer / gh:repoViewer 的已登记 repo 解析、GHES 与 WSL 选项；身份只在需要时读取，不回落本机全局 viewer。上游合并保留这些薄挂载与 #451 的显式 taskSource 恢复。
- `AppWorkspaceShell` activity 视图的 BW 页面挂载：按 `workbench/project-page-state` 模块态渲染项目墙/接入/名片补录/版本总览（G2 #383 P6 增 version-overview 分支）页面，activeView 切换即清模块态，不扩原生 TopLevelView union；上游合并保留该懒加载分支序列。
- 工作树版本偏好、Git history 的窗口/固定 revision/`committedAt`、GitHub/CodeHub 的真实 `mergedAt` 字段透传。
- 原生创建器的 BW 预填通道（G2 #383 P4）：`ComposerStateInput`/`ComposerModalData` 的可选 `initialNote`（原生备注种子，可见可改；BW 目标开工不再自动传入，也不为它预读计划）、`initialParentWorktreeId`（父级建议种子；选择器与创建期 `resolveWorktreeCreateParent` 校验仍是权威，repo 切换清除旧建议）、`workbenchCreation`（`shared/workbench/creation-context.ts` 的版本/目标/任务来源上下文，提交时按最终仓库+最终任务来源解析为绑定，仓库变更即失效）。绑定写入发生在**真实创建结果处**：创建器统一经 `submitQuick` 把纯可序列化的 `WorktreeCreationRequest.workbenchVersionBinding` 传入后台创建链，重试原样重放，创建成功后调用 BW `workbench/post-create-version-binding.ts`（instanceId 必填围栏、读回确认、失败保留树并提供「重试写绑定」，不重复建树、不阻塞原生激活流）。上游合并保留原生可选字段、请求字段与钻透链（composer-target-store → target-state → identity/source-context state → modal → quick-creation-execution → worktree-creation-flow-execute）及 repo 变更清父级语义；无这些字段的原生调用方行为逐字不变。
- Terminal→TabGroupSplitLayout 链的 `reserveClosedExplorerToggleSpace` 宿主参数（默认 true=Orca 原行为；BW 计划/验收及配置指标双栏传 false，避免右上角预留位吃掉侧栏收起后的宽度）；上游合并时保留传参与默认值。
- WSL/SSH/配对沿用原生宿主身份和执行路由；BW 不新增本机专属连接层。
- 配对会话的编辑器标签沿用镜像来源阻止回声：保留 #388 的分组及兜底发布过滤，按 [Orca #33259](https://github.com/stablyai/orca/pull/33259) 将 `mirroredFromRuntimeSession` 随会话保存并恢复，纳入发布变更判定。未发布的工作树（含配对导航投影）和主进程补建的终端、浏览器或会话快照没有编辑器清单，不能据缺席确认关闭。有编辑器清单的有效快照只会移除已关闭且没有客户端未保存草稿的镜像；保留的草稿仍不回传标签。不能用 `runtimeEnvironmentId` 推断镜像，用户主动打开的远端文件仍可发布。BW 当前无窗口运行时不从会话文件发布编辑器标签。
- 客户端检查、下载与安装复用上游更新链，更新源和提示身份按产品解析（#338）：`src/shared/updater/release-channel.ts` 的仓库常量在 Workbench 构建（`WORKBENCH_SHELL` define / env，renderer bundle 同名 define 在 electron.vite.config.ts）下全部解析为 `forcegravity1989/builder-workbench`——BW 没有 hourly/daily/adhoc 专属仓，四个通道指向同一公开仓、开发通道列表自然为空；`updater-setup` / `updater-release-feed` / `updater-prerelease-feed` 的 feed 与 atom 源均从 `MAIN_RELEASE_REPO` 派生。BW 侧曾对 Workbench 禁用整条更新链（检查/下载/安装弹「手动更新」），已按上游原形恢复；上游同步时保留该产品感知间接层，不恢复 stablyai 硬编码 URL，也不再引入 Workbench 禁用分支。Workbench 不请求 Orca 官网的推广配置与更新介绍，也不启动推广轮询；更新卡使用原生简版和本仓 GitHub Release 说明链接，提示中的产品名与发布源使用同一身份。后台每日检查、唤醒/聚焦补查与用户选择下载、重启的原生行为保持。Windows Workbench 发布更新以本地 generic feed 薄适配 GitHub 发布包的整包断点续传（#421），暂禁用该路径差分下载；校验和安装仍归原生更新器，取舍与恢复规则见 [客户端更新](../docs/06-module/客户端更新.md)。BW Windows 包未签名：出包必须走省略 publisherName 的未签名通道并注入产品版本号（账本三处一致门禁在 `release-win-workbench.mjs`）。
- **退出安装前的会话保护（#798）**。同步时在[更新卡](../src/renderer/src/components/maintenance/update-card/UpdateCard.tsx)、[preload 更新桥接](../src/preload/api/updater/updater-bridge.ts)、[重启接线](../src/preload/renderer/restart/renderer-restart-wiring.ts)、[退出保存](../src/renderer/src/app-shell/updates/updater-beforeunload.ts)与[主进程安装入口](../src/main/updater/lifecycle/updater-install-execution.ts)核对正常安装和显式放弃保存两个入口。复验用含此逻辑的已安装 Windows BW 和可用的更高版本更新包，保留可辨认的测试会话，走应用内下载、重启更新。在可控的保存失败场景确认旧版仍可打开；恢复保存条件后点「重试并重启更新」，确认旧错误清除、重新保存、安装后版本正确且会话恢复。另用可丢弃的测试会话复现失败，检查风险提示并点「强制重启升级」，确认可跳过本次保存完成安装。完整行为见[客户端更新](../docs/06-module/客户端更新.md)；上述安装包路径是复验方法，本次 CI 记录未覆盖该实机旅程。
- 原生 provider 标签和身份抽取保持单一实现；不要把已经去重的实现合回来。
- 原生内置浏览器对普通 HTTPS 域名的 `ERR_CERT_AUTHORITY_INVALID` 也提供现有“仍然继续”入口（`browser-certificate-trust-controller.ts`），不恢复 localhost／回环地址限制。默认仍拒绝；沿用原生 renderer 按钮与 agent RPC `browser.certificate.proceed` 两条显式继续入口（RPC 不另设人工确认）。授权是会话级例外（Chrome SSL exception 语义）：同一应用会话内按端点＋叶子证书指纹放行全部标签页，跨域提交（如 SSO 往返）不吊销；不落盘，重启应用或端点换叶子证书都要重新确认，且换证书时拒绝并不再提供“继续”入口（fail closed）。其他证书错误、子帧与非 HTTPS 首次请求不扩大授权。上游同步时保留这项入口范围与会话级信任语义。
- BW Skill 分发登记保持一致：`resources/skills/current-manifest.json` 与 `snapshot-registry.json` 必须继续登记 `bw-knowledge-docs`、`metrics-refresh`、`version-acceptance`、`week-planning`。manifest/registry 由 `config/scripts/generate-skill-bundle-manifest.mjs` 从根级 `skills/` 生成；三个产品流程的正文正源仍是 `standard/skills/`，运行时指南由 `config/scripts/generate-bundled-skill-guides.mjs` 生成，不手改生成物。
- 跨主机项目墙（G3）依赖原生 runtime 配对链：BW「导入 Builder 主机」批量壳只调用 `runtimeEnvironments.verifyAndAddFromPairingCode`（与原生 AddRemoteHostDialog 同一 IPC）与环境列表/状态快照，不建平行配对存储。同主机公钥经验证后原位更新凭据并保留 id、名称与历史；名称按原生去空白、外层引号及大小写归一后检测冲突，不按名称跳过重新配对。上游合并需保留该链的 renderer API。
- 共享链接回显沿原生 `DeviceRegistry` 和 E2EE 身份：renderer 仅持久化公开引用，`mobile:restoreRuntimePairingUrl` 只读恢复同一链接，不创建/轮换授权，不改变监听范围；撤销或身份不匹配不恢复。同步时保留这条回显链，不能用生成接口替代读取。
- 共享会话快照保留 BW 浏览器防回显适配：文档浏览器页及活动页（缺失时取首页）已指向其他 runtime 的浏览器工作区，不回发成宿主自己的页面；客户端托管页仍由所属 runtime 的页面注册表发布。这是 BW 自有适配，不计为 Orca v1.4.251 原生同步。
- runtime 新主机配对生成随机 env id；已验证同公钥重配保留原 id，删除后再次添加仍生成新 id。runtime 主机仓不落本地盘，注册行身份为 (repoId, executionHostId)。原生 catalog 按请求快照清理被移除仓库的工作树行，保留其他宿主及并发新增行；BW 项目墙仍只认当前配对目录内的行并按稳定身份归并，不能把删除后的旧 env id 当作持久主机身份。
- 手动断开持久化（BW #554，2026-11-18，与上游语义有意分叉）：上游手动断开是会话级（重启后自动重连），其 `reconnectOnLaunch` 持久开关只覆盖 SSH 主机（v1.4.242 起）；BW 把同一字段扩展到配对码直连主机——`KnownRuntimeEnvironmentSchema.reconnectOnLaunch?: boolean`（undefined=启动重连，false=保持断开），手动 Disconnect 落盘 false，显式 Connect / 重新配对清除字段，主进程在 `registerRuntimeEnvironmentConnectivityHandlers` 顶部先 `hydrateRuntimeEnvironmentManualDisconnects` 再进启动激活循环，Web 端对 localStorage 单服务器记录做同语义。上游同步须保留：字段可选性（旧记录无字段=旧行为）、水合先于任何探测/激活的顺序、只有显式 Connect 解除持有的门禁语义。降级到旧构建会因 zod 剥除未知字段退回自动重连，属已接受取舍。
- 设置→集成页按 BW #323 收敛为 GitHub / CodeHub / WeLink / CloudBuild 四卡（代码托管 / 报告与诊断 / 构建三组；CloudBuild 为 #366 增补，2026-10-19）：六张隐藏卡的组件、状态推导与词条保留在仓（人拍板 2026-10-16），但 `IntegrationsPane` 渲染名单与 `integrations-search` 目录是 BW 口径；preflight 增加 `welink-cli` / `cb` 探测与 codehub / welink / cb 的 `auth status` 读回（`PreflightStatus.welink` / `cloudbuild`、`codehub.authenticated`），welink 读回把 EXPIRED 判未登录（人拍板 2026-10-16，BW 口径），cb 存活探测用 `version` 子命令（`--version` 是未知旗标）、登录判定按输出标记（`Token Expires` 行且不带 `(expired)` 后缀，退出码恒 0 不可信，BW 口径照 welink EXPIRED 拍板），探测经 `command-path-resolver.ts` 的 `resolveCommandOnLocalPath` 解析真实文件、`.cmd` / `.bat` 经 `cmd.exe` 执行（`preflight-command-exec.ts`，修 npm 全局 CLI 装完仍报未安装的 Windows 盲区，BW 口径）。各卡登录按钮在卡内展开上游 `OnboardingInlineCommandTerminal` 内嵌终端（粘贴命令不回车、人按回车，OSC 133;D 感知命令结束自动复查；2026-10-19 人拍板，远端范围不给按钮）；该上游组件内 `TerminalPane` 改传 `isVisible={entered}`（BW 口径，2026-10-19 真壳白屏修复：组件在 0fr 展开动画容器内挂载终端，恒真 isVisible 使 WebGL 渲染器在无盒状态下解析 PTY 输出、展开时模型 diff 跳过预展开单元格导致画布空白；改随 `entered` 挂起渲染、动画完成翻可见走 TerminalPane 既有的 reveal-repaint 链从缓冲重绘，上游合并保留该传参）；codehub / welink 安装由应用后台执行各自自包含 npm 命令（含内网 registry 与 `--strict-ssl=false`，人确认 2026-10-16，不动机器 npm 配置，不占会话栏），cloudbuild 为**两步**（`npm config set @hw-cloudbuild:registry <内网源>` → `npm install -g @hw-cloudbuild/cloudbuild-cli`，人指定 2026-10-19，会写机器 npm 配置、不带 `--strict-ssl=false`，runner 按序执行、任一步失败即中止）；gh 安装保持外链。CodeHub / WeLink / CloudBuild 卡片共用一个 `BwCliIntegrationCard` 骨架（每卡为文案 / 探测字段 / 登录命令的薄配置），与本机范围判定因上游文件 max-lines 预算拆入 BW 自有新文件（`bw-cli-integration-cards.tsx`、`use-local-cli-scope.ts`，经 barrel 导出），codehub / welink / cloudbuild auth 读回与 BW 三 CLI 探测编排（`probeBwClis` / `readBwCliAuths`，回调注入探测函数避免循环依赖）在 `bw-cli-auth-status.ts`、安装链路（`bw-cli-install-commands.ts`、`bw-cli-install.ts`、preload `bw-cli-install-api.ts` / `cli-install-bridge.ts`、渲染端 `cli-install-action.ts`）同为 BW 自有文件（主进程模块由 agent-detection / register-core-handlers 直接引入，不经 renderer barrel）。上游合并保留该渲染名单、探测字段与 shim 路由、登录内嵌终端分支与 welink EXPIRED / cb 过期标记语义，不恢复六卡渲染，也不把 BW 卡合回上游卡模块。
- BW 板面批注快捷键 `workbench.toggleAnnotationMode`（#444，2026-10-29）：注册表 seam 是 `shared/keybindings/types.ts` 的 `KeybindingScope` 新值 `'workbench'` 与 `KeybindingActionId` 新成员，加 `definitions-core-2.ts` 一条定义（默认 Alt+A、`conflictGroup: 'global'`）；渲染层零 native 改动——监听器为板面本地安装（仿 `editor.addReviewNote` 先例，入口不可用即不挂载），不进 `createAppCommandHandlers` Map、不进 `use-global-keybindings`、不进主进程 webview 白名单。上游合并保留这两个 union 扩点与定义条目即可，BW 计划/验收两板的快捷键随定义存在而存在。

- **探索 BW 与屏内引导**。探索目录（[#634](https://github.com/forcegravity1989/builder-workbench/issues/634)）从底部帮助进入原生 [FeatureWallModal](../src/renderer/src/components/feature-wall/FeatureWallModal.tsx)，按 BW 壳条件接入 [探索目录](../src/renderer/src/workbench/explore/bw-explore-catalog.ts)。同步 feature-wall 时保留该条件入口及 `FeatureWallTourSurface` 的已有演示直选、`FeatureWallTourPanel` 的内容复用点。目录、状态与 W01 局部动画在 BW 侧。动画重用 BW 的项目墙卡、名片字段和里程碑界面，使用内存样例；W02 与 W01 共用探索播放器，计划与任务片段使用隔离样例。W04 复用同一播放器及验收控件，样例回调不触发真实会话或归档。W05 复用同一播放器与记分牌读数控件，以隔离样例呈现效果和后续计划。记分牌操作引导由记分牌标题栏可见性门控，手动重播沿总览帮助菜单定位记分牌，保持在 BW 层。原有 Orca 演示、配置卡与访问记录沿用现有机制。任务页 BW 壳复用原生 tasks 引导并提供就地重播。同步 [屏内引导](../src/shared/feature-education/contextual-tours/workbench-contextual-tours.ts)时保留 BW 项目墙、项目总览、里程碑、版本计划、版本侧栏、版本验收、版本总览和记分牌的 ID、目标及退出后记录策略（`markSeenOn`），其他 Orca 引导沿现有首次可见后记录。同步原生 `ContextualTourOverlaySurface` 时保留退出按钮的 `data-contextual-tour-skip`，Escape 通过该属性触发原生退出，避免依赖本地化的无障碍名称；已打开的原生菜单、选择器及其他浮层优先接收 Escape。
- 状态栏「常用链接」入口（#650，2026-11-13）：BW 在 `StatusBarSurface` 的 `PortsStatusSegment` 旁最小挂载自有 `QuickLinksStatusSegment`（`src/renderer/src/workbench/quick-links/`），并登记 `StatusBarItem` 新项 `'quick-links'`（`shared/ui-chrome/ui-chrome-types.ts` 与 RPC `client-ui/client-ui-params.ts` 枚举、`shared/status-bar/status-bar-defaults.ts` 默认项、`use-status-bar-controller.ts` 的 `showQuickLinks`、`StatusBarVisibilityMenu` 开关、profile 加载的一次性 flag `_quickLinksStatusBarDefaultAdded`（`main/persistence/loading-store/profile-loading/loaded-state-parsing.ts`）、`feature-interaction-catalog` 的 `quick-links`）。上游合并须保留该挂载位与枚举项，否则入口被静默丢弃；组件本体在 BW 自有目录，持久化走既有 `window.api.fs` 读写项目 `.bw/quick-links.json`，不改 Orca 端口/服务链。

- BW 诊断上传继续由 `main/telemetry/client.ts` 的 transport 挂载到 `main/workbench/reporting/welink-telemetry-sink.ts`，不能随原生 PostHog SDK 升级回到 Orca 服务。接收 SDK 的 string、Blob 和 Uint8Array 请求体，共用现有压缩批次与退出排空协议；WeLink CLI 执行保留所选宿主的 WSL 环境和超时设置。
- 工作区无法定位时，BW 保留原生 `selector_not_found` 错误契约，并由 `main/runtime/workspaces/worktree-selector-diagnostics.ts` 记录已有仓库、宿主、元数据和本机路径证据。只有唯一的本机 owner、所属元数据缺失且本机目录不存在时，才向 BW 材料入口附带 `worktreeGoneEvidence`；远端或证据不足不得判断已删除。诊断失败不改变原错误。

相关行为正本分别在 `docs/05-features/`、`docs/architecture.md` 和源码契约中；本篇只保留同步时必须知道的取舍。

- **设置、帮助与宿主帐户入口**。BW 的设置和帮助集中在最左侧导航，工作区列表底部保留定位当前工作区与工作区看板。宿主选择用于按主机生效的原生设置。BW 日常设置显示 W3 帐户，从 Bot 等原生入口明确进入时可打开 Orca 帐户。检查 [工作区工具栏](../src/renderer/src/components/sidebar/chrome/SidebarToolbar.tsx) 和 [设置导航](../src/renderer/src/components/settings/navigation/use-settings-navigation-model.ts)，在本机及配对宿主之间切换后核对左侧菜单。

- **工作树右键的版本绑定与发送评审**。原生工作树和版本区的工作树共用 [右键菜单](../src/renderer/src/components/sidebar/workspace-actions/context-menu/WorktreeContextMenuView.tsx)，单选时挂载 BW 的绑定、更改、解除和发送评审。绑定通过 [版本绑定接口](../src/renderer/src/workbench/version-binding-port.ts) 读写工作树归属宿主，发送评审根据 [所选工作树](../src/renderer/src/workbench/WorkbenchSendReviewMenuItems.tsx) 解析宿主和代码托管来源。升级时用本机及配对宿主上有版本绑定的工作树核对菜单、读回和评审预填。

- **工作树悬停操作与选中状态**。BW 工作树卡片在 [默认卡片模板](../src/renderer/src/components/sidebar/workspace-card/template/default-workspace-card.json) 中接入固定、休眠和删除快捷操作，沿用既有可见条件、工作树身份和确认流程。核对普通工作树、主工作树及配对宿主上的同名工作树。打开 BW 工件整页时，[工作区列表](../src/renderer/src/components/sidebar/worktree-list/listing/WorktreeList.tsx) 清除旧工作树卡片的高亮。

- **知识库与存储检查**。BW 最左导航的[知识库入口](../src/renderer/src/workbench/project-page-state.ts)在主窗口打开 BW 文档树及正文，并保留当前项目来源。Orca 的「空间（测试版）」从[状态栏资源面板](../src/renderer/src/components/status-bar/resources/ResourceUsageStatusSegment.tsx)打开，用于检查工作区磁盘占用。升级时核对[打开动作](../src/renderer/src/store/slices/ui/ui-slice-view-actions.ts)的窗口目标、知识库返回路径和项目数据来源。

#### BW 产品入口与服务去向

同步时按用户入口和实际接收方核对。上游移动入口或变更默认值、旧档迁移、宿主登录、数据类别、服务地址、延迟刷新及恢复条件时，重走相关行。实现及验证提交见关联 [#627](https://github.com/forcegravity1989/builder-workbench/issues/627) 的交付 PR。

| 用户旅程                   | Orca 机制与 BW 采用方式                                                                                                                                                                                                                                                                                                                                                                                                                              | 同步挂载点与最短复验                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 星标与支持                 | Orca 在通用设置、空工作区、首次设置完成和智能体启动阈值触发查星；点击可由宿主的 GitHub CLI 写入 \`stablyai/orca\`。BW 停用星标入口、后台订阅和专用 IPC，GitHub/CodeHub 项目照常使用。                                                                                                                                                                                                                                                                | [桌面服务装配](../src/main/core-desktop/desktop-core-composition.ts)、[GitHub IPC](../src/main/ipc/source-control/github-account-handlers.ts)、[通用设置](../src/renderer/src/components/settings/general/GeneralPane.tsx)、[空工作区](../src/renderer/src/components/onboarding/landing/Landing.tsx)、[首次设置](../src/renderer/src/components/onboarding/use-onboarding-flow-persistence.ts)。打开两处页面、完成首设、重启旧档并跨过阈值，记录宿主查星和写星调用；另验项目登录、读任务及打开仓库。 |
| 插件市场与撤销             | BW 沿 Orca 官方、社区市场和撤销清单。原生默认启用，未完成该次迁移的旧关闭档可能被置开。安装兼容性按宿主能力和插件声明判断。                                                                                                                                                                                                                                                                                                                          | [插件启动、定时与设置监听](../src/main/startup/plugin-startup/main-process-plugins.ts)、[默认启用迁移](../src/main/persistence/applying-settings/default-on-migration-guards.ts)、[安装验证](../src/main/plugins/installation/plugin-install-staging.ts)。打包版验新装、旧档、显式关闭后重开、手动与定时刷新、插件加载和撤销。                                                                                                                                                                        |
| 日常账号、Bot 与连接器     | 日常使用 W3、项目来源沿 CodeHub/GitHub。本机 Bot 复用 Orca 执行核。BW 仅从明确的原生云路径提供 Orca 账号入口，停用启动时面向通用用户的 Orca 重新登录提醒。已有外部连接依托 Bot 宿主的 Orca 账号；有连接需求或待发回执时可在重启后向默认的 `connector.orca.dev` 恢复发送主机与 Bot 元数据、回执或回复，退出会停止发送并清理对应待发回执。内部 Bot、会议助手和连接器由 [#808](https://github.com/forcegravity1989/builder-workbench/issues/808) 承接。 | [账号导航](../src/renderer/src/components/settings/navigation/settings-navigation-capability-sections.ts)、[连接启动](../src/main/startup/cloud-startup/main-process-connector-startup.ts)、[连接恢复和回执](../src/main/connector-cloud/connector-cloud.ts)。核对无外部账号的本机路径、切换宿主，及有旧连接和回执时的重启、断线恢复与退出。                                                                                                                                                          |
| 存量 Orca 团队账号         | 仍沿原生团队策略刷新。有旧会话时按账号状态启动，成员或受管设备首次约 15 秒后刷新，受管设备后续约 15 分钟，个人或普通成员后续约 60 分钟。请求到 `login.onorca.dev/v1/desktop/auth/capabilities`。组织已授权设备报告时，另发同一地址的请求，通过请求头发送主机名、系统/架构、版本/渠道、更新状态及适用的必需插件安装失败。此链按 Orca 团队权限运行，和 BW 产品遥测开关各自生效。                                                                       | [定时刷新](../src/main/orca-profiles/cloud-auth/team-policy-refresh.ts)、[能力刷新](../src/main/orca-profiles/cloud-auth/profile-cloud-capability-refresh.ts)、[独立报告请求](../src/main/orca-profiles/cloud-auth/profile-cloud-client.ts)、[设备数据](../src/main/orca-profiles/cloud-auth/desktop-client-report.ts)。用隔离旧账号对照团队授权有无，在 BW 遥测关闭且无 Bot 活动时记录请求路径与请求头类别。                                                                                         |
| 反馈、崩溃与诊断           | BW 桌面的帮助、终端错误和不支持的 GitHub 项目视图复用同一反馈弹窗；配对浏览器提示到桌面发送。用户提交反馈、崩溃与诊断时，经执行宿主的 WeLink CLI 进入「Workbench 上报」。                                                                                                                                                                                                                                                                            | [反馈 IPC](../src/main/ipc/feedback/feedback.ts)、[提交与附件降级](../src/main/workbench/reporting/report-submission.ts)。在报告发出前核对接收方，再用可控接收端验证 CLI 不可用、附件失败、报告失败与重试。                                                                                                                                                                                                                                                                                           |
| 产品遥测                   | BW 默认关闭，隐私页主动开启后经 WeLink CLI 到「Workbench 遥测」。未做默认值迁移的旧档先置为关，显式选择跨重启保留。                                                                                                                                                                                                                                                                                                                                  | [启动迁移与传输](../src/main/workbench/reporting/telemetry-bootstrap.ts)、[遥测客户端](../src/main/telemetry/client.ts)。验新装、旧档、主动开启、退出排空与重启的接收方。                                                                                                                                                                                                                                                                                                                             |
| 应用更新、帮助和智能体 CLI | 应用更新沿 BW Releases，帮助主菜单及旧 macOS 硬件不支持升级时的求助入口走 BW，Orca 公告停用。BW 的智能体模型兼容提示读随包表，常规 Agent CLI 版本检测使用各自发行源。                                                                                                                                                                                                                                                                                | [BW 更新源](../src/main/updater/workbench-update-feed.ts)、[帮助链接](../src/renderer/src/workbench/help-links.ts)、[公告门控](../src/main/updater/nudges/updater-nudge.ts)、[模型兼容表](../src/main/agent-cli-update/agent-cli-model-requirements.ts)。启动、聚焦及手动更新核对发布源，用有可升级 CLI 的宿主检查模型提示与请求。                                                                                                                                                                    |
| 产物、Bot 和 Skill 分享    | BW 产物由 \`workbench.share.*\` 发送到自管 \`bw-share\`。BW 停用向 Orca 云发布 Bot/Skill 包。原有链接只在用户主动打开或进入设置的共享链接管理时访问，保留导入和撤回。内部 Skill 按 [BW 完整包分发](../standard/README.md)。                                                                                                                                                                                                                          | [BW 产物 RPC](../src/main/runtime/rpc/methods/workbench-share.ts)、[Bot 分享 RPC](../src/main/runtime/rpc/methods/bots-share.ts)、[Skill 共享处理](../src/main/ipc/skills/skill-cloud-ipc-handlers.ts)、[共享链接管理](../src/renderer/src/components/settings/bots/SharedLinksSettingsPane.tsx)。验 BW 产物发布、打开和撤销，核对 Bot/Skill 发布禁用、普通页面无旧链列表请求，再试旧链接导入和撤回。                                                                                                 |
| 共享主机与移动             | 同事电脑继续用 \`orca://\` 配对和既有访问等级。BW 桌面、Electron serve 和显式以 BW 产品标志构建的独立宿主停用 Orca 手机专用的云 Relay 和移动 Push；独立安装的 Orca 宿主沿自己的产品设置。                                                                                                                                                                                                                                                            | [移动 Relay](../src/main/startup/cloud-startup/main-process-relay-startup.ts)、[移动 Push](../src/main/startup/cloud-startup/main-process-push-startup.ts)、[后端 Relay](../src/main/orcad/orcad-relay.ts)、[独立宿主构建](../config/scripts/orcad-distribution/server-bundle/orcad-entry-build.mjs)。双机验配对、只读／完全访问、项目和终端；用隔离旧移动配置验启动、重启与唤醒。                                                                                                                    |

### 2.4 CodeHub 边界

CodeHub 任务由独立页面和服务处理，使用 `codehub:*` RPC。BW 从已选项目推断 CodeHub 来源，同时保留版本范围及详情入口传入的明确任务来源。同步时从 [任务入口](../src/renderer/src/components/task-page/TaskPage.tsx)分别核对普通项目、版本任务和详情链接，再核对 CodeHub 的列表、筛选、详情、新建及项目切换。详细行为见 [CodeHub 特性](../docs/05-features/codehub/STATUS.md) 与 [CodeHub 指南](../docs/03-guide/codehub-cli.md)。

BW 任务屏沿 [任务工具栏](../src/renderer/src/components/task-page/ListChrome.tsx)使用紧凑筛选、帮助和范围入口，GitHub Issue 列表的标签列可直接编辑。升级时检查头部结构、Issue 与 PR 切换、表头与数据行对齐，以及 CodeHub 筛选行上的帮助入口。

### 2.5 从旧 Rust main 吸收的内容

- `standard/` 的系统提示词、references、skills 和模板已作为内容目录合入；旧 Rust `crates/bw` 的集中注入器和旧周一屏脚本不复刻。
- 旧 Rust 旅程、ADR、release/出包入口和历史绿灯不作为当前 Electron 行为证据。

### 2.6 CI / E2E 边界（2026-10-13 隔离）

- Windows 安装包采用 Orca v1.4.272 的 Rust CLI 与管理员重启启动器。BW 编译产物和缓存按产品保持独立，并保留包内 `resources/bin/orca.exe` 命令名。同步时按 [Windows 构建说明](../src/renderer/src/workbench/SYNC.md#品牌与开关)核对打包输入与安装后 CLI，确认它启动同包的 `Workbench.exe`。

- 旧 Orca CI/E2E 源保留在仓内不删：旧 workflow、`tests/e2e/` 用例与 helper、`config/scripts/` runner 与契约测试、`tests/tools/` 下 Windows 更新/崩溃 E2E 工具，便于对照 upstream 和后续按需迁移；它们不属于 Workbench 当前流水线的测试集合，冻结为归档源，不随本仓 pr.yml 演进更新（旧契约测试断言的是旧 workflow 结构，属历史身份）。
- 29 个旧 workflow（含 `release-ref-validation.yml`、`track-community-prs.yaml`、`issue-os-labeler.yaml`；`skill-update-roundtrip.yml` 为 2026-10-14 补充降级，见下条）摘除 `pull_request` / `push` / `schedule` / `workflow_call` / `pull_request_target` / `issues` 自动触发，只留 `workflow_dispatch`。注意：`workflow_dispatch.inputs`、`env`、`permissions`、`concurrency` 已随自动触发一并精简，**手动入口不保证可运行**——它们是归档占位，不是维护好的手动链；恢复任何一条旧链必须单独评审其触发器、额度和对 Workbench 的实际价值。
- [Cloud Verify](../.github/workflows/cloud-verify.yml) 对 PR 和推送到 main 的变更按路径触发，匹配 `cloud/**`、`.github/workflows/cloud-*.yml`、`.github/actions/cloud-sql-rollout-lease/**` 中任一项即可。#785 的 PR 差异包含 `cloud/packages/connector-contract/**`，因此在常规 6 项外运行 Secret scan、build、test、terraform。工作流执行扫描、构建与类型检查、测试和 Terraform 静态验证，部署状态需从对应环境单独核实。
- 其他 legacy workflow 中，`docs.yml` 按 `docs/site/**` 路径触发；job 级门控空转的 `readme-downloads-badge` / `cloud-monitor-relay-clock-skew` / `cloud-power-relay-staging`（schedule，job 被 `github.repository == 'stablyai/orca'` 或 `vars.ORCA_CLOUD_OPERATIONS_ENABLED` 门控）、`cloud-recover-relay-staging-c4-image` / `cloud-requeue-relay-staging-c4-recovery`（`workflow_run`，同一 vars 门控）、`release-policy.yml`（release 事件，`stablyai/orca` 门控）。**补充（2026-10-14，PR #353）**：`skill-update-roundtrip.yml` 原列本条（假设 paths 命不中），但触及 `resources/skills/**` 的 PR 即触发且**结构性必红**——`verify-skill-update-roundtrip.mjs` 的 historicalRelease/seedPlacement 需物化 release-mapping 命名的 Orca v1.4.x release tag，本 fork 只有 `v0.4.0` 与三个 `v0.5.0-rc.*`（#352、#353 与 main push 09076a6e 各 13 检查全红实证）。经人拍板降级为 dispatch-only（第 29 个），矩阵收窄为 windows-latest（BW 只发 Windows 安装包，macOS/ubuntu 场景不需要），守护契约测试 `skill-update-roundtrip-workflow.test.mjs` 同步改写为钉住隔离状态与 Windows-only 矩阵。
- Workbench PR 门禁正源为 `.github/workflows/pr.yml`：通用 lint / typecheck / 定向 vitest / build:desktop、共享主机协议与生命周期、网页批注契约、Windows Codex 协议与生命周期，以及 Workbench PR E2E；DSH/Cursor 的相关协议也在通用任务中执行。本仓独立检视执行[开发规范](../docs/development.md#独立检视)。pr.yml 不用 `paths` 过滤，避免文档 PR 无检查上报；选中的原生用例是现行门禁，不能因其他旧 workflow 归档而一概视为冻结。CI 不替代真实账号与双机验收。
- Orca v1.4.272 已包含上游测试精简（`2cffdeda72`）。Workbench 保留自己的测试门禁与 Electron 白名单。已有测试按当前路径选择，原生部分只选择对应的共享依赖和 Bot 场景，不以整个目录补齐被上游删除的用例。
- `tests/playwright.config.ts` 只读取 `tests/e2e/workbench-allowlist.ts` 的 PR 白名单；完整 Workbench 验收使用 `tests/playwright.workbench-explicit.config.ts`，版本总览使用 `tests/playwright.overview.config.ts`；`config/vitest.config.ts` 只 include `src/**/*.test.ts(x)`。Workbench 壳是构建期烘焙（`isWorkbenchShell()` 读 `import.meta.env.VITE_WORKBENCH_SHELL`），所以 `tests/e2e/global-setup.ts` 在 `electron-vite build --mode e2e` 的子进程 env 里固定注入 `WORKBENCH_SHELL=1 VITE_WORKBENCH_SHELL=1 ORCA_PRODUCT_NAME=Workbench`——单一来源，Windows cmd、POSIX shell 与 CI 一致（不复用 `dev:workbench`——它注入的是 dev 进程 env，与这里的构建子进程 env 不是同一条路径；该入口 2026-10-22 前还是 POSIX env 前缀写法，在 Windows cmd 下不成立，见 Issue #404，现已改为 runner 的 `--workbench` 开关）。
- `config/reliability-gates.jsonc` 只登记仍属当前 Workbench 检查范围的 gate（121→63）；`release-cut.yml` 不保留旧 E2E 发布证据 job。lint 与 reliability-gates 链暂保留在 verify 内，待 Workbench 专属质量门禁定义后再替换，避免在没有等价门禁时静默削弱检查。
- 新链 helper 与保留源的配对关系（副本，不是共享；改保留源不会传导过来，需自觉防漂移）：`tests/e2e/helpers/workbench-app.ts` ↔ `orca-app.ts`；`tests/e2e/helpers/workbench-test-repo.ts` ↔ `seeded-test-repo.ts`。种子仓的持久化文件名与产品无关（`orca-data.json`，见 `src/main/persistence/loading-store/user-data-path.ts`）。
- 本次隔离不表示 Orca runtime 源码已删除；保留的历史源文件也不表示它们仍属于当前交付门禁。

### 2.7 同步差异与看护

下表记录当前同步模块中的差异及既有看护。协议用例不覆盖完整真人体验；实际验证结果和未验项只记入交付 PR。

| 用户场景                                              | 归类与当前取舍                                                                                   | 源码落点                                                                                                                                                                                | 现有看护及边界                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSH 恢复到原会话和 backend，安装 hooks 不覆盖用户配置 | 原生接入及基线适配；保留启动 backend 参数、标题身份优先级、session ID 前提和托管配置边界         | [启动](../src/shared/agent-status/process/dsh-launch-command.ts)、[配置补丁](../src/main/dsh/dsh-home-patch.ts)                                                                         | [DSH 协议](../src/main/dsh/dsh-integration.test.ts)：backend、标题身份、hook ID、用户配置保留                                                                                            |
| Cursor 切号或登出后不显示上一个账号的额度             | BW 保留的账号归属保护，和原生额度映射一起维护                                                    | [账号策略](../src/main/rate-limits/cursor-usage-account-policy.ts)                                                                                                                      | [切号/登出用例](../src/main/rate-limits/service-cursor-usage.test.ts)                                                                                                                    |
| Codex 进程退出时不丢最后一段回复，也不无限等待        | 原生排空 helper 接入新版进程生命周期                                                             | [排空](../src/main/provider-process/provider-exit-output-drain.ts)、[连接 owner](../src/main/codex/app-server/codex-app-server-connection.ts)                                           | 原旧路径的退出用例已随上游拆分；Windows Codex 门禁覆盖当前生命周期，末尾回复的真人验收仍须单列                                                                                           |
| 共享目录刷新过程中新增项目，不被旧响应抹掉            | 原生目录清理及必要并发适配；旧注册仍清理、请求后新增项保留                                       | [目录合并](../src/renderer/src/store/repos/repo-catalog-merge.ts)                                                                                                                       | [仓库/工作树保留用例](../src/renderer/src/store/repos/dropped-repo-worktree-rows.test.ts)                                                                                                |
| 看同事的托管网页，镜像页不再回发成自己的页面          | 新版按客户端类型投影：保留页面所属 runtime，向 runtime 客户端剔除镜像页，手机代理仍可查看        | [页面归属](../src/renderer/src/runtime/sync-runtime-graph/mobile-session-browser-tabs.ts)、[宿主投影](../src/main/runtime/rpc/methods/session-tabs/session-tab-file-host-projection.ts) | 旧发布端过滤用例不再对应现行链；双机防回显须沿新版投影验收                                                                                                                               |
| 网页内层容器滚动后，批注跟随原元素                    | 基线上的定位修正保留；裁剪/卸载元素不显示错误标记                                                | [坐标桥](../src/shared/browser/annotations/browser-annotation-viewport-bridge.ts)                                                                                                       | [滚动和可见性协议](../src/shared/browser-annotation-viewport-bridge.test.ts)                                                                                                             |
| 批注收起后再展开，草稿和贴图仍在                      | **已由原生替代**：BW 独立折叠状态已删，只保留原生 tray；同文档刷新/fragment 保留批注，跨文档清除 | [批注 tray](../src/renderer/src/components/browser-pane/annotate/browser-page-annotation-tray.tsx)                                                                                      | [导航留存](../src/renderer/src/components/browser-pane/host-guest/browser-page-annotation-retention.test.ts)；旧 tray 编辑测试已移除，收起展开、中文草稿及贴图保留仍按 #579 人工判据验证 |

## 3. 同步取舍

同步采用两种粒度：移植一个修复 PR，或把 BW 已采用的 Orca 能力整体对齐一个固定发布版。单项修复记录来源 PR/SHA，整版基线保持原值；整版对齐时更新 §0 采用范围、版本/SHA、BW PR 和核对日期。共享依赖只保留一处实现，并检查全部消费者。执行步骤见 [orca-sync](../.claude/skills/orca-sync/SKILL.md)。

升级桌面基线时，以 BW main 和升级前的固定 Orca 版本定位 BW 对原生文件的改动，把新版改动与该差异按用户场景对照；沿重命名、拆分后的调用链继续核对 §2.3。检查范围包含自动合并的文件、BW 主动移除的入口，以及两套界面共用的样式、容器和显示条件。发现存量回退时优先恢复 BW main 原实现，接口变化处沿新版调用链做最小适配。界面按点击路径核对入口、位置和动作，数据或分享协议核对最终写入位置，由对应 PR 留下新版证据。

原生差异分为上游已一致、原生代码移植、必要基线适配、BW 产品挂载/保留修正、上游有而本次未迁、固定上游无及未核对。上游已覆盖 BW 修正时，核对同一用户行为及其看护后删除被替代实现，不留双路径；每个保留改造在 PR 指明人可理解的场景、代码落点、看护用例或未验项。当前稳定边界写回本篇，逐文件对照、测试结果与取舍过程留在 PR，不新增常驻流水。

1. **产品文档冲突**：`docs/`、`AGENTS.md`、`CONTEXT.md`、`README.md`、`CLAUDE.md` 以 BW 正本为准；上游工程说明只进入 `ref/`。
2. **上游参考文档**：`ref/` 可以按实际需要吸收 upstream `docs/reference/**` 或 `STYLEGUIDE.md`；不得把 `ref/` 再拷回 `docs/`。
3. **叠层外源码冲突**：BW 自有 `workbench/` 模块以外，未作 BW 改造的代码沿用固定 Orca 基线；BW 已有稳定契约、修复、RPC/CLI 注册和宿主组合按现行行为保留并人工接入新版调用链。发现已有改造未登记时补齐本篇对应边界，不能把漏记当成覆盖依据；只有确认上游已等价覆盖后才删除被替代实现。
4. **叠层内冲突**：`workbench/**` 与挂载钩子按 BW 现行实现人工合并，不能用上游整段覆盖。
5. **生成物与本机状态**：`.omc/**`、本机 profile、`dist/`、`out/` 不进入产品提交；生成的 Skill/指南按各自正源更新。
6. **CodeHub**：保留独立 provider 和 service；GitHub.com 继续走 Orca 原生 GitHub 路径，不把 CodeHub 收成 GitHub Enterprise 或 GitLab。

合并后按 [SYNC](../src/renderer/src/workbench/SYNC.md) 的 Electron 入口做受影响冒烟；源码存在不等于真实 Electron、远端或模型旅程已验证。

## 4. 关联正本

- [AGENTS.md](../AGENTS.md)：本仓开发规范、任务读取路径和验证/交付规则。
- [docs/architecture.md](../docs/architecture.md)：BW 当前产品旅程、能力归属和 Electron 数据流。
- [SYNC.md](../src/renderer/src/workbench/SYNC.md)：叠层代码边界、运行入口和调试方式。
- [docs/05-features/](../docs/05-features/README.md)：特性定义、状态和验证证据。
