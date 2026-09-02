# 原型 · native-audit v2 锚点卡：builders-workbench（2 分锚）× deepseek-harness（3 分锚）

> **30 秒导读**：这是什么——准则 v2（[rubric.md](rubric.md)，9 段 37 条）的**实跑证据**：同一份 `battery.sh` 在两个真仓各跑一遍（R6，2026-09-02），逐条列读数与定级。给新仓定级前先对照这两张卡。结论——dsh 落在 3 分区（28 条 3 分 / 8 条 2 分 / 1 条 1 分），BW 落在 2 分区（6 / 20 / 10 / 1 条 0 分），尺子与锚点相符。末节记录探针残余误报的分类与本轮迭代（R5–R6）修掉的缺陷。

## 九段汇总

| 段 | BW | dsh | BW 的差口一句话 |
|---|---|---|---|
| S0 规矩正本 | 2 | 3 | 手册与原则齐，缺子树正本、字数预算门禁 |
| S1 计划·意图 | 2 | 3 | changes/ 意图件成文，无 issue/PR 模板、链接无门禁 |
| S2 设计·决策 | 2 | 3 | 11 份记录 0 份有「替代方案」节，无格式门禁、无冻结 |
| S3 构建 | 2.5 | 3 | 门禁/worktree/严格编译已到 3；无生成物门禁、commit 不可机械分类 |
| S4 测试·验证 | 2 | 3 | E2E-only 成文但主判据不在 CI；无回归先于修复、无抖动测试纪律 |
| S5 评审·合入·发布 | 2 | 3 | 评审与合入门到 3；**零 tag、零发布 workflow**、回滚只在引用里 |
| S6 运维·复盘 | **1** | 2 | **零份复盘**、事故只留在 CHANGELOG 散文、无脚本化检测——BW 最弱的一段 |
| S7 知识维护·反 slop | 2 | 3 | 写作纪律成文，**文档门禁 0 个** |
| S8 AI 协作 | 2 | 3 | AI 同通道到 3；无多 harness 元数据门禁、无 agent 配置回归 |

段分 = 该段各条中位数。dsh 未满 3 的条目见明细，多为「成文但无机器强制」（C03/C31/C36/C44/C52/C61/C62/C72）与回滚演练（C55=1）——rubric 中 dsh 作 3 分锚是指整体分布，不是逐条满分。

## 三十七条并列明细（读数来自 battery.sh，HEAD：BW 7c539c2+ / dsh dd6322d604）

| # | 探针读数 BW | 探针读数 dsh | BW 级 | dsh 级 | 定级依据（BW 证据路径 / dsh 证据路径） |
|---|---|---|---|---|---|
| C01 | 入口件 2，子树 0，手册 7/12 周有改 | 25 / 20 / 12/13 | 2 | 3 | BW 仅根 AGENTS.md+CLAUDE.md 导入；dsh 21 层手册且字数预算门禁 |
| C02 | 12,762 字符，预算门禁 0，自描述段 0 | 16,445 / 2 / 1 | 2 | 3 | BW 靠「约定要短」自觉；dsh `verify-doc-budgets` |
| C03 | 地图/词表 3 件，read-before 2 | 2 / 1 | 2 | 2 | 两仓分层表成文，事实重复复述均无机器查 |
| C04 | skill 8，手册引用 4 | 17 / 3 | 2 | 3 | dsh `verify-skill-invocation-metadata` 对齐门禁 |
| C11 | issue 模板 0，PR 模板 0，intent 4，issue 自动化 2 | 5 / 2 / 52 / 2 | 2 | 3 | BW 意图件走 changes/+codehub issue（产品层）；dsh 模板+脚本守 |
| C12 | 134 md，死链 2（举例文字，误报） | 2,824 / 27（模板占位，误报） | 2 | 3 | dsh `verify-md-links` 门禁；BW 无 |
| C21 | 决策记录 11，格式门禁 0，成文 2 | 839 / 6 / 1 | 2 | 3 | BW `principles/02` 成文非强制；dsh 同 PR 强制+格式门禁 |
| C22 | 带替代方案 0/11 | 820/839 | **1** | 3 | BW `docs/adr/0001-0003` 无替代方案节；dsh mandatory |
| C23 | 生命周期目录 0，STATUS 4，冻结 0 | 4 / 0 / 1 | 2 | 3 | BW 用 STATUS.md 记状态；dsh 路径即状态+冻结 manifest |
| C31 | plan 4，先计划成文 2 | 1 / 53 | 2 | 2 | 两仓皆成文（BW `02` plan 段 / dsh acceptance criteria），皆无「批准前不动文件」拦截 |
| C32 | hook 0，门禁 6（自测 0），workflow 4 | 1 / 38（自测 18）/ 19 | 3 | 3 | BW `ci.yml` L21-49 强制 6 guard+fmt/clippy/test；扣分注：自测 0/6 |
| C33 | AI/worktree 合并 67/130，成文 2 | 3557/6313 / 0 | 3 | 3 | BW worktree+MR 唯一通道成文且由 ▶跑 产品化；dsh worktree-local hooks |
| C34 | gen 脚本 0，vendor 清单 1 | 19 / 1 | **1** | 3 | BW 无生成物新鲜度门禁（codegraph 例外走 CI 发布）；dsh 19 对 gen/verify |
| C35 | 严格编译 4，lint 配置 0（clippy -D 在 CI），dependabot 0，依赖政策 5 | 1 / 3 / 1 / 71 | 3 | 3 | BW `forbid(unsafe_code)`+`-D warnings` CI；dsh oxlint/jscpd/publint/dependabot |
| C36 | 前缀率 126/493，978 commit，6 作者 | 493/500，14,577，40 | 2 | 2 | 两仓皆成文约定无 commitlint；BW 人话标题是有意取舍 |
| C41 | testing 文档 0，手册测试命令 7 | 2 / 22 | 2 | 3 | BW 命令在 AGENTS.md「怎么建/跑/测」；dsh `docs/testing.md` 六层 |
| C42 | CI 跑测试 1，覆盖/快照门禁 1 | 5 / 4 | 2 | 3 | BW 主判据 E2E 不在 CI（computer-use 本机）；dsh 100% 覆盖+快照必过 |
| C43 | 证据成文 51 文件，change-scope 0 | 18 / 2 | 2 | 3 | BW「读回为证」成文；dsh `change-scope` 工具+pre-push-checks skill |
| C44 | 回归先于修复 3，禁改测试 2 | 2 / 1 | **1** | 2 | BW「禁改测试」命中的两文件是 `docs/reference/ai-native-sdlc-playbook.md` 与 `principles/03` 对 playbook 的转述，「坏例自证」只在 process-hardening 提案里，均未成规矩；dsh 成文「introduce the regression, watch red」；两仓皆无测试文件拦截 |
| C45 | 真实入口/读回 51 | 84 | 2 | 3 | dsh built-bin 烟测进 CI |
| C46 | 抖动测试纪律 2 | 65 | **1** | 3 | BW 无；dsh `dsh-ci-test-reliability` skill+流程 |
| C51 | 评审 skill 1，评审 workflow 2 | 2 / 6 | 3 | 3 | BW `claude-code-review.yml` 已产出真行内意见；dsh `dsh-code-review` 7 阻断 |
| C52 | 合并人 GitHub 66 / yuzhup 47 / Gravity 17，禁 merge 成文 25 | Tianyi 2227 / GitHub 1809 / Yichen 619，75 | 3 | 2 | BW 启动命令带 `--disallowedTools 'Bash(gh pr merge)'`（机器拦）；dsh 合并全为人但无成文禁令，分支保护不可读=Unknown |
| C53 | 标签体系成文 12，force 政策 5 | 36 / 19 | 2 | 3 | BW `bw:status:*` 词表成文；dsh 脚本拒别名 |
| C54 | tag 0，发布 workflow 0，CHANGELOG 1 | 7 / 6 / 3 | **1** | 3 | BW 只有 packaging 说明与 CHANGELOG；`release-gap.py` 指标依赖 tag 却无 tag |
| C55 | 回滚成文 1 | 3 | **1** | **1** | 两仓皆无回滚演练；BW 命中为 playbook 转述，dsh 为 CI failover runbook |
| C61 | 复盘 0，判据成文 10 | 4 / 74 | **1** | 2 | BW 事故散在 CHANGELOG/commit；dsh 结构与入选判据成文但无格式门禁 |
| C62 | 手册引用事故 0 | 2 | **1** | 2 | dsh testing.md 引复盘 0001 立规矩 |
| C63 | issue 自动化脚本 0，指标脚本 1 | 3 / 0 | **1** | 3 | BW `.bw/scripts` 1 份读数脚本；dsh `policy.mjs` 纯脚本流转 |
| C71 | 文档结构纪律 25 | 7 | 2 | 3 | BW「30 秒导读」+01 原则成文；dsh tier 表+预算/换行门禁 |
| C72 | 反 slop 成文 5 | 17 | 2 | 2 | 两仓皆成文（BW 写作纪律六条 / dsh slop 清单+prose skill），皆无机器审 |
| C73 | 文档门禁脚本 0 | 41 | **0** | 3 | BW 无任何文档门禁 |
| C74 | 简化/归档 skill 0，冻结/横幅成文 5 | 2 / 384 | 2 | 3 | BW「过时不删加横幅」成文（0 次使用）；dsh 归档 skill+冻结门禁 |
| C81 | AI 署名 455/978（Fable 162 / Opus 152 / Cursor 89 / Sonnet 43），AI 合并 67/130 | 1/14,577，3,557/6,313 | 3 | 3 | 记账方式相反（BW 署名、dsh 分支），同为同通道验收 |
| C82 | CLAUDE.md=import，元数据门禁 0 | symlink / 2 | 2 | 3 | dsh `hooks/` 桥接+metadata 门禁 |
| C83 | 秘钥政策成文 1，.env 忽略 0 | 8 / 1 | 2 | 3 | BW Orca token 不进仓成文；Rust 仓无 .env 惯例 |
| C84 | 快照/评测 13 | 2,019 | **1** | 3 | BW 无 agent 配置回归（skill 使用记录现算为计划）；dsh 录制会话回放进 CI |

## BW 缺失清单（按「升一级最便宜」排序，≤8）

1. **C73 文档门禁 0→3**：先上死链 guard（基线 2 条误报→0，门禁要跳过行内代码与举例）——process-hardening A1。
2. **C02 字数预算 2→3**：AGENTS.md 12,762 字符作首个预算基线——A2。
3. **C22 替代方案 1→2**：ADR 模板与 changes/intent 加「否决方案」节，现 0/11——B1。
4. **C32 门禁自测 0/6**：段分已 3，但补 selftest 才配得上——A3。
5. **C61/C62 复盘 1→2**：开 `docs/postmortem/` 与入选判据（subtle/systemic/costly），把 CHANGELOG 里的事故散文迁成结构件；S6 是 BW 唯一 1 分段。
6. **C54 发布工艺 1→2**：给已出包版本打 tag——`release-gap.py` 指标正等这个数。
7. **C44 回归先于修复 1→2**：把「门禁自测（以已知坏例证明它真会拦）」从 process-hardening 提案升成 AGENTS.md 规矩（与 4 同批）。
8. **C84 agent 配置回归 1→2**：skill 使用记录现算落地（已列计划）。

**效度检验**：1–4、7 与 [process-hardening](../process-hardening/intent.md) 的 A1/A2/A3/B1 完全命中；5、6、8 是 v2 按 SDLC 补齐阶段后**新扫出**的——v1 七维因缺 S5 发布/S6 运维两段而看不见它们，这正是本轮重写的收益。

## 探针残余与迭代（R5–R6）

- **死链探针残余**：BW 2 条 = `changes/process-hardening/spec.md` 第 11 行举例文字；dsh 27 条 = `docs/i18n/translation-prompt.md`、`.agents/skills/dsh-doc/templates/*.md` 等模板里的占位路径（`foo.md` / `source-filename.md` / `README.zh.md`）。两仓真实死链均为 0；探针按 rubric 约定「命中须人工复核」，门禁化时需跳过模板目录与行内代码。
- **关键词探针是弱信号**：`rgx` 数的是含模式的文件数，会把「转述别人主张」也算进去（BW C44/C55 命中的是 playbook 提炼版）。定级时以文件是否为本仓规矩为准，不看数字大小。
- **R5 抓出并在 R6 修掉**：空结果双打 `0`（`cnt/gc` 助手）、`wc` 前导空格、准则自身文本污染读数（排除 `native-audit/`）、冻结归档 `archived/` 与省略号举例造成的成批误报、C55「rollback」在 agent 产品里是运行时词（改发布语境窄模式）、C61 双语重复计数（只数英文原件）。
- **不可读项**：分支保护规则需 API 权限，两仓 C52 均以合并执行人分布替代，分支保护本身记 Unknown。
