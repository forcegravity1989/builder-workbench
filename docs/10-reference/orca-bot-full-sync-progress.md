# Orca Bot 完整同步进展与交接

## 30 秒结论

本次工作在独立工作树 `orca-bot-full-sync` 的 `codex/orca-native-bots-full` 分支进行，目标是把 Orca v1.4.272 的原生 Bot 能力和官方 UI 带入 BW，同时保留 BW `main` 已上线的工作区、版本、项目、W3、CodeHub、WeLink、网页批注和团队共享行为。

PR 为 [#785](https://github.com/forcegravity1989/builder-workbench/pull/785)，关联 Issue #778。上一轮绿色提交为 `1b963e71bc`。本轮已抓取 `origin/main` 到 `4d2719115d0e77d490dbf44dbce9d37472fcc99e4` 并完成合并冲突处理，合并提交尚未推送。

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
| 翻译和生成包               | 采用 main 的翻译基线，合并后重新生成 BW Skill 包                           |

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
4. 推送分支并等待 PR #785 的 Workbench CI、Cloud Verify、Issue association 和 Electron E2E。
5. 若 CI 失败，先按失败文件判断是本轮 main 合并引入，还是旧 BW / Bot 路径回归。不要顺手修无关上游测试。
6. CI 全绿后，把 PR 保持 Ready，并用当前提交重新启动隔离前台 dev。
7. 完成 W3、真实连接器和双机 Bot 验收后，再由人决定是否合入。

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
