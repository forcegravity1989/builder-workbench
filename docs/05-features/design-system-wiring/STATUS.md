# STATUS · 壳接上 Builder 设计系统

- **状态**:已落地,待合入(2026-09-07)
- **人 gate**:intent + 带原型的 spec(原型 = `docs/04-design-system/components/*.html` + `foundations/*.html`;版式 = `docs/hifi/`)。发起人以 `/goal` 直接下达,视为意图 gate 已过
- **issue**:无(会话直达)
- **壳**:`theme::GLOBAL_CSS` = 设计系统 `styles.css` + 壳层 `assets/shell.css`;八屏标记全换设计系统组件类;旧 `assets/hifi.css` 与旧 token 删除
- **第二轮(同日)**:对齐 Codex 设置文法——设计系统加 page-head / section / set-group / set-row / toggle / choice / path;设置、配置、知识库、接入、项目墙改排,内容列整体居中;顶栏删除、图标轨并入 172px 紧凑侧栏;新增本机「配色」设置(Apple 板入口有了)
- **不做**:Lucide 图标替换、命令面板、Codex 的黑主按钮 / 大字号 / 药丸页签
