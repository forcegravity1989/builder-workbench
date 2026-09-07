# STATUS · 壳接上 Builder 设计系统

- **状态**:已落地,待合入(2026-09-07)
- **人 gate**:intent + 带原型的 spec(原型 = `docs/04-design-system/components/*.html` + `foundations/*.html`;版式 = `docs/hifi/`)。发起人以 `/goal` 直接下达,视为意图 gate 已过
- **issue**:无(会话直达)
- **壳**:`theme::GLOBAL_CSS` = 设计系统 `styles.css` + 壳层 `assets/shell.css`;八屏标记全换设计系统组件类;旧 `assets/hifi.css` 与旧 token 删除
- **第二轮(同日)**:对齐 Codex 设置文法——设计系统加 page-head / section / set-group / set-row / toggle / choice / path;设置、配置、知识库、接入、项目墙改排,内容列整体居中;顶栏删除、图标轨并入 172px 紧凑侧栏;新增本机「配色」设置(Apple 板入口有了)
- **不做**:Lucide 图标替换、命令面板、Codex 的黑主按钮 / 大字号 / 药丸页签

## 截图(验收证据)

同一份本机数据、同一批深链,改前跑旧 `hifi.css` 壳,改后跑本分支最终版。压成 1440px JPEG。

| 屏 | 改前 | 改后 |
|---|---|---|
| 项目墙 | [before/wall.jpg](shots/before/wall.jpg) | [after/wall.jpg](shots/after/wall.jpg) |
| 接入项目 | [before/onboard.jpg](shots/before/onboard.jpg) | [after/onboard.jpg](shots/after/onboard.jpg) |
| 设置 | [before/settings.jpg](shots/before/settings.jpg) | [after/settings.jpg](shots/after/settings.jpg) |
| 总览 | [before/overview.jpg](shots/before/overview.jpg) | [after/overview.jpg](shots/after/overview.jpg) |
| 计划 | [before/plan.jpg](shots/before/plan.jpg) | [after/plan.jpg](shots/after/plan.jpg) |
| 会话 | [before/session.jpg](shots/before/session.jpg) | [after/session.jpg](shots/after/session.jpg) |
| 配置 | [before/config.jpg](shots/before/config.jpg) | [after/config.jpg](shots/after/config.jpg) |
| 知识库 | [before/kb.jpg](shots/before/kb.jpg) | [after/kb.jpg](shots/after/kb.jpg) |
| 项目墙 · Apple 板 | — | [after/wall-apple.jpg](shots/after/wall-apple.jpg) |

黄色横幅是本机 `gh` 版本不认 `assignee` 字段,改前改后都有,与本特性无关。
