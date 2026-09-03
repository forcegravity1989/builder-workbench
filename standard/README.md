# standard/

Workbench 规范正本。编译期 `include_str!` 进二进制——改这里就是改产品行为。
不进被管仓。接入只写名片 `.bw/project.toml`(项目约定常驻树),不摊本目录。

从仓根 [`AGENTS.md`](../AGENTS.md)「三层模型」点过来。主提示词 / reference / skill 注入对照见 [`docs/architecture.md`](../docs/architecture.md) §3 模块 4。

## 系统提示词 / reference / skill 各写什么

被管仓里的模型看不见 Workbench 源码,也默认不认识 `.bw/`。这三层只补它看不见的,各写一层:

| 层 | 补什么 | 现在(第一层:转得顺) | 先不写(第二层:少问人) |
|---|---|---|---|
| SYSTEM | 哪张活、项目入口、哪类活加载哪份 reference、和 BW 状态机怎么配合 | 索引 + 全场纪律 | 四段 gate、代填正本 |
| reference | `.bw/`、评论、标签、灯、界面认什么 | 格式/落点/失败怎么说 | 北极星该量什么、打分 |
| skill | 这场怎么带人 | 走到哪、一次问一件。写法正本 [`skills/SKILL-MD-SPEC.md`](skills/SKILL-MD-SPEC.md)；SOP 是各份 `SKILL.md` 第 4 节 | 熟练后自动走完 |

一句只住一处。后一层只点名,不复述。过时词直接删。

## 现行结构

| 路径 | 干什么 | 决策 |
|---|---|---|
| `templates/` | `.bw` 格式样例 | 接入不摊。指标空壳跟人走运作活① |
| `system-prompt/` | 开工注入的主提示词 + 阶段规范 | 不进项目仓;提示词只给路径,正文按需读 |
| `skills/` | 运作剧本 + 构建默认 workflow 入口 | 摊到 Workbench 资产目录,不复制进用户仓 |
| `vendor/` | 业界 workflow 原样副本 | 入口在 `skills/`;库摊到 `<asset>/vendor/` |

仓根 `AGENTS.md` / `CLAUDE.md` 是项目自己的,不在这套里,盘点不代写。

## templates/

| 文件 | 干什么 | 决策 |
|---|---|---|
| `metrics.toml.tmpl` | 指标定义格式(`schema_version = 2`) | 不预铺空壳 |
| `scripts/*.py` | 现成采集脚本(仓统计 + 过程指标) | 运作活① 荐入时才进项目 `.bw/scripts/` |
| `process-catalog.md` | 过程指标目录 | 有播种才有 |
| `issue-policy.toml.tmpl` | 旧开工约定样例 | **仅残留测**。产品不读、不铺;盘点整份删 `.bw/issue-policy.toml` |
| `design/` | 设计稿落点说明 | 不摊 |

## system-prompt/

| 文件 | 干什么 | 决策 |
|---|---|---|
| `SYSTEM.md.tmpl` | 每张活的主提示词:身份 + 读 `AGENTS.md` + 按任务加载 reference + 三条纪律 | 所有活都守的契约只改这一份 |
| `REVIEW.md.tmpl` | 评审会话主提示词 | 已入库,尚未派发 |
| `references/metrics.md` | 指标协议 | 运作活① |
| `references/week-plan-comment.md` | 运作活①评论三个标题 | 挂评前过校验脚本 |
| `references/build.md` | 改仓:分支 / MR / 合并是人 / 0 提交不装前进 | 构建类 + 运作活② |
| `references/bw-assets.md` | `.bw` 现行格式 + 样例 | 运作活② |
| `references/review.md` | 独立评审 | 尚未派发 |

## skills/

清单与触发见 [`skills/README.md`](skills/README.md)。运作剧本 `week-planning` / `asset-audit` / `metrics-refresh` 与构建入口 `mattpocock-skills` 已派发;`project-handbook` 在仓里、盘点不派发;`mr-review` 未派发。不预置阶段方法论——那是 `vendor/` 的事。

## vendor/

| 库 | 状态 |
|---|---|
| `mattpocock-skills` | 已打包,构建/优化/运维产品默认 |
| `mohit-pm-claude-skills` | 已 vendor,未作产品默认 |
| `proto-design` | 原型默认,源还没进来 |

分发态把 vendor 打进二进制还没做(dev 期从源码树复制)。
