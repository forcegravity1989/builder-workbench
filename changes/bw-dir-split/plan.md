# Plan · `.bw/` 人机分目录 + 去冗留真(实现批次与风险)

> **30 秒导读**:实现顺序与已识别的坑。plan 不升 gate(无大风险决策,全是机械落点);正本拍板在 `spec.md`。

## 批次(每批独立 commit,门禁全过)

1. **内核**:`crates/bw/src/repo/*` 六个 `REL_PATH` 常量改新路径;`issue_policy_file.rs` 删 `ToolDecl`/`ReviewPolicy`/trigger 两字段/`schema_version`,`render()` 注释减到每节一行;`project_file.rs` 删 `standard_version` 与对应渲染段;删 `standard_file.rs` + `repo/mod.rs` 声明;`standard/mod.rs` 删 `STANDARD_TMPL` 与 `meta` 条目、`CHARTER_REL_PATH` 不动、`ISSUE_POLICY` target 改 `config/`;`bootstrap.rs` managed 路径改 `state/`;`readings_file.rs` 改 `state/metrics-readings.jsonl`。
2. **引擎**:`bw-engine` `github.rs::PROJECT_FILE_REL_PATH`、`codehub.rs` 远端取文件路径、`remote.rs`/`interactive_cli.rs` 注释里的路径。
3. **壳**:`vm_kb.rs` 知识库清单(删 standard.toml 行、其余改路径);配置屏定时文案写死「人触发/定时」;`vm_build.rs` 名片「规范 vX」改读 `state/managed.toml` 现算;onboard/overview 文案里的路径。
4. **规范包**:`standard/templates/` 三份模板内容与内嵌路径;`standard/skills/` 与 `standard/system-prompt/` 约 30+ 处路径字符串;`standard/README.md`;`VERSION` → 6.0。
5. **自狗食搬迁**:本仓 `.bw/` 实物搬 + 瘦身,`state/managed.toml` 重记路径与指纹;`docs/architecture.md`、AGENTS.md 顶层导览、CONTEXT.md、`docs/guide/` 对齐;碑文注释迁入 architecture 对应模块段。
6. **验收**:R1 grep 断言、R4 E2E 深链读回、R5 对账。

## 风险

1. **managed.toml 自引用**:搬迁批不重算指纹 → 下次对账全判「人改过」。批 5 必须原子完成「搬文件 + 重记条目」。
2. **`deny_unknown_fields` 双刃**:实现后旧格式文件若被放进新路径会整份拒读(黄条)。可接受——如实报错优于静默吞段;spec 操作逻辑已写明。
3. **路径字符串散在文档与 e2e**:纯机械但基数大(55+ 文件),漏改靠 R1 的 grep 断言兜,不靠人眼。
4. **名片「规范 vX」改现算**:vm 重拼每次多读一次小文件;与既有 issue-policy/metrics 现读同量级,可接受。若评审选「先撤下这格」(未决 1),此风险消失。
