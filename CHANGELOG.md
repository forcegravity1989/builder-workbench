# CHANGELOG.md

版本变更记录:每次合入记"本次做了什么"。决策动机进 [`docs/adr/`](docs/adr/),不写这里。buddy MVP 起记(2026-08-24);MVP 之前的 V1/V2/V3 史实在 git 历史与 `v3` 分支,不补抄。

## [buddy MVP] — 2026-08-24 起

仓整改成 buddy 自己推给被管项目的规范(dogfood):顶层文档集收敛到 grillme 那套(`AGENTS.md` 唯一开发规矩正本、`CLAUDE.md` 一行导入、`README`/`CHANGELOG`/`CONTEXT`/`DESIGN` 各守边界);V3 文档/skill 断舍离(`docs/v1~v3-prototype/` 残件删、`.claude/skills/` 4 个 V3 旧 skill 删、`docs/v4-prototype/design.md` 拆成 `docs/modules/<特性>.md` 各份自足设计);"V4"框去掉,就是新 buddy 的 MVP。V3 六 crate 已删(2026-08-24,见下条;全量在 `v3` 分支与 `docs/archive/`),`AGENTS.md` 的 V3 备注同步更新。

- 顶层文档:`AGENTS.md` 重写为开发手册(吸收原 CLAUDE.md 实质 + 脱 V3 框);`CLAUDE.md`→`@AGENTS.md` 一行。
- 删:`docs/v1-prototype/`、`docs/v2-prototype/`、`docs/v3-prototype/`、`.claude/skills/{buddy-bugfix,buddy-feature-dev,practice-buddy-landing,v1-product-delivery}`。
- 留至随 V3 一起删(V3 编译资产,已删,见下条):`docs/skills/`、`docs/buddy/`(原 `bw-core` include_str!)。
- 注释:`v4-engine/src/pty_backend.rs`、`terminal_manager.rs` 两处指向已删目录的悬空引用,改指 archive 或删行。
- 拆设计:`docs/v4-prototype/design.md`(1099 行,先存快照进 archive)拆成 `docs/modules/` 16 份自足模块设计。
- 规范正本:三来源两路径模型落 `docs/convention.md`,`DESIGN.md` 指向各模块设计。
- 代码 gap:`standard/05-issue-policy/issue-policy.toml.tmpl` 默认 workflow 诚实化(不默认指向 buddy 没打包的 mattpocock/proto-design,标"打包未实现")。full bundle 留后续。

### 2026-08-24(续)· 删 V3 代码/目录 + 清引用

V3 全量下线(不再「冻结等删」,直接删):V3 六 crate(`bw-core`/`bw-engine`/`bw-store`/`bw-app`/`ui`/`app-desktop`)+ V3 编译资产(`docs/skills/`、`docs/buddy/`)+ V3 验收流(`e2e/`、`run-flow.py` 等)+ V3 期元文档(`docs/LEFTOVERS.md`、`docs/doc-boundaries.md`、`docs/releases.md`、`docs/code-schemes.md`、`DEVELOPMENT.md`)+ 整个 `plan/` 目录(`plan/07` 迁成 `docs/proposition.md`,其余进 `docs/archive/plan/`);`docs/v4-prototype/design.md` 归档快照留 `docs/archive/v4-prototype/design.md`。CI 去掉 wasm/V3 专属命令(wasm32 check、`--exclude app-desktop` 等)。现存 `.md` 里指向上述已删路径的悬空引用同步清掉(指替代或删指针留实质);V3 史实在 `v3` 分支与 `docs/archive/` 找回。

### 2026-08-24(续二)· 仓规整成 lean 样板间(architecture.md 唯一设计正本)

仓整改成 dogfood 的"被管理样板间"——文档 lean、单一正本、无历史包袱:
- **`docs/architecture.md` = 唯一设计正本**:三 crate 架构 + 工作流模型(三来源两路径/系统提示词四段/默认 workflow/数据流/四铁律)+ 16 模块核心设计(每模块:是什么/代码落点 crate·目录级/数据/依赖/没建,设计导向不 file:line)。`DESIGN.md` 指向它。
- **删并**:`docs/archive/`(历史全删,V3 史实只留 `v3` 分支)、`docs/modules/`(16 份并进 architecture §3)、`docs/convention.md`(并进 architecture §2)、`docs/proposition.md`(命题并进 README/architecture)、`docs/codehub-windows-readiness.md`、`examples/`(vendor skill 并 `standard/vendor/`)、`iterations/PRACTICE-buddy.md`(V3 期实践日志)。
- **skill 一处管**:`standard/skills/`(自维护 10 份,include_str! 进 bw-v4)+ `standard/vendor/`(mattpocock/superpowers/mohit,给默认 workflow 打包)——默认要带的 skill 都在 `standard/`。
- **adr 清理**:删 V3 期 0001(改名台账),写新 [`docs/adr/0001-codehub-issue-正本-本地零库.md`](docs/adr/0001-codehub-issue-正本-本地零库.md)(MVP 关键决策:issue+标签=唯一正本、本地零库)。
- **Cargo.toml**:`[workspace.dependencies]` 删 V3 path dep(bw-core/engine/store/app/ui)+ V3-only 依赖(sqlx、serde_yaml);V4 三 crate 零依赖 V3。
- **AGENTS vs architecture 分工**:AGENTS=怎么开发维护(建/跑/测/门禁/目录/铁律/三层模型怎么加特性);architecture=是什么(设计);guide=怎么用(产品指南)。
- 代码 gap 修:issue-policy 默认 workflow 诚实化;app-shell/terminal_xterm V3 资产耦合补全;V4 代码文档章节锚(~50)+ V3 lineage 引用清零;`command.rs`/UI 文案"releases.md 唯一正本"假叙述修正(实际 codehub Release + git 标签)。

V4 三 crate 代码行为未变(除 issue-policy 默认值 + terminal_xterm 资产本地化 + kb/mod.rs 一处 UI 串删内部文档指针)。cargo check --workspace 过、四守卫过。

### 2026-08-24(续三)· standard/ 重构:系统提示词外置 + 扁平铺底 + 删方法论

- **系统提示词外置**:从 `bootstrap.rs` 的 `format!` 硬编码 → `standard/system-prompt/SYSTEM.md.tmpl` 模板(身份+四铁律+读项目规范件指引)+ `references/` 阶段规范(metrics.md 指标铁律 / build.md 改仓规则,按活 category/workflow 注入)。改铁律=改 md + 抬 `standard/VERSION` + 对账,不再改代码重编译。`agent_system_prompt` 从拼 4 段 → 渲染模板 + 注入 references/skill 两指针;段3(列项目 `.bw/` 文件)折叠进 SYSTEM.md 指引(agent 自行 ls `.bw/`)。
- **`templates/` 扁平镜像 `.bw/`**:`01-charter`/`03-docs`/`04-metrics`/`05-issue-policy`/`06-scripts`/`08-meta` 六个编号目录扁平进 `standard/templates/`(文件名镜像 `.bw/` 目标路径),编号遗风 + 02/07 空位一起去掉。
- **删方法论 6 skill + superpowers**:`skills/` 从 10 份(6 方法论 + 4 运作剧本)→ 4 份运作剧本。6 份方法论默认 workflow 没打包、`skill_slug` 不识别、一份没派发过,删光——阶段方法论走业界 workflow(`vendor/`),阶段规范约束走 `references/`,要从实践长再建;`vendor/superpowers` 删(默认是 mattpocock,不是 superpowers)。
- OD 探活(穿刺 subagent):`inject_skills` 对 OD 半成立——OD 有 systemPrompt 注入口子(`POST /api/runs` 实测被消费)、但收不了 buddy 技能文件(OD 自有 162 份 skillId,两套不兼容),不进 `InteractiveExecutor`(PTY 中心,不拟合)。做 systemPrompt 注入约 3-4h(在 `run_issue` OD 分支加 HTTP POST,不改 Executor),defer 给用户拍。
- 文档同步:arch §2(四段→文件+references)/§4/§9/§15 + `standard/README`/`skills/README`/`vendor/README` + `AGENTS`/`docs/README`;代码注释陈旧计数(十一/十三/10 份)清零成 4。
- V4 行为未变(提示词内容字字一致,只是从代码搬到模板 + 删了不被派发的死技能)。cargo check --workspace + clippy `-D warnings` + fmt + 5/12 test + prompt_smoke 跑通。

### 2026-08-24(续四)· crate 去版本号 + V3 裸名清扫

「V4 框去掉就是新 buddy MVP」收尾——三个 crate 去版本号:`bw-v4 → bw`、`v4-engine → bw-engine`、bin `bw-v4-dev → bw-dev`(旧壳 app-desktop 已删,共存期权宜名一并改回)。目录 `crates/bw-v4`→`crates/bw`、`crates/v4-engine`→`crates/bw-engine`;Cargo.toml(workspace members/deps/paths)+ CI + `guard-kernel-ui-free.sh` KERNEL + 所有 `use bw_v4::`/`use v4_engine::` + bin + 文档(AGENTS/architecture/README/CONTEXT)同步。`include_str!` 相对路径不受目录改名影响(层级数不变)。

**前置清扫**:改名前先清 V3 裸 crate 名(bw-core/bw-engine/bw-store/bw-app/ui/app-desktop 的 lineage 引用),否则 `v4-engine→bw-engine` 会和 V3 的 bw-engine(已删)撞。按统一口径:provenance(历史来路)保留名+加「(V3,见 v3 分支)」;当现行换名(bw-app→app-shell、bw-engine→v4-engine,再随本次改名→bw-engine);假句(「留着伺候直到删除」「继续编译」)删或改时态。改完后「bw-engine」无 V3 标=新底座、带标=历史,无歧义。

cargo check --workspace + clippy `-D warnings` + fmt + 四守卫 + test 全过。纯命名/注释,行为零变。

### 2026-08-24(续五)· 默认 workflow 打包:mattpocock-skills(build 阶段闭环)

build 阶段默认 workflow 从"声明但没打包"到**开机即用**。方案 A(归一):
- **入口 SKILL.md**(`standard/skills/mattpocock-skills/SKILL.md`,buddy 写):body 是
  grill-with-docs→implement→code-review 的 SOP + 指向 vendor 库子技能路径。作 SkillPack
  走**同一个** `skill_pointer` 机制(运作剧本 + workflow 入口同模型,不另开第二条注入路径)。
- `skill_slug` 识别 `mattpocock-skills`→入口;`skills.rs` 加 `BUILD_DEFAULT_SKILL`。
- `ensure_vendor_assets`:vendor 库整树摊到 `<asset>/vendor/`(dev 期从源码树
  `CARGO_MANIFEST_DIR/../../standard/vendor/` runtime 复制;分发态无源码树降级为不摊,
  入口仍注入但子技能读不到——bundle 进二进制留后续)。
- `issue-policy.toml.tmpl`:build/优化/运维 默认 `workflow` 从 `""` 回填 `mattpocock-skills`。
- 顺带修 redesign 遗留 gap:`--add-dir` 只挂了 skills_dir,references 读不到 → 改挂整个
  `asset_root`(技能 + references + vendor 都可读)。
- `proto-design`(原型阶段默认)源还没 vendor,待补。

归一记录在 arch §4(技能注入单一模型:skill_pointer→入口 SKILL.md;运作剧本 body 自足、
workflow 入口 body 指向 vendor 库)。VERSION 5.1→5.2。
cargo check --workspace + clippy + fmt + 四守卫 + test + prompt_smoke(5 份技能全摊出)全过。
行为:E2E 验证 defer 给用户(真跑一张 build 活看 agent 走 grill→implement→review)。

### 2026-08-24(续六)· OD 最小注入:灌 systemPrompt(原型阶段闭环)

原型阶段 OD 开工从"只内嵌不灌提示词"到**灌系统提示词**。按用户口径:OD 独立内嵌
不动,只灌 systemPrompt 让 OD 内 AI 知道在 buddy 管理下;skill 能放就放、没入口
走提示词。

- `bw-engine/open_design.rs` 加 `start_run(base_url, prompt, system_prompt)`:
  HTTP `POST /api/runs`(loopback,手动 `TcpStream`——不引 HTTP dep,bw-engine
  `#![forbid(unsafe_code)]` 下 std::net 安全)。探不到 url / 连不上 / 非 2xx 一律
  返 None(不阻断)。
- `run_issue` OD 分支:探活(`discover_web_url`)+ `start_run` 灌 buddy 的
  `agent_system_prompt`(身份+铁律+技能/references 指针)+ 活 prompt。OD 收不了 buddy
  技能文件(自有 162 份 skillId),技能指针在 systemPrompt 文本里、OD 的 AI
  best-effort 读。
- `inject_skills` 对 OD 从"半成立假声明"→有实现(systemPrompt 注入);OD 不进
  `InteractiveExecutor`(PTY 中心不拟合),不改 Executor。
- 仍 defer:OD 导出产物怎么落进 worktree(`linkedDir` 实测没生效)——按"先保证
  最小可用、有问题再处理",MVP 留这步。

cargo check + clippy + fmt + 四守卫 + test 全过。行为:E2E 验证 defer 给用户
(真跑一张原型活看 OD 内 AI 是否按 systemPrompt 走 + 产物能不能进 worktree)。

### 2026-08-24(续七)· 驾驭面落到 AGENTS.md

人靠四样可见物接手(旅程/高保真/架构/规矩),不靠读源码;仓外会话里人只走站和验收,
改代码与文档是窗口 AI 的事。仓外起手 skill 本机使用、不进仓。

### 2026-08-24(续十六)· 两轮已认定缺口:横幅不再假催开始本周;指标空壳到站才铺

穿刺合入运作活①之后总览又冒「开始本周」——判据把「活还开着」当成「计划在」,做完就假催,再点会重建同名活。现改:本周运作活①做过(含已完成)不再出按钮;文案不再找已删的周计划文件。运作活①开工时往 worktree 铺缺的 `metrics.toml` 空壳/脚本(已有不覆盖),规范补 UTF-8、A 类 `points`、`def` 字段名、首次北极星以名片为准、B 类首读只进评论。`standard/VERSION` 5.2→5.3。

周目标与「本周范围内有哪些活」在总览/计划屏怎么呈现、评论是否该承载——人判定旅程有问题,明早再对,本条不改落点、不读评论。

滞后/引领原先只有北极星上那颗「采一次」,A 类脚本若只吐当下 `value` 整张卡按失败灰掉,对照代码仓级四周折线像是这边不会画。现改:三层都能采;有按周序列就在该块下画折线;只吐 `value` 留下现值并写明画不出四周。

### 2026-08-24(续十五)· 总览不把「开始本周」当成已定目标;喂了什么不挤终端

健康第一条「定了周目标」不再等于「运作活① issue 在」——目标正文要从评论读(还没建),没读到就不打勾。配置表技能显示人话名+目录名,活详情 workflow 可跳到配置亮那一行;用户技能约定放 `.claude/skills/`,导入按钮仍没建。「看看喂了什么」改成盖在终端格上,不撑高动作条。内嵌交互式 claude 是路径 B 产品特性,设计与代码按这一条对齐。

### 2026-08-24(续十四)· 没记下会话 id 时选中不再自动 --continue

选中会话会接回上次对话。还没有 `--resume` id 时原先走 `claude --continue`,工作区里没有可接的对话就先刷欢迎再红字「No conversation found to continue」,人还没点开工。没有 id 不再起进程,空终端等人点▶开工(灌提示词重开)。

### 2026-08-24(续十三)· Windows 开工找到 claude;粘贴改走系统剪贴板

探活早就按 npm/`BW_CLAUDE_BIN`/PATH 找 `claude.exe` 和 `claude.cmd`,开工却把裸名字 `claude` 交给 ConPTY,CreateProcess 报 program not found。开工与探活用同一条候选链。粘贴:网页读不了 `dioxus://` 剪贴板(复制已有 execCommand 兜底),壳读系统剪贴板再交给 xterm.paste。

### 2026-08-24(续十二)· 开始本周跳会话后第一屏不再丢;收下 Claude 会话 id

从总览点「开始本周」先起 PTY、终端挂件后订阅。内核 60ms drain 进 broadcast 时还没订户,第一屏(欢迎/信任框)被丢掉:活已是进行中、开工灰着、画布空、键盘没处打。没订户时不 drain;挂件订上后主动要回放;进程退了清 live、缓冲留下,开工失败写进画布。SessionStart hook 把 `--resume` id 写到 buddy 资产目录(不写用户仓),节拍收进 sessions jsonl。已结束会话切走再回来回放仍没建。

### 2026-08-24(续十一)· 铺底清单对齐现行五类；合入报进度；已读按钮拿掉

`.bw/standard.toml` 模板的 enabled 不再写没有模板的 agents / defaults-core / cadence。合入并完成接上已有「一步一句」进度（确认框不关），不新开通知。通知屏「标记已读到现在」只写没人读的时间戳，按钮拿掉；事件流未改。

### 2026-08-24(续十)· 第 0 站指南补上「人点完成才合入」

接入走完只到评审中 + 开着的 MR。指南原先停在「下一步去合」，没写清在哪点。补上：计划屏把铺底从评审中拖到已完成（或详情「✓ 点完成」）=「合入并完成」；通知屏只通知。不新开特性。

### 2026-08-24(续九)· 接入后铺底在零开着的 issue 上会先炸

codehub 开着的 issue 为零时 `issue list --state opened` 返 null,jq 裸 `.[]` 失败。铺底建活前先按标题查开着的活,这里一炸就建不出 `规范铺底 v<版本>`、也开不出 MR;项目照样接进来。jq 与走势查询对齐,改成 `(. // [])`。总览运作活点不再把关过的旧活当成已完成;③只在默认分支 HEAD 有 `.bw/standard.toml` 才写已完成。通知事件流未改。

### 2026-08-24(续八)· 产品指南入口与口径对齐 MVP

`docs/guide/index.html` 改指现行 `v4-产品指南.html`；`buddy-guide.html` 顶部标 V3 历史不作数。
指南正文去掉已删路径（`design.md` / `LEFTOVERS.md`）和旧 crate 名（`bw-v4` / `v4-engine` / `bw-v4-dev`），
门禁与命令与 `AGENTS.md` 对齐。1–6 站仍只留标题，不编没走过的步骤。
