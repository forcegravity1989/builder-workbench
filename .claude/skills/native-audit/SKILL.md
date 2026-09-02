---
name: native-audit
description: >-
  仓考古:对任意 git 仓(单仓或仓群清单)做只读的 AI-native 制度化水位分析,
  产出考古报告与缺失清单。Use when the user asks to 考古/扫描/分析一个仓或内网仓群的
  AI-native 实践、过程制度、native 缺失, or to compare repos against the
  archaeology rubric. Read-only; never modifies the target repos.
---

# native-audit — 仓考古

对目标仓量「AI-native 制度化水位」：七个维度，每维按制度化阶梯打 0-3。**准则正本在 [`changes/native-audit/spec.md`](../../../changes/native-audit/spec.md)，本文件只是执行剧本；两处冲突以 spec 为准。**

## 硬纪律

- **只读**：不向目标仓写任何东西，clone 一律进会话 scratchpad。
- **Unknown 纪律**：拿不到的数据标 Unknown 计 0 并写明原因（浅历史/squash/无权限/超时），绝不推断补分。
- **可复算**：报告里每个数字带产出命令；判读级别带仓内证据路径。
- **子代理**：仓群模式每仓一个子代理，模型 sonnet（难仓 opus），一律不用 Fable。并发 ≤5。

## 主路径（单仓）

1. **取仓**。本地路径直接用；远端 `git clone --filter=blob:none <url>`（历史全、blob 惰性）到 scratchpad。clone 失败 → 报告该仓 Unknown + 原因，终止该仓。
2. **跑度量电池**（纯脚本，零 token）：

```bash
git rev-list --count HEAD; git rev-list --count --no-merges HEAD          # 总量 / 实改
git log --reverse --format=%ad --date=short HEAD | head -1                # 起点(对照尾点得跨度)
git shortlog -sn --no-merges HEAD | head -15                              # 作者集中度
git log --no-merges --format=%s -500 HEAD | grep -cE '^[a-z]+(\(|:)'      # 类型前缀率(分母 500)
git log --no-merges --format=%s -500 HEAD | grep -oE '^[a-z]+' | sort | uniq -c | sort -rn | head  # 前缀分布
git log --merges --format=%s HEAD | grep -oiEc 'codex/|claude|copilot|worktree|cursor/'   # AI 分支痕迹
git log --format='%(trailers:key=Co-Authored-By,valueonly)' HEAD | grep . | sed -E 's/<.*//' | sort | uniq -c | sort -rn  # AI 署名,按署名人聚合
git log --format=%ad --date=format:%Y-W%V --no-merges HEAD | sort | uniq -c              # 周节奏
git -c core.quotepath=off ls-files | grep -iE 'AGENTS\.md|CLAUDE\.md|\.cursorrules|copilot-instructions'  # 规范正本(入口件)
git -c core.quotepath=off ls-files | grep -E 'adr|decisions|changes/|rfc' | wc -l         # 决策记录踪迹
ls .github/workflows/ 2>/dev/null; git ls-files | grep -E 'scripts/(guard|verify|check)'  # 门禁密度
grep -rc '#\[test\]' --include='*.rs' . 2>/dev/null | awk -F: '{s+=$NF} END {print s}'     # 测试存量(按语言换模式;--include 必须加引号)
git -c core.quotepath=off ls-files '*.md' | while IFS= read -r f; do d=$(dirname "$f"); grep -oE '\]\(([^)#: ]+\.md)' "$f" 2>/dev/null | sed -E 's/\]\(//' | while IFS= read -r l; do [ -e "$d/$l" ] || echo "$f -> $l"; done; done   # 死链探测
```

电池已知坑：`git ls-files` 必须带 `-c core.quotepath=off`，否则非 ASCII 文件名被八进制转义、整份文件漏扫；死链探测对散文里的举例路径会假阳性，命中行必须人工复核后再计数；vendored 第三方目录另行计数不并入。

3. **读样本**（限额，防炸上下文）：根 AGENTS.md/CLAUDE.md/CONTRIBUTING 与 CI 主 workflow 各读前 150 行，**再顺着 AGENTS.md 的链接看它指向哪些正本**（原则篇、词表、skill 等入口件模式抓不到的规范件）；决策记录目录抽 2 份，看有没有「替代方案」节。只为定级取证，不通读。
4. **定级**：对照 spec 七维表打 0-3。两个锚定样例防漂移：deepseek-harness ≈ 七维门禁层（3），builders-workbench 2026-09-01 ≈ 成文层（多数 2），实测数见 [`prototype-report.md`](../../../changes/native-audit/prototype-report.md)。
5. **出报告**：度量表（带命令）→ 七维评分（带证据路径）→ 缺失清单按「升一级最便宜」排序。

## 仓群路径

1. 入参：清单文件（每行一仓）或 codehub 组名。组名模式先探测 `codehub-cli`；不可用则明确报「内网模式在此机不可用，需在装过 buddy 的机器跑」，不装死、不降级成猜。
2. 每仓派一个子代理跑主路径，只回传评分卡（度量表 + 七维分 + top3 缺失，≤40 行）。
3. 主线程汇总：七维矩阵榜、全群 top 缺失、失败清单（含原因）、「BW 规范铺底可直接补哪些」对照段。
4. 超过 20 仓先扫每项目代表仓校准一轮，再全量。

## 出错与降级

命令超时（巨仓）→ 降级为 `--since="1 year ago"` 并在报告标注窗口；子代理失联 → 该仓 Unknown；任何降级必须出现在报告正文，不静默。

## 边界

不评代码质量、不做安全审计、不自动建活。缺失清单转工单由人决定。
