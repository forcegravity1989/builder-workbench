# spec — W3 Account（账户页改为内网 W3 登录入口）

> **状态：用户已确认，实现已落地（待真实环境验证）。** 用户已确认整体方向，并于本轮确认改为 **内置会话网页登录 + W3 账号接口取身份**（**不要 OAuth/PKCE/client_id**）：主进程用专用 persist session 分区打开 W3 登录窗口，用户在窗口内完成正常 W3 登录；身份只认同一 session 对 W3 门户账号接口的可信返回。已按该方向实现于本 worktree；真实登录窗口 + 真实 W3 登录 + 账号接口真实字段/网络均**未验证**。不 commit/push/PR、未更新已发布 Issue [#729](https://github.com/forcegravity1989/builder-workbench/issues/729)。意图见 [intent.md](intent.md)，可点样张见 [prototype.html](prototype.html)，链状态见 [STATUS.md](STATUS.md)。
>
> **维护约定**：给交互设计、实现者与验收者读。写清目标行为、身份/会话边界与验收点；原型只表示目标态，不等于能力已交付。行为变化时更新正文，不追加过程流水。

## 范围与入口

**范围**：把现有设置里的 **Orca Account** 页替换为 **W3 Account** 页。仅在桌面壳显示。未登录为居中欢迎卡片（单按钮「使用华为 W3 登录」）；登录走**内置 W3 登录窗口**（专用 persist session 分区），登录态以**W3 账号接口可信返回**判定，会话随该专用分区持久化、重启后恢复。登录所用 partition 即本机常规内置浏览器新标签的**默认专用 profile**（内网复用，见「会话与内网复用」）；不提供分区 / 会话管理 UI。

**入口**：设置 →（账户组）**W3 Account**。沿用现有 Orca Account 的导航位置与渲染骨架，只改标题、图标语义与页面内容；不新增工具栏入口。

**原型覆盖与限制**：`prototype.html` 用本地静态假体演示「账户导航 W3 Account + 未登录 / 登录窗口已打开 / 登录完成(可信身份) / 登录完成(未获取资料) / 失败 / 退出确认」几个阶段，阶段切换是独立演示控件，不是产品设置。地址用占位 `example.test`，全程不联网；成功后姓名/工号为占位，标注「需可信身份返回」。

## 真实账户页与差距（不伪造实现）

**现有 Orca Account 是生产页面，不是 dev-preview。** 证据：

- 页面：`src/renderer/src/components/settings/OrcaAccountSettingsPane.tsx:61`（`OrcaAccountSettingsPane`）。未连接时按钮写着 `Sign in to Orca`（`L120-131`）；连接后展示 `cloud.displayName`（`L94-96`）并给「Sign out」（`L109-118`）。下半部 `L135-178` 推广 `Artifact sharing` / `Orca Relay` / `Skill sharing`。
- 导航：`src/renderer/src/hooks/settings-navigation-capability-sections.ts:130`（`id: 'orca-account'`，`title: 'Orca Account'`），在桌面端（`showDesktopOnlySettings`）显示；渲染于 `src/renderer/src/components/settings/settings-setup-workflow-section-renderers.tsx:18-26`。
- 登录 action：`OrcaAccountSettingsPane` → `connectCurrentOrcaProfile`（`src/renderer/src/store/slices/orca-profiles-auth-actions.ts:72`）→ `window.api.orcaProfiles.connectCurrent()` → IPC `orcaProfiles:connectCurrent`（`src/main/ipc/orca-profiles.ts:270-272`）→ `connectCurrentOrcaProfile`（`src/main/orca-profiles/profile-cloud-service.ts:54`）。
- 账户确实门控云功能：`src/renderer/src/components/settings/ArtifactsSettingsPane.tsx:20-23`、`ShareSkillsSettingsPane.tsx:16-19` 以 `authStatus.state === 'connected'` 判定 `signedIn`。→ 账户影响 Artifacts / Orca Relay / Skill sharing 等云功能。

**选定方向：内置会话网页登录 + W3 账号接口取身份（无 OAuth/PKCE/client_id）。** 用户已确认（含父会话实测依据）：

- **登录窗口**：主进程创建 `BrowserWindow`（约 1000×720、可关闭），webPreferences：`nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`、**无 preload**、`session=专用 partition`；加载 `ORCA_W3_LOGIN_URL`（默认 `https://w3.huawei.com/next/indexa.html`）；禁止窗口内再开新窗口；不禁 TLS。用户在窗口内按 W3 门户原有方式完成登录（门户自身的账号体系，**不抓账号密码、不注入登录页**）。
- **身份获取（账号接口轮询）**：主进程用**同一 partition** 的 `session.fetch`（`credentials:'include'`、`redirect:'manual'`）每 **~2s** 轮询 W3 门户自身账号接口：
  - 默认 `https://w3.huawei.com/next/service/rest/my/w3account/v1/account/zh?profile=1&version=1&usergroup=1`（`ORCA_W3_ACCOUNT_API_URL` 可覆盖，`ORCA_W3_LOCALE` zh|en 拼进默认值）。
  - **实测语义（父会话）**：未登录返回 **HTTP 421**（body `No login user found.`）→ 继续等待；登录后返回 JSON。
  - **成功判定**：HTTP 200 且能解析出 `employeeNumber`（工号）或 `uid`；字段来自 W3 门户 `init.js`：`employeeNumber`、`uid`、`displayName`（数组，元素形如 `cn=张三` / `en=zhangsan`，取前缀后 3 字符）、`cn`、`en`、`profile`、`ihrManager`。**其它 4xx/5xx → `login-failed`；200 但缺标识字段 → `account-parse-failed`；网络错误视为瞬时、继续等待（总超时兜底）**。
  - **displayName 规范化**：优先 `cn=` 中文名，其次 `en=`，再平铺 `cn`/`en` 字段；仅 `display_name`/`employee_no` 两项白名单回 renderer，token/cookie/原始 JSON 不出主进程、不落日志。
  - **受信域约束**：登录页与账号接口 URL 必须 http(s)、有 host、无 userinfo，否则「未配置」；轮询响应若最终 URL 跳到其它 origin 一律不采信。
- **总等待**：默认 **120s**（`ORCA_W3_LOGIN_TIMEOUT_MS`，限 5s–10min）；超时/取消/用户关窗都停止轮询、关闭登录窗口并清理 timer；成功立即关窗。
- **不做 URL/Cookie 推定**：打开登录窗口、网页加载成功、Cookie 存在都不算登录完成；只有账号接口 200+可解析才 signed-in。
- **会话与内网复用**：登录所用专用 partition（`persist:` 分区、`internal` 隐藏 profile、不可在设置列表删除）就是后续内置浏览器复用的会话——**本机（`LOCAL_EXECUTION_HOST_ID`）常规新标签默认使用该 profile**（薄挂载：remote/ssh runtime、显式 session profile、doc-preview、客户端路由标签不套用）；退出时清该 partition 全部存储（cookies/localstorage/indexdb/serviceworkers/cachestorage + cache），不影响其它 session/profile。
- **验证入口（W3 会话内打开网页）**：已登录状态卡片内仅提供一个固定快捷方式「打开 W3 首页」（旁注域名 `w3.huawei.com`），点击即以 W3 会话打开默认地址 `https://w3.huawei.com/next/index_zh.html`（env `ORCA_W3_SHORTCUT_URL` 可覆盖，但其 host 必须为 `w3.huawei.com` 或显式配置的受信域）。**不做通用 URL 输入框与地址校验面板。** 主进程 `w3Account:openWeb`（无入参）仅在账号接口确认已登录时用**同一专用 partition** 新建强化验证窗口（nodeIntegration=false/contextIsolation=true/sandbox=true/无 preload、拒窗口内新窗口，约 1000×720）；未登录拒绝（`not-signed-in`）且不新建窗口；非受信域一律拒绝；可多次打开，关闭即清理引用。**限制**：验证窗口复用该分区可验证内网访问，但**常规内置浏览器标签仍需在某个工作区内创建**（无工作区无法开普通标签）。
- **保留的边界**：W3 登录成功**不授权** Orca 云（Artifacts/Relay/Skill）；不提取/复制外部浏览器 Cookie；不引入 client_secret/令牌交换（**本方向不需要**）。

**待部署配置（env，不硬编码实际值）**：`ORCA_W3_LOGIN_URL`（默认 `https://w3.huawei.com/next/indexa.html`）、`ORCA_W3_ACCOUNT_API_URL`（默认 zh 账号接口）、`ORCA_W3_LOCALE`（`zh|en`，拼进默认接口）、`ORCA_W3_LOGIN_TIMEOUT_MS`（默认 120000）、`ORCA_W3_SHORTCUT_URL`（「打开 W3 首页」默认 `https://w3.huawei.com/next/index_zh.html`，其 host 成为唯一额外受信快捷域）。URL 非法（非 http(s)/无 host/userinfo）→「未配置」态。**不再需要** `ORCA_W3_CLIENT_ID`/`ORCA_W3_REDIRECT_URI`/`ORCA_W3_AUTHORIZE_URL`/`ORCA_W3_TOKEN_URL`/`ORCA_W3_USERINFO_URL`/`ORCA_W3_SCOPE`/`ORCA_W3_W3_VERSION`（PKCE 实现与配置已删除）。

## 完整用户旅程（主路径）

1. **进入**：设置 → W3 Account（原 Orca Account 位置）。
2. **未登录**：居中卡片「欢迎回来 👋」+ 一句说明，唯一按钮「使用华为 W3 登录」。无账号/密码输入，无其它入口。
3. **打开登录窗口**：点按钮后主进程打开 **Orca 内置 W3 登录窗口**（专用 session），页面显示「请在 Orca 登录窗口完成登录」+ 次要「取消登录」。**打开窗口、网页加载成功都不代表登录完成。**
4. **登录完成**：只有**账号接口返回 200 + 可解析出 `employeeNumber`/`uid`** 才进入「登录完成」，随即关闭登录窗口。可信身份返回时显示姓名（`cn=` 中文名）/ 工号；官方成功但缺用户资料时显示「登录完成（未获取用户资料）」，不猜测。角落出现小次要入口「退出登录」。
5. **恢复**：重启 / 重新打开设置页时，对专用 session 做一次账号接口校验：200+可解析 → 登录完成；421 或其它 → 未登录（**不凭窗口/Cookie 判登录**）。
6. **失败**：显示简短原因（未配置 / 打开失败 / 超时 / 取消 / 登录未完成 / 身份解析失败）+「重试」。
7. **退出**：点「退出登录」→ 确认弹窗 → 确认后关闭登录窗口（若在）、清除该专用 partition 全部存储与本地身份；**不承诺全局 W3 退出**，不影响其它会话/profile。

## 行为规则与异常

**状态机**（页面自身状态；身份只在可信返回时使用）：

| 状态 | 触发 | 展示 |
|---|---|---|
| 未配置 | URL 配置非法 | 「登录尚未配置，请联系管理员」；按钮不触发流程 |
| 未登录 | 账号接口 421 / 校验失败 | 欢迎卡片 + 单按钮「使用华为 W3 登录」 |
| 登录中（登录窗口已打开） | 已点登录、窗口已开、账号接口未 200 | 「W3 登录窗口已打开 · 请在 Orca 登录窗口完成登录」+ 次要「取消登录」；不重复触发 |
| 登录完成（有可信身份） | **账号接口 200 + 可解析身份** | 姓名 / 工号 + 小次要「退出登录」 |
| 登录完成（未获取用户资料） | 200 + 有 `employeeNumber`/`uid` 但无姓名/工号可展示 | 「登录完成（未获取用户资料）」+「退出登录」，**不猜测** |
| 失败 | 打开失败 / 超时 / 用户取消或关窗 / 接口 4xx-5xx / 200 解析失败 | 简短原因 + 「重试」 |
| 退出确认 | 点退出 | 确认弹窗（取消 / 退出） |

- **登录完成判定**：**只有账号接口 200 + 可解析 `employeeNumber`/`uid` 才进入「登录完成」**；打开登录窗口、网页加载成功、Cookie 存在、URL 到过内网站点，都**不**作为登录完成依据。
- **身份判定**：只有账号接口返回才显示姓名/工号（`displayName` 取 `cn=` 中文名）；否则只显示中性结论，不猜测。
- **会话与内网复用**：登录专用 partition 即本机常规内置浏览器新标签的默认 profile（仅 local host；显式 profile/remote/ssh/doc-preview/客户端路由不套用）；profile 保持 `internal` 隐藏、不可删；退出清其存储并撤销默认挂载。
- **内部最小边界（不铺 UI）**：Cookie / 凭据不进 renderer 明文、AI 通道或日志；账号接口只访问受信默认域（可配置但需 http(s)+host 校验，防任意域）；不导入外部浏览器 Cookie；不注入/抓取登录页；TLS 与证书保留现有确认。

**异常与失败**：

| 场景 | 处理 |
|---|---|
| URL 配置非法（非 http(s)/无 host/userinfo） | 「登录尚未配置，请联系管理员」；不打开空白外网、不猜地址 |
| 登录窗口打开失败 | 「失败：无法打开 W3 登录窗口」+ 重试，不留半成品状态 |
| 账号接口 421 | 未登录，**继续轮询**直到 200/超时 |
| 网络错误（接口不可达） | 视为瞬时，继续轮询（总超时兜底） |
| 其它 4xx/5xx 连续失败 | 「失败：W3 会话未完成登录」+ 重试；关窗清理 |
| 200 但缺 `employeeNumber`/`uid` / 非 JSON / 超限 | 「失败：W3 已登录但未读取到有效资料」+ 重试；**不假成功** |
| 等待超时（默认 120s，可配） / 用户点「取消登录」 / 用户关闭登录窗口 | 「失败：超时 / 已取消」或回到未登录；清理 timer、关窗 |
| 恢复时 421 / 校验失败 | 回到未登录（signed-out），不凭 Cookie 判登录 |
| 退出失败 | 保持状态并提示，可重试 |

## 验收与衡量

**验收点（需在真实环境核验，文档不宣称通过）**：

1. 账户导航显示 **W3 Account**（取代 Orca Account）；页面为单按钮欢迎卡片，**无账号密码输入、无额外工具栏入口、无会话分区配置**。
2. 登录有「登录中 / 登录完成 / 失败 / 退出确认」状态；pending 可「取消登录」；退出需确认，清除专用 partition 存储，仅影响本账户。
3. **只有账号接口 200 + 可解析身份才进入「登录完成」**；仅在可信身份返回时显示姓名/工号，成功但缺资料时显示「登录完成（未获取用户资料）」；**打开登录窗口或 Cookie 存在都不算登录完成**，不猜测。
4. **内网复用**：登录成功后，本机（local）常规内置浏览器新标签默认使用 W3 专用 profile；显式 session profile / remote / ssh / doc-preview / 客户端路由不套用；退出后默认撤销并关闭该会话标签。
4b. **验证入口**：已登录卡片仅提供「打开 W3 首页」固定快捷方式（旁注 `w3.huawei.com`，不做通用 URL 输入）；`w3Account:openWeb` 无入参、默认打开 w3 首页/配置受信域、未登录拒绝、已登录用同一 partition 打开强化验证窗口（可多次）；普通浏览器标签仍需工作区（验证窗口不替代工作区标签）。
5. 页面**不把 W3 会话传给 Orca cloud / Artifacts / Relay**，不出现这些云功能推广，也不声称 W3 登录授权它们。
6. 界面与日志无凭据明文；无外部浏览器 Cookie 导入；登录窗口无 Node/preload、sandbox+contextIsolation；账号接口仅受信域；TLS/证书保留现有确认。
7. 真实 W3 登录、免密与账号接口真实字段需真实环境验证（见 STATUS 未完成项）。

**测试与人工验收**：核心逻辑纯函数已立单测（账号接口 421/200/4xx/解析失败判定、`cn=`/`en=` 规范化、白名单字段、受信域 URL 拒绝、120s 超时常量、取消/关窗清理、signOut 只清专用 partition、迟发请求不复活）；E2E 待内网网络与真实 Electron 壳就绪后验证「单按钮登录 → 窗口内登录 → 身份返回 → 重启恢复 → 退出」。真实 W3 免密与身份返回无法在无地址/无网络条件下验证，如实标待验。

## 取舍与待决问题

**取舍**：

- 采用「替换原 Orca Account 页」而非「新增独立 W3 入口」——用户明确否决额外入口与独立会话管理。
- 登录流程经用户三轮确认：先「复用 OMD W3 后端」→ 再「Orca 直连 W3（PKCE）、端点从 OMD 复用」→ 本轮（用户实测 404/客户端无效后）改为**内置会话网页登录 + W3 账号接口取身份**，**完全不需要 OAuth client_id / PKCE / client_secret**；PKCE 与 token-store 实现已删除。
- 不采用「导入/提取外部浏览器 Cookie」；登录在 Orca 自有专用 session 内完成，W3 门户登录页本身负责凭据交互（不注入、不抓取）。
- 后端 Orca 云模块暂不删，只从 W3 页移除推广，降低回退成本。

**待决 / 待真实验证**：

1. feature id / 目录名 `w3-account`（已定）。2. 账号接口字段结构（`employeeNumber`/`uid`/`displayName` 数组）来自 W3 `init.js` 源码阅读，**真实返回未验**；421 未登录语义为父会话实测。3. 真实登录窗口加载 `indexa.html` 的可用性与内网网络条件待验。4. 成功页只取 `displayName`（`cn=` 规范化）/`employeeNumber` 两项。5. 内网复用已按薄挂载实现（本机 local 默认），真实效果待验。6. UI 是否彻底移除 Orca 云登录入口（后端模块保留）。
