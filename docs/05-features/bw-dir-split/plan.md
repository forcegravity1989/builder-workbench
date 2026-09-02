# Plan · `.bw/` 人机分目录 + 去冗留真(实现顺序与风险)

> **30 秒导读**:实现顺序与已识别的坑。plan 不升 gate(没有大风险决策,落点都是机械活);拍板正本在 `spec.md`(提交顺序=spec §8)。经三轮对抗评审修订:提交顺序重排、守卫白名单补全、判据改锚与清单遗留记录的摘除都有了归属。

## 第 0 步 · 施工前核查

逐台机器、**逐个数据目录分支**查在管项目清单 `<asset_root>/projects.toml`:

| 分支 | 路径 | 状态 |
|---|---|---|
| macOS | `~/Library/Application Support/BuildersWorkbench/assets/` | **已查:文件不存在,受影响的只有本仓** |
| Windows(有 D 盘) | `D:\builders-workbench\data\assets\` | 待查 |
| Windows(无 D 盘) | `%APPDATA%\BuildersWorkbench\assets\` | 待查 |
| Linux | `~/.local/share/builders-workbench/assets/` | 待查(手头没有 Linux 机就如实标) |
| `BW_DB` 环境变量 | 它的上级目录下 `assets/` | 待查(看两台机的 shell 配置有没有设它) |

查出在管项目就逐个列出定处置;没查的机器在 MR 描述里如实标注,不闷头改路径。

## 提交顺序(对应 spec §8,每个 commit 门禁全过、检出自洽)

1. **去冗(可单独先合入)**:
   - `issue_policy_file.rs` 删 `ToolDecl`/`ReviewPolicy`/trigger 两字段/`schema_version`,写文件时的注释减到每节一行;`project_file.rs` 删 `standard_version` 与对应渲染段;
   - `standard.toml` **整份删除**(不是瘦身):删 `standard_file.rs` + `repo/mod.rs` 声明 + 模板 + 铺底清单条目 + `vm_kb.rs:69` 那一整行(删掉,不是改路径)+ 本仓 `.bw/standard.toml` 实物 + **本仓 managed.toml 里它遗留的那条记录**;
   - **运作活③完成判据改锚**:`vm_derive.rs:49` 今天查 `.bw/standard.toml` 在不在 git 提交里,改成查 managed.toml(经 `managed_file::REL_PATH` 常量引用,commit 2 换路径时自动跟上);
   - **三处版本显示改用新算法**:总览名片 / `kb/mod.rs:22-25` / `config/mod.rs:340-343`,数据源在 `vm_build.rs:644` 一处改;算法=spec §4;
   - tests(`repo_files.rs`)/examples 同步;本仓 project.toml / issue-policy.toml 内容瘦身(**清单里的指纹不动**——重记指纹等于把人改过的文件谎报成机器原样);
   - 顺手收掉两处指着空气的注释:`standard/mod.rs:9-10,20`、`interactive_cli.rs:542`。
2. **换路径(一个 commit 一次换完,不拆)**:五个要搬文件的路径常量(`repo/*` 的 `REL_PATH` 与 `readings_file.rs` 的 **`REL`**——名字不一样,按字符串搜不要按标识符搜)+ 铺底模板落点 + `bootstrap.rs` + 引擎常量(`github.rs::PROJECT_FILE_REL_PATH`、`codehub.rs`)+ `vm_kb.rs` 余下清单行 + `standard/`(templates/skills/system-prompt)+ `docs/` + 仓根 `AGENTS.md`/`CONTEXT.md`/`README.md` + examples + **`VERSION → 6.0`**(和换路径必须同一个 commit,拆开会造出对账结果错乱的中间提交)+ 本仓 `.bw/` 实物搬迁 + 清单条目**只改路径(版本、指纹不动)**。**代码里拼出来的路径清单**(字面 grep 吃不到,逐个核):`readings_file.rs` 里建目录那步(`.bw/metrics/` → `.bw/state/`);`vm_kb.rs` 的 `PLAN_DIR`/`RELEASES_PATH` 不搬,核对确认即可。
3. **写入行为**:`save_tool_mapping` 写完同步指纹(spec §1.2 细则:先 config 后 managed;清单不存在不建不同步;失败报错点名)+ 配置屏定时文案写死「人触发/定时」。
4. **守卫与文档**:`guard-bw-write-authority.sh` 进 AGENTS 门禁清单与 CI;`docs/architecture.md` 纠错(§2 的 deny_unknown_fields 那句、「五个解析器」改四个)+ AGENTS 顶层导览 + 指南 + CHANGELOG。
5. **验收**:R1–R6 全跑(R1 在 commit 2 完成后先跑一遍,不等到最后),证据记进活 #133。

## R6 守卫实现口径(评审轮修订)

**只检查写入调用点,不检查路径常量定义在哪**(bw-engine 拿 `config/project.toml` 常量去远端只读是合法的):

- 检查:`issue_policy_file::write` / `project_file::write` / `managed_file::write` / 读数文件的追加写(`readings_file.rs` 里的 `OpenOptions` append)的调用点只出现在白名单;
- 白名单(评审轮按现状把调用点查全了,原清单漏了两处正常在用的):`crates/bw/src/repo/*`(定义处)、`crates/bw/src/standard/bootstrap.rs`、`crates/bw/src/app/tools.rs`、`crates/bw/src/app/project.rs`、**`crates/bw/src/app/plan.rs`**、**`crates/bw/src/app/bootstrap.rs`**、`crates/bw/src/app/collect.rs`;`crates/*/tests/`、`crates/*/examples/` 豁免;
- `app-shell` 与 `bw-engine` 里零写入调用(现状如此,评审轮已逐个核实);
- 「写 config 必须跟着同步指纹」是**行为层面的约束,静态检查查不出来**(守卫只认模块归属,这类问题在它眼里永远是绿的)——由 R4 的端到端验收兜(保存映射→读回指纹);
- agent 按剧本写 `config/metrics.toml` 不在守卫覆盖内(Rust 侧本来就没有写它的代码),spec 已如实说明;
- 双向自测:故意加一处白名单外的写入必须报红;现状代码必须全绿(白名单不齐,守卫上线第一天自己就是红的)。

## 风险

1. **managed.toml 既是清单又是被搬的文件**:commit 1 摘遗留记录、commit 2 改条目路径——都只动该动的字段;任何一步顺手「把指纹也重记了」都等于把人改过的文件谎报成机器原样,两个 commit 的验收都含「对账结论逐条与改前一致」。
2. **认不得的字段整份拒读**(deny_unknown_fields)的前后版本问题:版本信号由 managed.toml 逐文件承担;新格式文件遇旧程序整份拒读、当场报错,单人场景可接受。metrics 不做这个检查是既有取舍,别顺手「统一」掉。
3. **路径字符串基数大**(55+ 文件):R1 仓根全量 grep 兜底 + 拼接路径清单逐核;commit 2 完成后立即跑一遍 R1。
4. **名片版本显示的新算法**:界面每次重算多读一次小文件,与既有的现读现算同量级;算法的四个分支(算哪些、显示什么、过期不算异常、空清单显「—」)都在 spec §4,实现别自己发挥;gate 上若对算法有异议,只影响 `vm_build.rs` 一处函数。
5. **在管项目清单的存放位置有五个分支**:第 0 步的表逐条走;查出在管项目按「人自己处置后重新接入」执行,并在 MR 里点名。
6. **守卫误报**:白名单按第 0 步之后**实际查出来的调用点**收口,不照抄本 plan 的清单了事;以后新增合法写入点时明改守卫(diff 里看得见)。
7. **指纹同步的已知代价**(spec §1.3):二次铺底今天没有界面入口,这个风险还没真发生;清单条目加标记的方案归「统一写入方式」后续活,本批不扩。
