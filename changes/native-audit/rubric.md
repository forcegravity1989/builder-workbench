# native-audit 准则正本 v2 · 与 dsh 实证、AI-Native SDLC 的双向映射

> **30 秒导读**：这是什么——native-audit 的**判读准则唯一正本**（spec 与 SKILL.md 只引用不复述）。v2 把 v1 的七维重组为 **9 段 37 条**，段落按 [AI-Native SDLC playbook 提炼版](../../docs/reference/ai-native-sdlc-playbook.md) 的六阶段 + 贯穿机制 + 治理四条排列（playbook = Anthropic 的 AI 原生研发流程手册；dsh = DeepSeek Harness，一个 agent 运行时），每条准则给出机械探针、3 分的样子、dsh 一手实证与 playbook 对应。末尾两张矩阵是映射证明：M1 dsh 做法 → 准则（每条 dsh 做法至少落一条），M2 playbook 主张 → 准则（每个阶段 / 贯穿机制 / 治理条至少落一条）。**dsh 无实证的准则如实标注**，不编证据。

## 阶梯（所有准则共用）

| 级 | 含义 | 判据 |
|---|---|---|
| 0 | 无 / 不可考 | 找不到任何痕迹，或数据拿不到（浅历史、squash、无权限）——标 Unknown 并写原因，**不推断补分** |
| 1 | 有痕迹 | 做法散见于 commit / 分支 / 个别文件，未成文为规矩 |
| 2 | 成文 | 规矩写在仓里给人和 AI 读（AGENTS.md / 原则 / 剧本），执行靠自觉与评审 |
| 3 | 机器强制 | 违规会被 git 钩子（hook）/ CI / 门禁脚本 / 类型系统拦下；门禁本身有已知坏例可证 |

阶梯的一手依据：dsh `quality-gates` 决策记录（2026-06-11）开头——「这个代码库主要由 coding agent 开发；agent 遵守机器门禁远比遵守散文约定可靠」。**BW 私货只有两条**：Unknown 纪律（对齐四铁律「没数据就是 Unknown」）；验证形态不限（E2E-only 与 100% 单测同为 3 分候选，看强制程度不看形态）。

## 九段三十七条

### S0 · 规矩正本（贯穿；playbook §3「项目手册当代码维护」）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C01 | 手册存在、分层、有修正回路 | 入口件清单（AGENTS/CLAUDE/.cursorrules/copilot-instructions）、子树数、`git log -- AGENTS.md` 周频 | 根 + 子树手册；每周有修正（错两次进手册） | 根 AGENTS.md 154 行 + 21 份子树；AGENTS.md 每周 12–64 次改动，12 周无空档 | §3 手册当代码维护 |
| C02 | 手册有预算且自描述 | 字符数；是否有字数预算门禁；是否有「怎么改本文件」段 | 字数上限进 CI，超额须论证提额 | `verify-doc-budgets` + `doc-budgets.manifest.json`（根 ≤1,950 词）；「Editing these instructions」段 | §3「一页内」 |
| C03 | 地图、词表、一事一家 | architecture / glossary / 文档分层表存在；「read X before changing Y」句 | 分层表成文 + 事实唯一归属被门禁查（重复复述红） | `docs/AGENTS.md` tier 表「one home per fact」；`architecture.md` read-before-change；`glossary.md` | §2 约束可被 AI 套用 |
| C04 | 组织约束写成 skill/剧本供 AI 套用 | `.agents/skills` / `.claude/skills` / `standard/skills` 数量；被手册引用次数 | 评审、推送前检查、文档、归档等剧本齐且被门禁交叉校验 | 12 个 `.agents/skills`（code-review / pre-push-checks / doc / prose-standard / archive-notes / find-simplifications …）；`verify-skill-invocation-metadata` | §2「套上组织写成技能的约束」 |

### S1 · 计划·意图（playbook 阶段 1）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C11 | 意图件成文、验收人具名、接受留痕 | issue 模板数与字段；`proposed/` 类目录；issue 类型 / 标签体系；接受 = 合入/关闭 | 意图件有模板与必填节，接受走合入/关闭并由脚本守 | `.github/ISSUE_TEMPLATE/{bug,feature,idea,research,task}.md`；`proposed/` 26 份（Problem/Proposal/Alternatives/Acceptance/Risks）；`issue-lifecycle.yml` 脚本守 | 阶段 1；贯穿「具名验收人、留痕」 |
| C12 | 产物链连通（意图→规格→计划→PR→复盘→意图） | 制品间相对链接是否可机械校验；PR 模板是否要求引用意图/决策件 | 每级产物引用上一级，链接死了会红 | Agent Note 互链「never bare prose or numbers」+ `verify-md-links`；`pull_request_template.md`；复盘 链 guardrails | 贯穿机制「产物链」 |

### S2 · 设计·决策（playbook 阶段 2）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C21 | 决策记录制度化程度 | adr/notes/changes 数量；是否成文「何时必写」；是否有格式门禁 | 非琐碎变更同 PR 强制附记录，格式与分类由脚本查 | 838 份 Agent Notes；「Non-trivial changes MUST include an Agent Note in the same PR」；`verify-agent-note-format/-classification` | 阶段 2 规格件 |
| C22 | 记「打败了谁」与后果 | 记录中含替代方案节的比例；含后果/代价节的比例 | 替代方案节强制，缺则门禁红 | 「Alternatives considered — mandatory」；`## Consequences` 必有；格式门禁 | 阶段 2「冲突当场标出」 |
| C23 | 记录有生命周期、与实况一致、过时冻结 | proposed/implemented/rejected/archived 目录；冻结 manifest；是否要求「实现变了记录同步改」 | 状态路径化，冻结件不可编辑由脚本守，实况漂移算违规 | 路径即状态；`archived/manifest.json` + `verify-archived-agent-notes`；implemented 须「kept current with what shipped」；无 INDEX 决策 | 贯穿「每份产物有归宿」 |

### S3 · 构建（playbook 阶段 3）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C31 | 先计划后动手，偏离回写 | 计划产物（plan / acceptance criteria）存在；是否成文「计划批准前不动文件」「偏离同提交改计划」 | 计划件必有且与实况同步由评审/门禁守 | `proposed/` 的 `## Acceptance criteria`；proposed→implemented 须「rewrite Proposal into present-tense Decision」并有格式门禁 | §3 先计划后动手 |
| C32 | 建议与拦截分层（含门禁自测） | hook 配置（lefthook/husky）；CI 必过检查数；verify/guard 脚本数；有 .spec 的门禁数 | 「凡机械可查者必有非零退出命令」成文；门禁自测 | 34 个 `verify-*`（17 个自带 `.spec.ts` 自测）；lefthook pre-commit/pre-push；quality-gates 决策「Every mechanically checkable promise gets a command that exits non-zero」 | §3 建议性 vs 确定性；治理 1 |
| C33 | 并行工作单元 | 分支名模式（worktree/codex/claude/cursor）；hook 是否 worktree-local；子代理指引 | 每活一 worktree 是默认工作方式，hook 与配置随 worktree 走 | ~770 次 worktree* + ~950 次 codex/* 合并；`worktree-local lefthook` 决策；`subagent/` 包 | §3 并行 |
| C34 | 唯一事实源与生成物新鲜度 | gen-*/verify-* 配对数；vendor manifest；手抄清单是否被禁 | 生成物过期即红；vendored 源有 SHA 清单与同步程序 | 11 对 gen/verify（tool/config/persistence/module-graph/cordis-api…）；`vendor/README.md` manifest + `check-vendor-manifest.sh`；slop 清单禁手抄目录 | §3 唯一事实源 |
| C35 | 代码卫生门禁与依赖政策 | strict 类型配置；lint 配置；重复代码检测；依赖政策成文；dependabot | 严格类型 + lint + 克隆检测进 CI；依赖增删有成文取舍 | D2 即 max-strict TS + ESLint；oxlint、jscpd、publint、workspace constraints；`dependencies-over-hand-rolling` 决策；`dependabot.yml`；pre-release「no compat shims」 | §3 |
| C36 | commit 卫生 | 类型前缀率；标题可读性抽样；节奏曲线 | 约定成文且可机械分类（或有 commitlint） | 实改 8,264：fix 2,878 / docs 1,574 / test 1,263 / feat 851，前缀率高可机械分类 | 贯穿「制品进 git」 |

### S4 · 测试·验证（playbook 阶段 4）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C41 | 自验路径成文且 AI 可自跑 | 手册命令段；测试分层文档；`test:*` 脚本数 | 分层成文（单元/快照/e2e/预期输出），命令一处可查 | `docs/testing.md` 六层；AGENTS.md「Commands」段 20+ 条 | §4 能自己跑的验证路 |
| C42 | 验证强制程度（形态不限） | CI 是否必过测试；覆盖率/快照门禁；required checks | 主判据形态进 CI 必过（E2E-only 亦可） | per-file 100% coverage gate（D2 起）；web snapshot 为 Linux PR 必过；`check:ci:*` 族 | §4 |
| C43 | 证据随改动走 | PR 模板要证据；「只报跑过的命令」成文；改动面→检查选择工具 | 证据进 PR 成审计记录；有 change-scope 类工具选最小证据集 | `dsh-pre-push-checks`（「report only commands run」）；`change-scope` 脚本；code-review 第 6 条「Required evidence exists」 | §4 验证输出进 PR；治理 2 |
| C44 | 回归先于修复、门禁需自测 | 是否成文「先写失败测试」「引入回归看红再撤」；测试文件保护 | bug 先落失败测试；门禁自测（以已知坏例证明它真会拦）；测试文件受拦截保护 | 「A guard only guards if the regression fails it… introduce the regression, watch red, revert」；复盘→guardrail tests。**禁改测试的拦截：dsh 无（0 处）** | §4 bug→失败测试、禁改测试 |
| C45 | 真实入口、真实世界断言 | built-artifact smoke 数；「verify the world not self-report」成文；real-API 自跳策略 | 发布件入口有烟测；断言查外部状态不信自述 | `built-bin.e2e.ts` 族；「Verify the world, not the self-report」；real-API e2e self-skip 无 key | §4 |
| C46 | 测试可靠性纪律 | 抖动测试（flake）政策/剧本；隔离与 teardown 规则 | 抖动测试有分类工作流，单跑才过算缺陷 | `dsh-ci-test-reliability` + flake diagnosis；testing.md「passes only alone = defect」 | §4（隐含） |

### S5 · 评审·合入·发布（playbook 阶段 5）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C51 | 统一评审遍成文且 agent 可执行 | 评审剧本存在；agent 评审 workflow / 分支；阻断项清单 | 每个 PR 过同一套遍（bug/安全/与规格一致），agent 跑得动 | `dsh-code-review`（7 条阻断 + 手工检查）；`codex/pr-*-review` 分支；`maintaining-dsh-code-review` cookbook | 阶段 5 同一套评审遍 |
| C52 | 写码者不自批，门在人手 | 合并执行人分布；agent 是否被禁 merge；分支保护（可读时） | agent 可做到门前一切、过不了门，由权限/拦截守 | 合并执行人全是人或 GitHub 按钮；不收外部 PR | 阶段 5；治理 3「门先于加速」 |
| C53 | PR 历史与标签纪律 | PR 模板；标签体系成文；stack/rebase 政策；force 政策 | kind/area 一类必一；历史策略成文；标签由脚本守 | `unified-github-label-taxonomy`（一 kind + ≥1 area，脚本拒别名）；「--force-with-lease, never raw --force」；`dsh-merging-stacked-prs` | 阶段 5 |
| C54 | 发布工艺 | tags / release 分支 / release workflow 数；变更日志；许可与第三方声明；安全声明 | 发布脚本化、可验证安装、声明自动生成 | 20 次 release/* 合并、7 tag；`release*.yml` 5 个；`release:verify-packed-install`；`gen-third-party-notices` + `verify-dsh-package-licenses`；SAFETY.md | 阶段 5 生产门 |
| C55 | 回滚可演练 | 回滚/降级路径成文；格式版本与兼容策略；演练记录 | 回滚路径写成剧本且演练过 | **dsh 无显式回滚演练**；相近：`SESSION_FORMAT_VERSION` 与「backends reject old formats」的显式不兼容策略、CI failover runbook | 治理 4 |

### S6 · 运维·复盘·环闭合（playbook 阶段 6；复盘 = postmortem，事故的结构化记录）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C61 | 复盘制度 | 复盘目录与数量；结构强制；写不写的判据成文 | 结构固定（摘要/时间线/根因/为何漏网/防护）并有入选判据 | `docs/postmortem/` 4 份；结构 Executive summary→Guardrails added→Lessons；判据 subtle/systemic/costly | 阶段 6 |
| C62 | 复盘→防护回流 | 复盘链到 tests/规矩/记录的比例；手册中引用复盘的规矩数 | 每份事故都落成门禁或手册规矩，链接可查 | 复盘必「Link the guardrails motivated」；testing.md 引复盘 0001 立「smoke tests 最高价值」 | 阶段 6 环闭合；§3 错两次进手册 |
| C63 | 检测零模型、响应分层 | issue/PR 自动化是否纯脚本；自动动作上限（只开 PR/只记录） | 检测与流转是脚本，越线才唤模型，自动动作到评审门为止 | `.github/issue-management/policy.mjs`（issue-lifecycle / issue-policy 纯脚本）；dependabot 只开 PR | 阶段 6 检测纯脚本 |

### S7 · 知识维护·反 slop（贯穿；slop = AI 写作垃圾，dsh 文档纪律用词）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C71 | 文档结构纪律 | 分层表；tutorial/reference 分类；「写现状不写历史」成文 | 分层与归属成文并有预算 | `docs/AGENTS.md` tier 表、tutorial vs reference、「Document current state, not change history」 | §3 手册当代码维护 |
| C72 | 反 slop 审计 | slop 清单成文；prose 剧本；CoT 泄漏审计 | 清单成文并被剧本当审计跑 | 「The slop checklist」9 项；`dsh-prose-standard`；`dsh-trim-cot-leakage` | —（dsh 特有） |
| C73 | 文档机器门禁 | 死链/换行/mermaid/代码块编译/引用/预算/双语配对门禁数 | 文档承诺尽数脚本化 | `verify-md-links/-md-wrap/-mermaid/-doc-refs/-type-equiv/-doc-budgets/-translation-pairing` + `doc-typecheck`；`doc-sync` 聚合 | 治理 1 |
| C74 | 减法与归档 | 简化剧本；归档流程；过时件处理（冻结/横幅/删除） | 减法有剧本，归档有门禁，过时件不可再改 | `dsh-find-simplifications`；`dsh-archive-agent-notes` + 冻结 manifest；`remove-knip` 类删除决策 | §3 遗留唯一事实源 |

### S8 · AI 协作方式（贯穿；BW 理念「人在首尾」）

| # | 准则 | 机械探针 | 3 分的样子 | dsh 实证 | playbook |
|---|---|---|---|---|---|
| C81 | AI 产出走同一验收通道 | AI 分支/署名占比；agent 评审进流程；是否有 AI 专用旁路 | AI 与人同通道（分支+PR+评审），无旁路 | ~950 codex/* + 63 claude* 合并全走 PR；Co-Authored-By 几乎为零（记账在分支） | 贯穿「人的判断在环之上」 |
| C82 | 多 harness 兼容 | CLAUDE.md 是否软链/导入 AGENTS.md；hook 桥接；skill 元数据对齐门禁 | 一份正本多 harness 共用，元数据由脚本对齐 | CLAUDE.md→AGENTS.md 软链（根与 packages/）；`hooks/` 包桥接 Claude Code/Codex；`verify-skill-invocation-metadata` | —（dsh 特有） |
| C83 | agent 运行环境与秘钥政策 | 秘钥政策成文；无 key 自跳；沙箱失败指引 | 秘钥从不入仓由门禁守；无 key 路径常绿 | 「Never commit credentials」；e2e self-skip；「Host sandbox failures… narrowest host escalation」 | §6 分层响应（隐含） |
| C84 | agent 配置的回归 | 模型可见输出有快照回放；skill/手册改动有回归 | 提示词/技能改动像代码一样被回归 | keyless recorded-session snapshot（model-visible ⟺ logged）；`verify-skill-invocation-metadata`；mutation testing 为 proposed | §4 评测集是 agent 配置的回归测试 |

## M1 · dsh 做法 → 准则（覆盖证明）

| dsh 做法（仓内路径/事实） | 准则 |
|---|---|
| 第 1 个 commit = README + AGENTS.md + CLAUDE.md 软链 | C01 C82 |
| 第 2 个 commit 链入需求分析与微内核架构文档 | C11 C03 |
| D2：max-strict TS、ESLint strict、100% per-file coverage | C35 C42 |
| D2：「second Codex review」 | C51 C81 |
| 根 AGENTS.md 154 行、每条 1–3 行外链理由 | C01 C71 |
| 21 份子树 AGENTS.md | C01 |
| `verify-doc-budgets` + manifest；「Editing these instructions」 | C02 |
| `docs/AGENTS.md` tier 表「one home per fact」；tutorial vs reference | C03 C71 |
| architecture.md「read before changing packages/」；glossary；capability-seams；defensive-patterns | C03 |
| 12 个 `.agents/skills` | C04 |
| `verify-skill-invocation-metadata` | C04 C82 C84 |
| ISSUE_TEMPLATE 5 种；native Issue Type | C11 |
| `proposed/` 骨架（Problem/Proposal/Alternatives/Acceptance/Risks） | C11 C31 |
| `issue-lifecycle.yml` / `issue-policy.yml` → `policy.mjs` | C11 C63 |
| Agent Note 互链须相对路径 + `verify-md-links` | C12 C73 |
| `pull_request_template.md` | C12 C43 C53 |
| 838 份 Agent Notes；「MUST include an Agent Note in the same PR」 | C21 |
| `verify-agent-note-format` / `-classification`；六个封闭分类 | C21 |
| 「Alternatives considered — mandatory」；`## Consequences` | C22 |
| 路径即状态；`archived/manifest.json` + `verify-archived-agent-notes`；无 INDEX 决策；implemented「kept current」 | C23 |
| proposed→implemented 须改写为现在时 Decision（门禁） | C31 C23 |
| 34 个 `verify-*`，17 个自带 `.spec.ts` 自测 | C32 C73 |
| lefthook pre-commit（staged lint fix / whitespace / vendor manifest / pairing / notices）pre-push（增量 typecheck） | C32 C35 |
| quality-gates 决策「every mechanically checkable promise gets a command」 | C32 |
| ~770 worktree* + ~950 codex/* + 63 claude* 合并 | C33 C81 |
| worktree-local lefthook 决策；`subagent/` 包 | C33 |
| 11 对 gen-*/verify-*（tool/config/persistence/module-graph/cordis-api/catalog…） | C34 |
| `vendor/README.md` manifest + `check-vendor-manifest.sh` + `rescope-vendor` | C34 C35 |
| oxlint、jscpd duplication、publint、workspace constraints、NodeNext consumer check | C35 |
| `dependencies-over-hand-rolling` 决策；`dependabot.yml`；pre-release「no compat shims」 | C35 |
| 实改类型分布 fix/docs/test/feat 可机械分类 | C36 |
| `docs/testing.md` 六层 tiers；Commands 段 | C41 |
| coverage gate；web snapshot 为 PR 必过；`check:ci:*` 族；windows/wine 通道 | C42 |
| `dsh-pre-push-checks`「report only commands run」；`change-scope` | C43 |
| 「A guard only guards if the regression fails it」 | C44 |
| built-artifact smokes；「Verify the world, not the self-report」；prefer real over mock；real-API self-skip | C45 C83 |
| `dsh-ci-test-reliability` + flake diagnosis | C46 |
| `dsh-code-review` 7 阻断 + 手工检查；`codex/pr-*-review`；`maintaining-dsh-code-review` cookbook | C51 |
| 合并执行人全为人/GitHub 按钮；不收外部 PR | C52 |
| label taxonomy（一 kind + ≥1 area，脚本拒别名） | C53 |
| stacked PRs 政策；`--force-with-lease` never raw；`dsh-merging-stacked-prs` | C53 |
| 20 次 release/* 合并、7 tag、5 个 release workflow；`release:verify-packed-install` | C54 |
| `gen-third-party-notices` + `verify-dsh-package-licenses`；SAFETY.md；BRAND_GUIDELINES | C54 |
| `SESSION_FORMAT_VERSION`「backends reject old formats」；CI failover runbook | C55（部分） |
| `docs/postmortem/` 4 份；结构与入选判据 | C61 |
| 复盘须链 guardrails；testing.md 引复盘立规矩 | C62 |
| 「The slop checklist」；`dsh-prose-standard`；`dsh-trim-cot-leakage` | C72 |
| `verify-md-wrap/-mermaid/-doc-refs/-type-equiv/-translation-pairing`；`doc-typecheck`；`doc-sync` | C73 |
| 双语配对 sidecar 哈希 + merge driver；`dsh-translate-docs` | C73 |
| `dsh-find-simplifications`；`dsh-archive-agent-notes`；`remove-knip` 决策 | C74 |
| CLAUDE.md 软链；`hooks/` 包桥接 Claude Code/Codex | C82 |
| 「Never commit credentials」；「Host sandbox failures」指引 | C83 |
| keyless recorded-session snapshot；「Model-visible ⟺ logged」；mutation testing proposed | C84 C42 |
| cookbook 9 篇 how-to（含 responding-to-pr-review-on-a-stack） | C71 C53 |
| `.github/AGENTS.md`（CI 组织规矩、failover） | C01 C55 |

**M1 结论**：dsh 盘出的 58 组做法全部落到至少一条准则；无孤儿做法。

## M2 · playbook 主张 → 准则（覆盖证明）

| playbook 段 / 主张 | 准则 |
|---|---|
| 贯穿机制：产物链（意图→规格→计划→带测试改动→带评审结论 PR→复盘→意图） | C12 C11 C21 C31 C43 C51 C61 |
| 贯穿：每份产物有具名验收人，接受用合入/关闭留痕 | C11 C52 |
| 阶段 1 计划：一次成文进版本控制，合入即接受 | C11 |
| 阶段 2 设计：AI 套组织写成技能的约束，冲突当场标出 | C04 C22 C21 |
| 阶段 3 构建：先计划后动手；偏离同提交改计划 | C31 |
| 阶段 3：项目手册当代码维护；一页内；错两次进手册 | C01 C02 C62 |
| 阶段 3：建议性与确定性分层 | C32 |
| 阶段 3：并行（worktree、子代理） | C33 |
| 阶段 3：遗留系统唯一事实源 | C34 C74 |
| 阶段 4 测试：能自己跑的验证路；验证输出进 PR | C41 C43 |
| 阶段 4：bug 先重现成失败测试；禁止改测试（拦截） | C44 |
| 阶段 4：评测集是 agent 配置的回归 | C84 |
| 阶段 5 发布：同一套评审遍，按严重度排 | C51 |
| 阶段 5：写码 agent 无权批自己；审批门确定性拦截；生产门在人手 | C52 C54 |
| 阶段 6 运维：检测纯脚本零模型；响应分层只开 PR | C63 |
| 阶段 6：诊断写成意图件回流；修完补评测 | C62 C84 |
| 治理 1：建议劝、拦截拦 | C32 C73 |
| 治理 2：证据随改动走，PR 即审计记录 | C43 C53 |
| 治理 3：门要先于加速 | C52 |
| 治理 4：回滚是最该排练的路径 | C55 |
| 26 条过程指标中可作探针的：手册修正频次 / 首过率 / 返工轮数 / 前置时间 / 距上次发版天数 | C01 C43 C54（探针复用 `.bw/scripts/`） |

**M2 结论**：六阶段、贯穿机制、治理四条全部有准则承接；playbook 三条主张 dsh 无一手实证（禁改测试、回滚排练、指标越线检测），准则保留、实证栏如实标「dsh 无」。

## 探针可执行性（R5 自扫 结果）

见 [prototype-report.md](prototype-report.md)：v2 探针在 BW 与 dsh 两个真仓上各跑一遍，dsh 作 3 分锚、BW 作 2 分锚。探针跑不出数的准则在那里逐条标注。

## 迭代记录

| 轮 | 做了什么 | 结果 |
|---|---|---|
| R1 | v1 七维（规范/决策/门禁/AI/commit/验证/反 slop） | 能扫，但只覆盖 playbook 阶段 3/4/5 的一部分 |
| R2 | 对照 playbook 六阶段找缺口 | 缺：计划·意图（S1）、发布工艺与回滚（C54/C55）、运维·复盘·环闭合（S6）、产物链连通（C12）、先计划后动手（C31）、agent 配置回归（C84）→ 重组为 9 段 37 条 |
| R3 | 重盘 dsh 全部制度件（34 门禁 / 12 skill / 19 workflow / 模板 / lefthook / 发布 / 复盘）逐项映射 | 新增被 v1 漏掉的：生成物新鲜度（C34）、依赖政策（C35）、issue 自动化（C63）、标签体系（C53）、多 harness 元数据门禁（C82）、测试可靠性（C46）；58 组做法零孤儿 |
| R4 | 反向检查 playbook 每条主张有无准则 | 全覆盖；三条无 dsh 实证如实标注（C44 禁改测试、C55 回滚、C63 指标越线） |
| R5 | 探针脚本化为 `battery.sh`，在 BW + dsh 真跑 | 方向对（dsh 决策记录 820/839 带替代方案 vs BW 0/11；门禁脚本 38 个、自测 18 个 vs 6/0；手册 12/13 周有修正 vs 7/12），但抓出 4 类探针脚本缺陷：空结果双打 `0`、`wc` 带空格、关键词探针被本仓 rubric/spec 自身文本污染（C44 在 BW 命中的 4 个文件全是准则原文）、死链探针在 dsh 出 401 条成批误报（378 条在冻结归档 `archived/` 与举例路径） |
| R6 | 修探针脚本：`cnt/gc` 助手、排除 native-audit 自身与 `archived/`、C55 改发布语境窄模式、C61 只数英文原件 | 重跑两仓：无多余输出；dsh 死链 401→27（残余分类见 prototype-report）；C55 dsh 3 / BW 1；两仓读数落成锚点卡 |
