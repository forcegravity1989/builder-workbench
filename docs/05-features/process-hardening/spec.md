# Spec · 过程纪律门禁化（判定口径与样例）

> **30 秒导读**：这是什么——本次变更的**规格件**：六个项每项的精确判定口径、可复算命令、好/坏样例。给谁看——实施的会话（照口径写脚本）与审 PR 的人（对着样例核脚本真拦得住）。现在作数吗——**随 intent 待 gate**。本变更无界面，按 02 §3.2 精神以**判定样例代替可点原型**（可指摘之物 = 每项的坏例必须被拦、好例必须放行）；这一取舍留给规格 gate 认可或退回。

## A1 · guard-doc-links.sh（文档死链）

**口径**：遍历 `git ls-files '*.md'`，提取 Markdown 相对链接 `[…](path)`（跳过 `http(s)://`、`mailto:`、纯锚点 `#…`）；链接目标按所在文件目录解析后必须存在于工作树。**锚点段（`file.md#section`）只校验文件部分，锚点存在性不做**——留白如实标注，不为它引第三方工具。

**复算**：`./scripts/guard-doc-links.sh`，输出死链清单与总数；退出码非 0 即红。

**样例**：坏例 = 任一 `.md` 写 `[x](docs/不存在.md)` → 必须列出并红；好例 = `[x](../../../AGENTS.md)` 目标存在 → 放行。

## A2 · guard-doc-budgets.sh（文档字数预算）

**口径**：预算清单 `scripts/doc-budgets.txt`，每行 `路径<TAB>字节上限`；脚本对每行跑 `wc -c` 比对，任一超限即红并打印「实际/上限」。**提额 = 改清单行 + 该 commit message 论证需要更多篇幅**；不许为过门禁删导读、删链接凑数（评审看得出来）。

**为什么按字节而不按字符**：本仓文档以中文为主，一个汉字 3 字节，`wc -m` 与 `wc -c` 差 1.5–2.4 倍；且 `wc -m` 的结果随 locale 变（CI runner 与本机可能不同），`wc -c` 不会。护栏要的是稳定可复算的同一把尺，不是精确的「字数」——上限按实测 ×1.15 定，余量口径因此始终是 15%。

初值 = 2026-09-02（合入 main 文档重组后）实测 × ~1.15 圆整：

| 文件 | 实测（字节，`wc -c`） | 上限（字节） |
|---|---|---|
| `AGENTS.md` | 12,713 | 15,000 |
| `CONTEXT.md` | 39,966 | 46,000 |
| `README.md` | 7,173 | 8,500 |
| `DESIGN.md` | 1,988 | 2,500 |
| `docs/architecture.md` | 52,151 | 60,000 |
| `docs/01-principles/01-document-organization.md` | 14,808 | 17,000 |
| `docs/01-principles/02-working-backwards.md` | 8,551 | 10,000 |
| `docs/01-principles/03-press-release-faq-flywheel.md` | 38,617 | 44,500 |

**复算**：`./scripts/guard-doc-budgets.sh`；随时打印全表（比值列即「可统计」的日常读数）。单份复算 `wc -c <文件>`。

**样例**：坏例 = 往 `DESIGN.md` 粘 700 字节（约 230 个汉字）使其破 2,500 → 红；好例 = 现状全表 → 绿。

## A3 · guard-selftest.sh（门禁自测）

**口径**：对 `scripts/guard-*.sh` 逐个执行「坏例断言」：在临时目录（或临时文件，测毕即删、不入库）构造该 guard 声称要拦的最小坏例，断言 guard 对坏例退出码非 0、对干净现状退出码 0。**覆盖率 = 有坏例断言的 guard / 全部 guard = 100%**；新增 guard 未配自测则 guard-selftest 自身红（分母自动跟随 `ls scripts/guard-*.sh`）。

**复算**：`./scripts/guard-selftest.sh`，输出 `covered/total`。

**样例**：坏例 = 删掉某 guard 的自测块 → guard-selftest 红并点名；好例 = 六个存量（`ls scripts/guard-*.sh` 现值）+ 四个新增（A1 死链、A2 预算、A3 自测自己、B2 冻结件）各有断言 → `10/10` 绿。

**现成范式**:`scripts/guard-bw-write-authority.sh`(从 #134 提取并入)是全仓第一条自带自测的 guard,A3 照它的形状做即可。它还提供了本条规矩最硬的实证——**同一条 guard 在评审里被抓出三个洞、每次都在「打勾但什么都没守住」**:①正则写死 `crate::repo::` 前缀,匹不到壳里会用的 `bw::repo::`;②点名了一个仓里根本不存在的函数(`append_metric_reading`,真名是 `upsert_metric_reading`);③自检拿裸名满仓找,被别的模块里的同名函数匹上,于是不存在的条目一路绿灯。三次全是 CI 全绿。**这就是为什么 guard 必须自证,而不是靠写它的人记得对。**

## B1 · 「放弃方案:」commit 约定（半自动，如实标注）

**口径**：AGENTS.md「commit 约定」加一条——**非琐碎变更**（改行为、架构、规范、流程、测试策略之一）的 commit message 须含一行 `放弃方案: <考虑过什么、为什么不>`，或指向 `docs/05-features/<id>/` 中已记录替代方案的正文；纯机械/局部修改豁免。**不上 guard**：「非琐碎」无法机器判定，强上会把琐修逼成假合规——这是六项里唯一靠盘点而非 CI 的，如实标注。

**复算（统计口径）**：`git log --no-merges --since=<起点> --format='%h %s%n%b' | grep -c '^放弃方案:'` 得分子；分母 = 同窗口人工抽查判为非琐碎的 commit 数（周盘点顺手做，样本 ≥ 20）。基线 0/近 20；目标 30 天后 ≥ 80%。

**样例**：好例 = `fix(bw): Done 边按名污账改按 id` + `放弃方案: 保留按名匹配加去重——治标，同名活再现即复发`；坏例 = 改状态机守卫的 commit 无此行 → 盘点记一笔。

## B2 · guard-frozen-docs.sh（冻结件纪律）

**口径**：冻结清单 `scripts/frozen-docs.txt`（每行一个路径；首批盘入现有带历史横幅的过时文档）。guard 对 `git diff --cached --name-only`（本地 pre-commit 视角）与 CI 的 PR diff 判定：**触及清单内文件即红**。要修冻结件（如死链修复），先把该文件从清单临时移出并在同 commit message 论证，评审看这条论证——不做行级例外（复杂度不值，取舍同 dsh「archived 永久冻结」但留了人工通道）。

**复算**：`./scripts/guard-frozen-docs.sh`；清单件数 = `wc -l scripts/frozen-docs.txt`；拦截次数看 CI 史。

**样例**：坏例 = 改清单内某历史文档正文一行 → 红；好例 = 同 diff 不触清单 → 绿。

## C1 · standard/ 对标校准（只立项）

**口径**：dsh 实战范本中属于**产品资产**的三样——宪法结构（每条 1–3 行 + 外链理由）、slop 清单、决策记录格式——对标校准 `standard/system-prompt/` + `standard/templates/` + `standard/skills/`。这改的是推给被管项目的正本，必须对齐 03、走完整特性 gate（intent + 带原型 spec）。**本批验收 = 按标准建活 + 开出 `docs/05-features/<id>/intent.md` 草稿**；实施不在本批。

**复算**：活链接存在、intent 文件存在，二者即 1/1。
