# 原型 · native-audit 样例报告：builders-workbench 自扫

> **30 秒导读**：这是什么——仓考古 skill 的**原型证据**：拿本仓当靶子真跑一遍度量电池 + 判读，所有数字 2026-09-01 从 git 实测，可复算。它同时是判读的两个锚定样例之一（另一个是 dsh，见独立报告）。

## 度量电池输出（实测）

| 指标 | 值 | 复算命令 |
|---|---|---|
| 历史跨度 | 2026-06-21 → 2026-09-01（73 天） | `git log --reverse --format=%ad --date=short \| head -1` |
| 总 commit | 975 | `git rev-list --count HEAD` |
| 作者分布 | Gravity 507 · yuzhup 301 · bot 19 · Claude 9 · dong 5 | `git shortlog -sn --no-merges HEAD` |
| AI 分支痕迹 | claude/* 合并 61 次；claude 分支 147 条 | `git log --merges --format=%s HEAD \| grep -c claude/` |
| commit 类型前缀率 | 近 500 实改约 30% 带类型前缀（docs 57 · fix 23 · feat 23 · chore 19…），其余中文人话标题 | `git log --no-merges --format=%s -500 \| grep -oE '^[a-z]+' \| sort \| uniq -c` |
| 门禁 | guard-* 5 个 + fmt/clippy/test 上 CI；门禁自测 0/5 | `ls scripts/ \| grep -c guard` |
| 决策记录 | adr 3 份 + changes/ 3 条 + CHANGELOG 纪律 | `ls docs/adr changes` |
| 规范正本 | AGENTS.md 12,762 字符（唯一正本，CLAUDE.md 一行导入）；CONTEXT.md 36,897 | `wc -c AGENTS.md CONTEXT.md` |

## 七维评分（制度化阶梯 0-3）

| 维度 | 级 | 证据与差口 |
|---|---|---|
| D1 规范正本 | **2 成文** | 分层正本齐（AGENTS/principles/CONTEXT）；无字数预算门禁 → 差 1 级 |
| D2 决策记忆 | **2 成文** | 02 原则 + adr/changes 在用；非强制、无格式门禁 |
| D3 门禁密度 | **3 机器强制** | 5 guard + cargo 套件全上 CI；扣分注：门禁自测 0/5 |
| D4 AI 参与 | **3 机器强制** | worktree+MR 唯一验收通道，reviewer agent 已进 CI 且产出过真行内意见 |
| D5 commit 卫生 | **2 成文** | 标题人话约定成文；前缀率 30% → 机械分类不可行 |
| D6 验证证据 | **2 成文** | E2E-only 纪律成文 + CI test；E2E（computer-use/读回）本身不在 CI |
| D7 文档反 slop | **2 成文** | 写作纪律六条成文、反馈已 6 次；无死链/复述门禁 |

**总评**：本仓处在「成文层为主、门禁层起步」——与 dsh（七维全 3 的门禁层锚点）差距集中在 D1/D7/D3 的「成文 → 机器强制」最后一跳。

## 缺失清单（按升一级最便宜排序）

1. D7 死链门禁；2. D1 文档字数预算；3. D3 门禁自测；4. D2 决策记「打败了谁」。

**效度检验**：这四条与 [process-hardening](../process-hardening/intent.md) 已立项的 A1/A2/A3/B1 完全命中——准则是在不知道该清单的前提下独立扫出来的，两条路径得到同一结论，说明尺子量得准。
