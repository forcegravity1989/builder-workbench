# Workbench 自带的技能库(唯一正本目录)

> **30 秒导读**:Workbench 自带的全部技能住在这里 —— **一个目录、全部平级**,一个技能一个
> 子目录,里面一份 `SKILL.md`。怎么写 skill、SOP 是哪一节,正本在
> [`SKILL-MD-SPEC.md`](SKILL-MD-SPEC.md)。分层听上一级 [`../README.md`](../README.md)。
> 开工时摊到 Workbench 资产目录,提示词只给名字 + 一句话 + 路径。见
> `crates/bw/src/standard/skills.rs`。

## 写法

写或改 `SKILL.md` 前读 [`SKILL-MD-SPEC.md`](SKILL-MD-SPEC.md)。SOP 是各份正文第 4 节「标准执行流程」,不写在本 README。

## 四份运作剧本(Workbench 自己发起的标准动作)

| 活的 `workflow` 字段 | 目录 | 谁触发 | 一次会话大概 |
|---|---|---|---|
| `更新指标与版本计划` | `week-planning/` | 人(总览横幅「开始本版本」) | 20-40 分钟,人机 3-6 轮 |
| `资产盘点` | `asset-audit/` | 定时(默认周五 09:00)或接入老仓时一次 | 10-25 分钟,通常 0 轮 |
| —(子技能) | `metrics-refresh/` | `week-planning` 第二步指名调用 | 随宿主 |
| —(子技能) | `project-handbook/` | 剧本在、产品不自动开首次会话;盘点只记报告 | 未自动接 |

项目约定**没有剧本** —— 不起 agent,只把 `.bw/project.toml` 写到常驻树 `bw/project`。

## workflow 入口(业界 SOP 链,Workbench 写入口 body 指向 vendor 库)

归一:workflow 注入和运作剧本走**同一个** `skill_pointer`→`SkillPack` 机制。运作剧本
body 自足;workflow 入口 body 是 SOP 链 + 指向 `../vendor/` 库子技能路径(库由
`ensure_vendor_assets` 摊到 `<asset>/vendor/`)。

| 活的 `workflow` 字段 | 目录 | body 指向 | 状态 |
|---|---|---|---|
| `mattpocock-skills` | `mattpocock-skills/` | `../vendor/mattpocock-skills/skills/engineering/` 下 grill-with-docs→implement→code-review | ✅ build 阶段产品默认,已打包 |
| `proto-design` | — | (源还没 vendor 进 `../vendor/`) | ⏸ 原型阶段默认,待 vendor + 入口 |

## 不预置方法论技能

这里**只有运作剧本,没有阶段方法论技能**。原来预置过六份「阶段方法论」
(`evidence-first` 原型 / `spec-to-tests` 构建 / `baseline-before-touch` 优化 /
`fresh-eyes-funnel` 运营推广 / `breaking-drill` 运维 / `competitive-analysis` 竞品),
但默认 workflow 没打包、`skill_slug` 也不识别,一份没被真正派发过——属「预先搞的
一堆没用的」。2026-08-24 删光:

- **阶段方法论该由业界 workflow 提供**(build 默认 `mattpocock-skills`、原型
  默认 `proto-design`,见 `../vendor/`),Workbench 每个环节只挑一个最好的默认;
- **阶段规范约束**(指标铁律、改仓规则)不叫方法论,归 `../system-prompt/references/`,
  按活注入提示词,不进 `skills/`;
- 真要从实践里长出 Workbench 自己的方法论,**到时候再单独建,不预置**。

(`north-star-discovery` / `metrics-binding` 早前并入 `metrics-refresh`;
`metrics-render` 整份删过——踩在 V4 不存在的东西上。这几份原文件随 V3 已删。)

## 版本

改了内容在这里记一行。技能不进用户仓,没有项目侧指纹账。不另开 `VERSION` 文件。

- 5.17:写作正本 `SKILL-MD-SPEC.md`;五份现行 SKILL.md 按规范重写。`mr-review` 未动。
- 5.16:SYSTEM 只留 AGENTS.md 入口、任务→reference 对照、三条纪律。
- 5.15:SYSTEM + 三份现行 reference 按层削薄(采集 / 评论格式 / 改仓增量)。
- 5.14:系统提示词给项目正本地图 + 运作活①四段进度;评论校验脚本随 week-planning 摊出。
- 5.12:名片只留 project.toml;开工约定不再写工具声明;不再铺 standard.toml / managed.toml;周盘点清旧件。
- 5.11:运作活①确认 `v0.x`、纳入打 `bw:plan:v0.x`;对人说版本目标;不再写 `bw:week:*`。
- 5.10:运作活①指标单独确认、纳入先看已有 issue、打周标签后挂里程碑;周目标整段展示。
