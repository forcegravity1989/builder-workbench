# 总览实施验证

候选：0d180a9507afe7d28ca9751b3f057a12c6820d07；基线：b16e4a04f5ef1e4aebf06479e36e5eec52486e22。截图分支永不合入。

证据分层：截图来自无界面 Edge 中的实际总览 React/ECharts 组件，端口使用替身，左侧明确标识“非 Electron”。真实本地 Git、真实 GitHub CLI 分别独立核对。用户因内存不足要求暂缓 Electron，因此没有真壳截图或真壳通过结论。

## 用例与截图

| 用例 | 执行路径 | 期望 / 结果 | 截图 |
|---|---|---|---|
| 双卡与全文纪要 | 总览 → 当前材料 → 切版本 / 轮次 | 1280 / 1920 无横向溢出；双卡约 166px；两栏正文各 256px，完整正文独立滚动；切换复位 | product-top-1280.png / product-top-1920.png |
| 业务及项目图表 | 总览向下滚动 → 日/周 → 提交标题 → Escape | 四个真实 ECharts 容器；三组 SDLC 图；Issue 仅当前点；标题打开来源，Escape 关闭 | product-metrics-1280.png / product-metrics-1920.png |
| 多指标 | 12 条长名称 → 点击图例 → 下一页 → 键盘右箭头 | 单行图例 2 页，隐藏选择保存；日期提示有界可滚动，无页面横向溢出 | product-many-1920.png |
| 返回恢复与按钮 | 选历史版本 / 轮次 / 两区日粒度 → 设置入口 → 重挂载 | 筛选恢复；设置按钮有 1px 边框及底色，入口回调一次 | product-check.json；设置入口用替身，不证明原生会话创建 |

## 已执行

- 提交前 lint-staged：oxlint、react-doctor、oxfmt 均通过。见 lint-staged.log。
- 针对性 Vitest：17 文件、171 项通过；最终来源弹窗调整后受影响 2 项复跑通过。见 tests-delivery.log、tests-source-dialog.log。
- 图表、窗口序列、视图偏好、Git 历史定向 strict 类型检查通过。见 typecheck-focused.log（空文件表示无诊断）。
- RPC 参数目录与原型构建一致性 --check、git diff --check 通过。
- 两宽度产品组件检查及 12 系列图例，脚本错误 0，横向溢出 0。见 product-check.json。
- 真 Git：固定修订 3eeb93eb1b40691a30b7897d1ba27005cd173003，自 2026-08-31 起读取 8 页 / 1,577 条，对照独立 git log 的 id 与 %ct，0 差异。见 real-git-check.json。
- 真 GitHub CLI：窗口内 59 条已合入 PR，全部真实 mergedAt 由产品 mapper 保留；30 条 mergedAt 与 updatedAt 不同。见 real-pr-check.json。不是原生 provider/runtime E2E。

## 复现

在候选工作树安装依赖后，将 reproduce/ 内脚本复制到该树 out/overview-review/（忽略目录），运行：

```powershell
node out/overview-review/build-product.cjs
node out/overview-review/check-product.cjs
node out/overview-review/check-real-git.cjs
node config/scripts/generate-rpc-params-catalog.mjs --check
node docs/05-features/version-planning/prototype/build.cjs --check
pnpm exec vitest run --config config/vitest.config.ts --maxWorkers=1 src/renderer/src/workbench/overview-metric-chart.test.tsx src/renderer/src/workbench/overview-metric-zones.test.tsx src/renderer/src/workbench/overview-sdlc.test.ts src/renderer/src/workbench/overview-sdlc-zones.test.tsx src/renderer/src/workbench/overview-zone-series.test.ts src/renderer/src/workbench/use-version-minutes.test.tsx src/renderer/src/workbench/use-overview-zone-granularity.test.tsx src/renderer/src/workbench/use-overview-sdlc.test.tsx src/renderer/src/workbench/overview-metric-readings.test.ts src/shared/git-history.test.ts src/main/codehub/work-items.test.ts src/main/github/client/map/work-item-merged-at.test.ts src/main/github/client-work-items-query-paging.test.ts src/main/github/client-work-items.test.ts src/main/github/client-issue-source.test.ts src/main/runtime/rpc/methods/git.test.ts src/relay/git-handler.test.ts
pnpm exec tsc --ignoreConfig --singleThreaded --noEmit --skipLibCheck --strict --target ES2022 --module ESNext --moduleResolution Bundler --jsx react-jsx --types node,react src/renderer/src/workbench/overview-metric-chart.tsx src/renderer/src/workbench/overview-zone-series.ts src/renderer/src/workbench/overview-view-state.ts src/shared/git-history.ts
```

浏览器检查需要本机 Edge 与 Playwright。上述脚本不启动 Electron，不操作用户已打开的窗口。真实 Git 检查在执行时的 HEAD 固定修订上复算，候选多了实现提交，数量可与记录略有不同。GitHub 原始查询可用 gh pr list --repo forcegravity1989/builder-workbench --state merged --limit 100 --json number,mergedAt,updatedAt --search 'merged:2026-08-30..2026-10-05'；该窗口快照随远端变化，不是冻结业务台账。

## 未验证边界

- 真 Electron、macOS、SSH/WSL/配对宿主；真实 CodeHub；真实配置模型及采集脚本 → PR 采用 → 三屏消费 → 重启全旅程。
- 完整 web 类型检查因 VirtualAlloc errno=1455 / out of memory 退出，单检查器亦无法完成；没有类型检查通过结论。完整 node/web 构建与其余全库门禁未运行，不能用定向检查替代。
- 远端 CI 欠费按用户要求不阻塞本轮提交，实际运行状态在 PR Checks 中核对。
- Git 窗口与 CodeHub 上限 10,000；GitHub 搜索上限 1,000；达到上限保持未知。远端列表是读取时快照，不保证跨页事务隔离。Issue 不伪造历史。
- 指标配置当前每次新建原生会话，“继续同次 / 显式新建”未实现；本 PR 只恢复总览筛选，不改变共享会话管线。

