# Spec · 桌面宠物(desktop-pet)

> **30 秒导读**:这是什么——本次变更的**规格件**:Workbench 怎么把活的状态推给本机 Clawd on Desk、状态怎么算、报文长什么样、接没接上怎么显示、出错怎么办、怎么验收。给谁看——过规格 gate 的人、审这批 PR 的人。现在作数吗——**in_review**(2026-09-24;状态正本见 [STATUS.md](STATUS.md));上游意图见 [intent.md](intent.md),选型见 [ADR 0006](../../02-adr/0006-桌面宠物选型-clawd-on-desk.md),协议正本是 clawd 仓的 `docs/guides/custom-agent-http.md`(按 1.1.0 核对)。

## 原型

**可点原型**:https://claude.ai/artifact/NuibdfPSZ2v3oy43Py85Xv(artifact,浏览器直接开;按 02 §3.2 不进仓)。左边是计划屏示意的四列看板,点卡片把它挪到下一列;右边是宠物这一刻的样子(示意——真正画画的是 Clawd on Desk)和 **Workbench 这一刻真要 POST 的报文**;下面一栏是 Connector 页「Clawd on Desk」详情的三样探活。原型里的推导规则与本篇拍板 2 逐条一致。

## 设计拍板

1. **三层各干一件事,没有新机制**:

   | 落点 | 干什么 |
   |---|---|
   | `crates/bw-engine/src/clawd.rs` | 本机客户端 + 探活:读 `~/.clawd/runtime.json` 取端口;算 Clawd 同款 agent id;装没装 / 跑没跑 / 注册没注册三样分开取;裸 HTTP POST `/state`,300ms 超时,失败即 `Err`;Codex 内置宠物 → `~/.codex/pets/` 包 |
   | `crates/bw/src/app/pet.rs` | 现算:阻塞 > 待评审 > 进行中 > 没活撤卡;报文;`PartialEq` 就是「要不要重发」 |
   | `crates/app-shell/src/bridge/mod.rs` | `kick_pet` 两个调用点(每次 gather 之后、状态单改之后),起独立任务发,**绝不 await** |
   | `crates/app-shell/src/screens/settings/connector.rs` | Connector 页多一行「Clawd on Desk」(类型「桌面宠物」);详情:三样探活、注册用的两串、把 Codex 宠物包交给它的按钮 |

2. **状态推导**(只认 Issue 标签正本,从上到下第一条命中即停):

   | # | 事实 | `state` / `event` | Clawd 那边 | 会话标题 |
   |---|---|---|---|---|
   | 1 | 阻塞 n>0 | `error` / `PostToolUseFailure` | 出错动画 | `#号 标题 · 卡住了(还有 k 张)` |
   | 2 | 待评审 n>0 | `attention` / `Stop` | 开心 / 举手——「该你点完成了」 | `#号 标题 · 该你了` |
   | 3 | 进行中 n>0 | `working` / `PreToolUse` | 敲键盘 | `#号 标题 · 在跑` |
   | 4 | 都没有 | `idle` / `SessionEnd` | **撤掉这张会话卡** | — |

   - 同档多张:代表 = 最近 `updated_at` 的那张,数量进括号。标题截 48 字(Clawd 截 80)。
   - `session_id = bw:<slug>`,一个项目一条;Clawd 自己加 `agent_id:` 前缀,不与别的应用撞。
   - 报文只带生命周期元数据:四个必填 + `session_title` + `cwd`(工作区路径)。不带正文、不带提示词、不带 token。
   - 不看会话文件、不猜 agent 在想什么——那是 Clawd 自己 hook 的本职。
3. **不重发、不阻塞、不重试**:桥上记「上次推过的报告」,同项目同报告跳过;从没推过且这会儿没活,不为「没事」发 `SessionEnd`。发送在独立 tokio 任务里,成功 / 失败各写一行对照日志(`bw.log`,模块 `pet`),不进 toast、不进 ViewModel。
4. **Agent ID 自己算**:`custom-<slug>-<sha256(可执行文件路径)前 12 位>`,slug 由文件名去扩展名、`-`/`_` 换空格、小写、非字母数字换 `-`、截 32 得到;Windows 路径先小写。单测用上游 Node 实现算出的两组向量钉死。注册这一下必须人做(Clawd 的 prefs 只读)。
5. **探活三样分开显示**(Connector 页,类型「桌面宠物」):
   - 装:macOS 读 `/Applications` 或 `~/Applications` 的 `Clawd on Desk.app` 及其 Info.plist 版本;Windows 看 `%LOCALAPPDATA%\Programs\Clawd on Desk\Clawd on Desk.exe` 等常见位置(版本读不到就写读不到);Linux 认不出 → 「没认出装在哪(不等于没装)」。
   - 跑:`~/.clawd/runtime.json` 存在、`app == "clawd-on-desk"`、端口在 23333–23337。
   - 注册:它的 `clawd-prefs.json`(Electron userData)顶层 `customApplications[].id` 里有没有自算的 id;读不到 → 「不知道」,不是「没注册」。
   - 行状态:在跑 + 已注册 = 已找到;在跑 + 没注册 / 不知道 = 还没配;没在跑 = 还没用上。**没装不是红**——没人非用它不可。
6. **Codex 宠物包**:Clawd 启动 / 刷新主题时自己扫 `~/.codex/pets/<目录>/pet.json + 图` 转成主题。Workbench 的按钮只做一件事:把 `$CODEX_HOME/cache/tui-pets/v1/assets/<id>-spritesheet-v4.webp`(Codex 自己从 CDN 下到本机的八只内置图集)里**已缓存**的,配上 `pet.json`(`id: codex-<id>`、`displayName: <名>(Codex)`、`spritesheetPath: spritesheet.webp`)复制到 `~/.codex/pets/codex-<id>/`。没缓存的列为「本机没缓存」,不去下;目录里已有 `pet.json` 的一个字不动。结果三个数进 toast。
7. **不做**:给 Orca 写 hook;壳内自画;Workbench 主题包;嵌 Clawd 网页端(#154 待定项,等真配对地址);定时轮询(状态只在 Workbench 自己动作时推)。

## 操作逻辑

**主路径**:装好并打开 Clawd on Desk → Workbench 设置 → Connector → 「Clawd on Desk」详情:跑 ✓、注册 ✗,下面给出可执行文件路径与 Agent ID → 到 Clawd「设置 → Agents」加发现路径(指向那个可执行文件所在目录)→ 扫描 → 对 Workbench 点 Register → 回 Workbench 点「重新检测」→ 注册 ✓ → 打开项目、把 `#123` 拖进「进行中」→ Clawd 里多一张 `bw:<slug>` 会话卡,宠物在跑 → 拖进「待评审」→ 宠物举手,标题「#123 … · 该你了」→ 你合入并点完成 → 没活了,卡撤掉。

**分支**:
- 同一项目再拖第二张进「进行中」→ 报告变了(数量 +1)→ 重发;拖来拖去落回同一状态 → 不发。
- 切到另一个项目 → 那个项目自己一张卡;前一张保持它最后的状态(各项目各卡)。
- 项目有阻塞又有待评审 → 阻塞优先(出错);处理完阻塞才轮到举手。
- 开工(▶ Start)走 `RunIssue` → 状态进「进行中」→ 下一次 gather 后推「在跑」。
- 点「把本机 Codex 宠物包交给 Clawd」→ toast 报三个数 → 重启 Clawd 或在它的主题设置里刷新 → 主题列表出现 `Dewey(Codex)` 等。

**出错怎么办**:
- Clawd 没开 / 运行时文件不在 → 探活行「没在跑」,发送 `Err` 静默,日志一行;Workbench 一切照旧。
- 在跑但没注册 → `/state` 回 204,日志记 204;详情页明说「还没注册」并给两串。
- 注册的路径和 Workbench 实际运行的不是同一个文件(比如 cargo run 与安装版)→ 自算 id 与它卡片上的不一致 → 详情页那句提示;人重新加发现路径。
- 主题里没有某个 state(自定义主题缺 `error`)→ Clawd 回 400,日志记 400,不重试;人换主题即可。
- Codex 缓存目录不存在 → 八只全部「本机没缓存」,toast 如实说;不去 CDN 下。
- 读 prefs 失败(权限 / 路径不同)→ 注册状态「不知道」,不装红也不装绿。

## 客户会问

- **它会不会打扰我?** 不会。Workbench 只往 Clawd 发状态;弹不弹泡泡、响不响是 Clawd 自己的设置(勿扰模式照旧生效)。
- **我在 Orca 里用 Claude Code,宠物本来就会动,这有什么区别?** 那是 agent 层(在想、在敲、等审批)。这条补的是 Workbench 层:哪张活到了待评审等你点、哪张阻塞了、AI 手上还有没有活。
- **注册为什么要我自己点?** 上游明说扫出来不等于认得,Register 是人替它作保;Workbench 没有写它 prefs 的入口,也不该有。
- **我在 Codex 里做 / 下的宠物能用吗?** 能——放在 `~/.codex/pets/` 的包 Clawd 自己认;那颗按钮只是把 Codex 内置的八只(你在 Codex 里选过、本机有缓存的)也复制成同样的包。
- **它会存我的活吗?** 不会。发出去的只有状态、活号和标题;Clawd 那边的会话卡在它重启后也不留。

## 硬核挑战(内部 FAQ)

- **协议是 v1、可能变**:字段与端口范围写在 `clawd.rs` 常量里,单测钉住报文形状;上游改协议时只动这一处。runtime.json 1.1 起多了 `ownerPid`,读侧可选。
- **id 算法逐字节对齐**:Node 的 `path.basename` 在 win32 认 `\`,posix 只认 `/`;`toLowerCase` 只在 win32 作用于路径。Rust 侧照抄,不用 `Path` 的平台语义,测试向量由上游实现算出。
- **裸 HTTP 而不是 reqwest**:上游要求 loopback、单 Host、单 Content-Type、无 Origin,一个 `TcpStream` 写请求读状态行就够;不为一条 300ms 的 POST 引 HTTP 客户端库。
- **调用点为什么只有两个**:桥上一切请求最后都过一次 gather(开项目 / 刷新 / 开工),状态单改(拖卡 / 阻塞 / 取消)不 gather 但有 `apply_issue_status`——两处覆盖全部状态变化。没有定时轮询:状态只在 Workbench 自己动作时变。
- **多项目**:一项目一卡,切项目不撤前一张。Clawd 的 Dashboard 会同时列几张,这是它的常态。
- **Windows 认装没装只看常见目录**:electron-builder 的 NSIS 默认装 `%LOCALAPPDATA%\Programs\<产品名>`,人改过目录就认不出——如实「没认出」,不是「没装」;真正管用的是「跑」那一项。
- **资产许可**:Codex 八只图集在 OpenAI CDN,不在 Apache-2.0 仓内;只复制用户本机 Codex 已下载的副本,不分发。Clawd 自身 AGPL-3.0,Workbench 只通过 HTTP 与文件接口对接,不链接其代码。
- **成功怎么量**:不挂指标(02 §6.2「不强求」);以发起人试用反馈决定要不要嵌网页端、要不要项目墙也推。

## 要求与验收

- **R1 现算唯一**:`bw::app::pet::derive` 只由 Issue 状态标签推导;优先级 阻塞 > 待评审 > 进行中;都没有 → `None`;同一输入两次结果相等(单测覆盖)。
- **R2 报文形状**:四个必填字段 + `session_title` + `cwd`,无正文 / 提示词;`SessionEnd` 报文 `state: idle`(单测)。
- **R3 id 对齐**:`agent_id_for` 与上游算法在 posix / win32 两组向量上逐字节相同(单测);详情页显示的 id 与 Clawd 注册后卡片一致(人核)。
- **R4 零阻塞**:`kick_pet` 起独立任务、不 await;连不上的端口在 2 秒内返回 `Err`(单测);日志有 `pet` 行,toast 没有。
- **R5 不重发**:同项目同报告不发第二遍;从未推过且无活不发 `SessionEnd`(桥上判据,E2E 读日志核)。
- **R6 探活三样分开**:Connector 页详情三行各自陈述事实;没在跑 = 还没用上(不红);读不到 prefs = 不知道。
- **R7 Codex 包**:只复制已缓存的、不覆盖已有、`pet.json` 形状符合 Clawd 校验(单测);toast 三个数。
- **R8 门禁**:AGENTS「提交前门禁」全过;`verify --profile pr` 带本特性 suite(定义见下,实现随带入补)。

### 验收点 ↔ 用例(环 5 / 环 6 定义层)

| 验收点 | suite(`.bw/release/e2e/suites/desktop-pet.json`,`feature: desktop-pet`) | 用例名 |
|---|---|---|
| R4/R6 | 假 `BW_CLAWD_DIR` 不放 runtime.json → 深链 `BW_VIEW=settings` → Connector 页「Clawd on Desk」= 还没用上;开壳耗时不受影响 | `pet-offline-honest` |
| R2/R5 | 假 `BW_CLAWD_DIR/runtime.json` 指向用例起的本地 HTTP 桩 → 沙箱项目拖一张进「进行中」→ 桩收到 `state=working`、`session_id=bw:<slug>`;再拖回同列 → 桩没有第二条 | `pet-push-working` |
| R1 | 桩场景:拖进「待评审」→ `attention`;标阻塞 → `error`;全部完成 → `SessionEnd` | `pet-priority-and-withdraw` |
| R7 | 假 `CODEX_HOME` 放两张缓存图 + 一个已有包 → 点按钮 → 目录读回:新写 2、没动 1 | `pet-codex-pack-export` |
| 旅程(环 6,`kind: acceptance`) | 真机:Clawd 开着并已注册 → 深链进计划屏 → 拖 `#n` 进「进行中」→ 在 Clawd Dashboard 读回 `bw:<slug>` 卡 working → 拖进「待评审」→ 卡 attention → 点完成 → 卡消失 | `pet-journey` |

## 标注的冲突

1. **#154 那 7 个 commit 丢了**:本实现从零写,落点与 #154 表格一致但细节(调用点两处而非三处、探活 Windows 认目录、Codex 包按钮)是本次的决定;#154 里「已验」的项在本分支需重验。
2. **发起人说「把 codex 的宠物包打进去」**:本篇解释为「把本机 Codex 已缓存的内置宠物复制成 Clawd 认的包」(拍板 6);若指随 Workbench 分发一批包或一键装社区包,需改判并处理许可。
3. **Connector 类型新增「桌面宠物」**:`ConnectorKind` 加一个变体,capability-panel 的 spec §2 分类表未同步——随本 PR 在该 spec 补一行。
4. **实现在本容器未编过壳**:云端无 GTK;`bw` / `bw-engine` 单测与 clippy 已过,`app-shell` 编译与真壳截图以 Windows CI 与本机验证为准(见 PR 验证段)。
