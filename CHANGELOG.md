# CHANGELOG.md

版本变更记录:每次合入记"本次做了什么"。决策动机进 [`docs/adr/`](docs/adr/),不写这里。buddy MVP 起记(2026-08-24);MVP 之前的 V1/V2/V3 史实在 git 历史与 `docs/archive/`,不补抄。

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
