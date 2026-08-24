# CHANGELOG.md

版本变更记录:每次合入记"本次做了什么"。决策动机进 [`docs/adr/`](docs/adr/),不写这里。buddy MVP 起记(2026-08-24);MVP 之前的 V1/V2/V3 史实在 git 历史与 `docs/archive/`,不补抄。

## [buddy MVP] — 2026-08-24 起

仓整改成 buddy 自己推给被管项目的规范(dogfood):顶层文档集收敛到 grillme 那套(`AGENTS.md` 唯一开发规矩正本、`CLAUDE.md` 一行导入、`README`/`CHANGELOG`/`CONTEXT`/`DESIGN` 各守边界);V3 文档/skill 断舍离(`docs/v1~v3-prototype/` 残件删、`.claude/skills/` 4 个 V3 旧 skill 删、`docs/v4-prototype/design.md` 拆成 `docs/modules/<特性>.md` 各份自足设计);"V4"框去掉,就是新 buddy 的 MVP。V3 六 crate 代码冻结不动(判据没满足),见 `AGENTS.md` 的 V3 备注。

- 顶层文档:`AGENTS.md` 重写为开发手册(吸收原 CLAUDE.md 实质 + 脱 V3 框);`CLAUDE.md`→`@AGENTS.md` 一行。
- 删:`docs/v1-prototype/`、`docs/v2-prototype/`、`docs/v3-prototype/`、`.claude/skills/{buddy-bugfix,buddy-feature-dev,practice-buddy-landing,v1-product-delivery}`。
- 留(V3 编译资产,随 V3 一起冻结/删):`docs/skills/`(`bw-core` include_str!)、`docs/buddy/`(`bw-core` include_str!)。
- 注释:`v4-engine/src/pty_backend.rs`、`terminal_manager.rs` 两处指向已删目录的悬空引用,改指 archive 或删行。
- 拆设计:`docs/v4-prototype/design.md`(1099 行,先存快照进 archive)拆成 `docs/modules/` 16 份自足模块设计。
- 规范正本:三来源两路径模型落 `docs/convention.md`,`DESIGN.md` 指向各模块设计。
- 代码 gap:`standard/05-issue-policy/issue-policy.toml.tmpl` 默认 workflow 诚实化(不默认指向 buddy 没打包的 mattpocock/proto-design,标"打包未实现")。full bundle 留后续。
