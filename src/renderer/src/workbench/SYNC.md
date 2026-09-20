# Workbench 同步策略

> 分支：`workbench`。产品叠层在本目录。  
> 保真正本：
> - 一体原型 `loop-buddy/docs/05-features/native-session-execution/prototype-v6.html`
> - 真壳实现 `loop-buddy/crates/app-shell/src/screens/`（overview / plan / kb / settings / wall / session）
> - 设计 token / chrome：`loop-buddy/docs/04-design-system/`、`crates/app-shell/assets/shell.css`

优化时**两边对照**：壳与旅程信息架构借 loop-buddy；执行面（终端、建树、Tasks、Automations）复用本仓 Orca。

总览 / 知识库挂在现有 `activity` / `space` 槽位（不扩 `TopLevelView`）。知识库已对齐 V7「文档 / 代码 / 对账」。

## 原则

1. **upstream 核不动**：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、main runtime — 只挂载，不大段改写。
2. **改动落叠层**：导航 / 旅程壳 / 占位屏 / 皮肤 / 品牌 只进 `src/renderer/src/workbench/`。
3. **原文件只留一行钩子**：`isWorkbenchShell()` 条件分支。
4. **参考源**：交互与信息架构对照 `loop-buddy`；执行面能力对照 Orca。

## 合 main 步骤

```bash
git fetch origin
git checkout workbench
git merge origin/main
# 冲突：叠层外 → 取 upstream；workbench/** 与挂载钩子 → 取 ours / 手合
```

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
- 把 loop-buddy Rust UI 整段搬进 Electron（只借交互与结构）
