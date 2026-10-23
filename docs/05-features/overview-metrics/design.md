# 总览指标实现设计

> 给实现与技术评审者读取；本文管指标数据流、采集与边界，不写分步排期。行为见 [spec](spec.md)，共享消费方见 [计划设计](../version-planning/design.md#共享边界)。取舍变化时更新，落地后同步关键信息维护模块。
>
> 状态：历史采集、最新目录及配置会话规则已接入总览和指标服务。架构定位：architecture §1 项目概况与版本判断，§2 ①事实、⑤壳。实现与未验证项见 STATUS。

## 迁入什么

项目连接、宿主路由、文件与命令执行沿用 Orca 原生能力；BW 不按本机、Web/配对或 SSH/WSL 另设产品限制。操作在工作树所属宿主执行，连接或权限不可用时呈现原生失败，不切换到其他机器读写。

参考旧 main（现 `archive/main-pre-orca`）的 crates/bw/src/repo/metrics_file.rs 与 .bw 指标资产：BizMetrics 的定义解析、feature/leads 关系，以及日/周、刷新、历史与错误语义。保留协议、测试向量和有效业务资产，重写 Electron 适配；不迁 Rust crate 或旧 bridge。旧 main 的业务图表与 SdlcMetrics 项目统计图已由记分牌替代，不再迁入。

BW 自用的 managed-projects.py 按已合入来源的 Git 历史统计计划活动：schema3 的非空计划创建、目标/任务/进展/轮次实质变更按提交时间归周，纯格式迁移和空计划不计；旧 data.json/confirmation 时间戳保留历史解释。这是已归档计划活动，不等同页面点击。白名单、本仓计划历史及事件账固定读取 BW_METRICS_DATA_COMMIT，脏工作区不参与。codehub-closed-issues.py 的前提「本仓远端是 codehub」不成立（BW Issue 正本在 GitHub），已删除并由 closed-issues.py（gh 采集）接替。

来源直查太慢的指标走两层架构：项目侧预采集落仓内事件账（daily-observation.jsonl），协议脚本只读已备好的源——「计划制定时长」按此实现，归属条款见指标协议。成功查询（包括零新增）按项目记录真实 coverage；失败、截断及旧账缺覆盖证明时不扩大覆盖。读数只采用全部白名单项目共同可信的连续覆盖，部分窗口声明实际边界，没有事件不出点。时长按绝对时间差计算，保留负值与夏令时语义。

## 责任与接口

| 层                            | 责任                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| shared/workbench metrics 契约 | MetricDefinition、MetricRef、MetricReading、窗口/错误模型与可比较性                        |
| BW 主进程指标服务             | 可信项目定位、业务定义/脚本读取与执行、任务去重、输出校验、证据/缓存 |
| renderer/workbench           | 记分牌消费 MetricsPort：场景分组、结果/引领配对、从所选版本计划推出聚焦与完成线，并按完成线判定输赢 |
| 计划 / 验收                   | 保存选定 metricRef 和版本目标 / 引用真实 readingRef；不另跑脚本、不保存一份手填实际数      |
| Orca                          | 项目/宿主身份、权限与通用进程/文件基础设施；不装 BW 指标业务                               |

复用 MetricsPort.list(project)、read(ref,window)、refresh(ref,window)；刷新返回可追溯 run/状态，读取返回 value 或 Unknown 及原因，不能仅用 null 吞掉失败。MetricRef 包含项目、指标名称与定义指纹，名称不唯一须先消歧；leads 是声明关系，不自动证明因果。

VersionHistoryPort.list 的 currentOnly 查询固定本次主干基线 SHA，以 ls-tree 列出该树现有的 data.json / acceptance.json；只解析这些当前文件，返回该基线和每版本一份材料。旧格式或坏文件问题只属于当前版本，不扫描已经替代、迁移或删除的 Git 快照。总览目录与指标目录独立回显，不等待 provider 归档核验。历史 list 仍供计划屏明确的上版验收来源查询使用，read/readPlan 按保存引用核对固定内容；它不作为总览版本菜单来源。

总览缓存以项目、宿主、runtime owner 和主工作树路径隔离。固定提交材料和 committed planRef 按完整身份缓存，失败不进入成功缓存；当前草稿返回页面时重读。草稿覆盖显示前通过既有 listTreePlans 校验其固定树包含本次目录主干基线，落后或核对失败的树不能遮住主线现行文件。版本集合来自该基线的现有目录；固定树保存的选中偏好不能添加已删除版本。两个固定树分别核对，仍只呈现所选版本的一套材料。

验收 planRef 与当前计划修订不一致时保留当前计划，提示暂无对应验收；核对一致后读取引用并左右展示。旧承诺的显式引用仍保持内容修订校验，不退回最新材料。总览不另存可编辑副本，不改变流程选版，不再提供 Git 快照的轮次切换。

## 采集、存储与窗口

沿 metrics schema2，不顺带升级全项目协议。MetricDefinition 保留 name/def/target/collect/feature/leads；目录另带可选 [[feature]]（name/value）作为场景声明，只决定页签顺序和价值说明，不参与定义指纹，也不构成指标。MetricReading 带 value、window、granularity、collectedAt、source、definitionHash、collectorRevision/执行指纹；版本材料引用读数的稳定标识/快照，证据缓存可以重建，不引入 BW 业务数据库。

项目时区与版本约定明确解析为左闭右开窗口；同一 ref+定义指纹+执行指纹+数据目标+窗口+宿主的刷新合并执行，不让过期请求覆盖后发结果。主进程用 argv 执行已登记采集，不经 shell 拼接；默认超时遵循协议，输出只接收一个合法 JSON，标准错误用于诊断，不当读数。

能力注册为 main RPC（workbench.metrics.list/read/refresh、workbench.history.list/read/readPlan、workbench.archive.prStatus）；SSH 宿主经窄执行器 workbench.metrics.execute / workbench.history.execute 运行采集与历史命令，不扩 provider.exec 白名单。定义唯一正源为 .bw/metrics.toml；目录从主干基线（主检出 HEAD，或钉定基线）解析最新已合入提交，读取不在后台 fetch。单次采集固定该提交的定义、脚本及相关依赖，在隔离 checkout 内执行（preparation lock，finally 清理），BW_METRICS_TIMEZONE / BW_METRICS_DATA_ROOT / BW_METRICS_DATA_COMMIT 显式传递。默认窗口「本周截至采集时刻」保留脚本返回的真实 coverage；历史纪要读取当时保存的 baseline，不被新采集覆盖。

业务定义只接受 script + retro=true，脚本按日/周输出历史 points；仅当前 value 输出不再支持，缺点留缺。源数据与历史存储归用户项目或外部服务所有，BW 不登记每日自动化、bw/ledger 或 readings 日写回。既有历史证据仍按原字段读取，不自动改写或删除。总览读数在本次应用运行内按项目缓存，主动刷新更新；计划/验收保存采用的证据，不积累独立时序台账。缓存按项目、定义/执行指纹与窗口区分，不能当事实正本。

定义变更让旧读数保持历史身份；跨定义不可自动比较。刷新失败时返回错误与旧记录的时间，不给旧记录换新时间。计算改善幅度前检查数值/单位/口径；字符串只展示，不把非数字硬转 0。

新采集按指标名称解析主干基线目录，执行根须符合本次解析的脚本/依赖修订；固定树落后或未提交脚本不能代用。目录读取只认主干基线，不合并、重置或覆写计划/验收草稿树。旧 baseline 的 configurationCommit/definitionHash 用于解释历史，不能作为新采集前置锁。证据详情显示 source、collectedAt、configurationCommit 与 collectorRevision，definitionHash 保存在材料中，不作为独立详情项；未提供专门的定义/单位变化比较或确认界面，由人据来源核对可比性，不自动计算跨口径改善。针对性验证覆盖仅脚本更新、验收树落后、草稿试采隔离及旧证据保留。

## 配置任务与采用

“配置指标”每次经 metrics-setup 管线新建原生会话并进入该会话，使用独立固定维护分支 **bw/metrics-refresh**（树名 metrics-refresh），由 cycle-prompt 的 workflow='metrics-refresh' 注入 SYSTEM 与指标 Skill。工作树定位、创建、目录、登记和宿主路由复用 Orca；不硬编码物理目录或项目主分支，不删除重建已有树，不因新会话重置未完成改动，不按标题续接会话。指标模块提供当前定义/错误；项目约定与完整指南按原生发现 Stub/guide 读取，普通项目不依赖自身拥有 standard/。返回总览按项目与宿主恢复版本及指标筛选。入口不添加 BW 配置页、周流程或指标自动化。

配置任务形成定义和脚本的可评审改动，通过项目 PR 流程合入。总览及版本流程读主干基线（主检出）；新采集固定本次来源，不锁在旧计划配置提交。未合入草稿只在配置上下文预览和试采，不自动成为正式目录。刷新直接调用 MetricsPort，不启动模型。

## 三屏呈现与迁移

总览负责定义与源数据，计划编辑目标，验收保留原目标只读并允许选择最新目录指标补充实测，复用同一指标契约和 selector。新读数保存自身配置/执行来源，不覆盖计划 baseline；旧指标被删除或口径变化不阻止选择新指标，目录与采集错误独立呈现，证据来源供人核对。项目名片与北极星沿用既有双卡结构。

总览记分牌由 overview-scoreboard-model 现算：场景顺序取 catalog.features 再补定义上出现的特性，每签结果取计划写了目标值的滞后（否则第一条），引领取 leads 指向该结果的（计划写了目标值的优先，否则取未关联任何结果的），不借用关联其他结果的引领；没有引领时第二格取下一个结果。余下定义只列名。聚焦不另存：读取版本区所选版本的计划文档（use-version-minutes 已加载的 planDocument），把 goals[].metricTargets 中非空目标值按指标名并入场景，场景内任一指标有目标值即聚焦，完成线依次取所展示结果、引领、其余指标的目标值；切换版本即换聚焦。输赢只在完成线带比较符且单位与定义一致、并有最近数值读数时判定，其余为看不出输赢，不手设状态。读数沿既有首次准备、快照复用与主动刷新链；业务刷新覆盖北极星，北极星不重复挂按钮。走势用所选粒度窗口的桶值画简单柱，不引入图表库；原 ECharts 依赖与项目研发统计（提交、合入 PR、开放 Issue）的读取编排随两区一并删除，项目墙只保留 sdlcProviderOf 判定来源。总览筛选保存在按项目／宿主区分的会话视图偏好中，只保存版本、场景页签和粒度，不保存读数。版本全文与来源直接在等高左右栏内回看，Markdown 正文独立滚动，以版本重置滚动位置，不改工作区导航。

从旧 main（`archive/main-pre-orca`）定向选择有效 .bw 资产，不覆盖目标分支已有项目约定、计划、runtime 和本机路径。北极星占位不成为已注册业务指标；保留缺口。迁移后的 BW 自用数据只是首个验收项目，还要验证不含源码 standard/ 的普通项目。

## 验证与代价

TDD 覆盖窗口/时区、定义指纹与场景声明、真实零与 Unknown、坏输出、去重与过期结果、历史不补值、关系消歧、记分牌的场景配对、计划推出聚焦与完成线判定、重启读回。模拟执行器用于错误分支单测，真实脚本和 Electron 用于 M01–M10/MJ01/MJ02。

主要风险是采集口径随版本材料 schema 漂移、项目/宿主混用和缓存伪装当前值。契约 fixture 只用于局部验证；真实脚本、宿主路由与跨屏采用仍须独立读回，证据与未验证项见 [STATUS](STATUS.md)。
