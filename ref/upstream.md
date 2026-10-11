# Upstream Orca — 当前快照与同步记录

> **本篇维护约定**
> - **读者与时机**：处理 Orca/BW 边界、核对上游版本、或实际合并/rebase Orca 时读取；仓外会话从 [AGENTS.md](../AGENTS.md) 的任务表进入。
> - **职责与边界**：只记录与 BW 边界有关的 Orca 当前快照、稳定差异、旧 main 迁移来源和同步取舍；不承载 BW 产品设计、日常开发规则、完整 Orca release notes、完整源码树或未解决事项清单。
> - **记录方式**：当前快照覆盖同一组字段，不追加月报。每次核对更新版本/日期/范围；历史由 Git 追溯。无法核对的字段写 `Unknown`，不能用旧基线冒充当前版本。
> - **更新触发**：上游基线或公开版本变化、BW 增删影响同步的钩子、稳定目录边界变化、或同步取舍改变时更新；普通 BW 功能开发不更新本篇。
>
> 本篇的“当前”只表示最近一次有来源的核对，不代表仓库已经跟随该版本。BW 当前产品行为读 [architecture](../docs/architecture.md)，叠层运行入口读 [SYNC](../src/renderer/src/workbench/SYNC.md)。

## 0. 30 秒快照

### 0.1 上游版本锚点

| 项 | 本次核对结果 |
|---|---|
| Orca 仓库 | [stablyai/orca](https://github.com/stablyai/orca) |
| 最近公开版本 | [v1.4.222](https://github.com/stablyai/orca/releases/tag/v1.4.222) |
| 发布时间 | 2026-10-07 |
| 发布锚点 | `4bb6f20`（release 页面短 SHA） |
| 本次核对日期 | 2026-10-11 |
| BW fork baseline | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`，2026-09-15 |
| 本次核对范围 | 公开 release、仓库顶层目录、与 BW 边界直接相关的能力摘要 |

公开版本不是本仓当前同步基线；本仓的 fork baseline 仍是单独的历史锚点。没有完成一次实际代码比较时，不把“最新 release”写成“已同步”。

### 0.2 与 BW 边界直接相关的能力

当前公开版本的变化重点涉及 agent/orchestration workers、workspaces/worktrees、terminal 与远程运行、native chat（实验能力）、编辑器/Markdown/search、provider/account 与 Windows/WSL。BW 只复用其中与自身旅程有关的 Orca 执行核；具体 BW 产品行为不在这里重复。

BW 依赖的稳定 Orca 原生能力是：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、provider 与 `src/main` runtime。BW 不为这些能力另建平行实现。

### 0.3 上游目录定位

下面只列同步时需要定位的稳定目录层级，不是完整源码清单：

| 层级 | 上游目录 | 用途 |
|---|---|---|
| 产品与执行 | `src/`、`native/`、`cloud/`、`mobile/` | 桌面/原生/远程/移动产品与执行代码；合并时按实际文件和调用链判断 |
| 资源与 Skill | `resources/`、`skills/`、`skill-guides/`、`skill-stubs/` | 原生资源与能力分发；Workbench 自有 Skill 以本仓 `standard/` 为正源 |
| 工程与验证 | `config/`、`tests/`、`docs/`、`.github/`、`.husky/`、`Casks/`、`examples/plugins/` | 构建、测试、参考和发布辅助；不因此把上游工程文档变成 BW 产品正本 |

## 1. 上游身份与 fork 基线

| 项 | 值 |
|---|---|
| Orca GitHub | `https://github.com/stablyai/orca` |
| BW 仓远程 | `origin` = `https://github.com/forcegravity1989/builder-workbench.git` |
| BW `origin/main` | 产品主干（原 `bw-orca`）；旧 Rust 路线归档为 `archive/main-pre-orca` |
| Orca 本地远程 | 建议名 `orca-upstream`；使用前必须核对 URL，不能把 `origin` 当 Orca 上游 |
| fork baseline | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`（2026-09-15） |

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

| 层级 | BW 落点 | 同步取舍 |
|---|---|---|
| Orca 原生执行核 | TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、`src/main` runtime | 原生优先；不大段改写，不复制会话、任务、工作树、连接或调度内核 |
| BW UI 叠层 | `src/renderer/src/workbench/` | 保留 BW 导航和业务板；与原生界面冲突时人工处理 |
| BW 业务契约与事务 | `src/shared/workbench/`、`src/main/workbench/` | 业务落在 BW 自有模块，不塞进 Orca 工作树、连接和调度类 |
| 宿主适配与 relay 组合 | `src/relay/workbench/`、原生 RPC/CLI 注册入口 | 复用原生身份、路由和窄执行器，只登记 BW 入口 |
| 产品分发规范 | `standard/` | 是给被管项目的规范正源，不与 `.claude/skills/` 或 Orca 根级 Skill 目录合并 |

实现位置和运行入口的细节见 [SYNC](../src/renderer/src/workbench/SYNC.md)；当前产品能力见 [architecture](../docs/architecture.md)。

### 2.3 需要在同步时保留的稳定扩点

只记录会影响 Orca 合并取舍的契约，不展开全部文件清单：

- `automation.runNow` 的可选 `oneShotPrompt`、capability 门控和 renderer/headless 两条派发语义；一次性上下文不写回保存的自动化提示。
- 自动化编辑器的显式 `target/draft` 请求契约；BW 预填入口依赖该原生能力。
- 任务详情的 source context、return-to-previous-view 和 worktree history replay；BW 不另建任务详情和历史系统。
- 工作树版本偏好、Git history 的窗口/固定 revision/`committedAt`、GitHub/CodeHub 的真实 `mergedAt` 字段透传。
- WSL/SSH/配对沿用原生宿主身份和执行路由；BW 不新增本机专属连接层。
- 原生 provider 标签和身份抽取保持单一实现；不要把已经去重的实现合回来。

相关行为正本分别在 `docs/05-features/`、`docs/architecture.md` 和源码契约中；本篇只保留同步时必须知道的取舍。

### 2.4 CodeHub 边界

CodeHub 是独立的 `TaskProvider`，不塞回 GitHub 的 `listWorkItems`，也不通过 `gh`/`glab` 降级处理。CodeHub service、`codehub:*` RPC、任务来源和 GitHub 更新路径保持分离；详细行为见 [CodeHub 特性](../docs/05-features/codehub/STATUS.md) 与 [CodeHub 指南](../docs/03-guide/codehub-cli.md)。

### 2.5 从旧 Rust main 吸收的内容

- `standard/` 的系统提示词、references、skills 和模板已作为内容目录合入；旧 Rust `crates/bw` 的集中注入器和旧周一屏脚本不复刻。
- reviewer-agent 召唤制 CI 已迁入默认主干；其现行状态见 [reviewer-agent STATUS](../docs/05-features/reviewer-agent/STATUS.md)。
- 旧 Rust 旅程、ADR、release/出包入口和历史绿灯不作为当前 Electron 行为证据。

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
