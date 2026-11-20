# STATUS — 内部集成

> **维护约定**：给交付、检视和验收者读取，只登记当前六环状态、W03/W04 crosswalk、E2E 登记和未验证边界。用户结果见 [intent.md](intent.md)，当前行为见 [spec.md](spec.md)。运行命令、日志、截图和修复过程留在对应 PR 验证评论，不保存施工流水或历史取舍。

## 当前结论

设置 → 集成已接入 GitHub、CodeHub、WeLink 和 CloudBuild 四张卡，状态推导、安装动作和卡内登录终端已有实现与协议看护。原型和协议测试不能证明四 CLI 的真实登录、安装、权限和重启读回。

## W03/W04 crosswalk

| 探索旅程 | 本特性承接 | 关系 |
| --- | --- | --- |
| W03「构建交付」 | GitHub、CodeHub 的安装和登录准备 | 为任务、PR/MR 和评审入口提供前置状态，不承接任务详情或评审结果 |
| W04「验收成果」 | WeLink 的安装和登录准备，CloudBuild 的构建入口状态 | 为报告、诊断和构建动作提供前置状态，不承接验收结论、报告聚合或发布 |

IJ01「四 CLI 全缺 → 安装并登录 → 重新检查全绿 → 重启后仍绿」是旧标识，映射到上述前置准备，不作为 W03/W04 用户旅程登记。该特性没有独立 Explore 用户结果，当前不创建用户旅程 E2E。

## 六环状态

| 环 | 状态 | 当前依据与边界 |
| --- | --- | --- |
| 1 intent | 已确认 | 用户结果、价值、范围、排除和 W03/W04 归属见 [intent.md](intent.md)。 |
| 2 spec | 已确认 | 四 CLI 的命令、状态、路径、失败边界和 I01–I14 见 [spec.md](spec.md)。 |
| 3 实现设计 | 已同步 | 设置入口、卡片骨架、CLI 探测、安装执行和卡内终端分别落在 `src/renderer/src/components/settings/IntegrationsPane.tsx`、`src/renderer/src/components/settings/monica-cli-integration-cards.tsx`、`src/main/preflight/agent-detection.ts`、`src/main/preflight/monica-cli-auth-status.ts`、`src/main/ipc/monica-cli-install.ts` 和 `src/shared/monica-cli-install-commands.ts`。 |
| 4 TDD / 协议 | 已有 | `src/main/ipc/preflight-host-cli-status.test.ts`、`src/main/ipc/command-path-resolver.test.ts`、`src/renderer/src/components/settings/integrations-pane-status.test.ts` 和 `src/renderer/src/components/settings/cli-source-control-integration-cards.test.tsx` 看护探测、输出标记、状态推导、shim 路由和既有卡片行为。它们不替代真实 Electron 验收。 |
| 5 验收点 E2E | 待验 | I01–I14 已定义，当前没有注册到 Monica 白名单的业务 E2E。未来最多登记一条真实入口，执行项目、真实环境和独立读回需在登记时补齐。 |
| 6 用户旅程 E2E | — | 集成是 W03/W04 的前置能力，没有独立 Explore 用户结果。IJ01 只作历史 crosswalk，不注册为当前用户旅程 E2E。 |

## E2E 登记

当前无登记的业务 E2E。未来若 I01–I14 需要真实验证，使用一条验收点入口，并在此登记旅程 ID、特性、文件和测试标题、执行项目、真实环境、独立读回方式与状态。W03/W04 主旅程入口由对应特性登记，不在本篇重复建立。

## 未验证边界

- 四 CLI 的真实安装、登录交互、权限和状态读回尚未以同一条当前入口完整执行。CodeHub 的 `--all`、WeLink 的扫码和 CloudBuild 的 token 过期判断仍需真实环境核验。
- 杀进程重开后的四卡独立读回尚未形成当前验收证据。缓存不代表重启后的事实。
- 远端运行时无安装和登录动作、WSL 按本机范围处理、安装失败通知、登录失败留屏和重新检查的真实 Electron 证据仍需按适用环境补采。
- 原型播放、静态检查、协议测试和历史真壳记录不能替代 I01–I14 或 W03/W04 的真实旅程证据。运行结果写入对应 PR 验证评论，完成后只更新本篇当前状态。
