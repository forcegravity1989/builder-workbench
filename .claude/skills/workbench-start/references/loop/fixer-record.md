# fixer 诚实记录（一个已跑通 `issue → MR` 闭环的外部 harness 实例）

> **30 秒导读**：这是一个**外部 harness 项目**（代号 fixer）的客观记录——它把 `issue → 分诊 → 复现(RED) → 修复 → 真实验证(GREEN) → 检视 → 报告 → MR` 做成了能稳定自转的 loop。本文件**只说它是什么、它怎么取舍、它有哪些部件与缺口**，供 BW 侧对照与借鉴；**不是 BW 的设计，也不给 BW 的落地建议**。
> **读者**：看不到 fixer 原仓的 BW 专家 agent。本文件**自包含**——所有需要的判据与部件都在此，**不依赖任何外部路径、无需联网**。
> **来源与诚实声明**：本文件是对 fixer 项目（`DESIGN.md`/`README.md`/`AGENTS.md`/`SKILL.md`/各 `references` 与 `agents`）的**忠实摘录与转述**，非逐字搬运。凡 fixer 自审标为 GAP/在建的项，此处如实照录，不粉饰。

---

## 1. 它是什么

一套套在"某类被维护对象质量"上的 **Harness**——驾驭模型稳定跑通 `issue → 分诊 → 复现(RED) → 修复 → 真实验证(GREEN) → 检视 → 报告 → MR` 的闭环。**它优化的是模型运行的环境，不是模型本身**。与一个"发现侧"项目成对：发现侧产出 `[AI上报]` issue，fixer 负责**处理**。

- **愿景**：常驻自治 loop——自己巡检 issue、标记重复/未复现、定时收口、出运营日报。
- **落地节奏**（重要取舍）：**架构全类型一次铺完，成熟度先催熟 BUG 线路到稳定可靠，需求/文档线路先用人盯门挡住、逐周再催熟**——不高线齐头并进却交付不了一条能用的。

---

## 2. 思想地基（四块）

| 地基 | 一句话 | fixer 的落点 |
|------|--------|-------------|
| **Harness 六要素** | 上下文/工具/编排/记忆/评估观测/约束恢复——驾驭模型跑闭环的六块控件 | 每要素都有对应组件（见 §5） |
| **Workflow 四大器** | 生成器/评估器×2/报告×2/改进器——自转必备部件 | 四器齐（见 §6） |
| **builders 工作台** | 用 Harness 概念围住 agent 的项目管理 | 三层架构（见 §3） |
| **superpowers** | 软件开发方法论 HOW 集 | **蒸馏内联**进角色红旗表，**不直接挂**（重人在环的方法不适配自动流程） |

> 高速公路隐喻：**要更高自主性，运行时必须受更严格约束**。"Agent 每犯一个错，就工程化一个让它不再犯的方案。"

---

## 3. 三层架构（人掌舵 · Harness 工作台 · 工作流）

| 层 | 谁 | 干什么 |
|----|----|--------|
| ① 人 · 掌舵 | 人 | 配置 Harness（写规则、定演进方向）/ 评审决策（看报告与看板）/ 难题介入 |
| ② 工作台 | Harness | 编排（只调度）/ 上下文（薄入口 + 分层供给）/ 约束（确定性卡口）/ 反馈（独立评估器）/ 熵管理（防反复横跳） |
| ③ 工作流 | 一条 issue→MR 的流水 | 发现 → 分诊(关键门) → **复现★核心** → 修复 → 真实验证 → 检视 → 报告/MR |

**关键态**：分诊是**关键门**（先判"该不该修、走哪条路"，不该修的**评论暂停**也是合格交付）；**复现是 loop 的核心动作**（没有真实复现，后面的修复与验证都不可信）；复现(RED)与回放(GREEN)持**同一批测试点**，报告天然前后对账。

---

## 4. 特有取舍（有别于通用 resolver 的地方）

| 取舍 | 要点 |
|------|------|
| **分诊器** | 复现后按**修改规模**分流：小 BUG 直接开发；大规模/需求走 **GATE-PLAN 人 plan 握手**。**不设第三条路**——哪怕 P0 真复现，只要修改是大规模/结构化，就走 plan。 |
| **三种问题来源** | 静态门 / 验收门 / 回放门 + 人上报；每门进 fixer 后走法不同。 |
| **必要的 P0 复现** | P0 = 用真实使用（端到端），**唯一强制**。**不复现不往下走**——未复现是**合法信号**，走人盯门；**禁兜底凑 RED**。 |
| **环境沙箱 md 资产剥离** | per-对象 `env.md` 固定六段，把"环境/安全边界/oracle"从 prompt **剥成资产**，消除"怕副作用 → 退缩/mock 绕过"。 |
| **报告可视化** | 结果报告 = 从证据**编译**的 HTML；过程报告 = 脚本铺底 + 接地叙事。"**清晰 > 标准**"，人有反馈渠道。 |
| **人在环中、不强行 MR** | 拦截（issue 评论暂停）也是合格交付；**自主性是挣来的**：人盯全程 → 关键门 → 完全自治。 |

---

## 5. Harness 六要素 ↔ fixer 的真实组件

| 要素 | fixer 的组件 |
|------|-------------|
| **上下文** | 薄 `SKILL.md` 入口 + per-对象 `env.md` 分层供给（**谁读哪段**有约定）+ 双层记忆 |
| **工具** | 工具白名单 + 确定性卡口脚本（**不靠 prompt 自觉**） |
| **编排** | 主编排**只调度不执行** + `state-machine.md` **单一权威源** + `run_trace.md` 执行轨迹（append-only） |
| **记忆** | **项目记忆**（工程自身：DESIGN/ChangeLog）与**作物记忆**（每个被维护对象：env.md + 该对象 ChangeLog + 公共手册）分开 |
| **评估观测** | **结果评估器**（逐测试点判定）+ **过程评估器**（终审守门）+ 卡口脚本看门 |
| **约束恢复** | GATE 人盯门（复现失败门 / 人 plan 门 / MR 前人确认）+ `check_p0_flip`（**翻转才算验证**）+ `validate_step` 机械卡口 |

---

## 6. 四大器 ↔ fixer

| 器 | fixer 的形态 |
|----|-------------|
| **生成器** | 主编排 + reviewer(analyze，分诊/设计案例) + developer(修复) + 取证实录员(skill-user/executor) |
| **评估器 ×2** | 结果 = test-runner（逐测试点判定）/ 过程 = reviewer(review，终审) + 卡口脚本 |
| **报告 ×2** | 结果 = `build_report` 编译的 HTML / 过程 = 脚本铺底 substrate + 叙事 agent 填接地叙事槽 |
| **改进器** | 离线案例集（能跑）+ flow 规范两套（**公共 spec** + **私有资产规范**） |

---

## 7. 角色（六件套，执行类一律由主编排派发）

每个角色一个 `agents/*.md`：工具隔离启动，**全局视角 + 单一职责 + superpowers 蒸馏红旗表内联**。

| 角色 | 阶段 | 性质 |
|------|------|------|
| reviewer（双模 analyze/review） | 分诊(S2) / 终审(S6) | 唯一有权决定能否合入；analyze 可内部派生 RED |
| skill-user（瞬态干净 Worker） | 复现(S2)/回放(S5) | 空白 Worker，不知自己在测试，真实使用技能产 P0 主证据 |
| executor（辅助记录员） | 复现/回放 | 跑脚本辅助用例，产辅助证据 |
| developer | 修复 | 定位 + 最小修复 + 自验到 GREEN |
| test-runner | 判定 | 读前后证据逐测试点判定，独立于 reviewer（不信自审） |
| reporter | 收尾 | 读 substrate + 过程件 + 会话转录，填叙事槽产过程报告 |

> **分诊并入 reviewer(analyze) 首步**，不单独设 triager。
> **红旗表范式**：每条 = 模型最爱找的借口 → 红旗 → 正确动作。

**角色资产的规范与契约（补录，摘自各 `agents/*.md` 与 `docs/agent-md-spec.md`）**：

- **agent.md 固定 7 节**：frontmatter 4 字段 + body 顺序 `角色 → 上游输入与前置 → 红旗表 → Your Job → Code Organization → Self-Review → Report Format`；每节有"放什么/不放什么"内容契约。
- **description 只写"何时派 + 一句话 scope"**，fresh-context 的自我定位放 body「角色」节，避免重复加载。
- **四码退出状态**：所有 agent 返回 `DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT`，供主编排靠状态码路由（与 reviewer 的 verdict 是**两轴**）。
- **`danger_signals` 结构化自曝**：developer 自检填 `unsure_fix / untestable_cp / missing_env`；"拿不准先标 PASS"被列为红旗。
- **双模 agent 只切两处**：reviewer(analyze/review)、developer(bug/requirement) 只在 Your Job + Report Format 分 `### mode-A/B`，其余节共用，不拆成两个 agent。
- **模型分层**：leaf worker（skill-user/executor）用 haiku，认知重者（reviewer/developer/test-runner）用 inherit；明确 haiku 是能力选择非省成本。
- **leaf 不开子 agent**；派发者代起环境；执行类一律由主编排派发。
- **派发契约单一权威**：skill-user / executor 的"收什么 / 记什么格式"由各自 agent.md 唯一定义，reviewer(S2)/test-runner(S5) 派发时**只引用不重定义**，保证 RED/GREEN 输出件同格式可对账。
- **「盲用户」防泄题**：skill-user 不读 issue/测试点/oracle/期望答案、不读源码、禁 mock，只见 prompt 那一句 + 一个 SKILL.md——比"空白 worker 不读 env"更严。
- **test-runner 非 leaf**：它内部再派 skill-user/executor 产 GREEN 证据；**薄层定位**——只用 S2 固化的同一案例/同一观测点重跑判翻转，不搞全文 LLM 对比引擎。
- **reporter 是 leaf 叙事者**（tools 不含 Agent）：只读 substrate + 过程件 + jsonl，禁改生产文件/补跑/派子 agent。
- **金丝雀原则**：某 agent 套契约要靠"豁免 1 行"才顺，先怀疑规范过度设计，继续砍字段直到顺。

---

## 8. 状态机（单一权威源）

- 状态值**中文见名知义**，key 英文供代码；**一处定义，编排与设计都依赖它，不各自复述**。
- 主干：`已认领 → 分析中(RED) → [规模门: 大规模/需求→待plan确认 / 小BUG→开发中] → 开发中 → 验证中(GREEN) → 审查中 → 已完成`。
- 任意点拦截集 → `已跳过`/`待澄清`（评论暂停 = 合格交付，**终态**）。
- 终态还有 `修复失败`（重试耗尽/blocked）。
- **断点续跑**：一个脚本读工作树里已有产物 → 返回当前状态 → 编排恢复。

**状态的推断与恢复（补录，`check_state.py` / `run_meta.py` 机制）**：

- **状态英文 key → 中文值映射** + **状态 → 下一步映射**（IDLE→S1、ANALYZED/SIMULATED_RED→S2、DEVELOPED→S5、VERIFIED/REVIEWING→S6、RETRYING→S4/S5、CLOSING→S7）。
- **按产物存在性逐级推断状态**：`.verification/` 不存在→IDLE；技术分析+复现案例+测试点→ANALYZED；有 `user_sim_red.md`→SIMULATED_RED（**保守恢复：仍回 S2 而非直接进开发**）；自检记录→DEVELOPED；`user_sim_green.md`+验证日志→VERIFIED；终审 `verdict: fail`→RETRYING、`pass`→CLOSING、否则 REVIEWING；需求路→GATE-PLAN。
- **GATE-REPRO-FAIL 断点识别**：有 `user_sim_red.md`、前态≠已复现、无 `continue_p2` 人决策、且尚未开发时，恢复点设为 GATE-REPRO-FAIL；已开发/已审则交 `validate_step.check_p0_flip` 兜底（**分层守门**）。
- **恢复点带 `requires_human_gate` + note**（如"须先走 GATE 人确认再进 S4"）。
- **固定 14 个过程件逐一判定 existing/missing**（`tracked_files`），供恢复判断。
- **`human_decision` 行首锚定解析**（`^\s*DECISION[：:]`），避免散文里的关键词误命中。
- **run 级状态枚举**（`run_meta.py`，区别于状态机）：`running/parked/fixed/failed/aborted/skipped`；`skipped`（分诊拦截=评论暂停）**不计 fixed 分母**。
- **gate → 决策菜单映射**：GATE-PLAN→D1、GATE-REPRO-FAIL→D2，另有 D3 接管/终止、D4 补缺信息、D7 审报告+审 MR（人决策菜单真源）。
- **退出后状态派生**：patrol subprocess 退出后跑 check_state + run_trace 末态综合，"非 gate 的中间态一律视作 failed（崩溃/异常退出）"。

---

## 9. 确定性卡口（不靠 prompt 自觉）

| 脚本 | 职责 |
|------|------|
| 巡检/取单/认领/评论脚本 | 输出 JSON；认领 marker；状态词→图标映射（看板进度条数据源，**best-effort 旁路**，失败不阻塞转移） |
| `validate_step` | 机械检查：文件存在 / 执行凭证非空 / diff 范围 / 合入范围 / 测试点完整性 / **验证有效性门禁（翻转才算验证）** / ChangeLog 门禁 |
| `check_state` | 工作树 → 当前状态机状态（断点续跑） |
| `build_report` | 证据文件 → 自包含 HTML（验证段强制取测试点表） |

> **入库铁律**：一条 issue → 一个 worktree 一个 MR → `git diff` 只许落在目标对象目录内。

**`validate_step` 的机械检查清单（补录）**：

- **三态退出码**：有任一 `[FAIL]`→退出码 1（"Reviewer 应直接驳回"）；仅 `[WARN]` 无 FAIL→0（"机械检查通过，Reviewer 继续实质审查"）；全过→0。**WARN 一律不阻塞**。
- **规范枚举硬编码 + 严格前缀匹配**：`RED_STATE_CANON=已复现/未复现/部分复现`、`GREEN_STATE_CANON=已修复/未修复/部分修复`、`VERDICT_CANON=PASS/FAIL/SKIP/INCONCLUSIVE`、`HUMAN_DECISIONS=continue_p2/rethink/not_our_issue/abort`；列值须以规范 token 开头，**拒绝大模型自造措辞**。
- **判定列归一化 `_normalize_verdict`**：只去 markdown 粗体/空白、`通过`→`PASS`，**不做同义词兼容**；被 `validate_step` 与 `build_report` **共用**，防门禁与报告口径打架。
- **`check_p0_flip` 分支语义**：PASS 需前态=已复现且后态=已修复；前态∈{未复现,部分复现} 且无 `DECISION:continue_p2`→FAIL，有则降级 WARN 放行；后态=未修复/部分修复→FAIL；需求路整体豁免。
- **`check_skip_wording` 措辞弱提示**：检到"结构性不可复现/SKIP"类措辞只发 WARN、不作放行/拦截依据——注释记明"历史教训：换措辞即可绕过词汇门禁"，**真拦截交状态门禁**。
- **弱检查显式标注**：developer Bash 白名单、主 agent 越界、红绿任务措辞一致性等，脚本内标"弱检查"/只发 WARN，**真约束在 agent 定义里**。
- **测试点表完整性/语义**：逐 TP 前态/后态/判定非空非占位符；FAIL/INCONCLUSIVE 直接 FAIL；需求路前态须 `N/A`、BUG 路前态不得 `N/A`。
- **证据链存在性**：要求 skill-user 的 P0 主证据（`user_sim_red/green.md`，需求路仅 green）；`执行者=script` 时追加 `executor_red/green.md`。
- **`.verification/` 入 diff 一票否决**；`--step review/develop/analyze` 各走不同检查集；`--change-type script/skill/both` 影响 ChangeLog 分级（skill/both 缺 ChangeLog=硬 FAIL）。
- **issue_type 自动判定**：从 技术分析.md/方案.md 的 `issue_type: requirement` 或"类型：需求"判定，默认 bug（更严格）。

**脚本周（`skills/issue-loop/scripts/`）**：`validate_step`（机械卡口）/ `check_state`（状态推断·断点续跑）/ `run_meta`（run 账本）/ `patrol_issues`（巡检；`serve_patrol` 在**插件根目录**、非 scripts/）/ `build_report`·`build_process_report`（报告编译）/ `collect_replay`（证据包）/ `mr_comment`（评论契约）/ `cleanup_worktree`（清理）/ `_codehub_common`（公共依赖探测）。

---

## 10. 验证模型

- **oracle 2 类**：**assert**（脚本/命令/退出码/扫描器可机判，**多数静态缺陷本就 assert 可观测**）/ **llm**（真语义级、grep/read 断言不了的，极少）。
- **P0（唯一强制，必跑）**：真实使用技能（端到端真实可用性）。**禁 mock**；跑不到就如实标阻塞/转人工，不兜底放行。
- **三层职责**：验证（跑证据 + 判翻转）归 test-runner / 过程 review 归 reviewer 点2 / 代码 review 归 reviewer 点3。
- **分层供给（谁读哪段）**：`env.md` 各段按角色下发；**空白 Worker 不读 env**（否则等于泄题）。
- **验证有效性门禁**：只有**可观测翻转**（RED→GREEN 的 stdout/退出码/DOM/截图差异）才算验证，**纯叙事差异不算**。

**结构化判据（补录，test-runner）**：

- **两项硬判据**：`flip_observed`（RED→GREEN 有可观测差异，**纯叙事/标签差异=false**）+ `failure_reason_ok`（RED 失败须是"issue 现象"，非笔误/环境没起来/认证过期等无关失败）；**任一为否不判 PASS**。多缺陷 issue 每 acceptance 子项**各自给 flip_observed，不打包**。
- **`core_ask` 独立判定**：以真实使用（user_sim）为准；脚本 PASS 但用户没真办成→`core_ask_not_verified`。
- **`P0_not_reproduced` 不得 SKIP 顶替**：前态≠已复现=P0 未复现，禁悄悄 SKIP → 建议主编排走 `GATE-REPRO-FAIL`。
- **判定列是规范枚举字段**（机器严格匹配）：只填 `PASS/FAIL/SKIP/INCONCLUSIVE`，**不带注解/粗体**，理由另落 `验证日志.md`。
- **证据不足 → INCONCLUSIVE**（禁自己重跑技能补证据）；原始 FAIL 不得叙事消化。

---

## 11. 记忆与报告

- **两层持久记忆**：**项目记忆**（工程自身）vs **作物记忆**（被维护对象）；**只对象的 ChangeLog 入对象仓**，过程证据一律不入库。
- **报告 = 编译产物**：结果报告**不是写出来的，是从证据文件编译出来的**；一个事实只有一个权威源、只渲染一次（避免冗余/割裂）。
- **过程报告**：脚本铺底证据底（不写判断）+ LLM 填接地叙事槽；诚实护栏 = **每句引证据 + 原文可展开核对 + 不脑补**。

**报告的编译细节与诚实护栏（补录）**：

- **`build_report` 结果报告**：固定五卡硬序（问题→根因→复现与验证→修复方案→风险）；正文取自 `验收总结.md` 固定五段、**必须与对账表一致**；复现验证卡下挂逐 TP before/after（已含真实使用 P0 + script 辅助），故**不另挂折叠总表**；截图以 **base64 data URI 内嵌**保自包含；只渲染 `git diff --stat` 概览（完整 diff 去 MR 看）。
- **安全默认**：终审判定解析不到 → `unknown` 要求人工核对，**绝不默认 pass**；`_verdict_cls` 先判 fail 再判 pass，防 `"pass" in vl` 把带注解的 PASS 误染绿；与门禁**共用判定归一化器**。
- **段落缺失时从旁证兜底**（技术分析/终审/user_sim_green…），明示"兜底只为报告不空"；可视类 TP 缺截图只发 **WARN 不 FAIL**（狭义关键词判可视类）。
- **`build_process_report` substrate**：职责被限定为**只搬原文 + 算确定性指标，不写一句人话判断**；四数据源固定（run_trace / `.verification/` 产物 / per-agent jsonl / session+meta）；**缺 run_trace 或缺可识别状态节点 → 显式插 `BLOCKED:`，不静默**；翻车点由固定 markers 机械提取；P0 起源与标注变化专项抓取。
- **reporter 诚实护栏**：每句实质陈述**必引证据**（`[run_trace:Lxx]`/`[transcript agent-xxx]` 等）；原文 `<details>` 折叠、正文讲人话；`grep` 自扫"无引用句占比 <5%"；**张力双呈现**（run_trace fail 与终审 pass 都呈现并标差异）；证据缺失如实标、不脑补、不粉饰。
- **`collect_replay` 证据包（replay bundle）**：落 `worktree/.harness-memory/replay/<iid>/<run_id>/`，**本地文件、无数据库、不推远端**；`run_id`=UTC 时间戳+4 位 hex（同 iid 多 run 不覆盖）；内容 = `.verification/` 全量 + `git diff`→diff.patch + 主/子 jsonl + `bundle.json` 索引；**采集失败仅 WARN 不阻塞主流程**；锁定唯一 session 靠打分排序（子 agent meta 命中与主 jsonl 内容命中**同分**、时间窗兜底分更低；先后仅体现在检查顺序）。

---

## 12. 自动起手与改进器

- **patrol**：定时 dispatcher 轮询"新 issue / 人决策信号 / 检视意见" → spawn 或续跑主编排（**取代夜跑**）。GATE 在无人环境下**异步 park**（写决策待办后退出，等人填决策再续跑），**GATE 的"必经人确认"语义保留**。
- **cron registry**：所有定时任务登记（源实现字段 `name/desc/interval/cmd/source_path/trigger_type/status`；**无 owner 字段**），**未登记 = 统计不到 = 没规范**。
- **改进器**：**离线案例集（能跑、可回放）+ flow 规范两套**（公共 spec + 私有资产规范）；遇到问题按规范改，不靠记。
- **看板（可选）**：规范 + 脚本 + 渲染三位一体；三层指标（**北极星（双·互相约束防作弊）+ 引领（可控行动）+ 滞后（结果）**）；**数据由脚本零 LLM 机械派生，缺数据标灰，绝不标绿充数**。

**patrol / 改进器 / 看板 / connectors 的具体机制（补录）**：

- **`serve_patrol` HTTP dispatcher**：独立进程起 scheduler+worker 双线程，暴露 `GET /runs` / `POST /decide` / `POST /abort`；running 期把 pid/session_id 写 `.patrol/inflight/<iid>.json`（去重）；**启动清 stuck running**（崩溃残留标 FAILED + taskkill）；**atexit 杀子进程**防孤儿；超时重试 1 次、超时 `taskkill /T /F` 杀进程树；`session_id` 从 `claude -p --output-format json` 解析，续跑走 `claude -p --resume <session_id>`。
- **`detect_round` 三类信号**：①未 claim 的 `[AI上报]`（认领=写"处理中"评论锁）；②`parked` ∧ human_decision.md 有 `DECISION:` ∧ mtime > `last_resume_ts`（throttle 防 stale 决策反复入队）；③`fixed` ∧ 有 mr_url ∧ discussions > baseline。
- **决策先落盘再续跑**：`/decide` 先 append 进 `human_decision.md`（决策权威源）再 enqueue；prose→token 归一（无法映射回退 raw）。
- **auto-mode 覆盖契约**：spawn 新 issue 时注入 7 条覆盖（禁 AskUserQuestion、遇 GATE 写产物后退出、仅 GATE1/GATE2 自动continue…）。
- **改进器 reverse-apply 造题**：`depends.zip` = 取 fix commit 的**父 commit** 文件状态打包（保留被测 skill 相对路径、不含 fixer、跳过新增文件）；自动生成 `case-metadata.json` 消与手维护的漂移；zip-slip 防护（拒 `../`/绝对路径/越界前缀）。
- **TASK.md 防泄漏**：frontmatter + 痛点 + 复现路径 + 预期；跑时**只取正文喂 fixer（去掉"预期"段，防泄漏 test intent，**但源实现只剥 frontmatter、未去“预期”段**）**；runner 自建 worktree + apply_depends + 把 buggy commit 进去，fixer 从 S2 正常跑，**不靠"案例模式"**。
- **改进器账本**：`run_meta.json` 为唯一权威（弃 night-run queue.json）；重跑前**先溢出旧 run**（run_meta + 报告 HTML + fix.diff）到 `cases/<id>/runs/<run_id>/`，`.verification/` 全量不溢出避免膨胀；`compare_runs` 逐字段 diff + 硬判两类退步（verdict pass→fail/blocked、state fixed→failed/parked/aborted）；`fixer_version` 跨版本回归。
- **看板 `derive_board`**：6 行资产台账机械判定（已建/骨架/留白）；`last_verified` 取 `git log -1 --format=%ai`；`weekly_history` **从事件时间重建**真实周（不靠快照），无时间源→None 标灰；`weekly_delta` 取上个完整周（末值不取）；`open_gaps[]` 收 None/GAP（唯一 id/kind/indicator/建议动作），GAP 分四类（无规范/无埋点/口径降级/目录待建）；双北极星**同分母**互约束；`data.json` 为 runtime 派生产物、**不 git-commit**。
- **connectors 定位**：封装"连接的外部系统（WeLink/CodeHub）"**而非数据源连接器**；纯连接层零业务逻辑、返回原始数据不解释、错误直接抛出、token 从环境变量读、stdlib 无第三方依赖；`welink_client` 参数以列表传 subprocess（防注入）；`codehub_client` 与 `commit-push-pr/codehub_api.py` 并行（迁移是后续单独 refactor）。

---

## 13. 维护规范（fixer 自己怎么防止腐烂）

| 约束 | 要点 |
|------|------|
| 改了就落账 | 任何改动必须写 ChangeLog（动机/关键变更/影响） |
| 动了设计就同步 DESIGN | 角色职责/状态机/禁止项/产物契约变更必须同步，**不允许各说各话** |
| 防 md 膨胀 | **一个事实只有一个权威源、只写一次**；角色 prompt 保持薄；新增前先问"该进哪个文件" |
| **遵循度差先查 md，别加脚本兜底** | agent 跑偏根因多半是 **md 矛盾/冗余/散落 → 加载到错信息**；先修 md，不靠新 gate 兜底 |
| 敢于删不续写 | 旧表述啰嗦/矛盾/过度设计时，**优先删冗余/归一权威源/瘦身**，不在旧表述上续打补丁 |
| review 方法论 | 只报真问题（会误导 agent 跑偏/卡口真坏/与权威源矛盾/一事实多源/简单问题复杂化）；三镜头：哲学边界 / correctness / 可读性 |
| **不维护单测，验证走真实离线跑** | 删光测试目录、无例外；卡口自证靠"真实跑"，不留测试大坝 |
| 版本号同步 | 改动与版本号同步（`plugin.json`） |

---

## 14. fixer 自审的诚实缺口（原样照录，不粉饰）

fixer 自审标为未到位的项（截至记录时）：

- **评估观测 ⚠️**：某前后门禁未接（某项升级 GAP）。
- **约束恢复 ⚠️**：机械卡口当前是"自觉跑"，**非 Hook 硬门禁**（列为升级方向）。
- **改进器 ⏳**：**在线自愈未建**；案例集当前为"1 个示范能跑，扩 10 中"。
- **改进器约束**：headless 环境缺 Bash（平台限制）。

> 记录这些是为了**诚实**：一个成熟的 loop 也仍在补 GAP；"到位"不等于"完美"。

---

## 15. 体量与自包含

- fixer 是**成体系的工程**：含 `DESIGN.md`（设计总纲）、`README.md`（对外叙事）、`AGENTS.md`（维护手册）、`SKILL.md`（编排）、`state-machine.md`/`discipline-rules.md`/`skill-fix-handbook.md`/`path-requirement.md`/`static-scan-issues.md`/各模板/`replay-bundle-schema.md`（references）、6 个 `agents/*.md`、多个 `scripts/*.py`、`docs/*-md-spec.md`（维护规范）、`board/`、`improver/`、`connectors/`、`cron/`。**整份搬运体量过大，且大半是"本项目专属事实"，对本处无价值。**
- 本文件只留**可迁移的模式与部件**，已足够让读者理解"一个自转 loop 长什么样"。
- **覆盖度**：本记录已把 fixer 的 74 个文件中"**可迁移的做法/机制**"通扫一遍（角色契约 / 状态机与恢复 / 确定性卡口 / 验证与结构化判据 / 报告编译与护栏 / patrol / 改进器 / 看板指标 / connectors / 规范体系 / 模板契约），按主题归并；**跳过的是纯项目专属事实**（具体 repo_path、issue 号、一次性调试旋钮、benchmark 时长数字等）。

---

## 16. 规范体系与模板契约（补录）

fixer 把"每类资产怎么写"也做成了规范正本，落地/审计时对照：

- **agent-md-spec**：见 §7（7 节契约）。**command-md-spec**：能一步委派给脚本/技能=command（薄 .md），不复述流程、不堆设计理由，变重即升 skill。**env-md-spec**：frontmatter 标 `owner`/`last_verified`，超 30 天标 stale，每跑完一次该技能 issue 在 S7 更新 `last_verified`，无 owner 分诊 WARN；env 资产台账为单一权威表（供统计存量/owner 覆盖/活跃度）。**skill-md-spec**：body 固定 8 段 + anti-patterns（禁 narrative storytelling / description 总结流程 / 规则在模板重复=双源漂移）；存量 skill 只做外科手术式补丁（禁正文大重构）；description 双风险（过宽抢触发 / 过窄等于不存在）。
- **脚本驱动 north star**：好编排**理想可转脚本驱动**——脚本（卡口/状态机/check_state/validate_step）是硬骨架，agent 只干真需 LLM 的活；**去模型层级 framing**（不把"让某档模型跑通"写进规范）。
- **测试点模板**：9 列（TP/执行者/优先级/路径操作/oracle/期望/前态/后态/判定），逐列绑填写角色；**"有且仅有 1 条 P0=skill-user"**（辅助 script 点仅在 P0 不足坐实根因时补，非配额）；BUG 路前后态同一观测点、语义相反，需求路前态填 `N/A（新功能无前态）`是合法值。
- **验收总结模板**：段序强制 `问题→根因→复现与验证→修复方案→风险`（`build_report` 靠子串匹配编译）；逐 TP before/after 由报告自动渲染，本段只写"表格给不出的东西"。
- **path-requirement（一套 agent 两条路）**：`path=requirement` 时主编排注入该文件路径，agent 读后调行为，**不另造 agent**；需求路 GATE-PLAN 必经（不接受 auto）、免 GATE2、只跑 GREEN。
- **skill-fix-handbook 通用 7 法**：先复现后修复（Evidence over Claims）/ 最小改动+优先纠正既有逻辑而非平行加分支 / 改 SKILL.md 视同改提示词必走全文前后对比 review / 改动波纹 grep / 每 issue 一条 ChangeLog 先读后写只更新同一条 / doc-code-mismatch 先判权威方禁反射式让代码符合文档 / 多缺陷每子项各自取可观测证据。**红线**：禁改 S2 写定的 oracle/期望/前态；禁在 `.verification/` 写修复产物；禁新外部依赖/改技能范式；禁硬编码凭据。**踩坑沉淀**：`YYYY-MM-DD · skill · 坑 → 防御` 倒序追加。
- **静态门归因决策树**：报错先问"规则合理吗→作物真不规范吗→两边都不安全才转人工"，把门当镜子区分"改门/改作物/转人工"；策略表为 owner 维护的活文档（每类报警对齐后写结论、可复用）；静态门 P0 = 调 `admission_check`（assert 扫描器退出码），不走 llm/不走 reproduce 脚本；**红线**：禁反射式扩白名单/降 fail→warn，一条 issue MR 不同时改门+改作物。
