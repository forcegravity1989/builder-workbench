# STATUS — CodeHub 适配

> **维护约定**：记录本特性六环现状。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)。环状态变化时随引发它的提交更新，不记流水。

**现状（2026-09-30）**：任务来源、任务页和计划 / 验收读写已在本分支。intent / spec 从提交回写，**待人 gate**。没有可点原型。本次写文档时没有重跑单测，也没有连真实 CodeHub。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ◐ | 草案 [intent.md](intent.md)。来源 `05dfa7455`、`b0005c098`、`7ca46d402` |
| 2 spec | ◐ | 草案 [spec.md](spec.md)。缺可点原型，规格 gate 未过 |
| 3 实现设计 | ◐ | 行为散落在 [ref/upstream.md](../../../ref/upstream.md) CodeHub 节、[codehub-cli 指南](../../03-guide/codehub-cli.md)、验收规格里的版本目录规则。无特性级 design |
| 4 TDD | ◐ | 存量单测文件在，本次未重跑。见下表 |
| 5 验收点 E2E | ○ | C01–C08 已定义。上游写明平台请求用模拟边界，不能代替内部 CodeHub 实机 |
| 6 用户旅程 E2E | ○ | CJ01 已定义，未执行 |

## 验收点与旅程矩阵

口径：◐ = 主路径有实现和单测文件，没有真实 CodeHub 或真壳证据；○ = 未执行。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| C01 自动切到 CodeHub | ◐ | 任务页 provider 状态、`task-providers.ts` | 单测覆盖注册与加载范围；真壳未看 |
| C02 未加载完不说成没有 | ◐ | CodeHub 列表加载 | 同上；文案键变更见 upstream |
| C03 先评论再关闭 | ◐ | `src/main/codehub/issue-state.ts` | `issue-state.test.ts`；未对真实站点读回评论 |
| C04 无草稿 / 无 Mark ready | ◐ | HostedReview 创建与状态动作 | 组件测试使用模拟；未看真实 MR |
| C05 未安装 CLI | ◐ | 预检只报 `{ installed }` | `preflight-host-cli-status.test.ts` 锁定探测顺序 |
| C06 周期里按项目路径打开 | ◐ | `src/renderer/src/workbench/task-port.ts` | `task-port.test.ts`；未从计划屏点进真实详情 |
| C07 归档保持未知 | ◐ | `src/main/workbench/archive-pr-status.ts`（CodeHub/非 GitHub 一律 unknown；2026-10-13 起原 archive-source-gap/archive-port 接缝已随合入证明链退役删除） | 未在 CodeHub 仓库上看见未知原因 |
| C08 基线版本目录可选 | ◐ | `version-history-service.ts` 的 `treePlans` | `version-history-service.test.ts` 有「无 provider 合入也列出 data.json」；真壳未选过版本 |
| CJ01 关闭后重启仍为关闭 | ○ | 任务页 + CLI | 未执行 |

相关单测还有 `src/main/codehub/mutations.test.ts`、`work-items.test.ts`、`src/main/github/issue-update.codehub.test.ts`（GitHub 更新不因旁边有 CodeHub 远程而改道）。

实机证据（2026-10-10，project-intake 名片链复用同一 CodeHub 能力）：克隆前名片预读读侧（repo-reads）对两个内源 host 实机验证可读（修复 --jq 引号假 absent 后）；createCodeHubMr 打包实跑在真实 CodeHub 仓验证可开 MR（应用内曾出现一次瞬时失败，错误信息未留存，排除法定位；查重/创建命令现均实测通过）。
