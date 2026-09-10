# STATUS · 设置屏收成全局面板

- **状态**:**已实现**(2026-09-08 立项,2026-09-09 按 Claude 现行设置面板重定方向,2026-09-10 十三轮收敛后发起人当场确认设计完成、批准转入实现,同日代码落地)
- **人 gate**:intent + 带原型的 spec,发起人 2026-09-10 会话内口头批准(未走 artifact 裁决评论)。原型两份同源:
  - 在线可点(推荐):<https://claude.ai/code/artifact/3755f5a7-dc72-4019-969f-083d635fbd35>
  - 仓内 [`prototype.html`](prototype.html)(浏览器直开,相对引仓里的 `styles.css` + `shell.css`,样式表改了它跟着变)
- **issue**:无(会话直达)
- **代码**:已实现。`screens/settings/{connector,skills,stage,plugins,assets}.rs` + `bridge/vm_settings.rs`(五张表的 VM 拼装,`gather()` 里算一次、`assemble()` 只克隆)+ `vm.rs` 新增的 Connector/Skills/Stage/Plugins/AI Assets 系列类型;配置屏瘦身、知识库资产页签删重复块。真机验证见下方「验证」。范围以 [`spec.md`](spec.md) 为准;「待裁决」里标注「建议另开一件」的条目(1/3/4/7/8)不在本特性范围内,条目 2 按已定的最小修法(`injectable` 字段,标「注入不了」)落地,条目 5/6 按原型已做的「两节都建、AI Assets 进本轮」执行
- **验证**:`cargo fmt/clippy/check -p app-shell` + 四个 guard 脚本 + `cargo test --workspace` 全绿;`BW_VIEW=settings` 真机跑起来截图确认(见下),左栏五个「能力」计数对得上真实机器状态(Connector 7 / Skills 7 / Stage 5 / Plugins 2 / AI Assets 5)。子页面(Connector/Skills/Stage/Plugins 详情)受当前环境「screencapture 能截图、System Events 点击不生效」限制(与既往 BW computer-use 记录一致),没有逐页点击截图核验,只做了代码审查 + 编译期检查
- **分支**:`claude/codex-plugin-page-management-09c680`
- **目录名**:沿用 `capability-panel`(立项时叫「能力面板」);内容已从「配置屏的一块」长成「整个设置屏」,名字不改以免链接漂

## 制品

| 文件 | 是什么 |
|---|---|
| [`intent.md`](intent.md) | 新闻稿式意图:七条痛点、解决方案、配置屏留什么、飞轮检验、五大拷问、两个开放问题 |
| [`spec.md`](spec.md) | 版式、五页 + 详情页的操作逻辑、着色口径表、connector「供什么」对照表、客户会问、硬核挑战 |
| [`prototype.html`](prototype.html) | 可点原型:左栏搜索、过滤、排序、列表→详情、技能文件浏览(渲染 / 源码) |

## 三轮方向变化(如实记)

1. **9-08 一轮**:发起人看 Codex 插件页,指出 BW 的「工具探活」更像 Claude 的 connectors——指向应用外面、可能不在、需要修法,不是 Codex 那种只有开关的插件。
2. **9-08 二轮**:发起人看 Claude 的 Customize 面板,要求「直接抄」。抄了左栏分组、搜索、过滤、排序、类型列、详情。
3. **9-09 三轮**:发起人给出 Claude **现行**设置面板——**这是全局配置,不绑定项目**,详情是整页「← 返回」不是弹窗。查代码证实 BW 的开工工具映射本来就是全局的(`Settings.tools` 无项目维度,`save_tool_mapping` 丢掉 `project_id`),摆在项目屏里是错的。整件事从「配置屏收一块」改成「设置屏收成全局面板」。

4. **9-09 四轮**:发起人定名——**connector 就是工具的上位词,而且它包含 Orca,别用「工具」当名字**。词表登记 `Connector` 一条(并写明它不是 V3 那份 `.bw/connectors.toml`),「开工工具」保留原义作子集;Orca 从「本机」挪进 Connector 表。查代码顺带确认:Orca 今天**没有探活实现**,只存一条配对地址。

5. **9-09 五轮**:技能改叫 **Skills**、规范改叫 **资产**;界面里的解释性文字一律删掉,换成**状态色条 + 一行计数**。同时补回丢掉的两节——**Workflow**(五个阶段各挂哪条)和**插件**(两个 vendor 库)。发起人明说「我也没想好属于插件还是工作流」,所以原型先按两节做、把这条列成头号待裁决。

6. **9-10 六轮**:五节名全改英文(Plugins / AI Assets);发起人指着「哪类活用哪个执行器」问是不是该给 Executor 单开一页——查下来真问题是**「阶段」被切成了两半**(执行器映射埋在 Connector 底下、workflow 映射自成一节,同样五行同样形状),所以合成一张 **Stage** 表,不新开 Executor 页。Connector 回归纯清单。

7. **9-10 七轮 · 同事评审**:两条新缺口(**AI Coding 资产观测**——wb 带给项目的 vs 项目自己的,connector/skill/agent/workflow;**`standard/` 技能催熟不了**——都是初稿没被优化过)+ 三条界面收敛(状态色块已是解释、别再写字;「没有的」要指向怎么装而不是重复信息;状态过滤没意义、类型过滤和搜索才有效)。原型全部照改;查证发现 **agent 这一类 BW 全仓零实现**,不能在原型里补,列成待裁决。

8. **9-10 八轮 · 发起人两条结构性意见**:①每个项目会基于自己的资产和开发 loop 长出**自己的 workflow**,那才是它要的,而**用户没有通道把它接进来**——查证 `skill_pointer` 三道门全挡,**连带查出一个真 bug:界面显示项目自有技能「用过 N 次」,而开工时根本没注入**;②AI Assets 和知识分层脱节——开工实际读三层(项目 `AGENTS.md` / Workbench references / 活挂的剧本),我只做了中间一层,`.teamai/` 这个成文落点完全没接。原型:AI Assets 改成三层视图 + 缺口块,Skills 的项目自有卡标「注入不了」。**接入通道属内核改动,建议另开一件**。

9. **9-10 九轮**:发起人指着 AI Assets 表说「长篇大论都是在教育用户,而没有真正去链接真实项目的 workflow loop」。两处照改:①删掉「写的是什么」这类描述列,换成**现在哪几张活在用**(拉真实 issue:`build` → #155 #154 #133 #157 #137;metrics / week-plan-comment / bw-assets 现在 0 张);色条从「清单自述」改成 **loop 覆盖**——10 张开着的活里 5 张一份规范都拿不到,逐条列出为什么。②Stage 的 Workflow 列做成下拉、把项目自有的选项列进去并标 ⚠,**把接入缺口摆在它该在的位置**,而不是在文档里写一段。

10. **9-10 十轮**:①上一轮加的诊断表(「哪 5 张活拿不到规范」)被否 —— 那是计划屏 / 总览的事,设置面板不答「你的活哪里没配好」,删表、色条收回资产自身;②`运作活①②` 是黑话,全仓原型 + intent 换成正名(`更新指标与版本计划` / `资产盘点`)。
11. **9-10 十一轮**:发起人截图 Claude Connectors 详情卡 + Skills 列表页(`by Anthropic` 归属行),六条一次改完:①Connector 列表里 `claude` / `GitHub CLI` 两行名字挤着本机路径,挪进详情页(列表只留名字),整行早就能点、补上 hover/focus 反馈让它读起来真像能点的;②AI Assets 的「有活在用/没活在用/未派发」色条 + 状态过滤被否 —— 这些指标对「展示」这个用途没意义,删掉色条、过滤、状态点,只留 Asset / 现在哪几张活在用 / 来自三列;③Connector 列表里 Open Design / Orca / cursor-agent / codehub-cli / welink-cli 五行的「没拿到」原因文字重复了色点已经说的话,删掉,原因留在详情页;④Skills 卡片上的「注入不了」红标删掉(判定还在详情页里,列表不用再喊一遍);⑤Skills 参照 Claude 抄了归属行:Workbench 自建的显示 `by Builders' Workbench`,业界引入的显示原作者(如 `by Matt Pocock`),项目自己仓里写的显示 `Created by you`;⑥sk-week 详情的文件渲染 / 源码预览原来以「……」收尾像是没截全,换成从真实 `week-planning/SKILL.md` 摘的完整段落(核心目标 + 四步标题),不再看着像半成品。
12. **9-10 十二轮**:发起人截图 Claude 插件详情的 Overview / Skills 页签(能直接跳到某个 skill),四条改完:①`design-system-import` 详情里「注入 —— 同上」被指出没意义,改成和 `workbench-start` 一样把真实原因(开工解析只认三个写死的名字)再写一遍,详情页不该靠指别处;②Plugins 列表里 `mohit-pm-claude-skills` 行的「部分 vendor:只挑了指标框架两件」删掉,和 Connector 那轮一个道理;③mattpocock-skills / mohit-pm-claude-skills 两张插件详情比照 Claude 加了 Overview / Skills 页签——Skills 页签是从 vendor 目录真实读出来的名字(**41 个按 engineering 17 / productivity 5 / personal 2 / misc 4 / deprecated 4 / in-progress 9 分组**,此前「带进来」那行只提四类、漏了 deprecated 和 in-progress,这轮顺带改准;mohit 的 2 个也列了真名),但**没做成能点跳转**——不像 Claude 那样点了真能用,BW 这边打包机制没建,41 个眼下一个都注入不了,做成假可点是骗人,Overview 页签的「没建」一句话说清楚这点,不在两处重复。
13. **9-10 十三轮**:上一轮扫得不干净,发起人又挑出两处同样的「无意义的注释」——Plugins 列表 `mattpocock-skills` 行下面的 `github.com/mattpocock/skills`(详情页「上游」那行已经写着)、AI Assets 列表 `AGENTS.md` 行下面的 `<被管仓>/AGENTS.md`(「来自」列已经写着「项目」)。两处都删,列表回到只留名字。

## 待裁决

1. **用户自有 workflow 的接入通道做不做、什么时候做** —— 这是发起人点名的「比较严重的 gap」。改的是注入模型(按名解析先查被管仓、`default_workflow` 可被项目覆盖),属内核改动,**建议另开一件**,本特性只把缺口显示出来。
2. **界面说谎那条什么时候停血** —— 项目自有技能显示「用过 N 次」但从没被注入过。最小修法在本特性范围内(标「注入不了」),已在原型里做了。
3. **agent 这一类要不要进面板** —— 同事点名的四类里只缺它,而 BW 全仓零实现(没有扫 `.claude/agents/` 的代码)。进 = 新开一条数据链路。
4. **「哪个项目在用」维度要不要做** —— 要跨所有接入项目扫,时机与成本待定。
5. **插件和 workflow 是一件事还是两件事** —— 今天 `mattpocock-skills` 既是插件名又是 workflow 名,是巧合不是同义。
6. **AI Assets 这一节要不要进本轮** —— 和 Stage / Plugins 一样是新增界面。
7. 配置屏这一轮动不动 —— 倾向只搬走,重建(远端 / 项目群 / 节律)另开一件。
8. 要不要给 Orca 加一次真探活 —— 不加它就只有「配了 / 没配」,是半个答案。

## 明确不做

安装、启用停用开关、Discover / 市场、安装数、代装工具、代起服务、填路径的输入框、技能胜率、技能版本。
