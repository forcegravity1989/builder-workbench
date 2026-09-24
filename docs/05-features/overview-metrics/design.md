# 总览指标实现设计

> 给实现与技术评审者读取；本文管指标数据流、采集与边界，不写分步排期。行为见 [spec](spec.md)，共享消费方见 [计划设计](../version-planning/design.md#共享边界)。取舍变化时更新，落地后同步关键信息维护模块。
>
> 状态：拟实施。架构定位：architecture §1 项目概况与版本判断，§2 ①事实、⑤壳；当前 OverviewPage 的 OVERVIEW_DEMO 不是指标数据源。

## 迁入什么

参考 main 的 crates/app-shell/src/screens/overview/metrics.rs、crates/bw/src/repo/metrics_file.rs 与 .bw 指标资产：BizMetrics 的定义解析、feature/leads 页签及引领/滞后图表，SdlcMetrics 的提交/合入 PR/开放 Issue 图表，以及两者的日/周、刷新、历史与错误语义。保留协议、测试向量和有效业务资产，重写 Electron 适配；不迁 Rust crate 或旧 bridge。

BW 自用的 managed-projects.py、其名单和远端读取依赖要逐项核对；monday-screen 口径目前依赖旧 data.json/confirmation 历史，必须在新版本材料落地时更新采集解析并保持历史定义可解释。不能复制脚本后宣称新周一屏已有使用指标。旧 codehub-closed-issues.py 也须核对实际 provider，不能因文件名就假定适用 GitHub。

## 责任与接口

| 层 | 责任 |
|---|---|
| shared/workbench metrics 契约 | MetricDefinition、MetricRef、MetricReading、窗口/错误模型与可比较性 |
| BW 主进程指标服务 | 可信项目定位、业务定义/脚本与项目 Git/provider 统计两种来源、任务去重、输出校验、证据/缓存 |
| renderer/workbench/metrics | 原总览两块指标、业务特性页签/关系、系列显隐、当前/历史图表、刷新与选择器 |
| 计划 / 验收 | 保存选定 metricRef 和版本目标 / 引用真实 readingRef；不另跑脚本、不保存一份手填实际数 |
| Orca | 项目/宿主身份、权限与通用进程/文件基础设施；不装 BW 指标业务 |

拟冻结 MetricsPort.list(project)、read(ref,window)、refresh(ref,window)；刷新返回可追溯 run/状态，读取返回 value 或 Unknown 及原因，不能仅用 null 吞掉失败。MetricRef 包含项目、指标名称与定义指纹，名称不唯一须先消歧；leads 是声明关系，不自动证明因果。

## 采集、存储与窗口

沿 metrics schema2，不顺带升级全项目协议。MetricDefinition 保留 name/def/target/collect/feature/leads。MetricReading 带 value、window、granularity、collectedAt、source、definitionHash、collectorRevision/执行指纹；版本材料引用读数的稳定标识/快照，证据缓存可以重建，不引入 BW 业务数据库。

项目时区与版本约定明确解析为左闭右开窗口；同一 ref+定义指纹+执行指纹+数据目标+窗口+宿主的刷新合并执行，不让过期请求覆盖后发结果。主进程用 argv 执行已登记采集，不经 shell 拼接；默认超时遵循协议，输出只接收一个合法 JSON，标准错误用于诊断，不当读数。

retro=true 从脚本按日/周重算，缺点留缺；retro=false 仅查询当前时点，不承诺历史窗口。移除 manual 现行来源，不迁每日自动化、bw/ledger 或 readings 每日写回。原有人工记录只保留历史身份，不自动删原件。当前读数可短期缓存；计划/验收归档固定采用的证据，不积累独立时序台账。缓存按项目、定义指纹、窗口/时点区分，不能当事实正本。

定义变更让旧读数保持历史身份；跨定义不可自动比较。刷新失败时返回错误与旧记录的时间，不给旧记录换新时间。计算改善幅度前检查数值/单位/口径；字符串只展示，不把非数字硬转 0。

执行根必须符合已采用配置的脚本/相关依赖修订，详见唯一 metrics 协议；常驻树落后或脚本有未提交改动不可代用。测试覆盖 TOML 不变而脚本改变、目录已采用但验收树落后、配置草稿试采与正式源隔离。

## 项目研发指标

参考 main 的 trend.rs 与 vm_derive::collect_repo_stats：默认最近五周／十四天；调用 Orca 现有项目定位、Git 与 provider 读取能力，不另写 GitHub 登录或 PR/Issue 抓取栈。主进程提供项目统计读取/刷新，窗口、去重、异常模型与指标服务复用，但不把这些内建统计伪装为 metrics.toml 业务定义。

提交计数明确所选工作树/分支和完整窗口，PR 合入按远端 mergedAt，开放 Issue 为时点存量。旧 main 口径与代码需要逐项核对，尤其重开事件、分页上限和本期非完整窗口；有完整事件历史才重建，只有当前快照就只返回该点。Git 成功不替代远端成功。项目 stats 保留来源与时刻，不能把切日/周后的旧数字重标为新窗口。

## 配置任务与采用

“配置指标”经共享 MetricSetupPort 启动原生项目任务，使用 Orca 默认隔离工作区策略；指标模块只提供业务提示和返回上下文，集成层负责原生 taskId 关联。同次返回继续未完成任务，显式新配置新建任务，不进入 bw/week-plan 或验收会话。提示加载项目约定、通用 SYSTEM、metrics-refresh 及当前定义/错误；普通项目的 Skill 由产品资产解析。配置任务形成定义和脚本的可评审改动，通过原生 PR 进入项目指定配置基线。目录读取固定配置提交；试采草案只在配置上下文有效，不自动成为三屏正式引用。刷新按钮直接调用 MetricsPort，不启动模型。

## 三屏呈现与迁移

总览负责定义与源数据，计划使用目标编辑模式，验收使用目标只读+实际读数模式，复用同一个 MetricBinding/Reading 组件和 selector。总览继续 main 的业务／项目分区；业务使用特性 tabs、同组滞后/引领与系列显隐，项目三组趋势并排，各自日/周与刷新。以现有前端图表能力和设计系统实现，新增依赖先查已有库；同轴必须同单位，不同单位采用明确独立刻度或对齐图。日/周切换不篡改采集精度；无真实点显示无数据。

从 main 定向选择有效 .bw 资产，不覆盖目标分支已有项目约定、计划、runtime 和本机路径。北极星占位不成为已注册业务指标；保留缺口。迁移后的 BW 自用数据只是首个验收项目，还要验证不含源码 standard/ 的普通项目。

## 验证与代价

TDD 覆盖窗口/时区、定义指纹、真实零与 Unknown、坏输出、去重与过期结果、历史不补值、关系消歧、项目统计的提交/合入/存量口径、Issue 重开与分页截断、重启读回。模拟执行器用于错误分支单测，真实脚本和 Electron 用于 M01–M10/MJ01/MJ02。

主要风险是旧采集口径随新计划 schema 漂移、项目/宿主混用和缓存伪装当前值。先冻结 MetricsPort 与固定输入向量，三个特性才可并行；共享接口和文件所有权由总计划约束，执行计划在仓外。VersionHistoryPort 与总览版本记录区域由集成层拥有，计划/验收提供摘要；指标线不同时改该壳，避免并行文件冲突。
