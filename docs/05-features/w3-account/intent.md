# intent — W3 Account（账户页改为内网 W3 登录入口）

> **状态：用户已确认，实现已落地（真机已验证）。** 用户已确认「W3 Account」方向（弃 OAuth/PKCE/client_id），并入 [#728](https://github.com/forcegravity1989/builder-workbench/issues/728) 后确认主路径为**从系统浏览器复用登录的会话桥接**：SPES 免密在 Electron 内置浏览器不可行（服务端校验浏览器引擎指纹），改由受控临时 profile 的 headless 系统 Chrome 完成 SPES 免密，读取 huawei.com 族 cookie 移植进专用 partition，**身份只认同一 partition 对 W3 门户账号接口的可信返回**（实测未登录 HTTP 421；200 + 可解析 `employeeNumber`/`uid` 才算登录），手动网页登录窗口降为兜底入口。已实现并真机验证（2026-11-24 Windows 内网真机：启动零操作自动登录、重启免桥接恢复登录），交付于 PR [#766](https://github.com/forcegravity1989/builder-workbench/pull/766)。目标行为见 [spec.md](spec.md)，可点样张见 [prototype.html](prototype.html)，链状态见 [STATUS.md](STATUS.md)。
>
> **维护约定**：给判断「现有 Orca Account 页是否、如何替换为 W3 Account」的人与模型读。入口、登录态与身份口径变化时更新本篇；不抄实现清单，不记过程流水。

## 用户与问题

被管项目的 Builder 在内网环境使用 BW。现有设置里的账户页叫 **Orca Account**，是面向 Orca 云的账户中心：卡片写着「Sign in to Orca」，并用「Artifact sharing / Orca Relay / Skill sharing」推广云功能。它对内网交付场景是错位的——用户真正要用的是**企业 W3（统一门户）身份**，并在内置浏览器里复用内网登录态；而现有 Orca 登录走的是系统浏览器的云 OAuth，只拿回云身份，不会把 W3 登录态带进内置浏览器的持久会话。

用户希望把这个账户页**直接换成 W3 账户**：一个「欢迎回来 👋」的简单页面，**主按钮「从系统浏览器复用登录」（免密桥接、用户零操作）+ 次按钮「使用华为 W3 登录」（手动兜底）**，不出现账号密码输入，也不要额外的工具栏入口或会话分区管理配置。免密由企业策略把 SPES 扩展装进系统 Chrome 所有 profile（含临时 profile）实现，**真机已验证**。

## 价值与依据

核心收益：**把账户入口对齐企业 W3 身份，页面保留一个主动作与手动兜底，登录态在本机持久化并可在重启后恢复。**

- 复用 Orca 现有账户页骨架与登录状态位，只替换语义与 UI 文案；专用 persist session 分区复用内置浏览器的会话 profile 基础设施。
- 依据：用户明确要求（整体替换 Orca Account、无账号密码）并确认**会话桥接主路径 + 手动网页登录兜底 + W3 账号接口取身份**（弃 OAuth/PKCE/client_id）。原立项 Issue #729 保留但不更新。
- **身份效果已真机验证**：账号接口真实字段、SPES 免密、重启恢复均已在 Windows 内网真机验证（2026-11-24）。
- **内置浏览器内网复用**：登录所用专用 partition 即本机常规内置浏览器新标签的默认 profile（薄挂载，仅 local host；profile 仍 `internal` 隐藏不可删）——已实现，Windows 普通标签复用与退出已由内网助手报告真机复验；证据边界见 STATUS。

## 目标体验

在原「Orca Account」所在的账户导航处，页面变成 **W3 Account**：

1. **未登录**：居中欢迎卡片「欢迎回来 👋」+ 一句说明，主按钮「从系统浏览器复用登录」+ 次按钮「使用华为 W3 登录」（手动兜底）。无账号/密码输入，无其它入口。
2. **桥接中 / 登录窗口已打开**：桥接期间显示「正在从系统浏览器复用登录」（后台 headless Chrome 免密，用户零操作、零窗口）；手动兜底则由主进程打开**内置 W3 登录窗口**（专用 session，无 Node/preload、sandbox），页面显示「请在 Orca 登录窗口完成登录」。两者均提供「取消」，且**打开窗口、网页加载成功都不等于已登录**。
3. **登录完成**：只有**W3 账号接口返回 200 且能解析出 `employeeNumber`/`uid`**才进入「登录完成」。可信身份返回时显示姓名 / 工号（display_name 取 `cn=` 中文名）；官方成功但缺用户资料时显示「登录完成（未获取用户资料）」，绝不猜测或读取工号。登录完成后角落有一个小次要入口「退出登录」。
4. **失败**：显示简短原因（未配置 / 打开失败 / 超时 / 取消 / 登录未完成 / 身份解析失败 / 桥接失败 / 退出未完成）+「重试」（登录失败重试即再走一次桥接；退出失败重试即再退出）。
5. **退出**：点小次要入口弹确认，确认后才退出；退出关闭登录窗口（若在）、清除专用 partition 全部存储与本地身份，不承诺全局 W3 退出；清理失败时**不假报成功**，保持登录态并允许重试退出。

页面不再出现 Orca 云功能（Artifact/Relay/Skill）推广。内网登录仅复用于本机普通网页标签，文档预览不绑定 W3 会话，退出不关闭无关预览。

## 范围与边界

- **做**：账户导航与页面由 Orca Account 改为 W3 Account；未登录双按钮欢迎页（桥接主按钮 + 手动兜底次按钮）；桥接中 / 登录窗口已打开 / 登录完成 / 失败 / 退出确认状态；只有 **W3 账号接口 200 + 可解析 `employeeNumber`/`uid`** 才进入「登录完成」（421=未登录继续等），仅在可信身份返回时展示姓名/工号（`display_name`/`employee_no` 白名单）；登录页/接口地址/超时从**部署配置（env）**读取（不做首次设置表单）；会话存于专用 persist partition，重启后经账号接口校验恢复。
- **不做（明确边界）**：不做账号密码输入；不做额外工具栏入口或会话分区管理 UI；**不默认把 W3 会话传给 Orca cloud / Artifacts / Relay，不声称 W3 登录授权这些服务**（后端云模块暂不删，只从 W3 页移除推广）；**不碰用户正在运行的浏览器**（桥接读取的是受控临时 Chrome profile 中由 SPES 免密新产生的 cookie，非用户浏览器数据；无单例锁、无调试端口争用、不复制 profile）；**不注入/抓取 W3 登录页**（凭据交互由 W3 门户自身完成）；账号接口只访问受信域（http(s)+host 校验，防任意域）；纯网页加载成功、Cookie 存在**不能**认定为实名身份；不做冗长的「限制」UI（仅内部保留最小隐私 / TLS / 凭据边界）。
- **登录流程**：**会话桥接（主路径）+ 手动网页登录（兜底）+ W3 账号接口取身份**——启动时未登录自动执行一次桥接（受控临时 profile 的 headless 系统 Chrome 完成 SPES 免密 → 读取 huawei.com 族 cookie 移植进专用 partition，session cookie 补 7 天 TTL 保证重启可恢复），全程零操作、零窗口；手动兜底则打开专用 session 登录窗口（`ORCA_W3_LOGIN_URL` 默认 indexa.html）；两条路径都以同一 partition 的 `session.fetch` 每 ~2s 轮询 W3 门户账号接口（默认 `…/w3account/v1/account/zh?profile=1&version=1&usergroup=1`），421=未登录继续等、200+可解析=成功（关窗）、其它 4xx/5xx=失败、总等待默认 120s（`ORCA_W3_LOGIN_TIMEOUT_MS`）；**不需要 client_id/OAuth/PKCE/client_secret**（PKCE 实现已删除）。
- **相邻**：Orca 云账户能力（Artifacts / Relay / Skill sharing）后端仍在，本特性只改前端账户页与其语义，不删除后端模块。

## 成功判据与待决问题

**判据**：账户导航显示 W3 Account（取代 Orca Account）；未登录为双按钮欢迎页（桥接主按钮 + 手动兜底）、无账号密码输入、无额外工具栏/会话配置；登录有「桥接中 / 登录窗口已打开 / 登录完成 / 失败 / 退出」状态；**只有 W3 账号接口 200 + 可解析身份才进入「登录完成」**，仅在可信身份返回时显示姓名/工号（官方成功缺资料时显示「登录完成（未获取用户资料）」），**打开登录窗口或 Cookie 存在都不算登录完成**；不把 W3 会话默认传给云服务、不声称授权；退出有确认且清除专用 partition 存储，清理失败不假报成功；界面与日志不出现凭据明文。真机已验证启动零操作自动登录与重启恢复（2026-11-24 Windows 内网真机）。

**待决 / 待真实验证（不影响本轮实现）**：

1. **feature id / 目录**——已定 `w3-account`（用户已确认）。
2. **部署配置**——`ORCA_W3_LOGIN_URL`/`ORCA_W3_ACCOUNT_API_URL`/`ORCA_W3_LOCALE`/`ORCA_W3_LOGIN_TIMEOUT_MS`/`ORCA_W3_SYSTEM_CHROME_PATH`（均有默认值）；URL 非法（非 http(s)/无 host/userinfo）时 UI 显示「登录尚未配置，请联系管理员」。
3. **账号接口真实字段/网络**——字段结构（`employeeNumber`/`uid`/`displayName` 数组）来自 W3 `init.js` 源码阅读；421 未登录与真实 200 返回均**真机已验证**。
4. **成功页字段**——`display_name`（`cn=` 规范化）/`employee_no` 取自 W3 账号接口；官方成功但无可信资料时显示「登录完成（未获取用户资料）」。
5. **内置浏览器内网复用**——已按薄挂载实现（登录 partition 即本机 local 常规新标签默认 profile，`internal` 隐藏不可删；显式 profile/remote/ssh/doc-preview 不套用）；Windows 普通标签复用与退出已由内网助手报告真机复验；证据边界见 STATUS。
6. **后台云登录入口**——后端云模块暂不删；是否在 UI 上彻底移除 Orca 云登录入口，待确认。
