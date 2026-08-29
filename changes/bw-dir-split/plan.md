# Plan · `.bw/` 人机分目录 + 去冗留真(实现序与风险)

> **30 秒导读**:实现顺序与已识别的坑。plan 不升 gate(无大风险决策,落点机械);正本拍板在 `spec.md`(合入序=spec §8)。经三轮对抗评审修订:commit 重排、白名单补全、判据锚点切换与孤儿条目摘除有了归属。

## 第 0 步 · pre-flight(施工前)

逐台机器、**逐 data_dir 分支**查注册表 `<asset_root>/projects.toml`:

| 分支 | 路径 | 状态 |
|---|---|---|
| macOS | `~/Library/Application Support/BuildersWorkbench/assets/` | **已验:文件不存在,敞口=本仓** |
| Windows(有 D 盘) | `D:\builders-workbench\data\assets\` | 待验 |
| Windows(无 D 盘) | `%APPDATA%\BuildersWorkbench\assets\` | 待验 |
| Linux | `~/.local/share/builders-workbench/assets/` | 待验(本仓无 Linux 机,如实标) |
| `BW_DB` env 覆盖 | 其 parent 目录下 `assets/` | 待验(检查两台机的 shell 配置有没有设它) |

查出在管项目就逐个列出定处置,没验的机器在 MR 描述里如实标注,不闷头翻路径。

## commit 序(对应 spec §8,每个 commit 门禁全过、检出自洽)

1. **去冗(可独立合入)**:
   - `issue_policy_file.rs` 删 `ToolDecl`/`ReviewPolicy`/trigger 两字段/`schema_version`,`render()` 注释减到每节一行;`project_file.rs` 删 `standard_version` 与渲染段;
   - `standard.toml` **整份删除**(不是瘦身,评审 C9):删 `standard_file.rs` + `repo/mod.rs` 声明 + `STANDARD_TMPL` + 铺底 `meta` 条目 + `vm_kb.rs:69` 那一整行(删除,不是改路径,评审 C3)+ 本仓 `.bw/standard.toml` 实物 + **本仓 managed.toml 里它的孤儿条目**(评审 C1);
   - **ops③ 判据锚点**:`vm_derive.rs:49` 的 `path_in_head(".bw/standard.toml")` 改查 managed.toml(经 `managed_file::REL_PATH`,翻转自动跟,评审 A1);
   - **三处版本显示改对账摘要**(评审 A7):总览名片 / `kb/mod.rs:22-25` / `config/mod.rs:340-343`,数据源 `vm_build.rs:644` 一处改;摘要口径=spec §4;
   - tests(`repo_files.rs`)/examples 同步;本仓 project.toml / issue-policy.toml 内容瘦身(**managed 条目不重盖指纹**,评审 A2);
   - 悬空注释顺手收:`standard/mod.rs:9-10,20`、`interactive_cli.rs:542`(评审 A18)。
2. **路径翻转(一个原子 commit)**:五个搬动文件的路径常量(`repo/*` 的 `REL_PATH` 与 `readings_file.rs` 的 **`REL`**——名字不同,按字符串搜不按标识符搜,评审 C8)+ `CORE_TEMPLATES` target + `bootstrap.rs` + 引擎常量(`github.rs::PROJECT_FILE_REL_PATH`、`codehub.rs`)+ `vm_kb.rs` 余下清单行 + `standard/`(templates/skills/system-prompt)+ `docs/` + 仓根 `AGENTS.md`/`CONTEXT.md`/`README.md`(评审 C5)+ examples + **`VERSION → 6.0`**(评审 A3:与翻转同 commit,拆开必出对账错乱的中间态)+ 本仓 `.bw/` 实物搬迁 + managed 条目 **path 重记(version/fingerprint 不动)**。**代码级路径拼接清单**(字面 grep 吃不到,逐个核):`readings_file.rs` 的目录建立(`.bw/metrics/` → `.bw/state/`)、`vm_kb.rs` 的 `PLAN_DIR`/`RELEASES_PATH`(不动,核对即可)。
3. **写权语义**:`save_tool_mapping` 指纹同步(spec §1.2 细则:先 config 后 managed;清单不存在不建不同步;失败报错点名)+ 配置屏定时文案写死「人触发/定时」。
4. **守卫与文档**:`guard-bw-write-authority.sh` 进 AGENTS 门禁清单与 CI;`docs/architecture.md` 修谎(§2 deny 句、五解析器改四,评审 A17)+ CONTEXT.md 登记「写权」+ AGENTS 顶层导览 + 指南 + CHANGELOG。
5. **验收**:R1–R6 全跑(R1 在 commit 2 完成后先跑一遍,不等最后),证据记进活 #133。

## R6 守卫实现口径(评审 A4/A9/A10/C2 修订)

**只断言写调用点,不查常量定义**(bw-engine 拿 `config/project.toml` 常量做远端只读是合法的):

- 断言:`issue_policy_file::write` / `project_file::write` / `managed_file::write` / readings 追加写(`OpenOptions` append,`readings_file.rs`)的调用点仅在白名单;
- 白名单(按现状写调用点核齐,评审 C2/A10):`crates/bw/src/repo/*`(定义处)、`crates/bw/src/standard/bootstrap.rs`、`crates/bw/src/app/tools.rs`、`crates/bw/src/app/project.rs`、**`crates/bw/src/app/plan.rs`**、**`crates/bw/src/app/bootstrap.rs`**、`crates/bw/src/app/collect.rs`;`crates/*/tests/`、`crates/*/examples/` 豁免;
- `app-shell` 与 `bw-engine` 零写调用(现状断言,评审 C 组已核实成立);
- 「写 config 必须跟指纹同步」是**数据流不变量,静态守卫不兜**(评审 A10:守卫查模块归属对这类 bug 天生是绿的)——由 R4 的行为验收兜(保存映射→读回指纹);
- agent 按剧本写 `config/metrics.toml` 不在守卫覆盖内(Rust 侧本来就零写方,评审 A9),spec 已如实声明;
- 自测双向:故意加一处越权写必须红;现状代码必须绿(白名单不齐守卫就会不战自红,评审 C2)。

## 风险

1. **managed.toml 自引用**:commit 1 摘孤儿条目、commit 2 重记 path——都只动该动的字段;任何一步顺手「重记指纹」都等于盖假章(评审 A2),两个 commit 的验收都含「对账结论逐条与改前一致」。
2. **deny_unknown_fields 前向口径**:版本信号由 managed.toml 逐文件承担;新格式遇旧二进制整份拒读=响亮失败,单人场景可接受。metrics 豁免 deny 是既有取舍,别顺手「统一」掉(评审 A8)。
3. **路径字符串基数大**(55+ 文件):R1 仓根全量 grep 兜底 + 拼接清单逐核;commit 2 完成后立即跑 R1。
4. **对账摘要口径**:分母=managed 条目、过期不计异常、孤儿必摘、空清单显「—」——四个分支都在 spec §4,实现别自己发挥;gate 上若对口径有异议,只影响 `vm_build.rs` 一处函数。
5. **注册表分支多**:pre-flight 表逐条走;查出在管项目按「人显式处置后重新接入」执行并在 MR 点名。
6. **守卫误伤**:白名单按第 0 步之后的**实际调用点 grep 结果**收口,不抄本 plan 的清单了事;新增合法写点时明改守卫。
7. **指纹同步的已知代价**(spec §1.3):二次铺底入口今天未接 UI,风险待爆不已爆;ManagedEntry 标记方案归「统一写入交互」后续活,本批不扩。
