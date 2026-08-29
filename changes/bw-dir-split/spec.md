# Spec · `.bw/` 人机分目录 + 去冗留真

> **30 秒导读**:这是什么——本次变更的**规格件**:新布局、写权硬规则、删除清单、注释纪律、迁移口径、合入序、验收。给谁看——过规格 gate 的人、实现批次的会话。现在作数吗——**在 gate**(2026-08-29,已经对抗评审修订;标「评审拍定」处为评审轮结论,gate 可推翻)。上游意图见同目录 `intent.md`,可点原型见 `prototype.html`,承载活 [#133](https://github.com/forcegravity1989/builder-workbench/issues/133)。

## 设计拍板

### 1. 分层规则(一句话)与写权硬规则

**机器逐字段解析的收进子目录,人与 agent 通读的 Markdown 留顶层**:

- `.bw/` 顶层 + `decisions/`、`design/` = 给人(和 agent)**读**的 Markdown;
- `.bw/config/` = **人拍板的输入**:落盘要么经 MR 评审,要么经人在配置屏当场点击确认;机器读它推导行为,不擅自改;
- `.bw/state/` = 机器**免确认自写**的台账与流水,人只审不编;
- `.bw/scripts/` = 可执行采集脚本(现状不动,只归类点名)。

**写权硬规则(评审拍定,F1)**——目录承诺必须与代码事实一致,不靠文档自觉:

1. 今天存在一处 Workbench 替人直写 config 文件的路径:配置屏保存类别映射(`save_tool_mapping`)直接改写 issue-policy.toml,不开活、不 commit。这与 `[chat]` 走「编辑项目信息」活+MR 是**同一目录下两种写入政策并存**,本批如实记录、不统一交互(见「明确不在本批」)。
2. 但**指纹必须修**:Workbench 替人落盘 config/ 文件后,必须同步更新 `state/managed.toml` 里该文件的指纹。否则保存一次映射,对账就永远判「人改过」、升级永不覆盖——「HumanEdited」名不副实,对账语义被 app 写入腐蚀(这是现状 bug,随本批修)。修后,「人改过」只指真人改。
3. 写权由守卫看住(R6),不是目录名的自我声明。

### 2. 新布局(前后对照,全文见 prototype.html)

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

### 3. 去冗清单(删什么 · 为什么 · 谁补位)

| 删 | 为什么 | 删后正本在哪 |
|---|---|---|
| `issue-policy.toml` 整个 `[[tool]]` 段 | 四字段零消费,探活/接法全在适配模块硬编码 | 适配模块代码(`tools.rs` / `probe_env` / `agent_for`) |
| `[review]` 段 | 零消费,能力未建 | 未建,如实不留空壳 |
| `ops1_trigger` / `ops2_trigger` | 仅显示用;行为硬编码(①人触发②看 schedule) | 配置屏文案写死「人触发/定时」,与行为一致 |
| `schema_version`(issue-policy) | 无校验 | 版本信号由 `state/managed.toml` 逐文件承担(边角如实认:人改过的文件其 managed 版本只代表最后一次铺底);出现第二版格式时再在文件内引入并带校验 |
| `standard.toml` 整份 + `standard_file.rs` 解析器 + 模板 + 铺底清单 `meta` 条目 | 全仓零读方;对账正本是 managed.toml | `state/managed.toml`(每条目带版本与指纹) |
| `project.toml` 的 `standard_version` | 无代码维护的镜像,已失真 | 名片「规范」格改为**对账摘要**(评审拍定,F3):从 `state/managed.toml` 现算,显示条目**最低**版本 + 异常件数(如「规范 v6.0 · 3 件在管」「v5.8 · 1 件过期」);文件缺失显「—」。**不取 max**——max 是「最近铺过」不是「在用」,与刚删掉的镜像同病 |

### 4. 注释纪律(去冗的另一半)

- 机器盖章注释(各 `render()`/`write()` 硬编码文案)收敛到**每节至多一行字段语义**;「人手注释保存会被抹掉」的已知代价不变,提示保留。
- **碑文一律删、不迁**(评审拍定,P4):历史口径(「没有第六类别」「drag_scope 已删」这类)死在 git 历史里;有现行约束价值的解释已在对应 Rust doc-comment,不造第二份。
- **`metrics.toml` 顶部注释整段保留**——它是 skills 引用的填写格式正本,属于「真」。

### 5. 迁移口径

- **pre-flight(评审拍定,F4)**:施工前逐台机器查 `<asset_root>/projects.toml`,列出全部在管项目定处置。本机(macOS)已验:注册表文件尚不存在,零库时代未接管过项目,敞口=本仓;**Windows 机待验**(`D:\builders-workbench\data`),没验就在 MR 里如实标注。
- 不写迁移代码、不双读旧路径。本仓自己的 `.bw/` 随实现批搬迁(搬迁 commit 内 `state/managed.toml` 同步重记全部条目的新路径+新指纹)。其它旧布局项目:重新接入铺底;旧位置文件作为非 Workbench 资产如实并存,资产盘点剧本盘出,由人处置。

### 6. 版本

`standard/VERSION` 5.10 → **6.0**(评审拍定:布局级不兼容变更用大版本)。

### 7. 合入序(评审拍定,F6/P1)

commit 序按「先删谎、再翻路径、后改语义」,每个 commit 自洽:

1. **去冗**(旧布局上瘦身,含 tests/examples 同步)——**可独立合入**:布局若在 gate 有分歧,这个 commit 单独成 PR 先合,谎言不多活一天;
2. **路径翻转**(一个原子 commit):全部机械改路径 + 本仓 `.bw/` 搬迁 + managed 重记——中间态不自洽的路径改动不许拆散;
3. **语义变更**:名片对账摘要、配置屏文案写死、`save_tool_mapping` 写后同步指纹;
4. **守卫与版本**:R6 守卫、VERSION 6.0、文档对齐。

机械 diff 与语义 diff 分 commit,评审各看各的。

## 操作逻辑(主路径 / 分支 / 出错)

- **主路径**:接入铺底 → `PROJECT.md`(顶层)+ `config/issue-policy.toml` 落盘 → `state/managed.toml` 最后记指纹;名片编辑与远端 Intent UX 读写 `config/project.toml`;配置屏保存映射 → 写 `config/issue-policy.toml` **并同步 managed 指纹**;运作活①写 `config/metrics.toml`;采集追加 `state/metrics-readings.jsonl`;名片「规范」格每次现算对账摘要。
- **分支(旧布局项目)**:`state/managed.toml` 不存在 = 视同未接管,boot 照常提议铺底;旧位置文件不迁不删,如实并存。
- **出错**:`config/` 文件含未知字段(含旧版残段)→ `deny_unknown_fields` 解析失败 → 壳的 `read_or_warn` 黄条如实报文件名与错误,不猜不兜;定时/映射按「没配」处理。新格式文件遇旧二进制同理整份拒读——响亮失败,可接受(单人场景二进制与规范同机同步)。

## FAQ 硬问题

- **为什么不留旧路径兼容?** AGENTS.md 纪律;本机注册表已验为空,兼容层只服务不存在的用户;Windows 侧 pre-flight 兜底。
- **为什么是三个子目录不是一个?** `config/` 与 `state/` 的写权归属相反(人拍板 vs 机器自写),混放就回到「谁写的靠注释解释」的原点;且这条边界由 R6 守卫看住,不是纸面承诺。
- **配置屏直写 config/,还算「人拍板」吗?** 算:落盘由人当场点击触发,且写后同步指纹让对账保持诚实。但同一目录两种写入政策(直写 vs 活+MR)是真实的不一致,本批如实记录不掩饰,统一交互另立活。
- **为什么删 `[[tool]]`/`[review]` 而不是把它们实现?** 今天没有任何行为等着这些字段驱动;先删假的,真需要时按特性起手路径立项(留白如实标未建)。
- **手写注释还会被抹吗?** 会。界面保存仍整份重写,这是已认的代价;要留讲解就写进顶层 Markdown 或 docs。

## 明确不在本批(有主的,不散落)

- **统一 issue-policy 的写入交互**(直写 vs 活+MR):本批只修指纹同步,不改交互;是否统一走 MR 另立活议。
- **工具名三处硬编码收拢单点**(`tools.rs::probe` / `agent_for` / `probe_env`):真实重复,且 name-drift 有案发记录(probe_env 里 codehub vs codehub-cli 那段注释)。删 `[[tool]]` 假接缝后这是剩下的真问题,留白记录,建议单独立活。
- **看板列标题可配性去留**(`pool_label`/`todo_label`):有消费者但无客户的可配项,下一刀候选,本批不动。
- `.bw/plan/` 与 `releases.md`(只改引用路径);kb 屏除清单外不重构;`scripts/` 机制;不新增对账能力。

## 要求与验收

- **R1 旧路径清零**:全仓(crates 含 **tests 与 examples** / standard / docs / e2e)grep 不到旧路径字符串(`.bw/project.toml`、`.bw/issue-policy.toml`、`.bw/standard.toml`、`.bw/managed.toml`、`.bw/metrics.toml`、`.bw/metrics/readings.jsonl`);史料(CHANGELOG、changes/、adr、plan/ 归档)除外。
- **R2 死代码清零**:`ToolDecl`、`ReviewPolicy`、`standard_file` 及对应模板段全仓不复存在(含 `crates/bw/tests/repo_files.rs` 的引用)。
- **R3 门禁全过**:fmt / clippy / 壳编译 / 全部守卫(含新增 R6)/ cargo test。
- **R4 E2E 读回**:新接入项目铺底后 `cat .bw/config/issue-policy.toml`(瘦身后格式);深链开总览读回名片对账摘要、看板两列标题;到点 tick 建「资产盘点」活;**配置屏保存一次映射后读回 `state/managed.toml`,指纹已同步、对账仍一致**。
- **R5 自狗食对账**:本仓 `.bw/` 搬迁后,对账全条目 UpToDate;`git status` 无旧位置残留。
- **R6 写权守卫**:`guard-bw-write-authority.sh` 进门禁与 CI——静态断言 `.bw/config/`、`.bw/state/` 的写入调用点仅在白名单模块(实现口径见 plan;守卫自测:故意加一处越权写,守卫必须红)。
