---
name: version-report
description: Use when 版本收尾要出版本报告：核对目标与任务状态、健康结论与验收用例证据，产出静态 HTML 归档到 .bw/planning/<版本>/。
---

# version-report：版本报告

## 1. 核心目标

把一版的事实（目标状态、任务收口、编译打包、验收用例与截图）确定性回填进固定模板，产出静态 HTML，归档到 `.bw/planning/<版本>/`。版式为五区结构：页眉与流程条给上下文，首屏总览让人一眼看到健康与目标达成，向下滚动是用例与截图详情，基础用例收在附录。模板、数据契约与渲染脚本共用；本 Skill 只是「版本收尾报告」这一条 SOP。

## 2. When to Use / When NOT to Use

用于版本收尾：该版工作完成、要给人一份可核对的结项材料时。不用于开发报告模板本身，不用于发版动作（打 tag / Release 由发版流程负责）。

## 3. 前置依赖检查

Python 3 可用；工作目录含 `.bw/planning/`；本版计划 JSON、出包产物目录、verify runId、e2e 运行记录按 [数据契约](references/data-contract.md) 逐块确认存在与否，没有就如实留空。

## 4. 标准执行流程

1. **核对版本与材料**：确认版本名与工作目录；读本版 `.bw/planning/<版本>/data.json` 的 plan.goals 与 plan.tasks；记录出包产物目录、最近一次 verify runId、e2e 运行记录（JSONL）与证据目录。
2. **前置出包编译**：产物目录没有本版安装包时，跑 `.bw/release/pack/pack.cmd --version <号> --workdir <仓根>`；已有产物直接复用。本版明确不出包则 build / pack 留空。
3. **源码验收**：`node .bw/release/verify/verify.mjs --profile pr`，拿到 runId；已有同版结果可直接引用。
4. **验包**：需要实跑安装包时跑 `.bw/release/e2e/e2e.cmd`，收集 stdout JSONL 与证据目录。
5. **建数据与采集**：`scripts/report.py --workspace <工作目录> --version <版本> init`；再 `collect --verify-run <runId> --e2e-log <JSONL> [--e2e-root <目录>] --shots-to .bw/planning/<版本>/shots`，脚本解析用例、复制截图并回填相对 url；需要产物清单或读数再加 `--artifact-dir` / `--readings`。
6. **回填 report.json**：goals / tasks 引用本版计划，任务状态用 `gh` 读回；head 填版本对、源码修订、出包时间与真实 tag / Issue；health 填编译打包结论与两档用例计数；cases 用 collect 产出的 case_list，并对上本版目标的验收点标 `kind: acceptance`，其余冒烟与通用回归保持 `basic`。
7. **渲染与核对**：`render` 产出 `report.html`，浏览器打开通读一遍：首屏能看到健康卡、目标状态行与任务计数；用例区截图加载正常、附录只含基础用例；无残留数据槽。
8. **归档与回填**：`report.html` 与 `shots/` 留在 `.bw/planning/<版本>/`；把报告路径回填到当周计划 results.deliverables 中版本报告条目；随工作分支提 PR，完成由人确认。

## 5. 参考资源

- [报告模板](assets/report-template.html)：五区固定版式与样式，含全部数据槽。
- [数据模板](assets/report-template.json)：新报告空结构（schema 3）。
- [渲染脚本](scripts/report.py)：init / render / collect，标准库实现。
- [数据契约](references/data-contract.md)：版式结构、每块字段来源、取法与缺失写法。

## 6. error_handling

| 情况 | 处理 |
|---|---|
| 本版计划 JSON 缺失 | goals / tasks 留空，渲染显示留空说明；不凭提交记录反推目标 |
| 未出包 / 未验收 / 未验包 | health 对应字段留空或 null，显示「未跑」 |
| collect 报格式错误 | 来源文件损坏或协议不符；重新生成来源，不改脚本绕过 |
| render 报数据槽缺失/重复/残留或 schema 不符 | 模板与脚本不配套，停住报人，不手改模板绕过 |
| 用例没有对上任何目标 | 留在附录（basic），不硬凑成验收点 |
| 产物目录在工作目录外 | 脚本拒绝；改用工作目录内路径 |

## 7. 示例

收尾 v0.4：读 `.bw/planning/v0.4/data.json` 得 G1/G2 两条目标与 3 个任务；pack 产物在 `.bw/release/out/0.4.0/`；verify runId `2026-09-12T2154Z-9a31` 通过；e2e JSONL 里 5 个用例。init 后 collect 两线并 `--shots-to .bw/planning/v0.4/shots`，脚本产出 case_list 与截图相对 url；回填时 deeplink-plan、session-open 标 `acceptance`，其余 3 个保持 `basic`；health 填 `acceptance {passed: 1, total: 2}`、`basic {passed: 3, total: 3}`；render 出报告，首屏见健康卡与 G1/G2 状态，附录收 3 张基础用例卡。

## 8. 纪律表

| 必须 | 禁止 | 你不做的事 |
|---|---|---|
| 事实只从来源读回（计划 JSON、产物、verify、e2e 记录、Issue）；缺失留空 | 编造读数、编号、哈希；为塞内容改模板；把报告当发版动作 | 替人确认版本完成；自动打 tag / 建 Release |
