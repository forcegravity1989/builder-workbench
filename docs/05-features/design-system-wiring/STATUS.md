# STATUS · 壳接上 Builder 设计系统

- **状态**:已落地,待合入(2026-09-07)
- **人 gate**:intent + 带原型的 spec(原型 = `docs/04-design-system/components/*.html` + `foundations/*.html`;版式 = `docs/hifi/`)。发起人以 `/goal` 直接下达,视为意图 gate 已过
- **issue**:无(会话直达)
- **壳**:`theme::GLOBAL_CSS` = 设计系统 `styles.css` + 壳层 `assets/shell.css`;八屏标记全换设计系统组件类;旧 `assets/hifi.css` 与旧 token 删除
- **不做**:Apple 板切换入口、Lucide 图标替换、命令面板
