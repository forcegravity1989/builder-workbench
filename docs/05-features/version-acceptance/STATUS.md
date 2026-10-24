# 版本验收 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台是主干 main 的 Electron/Orca 叠层。**v10（周五验收会议四步屏）的规格与意图已由负责人于 2026-10-22 逐项确认**，形态正本为 [acceptance-journey-prototype.html](acceptance-journey-prototype.html)。**生产实现已随 [#394](https://github.com/forcegravity1989/builder-workbench/pull/394) 合入 main**（`5f7816a5f`）：四步屏、协议宽容读回、发布改纯注入、空板硬门禁均已接线。2026-10-23 追加**验收对齐轮**（见下节），把计划屏第八/九轮反馈在两屏对齐。

v9.5（#369/#377）的六环证据与 A01–A14 矩阵随 v10 规格生效而**整体失效**，历史证据从 [PR #369](https://github.com/forcegravity1989/builder-workbench/pull/369)、[PR #377](https://github.com/forcegravity1989/builder-workbench/pull/377) 与 Git 追溯。v9.5 旧稿 [prototype.html](prototype.html) 保留基线身份，不代表现行规格。

## 当前实现与证据边界

v10 生产实现（#394 分支交付、已合入 main），按提交顺序：

| 提交 | 内容 |
|---|---|
| `e26b693be` | v10 生产实现——四步会议屏、协议退役与剥离读回、发布改纯注入 |
| `45518c200` | 负责人真壳验证发现的三处修正——页头对齐计划屏、旧格式宽容读回、门禁状态透明 |
| `c13617011` | 检视修正——门禁与快照两处死循环、模型侧材料契约重写、页头三行 |
| `88234e36c` | 合入 main（含 #407），解原型与 CSS 冲突，把角标配色修复迁到共用层 |
| `2fa0a8b3b` | 注入通道接通——改用共用发送弹窗，剪贴板走 Orca IPC |
| `cfdb12f97` | 验收屏烟测断言跟上 v10（「新建验收」已随草案预验收通道退役） |

**证据边界要说清楚**：负责人在 `45518c200` 之前的一轮真壳里发现并推动修正了四个问题（页头排版、旧版本读不出、空板无解释、两处死循环），**那四个修正本身以及此后所有提交都没有再过真壳**。`2fa0a8b3b` 修的注入通道恰恰是只在真机上才暴露的一类缺陷，其依据是「同一份代码路径在计划屏已由真机验证（#407）」加上独立查透的调用链，不是本屏真机已验。因此下方矩阵没有任何一列记 ●。

已跑的门禁：`pnpm run typecheck` 绿；`pnpm run lint` 退出码 0；CI 正本范围 vitest 412/412 全绿（62 文件）；`check:vitest-count-ratchet` 226 例，持平基线；两个高保真原型 bundle 重建后 `--check` 双双通过。`build:desktop` 与 e2e 本机未跑（worktree 路径超 Windows 248 字符限制，`pnpm install` 的 postinstall 在 `@vscode/windows-process-tree` 上失败），交 CI 判定。

v10 复用的共用件随计划屏 G3（[#399](https://github.com/forcegravity1989/builder-workbench/pull/399)）与真机四修（[#407](https://github.com/forcegravity1989/builder-workbench/pull/407)）落地，验收屏已接入：板面批注组件族（内存态）、会议纪要机制、对象级动作经 `plan-send-menu.tsx` 包装 Orca 原生发送弹窗递交、上版回顾按固定来源寻址。

技能正本 `standard/skills/version-acceptance/SKILL.md` v0.7.0 与 `standard/system-prompt/references/version-records.md` **已按 v10 最终裁定同步**：四步 SOP、发布环节「板面只注入、材料不存发布记录、总览不显示已发布」、纪要编辑态与撤销语义、演示环境两形态、跨周与轮次表述已清除。技能资产有字节门禁，改动须连同 `generate:bundled-skill-guides` 与 `generate:skill-bundle-manifest` 的产物一并再生。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | 已确认 | v10 四步会议屏、个人自验移出本屏、界面不用灯、不承载跨周按轮次刷新，2026-10-22 负责人确认 |
| spec | 已确认 | v10 规格与 A01–A13 验收点、AJ01 旅程已定稿；仍待决项见 spec「取舍与待决问题」（查看验收依据界面落点、个人自验落点、发布 e2e gate、两份报告产出顺序、G2 配套） |
| 实现设计 | 已确认 | design.md 已按 v10 重写：演示环境两形态、纪要字段与撤销/冻结规则、退役字段宽容读回、批注共用件接入点、计划屏与总览的连带改动 |
| 核心算法/数据协议 | 已接入 | 协议已改（minutes、demoEnv、stage 三值无 release 字段、退役字段留作只读可选）；人工字段守卫三件（material / plan / acceptance）覆盖纪要与结论改写；协议测试随改维护，ratchet 持平基线 |
| 验收点 E2E | 部分 | `workbench-cycle-smoke` 的验收段已跟上 v10（断言空板挂载与入口存在，不锁具体门禁结论）；A01–A13 其余各点未注册专项用例，按 02 环 4 控量，稳定后专项回补 |
| 用户旅程 E2E | 缺口 | AJ01 未运行。需真实服务、真实报告、真实发布读回与杀进程重启核对；模拟不计通过 |

## 2026-10-23 验收对齐轮（两屏一致性）

计划屏第九轮反馈（[#410](https://github.com/forcegravity1989/builder-workbench/pull/410)）合入后，负责人要求排查验收屏是否存在同类问题并核对两屏匹配性，经 AskUser 拍板四项：

1. **批注 store 按板面身份键控**。#410 的模块级全局会话被验收屏挂载即清空——两屏 scopeKey 必不同，切到验收屏的瞬间计划屏未发送批注被 `clearAll` 清掉（反向击穿第九轮「切屏保留」），且两屏 goalId 相同会串角标与发送清单。`use-board-annotations.ts` 改为 `Map<boardId, session>`（boardId = scope+版本），两屏的命令式 identity-clearAll effect 同批删除；切版=换 key 天然空会话，切屏各读各的，重启仍按正本丢弃。
2. **批注发送成功即清空**。验收 spec 原「发送后不清空」与计划屏 A 案相反，统一为清空（负责人补充理由：发送后记录已在会话侧，板面无需保留）。spec「在线批注」条款已改。
3. **批注入口挪进 Showcase 区块标题行**。对齐计划屏第八轮就近入口形态（文字标签 + 未发送条数角标 `acc-annotate-count`）；页头 `extraActions` 槽位与空板态常禁用占位钮删除，spec 页头同构句已改。
4. **version-acceptance SKILL 四件套完整同步**。VA SKILL 补回指 week-planning 的路由句、整理纪要 SOP 对齐计划屏第九轮（问一次会议 ID、转写显式范围、全量清单语义、无批注兜底、保留人工编辑/重写前 diff）、「需要时读取」补会议转写条目；`meeting-transcript.md` 写入落点从已退役的「验收指导」（meetingDirectives）改为纪要节；week-planning SKILL 会议遗留来源补 v10 主源（已人工确认纪要 `minutes.followups`，legacy directives 降为回退）并把执行流程段落物理顺序摆正（1,2,3,4,5）；投影、bundled 指南与 skill-bundle manifest 全部再生——**顺带修复 #410 漏跑的 manifest 陈旧**（week-planning 条目停在 0.6.0 旧 hash，`verify:skill-bundle-manifest` 在 main 上必红）。

同批修复（subagent 盘点实证）：发布/归档/部署三个注入 prompt 瘦身（预检清单、固定树路径、写回协议等 SOP 细节归 Skill，按钮只留触发意图）；三处「原型注释升格成生产 UI」的解释脚注删除（勾勾表、准备区、发布卡），纪要卡小注减密度并去掉被否决的「常驻可编辑」旧稿措辞；出包/下载禁用按钮补原因 title；「发起归档」改 Archive 图标（与发布 Rocket 同卡撞车解除）、打开报告统一 FileText；纪要区死分支删除（`document` 收必填——空板在 AcceptanceBoard 早退，无材料分支不可达）；空态指引提到页头批注的过期文案随分支删除。计划屏侧连带微修：闭环句两处 title 标点归 spec 正源（分号→逗号）、`version-workflow.ts` 注释改准（stage 的唯一 UI 消费是归档卡「已进入归档阶段」状态行）、planning design.md 三处陈旧句修正（stage 消费表述、上版回顾会议遗留来源、CycleArchive 已删）。

高保真：`acceptance-app.jsx` 同步（Showcase 入口 + 角标、页头入口移除、四个注入 prompt 瘦身、批注发送全量清单句 + 成功清空回执、报告目标级锚点退役改整份打开、「原因写进展」→「原因写纪要」、遗留待评审清单去轮次、设计说明三段更新），`minutesRequestPrompt` 正源落 `acceptance-model.js`；bundle 重建且 `--check` 通过——**该 bundle 自 #394 后即 stale**（#410 重排源文件未重建），本轮修复。原型既有欠账（本轮未动，留高保真专项）：生产已有而原型缺的 Bug/Feature 徽标、「进行中」状态映射、出包区「下载」按钮、Unknown「状态未知」行、旧格式记录只读折叠区、门禁「重新核对」重试与页头版本选择器（原型按 G2 侧栏选版假设绘制），以及部署按钮位置差异（生产在「演示环境」行、原型在出包工具栏）。

**验证边界（负责人明确授权）**：本轮不跑本地 CI 门禁、不新增单测、不做真机验证，真壳验证留人。已跑检查：验收原型 bundle `--check`、`verify:bundled-skill-guides`、`verify:skill-bundle-manifest` 通过；其余为静态审查与 subagent 双检视（四维 + 静态 BUG）。真壳欠账沿用下表并新增：两屏互切批注保留/互不清空、Showcase 批注入口与角标、发送成功清空回执、纪要/发布/归档/部署四个瘦身后 prompt 的弹窗预览文案。

## 2026-10-23 UI 对齐轮（真机 v0.7.0 反馈后，#417）

负责人真机装 v0.7.0 复核后反馈验收屏与计划屏的质量差距；AskUser 三项拍板：收折单一入口+收折栏可点展开、生产全量对齐计划屏/高保真、确认所装为 v0.7.0（五条抱怨均为最新代码真实欠账）。高保真审阅与真机反馈再拍板：目标行删报告入口（报告一份/版本，入口只留「验收准备」）、Issue 行补原生任务详情按钮（生产本有、高保真补齐）、Showcase 区块头补「刷新 Issue」（计划屏漏抄）、演示环境行显示系统名绑定链接（`demoEnv.kind='url'` 增可选 `label`）、CAS 冲突改按字段归属静默合并只留一行提示。

**壳层与验收屏对齐**：`.vc-split` 改 6px 实体全高热区（负责人真机证实旧版只有顶部 titlebar 一段可拖）、titlebar 删验收专用老「收折会话」开关（收折/展开统一板面页头 chip 唯一入口）、收折态 36px 栏加整栏点击展开覆盖层；页头同行，Showcase 卡 / Issue 行 / 纪要卡 / 归档发布卡 / 旅程导航抄计划屏度量，动作按钮统一 `BoardActionButton`，长 title 与说明文字清到计划屏密度；SKILL/version-records 同步 demoEnv label 写回规则（四件套再生）。实现明细见 [design.md](design.md)「UI 对齐轮」两段，本节不留重复副本。证据报告 HTML 改经 Orca 原生浏览器预览打开（spec A04「内置浏览器可打开」此前实为编辑器打开，真机反馈修正）。检视轮同批修正：两屏 `refreshIssues` 的 finally 守卫死锁同源缺陷（刷新在途切版本转圈永久卡死）、合并基线不推进（连环冲突钉死已采纳值）、宿主已删分支复制守卫缺失、1px 分隔线半像素定位发虚、base 缺失行默认空串盖远端人写值、远端已删空 result 行被复活。

**冲突静默合并**：CAS 冲突按字段归属自动合并（`acceptance-merge.ts` 纯函数 + `MaterialDraftController` 可选策略与干净基线追踪；计划屏不传、行为不变），人字段保本地改动、模型字段取远端、本地新建或人改过的 result 行保留，界面只留一行提示，`AcceptanceNotices` 退役裸 JSON 对照；仅基线缺失（脏草稿恢复后再冲突）退回两按钮人工处置。机制明细见 [design.md](design.md)。**欠账：merge 纯函数无单测看护（新增用例受 ratchet 约束需对冲，留专项回补）；冲突合并、分隔条全高拖拽与收折栏点击展开未在真壳验证。**

**验证**：typecheck、check:dead-classes、受影响 vitest（验收套件 + material-draft + shared 材料链）、verify:bundled-skill-guides / verify:skill-bundle-manifest、build-acc --check 绿；app-startup-routing.test.ts 一例在 Windows worktree 因 CRLF 多行断言失败（期望 needle 以 CRLF 形态存在，非本轮引入，Linux CI 不受影响）。真壳留人：分隔条全高拖拽、收折栏点击展开、页头同行与新卡/按钮形态、演示环境系统名、冲突静默合并一行提示。

## 2026-10-23 易用性收口轮（v0.7 验收会后，#426）

v0.7 验收完毕，验收会三条易用性决议：**①批注入口移回页头右上角**（两屏同轮。页头不随内容滚动，会中随时进出批注模式、未发送条数角标常驻可见；`AcceptanceHeader` 增可选 `annotateEntry`，`AcceptanceBoard` 仅在计划已读时传入，空板态维持无入口；Showcase 区块头槽位删除）；**②验收标准可批注**（`.acc-acceptance` 挂 `kind='acceptance'` 捕获属性 + h3 合并角标，与计划屏同款对象语义；spec「验收标准区块不参与批注」条款经会决议改写，「下一步」输入件维持排除；批注横幅与入口 title 文案随对象清单更新）；**③计划屏进度条第一步改名「计划准备」**（计划侧落地，与「验收准备」口径一致，见计划 STATUS 同轮节）。spec :15/:58、design 批注捕获层段与 kind 取舍句、高保真（入口位置、验收标准批注、横幅文案、设计说明）同步，bundle `--check` 绿。**真壳未验**：页头入口新位置、验收标准批注全流程（悬停描边、小窗、角标、发送清单含「验收标准」对象）。

## 2026-10-24 提示词资产质量轮（#431/#428，验收侧）

与计划侧同轮（规范 SKILL-MD-SPEC v2、SYSTEM 模板修正、meeting-minutes 纪要质量规范、legacy-materials 查找型 reference、注入句洗人话等共用件明细见计划 STATUS 同轮节与 #431）。验收侧落地：**version-acceptance SKILL 0.8.0** 执行流程 7 步重编为「开场 + 四区」（验收准备/Showcase/会议纪要/归档 PR 及发版本，与板面进度条同名），开场镜像计划侧硬规则（入口已给版本直接恢复不选第二次、计划未合入硬门禁如实告知、每步一行回执直接继续不中断、不发散）；「会话驱动板面」三列表、报告模板节、stage 校准表保留（检视公认好模式，stage 明确不作面向用户步骤名）；批注对象清单补验收标准（#426）；纪要区挂 meeting-minutes 质量规范、整理语义改提炼。**发现存根**补中文四步旅程句与恢复/门禁/回执/不代勾规则（原零中文产品内容，skills 服务不可用时助手对旅程一无所知，检视发现⑥）；CLI 样板经真机实测保留。批注发送双意图（负责人明确）随两屏 spec 同步。**version-records** 拆双受众、**meeting-transcript** 实现细节压缩（保留模型实际消费字段名与全部行为规则）。四件套再生 verify 双绿、原型 bundle --check 绿。**真壳未验**：开场行为与纪要提炼质量真实会话抽样（含「不复述板面达成/状态」）；升级装机版后转写链复验。

## 验收点与旅程矩阵

> 口径：○ = 未实现；◐ = 代码已接入但真实用户旅程未完整；● = 齐。协议测试、静态检查与原型结果不等同真壳 E2E。本轮全部为 ◐ 的原因见上「证据边界」——不是代码没写，是真壳证据没取。

| 验收点 | 状态 | 实现与证据 / 缺口 |
|---|---|---|
| A01 独立树、原生会话、单页四区+定位导航（无灯） | ◐ | `AcceptanceSections.tsx` 页头三行 + 四区导航（滚动高亮、点击定位、空板态不渲染）；界面无灯，`workflow.stage` 不渲染。真壳未复验滚动高亮与空板态 |
| A02 固定计划修订、目标只读、空板硬门禁 | ◐ | `use-acceptance-gate.ts` 硬门禁 + `AcceptanceEmptyBoard.tsx` 常驻门禁状态行（核对中/已合入/阻断原因/未找到计划）；草案预验收通道已退役，协议层拒绝 `kind=draft` 的 planRef。真壳未复验阻断态 |
| A03 出包真实读数、部署注入、演示环境两形态读回 | ◐ | `AcceptancePackage.tsx` 出包读数沿用既有链（按钮本轮统一 `BoardActionButton`）；部署改经共用发送弹窗注入；`demoEnv` 两形态已接（web 显示系统名 `label`、缺省回退 URL 可点打开，桌面应用显示「已启动 · detail」不伪造链接）。**两形态都未在真壳用真实项目验过**，注入通道修复后也未验 |
| A04 验收证据报告一份/版本、登记、可打开 | ◐ | 模板正本在技能资产；报告经 `latestVerificationArtifact` 读回、登记复用 `verification` 制品类型；未生成时入口禁用；入口只在「验收准备」行（目标行报告入口 2026-10-23 UI 对齐轮删除）。真壳未验内置浏览器打开 |
| A05 行尾达成/不达成、模型通道拒写、重启读回一致 | ◐ | `AcceptanceGoalRow.tsx` 行尾互斥两动作、再点取消回未标、未标空白；结论落 `results[].decision`，`acceptance-human-guard.ts` 拒模型改写。**重启读回一致性未在真壳核对（铁律一）** |
| A06 纪要先编辑后改、人工确认可撤销、已确认冻结 | ◐ | `AcceptanceMinutesSection.tsx` 卡片常驻（无纪要节时用 `EMPTY_MINUTES` 兜底，人能直接起步不依赖模型）、点「编辑纪要」才进编辑态、确认可撤销、已确认整节冻结。真壳未验 |
| A07 归档引用+状态+原生 PR 页+注入式发起归档 | ◐ | `AcceptanceArchiveCard.tsx` 引用 + provider 真实状态（读不到显示「状态未知」）+ 原生 PR 页入口 + 注入式「发起归档」；无直接执行归档按钮。真壳未验 |
| A08 发布只有一个注入按钮、无预检弹窗、材料不存发布记录 | ◐ | 发布区仅一个「发布」按钮注入请求；板面无预检弹窗、无发布读回行；`version-workflow.ts` 无 release 字段。注入通道本轮才接通，真壳未验 |
| A09 Issue 只核对不拆解、无风险标记、板面无指标区 | ◐ | `AcceptanceGoalTasks.tsx` 只核对；已关闭不计遗留、备注只读；风险标记与指标区已退役。真壳未验 |
| A10 「更新代码」唯一同步入口、恢复不丢人工输入 | ◐ | 同步入口在页头；`use-acceptance-draft.ts` 草稿恢复；CAS 冲突本轮改字段归属静默合并（`acceptance-merge.ts`，人字段保本地/模型字段取远端，一行提示），裸 JSON 对照退役，仅基线缺失（脏草稿恢复后再冲突）退回两按钮人工处置。**重启/切树/脏树三种恢复与冲突合并未在真壳验；merge 纯函数欠单测看护** |
| A11 无个人自验工作面、无验收件清单 UI | ◐ | 屏上无逐条验收件核对工作面，准备产物只以报告与登记形态存在 |
| A12 自动化真实到点、不自动确认完成 | ◐ | 复用已登记自动化（`version-cycle/cycle-prompt.ts`）；**真实到点触发未在本轮运行** |
| A13 旧格式材料宽容读回、固定提交历史链路仍可用 | ◐ | `acceptance-legacy.ts` + `AcceptanceLegacyRecords.tsx` 末尾只读折叠区；退役字段留作 schema 只读可选字段；模型通道改写被拒；按固定提交的历史链路保留（计划屏上版回顾依赖）。负责人上一轮报的「旧版本数据显示不出来」已修两处根因，**修复后未复验**；注意 sessionStorage 里可能还留着旧的失败草稿，复验时用冲突提示切回宿主材料 |

| 旅程 | 状态 | 覆盖与留白 |
|---|---|---|
| AJ01 准备→Showcase→纪要→归档与发布 | ○ | 未注册、未运行。需真实服务、真实报告、真实发布读回与杀进程重启核对；模拟不计通过 |
| 跨周旅程（原 AJ02） | — | 不适用：跨周按轮次刷新场景已于 2026-10-22 退役，同次恢复与脏树恢复并入 AJ01 与 A10 |

## 连带义务处置

spec「退役清单」与 design 列出的连带改动，本分支已同批处理，未留缺口：

- **计划屏上版回顾**：`use-prior-carryovers.ts:110-129` 的「会议遗留」已改读验收纪要 `followups`；读不到纪要节（v10 前的材料）时回退到已确认且标为「纳入下周计划」的旧指导条目，旧版本两行回显不因退役变空。#407 另给它加了延期遗留三态与实时读回，与本改动不冲突。
- **总览版本纪要派生**：`overview-version-minutes.tsx` 已停止读目标级交付件，改读版本级演示环境与报告登记。
- **顶层正本**：`docs/architecture.md`、`docs/05-features/README.md`、`docs/06-module/` 两篇中把验收屏旅程灯与首行协作卡片写成现行能力的表述，随本轮文档同步改正（见对应文件）。

## 验证纪律

界面与行为改动的交付须附验证报告，本次改动新增或修改的判据内嵌真壳截图四件套（用例名、执行路径、期望结果、截图），截图推永不合入的 `shots/<分支名>` 并钉 SHA。v10 不沿用 v9.5 那轮「不运行 CI 和真壳」的豁免口径——计划屏 G3 生产实现（#399）已按真壳 + 钉 SHA 截图交付，验收屏按同口径执行。**本分支目前欠这份真壳证据**，合入前后需补 A03 演示环境两形态、A05/A10 重启读回、A06 纪要冻结与注入通道四组。叠层单测受执行例数 ratchet 约束，新增须同一交付内对冲删除退役用例。2026-10-23 对齐轮为 bug 修复轮，负责人另行明确授权免本地门禁与真机验证（见「验收对齐轮」节），真壳欠账不因此销账。
