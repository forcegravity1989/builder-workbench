# STATUS — Connector 引导与安装

> **维护约定**：本篇记录本特性六环链现状与证据，格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；更新触发：任一环状态或证据变化，随引发它的 PR 同批提交，不记流水。

**现状（2026-10-10）**：intent / spec 为草案，与实现同一 PR 提交，**未经人 gate，不合入**。设置「AI 能力」组下的 Connector 页已实现。真壳（`dev:workbench` 同一套环境变量，一次性 Orca 配置目录与沙盒 `CLAUDE_CONFIG_DIR` / `CODEX_HOME`）里按回车走通了安装、重启读回、移除与项目范围；浏览器 OAuth 登录与 Windows 没有验。

| 环 | 状态 | 证据或已知债 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md) 草案；带入来源 = 2026-10-10 用户目标指令。五个待决项（词表改窄、入口位置、推荐目录、「仅当前项目」不写仓库、原型豁免）等 gate |
| 2 spec | ◐ | [spec.md](spec.md) 草案，验收点 CN-01–CN-08 已定义；没有单独原型，是否以真壳截图豁免列为 intent 待决第 5 项 |
| 3 实现设计 | ◐ | 无特性级 design。[architecture](../../architecture.md) §1 用户任务表与 §3 RPC 方法族、[桌面壳](../../06-module/桌面壳.md) 已各补一句；落点：[ref/upstream.md](../../../ref/upstream.md) 扩点表「Connector 设置页」行与叠层 [INVENTORY](../../../src/renderer/src/workbench/INVENTORY.md)；数据流 = 渲染层 → `workbench.connectors.list` → 主进程在项目目录下现跑两家列表命令；安装类动作只在内嵌终端里由人执行，Codex 命令显式写 Orca 同步来源目录 |
| 4 TDD | ◐ | `src/shared/workbench/connectors.test.ts` 2 例：状态协议（两家真实输出与边界行 → 合并状态）、命令协议（拼装、失败即停、POSIX / PowerShell 引号、`CODEX_HOME` 前缀、非法输入拒拼）。叠层总例数 257 → 259，正好等于基线（主干基线本就过期 2 例，见 PR） |
| 5 验收点E2E | ◐ | 真壳实测过：CN-01（终端装的与页面装的同列一行）、CN-04 前半（只列本机工具）、CN-05（选中项目才出现 local 与仓库共享两级、「仅 proj」范围）、CN-06（页面移除后两家 CLI 独立读回都没有）、CN-07（重启前后列表与状态一致）、CN-08 的「失败原因原样显示」。未验：CN-02、CN-03（要浏览器登录）、CN-04 后半（都没装时的指引） |
| 6 旅程E2E | ◐ | 「添加本机命令服务 → 终端执行 → 列表显示已连接 → 重启读回一致 → 移除」走通（服务用本机已有的 `claude mcp serve`）；「推荐目录装远程服务 → 浏览器登录 → 已连接」未跑 |

**已知债**：
1. **浏览器 OAuth 登录未验**——需要真实账号。推荐目录 7 个需登录的服务只确认了地址在线、Claude Code 识别为需要登录；`codex mcp login` 的凭据落在系统目录还是钥匙串、Orca 托管目录里的 Codex 会话读不读得到，未实测。
2. **Windows 未验**——PowerShell 串联、引号与 `$env:CODEX_HOME` 赋值由单测覆盖；`.cmd` / `.ps1` 垫片的实际行为没有实机验证。
3. **Claude 托管账号**——启用 Orca「AI 提供商账户」里的 Claude 托管账号时，会话读该账号目录的配置；本页读写默认目录（`CLAUDE_CONFIG_DIR` 或 `~/.claude.json`），两者可能不一致。该功能是可选项，本特性未处理。
4. **已在跑的 Codex 会话看不到新装的 connector**——Orca 只在起会话前把系统目录同步进托管目录。
5. **列表会启动已批准的仓库共享服务**——`claude mcp list` 的健康检查即启动；按「与在该项目开 Claude 会话同等信任」处理，写在 spec §2，未另加确认。
6. **内嵌终端首行被裁、粘贴文字反显**——原生 `OnboardingInlineCommandTerminal` 的现象，长命令开头在屏幕上看不全（添加面板的预览里完整）；不影响执行，未改原生组件。
7. **Codex 不探连通**——Codex CLI 只给登录态，界面对 Codex 不显示「已连接」。
