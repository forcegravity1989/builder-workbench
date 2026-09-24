# Workbench 同步策略

> **维护约定**：给维护 Electron 叠层和同步 Orca 的开发者读；只管代码边界、同步与运行入口。产品目标见 [architecture](../../../../docs/architecture.md)，上游身份与删迁记录见 [ref/upstream.md](../../../../ref/upstream.md)；边界或命令变化时更新。

目标分支是 `bw-orca`。交互迁移须按当前 BW 意图重新决策；旧 Rust main 与原型只能提供历史参考，不能视为现行实现正本。

总览 / 知识库挂在现有 `activity` / `space` 槽位；计划挂 `artifacts`；任务挂 `tasks`（均不扩 `TopLevelView`）。知识库已对齐 V7「文档 / 代码 / 对账」。

Workbench 自有 Skill 保持 main 原路径（`.claude/skills/`、`standard/skills/`），不并入 Orca `skills/` 打包清单；不迁 `crates/` 与 `standard/vendor`。

## 原则

1. **upstream 核不动**：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、main runtime — 只挂载，不大段改写。
2. **改动落叠层**：界面进入 `src/renderer/src/workbench/`；BW 契约、材料事务及宿主适配进入 `src/shared/workbench/`、`src/main/workbench/`；SSH 宿主侧挂载进入 `src/relay/workbench/`。
3. **原文件只留薄挂载**：界面用 `isWorkbenchShell()` 条件分支；RPC/CLI 注册与 relay 组合只登记 BW 入口，不向 Orca 工作树、连接、调度类塞入业务。Web/配对、SSH/WSL 沿用原生路由，BW 不重建连接层。
4. **参考源**：产品意图与现行结构读 `docs/`；Orca 工程参考按需读 `ref/`；旧 Rust 旅程在迁移时重新决策。

## 同步上游

`origin` 是 BW 仓，`origin/main` 是在用的 Rust 版本；不是 Orca 上游。身份核对、独立分支与同步步骤统一见 [upstream 同步说明](../../../../ref/upstream.md#upstream-仓)。不得按旧 workbench 分支说明把 origin/main 整支合入。

## 日常调试（热加载）

改 `src/renderer/src/workbench/**` 时**不要**每次 `build:mac:workbench`。用 electron-vite 开发服：

```bash
pnpm run dev:workbench
```

- Renderer（叠层 UI / CSS）保存即 HMR，所见即所得
- Main / preload 变更会整窗重启（electron-vite 默认）
- 独立 profile：`~/Library/Application Support/workbench-dev`（不碰 `orca-dev`）
- Dock 标题：`Workbench: <branch>`

**自己看 UI**：不要设 `ORCA_BACKGROUND_LAUNCH=1`（该变量会隐藏窗口、藏 Dock，仅供 agent/CDP 自动化）。

**Agent 用 CDP 调试又不抢焦点**：

```bash
ORCA_BACKGROUND_LAUNCH=1 REMOTE_DEBUGGING_PORT=9337 pnpm run dev:workbench
```

打试用包仍用：`pnpm run build:mac:workbench`（签名 / 分发 / CDP smoke 前再打）。

## 品牌与开关

| Env | 作用 |
|-----|------|
| `WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1` | 启用 Workbench 壳 |
| `ORCA_PRODUCT_NAME=Workbench` | 打包名；且默认打开壳 |
| `ORCA_APP_ID=com.stablyai.workbench.dev` | 与正式 Orca 并行安装 |

打包：`pnpm run build:mac:workbench`（见 package.json；本机仅 arm64，脚本 `config/scripts/build-mac-workbench.mjs`）。

产物示例：

- `dist/mac-arm64/Workbench.app`
- `dist/Workbench-*-arm64-mac.zip`
- `dist/Workbench-*-arm64.dmg`

## 禁止

- 大改 `TaskPage` / automations 核心 / main PTY
- 把 Rust UI 整段搬进 Electron（迁移按用户目标与六环重新决定）
