# 0006 · 桌面宠物选型:接本机 Clawd on Desk,不自建

> **30 秒导读**:Workbench 不自画宠物,把「活的状态」推给本机已装的 **Clawd on Desk**(像素桌面宠物 App,[rullerzhou-afk/clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk));接口是它给非 agent 应用的「自定义 HTTP agent」协议;Codex 宠物包走它自己的导入器。和引入 Claude CLI / Cursor / Orca 是同一套路子:装在本机,Workbench 只接口。

- 状态:**草案**(2026-09-24)。发起人 2026-09-10 在 [#154](https://github.com/forcegravity1989/builder-workbench/issues/154) 已拍「选出来的底座就是它」;当时的 7 个 commit 未 push 丢失,本篇按 clawd 1.1.0 的协议正本重写,随 PR 评审合入。
- 相关:[`docs/05-features/desktop-pet/`](../05-features/desktop-pet/intent.md)(特性制品)、[`architecture.md`](../architecture.md) §2 ⑤ / §3、[`06-module/桌面壳`](../06-module/桌面壳.md)

## 决策

1. **底座 = Clawd on Desk**。它已经看得见 Claude Code / Codex / Cursor 等 agent 的 hook(Orca 里跑的就是 `claude`,它通过 claude-code 的 hook 看见了),Workbench 只补它看不见的那层:**活的状态**(Issue 标签正本)。
2. **接口 = 它的自定义 HTTP agent 协议 v1**(`docs/guides/custom-agent-http.md`):人在它的「设置 → Agents」加发现路径 → 扫描 → 对 Workbench 点 Register,它按可执行文件路径算出稳定的 `custom-<slug>-<sha256 前 12 位>` id;Workbench 读 `~/.clawd/runtime.json`(`{app:"clawd-on-desk", port}`,端口 23333–23337 动态)取端口,POST `http://127.0.0.1:<port>/state`,报文 `{agent_id, session_id, state, event}` + 可选 `cwd` / `session_title`。**只报状态,不管审批**(v1 没有 `/permission`)。
3. **状态 = 内核现算,只认标签正本**:阻塞 → `error`,待评审 → `attention`(该你点了),进行中 → `working`,没活 → `SessionEnd` 撤卡。不读会话文件、不猜 agent 在想什么(那是 Clawd 自己 hook 的事)。一个项目一条会话(`bw:<slug>`),同样的报告不重发。
4. **失败静默**:300ms 超时、不重试、不阻塞、不弹窗;它没开就当离线。壳起独立任务发,绝不 await。
5. **Agent ID 自己算**:与上游 `custom-applications.js` 同算法(#154 已用 clawd 1.0.0 的 `identifyCustomApplication()` 交叉验证逐字节相同),人不用抄;注册那一下必须人做——上游明说扫出来不等于认得,Register 是人替它作保。
6. **Codex 宠物包**:Clawd 启动 / 刷新主题时自己扫 `~/.codex/pets/<目录>/pet.json + 图` 并转成主题(也认 zip 与 `clawd://import-pet?url=` 导入)。Workbench 不重写转换器,只把**本机 Codex 已缓存**的内置图集(`$CODEX_HOME/cache/tui-pets/v1/assets/`)配上 manifest 复制成包——本机复制,不下载、不分发、不覆盖已有。
7. **明确不做**:`agents/orca.js` 之类给 Orca 写 hook(Orca 是终端壳不是 agent);Workbench 壳里自画宠物(那是自建);Workbench 自己的主题包(形象单独一件);嵌 Clawd 的网页端(它有和 Orca「给 web 配对」同形的移动端配对地址,待用真配对地址重嵌再判,不在本篇)。

## 为什么

- 两大 CLI 都用宠物给了「人在别的窗口时的余光信号」,而 Clawd on Desk 已把 20 多种 agent 的 hook 都接了,连 Orca pane 的聚焦都处理了;Workbench 再画一只,是替还不存在的问题写代码,还得养形象。
- Workbench 唯一独有的信息是 Issue 标签正本(进行中 / 待评审 / 阻塞)——这正是 Clawd 从 hook 里看不到的,一条薄适配就把它补上。
- 铁律「信号只从数据推导」在这里天然成立:推出去的是标签现算,没活就撤卡,不存心情。

## 备选与放弃

| 备选 | 为什么不 |
|---|---|
| 侧栏里自画一只(2026-09-24 本 PR 第一稿) | 自建;要养形象与动画,还得再造一套状态词汇;Claude Code 的 `/buddy` 已下线,Codex 内置资产在 CDN 许可未明 |
| 直接分发 Codex 八只资产 | 不在 Apache-2.0 仓内、许可未明;只复制本机已缓存的 |
| 用 Claude 会话文件 mtime 推「AI 在跑 / 停了」 | 那是 Clawd hook 的本职且更准;Workbench 不重复 |

## 后果

- 新增依赖:`bw-engine` 加 `sha2`(算 id)与 tokio `net` / `io-util`(裸 HTTP);不引 HTTP 客户端库。
- 探活三样(装 / 跑 / 注册)分开显示,不合成一个「好坏」;没装不是红,没人非用它不可。
- Clawd 的运行时文件与 prefs 只读;Workbench 不写它的任何文件。
