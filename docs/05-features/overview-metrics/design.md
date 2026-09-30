# 总览指标实现设计

> 给实现与技术评审者读取；本文管指标数据流、采集与边界，不写分步排期。行为见 [spec](spec.md)，共享消费方见 [计划设计](../version-planning/design.md#共享边界)。取舍变化时更新，落地后同步关键信息维护模块。
>
> 状态：历史采集、最新目录及配置会话规则已接入总览和指标服务。架构定位：architecture §1 项目概况与版本判断，§2 ①事实、⑤壳。实现与未验证项见 STATUS。

## 迁入什么

项目连接、宿主路由、文件与命令执行沿用 Orca 原生能力；BW 不按本机、Web/配对或 SSH/WSL 另设产品限制。操作在工作树所属宿主执行，连接或权限不可用时呈现原生失败，不切换到其他机器读写。

参考旧 main（现 `archive/main-pre-orca`）的 crates/app-shell/src/screens/overview/metrics.rs、crates/bw/src/repo/metrics_file.rs 与 .bw 指标资产：BizMetrics 的定义解析、feature/leads 页签及引领/滞后图表，SdlcMetrics 的提交/合入 PR/开放 Issue 图表，以及两者的日/周、刷新、历史与错误语义。保留协议、测试向量和有效业务资产，重写 Electron 适配；不迁 Rust crate 或旧 bridge。

BW 自用的 managed-projects.py、其名单和远端读取依赖要逐项核对；monday-screen 口径目前依赖旧 data.json/confirmation 历史，必须在新版本材料落地时更新采集解析并保持历史定义可解释。不能复制脚本后宣称新周一屏已有使用指标。旧 codehub-closed-issues.py 也须核对实际 provider，不能因文件名就假定适用 GitHub。

## 责任与接口

| 层                            | 责任                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| shared/workbench metrics 契约 | MetricDefinition、MetricRef、MetricReading、窗口/错误模型与可比较性                        |
| BW 主进程指标服务             | 可信项目定位、业务定义/脚本读取与执行、任务去重、输出校验、证据/缓存 |
| renderer/workbench           | 业务指标消费 MetricsPort；项目统计编排原生 Git/provider 读取、分页、窗口落桶与请求隔离；两区共用图表呈现 |
| 计划 / 验收                   | 保存选定 metricRef 和版本目标 / 引用真实 readingRef；不另跑脚本、不保存一份手填实际数      |
| Orca                          | 项目/宿主身份、权限与通用进程/文件基础设施；不装 BW 指标业务                               |

复用 MetricsPort.list(project)、read(ref,window)、refresh(ref,window)；刷新返回可追溯 run/状态，读取返回 value 或 Unknown 及原因，不能仅用 null 吞掉失败。MetricRef 包含项目、指标名称与定义指纹，名称不唯一须先消歧；leads 是声明关系，不自动证明因果。

VersionHistoryPort.list 返回 records 与 problems：前者为可读取的固定提交记录，后者保留旧格式、损坏或不可读材料的版本、提交、流程、时间和原因。单条坏记录不抹去其他有效历史；无法验证的 cycleId 不补造。read 按明确版本、周期、流程与提交读取；readPlan 按已保存的计划引用核对内容修订，并区分已合入来源与明确选择的工作树草案，不回退到最新材料。接口位于 shared/workbench/version-history.ts，renderer 原生 RPC 客户端保持相同返回形状。

总览按版本及材料轮次选择记录。已有验收经 planRef/readPlan 获取其对应计划，不能分别取各 workflow 的最新归档再并排；在研版本的更新计划如无对应验收，明确保留验收空态。界面区分加载、无记录、读取失败和已加载内容，切换时旧轮次内容不能冒充新选择。纪要读取只消费现有材料与摘要，不改写计划/验收材料、流程选版或共用工作区壳。轮次用真实 cycleId 标识；原型中的 W36/W37/W39 是既有快照标签，不作为运行时固定周规则。

历史目录从项目指定基线 Git 历史发现材料候选，内容修订按原始字节计算；可达关系、第一父链或合并方式均不单独证明归档。宿主以原生归档/provider 来源核验该提交和材料修订：已采用才进入正式记录，已证明的工作中草稿不列为归档，无法证明则进入待核 problems。非法版本目录也保留已知路径与提交问题，不放宽材料输入校验。固定 committed 引用读取执行相同核验；同版本多周期分别保留。读取服务接受明确的基线与原生宿主适配，不在核心层猜测默认分支。

## 采集、存储与窗口

沿 metrics schema2，不顺带升级全项目协议。MetricDefinition 保留 name/def/target/collect/feature/leads。MetricReading 带 value、window、granularity、collectedAt、source、definitionHash、collectorRevision/执行指纹；版本材料引用读数的稳定标识/快照，证据缓存可以重建，不引入 BW 业务数据库。

项目时区与版本约定明确解析为左闭右开窗口；同一 ref+定义指纹+执行指纹+数据目标+窗口+宿主的刷新合并执行，不让过期请求覆盖后发结果。主进程用 argv 执行已登记采集，不经 shell 拼接；默认超时遵循协议，输出只接收一个合法 JSON，标准错误用于诊断，不当读数。

能力注册为 main RPC（workbench.metrics.list/read/refresh、workbench.history.list/read/readPlan、workbench.archive.proof）；SSH 宿主经窄执行器 workbench.metrics.execute / workbench.history.execute 运行采集与历史命令，不扩 provider.exec 白名单。定义唯一正源为 .bw/metrics.toml；目录从项目实际配置来源解析最新已合入提交。单次采集固定该提交的定义、脚本及相关依赖，在隔离 checkout 内执行（preparation lock，finally 清理），BW_METRICS_TIMEZONE / BW_METRICS_DATA_ROOT / BW_METRICS_DATA_COMMIT 显式传递。默认窗口「本周截至采集时刻」保留脚本返回的真实 coverage；历史纪要读取当时保存的 baseline，不被新采集覆盖。

业务定义只接受 script + retro=true，脚本按日/周输出历史 points；仅当前 value 输出不再支持，缺点留缺。源数据与历史存储归用户项目或外部服务所有，BW 不登记每日自动化、bw/ledger 或 readings 日写回。既有历史证据仍按原字段读取，不自动改写或删除。读数可短期缓存；计划/验收保存采用的证据，不积累独立时序台账。缓存按项目、定义/执行指纹与窗口区分，不能当事实正本。

定义变更让旧读数保持历史身份；跨定义不可自动比较。刷新失败时返回错误与旧记录的时间，不给旧记录换新时间。计算改善幅度前检查数值/单位/口径；字符串只展示，不把非数字硬转 0。

新采集按指标名称解析最新已合入目录，执行根须符合本次解析的脚本/依赖修订；固定树落后或未提交脚本不能代用。同步目录只更新明确的配置来源，不合并、重置或覆写计划/验收草稿树。旧 baseline 的 configurationCommit/definitionHash 用于解释历史，不能作为新采集前置锁。证据详情显示 source、collectedAt、configurationCommit 与 collectorRevision，definitionHash 保存在材料中，不作为独立详情项；未提供专门的定义/单位变化比较或确认界面，由人据来源核对可比性，不自动计算跨口径改善。针对性验证覆盖仅脚本更新、验收树落后、草稿试采隔离及旧证据保留。

## 项目研发指标

参考旧 main（现 `archive/main-pre-orca`）的 trend.rs 与 vm_derive::collect_repo_stats：默认最近五周／十四天；调用 Orca 现有项目定位、Git 与 provider 读取能力，不另写 GitHub 登录或 PR/Issue 抓取栈。renderer 的 overview-sdlc-readings 编排原生读取与分页，use-overview-sdlc 管理刷新及过期请求隔离，overview-sdlc 按共享窗口函数落桶并保留各来源的失败状态；原生主进程/runtime 负责执行与宿主路由。这些内建统计不经过业务 MetricsPort，也不伪装为 metrics.toml 业务定义。

提交计数明确所选工作树/分支和完整窗口，PR 合入按远端 mergedAt，开放 Issue 为时点存量。旧 main 口径与代码需要逐项核对，尤其重开事件、分页上限和本期非完整窗口；有完整事件历史才重建，只有当前快照就只返回该点。Git 成功不替代远端成功。项目 stats 保留来源与时刻，不能把切日/周后的旧数字重标为新窗口。

Electron 的 GitHub PR 列表／详情与 CodeHub MR 映射现已透传 mergedAt，总览沿现有 provider、宿主路由和权限通道读取，不另建登录或抓取栈。GitHub 使用合入时间搜索并分页，按源返回错误；本地日边界与 UTC 搜索边界不同，查询扩一天后再按项目时区落桶。CodeHub 沿既有 listTasks 的 limit 逐步读全，不能将 updatedAt 当作合入时间。PR 与 Issue 显示实际解析的仓库来源。

原生 git.history 保留每页 200 条，增加 since、skip、固定 revision；解析保留作者 timestamp，同时透传 committedAt（%ct）。总览固定主工作树 HEAD，使用 --since-as-filter 完整遍历窗口，避免拓扑顺序中的旧时间戳提前截断；每页读取沿 IPC / runtime RPC / relay 路由。项目统计请求有代次守卫，过期分页不写回新项目或新窗口。Git 窗口与 CodeHub 达到 10,000 条、GitHub 查询达到 1,000 条时显示数据不完整，不补零。GitHub 列表在分页期间可能变化；按身份去重、核对来源一致，当前快照不承诺远端事务隔离。

旧 main 的 Issue 历史按 createdAt/closedAt 相减，没有重开事件，不能直接当作精确存量算法。开放 Issue 保留折线容器，只按真实 readAt 绘当前点；补完整历史需核对事件和分页。权限、限流、缺时间和不完整数据仅影响对应系列。


## 配置任务与采用

“配置指标”每次经 metrics-setup 管线新建原生会话并进入该会话，使用独立固定维护分支 **bw/metrics-refresh**（树名 metrics-refresh），由 cycle-prompt 的 workflow='metrics-refresh' 注入 SYSTEM 与指标 Skill。工作树定位、创建、目录、登记和宿主路由复用 Orca；不硬编码物理目录或项目主分支，不删除重建已有树，不因新会话重置未完成改动，不按标题续接会话。指标模块提供当前定义/错误；项目约定与完整指南按原生发现 Stub/guide 读取，普通项目不依赖自身拥有 standard/。返回总览按项目与宿主恢复版本、轮次及指标筛选。入口不添加 BW 配置页、周流程或指标自动化。

配置任务形成定义和脚本的可评审改动，通过项目 PR 流程合入。总览及版本流程同步最新已合入来源；新采集固定本次来源，不锁在旧计划配置提交。未合入草稿只在配置上下文预览和试采，不自动成为正式目录。刷新直接调用 MetricsPort，不启动模型。

## 三屏呈现与迁移

总览负责定义与源数据，计划编辑目标，验收保留原目标只读并允许选择最新目录指标补充实测，复用同一指标契约和 selector。新读数保存自身配置/执行来源，不覆盖计划 baseline；旧指标被删除或口径变化不阻止选择新指标，目录与采集错误独立呈现，证据来源供人核对。项目名片与北极星沿用既有高保真双卡结构，只引用样式与字段组织，不修改 hifi。总览保留业务／项目分区；业务使用特性 tabs、同组滞后/引领与系列显隐，单行可滚动图例配合同日期 tooltip，定义与长期目标按需打开。图例溢出控件、键盘焦点与有界 tooltip 不得增加页面横向溢出。总览筛选保存在按项目／宿主区分的会话视图偏好中，只保存版本、轮次、特性、显隐和粒度，不保存业务读数。项目三组折线图并排；业务和项目两区分别切日/周与刷新。业务刷新覆盖北极星，北极星不重复挂按钮；“配置指标”配 MessageSquarePlus 图标，和刷新均使用现有次按钮。版本全文与来源直接在等高左右栏内回看，Markdown 正文独立滚动，以版本和轮次重置滚动位置，不改工作区导航。以现有前端图表能力和设计系统实现；同轴必须同单位，不同单位采用明确独立刻度或对齐图。日/周切换不篡改采集精度；无真实点显示无数据。

图表实现采用 ECharts。产品按需依赖 ECharts 6；原型保留其现有静态交互实现。Electron 的 React 渲染端可直接加载 JavaScript 图表；按需打包折线、图例、提示及坐标系，使用本地资源，不依赖 CDN。沿用设计系统颜色与文字，容器变化时 resize、卸载时 dispose；业务读数与 SDLC 共用总览内的图表适配；旧产品手写 SVG 与系列行表已删除。库只负责呈现，缺测断点、来源、统计窗口和失败语义仍由 BW 数据层提供。接入与容器生命周期参考 [官方导入说明](https://echarts.apache.org/handbook/en/basics/import/)和[容器尺寸说明](https://echarts.apache.org/handbook/en/concepts/chart-size/)。

从旧 main（`archive/main-pre-orca`）定向选择有效 .bw 资产，不覆盖目标分支已有项目约定、计划、runtime 和本机路径。北极星占位不成为已注册业务指标；保留缺口。迁移后的 BW 自用数据只是首个验收项目，还要验证不含源码 standard/ 的普通项目。

## 验证与代价

TDD 覆盖窗口/时区、定义指纹、真实零与 Unknown、坏输出、去重与过期结果、历史不补值、关系消歧、项目统计的提交/合入/存量口径、Issue 重开与分页截断、重启读回。模拟执行器用于错误分支单测，真实脚本和 Electron 用于 M01–M10/MJ01/MJ02。

主要风险是采集口径随版本材料 schema 漂移、项目/宿主混用和缓存伪装当前值。契约 fixture 只用于局部验证；真实脚本、宿主路由与跨屏采用仍须独立读回，证据与未验证项见 [STATUS](STATUS.md)。
