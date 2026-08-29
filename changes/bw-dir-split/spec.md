# Spec · `.bw/` 人机分目录 + 去冗留真

> **30 秒导读**:这是什么——本次变更的**规格件**:新布局、写权硬规则、删除清单、对账摘要口径、迁移口径、合入序、验收。给谁看——过规格 gate 的人、实现批次的会话。现在作数吗——**在 gate**(2026-08-29,经三轮对抗评审收敛;标「评审拍定」处为评审轮结论,gate 可推翻)。上游意图见 `intent.md`,可点原型见 `prototype.html`,承载活 [#133](https://github.com/forcegravity1989/builder-workbench/issues/133)。

## 设计拍板

### 1. 分层规则(一句话)与写权硬规则

**机器逐字段解析的收进子目录,人与 agent 通读的 Markdown 留顶层**:

- `.bw/` 顶层 + `decisions/`、`design/` = 给人(和 agent)**读**的 Markdown;
- `.bw/config/` = **人拍板的输入**:落盘要么经 MR 评审,要么经人在配置屏当场点击确认;机器读它推导行为,不擅自改;
- `.bw/state/` = 机器**免确认自写**的台账与流水,人只审不编;
- `.bw/scripts/` = 可执行采集脚本(现状不动,只归类点名)。

**写权**(本篇新词,登记进 CONTEXT.md 随 commit 4)= 谁有权把这份文件落盘:人拍板(config/)还是机器自写(state/)。硬规则:

1. 今天存在一处 Workbench 替人直写 config 文件的路径:配置屏保存类别映射(`save_tool_mapping`)直接改写**主检出**里的 issue-policy.toml,不开活、不 commit。这与 `[chat]` 走「编辑项目信息」活+MR 是同一目录两种写入政策并存,本批如实记录、不统一交互(见「明确不在本批」)。
2. **指纹同步**:Workbench 替人写 config/ 文件后,必须同步更新**同一检出**里 `state/managed.toml` 的对应条目指纹——「人改过」从此只指真人改。细则(评审拍定,A5/A11):
   - 次序:先写 config、后写 managed(沿用铺底「指纹最后写」的既有不变量);
   - managed 写失败:整条命令报错并点名「指纹没跟上,下次对账会判人改过」,不吞;
   - **同一检出里 managed 清单不存在则不建、不同步**(接入 MR 未合入时主检出还没有清单;凭空造半份清单会把「从未铺底」翻面成「接管过」,还会让铺底 MR 的 ff 合入撞上脏文件)。
3. **已知代价(留白,不在本批修)**:指纹同步后,若未来接回「二次铺底」入口(今天无 UI 入口,仅 example 在用),铺底会把指纹相符的文件用模板覆盖——人保存的映射会静默丢。修法(ManagedEntry 加「app 写入」标记或铺底比对模板渲染值)归入「统一写入交互」后续活。
4. 写权由守卫看住(R6),不是目录名的自我声明;守卫覆盖范围=Rust 侧写入,**agent 按剧本写 config/(如 metrics.toml)不在静态守卫覆盖内**,靠剧本约束,如实声明。

### 2. 新布局(前后对照;图为完整布局示意,本仓现状无 metrics.toml/metrics//scripts/,见 prototype 图注)

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

**三类操作,别混**(评审拍定,C3):project.toml / issue-policy.toml / metrics.toml → **移入 config/**;managed.toml / metrics/readings.jsonl → **移入 state/**;standard.toml → **整份删除,不迁**(引用它的行是删除不是改路径)。

### 3. 去冗清单(删什么 · 为什么 · 谁补位)

| 删 | 为什么 | 删后正本在哪 |
|---|---|---|
| `issue-policy.toml` 整个 `[[tool]]` 段 | 四字段零消费,探活/接法全在适配模块硬编码 | 适配模块代码(`tools.rs` / `probe_env` / `agent_for`) |
| `[review]` 段 | 零消费,能力未建 | 未建,如实不留空壳 |
| `ops1_trigger` / `ops2_trigger` | 仅显示用;行为硬编码(①人触发②看 schedule) | 配置屏文案写死「人触发/定时」,与行为一致 |
| `schema_version`(issue-policy) | 无校验 | 版本信号由 `state/managed.toml` 逐文件承担(人改过的文件其 managed 版本只代表最后一次铺底,边角如实认) |
| `standard.toml` 整份 + `standard_file.rs` + 模板 + 铺底 `meta` 条目 + **managed.toml 里它的孤儿条目** | 解析器零调用、文件头对账声明是谎;对账正本是 managed.toml | `state/managed.toml`。**判据锚点跟着换**(评审拍定,A1):运作活③完成判据从 `path_in_head(".bw/standard.toml")` 改为查 managed.toml(经 REL_PATH 常量,随路径翻转自动跟) |
| `project.toml` 的 `standard_version` | 无代码维护的镜像,已失真 | 三处显示(总览名片 / 知识库顶栏 / 配置屏「规范版本」行,评审拍定 A7)统一改**对账摘要**,口径见 §4 |

### 4. 对账摘要口径(评审拍定,F3/A13/A14)

三处「规范 vX」显示同源同口径,从 managed.toml(经常量,翻转前后皆可)现算:

- **分母** = managed.toml 条目(如实:config/ 三件里只有 issue-policy 进 managed,project.toml 与 metrics.toml 从来不进——不虚报「在管」);
- **显示** = `规范 v<条目最低版本> · <n> 件在管`,追加异常计数:`缺 <k>` / `人改 <m>`(为 0 不显示);
- **过期(Stale)不计入名片异常**:升级重铺入口未建(接入是铺底唯一出货调用点),挂一个永远擦不掉的「过期」是假催办;过期只在配置屏对账详情如实显示;
- 清单文件缺失或空清单显「—」;
- 孤儿条目(磁盘早没了的 path,如删除后的 standard.toml)在 commit 1 摘除,不许靠它凑数。

本仓诚实投影:摘迁后 2 条(PROJECT.md、issue-policy),实测两条今天都是「人改过」→ 名片显示「规范 v5.x · 2 件在管 · 人改 2」。**这是真话,不修饰**(评审拍定,A2:不许为凑好看重盖指纹)。

### 5. 注释纪律(去冗的另一半)

- 机器盖章注释收敛到每节至多一行字段语义;「人手注释保存会被抹掉」提示保留。
- **碑文一律删、不迁**;悬空注释顺手收(`standard/mod.rs` 对 standard.toml 的指代、`interactive_cli.rs:542` 的过时 placeholder 描述)。
- **`metrics.toml` 顶部注释整段保留**(skills 引用的格式正本)。

### 6. 迁移口径(评审拍定,A6/C4:按代码事实重写)

- **pre-flight**(plan 第 0 步):逐台机器、**逐 data_dir 分支**查注册表 `<asset_root>/projects.toml`——macOS `~/Library/Application Support/BuildersWorkbench`(已验:文件不存在,敞口=本仓)、Windows `D:\builders-workbench\data`、Windows 无 D 盘退 `%APPDATA%\BuildersWorkbench`、Linux `~/.local/share/builders-workbench`、以及 **`BW_DB` env 覆盖**(取其 parent)。查出在管项目逐个列出定处置,没验的机器在 MR 里如实标注。
- 不写迁移代码、不双读旧路径、**无自动收编**:代码里不存在「boot 检测到旧布局提议铺底」的逻辑(铺底唯一出货调用点是接入),旧布局项目由**人显式处置**——删旧 `.bw/`(或手搬)后重新接入;铺底对「已存在且非在管」的文件一律跳过并如实报,不覆盖、不认领。
- 本仓 `.bw/` 随 commit 2 搬迁:managed 条目**只改 path,不动 version/fingerprint**(对账结论逐条与搬前一致)。

### 7. 版本

`standard/VERSION` 5.10 → **6.0**,**放在 commit 2**(评审拍定,A3:Stale 判定拿条目版本比二进制 VERSION,版本号与路径翻转拆开必造出对账口径错乱的中间 commit)。

### 8. 合入序(评审拍定,F6/P1/A7/C9)

1. **commit 1 · 去冗(可独立合入)**:schema 瘦身(project.toml / issue-policy.toml)+ `standard.toml` **整份删除**(文件、解析器、模板、铺底条目、managed 孤儿条目、vm_kb 清单行——删除不是改路径)+ ops③ 判据锚点切到 managed.toml + **三处版本显示改对账摘要**(读 managed 经常量,翻转前后皆可)+ render 注释减量 + tests/examples 同步 + 本仓 `.bw/` 两份 toml 内容瘦身(managed 条目不重盖指纹)。单独合入后无任何屏断显示。
2. **commit 2 · 路径翻转(原子)**:全部路径常量与字面引用 + `VERSION → 6.0` + 本仓 `.bw/` 实物搬迁 + managed 条目 path 重记。
3. **commit 3 · 写权语义**:`save_tool_mapping` 指纹同步(按 §1.2 细则)+ 配置屏定时文案写死。
4. **commit 4 · 守卫与文档**:R6 守卫 + `docs/architecture.md` 修谎(§2「不做 deny_unknown_fields」改为「除 metrics 外一律 deny」;「五个解析器」改四个)+ CONTEXT.md 登记「写权」+ AGENTS 导览 + CHANGELOG。
5. **commit 5 · 验收**:R1–R6 全跑,证据记进活 #133。

## 操作逻辑(主路径 / 分支 / 出错)

- **主路径**:接入铺底(写进活自己的 worktree,经 MR)→ `PROJECT.md`(顶层)+ `config/issue-policy.toml` 落盘 → `state/managed.toml` 最后记指纹;名片编辑与远端 Intent UX 读写 `config/project.toml`;配置屏保存映射 → 写主检出 `config/issue-policy.toml` **并按 §1.2 同步指纹**;运作活①(agent 按剧本)写 `config/metrics.toml`;采集追加 `state/metrics-readings.jsonl`;三处规范显示现算对账摘要。
- **分支(旧布局项目)**:`state/managed.toml` 不存在 = 从未铺底;人删旧 `.bw/` 后重新接入才收编;顶层已存在的非在管文件铺底一律跳过并如实报(skipped/preexisting)。
- **出错(按文件写实,评审拍定 A8)**:
  - `config/issue-policy.toml`、`config/project.toml`:含未知字段整份拒读(`deny_unknown_fields`)→ 壳 `read_or_warn` 黄条报文件名与错误,映射/节律按「没配」;
  - `config/metrics.toml`:**不做** deny(多余字段忽略,人手写文件的既有取舍);解析失败落指标卡自身的错误位(`MetricsVm.error`),不是壳黄条;
  - `state/metrics-readings.jsonl`:坏行静默丢弃(现状,如实);
  - 新格式文件遇旧二进制:整份拒读=响亮失败,单人场景可接受。

## FAQ 硬问题

**客户会问**:
- **我手改过 `.bw/` 里的文件,这次升级会覆盖吗?** 不会。指纹不符=人改过,铺底一律跳过并提示差异;本仓自己两份改过的文件也如实保留「人改」状态,不盖假章。
- **我该自己碰 `config/` 和 `state/` 吗?** `config/` 可以——那就是给你拍板用的(经 MR 或配置屏);`state/` 别手编,机器写的台账,人只审。
- **手写注释还会被抹吗?** 会。界面保存整份重写,这是已认的代价;要留讲解写进顶层 Markdown。

**硬核挑战(内部)**:
- **为什么不留旧路径兼容?** AGENTS.md 纪律;本机注册表已验为空,兼容层只服务不存在的用户;其余注册表分支 pre-flight 兜底。
- **为什么三个子目录不是一个?** config/ 与 state/ 写权相反,混放就回到「谁写的靠注释解释」的原点;边界由 R6 守卫 + R4 行为验收看住,不是纸面承诺。
- **配置屏直写 config/ 还算「人拍板」吗?** 算:落盘由人当场点击触发,且指纹同步让对账保持诚实;两种写入政策并存是真实的不一致,如实记录,统一另立活。
- **为什么删 `[[tool]]`/`[review]` 而不是实现它们?** 没有任何行为等着这些字段驱动;先删假的,真需要时按特性起手路径立项。

## 明确不在本批(有主的,不散落)

- **统一 issue-policy 写入交互**(直写 vs 活+MR)+ ManagedEntry「app 写入」标记(§1.3 的已知代价):另立活。
- **工具名三处硬编码收拢单点**(`tools.rs::probe` / `agent_for` / `probe_env`;name-drift 有案发记录):留白,建议单独立活。
- **升级重铺入口**(Stale 永久化的根治):未建,如实留白;对账摘要因此不把过期计入异常。
- **看板列标题可配性去留**(有消费者但无客户的可配项):下一刀候选。
- `.bw/plan/` 与 `releases.md`(引用路径都不涉,零改动);kb 屏除清单行外不重构;`scripts/` 机制;readings 坏行静默丢弃的现状。

## 要求与验收

- **R1 旧路径清零**:**仓根全量** grep(含 AGENTS.md、CONTEXT.md、README.md、crates 的 tests/examples、standard/、docs/、scripts/、`.bw/` 自身;史料除外:CHANGELOG.md、changes/、docs/adr/、plan/、iterations/)查不到六个旧路径字符串;`standard.toml` 的引用必须是**删除**,出现 `.bw/config/standard.toml` 这类「翻译出来的新路径」同样算失败;字面 grep 之外,代码级路径**拼接**处(如 `join("metrics")`)逐个点名核对(plan 有清单)。
- **R2 死代码清零**:`ToolDecl`、`ReviewPolicy`、`standard_file`、trigger 字段及模板对应段全仓不复存在(含 `tests/repo_files.rs`)。
- **R3 门禁全过**:fmt / clippy / 壳编译 / 全部守卫(含 R6)/ cargo test;每个 commit 各自全过。
- **R4 E2E 读回**:新接入项目铺底后 `cat .bw/config/issue-policy.toml`(瘦身格式);总览/知识库/配置屏三处对账摘要一致;把 `ops2_schedule` 改成本周已过时点,60 秒节拍内自动建「资产盘点」活并读回;**保存一次映射 → 读回 `state/managed.toml` 指纹已同步、对账仍「机器原样」**;**铺底 MR 未合入时保存映射 → 主检出不产生 managed 清单**(§1.2 分支)。
- **R5 自狗食对账诚实**:搬迁后条目 path 全新、孤儿条目已摘;**对账结论逐条与搬前一致**(本仓两条「人改过」如实保留);`git status` 无旧位置残留。
- **R6 写权守卫**:`guard-bw-write-authority.sh` 进门禁与 CI——静态断言 `.bw/config/`、`.bw/state/` 的 **Rust 写调用点**(`*_file::write` 与 readings 的追加写)仅在白名单模块(完整白名单见 plan;tests/examples 豁免);**不查路径常量定义**(bw-engine 远端只读取用常量是合法的);守卫自测:故意加一处越权写必须红,现状代码必须绿。
