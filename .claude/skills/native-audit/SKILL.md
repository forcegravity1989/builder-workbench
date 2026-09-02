---
name: native-audit
description: >-
  仓考古:对任意 git 仓(单仓或仓群清单)做只读的 AI-native 制度化水位分析,
  按 AI-Native SDLC 九段三十七条准则打 0-3,产出考古报告与缺失清单。
  Use when the user asks to 考古/扫描/分析一个仓或内网仓群的 AI-native 实践、
  过程制度、native 缺失, or to compare repos against the rubric. Read-only;
  never modifies the target repos.
---

# native-audit — 仓考古

对目标仓量「AI-native 制度化水位」。**准则唯一正本是 [`changes/native-audit/rubric.md`](../../../changes/native-audit/rubric.md)**（9 段 37 条、阶梯 0-3、dsh 实证、playbook 映射）；本文件只写怎么执行，两处冲突以 rubric 为准。

## 硬纪律

- **只读**：不向目标仓写任何东西；远端仓 clone 进会话 scratchpad。
- **Unknown 纪律**：探针输出 `NA` 或拿不到的数据 → 该条记 0 并写明原因（浅历史 / squash / 无权限 / 超时），绝不推断补分。
- **可复算**：报告每个数字来自 `battery.sh` 的一行输出或一条给出的命令；每个定级带仓内证据路径。
- **两个锚点防漂移**：deepseek-harness（dd6322d604）≈ 3 分锚、builders-workbench（2026-09-01）≈ 2 分锚，两仓的电池读数与定级在 [`prototype-report.md`](../../../changes/native-audit/prototype-report.md)。给新仓定级前先对照这两张卡。
- **子代理**：仓群模式每仓一个子代理，模型 sonnet（难仓 opus），一律不用 Fable；并发 ≤5。

## 主路径（单仓）

1. **取仓**。本地路径直接用；远端 `git clone --filter=blob:none <url>`（历史全、blob 惰性）到 scratchpad。失败 → 该仓整体 Unknown + 原因。
2. **跑电池**（纯脚本、零 token）：

```bash
bash <skill 目录>/battery.sh <repo-path>
```

输出按 S0–S8 分段、每行 `C## 键=值`。电池已知边界：死链探针只查相对 `.md` 链接且排除反引号内路径和 vendor 目录，命中行仍须人工复核；`rgx` 类探针数的是「含该模式的文件数」，是成文与否的信号，不是质量分；`--include`/glob 一律在脚本内处理，不要手改成 zsh 展开写法。

3. **读样本**（限额，防炸上下文）：根 AGENTS.md/CLAUDE.md、CI 主 workflow、PR 模板各读前 150 行；**顺着 AGENTS.md 的链接看它指向哪些正本**（原则篇 / 词表 / 剧本）；决策记录抽 2 份看有没有「替代方案」与「后果」节；postmortem 抽 1 份看结构；评审剧本抽 1 份看阻断项。只为定级取证，不通读。
4. **定级**：逐条对照 rubric 的「3 分的样子」列打 0-3；机械读数只回答「有没有 / 多少」，成文（2）与机器强制（3）的区分要看：规矩写在哪个文件、有没有 hook/CI/脚本在拦、门禁有没有坏例自证。段分 = 该段各条的中位数；总评用九段分 + 「差口集中在哪一跳」一句话。
5. **出报告**：模板见下。

## 报告模板

```
# <仓名> · native-audit 报告（<日期>，HEAD <sha>）
## 电池读数（原样附 battery.sh 输出）
## 九段评分
| 段 | 分 | 条目分 | 一句话差口 |
## 三十七条定级明细
| # | 级 | 证据路径 | 差口 |
## 缺失清单（按「升一级最便宜」排序，最多 8 条）
## 与锚点对照（dsh / BW 同条读数）
## 本次电池异常（NA 项、假阳性、降级）
```

## 仓群路径

1. 入参：清单文件（每行一仓）或 codehub 组名。组名模式先探测 `codehub-cli`；不可用则明确报「内网模式在此机不可用，需在装过 buddy 的机器跑」，不装死、不降级成猜。
2. 每仓派一个子代理跑主路径，只回传评分卡（九段分 + 37 条级 + top3 缺失 + 电池异常，≤60 行）。
3. 主线程汇总：九段 × 仓矩阵榜、全群 top 缺失（按条计频）、失败清单（含原因）、「BW 规范铺底可直接补哪些」对照段（AGENTS.md 铺底 → S0；changes/ 链 → S1/S2；guard 脚本 → C32/C73；skill → C04/C51/C74）。
4. 超过 20 仓先扫每项目代表仓校准一轮（对照两个锚点看有没有系统性偏高/偏低），再全量。

## 出错与降级

命令超时（巨仓）→ 电池加 `--since="1 year ago"` 等价窗口并在报告「电池异常」段标注；子代理失联 → 该仓 Unknown；探针输出 `NA` → 该条 0 + 原因。任何降级必须出现在报告正文，不静默。

## 边界

不评代码质量、不做安全审计、不自动建活。缺失清单转工单由人决定。
