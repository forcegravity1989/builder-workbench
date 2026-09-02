# 原型 · native-audit 样例报告：builder-workbench 自扫

> **30 秒导读**：这是什么——native-audit skill 的**首次真实 dogfood 输出**（2026-09-01，按 SKILL.md 剧本对本仓单仓模式跑完）。所有数字从 git 与仓文件实测、带复算命令；判读级别带证据路径。它同时是判读的两个锚定样例之一（另一个是 deepseek-harness，门禁层锚点）。末节记录这次 dogfood 暴露的剧本缺陷。

## 度量电池输出（实测，HEAD 7c539c2）

| 指标 | 值 | 复算命令 |
|---|---|---|
| 历史跨度 | 2026-06-21 → 2026-09-01（73 天） | `git log --reverse --format=%ad --date=short HEAD \| head -1` |
| 总 commit | 977（实改 847 + 合并 130） | `git rev-list --count [--no-merges\|--merges] HEAD` |
| 作者集中度 | 6 人：Gravity 509 · yuzhup 301 · bot 19 · Claude 9 · dong 5 · forcegravity1989 4；前 2 人占实改 95.6% | `git shortlog -sn --no-merges HEAD` |
| 周节奏 | 3 → 13 → 1 → 15 → 80 → 113 → 72 → 168 → 46 → 211 → 92 → 33（W25–W36），脉冲式非匀速 | `git log --format=%ad --date=format:%Y-W%V --no-merges HEAD \| sort \| uniq -c` |
| AI 署名 | **454 个 commit 带 AI Co-Authored-By（占 46%）**：Claude Fable 5 161 · Opus 5 152 · Cursor 89 · Sonnet 5 43 · Opus 4.8 8 | `git log --format='%(trailers:key=Co-Authored-By,valueonly)' HEAD \| grep -c .` |
| AI 分支痕迹 | 合并信息含 claude/worktree/cursor 68 次 | `git log --merges --format=%s HEAD \| grep -oiEc 'codex/\|claude\|copilot\|worktree\|cursor/'` |
| commit 类型前缀率 | 近 500 实改 125 条（25%）带 `type:`/`type(scope):` 前缀；其余为中文人话标题 | `git log --no-merges --format=%s -500 HEAD \| grep -cE '^[a-z]+(\(\|:)'` |
| 规范正本 | 根 AGENTS.md（12,762 字符，唯一正本）+ CLAUDE.md 一行导入 + `principles/` 3 篇 + CONTEXT.md 词表；**无子树 AGENTS.md、无 CONTRIBUTING、无 PR 模板** | `git ls-files \| grep -iE 'AGENTS\|CLAUDE'`；`ls CONTRIBUTING* .github/PULL_REQUEST_TEMPLATE*` |
| 决策记录 | `docs/adr/` 3 份 + `changes/` 4 条产物链（21 个跟踪文件）；ADR 结构=状态/决策/为什么/后果，**无「考虑过的替代方案」节** | `ls docs/adr changes` |
| 门禁 | 4 个 workflow（ci / claude-code-review / claude / codegraph）；脚本 6 个（guard-* 5 + verify-codegraph）；ci.yml 强制 fmt + clippy + test + 5 guard；**门禁自测 0/6、文档门禁 0** | `ls .github/workflows scripts` |
| 验证证据 | `#[test]` 69 个（19 文件）随 CI 跑（excl. app-shell）；冒烟示例 14 个；E2E（深链+computer-use+读回）成文为主判据但**不在 CI** | `grep -rc '#\[test\]' --include='*.rs' crates`；`ls crates/*/examples` |
| 文档规模 | 130 个 `.md` | `git ls-files \| grep -c '\.md$'` |
| 死链（相对 md 链接） | 非 vendor **0**（扫出的 2 条是 process-hardening/spec.md 第 11 行的举例文字，非导航链接）；`standard/vendor/` 5 条（第三方示例路径，界外） | 见 SKILL.md 电池「死链探测」 |
| 「过时加历史横幅」纪律 | 含横幅字样的文档 0 份 | `grep -rlE '历史横幅\|已过时' docs principles` |

## 七维评分（制度化阶梯 0-3）

| 维度 | 级 | 证据与差口 |
|---|---|---|
| D1 规范正本 | **2 成文** | `AGENTS.md`（唯一正本）+ `CLAUDE.md` 导入 + `principles/`；无子树正本、无字数预算门禁 → 差「机器强制」一级 |
| D2 决策记忆 | **2 成文** | `principles/02` 规定 intent/spec 链；`docs/adr/0001` 有「为什么」无「替代方案」；小修直修、无格式门禁 |
| D3 门禁密度 | **3 机器强制** | `.github/workflows/ci.yml` L21-49 强制 fmt/clippy/test + 5 guard；扣分注：门禁自测 0/6、无任何文档门禁 |
| D4 AI 参与 | **3 机器强制** | 46% commit 带 AI 署名 + 68 次 AI 分支合并 + `claude-code-review.yml` agent 评审进 CI + worktree/MR 唯一验收通道；AI 产出与人同通道 |
| D5 commit 卫生 | **2 成文** | `AGENTS.md`「commit 约定」成文，近 15 条标题全部人话可读；前缀率 25% → 不可机械分类（这是本仓有意的取舍，非缺陷） |
| D6 验证证据 | **2 成文** | E2E-only 纪律成文（`AGENTS.md` 门禁段）；CI 强制的只是 69 个 UT，被规定为主判据的 E2E 本身不在 CI |
| D7 文档反 slop | **2 成文** | 写作纪律六条成文；死链实测 0 但无门禁守着；历史横幅纪律 0 次使用（无过时文档或纪律未启用，无法区分） |

**总评**：本仓处在「成文层为主、门禁层起步」——D3/D4 已到机器强制，D1/D2/D5/D6/D7 全停在「成文」，差口集中在「成文 → 机器强制」最后一跳。与 dsh（七维全 3）的差距不在方向而在强制力度。

**与 dsh 的一处结构性差异**：dsh 的 AI 痕迹在分支不在署名（Co-Authored-By 几乎为零），本仓 46% 的 commit 显式署名 AI 模型——两种记账方式都能达到 D4 满级，但本仓的方式能按模型统计产出（Fable 161 / Opus 160 / Sonnet 43 / Cursor 89），dsh 不能。

## 缺失清单（按升一级最便宜排序）

1. **D7 死链门禁**——基线已实测为 0（非 vendor），门禁装上第一天就是绿的，成本最低。注意：门禁要跳过反引号/行内代码里的举例路径（本次扫出的 2 个假阳性就是这种），并排除 `standard/vendor/`。
2. **D1 文档字数预算**——AGENTS.md 现状 12,762 字符可作首个预算基线。
3. **D3 门禁自测**——6 个脚本 0 个有已知坏例，补一个 selftest 让每个 guard 至少拦下一例。
4. **D2 决策记「打败了谁」**——`docs/adr/` 三份都没有替代方案节；`changes/` 的 intent 有「未决问题」但没有「否决方案」。最便宜落点是 ADR 模板加一节 + commit 约定加「放弃方案:」行。
5. **D6 E2E 进 CI**——结构性受限（computer-use 需本机），标为已知取舍，不列为便宜项。

**效度检验**：前四条与 [process-hardening](../process-hardening/intent.md) 已立项的 A1/A2/A3/B1 完全命中——准则独立扫出同一结论。本次比上一轮粗扫多给出三个硬数字：死链基线 0（A1 原基线「未测」）、AGENTS.md 12,762 字符（A2 基线）、ADR 0/3 有替代方案节（B1 佐证）。

## 本次 dogfood 暴露的剧本缺陷（已回修 SKILL.md）

- `grep --include=*.rs` 未加引号，zsh 会把 glob 展开失败直接报错 → 改为 `--include='*.rs'`。
- `git ls-files` 默认 `core.quotepath` 会把中文文件名转成八进制转义，死链扫描漏掉 4 个文件（3 份 ADR + 1 份 guide）→ 改为 `git -c core.quotepath=off ls-files`。
- 死链探测对散文里的举例路径产生假阳性 → 报告里要人工复核命中行，门禁化时需跳过行内代码。
- 电池只数 AI 署名总数不分模型 → 补一条按署名人聚合的命令（本仓这一维的关键证据正来自它）。
- 规范正本探测只认 AGENTS/CLAUDE/.cursorrules，漏掉 `principles/`、`CONTEXT.md`、`.claude/skills/*/SKILL.md` 这类给 AI 看的正本 → 样本读取步骤补「顺着 AGENTS.md 的链接看它指向哪些正本」。
