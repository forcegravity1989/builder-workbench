# 版本报告数据契约

> 每条事实写来源路径与取法；没有来源的字段留空（空串 / 空数组 / null）。脚本只做确定性解析与回填，不编事实；模型判断类工作（归纳、标注 kind）由会话按 SOP 完成。

数据文件：`<工作目录>/.bw/planning/<版本>/report.json`，由 `scripts/report.py init` 从 `assets/report-template.json` 建立。所有写入走会话直接编辑该 JSON，再 `render` 出 HTML。

## 报告版式（se-report-3）

页面向下依次为：页眉（紧凑单行元信息）→ 流程条（模板静态：本版计划 → 开发与合入 → 出包 → E2E 验收 → 版本报告）→ 首屏总览（健康卡 + 目标状态行 + 任务计数）→ 01 目标 → 02 任务 → 03 目标验收·E2E 用例与截图 → 附录·基础用例 → 页脚。模板数据槽共 9 个：`version / head-meta / health / overview / goals / tasks / cases / appendix / foot`。

## 顶层

| 字段 | 来源 | 缺失 |
|---|---|---|
| schema_version / template_version | 固定 `3` / `se-report-3`（init 写入） | 渲染前校验，不符报错 |
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
| artifact_dir | 安装包产物目录（工作目录内相对路径） | 留空则无该卡 |
| note | 会话备注（如验证 Profile 与 runId） | 留空则无该卡 |

## goals（01 目标卡片 + 总览行）

来自本版 `.bw/planning/<版本>/data.json` 的 `plan.goals`，报告不另写一份承诺。每条：`label`（如 G1）、`title`、`metric / target / baseline / reading`（指标定义与实际读数）、`state`、`note`。`state ∈ passed / passed_with_debt / failed / not_run / not_applicable`，渲染映射达成 / 部分达成 / 未达成 / 未验收 / 不适用。计划缺失时留空数组，渲染显示留空说明。

## tasks（02 任务表）

来自本版计划 `plan.tasks`；每条 `number`（Issue 号，无则用 `id`）、`url`、`title`、`goal`（对齐目标 label）、`status {label, tone}`、`note`。状态用 `gh` 读回每个 Issue 的当前值，不凭记忆写。`tone ∈ accent / success / warning / danger / neutral / outline`。

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
