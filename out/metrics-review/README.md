# 指标闭环验证

产品提交：2ff22f5ce4bd321a554dad206f8cf722fd28cc10
基线：origin/bw-orca fef8dda1f53a8da2f3f95f1c7dd985dbdc34abec

用户要求本机暂不启动 Electron。截图来自实际 React 组件、替身 MetricsPort、无头 Edge；没有操作用户桌面窗口。

## 已执行

- 受影响 Vitest：17 文件、97 用例通过。最终证据组件 key 调整后验收 5 用例复验通过，脚本 fixture 请求粒度修正后执行器 8 用例复验通过。日志见本目录。
- 真实本地 Git 仓、bare remote 与 Node 子进程：正式分支新增指标后同步目录，原 checkout HEAD 和未提交 README 不变；固定提交隔离采集、超时/非零退出及清理通过。这是测试夹具仓与脚本，不是用户业务仓或真实 provider 指标。
- 真实组件浏览器：总览配置入口、计划旧基线、验收选择非原计划指标并采集；1280/1920 均无横向溢出、无浏览器脚本错误。数据均为替身。
- 按 lint-staged 规则，对变更代码执行 oxlint、React Doctor 配置、oxfmt；CSS/JSON 执行 oxfmt，最终无错误或警告。提交按用户授权 HUSKY=0。
- 共享契约、窗口、定义解析、输出解析、采集服务限定范围 tsc 通过，非全项目类型检查。
- Skill bundled/manifest 生成一致；原型 runtime 一致及三个入口 synthetic DOM startup 通过。
- 三位 subagent 复审实现、文档和测试；修复目录竞态、不同指标并发互相影响、验收首次加载覆盖刷新、证据缺少名称。文档修正自动口径差异 UI 的过度承诺；86 个本地链接有效，diff --check 通过。

## 复验

先在验证进程移除 ANTHROPIC_* / CLAUDE* 环境变量，不打印值；复用现有依赖，不安装。

测试入口：node node_modules/vitest/vitest.mjs run --config config/vitest.config.ts --maxWorkers=1
覆盖文件：shared/workbench/metrics；main/workbench/metrics 下 definitions、collector-output、collector-service、metrics-execution-core，以及 metrics-runtime；relay/workbench/metrics-handler；renderer/workbench 下 metrics-port、overview-zone-series、overview-metric-readings、overview-metric-zones、use-overview-zone-granularity；version-cycle/metrics-setup；version-planning/use-plan-metrics、PlanningBoard；version-acceptance/acceptance-interaction、acceptance-board-state 的对应 test.ts/tsx。完整数目与运行结果见 vitest.log。

限定类型检查：
```powershell
node --max-old-space-size=512 node_modules/typescript/bin/tsc --ignoreConfig --noEmit --skipLibCheck --strict --module esnext --moduleResolution bundler --target es2022 --types node src/shared/workbench/metrics.ts src/shared/workbench/metric-windows.ts src/main/workbench/metrics/definitions.ts src/main/workbench/metrics/collector-output.ts src/main/workbench/metrics/collector-service.ts
node config/scripts/generate-bundled-skill-guides.mjs
node config/scripts/generate-skill-bundle-manifest.mjs
node docs/05-features/version-planning/prototype/build.cjs --check
```

浏览器：在上述产品提交 checkout 中，把证据分支 out/metrics-review 的 screen.tsx、screen.html、check.cjs 放回原路径：
```powershell
node node_modules/esbuild/bin/esbuild out/metrics-review/screen.tsx --bundle --format=iife --jsx=automatic --outfile=out/metrics-review/screen.js
node out/metrics-review/check.cjs
```
使用 file URL，不占开发端口、不启动 Electron。无深链。

## 截图用例

1. 总览/计划配置入口及验收新指标，1280px。执行：加载三个实际指标组件，保留“正式发布次数”的旧计划目标 5 / 基线 2，验收选择“完成验收的目标数”并采集。期望：新证据 6 次与原计划目标/基线并存，配置入口有会话加号图标和按钮外观，无横向溢出。实际通过：metrics-1280.png。
2. 同一操作，1920px。期望与结果相同：metrics-1920.png。

## 未验证

- 真实 Electron、原生模型会话启动/读取 Skill 正文/遵守、配置试采→PR→人合入→三屏采用→归档→重启独立复算完整旅程。
- SSH、WSL、配对宿主、真实 GitHub/CodeHub 指标脚本与凭据。relay collect 的远端 argv 再推导是既有独立后续。
- 全量测试、全项目 node/web 类型检查与完整构建：内存紧张，未运行；限定测试/tsc 不代替全量。
- Rust main 的 BW 自用 .bw 指标资产未修改。没有远端 upstream 的本地采用分支按本地来源读取。
- CI 在 PR 单独核对，欠费未启动不能记为通过。

