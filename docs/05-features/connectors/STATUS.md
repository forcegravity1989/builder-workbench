# STATUS — Connector 引导与安装

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-10）**：intent / spec 为草案，与实现同一 PR 提交，**未经人 gate，不合入**。设置「AI 能力」组下的 Connector 页已实现并在真壳（`dev:workbench`，沙盒配置目录）里看到列表、添加面板与终端填入三步；真实安装、浏览器登录和移除没有在真壳里按回车执行过。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md) 草案；带入来源 = 2026-10-10 用户目标指令。五个待决项（词表改窄、入口位置、推荐目录、「仅当前项目」不写仓库、原型豁免）等 gate |
| 2 spec | ◐ | [spec.md](spec.md) 草案，验收点 CN-01–CN-08 已定义；没有单独原型，是否以真壳截图豁免列为 intent 待决第 5 项 |
| 3 实现设计 | ◐ | 无特性级 design。[architecture](../../architecture.md) §1 用户任务表与 §3 RPC 方法族、[桌面壳](../../06-module/桌面壳.md) 已各补一句；落点：[ref/upstream.md](../../../ref/upstream.md) 扩点表「Connector 设置页」行与叠层 [INVENTORY](../../../src/renderer/src/workbench/INVENTORY.md)；数据流 = 渲染层 → `workbench.connectors.list` → 主进程在项目目录下现跑两家列表命令；安装类动作只在内嵌终端里由人执行 |
| 4 TDD | ◐ | `src/shared/workbench/connectors.test.ts` 2 例：状态协议（两家真实输出 → 合并状态）、命令协议（拼装、失败即停、POSIX / PowerShell 引号、非法输入拒拼）。叠层总例数 257 → 259，正好等于基线（主干基线本就过期 2 例，见 PR） |
| 5 验收点E2E | ○ | 未逐项执行。已有证据：主进程服务用真实 CLI（沙盒 `CLAUDE_CONFIG_DIR` / `CODEX_HOME`）跑出 CN-01 与 CN-05 所需的合并结果；真壳截图覆盖列表、添加面板、终端填入 |
| 6 旅程E2E | ○ | 主旅程「推荐目录装一个 → 浏览器登录 → 列表显示已连接 → 重启读回一致」未跑 |

**已知债**：
1. **真实安装与登录未在真壳执行**——两家 CLI 的 add / login / remove 命令形状已在终端沙盒实测，但在 Workbench 内嵌终端里按回车、完成 OAuth 回调、终端结束后自动重检这条路径没走过。
2. **Windows 未验**——PowerShell 命令串联与引号由单测覆盖，Windows 上 `.cmd` 解析、内嵌终端固定 PowerShell 的行为没有实机验证。
3. **内嵌终端首行被裁半行**——原生 `OnboardingInlineCommandTerminal` 的现象，粘贴后 zsh 按新宽度重绘长命令；不影响执行，未改原生组件。
4. **列表会启动已批准的仓库共享服务**——`claude mcp list` 的健康检查即启动；按「与在该项目开 Claude 会话同等信任」处理，写在 spec §2，未另加确认步骤。
5. **Codex 不探连通**——Codex CLI 只给登录态，界面对 Codex 不显示「已连接」；要补需 Codex 提供健康检查或另做探测，未决。
6. **推荐目录中 Figma、Vercel、Supabase、Atlassian、Sentry、Notion 的浏览器登录未实测完成**——只确认了地址在线且 Claude Code 识别为需要登录。
