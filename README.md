# 总览实施与独立检视验证

候选：8f7ce60f8cbd95746afb2ad170c45cdffefd5d32；基线：b16e4a04f。shots/codex/overview-journey 永不合入。

截图来自无界面 Edge 中的实际 React/ECharts 组件，端口使用替身，不是 Electron。用户因内存不足要求暂缓真壳；脚本不操作用户正在使用的窗口。

## 独立检视结论

三位 subagent 分别检视顶层/特性文档资产、实现调用链、测试与证据；根代理核对和修复，代码代理复核。
- 同步架构、特性规格、源码清单中的旧 SVG、PR 不可采集、分页/筛选未实现等错误说明；词表删除 ledger/手填/每日覆盖语义。
- 校正业务 MetricsPort 与 renderer SDLC 的真实职责，删除过期施工安排，上游扩点表登记 Git 分页及 mergedAt。
- 修复跨日/周后业务横轴与刷新窗口脱节、SDLC 切粒度/项目沿用旧日期。
- 不可读归档保留版本/来源/原因和重试，不再表达为没有材料。
- 有效当前值/文本读数使用准确空态，不画伪历史；隐藏系列不影响可见空态。
- 项目名片按项目身份隔离，切项目时不显示上一项目内容。
- 删除无消费者的图表返回字段、仅测试调用的刷新API。合并两项重复用例，增加一项跨周回归，未新增测试套件。
- 补强原浏览器脚本的重载恢复及tooltip断言，修正证据文字强于实际断言的问题。

文档头部职责未变；不另建台账。未修改共用工作区壳、计划/验收产品实现或hifi；已有原型快照仍被原型使用，保留明确的原型身份。

## 用例与截图

| 用例 | 执行路径 | 期望/结果 | 证据 |
|---|---|---|---|
| 双卡与全文 | 当前材料 → 版本/轮次 → 两栏滚动 | 1280×800、1920×1080无横溢，首行约166px，两栏正文各256px独立滚动、切换复位 | product-top-1280.png / product-top-1920.png |
| 业务/项目图 | 天/周 → 提交标题 → Escape | 四个ECharts容器；Issue仅当前点；来源弹窗开关 | product-metrics-1280.png / product-metrics-1920.png |
| 多指标与恢复 | 12条长名称 → 隐藏 → 重载 → 下一页 → 键盘右箭头 | 实际ECharts显隐恢复；两页图例；tooltip高160px、内容可滚动、不超容器 | product-many-1920.png |
| 视图与入口 | 选版本、C2、两区天粒度 → 设置 → 重载 | 版本/轮次/两区粒度恢复；按钮有边框/底色且回调一次；只证明入口回调 | product-check.json |
| 不可读归档 | 仅有坏归档 → 展开 → 重试 | 显示版本、提交、原因和“暂无可读取的版本材料” | product-unreadable-archive.png |
| 项目名片隔离 | A → B，延迟B响应 → 释放响应 | 等待时不显示A名片，完成后显示B名片 | product-project-switch.png |
| 当前值/文本 | 注入当前数值及文本替身 | 准确提示当前/文本，不伪造历史 | product-current-readings.png |

## 已执行与证据版本

- 当前候选受影响的7个Vitest文件、45项通过：tests-audit.log。强化已有planRef/不同修订、UTC+8午夜、GitHub查询扩日、跨周窗口与隐藏空态用例；总用例数相对原提交净减少1项。
- 提交前lint-staged（oxlint/react-doctor/oxfmt）及diff-check通过：lint-staged-audit.log。
- 7份改动文档文件链接检查无错误；外链/锚点不在检查器覆盖内：doc-links-audit.json。
- 浏览器两宽度、新错误态、名片隔离及当前/文本场景通过，页面错误0：product-check.json。
- 初始候选0d180a950的17文件171项、来源弹窗2项复跑、定向strict类型检查、RPC catalog与原型构建检查是基线证据，保留于tests-delivery.log/tests-source-dialog.log/typecheck-focused.log；不是当前候选的全库通过结论。
- 真实Git固定修订3eeb93eb1自2026-08-31读取8页/1,577条，与独立git log身份及%ct一致；GitHub只读59条PR的mergedAt映射一致，30条不同于updatedAt。本轮未改这些适配，保留real-git-check.json/real-pr-check.json，只证明只读来源与映射。

## 复现

安装候选依赖，将reproduce/脚本复制到out/overview-review/后运行（需Edge及Playwright）：

```powershell
node out/overview-review/build-product.cjs
node out/overview-review/check-product.cjs
pnpm exec vitest run --config config/vitest.config.ts --maxWorkers=1 --no-file-parallelism src/renderer/src/workbench/overview-metric-zones.test.tsx src/renderer/src/workbench/overview-sdlc-zones.test.tsx src/renderer/src/workbench/overview-sdlc.test.ts src/renderer/src/workbench/overview-zone-series.test.ts src/renderer/src/workbench/use-overview-sdlc.test.tsx src/renderer/src/workbench/use-overview-zone-granularity.test.tsx src/renderer/src/workbench/use-version-minutes.test.tsx
```

图表、归档、延迟名片是明确替身，不证明native provider/runtime、真实模型配置或采集。真实Git脚本按执行时HEAD复算，数量可能随提交变化。

## 剩余边界

- Electron/macOS、SSH/WSL/配对宿主、真实CodeHub、配置模型/试采/PR采用/三屏消费/重启旅程未验。
- 名片既有入口只读本机文件，远端宿主适配未完成；本轮仅修复切换项目串名片。
- 配置指标仍每次新建原生会话，续接未实现；无指标每日自动化/读数账本，定义/脚本/采用证据仍保存。
- 完整web类型检查此前因VirtualAlloc errno1455/内存不足退出，完整构建及其余全库门禁待资源充足环境；本轮没有重试大内存检查。
- 最新[PR Checks](https://github.com/forcegravity1989/builder-workbench/actions/runs/36422183914)和[PR test LoC](https://github.com/forcegravity1989/builder-workbench/actions/runs/36422183291)因账户付款/额度不足未启动，按用户要求不处理账户问题、不记通过。
- Git/CodeHub窗口上限10,000、GitHub搜索上限1,000；截断保持未知，远端列表不保证跨页事务快照，Issue不伪造历史。

