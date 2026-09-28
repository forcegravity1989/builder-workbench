# 版本报告数据契约

> 每条事实写来源路径与取法；没有来源的字段留空（空串 / 空数组 / null）。脚本只做确定性解析与回填，不编事实；模型判断类工作（归纳、标注 kind）由会话按 SOP 完成。

数据文件：`<工作目录>/.bw/planning/<版本>/report.json`，由 `scripts/report.py init` 从 `assets/report-template.json` 建立。所有写入走会话直接编辑该 JSON，再 `render` 出 HTML。出包与验收执行状态的正本在交付验证报告与 PR 正文；本契约的 `head.packaged_at` 与 `health.build/pack` 只回填读回的结论值，报告引用时附 runId。

## 报告版式（se-report-4）

页面向下依次为：页眉（紧凑单行元信息）→ 流程条（模板静态，报告生成六环节：计划与证据盘点 → 构建与打包 → 自动化验证 → 安装包验收测试 → 数据采集与回填 → 渲染、评审与归档）→ 首屏状态栏（目标状态 chip、任务 Issue 计数 chip、编译/打包与两档用例计数 chip 全部单行内联；备注在 chip 下方整行铺底，不做卡片）→ 01 目标 → 02 任务 → 03 目标验收·E2E 用例与截图 → 附录·基础用例 → 页脚。首屏不重复目标标题，目标正文只在 01 出现一次。模板数据槽共 9 个：`version / head-meta / overview / health / goals / tasks / cases / appendix / foot`；overview（目标与任务 chip）先于 health（构建与用例 chip、备注行）渲染，两槽同处状态栏容器。

## 顶层

| 字段 | 来源 | 缺失 |
|---|---|---|
| schema_version / template_version | 固定 `3` / `se-report-4`（init 写入） | 渲染前校验，不符报错 |
| version | 命令参数（init 写入） | 必填，须为安全目录名 |
| project | 工作目录名（init 写入） | 可改 |
| generated_at | 渲染前会话填当前时刻 | 留空则页脚用默认说明 |
| foot | 会话一句话注脚 | 同上 |

## head（页眉单行元信息）

按「项目 · 版本对 · 源码修订 · 出包时间 · 发布标识 · 发布入口」单行渲染，值支持 HTTP(S) 链接。

| 字段 | 来源 | 缺失 |
|---|---|---|
| version_pair | 本版计划标题与版本（如 `v0.3.2 → v0.4.0`） | 留空，该项不出现 |
| source_commit | `git rev-parse HEAD`，渲染只取前 12 位 | 留空 |
| packaged_at | pack 完成时刻（出包 stdout 或产物目录时间） | 留空 |
| release_tag / released_issue | 真实 tag / Issue 号 | 没有就留空，不造 |

## health（健康卡）

| 字段 | 来源 | 缺失 |
|---|---|---|
| build / pack | 门禁与出包结论，取结果值（`ok / failed` 等） | 留空显示「未跑」 |
| acceptance / basic | 用例计数 `{passed, total}`；须与 cases 里对应 kind 的实际条目一致 | null 显示「未跑」 |
| artifact_dir | 安装包产物目录（工作目录内相对路径） | 留空则无该 chip |
| note | 状态栏备注。报告面向上级汇报，**默认留空**：过程异常与解释（dirty、未跑项原因、哈希等）在收尾会话里向人说，不写进报告 | 留空不渲染；有值时在状态栏 chip 下方整行铺开，不进 chip |

## goals（01 目标卡片 + 首屏状态 chip）

来自本版 `.bw/planning/<版本>/data.json` 的 `goals`（计划文档 schema 3；schema 2 的 `plan.goals` 旧形状已随显式迁移退役），报告不另写一份承诺。`label` 取 `goalId`，`title` 用原文，`metric / target` 来自 `metricTargets`（定义名与目标值；未绑定时如实留空，不从旧待核文本凑数）。每条：`label`（如 G1）、`title`、`metric / target`（指标定义与目标值）、`state`、`deliverable {label, url}`（该目标的本版交付条目：url 为仓内相对链接，空串渲染纯文本，如「本报告（本页）」）、`note`。`state ∈ passed / passed_with_debt / failed / not_run / not_applicable`，渲染映射达成 / 部分达成 / 未达成 / 未验收 / 不适用。首屏 chip 只渲染 label、状态与目标值（不重复 title）；指标、交付件与 note 只在 01 卡片出现。**不设 baseline / reading 字段**：目标值与状态已足够表达进度，读数依据写进 PR 正文与收尾会话，不进报告数据。卡片默认只放计划正本的目标内容与进度：`note` 留空不渲染，收尾解读（快照、过程说明）在会话里向人说，不堆进卡片。计划缺失时留空数组，渲染显示留空说明。

## tasks（02 任务表）

来自本版计划 `tasks`（schema 3 结构化引用：`provider / repository / number / goalId?`）；每条 `number`（Issue 号）、`url`（由 provider、repository、number 组装或从 provider 读回）、`title`（从 provider 读回，计划文档不存标题文本）、`goal`（对齐目标 goalId/label）、`status {label, tone}`、`note`。状态与标题用 `gh` 或 provider 读回每个 Issue 的当前值，不凭记忆写。`tone ∈ accent / success / warning / danger / neutral / outline`。

## cases（03 目标验收 + 附录基础用例）

同一数组按 `kind` 分流渲染：`kind = 'acceptance'` 进 03 节（本版目标验收点），`kind = 'basic'` 或缺省进附录（冒烟与通用回归）。每条：

| 字段 | 来源 | 缺失 |
|---|---|---|
| id / title / path / expect | verify `result.json` 或 e2e JSONL 的用例定义（collect 产出） | — |
| status | 同上运行结论，`passed / failed` 等 | 空显示「未跑」 |
| message | 运行消息（e2e 缺省时回退 title） | 留空则无该行 |
| evidence | `[{file, url}]`；url 是图片则渲染截图网格，否则列文件名 | 空数组则无 |
| note | 会话补充说明 | 留空则无 |
| kind | 会话标注：对上本版目标的验收点为 `acceptance`，其余 `basic` | 缺省按 basic |
| suite | collect 回填：verify 里用例所属 step id（用例在 result.json 中按 suite 分 step 存储） | e2e 线用例无此字段 |
| suite_label | 会话标注的分组标题；同一 kind 内按此分组渲染小标题，组顺序 = 数据数组中首次出现顺序 | 缺省回退 suite 原值；两者皆空则平铺 |

截图复制：collect `--shots-to <目录>` 把 evidence 图片复制到 `<版本>/shots/`，文件名 `<stepId>-<caseId>__<原名>`（非安全字符转 `_`），url 回填相对路径供 HTML 引用。

## collect 采集契约（脚本产出，会话据此回填）

| 命令 | 读取 | 产出 |
|---|---|---|
| `--verify-run <runId>` | `.bw/release/out/verify/<runId>/result.json`（v=1；steps[].cases[]；evidence 文件在 `runDir/<stepId>/`） | `verify.case_list`（含 evidence 相对路径与复制结果）、`cases {passed, total}` |
| `--e2e-log <路径> [--e2e-root <目录>]` | JSONL 末条 `type=result` 行（cases[].evidence 相对 e2e-root，缺省为日志所在目录） | `e2e.case_list`、`cases {passed, total}` |
| `--artifact-dir <目录>` | 产物目录（须在工作目录内） | 逐文件 name / size / SHA-256 |
| `--readings [--since 日期]` | `.bw/metrics/readings.jsonl`（bw/ledger 分支） | 读数行，按 day+name 排序 |
| `--shots-to <目录>` | 配合上面两线 | 图片复制与 url 回填（见 cases 节） |

路径一律限定工作目录内，越界报错。evidence 文件缺失时仍登记文件名，不中断。
