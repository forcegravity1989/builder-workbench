# Workbench 叠层开发与运行说明

> **维护约定**：给维护 Electron 叠层的开发者读；只管代码边界、开发运行入口和构建入口，不写产品目标或上游版本记录。正文结构为「原则 → 日常调试 → 品牌与开关 → 禁止」；代码落点、命令或边界变化时更新。产品目标见 [architecture](../../../../docs/architecture.md)，上游快照、删迁记录与同步取舍见 [ref/upstream.md](../../../../ref/upstream.md)。

目标分支是主干 `main`（原 `bw-orca`，2026-09-30 扶正）。交互迁移须按当前 BW 意图重新决策；旧 Rust main（`archive/main-pre-orca`）与原型只能提供历史参考，不能视为现行实现正本。

总览 / 知识库挂在现有 `activity` / `space` 槽位；计划与验收从 `artifacts` 准备固定树后进入原生 `terminal`，在唯一工作区旁挂业务板（侧栏两个独立入口，保留原生项目列表，原生会话/工具侧栏不另实现）；任务挂 `tasks`（均不扩 `TopLevelView`）。知识库已对齐 V7「文档 / 代码 / 对账」。

项目墙与接入页在 `activity` 内容槽内切换，共用 Orca 的侧栏、标题栏和窗口控件。新增 BW 屏的宽度与窗口拖动约束见 [桌面壳](../../../../docs/06-module/桌面壳.md#bw-屏幕接入规范)。

Workbench 开发方法保留在 `.claude/skills/`；产品 Skill 正源在 `standard/skills/`。计划、验收、指标配置从 `skill-stubs/` 正文源生成 `skills/<name>/SKILL.md` 发现投影（由 cycle-prompt 注入）；投影与 CLI 指南由 `config/scripts/generate-bundled-skill-guides.mjs` 生成，随原生机制分发；合并上游时保留 [upstream 清单](../../../../ref/upstream.md) 中 BW Skill 的 manifest 登记，不手改生成物。不迁 `crates/` 与 `standard/vendor`。

## 原则

1. **upstream 核不动**：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、main runtime — 只挂载，不大段改写。
2. **改动落叠层**：界面进入 `src/renderer/src/workbench/`；BW 契约、材料事务及宿主适配进入 `src/shared/workbench/`、`src/main/workbench/`；远端执行由配对的 BW orcad 运行相同主进程业务模块。BW 界面类名走自己的设计系统 CSS（`workbench-tokens.css` 等，非 Tailwind），`config/oxlint-dead-classes.json` 对 workbench 子树关闭 Tailwind 类审计（与既有 `feature-wall-*` allow 同一机制，改动经 PR 评审）。Orca i18n coverage 审计（`verify:localization-coverage`）经 `config/localization-coverage-exclusions.json` 对 workbench 子树目录级豁免——BW 是中文优先产品面，不走 i18n 抽取；豁免条目必须带 reason，BW 国际化时移除。原生组件里个别专名/BW 壳标签走 allowlist 复核条目。
3. **原文件只留薄挂载**：界面用 `isWorkbenchShell()` 条件分支；RPC/CLI 注册只登记 BW 入口，不向 Orca 工作树、连接、调度类塞入业务。Web/配对、SSH/WSL 沿用原生路由，BW 不重建连接层。
4. **参考源**：产品意图与现行结构读 `docs/`；Orca 工程参考按需读 `ref/`；旧 Rust 旅程在迁移时重新决策。

上游版本快照、身份核对、差异记录和实际同步取舍统一见 [upstream 同步说明](../../../../ref/upstream.md)。本文件不重复维护上游记录。

## 日常调试（热加载）

改 `src/renderer/src/workbench/**` 时**不要**每次 `build:mac:workbench`。用 electron-vite 开发服：

```bash
pnpm run dev:workbench
```

- Renderer（叠层 UI / CSS）保存即 HMR，所见即所得
- Main / preload 变更会整窗重启（electron-vite 默认）
- 主 checkout 默认使用 `workbench-dev`；独立工作树默认使用 `workbench-dev-wt/<工作树哈希>`。Windows 位于 `%APPDATA%`，macOS 位于 `~/Library/Application Support`。工作树候选版首次启动是独立 profile；需要原有数据时通过产品入口登记，不覆盖用户正在使用的 profile。
- Dock 标题：`Workbench: <branch>`

**自己看 UI**：不要设 `ORCA_BACKGROUND_LAUNCH=1`（该变量会隐藏窗口、藏 Dock，仅供 agent/CDP 自动化）。

**Agent 用 CDP 调试又不抢焦点**：

```bash
ORCA_BACKGROUND_LAUNCH=1 REMOTE_DEBUGGING_PORT=9337 pnpm run dev:workbench
```

`dev:workbench` 本身已跨平台可直接跑；上面的 env 前缀是 POSIX 写法，在 Windows cmd/PowerShell 下不成立，改用该 shell 自己的赋值：

```powershell
$env:ORCA_BACKGROUND_LAUNCH = '1'; $env:REMOTE_DEBUGGING_PORT = '9337'; pnpm run dev:workbench
```

打试用包仍用：`pnpm run build:mac:workbench`（签名 / 分发 / CDP smoke 前再打）。

## 品牌与开关

正式标志源为 `resources/icon-source/workbench.png`。运行 `pnpm run build:icons` 从同一原图生成界面/运行时 PNG、Windows 多尺寸 ICO 和 macOS ICNS（只需 Node 与仓内依赖，不依赖 Xcode）。`node config/scripts/generate-workbench-icons.mjs --check` 校验生成物。开发与生产使用同一标志；旧的水彩/蓝色 Orca 偏好归一为默认标志，macOS 启动时清除旧 Finder 自定义图标以使用包内标志。macOS 菜单栏使用同源 18px / 36px 原色图（不作模板着色），注意提示叠加在原图上，开发实例以 `DEV` 文字区分。

| Env                                            | 作用                 |
| ---------------------------------------------- | -------------------- |
| `WORKBENCH_SHELL=1` / `VITE_WORKBENCH_SHELL=1` | 启用 Workbench 壳    |
| `ORCA_PRODUCT_NAME=Workbench`                  | 打包名；且默认打开壳 |
| `ORCA_APP_ID=com.stablyai.workbench.dev`       | 与正式 Orca 并行安装 |

打包：`pnpm run build:mac:workbench`（本机仅 arm64，脚本 `config/scripts/build-mac-workbench.mjs`）。

Windows Workbench：`pnpm run build:win:workbench`（脚本 `config/scripts/build-win-workbench.mjs`，沿用 `electron-builder` 的 Windows/NSIS 配置）。 Workbench 使用带目录选择的安装向导，手动运行安装包时可选择安装位置；已有安装默认沿用原目录，应用内自动更新沿用原目录并跳过选择页。产品名与 appId 保持独立于官方 Orca。包内 `resources/bin/orca.exe` 仍使用原生命令名，按产品编译并调用同包的 `Workbench.exe`；Workbench 与 Orca 启动器分别缓存，不能混用。打包后须通过该启动器读取 Skill 与材料 schema，不能只用 Node 直接调用 CLI JS 代替验证。

Windows Workbench 的 Electron 语言资源只保留简体中文（`zh-CN`）和英语（`en-US`），其他系统语言回落英语；这不裁剪应用自身的翻译目录。打包清除运行依赖里的 MSVC 调试符号与编译中间文件，保留 `.node`、`.dll`、`.exe`。远端宿主使用原生 orcad 模板及按平台物化的运行依赖；`build:win:workbench` 自动校验并准备 [固定原生依赖](../../../../native/orcad-prebuilds/README.md)，再依次构建 desktop、native、orcad-template、检查 Electron runtime 和打包。服务 JavaScript 始终使用当前 BW 源码，全平台模板不要求本机跨平台编译。沿用同一出包命令与安装身份，临时包可覆盖现有 BW 安装，不需要额外试用模式。`build:orcad` 可构建当前平台的独立宿主；仅重建 renderer 不会更新远端 daemon，远端须部署同一 BW 构建才有 BW RPC。

产物示例：

- `dist/mac-arm64/Workbench.app`
- `dist/Workbench-*-arm64-mac.zip`
- `dist/Workbench-*-arm64.dmg`

## 禁止

- 大改 `TaskPage` / automations 核心 / main PTY
- 把 Rust UI 整段搬进 Electron（迁移按用户目标与六环重新决定）
