# 版本验收 — 六环状态

> 给接手开发、评审和验收的人读取。只记录认可、实现和证据缺口；有真实认可或运行结果时更新。价值见 [intent](intent.md)，行为见 [spec](spec.md)，工程设计见 [design](design.md)。

目标平台为主干 main（原 bw-orca，2026-09-30 扶正）的 Electron/Orca 叠层。2026-09-24 用户合入 [设计 PR #264](https://github.com/forcegravity1989/builder-workbench/pull/264)，基线为 ba3955e6a9fa0dbf144096f5cb0609f2a89f39cb，并明确授权开工；产品方向与 v8 高保真作为实施输入，详细设计未逐项细审，未决项必须由实施窗口直接请用户确认。

本轮验证安排：用户授权各特性窗口先做少量基础 E2E，可合并场景覆盖多个验收点；完整验收点与用户旅程由用户后续协调助手 Agent。窗口须交接已测/未测、运行入口与候选提交；基础验证不代表后两环已齐。

当前会话边界按用户确认改为完整原生工作区复用，原型同步表达复用范围和紧凑数据问题提示。CycleChat、专用历史嵌入、sessionStorage 会话绑定及迁移弹窗已移除；新建计划/验收走现有自动化，数据问题当时经独立新建会话自动递交（该通道后由 #279 的 oneShotPrompt 单次递交替代；2026-09-30 返工批曾试行新会话草稿递交，经用户核对属无依据变更，已恢复 runNow），归档把未发送请求贴进左半屏当前显示的终端会话。右侧业务板其余样式/布局仍待逐项对照原型。上述为此前 [PR #275](https://github.com/forcegravity1989/builder-workbench/pull/275) 的会话复用实施，验证范围与资源限制见该 PR；历史烟测及类型检查不能作为本轮新入口通过的证据。

用户已确认本轮验收高保真并要求提交特性资产：移除独立“交付准备”卡片及固定材料占位，材料在原生会话中准备、在目标卡核对；“预览纪要”在目标区标题旁。与计划屏一起将“新建验收”移到右板首行协作卡片，与“配置自动化”并列（2026-09-30 返工批：「配置自动化」移至右板页头分支名旁，卡片只留启动入口）；分支名在页头，异常文件经同一启动入口带入。该布局已在 PR #279 实施：AcceptancePreparation/AcceptanceContext 退役，来源、候选与共享指标窗口收进紧凑 AcceptanceSources 行（保留按需“检查文件与候选”与打开材料入口）；准备灯改由已记录交付证据推导，“材料备齐”勾选与 preparationReview 写入路径移除（schema 字段保留兼容旧材料并仍受人工守卫）；页头“验收报告”按钮改为标题旁“预览纪要”弹窗；归档请求由旅程轴归档节点贴进左半屏当前终端会话，不自动发送，页脚保留显式保存/重读/刷新归档。真壳未运行，不能视为真壳验证通过。

2026-09-30 PR #283 返工批（用户在返工会话逐项拍板）：①验收读取与计划屏对称，改为读自己固定分支——可选版本即验收分支 HEAD 上 `.bw/planning` 已提交目录（worktreeHead + ls-tree/show，只读白名单扩展），不再从采用基线 commit 直读；②进屏先经 workbench.cycle.syncTrunk 把采用分支最新拉进验收分支，失败/冲突如实提示、不阻断、不换数据源，由用户在会话中带模型处理；③归档与合入状态降为提醒信号：未归档不阻塞开下一轮（唯一开轮门是当前轮未保存修改），历史读取不再要求归档证明，证明缺失的记录仍列出并由灯与待核提示如实呈现；④删除 #283 引入的「唯一候选自动选版/自动开轮」——选版与开轮全部由人点（spec「版本仍由人明确选择」不动）；⑤CodeHub 归档证据读取保持诚实空函数接缝（registeredCodeHubArchiveReason），待专项接 codehub-cli，记债。自动化登记恢复与覆盖同步、按钮移页头见[版本计划 STATUS](../version-planning/STATUS.md) 同批记录。

指标规则已随 [PR #278](https://github.com/forcegravity1989/builder-workbench/pull/278) 合入并同步本树：只接历史脚本，采用当前目录采集并保留原计划承诺，由人说明可比性。两个指标组件、指标样式及 AcceptanceBoard 两处显示条件沿用已合入实现；本线仅处理资产冲突，不重写生产指标能力。后续验收布局须保留这些接线，指标既有证据见总览指标 STATUS，本轮真壳未验。

2026-10-13 Issue #333 收敛批（与计划屏同批，机制细节见[版本计划 STATUS](../version-planning/STATUS.md) 同轮记录）：旅程灯改为只读材料 `workflow.stage`（准备交付 preparation / 展示验收 showcase / 归档 archive，模型写入，灰/绿两态）；准备灯的证据完备性推导、archiveSignal/decisionSignal/preparationSignal（acceptance-journey.ts）与「检查文件与候选」在线探测（acceptance-candidate-port）整体删除，来源行只呈现记录事实与纯声明比对（artifactCandidateCheck）；人工结论 decision 及证据新鲜度机制保留不变（仅 UI 可写）。归档按钮与「交给会话」未达跟进按钮删除（贴草稿通道整体退役），归档卡片改只读状态行，按 `workflow.archivePr` 薄读取 PR 合入状态（useArchivePrStatus，读不到保持未知）。预览纪要报告的核对行相应精简（保留固定计划核验与结论新鲜度，去掉在线文件/执行探测行）。证据与未验项同计划屏该轮记录：workbench 套件 229 例绿、typecheck 0 错；真壳与真实模型旅程待用户实机验证。

2026-10-13 真壳验证反馈批（同日第二批，与计划屏同批，机制详见[版本计划 STATUS](../version-planning/STATUS.md) 同轮记录）：验收纪要（deriveAcceptanceReport）与总览验收摘要改为人话正文——周期/修订/固定来源/候选提交/定义指纹/采集元数据等技术标识移出纪要，只保留目标结论（含证据变化待核标记）、约定与实际交付、指标实测与目标、Issue 快照（仓库#编号形式）、未达与后续；A08 判据同步修订。存量 v0.5 验收材料补写 workflow.stage=archive 与 archivePr=#326（ancestry-path 查证）。纪要相关测试断言随新格式更新（例数不变）。证据同计划屏该轮：229 例全绿、typecheck 0 错；真壳复验待用户执行。

2026-10-14 Issue #355 同步统一批（与计划屏同批，机制与证据详见[版本计划 STATUS](../version-planning/STATUS.md) 同轮记录）：进屏自动同步废止，验收屏进屏零 Git 动作；页头按钮改「更新代码」，成为唯一同步入口（快进 bw/week-acceptance 树到主干最新，快进不了保持原样、统一提示交会话处理，材料仍照常重读）。纯草稿状态（树有未合入提交、主干没前进）不是异常、不提示。

2026-10-15 出包区块批（PR #360，用户会话内逐项拍板：两行四列包信息、GitHub 变体走 gh 不用 playwright、按远端 URL 自动分派、功能分支 MR 验证流程）：旅程轴插入「出包」节点——灯随出包区块读到的最新制品包点亮，不写 stage（stage 仍只有 preparation/showcase/archive 三值）；出包区块一条协议两个宿主，CodeHub 远端走 CloudDragon 常驻 Playwright 会话，GitHub 远端走本机 gh CLI（识别规则：文件名 `bw-package` 前缀的 Actions workflow；本仓实例 `.github/workflows/bw-package.yml`，构建步带 `ORCA_WIN_ADHOC=1` 避免未签名包烙 SignPath publisherName）；验收 SOP（standard/skills/version-acceptance）升 0.5.0 补出包步骤，stub 投影与 manifest 同步再生。证据：门禁全过（typecheck node/web/cli、oxlint、anti-slop、code-quality、各 ratchet、rpc-params-catalog）；esbuild 探针对真仓 10/10（列表/最新包/安装包过滤/远端分派/owner-repo 解析）；CloudDragon 选择器与启动/下载链路经真实页面验证。GitHub 变体端到端（workflow 实跑、真壳验收）待 MR 合入后验证。

2026-10-15 合入后验证批（PR #360 merge 78e4f61ef 后，修复走 fix/bw-package-playwright-core）：bw-package.yml 在 main 首次实跑（run 38737782455）于 afterPack 守卫 verifyPackagedMainRuntimeDeps 失败——主进程 CloudDragon 会话动态导入的 playwright-core 未登记 PACKAGED_RUNTIME_PACKAGE_ROOTS，打包产物缺 resources/node_modules 复制；PR 门禁不跑 Windows 打包，故只有 workflow 实跑暴露。修复为白名单补 playwright-core（会话用 channel:'chrome' 启动系统 Chrome，无浏览器随包），分支上 run 38738954723 全绿并发布 prerelease v1.4.197-local.1792069349.69244738e038（按设计仅附 orca-windows-setup.exe）。真壳（dev 壳 CDP DOM 断言，不读截图）GitHub 变体：流水线下拉唯一列 BW Package Windows（与 API 过滤一致）、最新包四字段为真实读数且 60 秒自动刷新读到新发布、更新器元数据被排除只显示安装包本体、出包灯随真实包点亮、「出包」点击对无 workflow 的远端分支如实呈现 gh 诊断（HTTP 422）且 busy 清理、读数不受影响。留白：180MB 安装包传输在本机对 release-assets CDN 三次尝试均网络层失败（EOF/TLS 超时/挂起），下载命令与资产解析已验、完整传输待人网络复核；受理→新包出现的界面完整闭环待修复合入 main 后在更新过的验收树上补验。

2026-10-16 执行面 CLI 替换批（用户会话拍板：CodeHub 变体 list/launch 从 Playwright 页面链路改走本机 cloudbuild CLI，制品面 latest/download 保留浏览器会话）：研究结论为 CLI（cb，CloudDragon 1.0 API 官方客户端）覆盖执行面（list/scheme list/scheme execute）但无制品仓库能力（pipeline 1.0 无制品读取/下载命令，outputs 仅在 pipeline2 另一产品），故部分替代。实施：新增 cloud-dragon-cli-ops（list = `cb pipeline list -o json` 按名取列表；launch = 名→ID 映射 + `scheme list` 找 pr_pipeline 方案 + `scheme execute --ids <方案ID> --yes`，语义与页面「执行方案启动→pr_pipeline」一致；--group 为 CLI 根级全局 flag，统一注入项目 ID——scheme 子命令无自己的 --group，不带即报 no group_id set；未装 cb / 未登录 / 命令失败分别映射 cb-missing/cb-auth/cb-failed 可读错误），cloud-dragon-package-ops 收缩为纯制品面（页面版 list/launch 机制、范围切换与 LIST_URL 整体退役），runtime 分派不变、界面协议无感知。cb 凭证自管（cb login，~/.cloudbuild/），与 gh 对称；项目 ID 在 CLI 语义下即 group_id（URL /project/<id>/ 段），--group 与页面「当前项目下的流水线」同范围。证据：typecheck 三套 0 错、oxlint/anti-slop/code-quality/各 ratchet 过；登录后 esbuild 探针经产品代码全链实测——list 读出 7 条流水线（与裸 CLI 一致）、gtsllm-dfx 的 pr_pipeline 方案存在（唯一方案，id 1319f0eb…）、launch 真实受理（用户授权一次实跑：status completed→running、latest_jobid 9014bef6…→b0ada8b9…、startTime 更新为当下）；未登录路径先期验证如实映射 cb-auth。留白：cb-missing 分支未实测（本机已装）；制品面 Playwright 链路未动、沿用既有验证。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| intent | ● 已确认 | 沿用三特性边界，用户确认会话准备材料、逐目标核对及本轮资产同步 |
| spec | ● 实施输入 | 本轮高保真已获用户确认；新入口与验收布局已按该高保真实施（组件/契约测试为上限，真壳未验），新增或拿不准的行为仍需确认 |
| 实现设计 | ◐ 部分 | 设计主体已按当前接线落地，取舍差异回写 design；详细设计仍未逐项细审，未决项必须人工确认 |
| TDD | ◐ 部分 | 以下为 PR #272 前历史证据，不含当前会话复用接线：单测/组件测试全绿（渲染端大套件 388 文件 3477 项，main/workbench + relay 38 文件 203 项；三套 tsc 0 错）。验收业务覆盖目标证据、同源码换候选包、候选来源边界、Issue 快照报告及交互、切版本保留新输入、报告保留真实计划读取时间、计划来源失败与三阶段分别推导信号、指标日期边界及读回证据优先于旧缓存；归档判定覆盖脏草稿不绕过已确认归档、provider 合入提交树内字节核对（FF/rebase 多提交不漏记）。候选 RPC 为替身，页面交互为 DOM 环境，不能代表真实宿主、provider 或 Electron 旅程。本轮（#279）新增证据：workbench 套件 43 文件 220 项绿（协作卡片单次启动与坏文件上下文、one-shot 转发/门控/派发载荷、准备灯证据推导、陈旧候选核对不传播改造后通过）；tsc 因本机内存限制未能运行，缺口如实记入 PR。2026-09-30 返工批证据：开轮门控纯函数 3 例、历史服务自有分支读取/归档信号化（真实 Git 仓）、只读白名单扩展边界用例全绿；当时开轮门控用例已随开轮入口退役删除；tsc 仍因本机内存未能运行，如实记录 |
| 验收点 E2E | ◐ 部分 | 真壳 Playwright 烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 含验收树创建与总览读回，已编写，执行结果见 PR；A01–A10 完整验收点尚未逐项运行 |
| 用户旅程 E2E | ○ 缺 | AJ01/AJ02 已定义；真实出包/验证、模型会话、provider 归档全链、自动化到点与重启核对未运行 |

[第八版交互原型](prototype.html) 是本特性的独立入口；来源与离线使用见[版本计划规格](../version-planning/spec.md)，完整历史附件保留在[原始评审包](https://github.com/forcegravity1989/builder-workbench/archive/f20f04ae57d510178c710c71216b9b734082c28e.zip)。原型与包内浏览器检查只证明交互演示，未接远端写回/真实采集/自动化，不表示能力已交付。执行步骤与并行分工位于本任务仓外 plans，不在仓内新增 plan.md。

验收进入固定 bw/week-acceptance 后先回显原生工作区；进屏不做任何 Git 动作，页头「更新代码」是唯一同步入口（执行期间提示并暂停写入，无论快进成败都重读材料，失败保留通知）。与计划共用自动保存、任务 UI 和归档状态行（原可取消的请求等待已随贴草稿通道于 2026-10-13 收敛批退役）。顶部选版一次，已有验收回显，无验收时基于该版当前计划初始化草稿；不再提供第二次选版或开轮按钮。旅程灯只读材料 workflow.stage（模型写入，灰/绿两态；「出包」灯例外，随出包区块真实包数据点亮）；归档 PR 合入状态按 archivePr 薄读取显示，归档后继续编辑同一份材料。CodeHub 读不回 PR 状态时保持未知。指标及交付区域仅按原承诺或已有证据显示，刷新指标读回并保存实际值；Issue 共用计划样式，仍保留验收快照。相关静态与存量测试证据见各轮 PR，真壳体验交用户在新包回验。

未验证项如实保留：真壳烟测 `tests/e2e/workbench-cycle-smoke.spec.ts` 已编写（含验收树与总览读回），执行结果见 PR；出包区块 GitHub 变体的安装包完整传输（本机对 release-assets CDN 不可达，待人网络复核）与界面受理→新包出现的完整闭环（待打包白名单修复合入 main 后在更新过的验收树上补验）、项目自有真实出包/验证入口、CodeHub Issue 正文编辑及返回验收版本、SSH/WSL 与配对宿主、真实到点自动化、真实 provider 归档全链均未运行。仓外组件示例不计为 E2E，完整旅程后续统一调度。

2026-09-25 已完成实际组件的仓外示例数据视觉核对：按 v8 对齐紧凑目标卡，在约 920px 右栏宽度下展示三项目标与 Issue 汇总。该检查没有连接 Electron、原生会话、采集脚本或真实 provider，不能计为验收点 E2E。完整旅程与真实到点触发仍按本轮分工留待后续协调验证。

没有产品 TDD、真壳 E2E、独立验证 Review 或使用效果证据时，保持缺口；不预填齐全、通过或改善比例。

原始 v8 设计曾经过独立 subagent 初审与复审；[历史设计评审记录](https://github.com/forcegravity1989/builder-workbench/blob/f20f04ae57d510178c710c71216b9b734082c28e/verification/design-review.md)。该固定提交记录不覆盖本轮资产；本轮验证见本次 PR，不替代实施后的独立代码/行为 Review 或真实旅程。

## 验收点与旅程矩阵

> 本节是上方六环表环 5/环 6 的逐点明细，不替代六环表。口径：✅ = 已实现且有自动化/真壳证据（单测/组件测试/真壳 Playwright 烟测）；◐ = 主行为已实现，关键路径待真人体验或需远端环境（SSH/真实 PR/真实 provider）；○ = 未实现（如实标注，不冒充）。本表自仓外过程稿 feature-matrix-20260926.md 并入仓内落为正文明细，此后改动随引发它的 PR 同批提交，不记流水；特性级总览见 [../README.md](../README.md)。

| 验收点 | 状态 | 实现落点 | 证据 / 缺口 |
|---|---|---|---|
| A01 独立树、完整原生工作区、单页三阶段 | ◐ | CycleWorkspaceProvider + AcceptanceBoard（图标旅程轴 + 首行协作卡片 + 页头分支） | 组件测试通过；三阶段信息密度和侧栏开合待真壳伴飞 |
| A02 固定计划修订正确、承诺只读；跨树/草案不混淆 | ◐ | planRef 固定 + readPlan（固定提交字节现读，版本目录来自验收分支 HEAD）+ useFixedAcceptancePlan | version-history-service（真实 Git 仓）/acceptance-version-choices 单测；交互测试已按环 4 裁剪，UI 行为交验收点 E2E 与真壳 |
| A03 真实入口准备交付；材料可打开绑候选；失败可见不假报 | ◐ | AcceptanceSources 紧凑来源行（记录事实+纯声明比对 artifactCandidateCheck；在线探测与「检查文件与候选」按钮已于 2026-10-13 退役）+ 目标卡交付件 | 独立准备卡与备齐勾选已退役；旅程灯只读 workflow.stage；真实项目交付准备旅程未验 |
| A04 按承诺或已存证据显示指标，旧计划基线保留 | ◐ | 已接入最新目录与历史采集；仅对承诺或已有证据显示采集行，旧 ref 不阻断新采集 | 本轮定向测试及浏览器组件检查通过；真实 Electron 与完整旅程边界见[总览指标 STATUS](../overview-metrics/STATUS.md) |
| A05 Issue 真实状态可刷新、无拆解入口、关闭数≠达成 | ✅ | CycleTasks 共用列表与验收快照+灯色守卫 | board-state/acceptance 测试 |
| A06 原生详情编辑后按来源返回、保留版本/会话/草稿 | ◐ | returnToPreviousView+view-memory 与原生工作区恢复 | 导航测试；真实 CodeHub/GitHub 往返待人 |
| A07 同一候选展示、人逐目标判断、未达可保存带入会话 | ✅ | AcceptanceGoalResult decision 流（「交给会话」按钮已随贴草稿通道于 2026-10-13 退役，后续安排在卡内文本框记录、会话中讨论）；材料 RPC save 通过 material-human-guard 拦截 CLI 对人工结论字段与计划 summary.risks 的新增、修改与删除 | material-human-guard 测试（acceptance-interaction 已随环 4 裁剪，UI 交互交验收点 E2E 与真壳）；真实模型会话与人工核对旅程待验 |
| A08 纪要可复制含结论/交付/指标/未达人话正文；归档后总览回看 | ◐ | deriveAcceptanceReport（技术标识已剔除）+ 标题旁“预览纪要”弹窗（AcceptanceReportDialog）+ 总览双栏 | report 测试；真实归档回看待人 |
| A09 跨树隔离/并发/重启/脏树不丢输入；包证不符不沿完成态 | ◐ | draft recovery + decision 证据新鲜度（decisionFreshness，证据变化旧结论标待重新核对）；在线候选探测已退役，仅剩纯声明比对 | 恢复测试；脏树真机待人；脏树/未归档提交检查为提示级（会话承担），无代码落点 |
| A10 原生自动化真实到点、新周期新会话、入口不重复 | ◐ | 默认关闭态注册（creationKey 去重、reuseSession=false、BW 提示覆盖同步、用户设置保留） | 新建验收的手动运行、原生恢复和真实到点均待真壳验证 |
| A11 出包区块按远端对接流水线、真实读数、可下载、如实报错 | ◐ | AcceptancePackage + package-pipeline-runtime（执行面 CodeHub→cb CLI/GitHub→gh，制品面 CodeHub→CloudDragon 会话，按远端分派）+ AcceptanceJourney 出包灯 | 门禁与真仓探针全过；GitHub 变体 workflow 实跑通过（run 38738954723 全绿发 prerelease），真壳读路径/自动刷新/如实报错已验；CodeHub 执行面已改走 cb CLI 并经产品代码全链实测（list 7 条、pr_pipeline 方案存在、launch 真实受理 status→running），制品面页面链路沿用既有验证；安装包完整传输受本机网络限制留白 |

| 旅程 | 状态 | 覆盖 |
|---|---|---|
| 验收旅程（准备交付→showcase→核对→归档→回看，AJ01/AJ02） | ◐ | 组件级全链测试；真人+真实 PR 待人 |
