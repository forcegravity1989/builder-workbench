# standard/

> **维护约定**：给修改 BW 产品执行规范的人和模型读取；只写各层职责、目录与当前加载边界，内容或分发入口变化时更新。实际用户旅程与执行覆盖见模块设计，不把文件存在写成已经派发。

本目录是 Workbench 执行规范的源码，面向被管项目的业务会话，不是 BW 研发知识库或 Orca 工程参考。SYSTEM 模板与计划、验收、指标配置的 Skill 发现 Stub 随产品打包，由工作流入口渲染提示；指南与 references 经原生 `ORCA skills get` 按需读取，普通被管项目无需拥有本目录。普通原生新建会话与历史恢复不额外注入 BW 提示；自动化登记后使用用户已保存的配置。提示递交、正文读取和模型遵守分别验证，入口与证据边界见模块说明。

`standard/vendor/` 未迁入本分支；旧开发环境的复制机制和默认 workflow 派发承诺不适用于这里。

从仓根 [`AGENTS.md`](../AGENTS.md)「按任务读取」点过来。主提示词 / reference / skill 注入对照见 [`docs/06-module/系统提示词与渐进加载`](../docs/06-module/系统提示词与渐进加载.md)。

## 系统提示词 / reference / skill 各写什么

被管仓里的模型看不见 Workbench 源码,也默认不认识 `.bw/`。这三层只补它看不见的,各写一层:

| 层 | 补什么 | 现在(第一层:转得顺) | 先不写(第二层:少问人) |
|---|---|---|---|
| SYSTEM | 哪个 Issue、项目入口、哪类 Issue 加载哪份 reference、原生 Issue 状态与人的处理边界 | 索引 + 全场纪律 | 四段 gate、代填正本 |
| reference | `.bw/`、评论、标签、健康信号、界面认什么 | 格式/落点/失败怎么说 | 北极星该量什么、打分 |
| skill | 这场怎么带人 | 先展示全程，再围绕真实缺口交流。写法正本 [`skills/SKILL-MD-SPEC.md`](skills/SKILL-MD-SPEC.md)；SOP 在各份 SKILL.md 的执行流程，方法和协议按需读取 | 熟练后自动走完 |

一句只住一处。后一层只点名,不复述。过时词直接删。

## 现行结构

| 路径 | 干什么 | 决策 |
|---|---|---|
| `templates/` | `.bw` 格式样例 | 接入时不复制。指标定义由独立指标配置任务讨论、试采并按项目规则采用 |
| `system-prompt/` | 开工注入的主提示词 + 任务规范 | SYSTEM 渲染后进入工作流提示，references 给读取命令；不复制到项目仓 |
| `skills/` | Workbench 技能与历史 workflow 入口内容 | 计划、验收、指标配置的 Stub 与指南已接入原生分发；其余资产按实际入口核对 |
| `vendor/`（未迁入） | 旧业界 workflow 依赖 | 不存在，相关入口不能按已安装使用 |

仓根 `AGENTS.md` / `CLAUDE.md` 是项目自己的,不在这套里,盘点不代写。项目知识文档的归属与落点沿该入口及其引用确定；BW 研发知识库的编号目录不作为被管项目的默认目录模板。

## templates/

| 文件 | 干什么 | 决策 |
|---|---|---|
| `metrics.toml.tmpl` | 指标定义格式(`schema_version = 2`) | 不预铺空壳 |
| `issue-policy.toml.tmpl` | 旧开工约定样例 | **仅供旧文件清理检查**。产品不读、不铺;盘点整份删 `.bw/issue-policy.toml` |
| `design/` | 设计稿落点说明 | 不复制 |

旧 SDLC 过程指标采集脚本模板(`scripts/*.py`)与过程指标目录(`process-catalog.md`)已退役删除:采集分发通道从未打通(bundle 只打包 .md、不铺进项目),过程统计如需上总览记分牌，按指标协议配置为历史脚本指标。历史从 Git 找(PR #125),指针见 [playbook 提炼](../docs/10-reference/ai-native-sdlc-playbook.md)。

## system-prompt/

| 文件 | 干什么 | 决策 |
|---|---|---|
| `SYSTEM.md.tmpl` | 主提示词:身份 + 读 `AGENTS.md` + 按任务加载 reference + 纪律（含计划页签不另开 HTML） | 计划/验收自动化首次登记、数据问题处理及指标配置时渲染；普通新建与历史恢复不注入。覆盖边界见模块说明 |
| `REVIEW.md.tmpl` | 评审会话主提示词 | 已收录,尚未派发 |
| `references/issue-state.md` | Issue 提单格式、计划补充、材料任务关联与处理结果 | 所有 Issue |
| `references/metrics.md` | 脚本指标协议 | 指标配置及两个版本流程按需读取 |
| `references/week-plan-comment.md` | 旧计划 Issue 评论三标题 | 仅供历史评论核对、修复和导入 |
| `references/version-records.md` | 版本计划 / 验收材料及修订契约 | 两个版本流程与资产盘点写入明确版本进展时按需读取 |
| `references/meeting-transcript.md` | eMeeting 取稿命令、来源与失败处理 | 两个版本流程需要整理会议指导时按需读取 |
| `references/build.md` | 改仓:分支 / MR / 合并是人 / 0 提交不装前进 | 构建类 + 资产盘点 Issue |
| `references/bw-assets.md` | `.bw` 现行格式 + 样例 | 资产盘点 Issue |
| `references/review.md` | 独立评审 | 尚未派发 |

## skills/

清单与适用任务见 [`skills/README.md`](skills/README.md)。week-planning、version-acceptance、metrics-refresh 的正文与 references 由 `config/scripts/generate-bundled-skill-guides.mjs` 生成原生指南，根级 `skills/` 保留发现 Stub；两个版本流程经 `ORCA bw materials` 与界面读写同一材料服务。实际加载与模型遵守仍需对应会话证据；`mr-review` 与 `REVIEW.md.tmpl` 的存在不代表独立评审已经接入。

## 外部 workflow 的边界

本分支未迁 `standard/vendor/`。`mattpocock-skills` 仍有入口文件，但依赖正文缺失，不能宣称可执行或已打包；proto-design 也未作为 BW 默认交付。需要这些方法时，在特性迁移中决定来源与分发路径，不自动搬回 Rust 资产机制。
