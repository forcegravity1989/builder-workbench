# Orca Bot 完整同步进展与交接

## 30 秒结论

本次工作在独立工作树 `orca-bot-full-sync` 的 `codex/orca-native-bots-full` 分支进行，目标是把 Orca v1.4.272 的原生 Bot 能力和官方 UI 带入 BW，同时保留 BW `main` 已上线的工作区、版本、项目、W3、CodeHub、WeLink、网页批注和团队共享行为。

PR 为 [#785](https://github.com/forcegravity1989/builder-workbench/pull/785)，关联 Issue #778。2026-11-26 核对的 `origin/main` 为 `6a1db93382`，已随合并提交 `0df1281067` 推送。内部机器已启动 dev 体验，当前优先修复反馈确认的 BW 回归。接手时先核对 PR、本机 HEAD 和体验所用提交。

## 已锁定的产品边界

- 侧栏顺序是 `Bots → 已固定 → 版本 → 项目`。
- Bot 使用 Orca 原生 Chat 编排身份和官方 Bot 页面、连接器、自动化、人工提问、恢复以及群组能力。
- Agent 从工作区启动，实验性的 Agent Dashboard 快捷入口不作为 BW 主入口。
- W3 是 BW 日常账号入口，GitHub 保留现有集成。官方 Bot 连接器仍使用 Orca 授权，内部账号、WeLink 和 CodeHub 的改造留到后续。
- 直接 SSH 材料路径和未上线的旧只读邀请不迁移。
- 不恢复旧批注交接的平行实现。当前路径是新版桌面入口加 BW 的本机浮动终端草稿交接。

## 代码策略

### 保留的 BW 存量行为

BW 对 Orca 的修改集中在入口和薄挂载。已恢复或保留的路径包括：

- BW 图标、桌面壳、左侧导航和 `Bots → 已固定 → 版本 → 项目`。
- BW 入门、探索 BW、首次设置重开和工作旅程入口。
- 版本计划、版本验收、项目墙、版本总览和项目筛选。
- CodeHub 任务入口、W3 登录与浏览器会话隔离。
- WeLink 隐私说明、集成登录弹窗、设置搜索和原有白屏修复。
- 网页批注快捷键、浮动提单助手、任务链接的「在任务中打开」和本仓 Issue 的「开始修复」。
- BW 产物分享、团队地址回显和共享主机路由。

### 本轮从最新 main 接入的上游能力

本轮 `origin/main` 新增的团队绑定表单、项目墙成员头像和来源头像、分享页 HTML 内联样式、规划草稿提示以及对应的服务端和协议测试均保留。

与新版路径冲突的旧文件继续删除。这些文件在本分支已经由新版运行时路径替代：

- `src/cli/bundled-skill-guides.ts`
- `src/renderer/src/lib/agent-launch-prompt-delivery.ts`
- `src/renderer/src/lib/agent-paste-draft.ts`
- `src/renderer/src/lib/launch-agent-in-new-tab.test.ts`
- `src/shared/client-environment-info.test.ts`

保留删除状态是为了避免把上游对旧路径的修改重新带回已迁移的实现。

### 冲突处理原则

| 冲突区域                   | 处理                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| `.github/workflows/pr.yml` | 保留 BW 原有门禁和 Bot 定向用例，补入 main 的分享协议用例                  |
| 文档和特性矩阵             | 采用最新 main 的版本，BW 与 Orca 的稳定边界继续以 `ref/upstream.md` 为正本 |
| `Dialog`                   | 保留 BW 统一尺寸、焦点、忙碌态和弹窗层逻辑，补入通知点击不关闭弹窗的保护   |
| `main.css`                 | 保留 BW 通知层和浮动工作区层级                                             |
| `ProjectWallCard`          | 采用 main 的来源头像和成员信息能力，修正到 BW 当前共享类型路径             |
| `TeamSettingsDialog`       | 采用 main 的团队绑定表单，保留 BW 当前执行主机和配对代码路径               |
| `open-assistant`           | 保留 BW 的本机执行主机、交接结果确认和失败重试，接入 main 的规划草稿重写   |
| 翻译和生成包               | 保留与 v1.4.272 源码匹配的语言目录，合并新增键并重建生成包                 |

## 已验证证据

- 上一轮提交 `1b963e71bc` 的 Workbench CI、Cloud Verify、共享主机、Windows Codex、网页批注、Bot 定向用例和三条 Electron 旅程全部通过。
- 上一轮前台 Electron 以隔离 profile 启动，核对了 64px 导航栏、BW 标志、Bots 位于工作区块上方、帮助入口和批注交接入口。
- 本机 Claude Bot 已跑通执行、人工提问和恢复。同机配对群组已验证。
- 真实 W3 账号登录、退出和冷启动恢复，真实连接器账号授权以及物理双机群组仍需内部环境验收。
- 本轮合并后需要以新合并提交重新跑远端 CI。Windows 本机不跑完整 CI，遵循仓库 `AGENTS.md`。

## 交接后的第一步

1. `git status --short --branch` 确认仍在 `codex/orca-native-bots-full`。
2. 检查 `git diff --cached --check` 和 `git diff --check`。
3. 运行仓库规定的 staged 格式门禁，再提交合并结果。
4. 内部机器体验期间，以 dev 反馈为先。按入口、操作和实际结果定位，用 BW main 的同一路径确认预期，再把缺失的挂载或行为接到 v1.4.272 所用接口。每个小批次注明修复提交以及是否需要重启 dev。
5. 后续同步 main 时固定要检查的远端提交。Git 报冲突的文件和自动合并的同一旅程都要核对。BW 挂载优先复用 main，Bot 四个目录对照 v1.4.272，翻译保留当前源码所需键，生成文件在格式化后重建。
6. 恢复正式交付检查时，核对 PR 当前提交的 Workbench CI、Cloud Verify、Issue association 和 Electron E2E。取证按实际覆盖的环境记录，是否合入由人决定。

## 不要带入提交的本机文件

以下是本机生成物或已知换行差异，不属于本次交付：

- `.cache/`
- `native/windows-notifications/bin/`
- `native/windows-notifications/build/`
- `native/windows-security/bin/`
- `native/windows-security/build/`
- `src/main/persistence/loading-store/project-catalog/repo-lifecycle-operations.ts`
- `src/main/skills/bundled-skill-install/bundled-skill-sources.ts`

最后两个文件当前只有换行差异，提交前保持未暂存。

## 本轮合并后的修复记录

第一次合并提交 6bf2db5f80 的远端 CI 暴露出三类合并问题。

- 直接采用 origin/main 的精简 en.json / zh.json 会丢失 BW 仍在使用的目录键。已恢复上一轮绿色提交的 BW 目录，再运行目录校验脚本补入最新来源键。
- main 的 ProjectWallCard 使用了新版 shell.openPath(path, ownerHostId)，已补上 getRepoExecutionHostId(slot.repo)。
- 上游生成的 CLI 指南和 Workbench Skill 包需要按当前源码重新生成，已运行对应生成脚本。

修复提交为 `fa2fa1282f`。随后的 `bbd6babe81` 通过了 [Workbench CI](https://github.com/forcegravity1989/builder-workbench/actions/runs/45771281730)、[Cloud Verify](https://github.com/forcegravity1989/builder-workbench/actions/runs/45771281670) 和 Issue 关联检查。

随后同步到 `6a1db93382`，涉及分享页批注界面、验收工具说明和更新器 #801。「会话保存失败后强制重启」接到当前的 preload、会话保存和更新卡片上。普通重试、团队更新稍后提醒和发布构建列表强制刷新沿用此前分支行为。更新器修复尚无真实安装验收。内部体验反馈优先，CI 暂不作为每次体验修复的等待项。

## 内部体验反馈 · 2026-11-26

- 标题栏 BW PNG 沿 main 使用 20px 原色显示。三点应用菜单沿 main 的产品判断隐藏重复帮助菜单，左下帮助恢复「报告崩溃」和「关于 BW」。桌面复验时分别查看浅色、深色并打开两个帮助项。
- 原生底部状态栏在 BW 重复显示了左侧已有的主机入口，已恢复 main 的隐藏条件。验收时查看左侧主机数量、右下状态栏及工作区筛选能否分别正常使用。
- 知识库路由、页面与专用 CSS 已对照 main，编辑器依赖、全局样式和内部机器实际画面待核。设置正文常规 784px 限宽来自 Orca v1.4.272，字体对比待同尺寸、同主题复验。
- 远程服务器的分享动作、集成、隐私文案和工件设置已查到 BW 挂载，内网实际操作待验。
- 内部体验反馈的主机选择位于设置右上角。固定版 Orca v1.4.272 在已有远端宿主或当前设置指向远端时显示该控件。它切换部分原生设置的读写宿主。已确认沿用 Orca 在多数设置页显示的方式。桌面复核时同时查看本机、配对宿主和切换后的设置内容。

共享宿主、浏览器和执行链由独立检视并行对照。已定位本机工作区链接漏用 W3 默认会话及 Web 手动断开后刷新重连两条回退，恢复 BW 行为后分别用实际 W3 登录及已配对宿主复验。Windows 安装包需单独验证，当前构建入口需要的 Rust CLI 启动器源文件缺失，前台 dev 无法覆盖该路径。

后续按用户旅程核对 BW main、固定 Orca 和 PR 的入口、显示条件、样式与动作。附加入口也要核对。模板和连接器的内部产品取舍待决定，沿用本次固定基线，会议助手单独定义。
