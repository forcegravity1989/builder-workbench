# CHANGELOG.md

版本变更记录。决策动机进 [`docs/02-adr/`](docs/02-adr/),不写这里。Workbench MVP 起记(2026-08-24);MVP 之前的 V1/V2/V3 史实在 git 历史与 `v3` 分支,不补抄。

本文件按**六站 + 底座**收口,不再按每次窗口一条流水往下堆。最近一次改动永远写在最上面。

## 最近 · 2026-09-10

「设置屏收成全局面板」十三轮收敛后发起人当场确认设计完成、批准转入实现——**人 gate 已过,代码已落地**(下面 9-09 那条「待意图 gate,未动代码」作废)。设置屏左栏加「能力」一节:**Connector**(7 行,claude/cursor-agent/Open Design/GitHub CLI/codehub-cli/welink-cli + Orca,着色只对「有活会用到、却不在」的判红)、**Skills**(全局一张表,Workbench 自带 5 份 + 所有接入项目各自的 `.claude/skills/`,卡片标「注入不了」而不是假装「用过 N 次」就是被注入过)、**Stage**(五个阶段一张表,执行器 + workflow 下拉都在行里,workflow 选项里把这个仓自己写的也列出来但标 ⚠「接不上」)、**Plugins**(现扫 `standard/vendor/` 两个库,mattpocock-skills 41 个技能按六类分组、mohit-pm-claude-skills 2 个)、**AI Assets**(项目 `AGENTS.md` + Workbench 四份 reference,「现在哪几张活在用」扫当前打开项目的真实 issue 列表)。

项目内的配置屏对应瘦身:开工工具映射与技能列表搬去设置屏(它们本来就是全局的,`Settings.tools` 没有项目维度,`save_tool_mapping` 的 `project_id` 一直被丢弃——搬回设置屏是修这个,不只是挪位置);配置屏改成只渲染真正跟项目走的三样(远端 / 项目群 / 节律),这三样 `ConfigVm` 早就算好了、只是从来没被渲染过。知识库资产页签删掉重复的技能块,换一句话 + 一个跳到设置 · Skills 的链接。

顺带修了一个真 bug(intent.md ⑪ 记录过、这轮实际落地修复):`skill_list` 的用量匹配对项目自有技能一直是「按名字撞上就计数」,而 `skill_pointer` 的路径永远只拼 Workbench 自己的资产目录、够不到项目自己的 `.claude/skills/`——界面以前会显示「用过 N 次」但实际从没注入过。这轮加了 `injectable` 字段,项目自有技能一律如实标「注入不了」,用量数字和「能不能注入」分开显示,不再用一个数字暗示另一件没发生的事。顺手查出 `metrics-refresh` / `project-handbook` 两份内置技能编进了二进制,却没有任何 workflow 名字指向它们(`skill_slug`/`workflow_label` 都只认三个名字),今天也从来没被注入过——同一个显示逻辑照实报了出来。

**明确没做、如实记的偏差**:技能「改于哪天」(要编译期烤 git 时间戳,本轮跳过,卡片不显示这一项);跨项目的技能用量统计(`uses` 只对当前打开的项目现算,没打开的项目本地技能一律显示「还没用过」,不是真的没用过);AI Assets 的「现在哪几张活在用」同样只对当前打开的项目现算,没打开项目时如实显示空 + 一句说明,不编数据;Orca 仍然没有真探活,只有「配了 / 没配」两态;用户自己的 workflow 接入通道(`skill_slug` 硬编码三个名字、路径只认 Workbench 自己的资产目录)没有动,Stage 页的 workflow 下拉如实标出「选了也接不上」,把缺口摆在界面上而不是修掉它;agent 这一类资产(`.claude/agents/`)仍未纳入面板,全仓本来就没有扫它的代码。这几条都在 STATUS 的「待裁决」里注明是建议另开一件,不在本特性范围。

开 `docs/05-features/scoreboard-and-forecast/`:把执行四原则(4DX)落进总览与计划两屏——记分牌(指标 × 周,引领按 `leads` 缩进挂在滞后下)、目标路面、蒙特卡洛完工预测、周期时间分位与累计流。**产品预置的是文法不是视图**:`metrics.toml` 里已有的 `collect.retro` / `leads` / `target` 三个字段决定一条指标长什么样,`target` 解析不出形状就退化成记分牌一行,不报错不阻塞。计划屏三张图吃的是所有项目同构的 issue/MR 史实,可以预置;总览的图只能跟着项目长出来。**intent 与 spec 都未认**,本批只有文档与原型,一行 Rust 没动。

接入路径收口(存量 bug,不开 feature):接入页去掉含义不清且只会建空目录的「新建 / 已有」二分,改成「打开本地仓 / 克隆远端仓」;本地仓走目录选择、直接复用,远端仓才选择平台、仓与克隆位置。项目约定 + 三条 Orca 自动化的常驻 worktree 从仓外同级目录统一收回 `<仓>/.bw/worktrees/{project,week-plan,ops-audit,ledger}`;旧同级树只检测并报错,不迁、不删,同时删掉撞名普通目录会被递归删除的危险路径。

接入路径验收修正:打开本地仓时也在进入基础信息前读取本地 `.bw/project.toml`,与远端接入共用同一张名片回显卡;克隆父文件夹默认直接显示本机设置的工作区根目录,仍可另选。删掉接入卡片中重复解释字段与情境的长注释,只保留读取状态和失败原话。CodeHub origin 反查改为复用模型层唯一的区别名/域名表,并要求宽松匹配的主机名仍带 `codehub`,未知平台不再静默当成无远端;所选远端路径在比对和保存前统一去掉尾部 `/` 与 `.git`,避免克隆成功却接入失败。读数账本注释同步现行 `.bw/worktrees/ledger` 路径。账本树开不出时不再用同路径普通目录降级,避免永久堵住正规 worktree;同名项目路径都不存在时按路径文本判定,不把两次解析失败当成同一目录。接入 smoke 改查实际自选目录并规范化符号链接,壳的克隆目标测试不再写死 Windows 分隔符。

## 最近 · 2026-09-09

「设置屏收成全局面板」立项(`docs/05-features/capability-panel/`,**待意图 gate,未动代码**)。三轮方向变化如实记在 STATUS 里,最后落点是:顶层设置屏排成左栏面板(搜索 + 本机 / 能力两节),列表点进去是带「← 返回」的整页详情,排法照抄 Claude 桌面版设置面板。

过程里查出一处真错:**「开工工具映射」本来就是全局的,界面却把它摆在项目内的配置屏上**。它存的是 `settings.toml` 的 `tools` 表,键是类别、没有项目维度;`save_tool_mapping` 收到的 `project_id` 是 `_` 丢掉的。所以今天在项目 A 里把「构建」改成 Cursor,项目 B 也一起变了,界面一个字没说。搬回设置屏是修这个,不只是挪位置。

**用词定名(9-09 四轮)**:这一节叫 **Connector**,不叫「工具」。理由是它装的不只是开工用的工具——`gh` 是远端臂、`welink-cli` 是群通知、**Orca 是会话宿主**,都不参与「哪类活用哪个工具」的选择;用「工具」当名字 Orca 进不来。`CONTEXT.md` 登记 `Connector` 一条(上位词:Workbench 连出去用的一切外部东西,一套判读「能真连的才叫连上」统管七件),并写明它**不是** V3 那份 `.bw/connectors.toml`;更窄的「开工工具」保留原义,作 connector 里负责跑活的那一类。

顺带把 **Orca 从「本机」挪进 Connector 表**:它今天在界面上只是一个填 URL 的格子,填了就当好了,而词表「探活」条的 `_Avoid_` 明写着不许把「配置填好」当成「连上」。挪进来后如实标成「还没配」而不是绿色——并写明**本机 Orca 服务根本没有探活实现**(`probe()` 只认 claude / cursor / open_design / welink,`env` 那六行也没有它),所以这一行只有「配了 / 没配」,没有「通不通」。要不要给它加一次真探活,列成待裁决。

**第十轮(9-10)**:发起人一次点掉两件。**一、把诊断表从设置面板里删掉** —— 上一轮为了「链接真实 loop」加的第二张表(「哪 5 张活一份规范都拿不到」,逐条列 issue 号和原因)被当场否:数据是真的、发现也有价值,但那是**活的健康诊断,属计划屏 / 总览**,设置面板答「装了什么、挂在哪」,不答「你的活哪里没配好」。删表,色条口径也收回资产自身(有活在用 / 没活在用 / 未派发)。发现另开一件去做,不顺手安置在这一页。

**二、`运作活①②` 是黑话,全清。** 它们指的其实是两个有正名的 workflow —— `更新指标与版本计划` 和 `资产盘点`。原型里 11 处、intent 里 1 处全换正名。这条比前几次隐蔽:该说法已经写进 `CONTEXT.md` / `docs/architecture.md` / `SYSTEM.md.tmpl` / skill 的 description,是照抄仓里现成写法带出来的 —— **仓里已有的黑话不构成继续用它的理由**;带序号的自造代号(①② / T1 / F3)一律用正名。

**第九轮(9-10)**:发起人指着 AI Assets 表说「长篇大论都是在教育用户,而没有真正去链接真实项目的 workflow loop」。这是同一个毛病的第二次——上一次是删掉讲机制的段落,这次是**把描述换成真实连接**。

AI Assets 表的「写的是什么」整列删掉,换成**现在哪几张活在用**。数据从远端真拉(`gh issue list`):`build` 落在 #155 · #154 · #133 · #157 · #137 五张活上;`metrics` / `week-plan-comment` / `bw-assets` **现在 0 张**(没有运作活开着);`review` 未编进二进制。顶上的色条也换了口径——不再报清单自己的状态(已派发 4 / 未派发 1),改报 **loop 覆盖**:10 张开着的活,5 张拿到规范、**5 张一份都拿不到**(#159 #158 是原型类、提示词明写不加载 reference;#152 #143 #142 压根没打类别标签),表下逐条列出来。资产清单本身不重要,它有没有真的落到活上才重要。

Stage 的 **Workflow 列从只读文字改成下拉**,选项里除了自带的 `mattpocock-skills`,还列这个仓 `.claude/skills/` 下自己写的(带 ⚠),并如实标「今天选了也接不上」。上一轮把「用户怎么接入自己的 workflow」这个缺口写进了文档,这一轮**把它摆到界面上它该在的位置**——缺口有了具体坐标,比一段散文有用。

**发起人两条结构性意见(9-10)**,查证后都成立,其中一条带出真 bug。

**一、用户自己的 workflow 接不进来。** 发起人的原话是:每个项目会基于自己的资产和开发 loop 构建自己的一整套 loop 能力,那才是用户要的,而不是我们预置在 stage 上的通用 workflow;用户怎么接入自己的,是个比较严重的 gap。查 `skill_pointer`(`crates/bw/src/app/bootstrap.rs`)证实是**硬 gap,三道门**:`skill_slug` 是硬编码 `match` 只认三个名字、其余 `_ => None`;过了第一道也只在编进二进制的 5 份里找;路径只拼 Workbench 自己的资产目录,**根本不看被管仓的 `.claude/skills/`**。

**连带查出一个真 bug**:`skill_list` 的用量匹配第一条是 `w == slug`,活上挂的名字和仓里目录名对上就计数。于是**界面显示项目自有技能「用过 N 次」,而开工时 `skill_pointer` 返回 `None`、那段提示词根本不存在**——界面说注入过,实际一次都没注入。原型里先停血:项目自有的卡标「注入不了」。真正的接入通道要改注入模型(按名解析先查被管仓再回落自带、`default_workflow` 从产品常量改成可被项目覆盖),**属内核改动,建议另开一件**,本特性只负责如实把缺口显示出来。

**二、AI Assets 和知识管理分层脱节。** 开工提示词实际给三层(`standard/system-prompt/SYSTEM.md.tmpl`):被管仓自己的 `AGENTS.md`(只写一句「动手前读」)、Workbench 按类别注入的 references、活挂的剧本。我只把中间那层做成了 AI Assets,所以这一节答不了「这个 agent 到底会读到什么」。更远的是,知识分层正本 `docs/01-principles/01-document-organization.md` 里写着 `.teamai/`「团队 harness 分发(skills / rules / hooks / MCP)」——AI 资产的成文落点,面板里完全没有。改法:AI Assets 改成「开工时 agent 会读到什么」的视图,第一行就是项目自己的 `AGENTS.md`(标「项目」),可按来源筛;表下如实写缺口——项目自己的只有这一条而且只是被指了一下,`CONTEXT.md` / `docs/` / `.teamai/` 都不在。

**同事评审(9-10)**:两条缺口 + 三条界面收敛,全部照改。

缺口一,**AI Coding 资产观测**:外部希望看清这些资产在各被管项目里的分布——Workbench 带给项目的 vs 项目自己的,connector / skill / agent / workflow。查下来 **agent 这一类 BW 全仓零实现**(没有任何代码扫 `.claude/agents/`),不能在原型里补,连同「哪个项目在用」这个维度一起列成待裁决。缺口二,**`standard/` 下的技能催熟不了**(都是拍脑子的初稿、后续没优化过):面板只报「用过几次」时,「用了 12 次一次没改」看不见。所以 Skills 页色条改成催熟视角(用过但没改过 / 改过 / 还没用过),卡片写「用过几次 · 改于哪天」,排序加「按最久没改」。数据实测拿得到(`git log -1` 查 `standard/skills/*/SKILL.md`:week-planning 09-04、project-handbook 09-03),但**分发态没源码树**,真做要编译期烤进二进制。

界面三条:①状态别再写字——色条加行首色点已经是解释,状态列只留一颗点(带 `title` 供读屏),Connector 与 Stage 两张表同办;②过滤改按**类型**(执行器 / 远端臂 / 群通知 / 会话宿主),不按状态——状态已由颜色表达,再当筛选维度是同一件事说两遍;③「没有的」详情要指向**怎么装**,不是重复列表页的话:仓里有据的给可复制命令(welink-cli 的 npm 全局装 + `auth login`、claude 的三条前置),**没据的如实写「装法仓里没记」+ 判据**(PATH 上有这个名字),绝不编一条猜的包名。这顺带暴露一件没建的事:BW 没有一份「每个 connector 怎么装」的正本。

**第三轮(9-10)**:五节名全改英文——`Connector / Skills / Stage / Plugins / AI Assets`。「资产」特意译成 **AI Assets** 而不是直译 Assets,好和知识库屏那个中文「资产」页签(项目自己的技能/产物/发版)从名字上就分开。

发起人指着「哪类活用哪个执行器」那块问:这像 Executor,是不是该单开一页?查下来真问题不是缺一页,是**「阶段」被切成了两半**——执行器映射埋在 Connector 页底下、workflow 映射自成一节,两张表同样五行、同样形状。再开一个 Executor 页会变成第三张五行表。所以合成一张 **Stage** 表(`阶段 / Stage` 词表本来就有条目):一行一个阶段,列是**执行器**(可改,下拉就在行里)、**Workflow**(产品默认)、**状态**(这个阶段现在能不能开工);行尾进阶段详情,把开工时会拿到的三样——执行器 / workflow / 注入哪几份 AI Assets——摆齐,今天这三样分散在三处拼不到一起。Connector 那节回归它本来的职责:完整的外部依赖清单(7 行),只答「装没装上」。

**用词第二轮(同日)**:技能的界面标签改成 **Skills**、规范改叫 **资产**(词表登记并与知识库屏那个「资产」页签消歧:那一页盘项目自己的资产,这一节是 Workbench 给 agent 的规范)。界面里所有解释性段落删掉,换成**状态色条 + 一行计数**;详情页改成两列 `kv`,设计理由移出窗口进 spec 和在线原型的窗外卡片。

**补回丢掉的两节**:发起人指出「插件和工作流丢了」。查仓证实:`standard/vendor/` 里 vendor 了**两个**库——`mattpocock-skills`(41 件,构建 / 优化 / 运维默认 workflow 的出处)和 `mohit-pm-claude-skills`(2 件指标技能,**没有任何 workflow 引用它**,界面上完全看不见)。所以补 **Workflow**(五个阶段各挂哪条、来自哪个插件、原型与运营推广空着、`proto-design` 源还没 vendor)和**插件**(上游 / 版本 / 许可 / 技能数 / 谁在用)两节。`CONTEXT.md` 登记「插件」一条,`_Avoid_` 点明它和 workflow **不是同义**——今天 `mattpocock-skills` 两个名字一样是巧合:一个插件可以出多条 workflow,一条 workflow 也可以不来自任何插件。发起人明说还没想好归属,列为头号待裁决。

面板四页:Connector(开工工具映射 + connector 表,带类型列与状态过滤)、技能(卡片网格 + 来源过滤 + 排序,全局一张表)、规范(references 只读表,唯一一块新增界面,待裁决)、以及本机三节(目录 / Orca / 外观)。详情页抄 Claude 的骨架:出处行 + 右上角主动作;工具详情写「它给 Workbench 供什么」(claude 供开工与注入、gh 供读活开 MR 与合入读回、Open Design 供原型类内嵌网页),技能详情有「概览 / 文件 · N」两页签和文件浏览(渲染 / 源码)——这一页对 BW 是真需求:week-planning 带一个校验脚本 sidecar、mattpocock-skills 挂一整棵 vendor 库,今天界面上完全看不见。

着色口径改了:红只留给「有活会用到它、它不在」,没人用到的写「还没用上」走中性色——按这个口径同一台机器上只剩一行红(原型类映射到 Open Design 而它没起来),今天那张表是六行红四行。没抄 Claude 的两样:Discover / 安装数、「添加」按钮——BW 没有目录、没有安装动作、拿不到别人的安装数,抄过来就是一页编出来的数字。制品:intent(七条痛点)+ spec(操作逻辑 + 口径表 + 客户会问)+ 可点原型(仓内一份相对引两张真样式表,在线一份内联)。

05-features 收紧口径:只装**产生用户价值的新能力/新信息**(01 §4.1)。命名收口/基建接线/重构重排不产生新价值的直修留痕(commit 说明 + 必要时改 architecture 实况段),不开 intent gate、不过五大拷问。02 §1 适用范围、§6 小特性豁免同步。

按新口径降级 4 个非特性目录(代码实现不动,只删 05-features 文档目录):overview-health-36 并入 process-metrics(总览展示规格,价值锚点来自 process-metrics 产的数据,非独立新价值;STATUS 补并入记录)、version-as-v0x 命名收口(决策已在 architecture §1 周循环段)、design-system-wiring 基建接线(设计系统接进壳,未合入 main 非实况)、help-hub UI 重排。superpowers 两篇 version-as-v0x 孤儿草稿(正本已删、无外部引用)一并清。05-features 现留 reviewer-agent + process-metrics 两个特性。

同步 github 文档整改：architecture 精简为 §1 用例 + §2 五能力模块 + §3 三 crate 与留白（16 模块详解当实现细节删，心智模型搬 `docs/06-module/`，领域模型进 `docs/10-reference/`）。使用指南 14 处 `.linker`/`.foot` 原指旧「模块 N」编号（随精简已删，指空）改为指 §1 用例 / §2 ①–⑤ 能力模块 / §3 留白；规矩站「各模块没建什么」措辞改为 §3 留白 + §1 用例「没建什么」列。截图缺口（填写规范要求每步配图、指南一张没有）为旧指南遗留，本轮未补、留白。

issue #72:新建 issue 填的正文同步上了 codehub,但计划页签点开看不到正文、注入开工 prompt 也没带正文。两处断点:

- codehub 单查读错字段名。`codehub-cli issue view --format json` 回 GitLab v4 payload,正文在 `description` 键,但 `CodehubIssueViewJson` 把它读自 `body` 键(没 rename)→ 找不到 → 空串。写侧(create `--description`、edit `("description", body)`)一直走 `description`,唯独读侧写成了 `body`。GitHub 那条线用 `gh issue view --json ...,body` 显式要 `body`,读写一致,没中招——只有 codehub 项目拉回空正文,进而 `run_issue` 注入 prompt 时 `issue.body` 是空的。改法:结构体字段加 `#[serde(rename = "description")]`,抽出 `parse_issue_view_json` 纯函数(镜像 `parse_issue_list_json`),用 #72 真实回包钉死。
- 计划详情弹窗只读看板卡片 `c.body`,看板由 `list_issues` 拼,**列表设计上不带正文**;弹窗打开时没单查补正文。加 `Command::FetchIssue`(走 `issue_store::fetch` 单查)→ bridge 收 `IssueBodyFetched` 回执后补丁进 `last_gather`、跳过 full gather(重拉 list 会又把 body 冲成空),复用「状态标签补丁 last_gather」那条快路径。弹窗 `use_future` 打开即发一次 fetch;body 走 dirty 跟踪——pristine 时直接读 VM 的 `body_orig`(fetch 回来 VM 重切接得住,`body_val` 信号不会自己更新),人一编辑就 dirty 只认 `body_val` 不被覆盖。`primary_note` 给 `IssueBodyFetched` 早返 None(后台补正文不该弹 note,否则每开一次详情闪一条还盖掉上一条真 note)。

## 最近 · 2026-09-09

计划屏弹窗里从右往左拖选文本想复制时,鼠标拖到弹窗外暗区松手,弹窗就关了 —— 原来那层暗区(`dialog-backdrop`)挂的是 `onclick: 关闭`,内层只拦了 `onclick` 冒泡,没拦 `mousedown`。拖选的 `mousedown` 落在弹窗内、`mouseup` 落在暗区,浏览器在暗区上凑出一次 `click`,拦不住,于是把窗关了。抽了一个共享壳 `Overlay`(住 `plan_dialogs.rs`):暗区按下才置真、内层按下/松手置假并拦冒泡,`click` 只在按下也落在暗区时才关。12 个弹窗(新建/创建版本/排期/确认移动/拒绝移动/删除版本/出包/验包详情/停止确认/发版本 + 详情/Start)统一改用它。真点暗区仍照常关,拖选不再误关。

使用指南按驾驶地图重写：首页是周环（添加项目 → 版本规划 → builder → 出包验证 → 版本发布 → 周复盘），点站进该站正文。看总览不再单独成站。工作台抽屉里「去计划屏 / 去会话」会关上指南并跳到那一屏，不高亮 Orca 里的控件。自动化默认关。宁可丢掉旧站细文，也不留和地图对不上的站名与步骤。

驾驶地图贴合原型稿 `prototype-ops-anim/驾驶地图.html` 重做：补 SDLC 六阶段环、harness 三层窗口、SVG 图标、看板进度条；修一批走样子规则（slice 透明、milestone 光晕、entry 三栏、steps 两列、kanban 四等分）。删掉和地图重复的「找·从问题跳到那一站」表——它一点就白屏：`show()` 改 URL/hash 在 srcdoc iframe 里触发整帧重载，去掉这步只留 localStorage 持久化（规范要求）+ classList 切换。各站正文砍冗余铁律与过程话，修出包站 ADR 路径错（`docs/adr/0005` → `docs/02-adr/0005-…`），规矩站补 `.linker`。

验包 `cu_settings` 还在找旧高保真的 `.settings-row`，设计系统接线后设置行已经是 `.set-row`，点「保存」会空等到超时。驱动改跟现行设置文法对齐。

右侧「上报问题」不再从本机 git origin 推目标仓。装机目录和其他项目开发者本机都没有 workbench 源码，读 origin 会报 `D:\BuildersWorkbench 没有 origin` 这类错。现在固定走 `codehub-cli` 报到绿区 `z30026659/workbench`（git 地址 `https://codehub-dg-g.huawei.com/z30026659/workbench.git`）。本机仍需已登录的 `codehub-cli`。

## 2026-09-08

architecture.md 导读加一条指向 [`docs/10-reference/domain-models.html`](docs/10-reference/domain-models.html) 的链接(五张领域模型)。

加 [`docs/10-reference/domain-models.html`](docs/10-reference/domain-models.html):从 03 新闻稿 + architecture + CONTEXT 抽出五张领域模型(上下文 / 用例 / 逻辑 / 数据 / 领域)+ 现行 vs 主张速查。单文件 HTML,对齐 hifi/home.html 风格,参考性提炼(非决策记录);▲ 标 03 §C「尚未交付」项。

V3 史实 + 旧 16 模块挪移地图从 ADR-0006 移到 [`docs/10-reference/v3-and-module-migration.md`](docs/10-reference/v3-and-module-migration.md)(那是参考材料 / 挪移对照,不是决策记录);ADR-0006 删除。导读、DESIGN、AGENTS V3 注记的指针从 ADR-0006 改指 10-reference。

architecture.md 附录整段挪出去:V3 史实 + 旧 16 模块挪移地图搬到新 [`ADR-0006`](docs/02-adr/0006-能力模块收为五个与V3史实.md)(决策 / 为什么 / 挪移地图);附录导航表删(导读已覆盖),architecture.md 止于 §3 留白。导读、DESIGN、AGENTS V3 注记改指 ADR-0006 + `docs/02-adr/`。

architecture.md §2 清瘦:每模块删「关键取舍」段(①-⑤)与 ③ 的分工 / 维护两张对照表,§2 各模块只留「是什么」+ 06-module 指针;关键取舍 + 三层分工 / 维护对照表搬到 `docs/06-module/`(③ 系统提示词与渐进加载页承接对照表,①② 补 §2-only 取舍:排期单槽 / metrics schema_version=2 / 远端 provider 统一路由 / 两条通道边界 / 账本 worktree 不动)。附录 V3 史实压成两行、对照表行改指 06-module。AGENTS / standard-README 的「对照表在 §2 ④」「§3 模块 4」指针改指 `docs/06-module/系统提示词与渐进加载`。导读与 §1 引子同步:§2 现在只写「是什么」,关键取舍在 06-module。

开 `docs/06-module/` 五页(关键信息维护 / 会话与执行 / 系统提示词与渐进加载 / 技能与蒸馏 / 桌面壳):每页一模块的实现心智模型 + 主要矛盾 / 取舍,指向 §2 设计层、代码用 `codegraph` 探索。architecture.md §2 各模块末尾加 06-module 指针、附录加一行。

清瘦 `docs/architecture.md` §3:删每模块「代码 / 数据 / 依赖 / 没建」实现细节块(①-⑤ + 二级特性健康推导)与「该删」清单;§3 收为「实现架构」——三 crate 切分 + 运行时数据流 + 留白。§2 各模块「代码/数据/没建见 §3 X」指针、导读、附录指针表、V3 史实依赖行、挪移地图、AGENTS / CONTEXT / DESIGN / 03-guide 填写规范 交叉引用同步(实现细节落点改指 `codegraph` 探索 + `docs/06-module/`)。CONTEXT / DESIGN 顺手把「6 个能力模块」订正为 5。

`docs/architecture.md` 正本重构(本趟 cherry-pick 落地):正文重排为 **§1 用例与旅程 → §2 特性(设计层) → §3 实现(代码层)**;能力模块六个收为五个——①「正本读写」改名「关键信息维护」并扩范围(正本分两类:活态数据正本 issue 标签+`.bw/` / 人持文档正本,后者 Workbench 代码不读写、靠 asset-audit 盘),②「健康推导」降为 ① 下二级特性(密封 `DerivedHealth` 守「没数据不装绿」铁律不变,代码不删只降结构层级),原 ③-⑥ 顺位前移为 ②-⑤;§2 特性层去实现化(只留是什么+关键取舍);§1 用例表分一级(独立节律触发)/二级(子步或派生读视图)并按一级重排。asset-audit 剧本 5→6 步(插「盘全仓人持文档正本」);`bw-assets.md` 顶部加边界指针。同步 AGENTS / CONTEXT / DESIGN / hifi / 03-guide 交叉引用(§号+模块名)。

加 `docs/06-module/` 层(单个模块实现的心智模型:设计面对的主要矛盾/取舍,不纠结实现细节),三层边界写进 AGENTS「人怎么驾驭」可见物表与 `01-document-organization`:architecture.md = 整体用户旅程+逻辑模块(不进模块实现细节) / docs/06-module = 模块实现心智 / docs/05-features = 用户价值特性。architecture.md §3 的实现细节后续搬进 06-module(单独一趟)。

计划屏卡片右上那枚平台徽本来写死成 `CodeHub`,于是接 GitHub 的项目打开计划屏,58 张卡全被标成 CodeHub —— 界面在说一件不是事实的事。新建 issue 弹窗那句「创建后同步到 codehub」同病。改法跟 `browse_base` / `mr_url_prefix` / `issue_url_prefix` 同一族:provider → 显示口径的映射只放一处(新增 `Project::remote_brand()`),认不出平台就不画那枚徽、弹窗也只说「同步到远端」—— 空着是实话,顶一个别人的名字不是。

GitHub 和 codehub 两条远端线拆干净:**一个基类,两个派生**。基类 `RemoteProvider` 描述「一个远端仓能干什么」,接口里一个平台名都没有;`GithubRemote`(走 `gh`)、`CodehubRemote`(走 `codehub-cli`)、`MockRemote`(替身)是三个各自独立的实现。调用方经门面 `Remote` 拿到基类对象,只调方法,不知道背后是哪一个。

拆之前两条线是缠着的:`codehub.rs` 反过来引用 `github::PrOpened`;分支名 `bw/issue-<n>`、`git remote get-url origin` 这些跟平台没关系的东西住在 `github.rs` 里,于是半个仓为了拿一个分支名要 `use bw_engine::github`;走势、接入流、clone 三处调用方自己写 `if github { … } else { … }`,同一段按周分桶的数学抄了两遍。这就是上一条那个字段名 bug 能活下来的土壤——改一边没人拦,两边的差异也没人守。

现在的隔离前两道是编译器管的,不靠自觉:两臂改成 `remote` 的**私有子模块**(`bw_engine::github::…` 这条路径不再存在,外面绕不过基类);基类的 `RemoteError` 不再内嵌两个平台各自的错误类型,两臂各自把自家错误翻成中立形状。第三道是新门禁 `scripts/guard-remote-isolation.sh`:`github.rs` 里不许出现 codehub,反之亦然(注释里提对方允许——解释「为什么这里跟对面不一样」正是该写的注释)。

顺带收掉的重复:走势时序改成两臂各自回 `Capped<T>`(原文时刻 + 这趟有没有顶到那条 CLI 的上限),分桶数学在 `bw::trend` 里只剩一份;`gh` 会截到 1000 条、`codehub-cli -l 0` 不截,这个差异由各臂自报,不再由调用方猜(以前 codehub 那条路径压根没有截断检查)。接入流的列仓/探仓/读名片、clone 都改走基类,`RepoSummary` 归一化在各臂里做完。里程碑投影只有 codehub 真投,「不投」成了基类的默认实现,别的臂不写空壳。里程碑那几个方法丢掉了多余的 `path` 参数(调用方传的一直就是自己那个仓)。平台无关的件搬进 `workspace.rs`(分支名、origin 地址读数与 URL 解析)和基类(`PrOpened`、名片路径)。评审提的一条顺手收了:GitHub 那臂 clone 完还会再打一趟 `gh repo view --json isPrivate`,只为拼一个 `GithubRepoRef` 回去,而唯一的调用方拿到就丢 —— 每次接入白花一趟网络往返。那趟调用和那个类型一起删掉,`clone_repo` 改回 `()`,和 codehub 那臂对称。

**没做**:远端 `state` 原文仍不归一化(GitHub 回大写、codehub 回小写),上层还是靠忽略大小写比对 closed 来判;把它收进基类会动上层判读,另议。codehub 那臂这次只有编译期验证——本机没有 `codehub-cli`,读回实跑只在 GitHub 侧做了(issue 列表 58 条、单查带正文、走势两条时序、接入流列仓与读名片,全通)。


修好 GitHub 侧读 issue 的字段名:`gh` 2.98(2026-08-20)起,issue 的 `--json` 白名单里就只剩复数 `assignees`(一个数组)了,而我们一直按单数 `assignee` 去要,gh 直接拒("Unknown JSON field"),所以接 GitHub 的项目一读 issue 列表就整屏失败。改成要 `assignees` 并取数组第一个人当责任人(产品仍是单责任人)。同一处顺带修好写:改责任人原先只 `--add-assignee`,不摘旧人,一个活会挂两个人而读回看的是第一个,表现成「改了没生效」;取消指派原先传 `--remove-assignee **`,gh 把它当成一个不存在的用户名、什么都不做也不报错——静默失效。现在先读回当前指派,再一条命令摘旧人 / 加新人。codehub 那条线不受影响(它是 GitLab 形状,本来就叫 `assignee`)。

创建版本弹窗收窄成一屏。「说明」整块删掉 —— 它是运作活①评论里 `## 版本目标`
的入口,但建版当场基本没人写,一路空到底反而占掉半个弹窗;现在建版一律先落
「（未填写）」,目标由运作活①上的 agent 后补,`CreatePlanVersion` 命令不再带
`note`。底下那条「会建一张…上一发…未发…推荐…」也删了:推荐号本来就预填进版本名
输入框,其余是重复信息。

「划归的 issue」从常驻复选框列表改成一行:标题右边一个 ＋ 图标,点开才展开搜索
框 + 候选列表,选中的以 `#号` 小标签留在那一行、点 ✕ 摘掉。候选范围顺势从「只有
未排期的活」放宽到所有还没收口的活(已在别的版本里的挑进来就是换槽,评论仍记
「自 v0.x 顺延」);这个版本自己的运作活①建版时另起,不进候选。

帮助收成右下角一个能拖的小窗。屏幕右缘那两条竖排文字标签(「指南」「上报问题」)撤掉——竖排中文贴边是网页客服贴片的做法,两个并列还逼人先决定「我要指南还是要上报」,而人这时候只知道自己卡住了。入口收成一个:侧栏底部一颗「帮助」,和「设置」并排。点开在**右下角**浮起一个 380px 的独立小窗(帮助窗都在那儿),**按住深色头能拖到任何地方**:深色头 + 压在它下缘的**本机环境卡**(一颗灯 + 「本机环境就绪」或「n 项工具没找到」,底下把没找到的工具名字念出来,不用再去设置屏找一遍——数据就是项目墙那份工具探活)、一行「上报问题」、指南前四章,底部三个页签(主页 / 指南 / 上报)。指南页是搜索框 + 全部章节;上报页把原来居中弹窗那一套收进面板,并且**一件事只说一遍**(原先「会附上对照日志」在正文、提示条、勾选项说明里写了三遍),分「本机有 bw.log」和「本机还没有」两种实话。

指南目录**从指南 HTML 自己的侧栏扫出来**,不在 Rust 里再抄一份会飘的表;点哪一章,右侧宽抽屉就翻到哪一章(`GuideNav::open(chapter)` 一直收着章节 id 却从来没用,抽屉永远从第一章渲染——注入的是指南自己的换屏函数,且只认目录里真有的 id)。小窗负责找、抽屉负责读:一份带自己侧栏的完整产品指南塞不进 380px。八屏各有深链,帮助也补上一条 `BW_HELP=home|guide|report`。上报时本机没有 `bw.log` 就不再声称要附:遮罩文案原先只看勾没勾,会转着「日志上传中」而其实什么都没传,现在按「勾了且文件在」决定。规格与操作逻辑在 `docs/05-features/help-hub/`。

下拉框不再是系统自带那身外观。配置屏的开工工具、计划屏的版本筛选、issue 列表的两个筛选、总览与各弹窗里的下拉,原先都直接露出 macOS 那颗上下箭头方块(Windows 上是另一种方块),和旁边发丝线描边的输入框、按钮排在一起像块没擦掉的东西。设计系统的 `.input` 加了 `select` 分支:`appearance: none` 去掉平台外观,换成本系统那支折线箭头(新 token `--select-caret`,两套配色各给一份,因为 SVG data URI 读不到 CSS 变量)。顺带补 `.input:disabled`——去掉平台外观也会一起去掉它自带的置灰。示例页 `components/forms.html` 补两个下拉(常态 + 停用),spec 双语的组件对照表跟着改。

知识库预览按文件类型分渲染。`.bw/*.toml` 三份规范件先前和 Markdown 走同一条
CommonMark 渲染:开头那几行 `# 说明` 被当成一级标题放成 28px 大字、值里的下划线
变成斜体、空行被并成段落 —— 人看到的是一份被重排过的假文件。现在只有 `.md`
走渲染,其余原样进等宽块。

## 最近 · 2026-09-07

计划屏按钮按视图常驻:全部 issue 只有创建 / 删除版本(删除不灰,没未发号时弹窗下拉是空的);某个版本只有出包 / 发版本,只灰不藏。出包看有没有 tag——有就新建 `.bw/worktrees/pack-<号>` 检出 tag 再出,主检出不动;在研且没 tag 就先快进工作区再出;既不是在研也没 tag 则灰。发版本只给在研且还没 tag 的号,发过就灰,没有已完成的活也能发。群消息收成一行 `【发版 <号>】说明`。

版本身份只认 `bw:plan:`。创建 / 删除 / 改名先改标签,同名里程碑只补充,失败不回滚。计划屏「创建版本」会落一张运作活①「更新指标 + 制定版本计划 <名>」,说明写成 `## 版本目标`,划归写成 `## 本周纳入`;有开着的光杆①就复用。下拉 / 筛卡 / 发版查重只扫标签。在研不再看里程碑起止:开着的带号①取最后创建,都关了则取还没发版的已关①。

## 最近 · 2026-09-07

高保真驾驶地图(`docs/hifi/home.html`)三处设计修订:01 项目管理里「版本切片」从一行小 chips 升为独立深色面板——V0.1 / V0.2 / V0.3 版本轨道,当前片内含 feature / bug / chaos,把「切片包含种类」的层级画出来;02 执行核心 harness 副标改「各类任务运行时」;SDLC 直线阶段(plan→Design→build→test)改成六阶段闭环(计划→设计→构建→测试→发布→运维→回计划),环心点「人守判断」,与 [`docs/10-reference/ai-native-sdlc-playbook.md`](docs/10-reference/ai-native-sdlc-playbook.md) 的环一致。

壳接上 Builder 设计系统(`docs/04-design-system/`):全局样式改成编译期拼入设计系统的 `styles.css` + 壳层 `assets/shell.css`(只写壳骨架与各屏版式,取值一律 token),旧 `assets/hifi.css` 与旧 token(`--clay` / `--ink-*` / `--paper`……)整体删掉,不留兼容层。根节点挂 Claude 配色与中文排版层。八屏标记全换设计系统组件类:按钮四种(每视图一颗实底主按钮,取消 / 关闭安静)、标签 `tag-*`、状态点一色一态、表单 `field` / `input`、卡片发丝线无阴影且不套卡片、项目轨是标准侧栏、顶栏 44px、页签 `tabs` / 分段 `seg`(隐藏 radio 驱动)、列表 `list-row`、看板 `board`(列不再按状态铺底色)、弹窗 `dialog`、回执 toast 改深色底角条(仍点「关闭」才走)。屏里带色号 / 字号的行内 style 清零,只留数据驱动的值。衬线标题改系统字体。高保真 `docs/hifi/` 降为版式与旅程原型,顶部加历史横幅。记录在 `docs/05-features/design-system-wiring/`。

同日第二轮,对齐 Codex 桌面版的设置文法(实开 Codex 逐页看过 22 张设置页):设计系统新增页标题(`page-head`)、小节(`section`)、设置分组与行(`set-group` / `set-row`:左边标题 + 一句说明,右边行尾一个控件)、开关(`toggle`)、预览选卡(`choice`)、路径(`path`),示例页 `components/settings.html`,spec 双语加「设置文法」一节。设置屏按它重排成目录 / Orca / 配色 / 工具探活四节;配置屏两块从表格改成设置行(开工工具下拉 + 保存在行尾,技能列表标题 + 一句话 + 来源标签 + 用过几次);接入、项目墙换成页标题 + 一句说明。新增本机设置「配色」:`settings.toml` 的 `theme`(`claude` 默认 / `apple`),命令 `SetTheme`、事件 `ThemeChanged`,根节点 `data-theme` 跟着切;两张预览卡各自挂 `data-theme`,所以每张显示自己那套 token。没采 Codex 的黑主按钮、15px 字、64px 行、药丸页签——与规范「密而精确」和「一个强调色给主动作」相冲。发起人看过样张后再补两刀:所有屏的内容列**整体居中**(Codex 那种,列限宽、左右等距;会话屏全屏例外),配置屏加页标题,知识库整屏改成同一套文法(页标题 + 一句说明 + 页级动作;文档树改成小节 + 分组行,资产五块改成小节 + 分组,代码图两块同样)。再一刀:**顶栏删掉、图标轨并进侧栏**——屏名在侧栏当前项上、页标题在各屏页头里,顶栏是同一个词写两遍;「刷新」进项目墙 / 设置 / 总览页头与计划工具条,项目墙环境条的「测一下」(同一条刷新)删掉,顶栏那个数据目录标签删掉(设置屏有)。侧栏收成一条 172px 的紧凑栏:品牌 → 项目内「‹ 项目墙 / 项目头 / 五入口」或顶层「项目墙」→ 底部「设置」。

## 最近 · 2026-09-04

运作节律迁到 Orca。纳入 / 打开项目时在现有 `ensure_repo` 成功后注入三条自动化(默认关,已有不覆盖):定版本计划周一 09:00(常驻树 `bw/week-plan`,每周新会话)、资产盘点周五 15:00(`bw/ops-audit`,每周新会话)、B 类日采每天 20:00(`bw/ledger`,复用会话)。仓已经在 Orca 里也要补打,不能只凭 `repo.show` 成功就跳过。纳入后直接进项目也会再试;没打上写明退回项目墙再点进来。删掉 Workbench 60 秒 tick、日采闹钟、「开始本版本」横幅。打开 / 立即采集 / 手填仍走 `collect.rs`。自动化钉本机主机(`destination=self`),Web 里 Orca Server 那份不能跑本地树。配置屏去掉探活 / 定时 / 规范件三块(探活仍在项目墙和设置)。

右侧「Issue」改成「上报问题」。弹窗写明会把本机对照日志带到 issue 里，默认勾选「附加对照日志」，取消勾选就只建单不附文件。主按钮是「发送报告」，成功 toast 写「问题已上报」。

验包拉起的那只壳单独用临时树里的 WebView2 用户目录（`WEBVIEW2_USER_DATA_FOLDER`），不再和正在用的 `bw-dev` 抢 `%LOCALAPPDATA%\bw-dev`。

发版本弹窗里的说明除了写进远端 Release，也会接到 WeLink 群消息后面（`【发版】发版 <号>` 下一行）；空说明仍只发那一行。

指标采集单个脚本超时从 90 秒改成 900 秒。条与条仍串行；超时仍按「没采到」算，不写 0。

## 最近 · 2026-09-03

总览改成项目健康看板(#36):名片旁一颗健康灯、北极星并排;版本计划与进展带页签(目标 / 周进展各 6 行);滞后与引领按 `feature` 分页签、按 `leads` 叠到同一张图(空则挂该页签第一条滞后),图例可勾选,周/天可切;项目指标 · SDLC 只画现行三条真数。定义字段进 `.bw/metrics.toml`。原型 `docs/hifi/overview-36.html`,规格 `docs/05-features/overview-health-36/`。周五资产盘点多一步:在该版本运作活①上追加 `## 每周进展`;总览右栏从同一条评论现算。② 开工也注入 `week-plan-comment.md`。总览折线业务/SDLC 同一套(从 0 起的纵轴、悬停读数、固定高度);页签默认「主要」;A 类引领按天也能出点。采集模板脚本认 `--granularity week|day`,跟 `metrics.md` 对齐。运作活②建出来的说明跟上收口每周进展。

计划屏:进行中 ↔ 待评审可以人拖(打回只改标签、不开工;无绑定 MR 进待评审要确认)。人可以从待办 / 进行中 / 待评审 / 阻塞 / 未排期拖到完成——有开着的 MR 确认后合入,没有则确认只关 issue;「完成永远由人点」仍守,自动化不得推到 Done。非法松手弹窗说明不给拖,不再静默弹回。Orca 干完靠提示词自己把标签改成 `bw:status:inreview`,不因有 MR 自动推态。

点进项目只拉这一个仓的名单和 extras,不再顺手刷墙上其他仓。还在项目墙才拉全墙。对照日志补齐点卡到第一屏的分段:`open start` / Orca peek / 每枪 `codehub-cli` / gather extras / `open first-screen` / `pr fill`。

技能写作正本落到 `standard/skills/SKILL-MD-SPEC.md`(frontmatter + 8 节,SOP=第 4 节)。五份现行剧本按规范、第一层目标和现行内核删掉重写:指标/版本/纳入人定,不再代写打分或四段 gate。`mr-review` 未动。盘点走每周两步(对照 `bw-assets.md`);校验脚本按技能目录找;版本块不再复述打标字面。SYSTEM 收成三块——项目入口只点 `AGENTS.md`;按任务点名加载 reference(① metrics + week-plan-comment;② bw-assets + build);纪律三条。`standard/VERSION` 已删。

每个远端里程碑都是一个版本，名字不设限。计划屏下拉只列版本，「· 本周」跟总览在研走。总览只读行只展示在研；编辑表单永远有下拉，选项是覆盖今天的里程碑；覆盖集变了自动切，不写仓。产品忽略 `bw:week:`（不读不写、不批量改远端）。`project.toml` 的 `current_version` 丢掉不展示，多一行不报错。运作活②建出来时挂当时的在研。

出包弹窗可关着继续跑，按钮上三个点再点回来；停止再问一句，确认后杀进程并清这次的中间件。验包不过时行上有「详情」，点开看每条用例过了没有、报了什么错。出包读脚本 stdout 按行切字节：协议行必须 UTF-8，cargo / ISCC 漏出来的本机码页不再整段报「stream did not contain valid UTF-8」。

## 最近 · 2026-09-02

资产盘点收成两步:盘 Workbench 给项目的 `.bw/`(清残留、升格式、点未闭环的环),再盘项目本周改动(建议只落评论)。现行 `.bw` 契约进 `standard/system-prompt/references/bw-assets.md`(格式 + 样例,后附变更纪要),skill 只当 SOP。运作活开工工具跟构建。主提示词 / reference / skill 分工与同步对照表在 [`docs/architecture.md`](docs/architecture.md) §3 模块 4,`AGENTS.md`「三层模型」指到那里。删掉没有调用方的 `standard/VERSION`;`standard/README` 只记现行结构,不叠 5.x 流水。

计划屏版本视图左侧单独一颗「出包」，两行弹窗吃 JSONL（出包黄转圈 / 绿+打开目录 / 红+原话；验包等出包过了再转，结束写成功数/总数，相等黑不等红）。不打标签。「发版本」仍只建远端 Release / 打发版标签。

验包缝：`BW_CDP_PORT` 是纯数字才把 WebView2 调试口拼进现有 browser args，没设与今天一样。设置 / 接入深链成功打对照日志 `[BW_VIEW] settings|onboard`。出包入口 `.bw/release/pack/pack.cmd`，验包入口 `.bw/release/e2e/e2e.cmd`（只认 `.cmd`）。E2E 只记项目功能（设置 / 接入等）；包在不在、静默装、卸载是出包校验和清理。

规范 5.13:工作台不写被管仓主检出。方案正本在 [`docs/architecture.md`](docs/architecture.md) §3 模块 3「项目约定」;词表在 [`CONTEXT.md`](CONTEXT.md)。仓里只留两辆常驻车——项目约定(`.bw/project.toml`,分支 `bw/project`)和指标(定义走运作活①、读数走 `bw/ledger`)。开工工具跟人走本机 `settings.toml`;类别→workflow 和周五盘点只认产品默认,残留 `issue-policy` 不再驱动任何行为。不再铺、不再写、产品不再读 `.bw/issue-policy.toml`;周盘点整份删掉。规范铺底与「编辑项目名片」收成「项目约定」。接入跳过只认 HEAD 或开着的约定活,不把主检出脏文件当已接入。拉主干不再 restore/删主检出名片。叠着的「编辑项目名片」横幅删掉。`.bw/worktrees/` 的忽略写在约定树上的 `.bw/.gitignore`。

## 最近 · 2026-09-02

**全仓文档分层重组**:`01-principles/` 与 `05-features/`(原 `changes/`)从仓根迁入 `docs/`,与既有 docs 子目录统一编号——`docs/01-principles/`、`docs/02-adr/`、`docs/03-guide/`、`docs/04-design-system/`、`docs/05-features/`、`docs/10-reference/`。`docs/01-architecture.md` 去编号为 `docs/architecture.md`(docs 内设计正本,同根 README/CHANGELOG 之不编号例外)。仓根只剩入口件(README/AGENTS/CLAUDE/CONTEXT)+ 惯例置根件(DESIGN 指针/CHANGELOG),其余知识目录一律落 `docs/`——这条「落点铁律」写进 [`docs/01-principles/01`](docs/01-principles/01-document-organization.md) §6.1。全仓相对引用重定基(含 `.claude/skills/`、`standard/vendor/`、`.github/workflows/`),markdown 链接检查器 258 链零新断链。cargo check/clippy/fmt + 5 个 guard 全绿。**取舍**:principles 从「入口件」降为 docs 内编号知识目录(它慢变但不是「建立初始心智」的骨架);architecture 不编号是为保它作 docs 设计正本的特殊地位。

## 最近 · 2026-09-01

规范铺底 v5.12:名片只留 `.bw/project.toml`,不再铺/改 `PROJECT.md`。开工约定不再写 `[[tool]]`(工具是编译进 Workbench 的)。不再写 `.bw/standard.toml` / `.bw/managed.toml`。`issue-policy.toml` 文件头留三行注释。仓里已有名片或开着铺底活就不再铺;铺底没合入时总览常驻横幅。旧仓里的版本账/指纹账/重复名片由每周资产盘点删掉,接入不覆盖人手改过的 mapping。配置屏保存映射只改 `[[mapping]]`,不把旧 `[[tool]]` / `[review]` / `[kanban]` 写回去。

计划版本、自建版本、发版号收成同一个 `v0.x`(规范 5.11)。排期只打 `bw:plan:v0.x`,不再写 `bw:week:*`。运作活①标题改为「更新指标 + 制定版本计划」,本周版本在会话里确认。对人说版本目标;计划屏版本视图左上角笔改未发的号。计划屏默认就是全部 issue(创建/删除版本 + 全部活);不再用本周空过滤冒充全部。项目墙 / 状态补丁的五段计数跟总览一样,认本周运作活①确认的那个 `v0.x`。旧周版本(`bw:week:`)和旧计划名(`bw:plan:MVP收尾` 这类)读回仍显示,下拉能切。排期不再新写周标签;删、发、改名只对未发的 `v0.x`。

右侧「指南」下面加了「Issue」。点开填标题,提交后中间转圈「日志上传中」,把本机对照日志报到当前目录 git 的 workbench 仓(`codehub-cli issue create --attachment`)。成功走底栏 toast「issue上报成功」。不是报到打开着的被管项目。

对照日志收成一份 `bw.log`。`cargo run` 写到启动目录,直接跑 exe 写到项目目录(仓根或安装目录),`BW_LOG` 可改路径。一行是 `[时间] [模块] [文件] [行] [ok|err|warn] 正文`。命令进出、toast、gather 警告、Orca 每条 RPC 都进这份;不再另写 `%TEMP%/bw-orca.log`。不写 token / pairing / 提示词正文。E2E 标签(`[BW_OPEN]` 等)留在正文里。

post-sync 代码评审收口 4 处:5.10 版本账回正(5.10 实为运作活①周计划抬档、`0d586ce`;评审三件套落进已有 5.10、未编进二进制,不再记「5.9→5.10」);架构模块4「走同一条注入链」改述为「设计走、尚未编进/派发」(与模块7「请评审」口径一致);`orca.rs` 补回 `cursor_agent_cannot_ensure_claude_can` 丢的 `#[test]`(死函数转活,绿测现在真跑它);CHANGELOG 第 29 行「buddy 目录」→「Workbench 目录」(代码早已是 Workbench)。

## 最近 · 2026-08-31

**Builder 设计系统落仓**:Claude Design 项目「builder」的设计系统转成仓内规范资产 `docs/04-design-system/`(唯一样式表 + 机读 theme.json + 双语 spec + 14 张纯 HTML 示例页 + 参考照片),画布机器件(_ds_bundle.js/support.js/Canvas.dc.html/缩略图/manifest/oxlint 配置)全部剥离,templates/ 留在设计项目。readme→spec 改名避大小写撞名;README 记来源、剥离清单与双向演进剧本(DesignSync 拉回 / /design-sync 回推)。未接线到壳,hifi 仍是九屏视觉正本。

Cursor 开工 `agentArgs` 改回和 Claude 同一套:一条单行、值用 `shell_quote_single`(`--force --trust '<系统提示词>'`)。不再为 cmd 另拼双引号 / `--workspace`。create 前仍写 cursor-agent 认的 `.workspace-trusted`。标题+正文仍走 auto-submit。

计划屏拖拽 / 详情改状态:写远端成功后只改内存里这一张卡,不再全量拉 issue 名单。等待时中间转圈「issue 状态切换中」。写失败卡停在原列。开工 / 合入 / 建活 / 刷新仍全量重采。

运作活开工工具读被管仓 `.bw/issue-policy.toml` 的运维行(`category = "ops"`),不再写死 `claude_cli`。workflow 仍按标题推断,不打五阶段类别。配置 Cursor 要改运维那一行。

计划屏 Start / 总览「开始本周」撤遮罩挂上嵌页后,按 Open 同一条等 iframe onload(再短等配对)再 `worktree.activate`。遮罩期间不挂 iframe,开工里那次切树嵌页听不见。

点项目墙进项目:第一屏不再等每张活串行查 MR。名单、周目标、发版、健康、环境条并行拉齐就切页;MR 号后台最多 8 路回填。已完成的活直接查已合入,不再先打一遍 opened。

打开 / 接入项目先问 Orca `repo.show`。仓已在就不盖「正在让 Orca 认得这个仓」遮罩、不再 `repo.add`。`orca_repos_ready` 只是同进程连点加速,不落盘。Orca 没开仍不挡进项目。总览「开始本周」/ 计划屏 Start:点下去先立遮罩再切会话,busy 期间不挂 Orca iframe(嵌页是原生层,后到的 HTML 遮罩盖不住)。遮罩跟开工命令结束就撤,不等后面 gather;「开始本周」仍比 Start 多一段建运作活①。

## 最近 · 2026-08-29

Claude 开工把系统提示词压成单行 `--append-system-prompt`,标题+正文改成同一条启动命令的位置参数,不再靠句柄回来之后的 `auto-submit`。同一条命令补上 `--dangerously-skip-permissions` 和 `--disallowedTools 'Bash(gh pr merge)'`(原先只在 PTY `LaunchPlan` 里,Orca 漏了)。句柄超时后先停 5 秒再收 session id / 切树,对照日志打 `handle_timeout: wait` / `settle done`、`yolo=` 和 jsonl 前后有没有落下。Cursor 仍把 system 拼进 Orca `prompt`。

开工对照日志(stderr + `%TEMP%/bw-orca.log`,`BW_ORCA_LOG` 可改路径):是否跳过 create、句柄超时还是 ok、prompt/system/agentArgs 字数与换行数。不写 token / pairing / 提示词正文。两台机器各开一张活,把这份文件对一下就能看出差在哪一刀。

开工那几秒盖遮罩挡住嵌页。被管仓只在纳入和打开项目时 `repo.add` 进 Orca(这个进程里登过不再打),不跟开工 / 去会话绑。人不去 Orca 里手导 `workspaces/xx`。Orca 没开不推翻接入。

开工刚 `git worktree add` 完、create 之前再写一次 `worktreeBasePath`(回写已有值,误写成 `.bw/worktrees` 的清掉),刷掉 Orca 30s 扫描缓存。不刷会 `selector_not_found`。不把扫描根改成 Workbench 目录,否则 Orca 把新树当自己的工作区、开空窗、提示词灌不进你看见的那扇。不是再 `repo.add`。

计划屏 Open / 去会话先切到会话屏、等 Orca iframe onload(再短等配对)才 `worktree.activate`;没配对 URL 仍切树。连点只跟最后一张。不 ensure、不按当前全局工具 create。

创建版本:开始/结束必填(红星)。开始晚于结束日期框飘红、不能点创建。空日期不再传给 codehub(先前会回 `Failed to create milestone`)。

计划/版本收成一件事:周版本就是每周一按 ISO 周号固定出现的那个版本,人起名的版本是同一槽位,一张活只挂一个。先前文档写成「周与自定义版本互斥两套」,壳在版本视图里新建活会把本周和当前版本两套标签都打上,详情先显示本周再跳回。创建路径只写当前正在看的那个版本;内核两个都传来时丢掉周、只留版本。

待评审→完成:没有开着的 MR 时弹确认,确认后只关 issue(人可能已经在网页合过)。详情链接查出已合入的 MR,不再只认开着的。

计划屏周目标默认收成两行,右下角展开框打开整段,再点收起。

计划屏周计划/版本看板拖拽认十条:待办→进行中/拒绝/阻塞,进行中→阻塞/拒绝/待办,待评审→完成/拒绝,阻塞→进行中/拒绝。松手认当前子标题。详情加状态下拉,只列从当前状态能走到的那几条,和拖拽走同一条命令——列表用户不拖也能改。作废/阻塞仍要写原因。待办拖到「完成」仍不让过。

Open / 去会话只 `worktree.activate`,不再 `ensureAgentSession`(那条是 `--resume` 再开一扇 TUI)。`createAgentSession` 若回「Timed out waiting for terminal handle after creation」,渲染进程已经把窗拉起来了,当成功,再切树让配对网页跟上。▶开工已有会话也只切树。

会话屏嵌 Orca 走 iframe(和 Open Design 同路):新版 Orca SPA boot 调 `crypto.randomUUID()` 要 Secure Context,Windows 主 WebView 用 `with_windows_browser_args` 把 `http://dioxus.index.html` 当 secure + 关 `LocalNetworkAccessChecks`。开工走本地 pipe;`createAgentSession` 的 `clientOperationId` 用 Orca 规定形状(13 位毫秒-32 hex,误填 RPC 帧 id 会被 `agent_session_operation_invalid` 拒),Cursor 预设名是 `cursor`(不是 `cursor-agent`)。去会话先认会话记下的树(`resolve_issue_worktree`),不 `provision` 第二棵;只 `worktree.activate`,不 ensure。`#pairing=` 搬成 `?pairing=`(只搬家不 mint code);Orca 网页地址存本机 `settings.toml`(带 token 不进仓/Event/日志,`BW_ORCA_WEB_URL` 可覆盖);create/ensure 失败把 error code 露进 `IssueRan.summary` 与 stderr(不带 token)。修 `request_id` debug 下 `u64` 溢出→`wrapping_mul`;会话屏去掉 1600px 上限。

计划屏详情:点 Start / Open / 阻塞 / Cancel / Complete 后弹窗自动关。待评审 / 已完成 / 已取消也有 Open(去会话,不改状态)。业务活显示已有类别(不再误锁成「运作」),计划和负责人同一行。Start 建 worktree 时可改/补类别,没选不能开工。删除自定义版本走真命令 `DeletePlanVersion`:摘 `bw:plan:<name>` + 删同名里程碑,不碰 `bw:week`(周格式标题拒收);弹窗不再用 `ScheduleIssue { week_of: None }` 清周排期。

通知模块整改(#18):群通知从自由字符串重做成固定枚举事件注册表 `NotifyEvent`(本周版本计划 / 新建活纳入本周 / PR 合入 / 发版 / 周报)。`review`(进评审)移除。删通知页签整片(`screens/notify/`、`Panel::Notify`、`BW_PANEL=notify` 深链等全清)。决策见 `docs/02-adr/0003-通知模块整改-事件注册表与删页签.md`(原误编成 ADR-0002;导航快路径仍是 ADR-0002,别混)。

门禁收口:补三个冒烟示例(`merge_smoke` / `submit_smoke` / `real_demo_v4`)漏掉的 `CreateIssue.plan` 字段(#23 后漏,`cargo test` 编不过),`onboard_smoke` 去掉一个无用 `mut`;`plan.rs::looks_like_week` 的 `as_bytes().len()` 改 `len()`;`list_view.rs` 去掉被 `Cancelled` 盖住后不可达的 `_ => "dash"`。fmt / clippy / test(除 app-shell)/ 其余 guard 全绿。**仍红一项**:`guard-file-lines`——`bw-engine/codehub.rs` 1580 行(本分支加 42 行;`origin/master` 已 1538 超 1500),拆分留后续单独会话,不在本次收口 scope。

## 最近 · 2026-08-28

会话屏改嵌 Orca(仍在 `pierce/orca-session`)。人改口:会话屏只留 Orca / Open Design 两个组件,动作条和灌词条不要(开工在计划屏拖进进行中;停止/MR/评审/删会话不在这屏;buddy 不知 Orca 里当前哪条会话)。pipe 开工与 iframe 配对是两件事。先用安装版 Orca 验,web 地址用进程环境 `BW_ORCA_WEB_URL`,不建设置页。同一张活再开工接回上一场(从本机 Claude jsonl 收 session id,不编)。启动时设 `BW_ORCA_WEB_URL` 会话屏就能接到网页地址(不再先要求 pipe 连上)。

计划屏操作卡顿(#16):纯导航(切周 / 点总览 / 选卡片看详情 / 切页签 / 展开目录 / 后台采回发)走快路径,复用上次 gather、不重跑 git 子进程 / 远端 / OD 探活;真命令、换项目、刷新、`SelectSession` 仍走全量。`build()` 拆成 `gather`(贵、数据变更时跑)+ `assemble`(便宜、每次跑)。顺带去掉三处重复:`probe_env` 每重建跑两遍 → 探一次;打开项目 `app.issues` 拉两遍 → 拉一次;`build_ops` 的 `git::path_in_head` 跑两遍 → 算一次传参。决策见 [`docs/02-adr/0002`](docs/02-adr/0002-导航快路径-gather缓存.md),是 [ADR 0001](docs/02-adr/0001-codehub-issue-正本-本地零库.md)「优化(本地只读缓存、失效策略)留后续」那条的落地。

## 最近 · 2026-08-28(#23 源码同步)

**新增/优化** · 按 `docs/hifi/plan-23.html`(定稿高保真)把计划页整改落到源码,跨 bw + bw-engine + app-shell 三 crate。看板七列合并为四列(待办/进行中/待处理/已完成),两段列加子标题 tab(默认显示第一段,点切第二段);卡面重做(编号 + CodeHub 徽 + 标题 + 正文预览 + 计划位置 + 责任人头像 + 更新时间),删卡面开工按钮(入口移详情弹窗);详情从右侧抽屉改屏幕居中弹窗,字段精简(留标题/正文/链接/类别/计划/负责人,删 状态/工具/workflow/种类/来源/版本/指标/结清/分支/蒸馏);新增列表视图(预设 开放/分配我的/我的 + 计划/阶段下拉 + 搜索 + 行操作 schedule/Start/Open/Complete/Cancel);弹窗:新建issue(含负责人)、创建版本、排期(拖未排期→已排期)、Start(只读确认即 RunIssue)。左栏删除,改为右上角下拉视图切换(全部issue/各周/各版本)。

**新概念落内核**:`Issue` 加 `assignee`/`author`/`plan_version` 字段;`RemoteIssue` 透传 assignee/author;新命令 `SetIssueAssignee`/`CreatePlanVersion`/`ScheduleToPlan`/`EditIssue`;`build_board` 七列改四合并列;`CardItemVm` 加 assignee/author/plan_version/updated_at,`ProjectVm` 加 `plan_versions`/`current_user`/`viewing_plan`。

## 最近 · 2026-08-28

**优化** · 计划页独立高保真(`docs/hifi/plan-23.html`)视觉规范对齐 Builder design system(Claude 板)与 ADE 资源视觉调性。配色 token 全量切到 Builder Claude ramp(ivory `#faf9f5` 底 + 赭土 `#d97757` accent + slate `#4c73a5` 次声 + 暖色 status 三元组),衬线标题改系统无衬线栈(weight 600)、`--font-mono` 留给编号/计数。按设计原则整改结构:卡片重阴影改 hairline、看板列走 surface 底且不再嵌套卡片、卡片左色条装饰改 `.status-dot` 语义(todo/progress/review/done/blocked)、方角 chip 改 999px pill(`.tag` + 语义变体)、列表行对齐 `.list-row`(mono 编号左 + meta 右)、弹窗对齐 `.dialog` floating elevation、`:focus-visible` accent 描边、hover 走 ink tint。unicode 字符导航(✓▢⚑☰⚙)换 Lucide SVG(stroke 2,16px),加 `icon()` 帮助器与静态 `data-icon` 注水。JS 数据/状态机/事件逻辑原样保留,仅重写模板与样式块。涉及文件:`docs/hifi/plan-23.html`。

## 最近 · 2026-08-27

出包代码入库:本地 `D:\2026\buddy-setup` 的 `BuildersWorkbench-MVP.iss` + `AFTER-INSTALL-MVP.txt` 落到仓 `packaging/`,成为出包正源。脚本只吃「clone + cargo + 装过 buddy」必然有的东西,不依赖任何仓外暂存目录:装完说明、安装器图标(`crates/app-shell/app.ico`)走相对路径直接取;`bw-dev.exe` 从 `target\release\` 取(cargo 产物);`WebView2Loader.dll` 出包人先拷到 `target\release\`(cargo 落在带 hash 的 build 子目录,不稳);`codehub-cli` 默认从 `%USERPROFILE%\bin\codehub-cli.exe` 取(装 buddy 就有),可用 `BW_CODEHUB_CLI_SRC` 覆盖,没有则告警跳过、不阻断;`OutputDir=output` 落 `packaging\output\`(gitignore)。顺带修出包图标 bug:装完没图标是因 payload 的 `bw-dev.exe` 的 `.rsrc` 段没嵌 RT_ICON。根因在 `crates/app-shell/build.rs`:winres 把图标编进静态库 `libresource.a` 靠 `cargo:rustc-link-lib` 拉,但 GNU 链接器只从静态库拉能解析未定义符号的成员,资源对象没导出符号 → 整个被跳过,图标进不了 exe(只剩 mingw crt 自带的 manifest)。修法:GNU 下 build.rs 编完用 `cargo:rustc-link-arg` 把 `resource.o` 直接喂给链接器(对象文件一定被收入),图标真嵌进去;MSVC 走 rc 不受影响。重编验证 exe 的 `.rsrc` 含 RT_ICON/GROUP_ICON/version/manifest。`AGENTS.md` 顶层目录导览补 `packaging/`、`怎么建/怎么跑` 补出包命令,按可见物规矩记上。顺手修 `crates/bw/src/app/plan.rs` 两处存量 clippy(collapsible-if + cloned-ref-to-slice,master 上 week-plan 引入、挡着 workspace 门禁),让 `cargo clippy --workspace` 回绿。

运作活①剧本:指标要单独对人讲清北极星/滞后/引领再落文件;定计划先问已有 issue 纳入哪些;打完周标签还要挂 codehub 同名里程碑;业务指标不要重复总览已经在画的仓统计。周目标取评论整段展示(旧的一句话不用迁)。待办池里默认就是 Todo 的卡拖进「待办」现在会排期(先前状态相同被当成没动作)。移回待办池摘掉周标签,不再留下空的 `bw:week:`(空后缀过滤抽到 remote,codehub/github/mock 共用)。

## 最近 · 2026-08-27

**独立评审(规范入库,按钮未接)**:评审剧本 `mr-review`、阶段规范 `review`、评审主提示词 `REVIEW.md.tmpl` 和产物链 `docs/05-features/reviewer-agent/` 收进仓(落进已有 5.10,未编进二进制)。GitHub 仓的自动触发放 CI 层(`.github/workflows/claude-code-review.yml`,配好 secret 才生效)。工作台里的「请评审」按钮和独立评审会话**还没接到 Orca 会话屏**;CodeHub 仓要评 MR,等这条接到 Orca 之后。合入仍由人点。

## 2026-08-26

产品命名统一为 Builders' Workbench / Workbench / BW，工程标识保留 bw；废弃 buddy、loop-buddy。README 改产品门面；仓外起手 skill 改名为 `workbench-start`。

## 最近 · 2026-08-26

首次运作活①:`.bw/metrics.toml` 从零起草。北极星本轮**留空**(人要的是「被纳入项目是否又快又好」,MVP 阶段无用户效果数据、手填也无思路,诚实灰,不为点亮硬凑)。一条滞后「纳入管理项目数」(C 类手填)+ 一条引领「每周闭环 issue 数」(A 类,脚本 `.bw/scripts/codehub-closed-issues.py` 真采到=3)。代码仓指标(提交数 / MR 合入数)workbench 平台自记,不重复定义。判定与理由见 `docs/metrics.md`。

规范铺底 v5.9:buddy 自己的 `.bw/project.toml` 镜像 `standard_version` 漏停在 5.0(接入只在新建项目赋一次值,之后铺底从不 bump),而 standard.toml 已到 5.9、两者违约;这次把镜像同步到 5.9。3 个核心件仍 HumanEdited(载项目专属内容),managed.toml 如实记历史不 bump。根因(铺底代码不 bump 镜像字段)另开活修。

Windows 上 `bw-dev.exe` 嵌 `app.ico`(任务栏 / 资源管理器)。编不过只告警,不影响功能和 CI。

编辑项目名片开了 MR 却停在待办池:状态机不许待办池直接进评审中,漏了先跳进行中(规范铺底那条路)。合入仍走看板「评审中→已完成」,不给待办池另开合入口。

合入后「拉到最新」被主检出上未提交的 `.bw/project.toml` 挡住:接入会把名片先写在主检出上。拉之前把这两份预览让开(读数仍挪进账本),再快进;人的源码脏文件不动。

产品指南按 MVP 用户找信息重写:去掉「走过一遍 / 穿刺仓号」过程话,首页和末页加查找表;总览补「编辑项目名片」与顶栏刷新;盘点节律改回周五 09:00;「先记着的缺口」收成「规矩与查找」。

总览名片一次编完:四字段 + 在研版本 + 项目群,一张轻量活「编辑项目名片」+ 一次 MR。配置屏不再改这两项,只留探活和对账。正本仍是 `PROJECT.md` + `project.toml`。

旧格式指标:内核仍拒收 v1、不上屏。运作活① skill 重定指标,借鉴旧脚本、把已有读数迁进新流水、删 V3 废弃件。资产盘点 skill 顺手清 `.bw/` 里 V3 残留(connectors / docs/buddy / .bw/plan 等),走这张活的 MR。

B/C 读数同一天只留一行(再采覆盖);写到固定账本 worktree `bw/ledger`,不脏主检出。顶栏「刷新」先快进打开着的项目再重采——只重拼界面拉不到同事已合入的 `metrics.toml`。

定时默认:B 类日采 20:00;资产盘点周五 09:00;运作活①仍是人点「开始本周」(本周没有这张活/没有周目标才出按钮)。

计划屏左栏「全部」改成「issue总览」，字重和周行同一套，不再像标题。

OD unix socket 探活：`map` 改 `inspect`（设超时不改值）。本机 Windows clippy 编不到这段，CI ubuntu + rustc 1.98 会红。

CI `cargo test --workspace` 补 `--exclude app-shell`，与同文件 clippy 一致：这台 ubuntu 不编壳。本地门禁仍是 `--workspace`。

打 bundle 前的深度 review 收口(五路并行审查:bw 内核 / bw-engine / app-shell / 文档一致性 / 门禁+CI+standard)。基线 CI 全绿,逐条核验后修:

- **铁律**:`github::merge_pr` 补读回 PR state==MERGED 才算成功,与 codehub 臂同构(退出码靠不住,绝不假 Done)。
- **真 bug**:群通知 MR 号恒 0(`issue_from_remote` 的 `pr_number` 是 lossy 字段)。`chat_notify_issue` 加 `known_mr` 参:合入路径传合完的号(MR 已关、现查不到),评审/手动同步传 0 内部现查分支上开着的 MR。
- **mock 注入口**:`merge_and_settle` 改走 `remote_for`(统一工厂),不再直连 `Remote::for_project`。
- **铁律②**:健康推导 `week_counts_many` 失败时 `git_readable` 也落下(原:读不出却判红,该是灰)。
- **自狗食**:Workbench 自己的 `.bw/standard.toml` 抬到 5.8、enabled 收敛到模板默认三类(去掉没模板的 agents/defaults-core/cadence)、补铺 `.bw/issue-policy.toml`、`managed.toml` 加指纹。
- **门禁**:`guard-screen-hooks.sh` 第 34 行自赋值 no-op 改成真清 `#[component]` 标记(兑现注释承诺);`guard-kernel-ui-free.sh` 禁词正则吃 dioxus 全家桶(顶层+子 crate);新增 `guard-codegraph-clean.sh` 挡 codegraph.db 进 feature commit,接进 AGENTS 门禁与 CI。
- **文档对齐**:references「起手两份」改三份(指标铁律/运作活①评论/改仓规则);产品指南与填写规范「观测」改「读数」(V3 残留);`bw/Cargo.toml` 描述去掉「四张表的本机库」;`issue_store.rs` 模块注释「不接线 app 层」改「读写唯一入口」;`standard/README` skills 行补「+workflow 入口」;README「门禁与 CI 完全一致」改实话(app-shell 壳编译/Clippy 因 ubuntu 缺 WebKit/GTK 只本地跑);CI `cargo test` 加 `--workspace --exclude app-shell`(ubuntu 不编壳)。

留口(打 bundle 不冒险,记此后续):
- `push_and_open_mr` / `recent_weeks` 两处仍直连 `Remote::for_project`(mock 注入口,latent——mock 项目无远端,不炸;接 mock 远端测试时再收)。
- `Command::CreateIssue` 的 `origin` 字段签而不收(`origin_for(kind)` 是唯一事实源)——agent 拆出的活显示成「人建」,接上要动 `issue_store::create` + 三调用点,行为变更留待下次。
- `guard-no-cross-screen-import.sh` 只兜 `crate::screens::` 绝对路径,`super::` 相对跨屏靠评审兜底(已加注释)。
- 设置屏工作区输入框:内核规范化路径导致 value≠draft 的边角不同步,次要,改 use_effect 有渲染 panic 风险,留。

## 最近 · 2026-08-25

B/C 读数流水改日历日键,对齐 V3 一天一行,迁过去不亏周内点。每天 09:00 再采一轮(Workbench 开着)。折线仍画四周,一周取最后一天。总览手填卡能记下今天的数。旧流水只有 `week` 没有 `day` 的行不认。仓外起手 `workbench-start` 进仓。本文件按六站收口。OD 开工口径改回跟代码:`POST /api/runs` 灌提示词,不写建项深链。

## 第 0 站 · 接入与规范铺底

- 接入两步:选仓 → 名片。自动建运作活③「规范铺底」,写进自己的 worktree+MR,人的主分支一个字不碰。
- codehub 开着的 issue 为零时 `issue list` 返 null,jq 用 `(. // [])`,否则铺底查幂等键先炸。
- 铺底清单对齐现行五类;仓根 `AGENTS.md` 不预写。合入并完成接上一步一句进度。
- 接入一次铺 `.bw/issue-policy.toml`(开工映射 + 周五盘点节律)。指标空壳和业务脚本不预铺,跟运作活①走。配置屏不再二次铺底。
- 指南第 0 站写成实况:人点完成才合入。

## 第 1 站 · 总览、指标、健康

- 进项目自动采一轮指标和仓统计。北极星 / 滞后 / 引领每张卡固定折线,现值 + 相对上周。
- A 类不存、现算;B/C 进 `.bw/metrics/readings.jsonl`。按日历日存、按日采,展示按周取最后一天。
- C 类总览卡手填今天的数,同一天再记覆盖读回。
- 健康灯只从数据推:周目标从 ops① 评论读,没读到不打勾。
- 本周运作活①做过(含已完成)不再假催「开始本周」。总览不再放「去计划」。
- 项目墙「本周 x/y」与总览五段同口径,作废不进分母。
- 总览 / 知识库发版次数优先读远端 Release。

## 第 2–3 站 · 周计划与看板

- 周目标一句话从 ops① 评论读;挂评先过 `week-planning/check-week-comment.py`。人确认后当场建卡并打本周标签。
- 点某一周只看 `bw:week` 标签;没排周的只在「issue总览」。没有历史回填命令。
- 新建活可选业务活或运作活①②,都能填正文。运作活类别锁「运作」,内核拒改五阶段。
- 拖进进行中 = 开工。卡片和详情都能 ▶开工。没类别的业务活开工会说清楚。
- 作废写原因、打取消标签并关单。读回先认取消,不当完成。
- 周标签在 codehub 上投影同名里程碑,正本仍是标签。GitHub 不投。
- 发版弹窗默认在研号下一位,人可改。切在研号走总览名片编辑。

## 第 4 站 · 会话与干活

- Windows 开工找到 claude;粘贴走系统剪贴板。没 `--resume` id 不自动 `--continue`。
- 开始本周后第一屏不丢;SessionStart hook 收下会话 id。
- 会话能删:停 PTY、收 worktree、删 jsonl;远端 issue 不动。
- 左右栏可收,按钮加大;中栏终端跟着撑。
- 原型走 Open Design:嵌本机首页,`POST /api/runs` 灌系统提示词,不自动开跑。灌失败不假装。开工事件带 `tool` / `embed_url`(OD 这条 `embed_url` 空,壳不改 iframe)。
- 构建默认 workflow `mattpocock-skills` 开机即用;入口把 `/xxx` 写成去读那份文件。
- 右侧「指南」全局都在,打开就是仓里那份产品指南。

## 第 5 站 · 发版

- 先建远端 Release 再打发版标签。绿区强制 `--ref` 默认分支;旗标跟上现行 CLI(`--tag-name` / `--name` / `--description`)。
- 次数读远端 Release,读不到再退本机 git 标签。

## 第 6 站 · 资产盘点

- 周五到点自动建运作活②并开工,最远评审中。错过下次开着补建。
- `project-handbook` 只记遗留,不接首次会话。

## 底座 · 三 crate、规范、仓规

- V3 六 crate 与编译资产已删,全量在 `v3` 分支。crate 去版本号:`bw` / `bw-engine` / bin `bw-dev`。
- `docs/architecture.md` 唯一设计正本。系统提示词外置 + 四份运作剧本。默认 workflow 打包进二进制。
- 驾驭面:人走站和验收;窗口 AI 改代码与文档。仓外起手 `.claude/skills/workbench-start`。
- 知识库代码图在 Windows 上认 `codegraph.cmd`;这个仓没有图时当场 `init`。
- 对外宣讲按穿刺实况收口:正本在仓和代码平台、B 类读数随 MR 上仓、盘点到点建活绝不自动完成。
