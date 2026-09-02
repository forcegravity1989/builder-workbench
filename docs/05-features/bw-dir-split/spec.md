# Spec · `.bw/` 人机分目录 + 去冗留真

> **历史横幅(2026-09-02)**:本篇的 `.bw/` 分层主张**已被 main 覆盖、不再作数**。
> main 的决定是:`.bw/` 保持扁平、接入不再铺任何模板、`PROJECT.md` 与指纹清单都删掉、
> 旧件交每周资产盘点清。经过与结论见同目录 `STATUS.md`。留档供以后再议时对照。

> **30 秒导读**:这是什么——本次变更的**规格件**:新布局、谁能写哪些文件的硬规则、删除清单、名片版本显示的新算法、旧项目怎么办、提交顺序、验收。给谁看——过规格 gate 的人、实现批次的会话。现在作数吗——**在 gate**(2026-08-29,经三轮对抗评审收敛;标「评审轮拍定」处为评审结论,gate 可推翻)。上游意图见 `intent.md`,可点原型见 `prototype.html`,承载活 [#133](https://github.com/forcegravity1989/builder-workbench/issues/133)。

## 设计拍板

### 1. 分层规则(一句话)与「谁能写」的硬规则

**机器逐字段解析的收进子目录,人与 agent 通读的 Markdown 留顶层**:

- `.bw/` 顶层 + `decisions/`、`design/` = 给人(和 agent)**读**的 Markdown;
- `.bw/config/` = **人拍板的输入**:落盘要么经 MR 评审,要么经人在配置屏当场点击确认;机器读它推导行为,不擅自改;
- `.bw/state/` = 机器**免确认自写**的台账与流水,人只审不编;
- `.bw/scripts/` = 可执行采集脚本(现状不动,只归类点名)。

「谁能写这份文件」的硬规则:

1. 今天存在一处 Workbench 替人直接改 config 文件的路径:配置屏保存类别映射(`save_tool_mapping`)直接改写**人的主检出**(日常工作目录)里的 issue-policy.toml,不开活、不提交。这与 `[chat]` 走「编辑项目信息」活+MR 是同一目录里两种写入方式并存,本批如实记录、不去统一(见「明确不在本批」)。
2. **指纹必须跟上**:Workbench 替人写完 config/ 文件,必须同步更新**同一个检出**里 `state/managed.toml` 对应条目的内容指纹——这样对账里的「人改过」才真的只指人改过。细则(评审轮拍定):
   - 次序:先写 config、后写 managed(沿用铺底「指纹最后写,记的是刚落盘那一刻的内容」这条既有规矩);
   - managed 写失败:整条命令报错,并明说「指纹没跟上,下次对账会把这份文件判成人改过」,不悄悄吞掉;
   - **同一检出里 managed 清单不存在,就不建也不同步**——接入的 MR 还没合入时,主检出里本来没有这份清单;凭空造出半份,等于把「从未铺过底」说成「接管过」,还会让铺底 MR 因为工作目录里多了个没提交的文件而合不进来。
3. **已知代价(如实留着,不在本批修)**:指纹同步之后,如果将来接回「二次铺底」入口(今天没有界面入口,只有一个示例程序在用),铺底会把指纹相符的文件用模板原样覆盖——人保存过的映射会悄悄丢。修法(给清单条目加「这是 Workbench 替人写的」标记,或铺底时先比对模板渲染结果)归入「统一写入方式」那条后续活。
4. 这条边界由守卫脚本看住(R6),不靠目录名自我声明;守卫只管 **Rust 代码里的写入**——agent 按剧本写 config/(比如 metrics.toml)不在静态检查范围内,靠剧本约束,这里如实说明。

### 2. 新布局(前后对照;图是完整布局示意。本仓 `.bw/` 搬前是 `PROJECT.md` + 五份 toml + `metrics/readings.jsonl` + `scripts/`,搬迁只动实际存在的文件)

```
现在                            改后
.bw/                            .bw/
  PROJECT.md                      PROJECT.md            (不动)
  project.toml                    process-catalog.md    (不动,铺底落点)
  issue-policy.toml               releases.md           (不动)
  standard.toml                   decisions/  design/  plan/(不动)
  managed.toml                    config/
  metrics.toml                      project.toml
  metrics/readings.jsonl            issue-policy.toml
  scripts/                          metrics.toml
                                  state/
                                    managed.toml
                                    metrics-readings.jsonl
                                  scripts/              (不动)
```

**三类操作,别混着做**(评审轮拍定):project.toml / issue-policy.toml / metrics.toml → **搬进 config/**;managed.toml / metrics/readings.jsonl → **搬进 state/**;standard.toml → **整份删除,不搬**——引用它的代码行是删掉,不是改成新路径。

### 3. 去冗清单(删什么 · 为什么 · 谁补位)

| 删 | 为什么 | 删后正本在哪 |
|---|---|---|
| `issue-policy.toml` 整个 `[[tool]]` 段 | 四字段零消费,探活/接法全在适配模块硬编码 | 适配模块代码(`tools.rs` / `probe_env` / `agent_for`) |
| `[review]` 段 | 零消费,能力未建 | 未建,如实不留空壳 |
| `ops1_trigger` / `ops2_trigger` | 仅显示用;行为写死在代码里(①人触发②看 schedule) | 配置屏文案写死「人触发/定时」,与行为一致 |
| `schema_version`(issue-policy) | 没有任何校验 | 版本信号由 `state/managed.toml` 逐文件承担(人改过的文件,清单里的版本只代表最后一次铺底,这个边角如实认) |
| `standard.toml` 整份 + `standard_file.rs` + 模板 + 铺底清单条目 + **managed.toml 里它遗留的记录**(文件删了、清单里还挂着的那条) | 解析器零调用、文件头「对账用它」的说法是假的;对账正本是 managed.toml | `state/managed.toml`。**完成判据跟着改**(评审轮发现:运作活③「规范铺底」的完成判据今天查的是 standard.toml 在不在 git 提交里)——改成查 managed.toml(经代码常量引用,后续换路径自动跟上) |
| `project.toml` 的 `standard_version` | 没有代码维护的镜像,已经失真 | 「规范 vX」共有**三处显示**(总览名片 / 知识库顶栏 / 配置屏「规范版本」行,评审轮查全的),统一改用 §4 的新算法 |

### 4. 名片「规范」格的新算法(评审轮拍定)

三处「规范 vX」显示同一来源同一算法,从 managed.toml(经代码常量,换路径前后都能用)现读现算:

- **算哪些文件** = managed.toml 里登记过的条目(如实:config/ 三件里只有 issue-policy 会被铺底登记,project.toml 和 metrics.toml 从来不进清单——不虚报「在管」);
- **显示** = `规范 v<条目里最低的版本> · <n> 件在管`,有异常再追加:`缺 <k>` / `人改 <m>`(为 0 不显示);
- **「铺的版本比现在旧」不算进名片上的异常数**:今天没有「升级重铺」的入口(铺底只在接入时执行一次),把「过期」挂在名片上就是一个人永远消不掉的提醒,是假的;过期只在配置屏的对账详情里如实显示;
- 清单文件不存在、或清单是空的,显示「—」;
- 文件已删但清单里还挂着的旧记录(比如删除后的 standard.toml 那条)在 commit 1 里摘掉,不许拿它凑数。

本仓按现状推算,搬完后的真实显示:清单剩 2 条(PROJECT.md、issue-policy),实测两份今天都被人改过 → 名片显示「规范 v5.x · 2 件在管 · 人改 2」。**这是真话,不修饰**(评审轮实测了指纹:不许为了显示好看,把人改过的文件重新记成机器原样)。

### 5. 注释纪律(去冗的另一半)

- 机器写文件时自带的注释收敛到每节至多一行字段语义;「人手加的注释保存时会被抹掉」这条提示保留。
- **给已删设计立传的历史注释一律删、不迁**(「没有第六类别」「不再有 drag_scope」这类)——历史留在 git 里查;顺手收掉两处已经指着空气的注释(`standard/mod.rs` 里对 standard.toml 的说明、`interactive_cli.rs:542` 过时的「会写占位文件」描述)。
- **`metrics.toml` 顶部注释整段保留**(skills 把它当填写格式的正本引用)。

### 6. 旧项目怎么办(评审轮按代码事实重写)

- **施工前核查**(plan 第 0 步):逐台机器、**逐个数据目录分支**查在管项目清单 `<asset_root>/projects.toml`——macOS `~/Library/Application Support/BuildersWorkbench`(已查:文件不存在,受影响的只有本仓)、Windows `D:\builders-workbench\data`、Windows 没 D 盘时退到 `%APPDATA%\BuildersWorkbench`、Linux `~/.local/share/builders-workbench`、以及 **`BW_DB` 环境变量指定的位置**(取它的上级目录)。查出在管项目就逐个列出定处置;没查的机器在 MR 里如实标注。
- 不写迁移代码、不同时认新旧两个路径、**不会自动接管旧布局**:代码里不存在「发现旧布局就提议铺底」的逻辑(铺底只在接入时跑),旧布局项目由**人自己处置**——删掉旧 `.bw/`(或手工搬)之后重新接入;铺底遇到「已存在但不在清单里」的文件一律跳过并如实报告,不覆盖、不认领。
- 本仓 `.bw/` 随 commit 2 搬:managed 条目**只改路径,版本和指纹不动**(对账结论每一条都和搬之前一样)。

### 7. 版本

`standard/VERSION` 5.10 → **6.0**,**和换路径放在同一个 commit**(评审轮发现:「过期」的判断拿清单里的版本和程序自带版本比,两者拆开提交,中间那个提交检出来对账结果就是乱的)。

### 8. 提交顺序(评审轮拍定)

按「先删假的、再换路径、后改行为」排,每个 commit 检出来都是自洽的:

1. **commit 1 · 去冗(可单独先合入)**:两份 toml 的格式瘦身 + `standard.toml` **整份删除**(文件、解析器、模板、铺底条目、清单里的遗留记录、知识库屏里那一行——是删除,不是改路径)+ 运作活③完成判据改查 managed.toml + **三处版本显示改用 §4 新算法**(读 managed 经代码常量,换路径前后都能用)+ 注释减量 + tests/examples 同步 + 本仓两份 toml 内容瘦身(清单指纹不动)。单独合入后没有任何屏断显示。如果目录方案在 gate 上有分歧,这个 commit 单独成 PR 先合——假配置不多活一天。
2. **commit 2 · 换路径(一次换完,不拆)**:全部路径常量与文档里的字面引用 + `VERSION → 6.0` + 本仓 `.bw/` 实物搬迁 + 清单条目路径重记。
3. **commit 3 · 写入行为**:`save_tool_mapping` 写完同步指纹(按 §1.2 细则)+ 配置屏定时文案写死。
4. **commit 4 · 守卫与文档**:R6 守卫 + `docs/architecture.md` 纠错(§2 说「不做 deny_unknown_fields」,代码事实是三份 toml 都做、`metrics.toml` 与读数流水是两处例外——这也是一条「文档说的和代码干的不一样」,顺同批修;解析器清单里的 `standard` 换成 `readings`,数目仍是五份)+ AGENTS 导览 + CHANGELOG。
5. **commit 5 · 验收**:R1–R6 全跑,证据记进活 #133。

机械改路径的 diff 和改行为的 diff 分开,评审各看各的。

## 操作逻辑(主路径 / 分支 / 出错)

- **主路径**:接入铺底(写进这张活自己的 worktree,经 MR)→ `PROJECT.md`(顶层)+ `config/issue-policy.toml` 落盘 → `state/managed.toml` 最后记指纹;名片编辑与远端读名片走 `config/project.toml`;配置屏保存映射 → 写主检出的 `config/issue-policy.toml` **并按 §1.2 同步指纹**;运作活①(agent 按剧本)写 `config/metrics.toml`;采集追加 `state/metrics-readings.jsonl`;三处规范显示现读现算。
- **分支(旧布局项目)**:`state/managed.toml` 不存在 = 从未铺过底;人删掉旧 `.bw/` 再接入才算数;顶层已存在但不在清单里的文件,铺底一律跳过并如实报告。
- **出错(按文件写实,三份文件行为不同,评审轮查实)**:
  - `config/issue-policy.toml`、`config/project.toml`:出现认不得的字段就整份拒读(`deny_unknown_fields`)→ 壳上黄条提示文件名与错误,映射/节律按「没配」处理;
  - `config/metrics.toml`:**不做**这个检查(人手写的文件,多个字段就整份崩代价太大——既有取舍),多余字段忽略;解析失败显示在指标卡自己的错误位上,不是壳的黄条;
  - `state/metrics-readings.jsonl`:坏行静默丢弃(现状,如实写明);
  - 新格式文件遇到旧版程序:整份拒读,当场报错不悄悄吞——单人场景程序和规范同机同步,可接受。

## FAQ 硬问题

**客户会问**:
- **我手改过 `.bw/` 里的文件,这次升级会覆盖吗?** 不会。指纹对不上就算人改过,铺底一律跳过并提示差异;本仓自己两份改过的文件也如实保留「人改」状态,不粉饰。
- **我该自己碰 `config/` 和 `state/` 吗?** `config/` 可以——那就是给你拍板用的(经 MR 或配置屏);`state/` 别手编,那是机器记的账,人只负责审。
- **手写注释还会被抹吗?** 会。界面保存整份重写,这是已认的代价;要留讲解写进顶层 Markdown。

**硬核挑战(内部)**:
- **为什么不留旧路径兼容?** AGENTS.md 纪律;本机在管项目清单已查实为空,兼容层只服务不存在的用户;其余机器由施工前核查兜底。
- **为什么三个子目录不是一个?** config/ 与 state/ 谁来写正好相反,混放就回到「谁写的靠注释解释」的原点;这条边界由 R6 守卫加 R4 行为验收看住,不是纸面承诺。
- **配置屏直接写 config/,还算「人拍板」吗?** 算:落盘由人当场点击触发,且指纹同步让对账保持诚实;同一目录两种写入方式并存是真实的不一致,如实记录,统一另立活。
- **为什么删 `[[tool]]`/`[review]` 而不是实现它们?** 没有任何行为等着这些字段驱动;先删假的,真需要时按特性起手路径立项。

## 明确不在本批(有主的,不散落)

- **统一 issue-policy 的写入方式**(直接写 vs 活+MR)+ 清单条目加「Workbench 替人写的」标记(§1.3 的已知代价):另立活。
- **工具名三处硬编码收拢到一处**(`tools.rs::probe` / `agent_for` / `probe_env`;探活名与真起进程名对不上的 bug 以前真出过):真实的重复,如实记下,建议单独立活。
- **升级重铺入口**(「过期永远消不掉」的根治):未建,如实留着;名片算法因此不把过期算进异常。
- **看板列标题可配性去留**(有代码在用、但没有人要求过的可配项):下一刀候选。
- `.bw/plan/` 与 `releases.md`(路径都不涉及,零改动);知识库屏除清单行外不重构;`scripts/` 机制;读数文件坏行静默丢弃的现状。

## 要求与验收

- **R1 旧路径清零**:**仓根全量** grep(含 AGENTS.md、CONTEXT.md、README.md、crates 的 tests/examples、standard/、docs/、scripts/、`.bw/` 自身;历史记录除外:CHANGELOG.md、changes/、docs/adr/、plan/、iterations/)查不到六个旧路径字符串;`standard.toml` 的引用必须是**删掉**,出现 `.bw/config/standard.toml` 这种「照着搬出来的新路径」同样算失败;字面 grep 之外,代码里**拼出来的路径**(如 `join("metrics")`)逐个点名核对(plan 有清单)。
- **R2 死代码清零**:`ToolDecl`、`ReviewPolicy`、`standard_file`、trigger 字段及模板对应段全仓不复存在(含 `tests/repo_files.rs`)。
- **R3 门禁全过**:fmt / clippy / 壳编译 / 全部守卫(含 R6)/ cargo test;每个 commit 各自全过。
- **R4 端到端读回**:新接入项目铺底后 `cat .bw/config/issue-policy.toml`(瘦身格式);总览/知识库/配置屏三处规范显示一致;把 `ops2_schedule` 改成本周已过的时间点,60 秒内自动建出「资产盘点」活并读回;**保存一次映射 → 读回 `state/managed.toml`,指纹已跟上、对账仍判机器原样**;**接入 MR 还没合入时保存映射 → 主检出不产生 managed 清单**(§1.2 的分支)。
- **R5 对账诚实**:搬完后条目路径全新、遗留记录已摘;**对账结论每一条和搬之前一样**(本仓两条「人改过」如实保留);`git status` 无旧位置残留。
- **R6 写入边界守卫**:`guard-bw-write-authority.sh` 进门禁与 CI——静态检查 `.bw/config/`、`.bw/state/` 的 **Rust 写入调用点**(各 `*_file::write` 与读数文件的追加写)只出现在白名单模块(完整白名单见 plan;tests/examples 豁免);**不查路径常量的定义位置**(bw-engine 拿常量去远端只读是合法的);守卫双向自测:故意加一处白名单外的写入必须报红,现状代码必须全绿。
