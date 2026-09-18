# 数据与本地服务

> JSON 是内容正本。Skill 按规划工作树启动本地服务，页面与模型共同读写 JSON；离线 HTML 用于只读查看。

## 文件与打开

出厂资源（固定 HTML、空数据模板、转写脚本、纪要模板）都在本 Skill 的 assets/scripts，不复制进项目；项目内容在 .bw/planning/<版本>/data.json。每版新建数据，会议记录按需生成：

```text
.bw/planning/
  <版本>/data.json                 该版本内容正本，未定名时为 default
  <版本>/deliverables/             版本交付件（如发布报告截图，供第一屏引用）
  <版本>/reviews/                  会议原始转写、现场记录快照与纪要
  template/version-plan.html       本地离线只读缓存，可由 JSON 重新生成，Git 忽略
  .local/                         本机配置、日志、锁，Git 忽略
```

归档只提交版本目录与 `.bw/planning/.gitignore`，排除 `.local` 与离线缓存；模板和工具留在 Skill 安装目录，不随项目归档。BW 通过内置 Skill sidecars 分发模板、空数据、脚本及参考资料；打开项目时创建或更新原定版本计划自动化，不改变已有定时、启用状态及 provider。

Skill 先读取已有版本，执行 start 并在右侧打开返回的完整 URL。服务程序留在 Skill 安装目录，复用现有 Python 标准库脚本；不复制服务源码进项目，不依赖 BW 主程序启动。一个规划工作树共用一个本地服务；.local 保存端口、进程与连接凭据，归档不提交。没有历史才 init 创建 default 空版本，不先阻塞在版号上；确定名称后 set-version，内容保留并重新生成同一个页面的数据部分。模板 CSS 和骨架不会随内容重画。

命令均以脚本所在 Skill 目录定位 planning.py，--workspace 必须显式指定任务工作树：

```
python <PACK>/scripts/planning.py --workspace <工作目录> --version <已有版本> start
python <PACK>/scripts/planning.py --workspace <工作目录> status
python <PACK>/scripts/planning.py --workspace <工作目录> stop
python <PACK>/scripts/planning.py --workspace <工作目录> --version <已有版本> refresh
python <PACK>/scripts/planning.py --workspace <工作目录> init
python <PACK>/scripts/planning.py --workspace <工作目录> --version default set-version --name <确定的版号>
python <PACK>/scripts/planning.py --workspace <工作目录> --version <版本> read
python <PACK>/scripts/planning.py --workspace <工作目录> --version <版本> update --file <候选> --if-match <etag>
```

init 只补缺失文件，不覆盖已写内容。set-version 只给 default 草稿定名，不覆盖已有版本、不改历史归档。模板本身可直接展示空 default，但模型应先建立项目 JSON 再交给用户。

## 同一份内容

服务页面通过同源接口读取当前 JSON。start 只监听 127.0.0.1，并把 URL 返回给 Skill；页面请求携带本次服务的连接凭据。模型保存 JSON 后，页面在没有未保存输入、没有正在编辑的字段时检查新修订并更新。

用户手填停顿 800ms 后自动保存，保存失败时顶部显示重试按钮；无需目录选择或文件授权。顶部显示当前版本 JSON 路径。保存使用文件修订号检查冲突，并复用 CLI 的文件锁与原子替换；服务收到旧修订时拒绝覆盖，页面保留输入并提示，可下载未保存内容供会话合并。模型也应使用脚本的 read 与 update --if-match，不绕过文件锁直接覆盖。

服务停止时显示连接失败，未保存输入仍保留在当前页；不能当作已落盘。由 Skill 重新 start，连接失效时用返回的完整地址重新打开，先保留旧页输入。status 检查当前工作树服务；用户结束规划并要求关闭时 stop。服务启动不改变版本内容，不自动建 Issue 或提 PR。

直接双击共用 HTML 时为只读，仍可查看已生成内容；会话保存 JSON 会刷新共用 HTML 的展示数据。日常 HTML 可重建，版本 JSON 才是归档事实。

## 目标、任务与三屏

目标是要达到的结果，任务是为此开展的具体工作。不能因为旧评论把工作清单放在“版本目标”标题下，就把每条工作项变成目标；也不能擅自归并成新的三个目标。读原文，保留结果性主张和具体任务的区别，缺定义诚实呈现。

### 目标定义

每条目标保留稳定 id / label（如 G1）和 title。以下是数据字段，不要求逐项呈现在卡片上。目标编号以版本为范围，跨版本引用写 `v0.4/G1`。

| 字段 | 人要明确的内容 |
|---|---|
| title | 一句 SMART 目标：对谁产生什么结果，以什么指标达到多少；不写任务清单或大段说明 |
| metric | 用哪个指标、什么口径衡量，不能只写“完成率” |
| target | 目标值及单位/判定阈值 |
| baseline | 起点；改善类目标必须知道它才有可比较的进度 |
| reading | 实际读数；没有就为空，不用提交数或“有进展”代替 |
| deadline | 可省略，默认该版本结束；有不同观测窗口时再明确 |
| owner | 可省略，默认 Builder；出现不同责任人时再明确 |
| status | 草案、待核对或有证据的达成状态 |
| progress | 有已约定公式、目标值和实际读数才填写数值；其他为 null |
| note / sources | 讨论批注、缺项或接受的例外，以及机器保留的出处 |

SMART 还要由人确认可达性和与版本方向的相关性，不是填满字段就自动合格。新目标应逐项明确，不能替用户编数字；旧目标没有指标/目标值时，原文留在来源，卡片忠实缩为一句，不追造历史承诺。交付型目标也要有可判定的指标及目标值，例如约定验收项全部通过，但不能用任意任务计数冒充用户价值。

第一屏 results.goals 显示目标句、进度条及实际值 / 目标值，读数后用标签选择达成、未达、遗留、无值。标签写入 status，由 Builder 或有事实依据的 Skill 填写；不按提交数量自动判定。缺读数显示 —，无可信进度时进度条为空轨，不标成 0%；不显示字段名、长状态说明、截止时间或负责人。指标和基线等计算口径仍保留在数据中，由 Skill 核对。第二、三屏都编辑 plan.goals，**没有独立的任务预览或另一份会前目标数组**。第二屏先与 Builder 拟定目标，再带去 Leader 会议现场调整；会后第三屏继续同份目标并拆任务，目标卡同第一屏的简洁样式但不显示实际读数和结果。会后调整目标要在 review.decisions 说明，Leader 在最终 PR 审核。

### 上周结果的来源

“上周版本结果”由 previous_version 指向具体版本，不按自然周猜版本。读取顺序：上版已确认数据 → 该版本旧计划 Issue 最后确认的目标评论 → 留空。旧评论里的工作项保留来源，只有查到真实 Issue 才进入任务区，没有明确目标就不推定关联。未确认的重建 JSON 不能压过旧流程原承诺。

脚本只读关联 Issue、Git、MR/PR 和已有验收材料，区分提交、合入、发布和验收。原平台缺记录则标缺口；不能用新平台查不到推断未完成。结果归纳和人工补充写入任务的 progress_note，不能占用目标 reading。

### 任务、版本交付件与会话

results.tasks / plan.tasks 保存 id、number、url、title、kind、goal、sources；results.tasks 另有 progress_note。number/url/title/kind/goal 从真实 Issue 获取，第一屏不手工造任务；第三屏可以先写待建草稿，提交前必须创建或复用 Issue 并读回。任务不再呈现批注、额外状态、验收要求或逐项交付件；验收条件放 Issue 正文。历史材料已有字段可保留出处，不能因此要求用户继续填写。

Issue 标题、类型标签、版本标签、正文的唯一规范见注入的 issue-state reference。类型只有 Bug/Feature，缺标签默认 Feature。`【v0.4|W38|G1】` 解析为 goal=`v0.4/G1`、goal_week=`W38`；不能解析就空。采集按明确的 bw:plan 标签，跨版保留旧排期，不把目标版本误当排期版本。Skill 必须先确认第一屏所核对的版本，不能自行用当前自然周推断。

只读采集（输出候选与原始 Issue，不自动覆盖人填写的进展，也不修改远端）：

```
python <PACK>/scripts/planning.py --workspace <工作目录> collect-issues --plan-version <核对版本>
python <PACK>/scripts/planning.py --workspace <工作目录> collect-issues --plan-version <核对版本> --input <Issue数组.json>
```

直采通过已登录 gh 读取当前 GitHub 仓，分页取全部状态，排除 PR 和系统计划/盘点 Issue；其他平台由会话用真实接口取得规范化数组再 --input。数组含 number（整数）、title、url（浏览器地址）、labels（名称或含 name 的对象）、state。读取失败要明确报告，不能当空列表。Skill 按 Issue 编号合并候选，保留已填进展；Issue 移出/新增版本先核对，不能盲目以采集输出替换整份 JSON。commit 与 MR 的取数窗口依项目实际版本界定，不假设通用公式。

results.deliverables 为可选数组，每项 `{id, label, goal, url}`：交付内容、所属目标、链接。位置在任务前，以版本发布报告为常见材料，也可添加其他。默认空数组，主要主动询问用户有没有要归档的报告；没有规范就不自动凑资料，不把旧任务代码链接批量提升成版本交付件。url 支持真实 HTTP(S) 或项目内相对路径，服务只提供当前版本明确引用的本地材料。

results.sessions 先只显示 title；记录 id、tool、workspace、source 等可核实来源用于去重和归属核对，未取到的字段不猜。只列当前项目空间的 Cursor/Claude 会话，不读其他项目。优先现有 Orca 记录接口，缺接口或标题时明确缺口、标题留空；本仓当前 Orca 适配仅能证明启动路径，尚无可复用的会话列表读取实现，不能宣称已自动采集。会话全量原文不是第一屏默认展示内容。

### 新旧界面的数据边界

目标、总结和评审以每版 JSON 为统一内容源，不再双写目标评论。任务排期与执行状态始终读 Issue 标签和远端状态。BW 现有计划/总览及健康计算经 version_plan_notes 读取 JSON，复用原组件：主项目文件承载归档，登记在 bw/week-plan 的常驻树承载当前草稿，同版本草稿覆盖归档显示；损坏的草稿显示未知，不退回旧目标。progress_updates 为当前版本执行进展数组（id、recorded_at、text、sources），盘点会话按修订检查写入，总览按记录逆序展示；后续版本的结果总结覆盖对应版本的展示。summary.progress 归属于 previous_version，不错算到正在拟定的版本。旧计划评论只用于首次导入历史承诺，不成为新版本的另一份可编辑正本。

### 评审屏与确认

- summary.risks：需要向 Leader 上报的风险、影响目标、建议与所需支持。
- summary.progress：第一屏结果和任务/Bug 进展的摘要，供现场一次看全。第一屏变化后由 Skill 同步摘要再评审，不让用户抄两遍。
- plan.goals：先和 Builder 拟定，再由 Leader/Builder 现场评审调整的当前版本目标，两屏共用。
- review：现场核心记录、会议链接、完整转写、纪要、会后决定。
- confirmation：人确认事实、会议版和最终计划的记录；保存不能替代确认。

手填纪要标 manual，按实际模板整理标 ready，流程见 meeting.md。实际转写、创建 Issue、提交 PR 由会话执行，不由本地网页暗中触发。

### 提交范围和项目门禁

submit-confirmed 要求已有用户最终确认和真实任务 Issue；不会自己制造确认。现场记录和用户手填纪要可以归档，有链接但未消化的纪要或 stale 纪要不能提交。自动纪要仍校验来源修订。BW 使用 `.bw/release/verify/verify.mjs --profile pr`，其他项目由会话根据项目 AGENTS 把参数数组填入 .local/settings.json 的 validation_argv；缺配置明确报错。

提交范围为当前版本目录（data.json、deliverables、reviews）与 `.bw/planning/.gitignore`，不把其他版本草稿一起暂存。共用 HTML 是可重建展示缓存，不进归档。创建计划后，系统入口 Issue 保持原识别标题并追加本版 bw:plan，任务 Issue 按规范打标签；目标正文不再双写评论。

损坏或不匹配的其他版本在选择器标明“无法读取”，保留原文件并由会话修复，不影响当前有效版本。JSON 写入为保存结果，离线 HTML 仅为可重建缓存；缓存刷新失败返回已保存修订并给出警告，不能让下一次保存陷入旧修订冲突。
