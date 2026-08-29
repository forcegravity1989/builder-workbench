# Plan · `.bw/` 人机分目录 + 去冗留真(实现序与风险)

> **30 秒导读**:实现顺序与已识别的坑。plan 不升 gate(无大风险决策,落点机械);正本拍板在 `spec.md`(合入序=spec §7)。经对抗评审修订:commit 按「先删谎、再翻路径、后改语义」重排,tests/examples 有了归属批。

## 第 0 步 · pre-flight(施工前)

逐台机器查在管项目注册表 `<asset_root>/projects.toml`:macOS(`~/Library/Application Support/BuildersWorkbench/assets/`)**已验——文件不存在,敞口=本仓**;Windows(`D:\builders-workbench\data`)待验,没验就在 MR 描述里如实标「Windows 侧未验」。查到在管项目就逐个列出定处置,不闷头翻路径。

## commit 序(对应 spec §7,每个 commit 门禁全过、自洽)

1. **去冗(可独立合入)**:`issue_policy_file.rs` 删 `ToolDecl`/`ReviewPolicy`/trigger 两字段/`schema_version`,`render()` 注释减到每节一行;`project_file.rs` 删 `standard_version`;删 `standard_file.rs` + `repo/mod.rs` 声明 + `STANDARD_TMPL` + 铺底 `meta` 条目;`standard/templates/` 两份模板内容瘦身;**同步 `crates/bw/tests/repo_files.rs`(47 行起明引 `who_can_merge`)与 `crates/bw/examples/` 内引用**;本仓 `.bw/` 三份 toml 内容瘦身 + managed 指纹重记(路径未动)。
2. **路径翻转(一个原子 commit)**:六个 `REL_PATH` 常量 + `CORE_TEMPLATES` target + `bootstrap.rs` + 引擎常量(`github.rs::PROJECT_FILE_REL_PATH`、`codehub.rs` 远端取文件)+ `vm_kb.rs` 清单 + `standard/`(templates/skills/system-prompt 约 30+ 处路径)+ `docs/` + `e2e/` + `examples/` + 本仓 `.bw/` 实物搬迁 + `state/managed.toml` 路径条目重记。机械改路径不许拆散——拆散的中间 commit 检出即坏(内核新路径、壳旧路径,看板/定时/名片全灭)。
3. **语义变更**:名片「规范」格改对账摘要(读 `state/managed.toml`,最低版本 + 异常件数);配置屏定时文案写死「人触发/定时」;`save_tool_mapping` 写 config 后同步 managed 指纹(修「app 写入被记成人改」的现状 bug)。
4. **守卫与版本**:`guard-bw-write-authority.sh` 进 AGENTS 门禁清单与 CI;`standard/VERSION` → 6.0;AGENTS 顶层导览、`docs/architecture.md`、CONTEXT.md、指南、CHANGELOG 对齐。
5. **验收**:R1 grep 断言、R4 E2E 深链读回(含保存映射→指纹同步)、R5 对账、R6 守卫红绿自测(故意越权写一次,守卫必须红,再撤)。

## R6 守卫实现口径

双断言,起步从紧:
- `.bw/config/`、`.bw/state/` 的**路径常量定义**只允许出现在 `crates/bw/src/repo/`(各 `REL_PATH`)与 `crates/bw/src/standard/`(铺底 target);
- 对这些文件的**写调用**(`write_file` / 各 `*_file::write`)只允许出现在白名单模块(`repo/*`、`standard/bootstrap.rs`、`app/tools.rs`、`app/project.rs`、`app/collect.rs`——以实现时实际写点为准收口);`app-shell` 与 `bw-engine` 不得出现写调用。
文档/史料出现字面路径属正常,守卫只查 crates/。误报宁可人工放行,不放宽正则。

## 风险

1. **managed.toml 指纹要重记两次**:commit 1(内容变)与 commit 2(路径变)各一次,漏一次下次对账全判「人改过」。两个 commit 的验收都含「对账读回一致」。
2. **deny_unknown_fields 的前向口径**:版本信号由 managed.toml 逐文件承担;人改过的文件其 managed 版本只代表最后一次铺底(边角如实认)。新格式文件遇旧二进制整份拒读=响亮失败,单人场景可接受。
3. **路径字符串基数大**(55+ 文件):机械但漏改即隐性坏,R1 grep 断言兜底;commit 2 完成后立即跑一次 R1,不等到最后。
4. **名片对账摘要**:vm 重拼每次多读一次小文件,与既有 issue-policy/metrics 现读同量级;摘要口径(最低版本+异常件数)若 gate 上有异议,只影响 commit 3 一处函数。
5. **Windows 注册表未验**:pre-flight 兜;查出在管项目则该项目按「重新接入」处置并在 MR 里点名。
6. **守卫误伤**:白名单从紧起步,新增合法写点时明改守卫(diff 可见),不预留宽松正则。
