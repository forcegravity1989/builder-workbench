# Intent · `.bw/` 人机分目录 + 配置去冗留真

> **30 秒导读**:这是什么——本次变更的**意图件**:把 `.bw/`(Workbench 铺进被管项目的资产目录)按「给人读的 / 给机器解析的」分目录隔离,同时删掉审计实锤的假配置与死文件。给谁看——审这条产物链的人、以及接手实现批次的会话。现在作数吗——**方向已拍板,规格待 gate**(2026-08-29 发起人定向,具体布局与删除清单见同目录 `spec.md`,等人审)。

**发起人**:Gravity(2026-08-29 会话定向,原话见引文)。**状态**:方向已接受,规格在 gate。**承载**:活 [#133](https://github.com/forcegravity1989/builder-workbench/issues/133)(2026-08-29 补建——「先建活」当时未成文,这个缺口本身催生了同批 02/AGENTS 制度补丁)。

## 问题

2026-08-29 对 `.bw/` 五份文件做了一次「谁读谁写」的全链审计,两个问题实锤:

1. **人机混放**。`.bw/` 顶层同时躺着给人读的章程(`PROJECT.md`)和给机器逐字段解析的配置(`project.toml` / `issue-policy.toml` / `managed.toml` / `standard.toml`),还有机器写的流水(`metrics/readings.jsonl`)。打开目录分不出「哪份该人编、哪份机器管」。(注:「注释过多」的直接原因是下条的假配置需要散文解释 + 各 `render()` 硬编码文案,由注释纪律与去冗解决;目录隔离解决的是「分不清谁写谁读」——两个问题相关但不是因果,评审轮 F5 已把这句掰直。)
2. **假配置**。一部分字段/文件解析了但**零消费**,注释还在为不存在的行为背书:
   - `issue-policy.toml` 的 `[[tool]]` 段四个字段(`kind`/`probe`/`version_cmd`/`capabilities`)无任何代码读——探活与工具→CLI 解析全部硬编码在适配模块(`tools.rs::probe` / `agent_for` / `probe_env`);
   - `[review]` 整段(`who_can_merge`/`require_pr_for`)除测试外零消费;
   - `ops1_trigger`/`ops2_trigger` 只用于配置屏显示文字,调度器不检查它们(只看 `ops2_schedule` 非空)——把 trigger 改成 `manual` 定时照样触发,是躺着的谎言;
   - `schema_version` 无人校验(metrics 文件有校验,这份没有);
   - `standard.toml` **整份写了没人读**:解析器 `standard_file.rs` 全仓零调用,文件头却声称「Workbench 用它做对账」——实际对账正本是 `managed.toml` 指纹;
   - `project.toml` 的 `standard_version` 镜像已失真(本仓自己就是 5.0 vs standard.toml 的 5.8),因为没有代码维护这个一致性。

## 定向原话(约束的来源)

1. 「给人看的,给 agent 看的,需要用目录隔离下。」
2. 「你说的很对,我们要去冗留真。」(指上述审计结论:删假配置、注释收敛到真行为)

## 对齐 03(飞轮检验)

被管仓里的可见物是单人构建者信任 Workbench 的根基(「界面每个数都要问谁写的」)。假配置和失真镜像让人以为改文件能改行为、以为版本号是活的——直接侵蚀这条。分目录 + 去冗后,`.bw/` 本身变成「谁写的」问题在文件系统层的答案。

## 盼到的结果

- 打开任何被管项目的 `.bw/`,不看文档就能分辨:顶层 Markdown 全是给人(和 agent)通读的;`config/` 是人经 MR 改、机器读的;`state/` 是机器写、人只审的。
- 配置文件里**每一个字段都有消费者**;每一行机器盖章的注释都描述真实行为,一节至多一行。
- `standard.toml` 这类「写了没人读」的文件不存在;历史决策讲解迁去 `docs/` 或 Rust doc-comment,不占数据文件。

## 影响的用户与系统

单人 Builder(被管仓 `.bw/` 布局全变);`crates/bw`(repo 解析器、standard 铺底)、`crates/bw-engine`(远端取 `project.toml` 的路径常量)、`crates/app-shell`(知识库清单、配置屏文案、名片规范版本);`standard/`(模板、skills、系统提示词里约 30+ 处路径);本仓自己的 `.bw/`(随批搬迁);`docs/architecture.md`、AGENTS.md 导览、指南。

## 约束

- **不留兼容路径**(AGENTS.md 纪律):不写迁移代码、不双读旧位置。迁移敞口经核查:本机(macOS)注册表 `projects.toml` 尚不存在——零库时代未接管过项目,敞口=本仓,随实现批搬;**Windows 机注册表待验**(pre-flight,见 plan 第 0 步),查出在管项目按「重新接入」处置。
- `metrics.toml` 顶部注释是 skills(metrics-refresh / week-planning)引用的**格式正本**,属于「真」,不许剪。
- 删除假配置后,行为的正本如实指向代码(适配模块),不造第二份纸面正本。

## 原未决问题(评审轮已拍定,规格 gate 可推翻)

1. 名片「规范」格:**对账摘要**(从 `state/managed.toml` 现算最低版本+异常件数),不取 max——max 是「最近铺过」不是「在用」,与被删的镜像同病(评审轮 F3)。
2. `standard/VERSION` → **6.0**:布局级不兼容变更用大版本。
3. `.bw/plan/` 与 `releases.md` 本批不动,只改引用路径。

评审轮另拍三条进 spec:config/ 写权硬规则与指纹同步(F1)、写权守卫 R6(F2)、去冗 commit 可独立合入的降级路径(F6)。两轮对抗评审记录见 STATUS。
