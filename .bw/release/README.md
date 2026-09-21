# 交付链规范（BW 自身样板）

> **30 秒导读**：本篇是 BW 自身交付链的**单一操作正本**：PR 交付、出包验包、正式发布、代码评审四条旅程，每站的触发、命令、产物、证据与授权边界。站点细节不在这里复制：门禁清单与开发规矩→[AGENTS](../../AGENTS.md)，验证入口使用与 E2E 注册协议→[verify/README](verify/README.md)，出包/验包/发布协议→[ADR 0005](../../docs/02-adr/0005-发版出包与E2E协议.md)，评审特性→[reviewer-agent](../../docs/05-features/reviewer-agent/spec.md)，术语→[CONTEXT](../../CONTEXT.md)。本篇管「链与站序」，不管产品功能设计。旅程站点、入口或授权边界变化时更新本篇。
>
> BW 是组内第一份完整样板：被管项目按文末「通用约定」接入，在自己的 `.bw/release/` 里填自己的实现，不照抄 BW 专用工具。

## 全链一览

```
改动 → 本地门禁 → PR 前自检 → 开 PR（正文规范）→ verify 验证 Review
     → 外部代码评审（按需召唤）→ CI 两 job → 人合入
版本收尾：pack 门禁验证 → 出包（候选包成立）→ 验包
     → 版本报告与备稿 → 人明确授权 → 正式发布（绑定+读回）→ 归档
```

四铁律在链上的落点：**绿必有据**（少跑即 fail、过了必带非空证据、模型跑过不算数）；**Unknown 不装绿**（未召唤评审=灰、记录缺省=unknown、没数据就是 Unknown）；**完成与发布永远由人确认**（自动化、agent、定时不得推 Done、不得合入、不得授权发布）；**数字可重算**（所有记录现算生成，发布后下载资产复算哈希读回）。

## 旅程 1 · PR 交付

| 站 | 触发/时机 | 动作与命令 | 产物与证据 |
|---|---|---|---|
| 本地门禁 | 每个 commit 前 | AGENTS「提交前门禁」清单（fmt/clippy/check/6 守卫/test，Git Bash 跑 .sh） | 无落盘；红了不提交 |
| PR 前自检 | 开 PR 前必做 | 独立 subagent 审全 diff（见「PR 前自检」节） | 自检摘要写进 PR 正文 |
| 交付验证 | 开 PR 前 | `node .bw/release/verify/verify.mjs --profile pr`；改「添加项目」旅程换 `pr-onboarding` | `out/verify/<run>/`：result.json / manifest.json / report.html / review.md |
| 开 PR | 自检与验证后 | 正文按四要素（见「issue/PR 正文规范」） | PR |
| 验证 Review | PR 开好后 | `node .bw/release/verify/publish-review.mjs --pr <号> --run <run目录>` | PR Review 评论（四件套钉 SHA）+ `shots/<分支>` 证据 + github-review.json 回执 |
| 外部代码评审 | 按需召唤 | PR 评论单独一行 `/code-review`（draft 不触发） | 带 SHA 标记的结论评论 + code-review-receipt |
| CI | PR 创建/更新、main push | ci.yml 两 job：Ubuntu headless / Windows 全量+构壳+固定 E2E | Checks Summary（含外部评审状态行）+ Actions Artifacts（14 天） |
| 人合入 | 证据齐后 | 人看验证 Review、评审结论、CI 后合入；轻保护（PR 必需+Windows CI 必过）由 admin 配置 | merge commit |

不自动合入、不自动关 Issue；「默认继续交付 PR」指工作会话默认推进到开 PR 并补验证 Review，人明确说「只本地」才停。

## 旅程 2 · 出包与验包（候选包成立）

| 站 | 动作与命令 | 产物与证据 |
|---|---|---|
| 出包门禁验证 | `verify --profile pack`（pr 全部门禁 + 周一屏真实旅程；需 Orca 开着、gh 登录、python） | pack run 目录（16 用例） |
| 出包 | `.bw/release/pack/pack.cmd --version <tag串> --workdir <仓根>` | `out/<tag串>/BuildersWorkbench-<tag串>-Setup.exe` + `pack-result.json`（artifact/sha256/revision/dirty/source_unchanged/packed_at） |
| 验包 | `verify --profile installer --version <tag串>`；产品「验包」按钮=`e2e.cmd` 同一入口的 JSONL 适配层 | installer run 目录（静默装→装出的真壳往返读回→卸载读回；setup-identity.json 现场哈希比对出包记录） |

候选包成立 = 三绑定齐：构建修订（revision）+ 产物文件名（版本串派生，不得改名）+ SHA-256。源码级验证（pr/pack）与安装包级验证（installer）对象不同，不能互相冒充。

## 旅程 3 · 正式发布

1. **版本报告与备稿**：version-report skill 出版本验收报告（`.bw/planning/<版本>/`），并备稿版本说明与 Release 草稿（skill SOP 为正本）。
2. **人明确授权**：授权是人的显式动作，记录授权人与出处；自动化、agent、定时任务不得代为授权（四铁律）。
3. **发布**：`node .bw/release/publish/publish.mjs --version <tag串> --pack-run <run> --installer-run <run> --notes-file <版本说明> --authorized-by "<授权记录>"`——四记录绑定校验（出包记录+门禁验证+验包+tag 指向构建修订且在 origin/main 上）缺一拒发；tag message 与 Release 绑定块由记录渲染，不手写；发布后下载资产复算 SHA-256 独立读回；收据落 `out/publish/<版本>/`。协议细节见 ADR 0005 发布节。
4. **归档**：版本报告引用收据，不另抄数字；发版证据唯一进仓路径是 `.bw/planning/<版本>/`，发布存储正本在 GitHub Releases。

发布存储口径：GitHub Releases=正本；WeLink 仅通知；OneBox 会丢不作正本；CodeHub 是被管项目平台不承载 BW 包。同号不重发；`--allow-dirty` 是显式放行且写进收据与 Release 正文，不是缺省路径。

## 旅程 4 · 代码评审（横切）

- **自检必做**（PR 前，工作会话侧）：见下节。
- **外部评审按需召唤**：仓库成员在 PR 评论单独一行 `/code-review`，审当前 head SHA；draft 不触发；`workflow_dispatch` 是手动等价入口。结论必须落带 `<!-- bw-code-review:SHA -->` 标记的评论，程序读回并保存回执；读不到即该次评审失败——「模型跑过」不算结论。
- **未召唤=未外部评审（灰）**：CI Summary 与验证 Review 正文各带一行机读状态（唯一实现 `verify/review-state.mjs`），不失败、不缺省绿。
- **建议召唤的情形**（推荐口径，正式清单随旅程规范尺子落定）：动四铁律机制、guard 脚本、发布链、跨屏导入的改动；不召唤宜在 PR 正文说明理由。
- 评审意见不自动否决：逐条处置，真实缺陷阻塞，争议留给人；评审不合并、不改 Issue 状态。

## PR 前自检

工作会话开好分支、过完门禁后，开 PR **前**先跑一次独立 subagent 自检（不代替门禁、外部评审与人审）：

1. 输入：全 diff + 本次意图 + 涉及的现行规范（AGENTS、站点正本、特性 intent/spec）。
2. 审什么：真实 bug（给文件:行号:触发条件:影响:建议修法）、失败处理是否如实（不装绿不静默）、证据与声明一致、与规范/正本口径一致、测试是否真的看护新行为。
3. 处置：发现先修再开 PR；自检结论（几条发现、如何处置）摘要进 PR 正文。修过源码则重跑门禁与验证（源码变化使旧结果失效）。

## issue/PR 正文规范

- **Issue**：标签协议、状态机与写入者边界以 [issue-state](../../standard/system-prompt/references/issue-state.md) 为正本；标题让人不查文档也懂；不打 `kind`/`tool`/`workflow` 标签。
- **PR 正文四要素**（必含）：①改了什么与为什么（含取舍与偏差）②知识去向（更新了哪些正本；文档改动列头部边界变化与授权）③验证结果（门禁/E2E/自检/评审，带 run 号与命令，可复跑）④未验证项（如实列留白，不把静态检查说成行为验证）。
- 界面/行为改动另发验证 Review（截图四件套规则见 AGENTS「修改与交付」）；纯 CI/文档改动如实报告文档检查，不伪造界面验证。
- PR 正文不堆运行日志：机器结果正本在 `result.json`/`manifest.json` 与 Actions Artifacts，正文只链接。

## 触发矩阵

| 事件 | 跑什么 | 谁跑 |
|---|---|---|
| 本地 commit 前 | AGENTS 门禁清单 | 人/工作会话 |
| 开 PR 前 | verify `pr`（涉「添加项目」用 `pr-onboarding`）+ subagent 自检 | 工作会话 |
| PR 创建/更新 | ci.yml：Ubuntu headless + Windows 全量与固定 E2E | GitHub Actions |
| PR 评论 `/code-review` | Code Review workflow：审当前 head SHA、结论落盘、回执读回 | GitHub Actions（成员召唤） |
| 出包前 | verify `pack` | 出包人（受信本机） |
| 出包 / 验包 | pack.cmd / verify `installer`（产品按钮=同一入口适配层） | 出包人（受信本机） |
| 人授权发布后 | publish.mjs（绑定校验→tag→Release→读回→收据） | 发布人 |
| main push | ci.yml + CodeGraph 发布 | GitHub Actions |

云端 CI 不持有跨仓写凭据与发布凭据：`pr-onboarding`/`pack`/`installer`/发布只在受信本机跑；云端普通 PR 只声明自己实际运行的范围。

## 被管项目接入约定（通用五件）

1. **一个交付验证入口**：profiles 声明各场景必跑步骤；少跑、未跑、不适用都判 fail。
2. **用例注册与证据协议**：suites 注册（id/layer/profiles/command/expectedCases）+ `result.json` v1 用例协议；通过的用例必须带本步骤目录内非空证据文件。
3. **全量证据哈希与独立读回**：manifest 逐文件 SHA-256；发布类动作（Review/Release）发布后必须独立读回核对；不从日志推断成功。
4. **评审口径**：自检必做；外部评审按需召唤、结论钉当前 SHA、未召唤显灰不缺省绿。
5. **发布口径**：发布存储正本明确、产物身份绑定（修订+文件名+哈希）、缺记录拒发、授权只能来自人。

BW 专用件（**不照抄**）：Rust 门禁命令与 6 个 guard、WebView2/desktop.ps1 真壳启动、Inno 安装器、`bw-e2e-sandbox` 沙箱仓（repository id 硬核验、run-id 造数与归属清理）、gh/git/Orca 读回细节。被管项目按通用五件选自己的构建命令、E2E 工具、包型与凭据，接入修改走项目自己的 PR；通用层提炼进 `standard/` 由后续批次做，本篇不预支。

## 边界（本篇不管）

- 特性旅程的规划尺子（intent/spec/旅程/E2E/TDD/验收）：原则层与 `docs/05-features/` 流程为正本（尺子文档落点由主会话定稿）。
- 产品功能与模块设计：`docs/architecture.md` 与 `docs/06-module/`。
- 版本报告 SOP 与报告字段契约：`.claude/skills/version-report/`。
- 分支保护配置：人（admin）操作；当前口径=轻保护（require PR + Windows CI 必过检查，不设人审人数）。
