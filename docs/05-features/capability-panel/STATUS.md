# STATUS · 配置屏收成「能力面板」

- **状态**:待意图 gate(2026-09-08 提出,制品已备齐)
- **人 gate**:intent + 带原型的 spec。原型两份同源:
  - 在线可点(推荐,直接在浏览器里点):<https://claude.ai/code/artifact/3755f5a7-dc72-4019-969f-083d635fbd35>
  - 仓内 [`prototype.html`](prototype.html)(浏览器直开,相对引仓里的 `styles.css` + `shell.css`,样式表改了它跟着变)
- **issue**:无(会话直达)
- **代码**:未动。gate 之前不写码
- **分支**:`claude/codex-plugin-page-management-09c680`

## 制品

| 文件 | 是什么 |
|---|---|
| [`intent.md`](intent.md) | 新闻稿式意图:六条痛点、三组解决方案、飞轮检验、五大拷问、三个开放问题 |
| [`spec.md`](spec.md) | 版式、三个页签的操作逻辑、着色口径表、客户会问、硬核挑战 |
| [`prototype.html`](prototype.html) | 可点原型:三页签可切,红行的「怎么修」可展开,技能行点开看正文。**装在真壳里**——直接 `<link>` 引 `docs/04-design-system/styles.css` + `crates/app-shell/assets/shell.css`,侧栏、内容列限宽、右侧竖页签都是壳自己的那套,原型只额外画了个窗框 |

## 起因

发起人拿 Codex 的插件页与 Claude 的 Customize 面板作对照,指出 BW 的「工具探活」本质上就是 connectors 那类东西 —— 指向应用外面、可能不在、需要一个修法,而不是 Codex 那种跟着应用发、只有开关的插件。顺着这条读法,BW 现在把同一类内容散在三个屏上。

## 待裁决

1. 「规范」页签(开工注入的 references)要不要进本轮 —— 唯一一块新增界面。
2. 屏名要不要从「配置」改成「能力」 —— 倾向不改。
3. ~~设置屏留不留工具摘要行~~ —— 已消解:设置挂进能力面板左栏底部,顶层设置屏撤掉。

## 明确不做

安装、启用停用开关、Discover / 市场、代装工具、代起服务、填路径的输入框、技能胜率。
