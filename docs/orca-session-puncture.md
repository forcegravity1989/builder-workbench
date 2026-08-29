# 会话屏改嵌 Orca — 穿刺正本

> **30 秒导读**:会话屏改成两个全屏页签:Orca / Open Design。穿刺人眼过,architecture 模块 7 **已锁定**。本文件仍是穿刺证据正本;buddy 改造在同一条 `pierce/orca-session`。另一条 `worktree-orca-adapter` 锁着,不改、不合入。

- 分支:`pierce/orca-session`(从 master `60c0da3` 切)
- 旅程站:会话屏
- 状态:**穿刺正式过,进入 buddy 改造。** 跳转/新建/Claude 系统提示词/Cursor 开工均人眼过。网页不跟是 Orca 另窗,不阻塞这边。token / pairing 不入库。
- 写代码:会话屏两组件 + `orca` 模块(接口一次定住)+ 新树落到 `.bw/worktrees`。PTY 整包封存 `legacy_pty/`,不删、不开工再调。不碰 `worktree-orca-adapter`。不迁旧平级树。
- 更新日期:2026-08-28

---

## 人要的产品(2026-08-28 已锁进 architecture 模块 7)

1. 会话屏两个组件:**Orca**、**Open Design**。buddy 左右栏 / 终端 / 文件 / diff / git / MR / 动作条 / 「看看喂了什么」都删;停止 / 开 MR / 推评审 / 删会话在 Orca 里做,或在计划屏拖列。系统提示词只在开工时一次性灌进 Orca/OD。
2. PTY 封存到 `legacy_pty/`,开工改打 Orca 本地 pipe。新模块接口一次定住,不跟着脚本改形状。
3. 新 worktree:`<仓根>/.bw/worktrees/issue-<n>`,忽略提交。旧平级兄弟不迁、不删,接回时还能打开。
4. 历史会话在 Orca 里就地 Resume;不把旧树挪进新目录。网页跟随是 Orca 另窗。

## 四步顺序(后一步吃前一步的证据)

| 步 | 做什么 | 什么叫过 | 现在 |
|---|---|---|---|
| **1** | 历史项目/会话在**安装版桌面 Orca**里看得见 | Projects 栏有 `workbench` 且能点开 `workbench-issue-*`;历史里能看到对应 Claude 对话;能 Resume 一条 | **人眼过。** 树叫 `bw/issue-N`;搜不到是默认 limit 500 + 工作区滤镜;Resume 通了。 |
| **2** | Orca web 嵌进 buddy 中栏,核心能用 | iframe 里能看到第 1 步同一批项目和会话 | **第一刀过。** 跳转 RPC 通,人眼:**桌面跟、网页不跟**。新建还没打。网页跟随是 Orca 的活。 |
| **3** | 源码能出 web(能打包 / `dev:web` / serve) | 源码打出来的 web 和安装版看到同一批 | 未开始 |
| **4** | 砍旅程用不到的 Orca 入口 | 嵌进去不胀、不挡干活 | 最其次,最后做 |

第 2 步硬点是 web **pairing**(不是开个 URL 就进桌面那份状态)。第 1 步不过,嵌进去也是空的,分不清是配对坏了还是没登记。

---

## 第 1 步为什么看不见(已核对源码,等人眼验)

Orca **不会扫** `D:\builders-workbench\workspaces`。侧栏只认加进去的 **git 仓根**。

- 要加的是:`D:\builders-workbench\workspaces\workbench`
- 不要加:`D:\builders-workbench\workspaces`(那是一堆仓和兄弟目录)

`workbench-issue-1` 这类平级树是 buddy 用 `git worktree add` 建的。Orca 标成 **`external`**(没有 Orca 自己的创建元数据)。2026-05-23 之后新加的仓,外部 worktree **默认 hide**。要显示,必须:

- 该仓 `externalWorktreeVisibility = show`,或
- 把具体路径放进 `importedExternalWorktreePaths`

会话正文不在 Orca 库里。Claude 写在:

`%USERPROFILE%\.claude\projects\<把路径里的 \ 换成 ->\<session-id>.jsonl`

workbench 主仓本身 **0 条** jsonl。对话全在平级兄弟上,例如:

- `D--builders-workbench-workspaces-workbench-issue-1`(1 条)
- 同结构还有 issue-6 / 8 / 10 / 11 / 15 / 22 / 25
- `bridge` 等同目录项目也是同一套

历史面板按 cwd 是否落在**当前可见范围**过滤。树被藏起来,对话看起来像没了。scope=`all` 有时能扫到文件,不能代替 Projects 栏可见。

**不能把旧树挪到 `.bw\worktrees` 还指望对话自动出现**——cwd 一变,slug 就变。新活走新路径;旧活就地 import。

Orca 三层别混:

| 层 | 正本在哪 | 我们怎么绑 |
|---|---|---|
| 仓 / worktree | Orca repo 记录(`worktreeBasePath` / `importedExternalWorktreePaths` / `externalWorktreeVisibility`),用户数据 `%APPDATA%\orca\` | `repo.add(仓根)` + `repo.update` |
| 会话正文 | Claude 的 jsonl | 不搬文件;用 cwd 或 session id |
| 运行时绑定 | 进程里 pane → worktree → session id | `ensureAgentSession`(kind=`explicit`) |

另:Orca 自己建树且 `nestWorkspaces` 开着时,可能落到 `C:\Users\z30026659\orca\workspaces\...`。以后新活必须先设 `worktreeBasePath=<仓>\.bw\worktrees`。

代码锚点(Orca 源码 `D:\2026\code\orca`):`src/shared/worktree-visibility-resolution.ts` 的 `shouldShowWorktree`;`src/shared/external-worktree-visibility.ts`;`src/main/runtime/rpc/methods/repo.ts` 的 `repo.add` / `repo.update`;`src/main/ai-vault/session-scanner-roots.ts`。buddy 平级路径写在 `crates/bw-engine/src/workspace.rs` 的 `issue_worktree_path`。

---

## 第 1 步人怎么验(安装版桌面,今天)

1. 打开刚重装的 Orca。侧栏若已有 workbench,那是 `D:\2026\code\workbench`,不是被管仓。
2. 点 **添加项目**(Add Project / `repo.add`),不要点 **新工作区**(会在当前项目下新建一棵树,默认落到 `C:\Users\z30026659\orca\workspaces`)。路径填 `D:\builders-workbench\workspaces\workbench`(不要填上一级,也不要再加一遍开发仓)。选已有 git 检出,不要建成「文件夹工作区」。
3. 这个仓的外部 worktree 改成 Show,或把 `workbench-issue-1` 等路径显式 Import。
4. 看 Projects 栏有没有 `workbench-issue-*`。
5. 历史面板 scope 先用 project,不行再试 all。
6. 点一条旧对话 Resume。
7. 通了再对 `D:\builders-workbench\workspaces\bridge` 重复一遍。

通了把结果写进下面「进展」;没通把「Add 的路径 + 外部 worktree 是 hide 还是 show」写进来。

---

## 本机场外(2026-08-28)

- 安装版 Orca:人已重装。`%APPDATA%\orca` **用户数据大多还在**(有 `orchestration.db`,时间戳早于重装),不是空白配置。runtime 已换新进程,仍在跑,本地 pipe + `ws://0.0.0.0:6768`。**不要把 `orca-runtime.json` 里的 token 写进仓。**
- Orca 源码最新:`D:\2026\code\orca`(约 1.4.178-rc.2)。较早调研快照:`D:\2026\code\orca-main\orca-main`。
- 被管仓:`D:\builders-workbench\workspaces\workbench` 及平级 `workbench-issue-*`、`workbench-bw-ledger`;同目录还有 `bridge` 等。
- 开发仓:`D:\2026\code\workbench`(本分支)。自己的 `.bw\worktrees\workbench\buddy-live*` 是仓外/人工树,产品开工器还没改。
- 另一条尝试:`worktree-orca-adapter`,worktree 在 `.claude/worktrees/orca-adapter`,**locked**,有未提交脏改动。方向后来也是 iframe 嵌 web,卡在老会话 resume / import / pairing / FileExplorer web 崩。本分支只读参考,不写进那棵树、不和它抢。
- 主仓 `.scratch/` 里有夜间穿刺报告(T2 RPC、不嵌 UI)。**人后来否了「只走协议不嵌 UI」**,以本文件四步为准。

---

## Add 前快照(2026-08-28,人还没点 Add)

正本文件:`%APPDATA%\orca\profiles\local-default\orca-data.json`(约 49KB,重装后用户数据还在)。只记路径和可见性,**不记 token**。

**当前登记的仓只有 2 个,都不是 buddy 管理目录:**

| id 前缀 | 路径 | 显示名 | 外部 worktree | worktreeBasePath | 显式 import |
|---|---|---|---|---|---|
| `8462f821` | `D:/2026/code/bridge` | bridge | **hide** | (无) | (无) |
| `34a1c01c` | `D:/2026/code/workbench` | workbench | **hide** | `D:\2026\code\workbench\.bw\worktrees` | `D:\2026\code\workbench-issue-99` |

`orca-data.json` 全文 **0 次**出现 `builders-workbench`。`D:\builders-workbench\workspaces\workbench` **没有登记**。

所以侧栏里那个叫 workbench 的,是**开发仓**,不是被管项目。开发仓下面能看见的是 `.bw\worktrees\workbench\buddy-live*` 和已 import 的 `workbench-issue-99`(源码仓平级,不是 `D:\builders-workbench\...`)。平级的 `workbench-issue-1` 那些对开发仓来说也是 external,默认 hide。

**全局设置:** `nestWorkspaces=true`,`workspaceDir=C:\Users\z30026659\orca\workspaces`,`worktreeVisibilityDefaults` 未设(新仓外部树走 hide)。当前会话停在开发仓主检出。

**残留(仓记录已删,磁盘还留着):**

- `terminal-history` 里曾有过 repo `2180706e` → `D:/builders-workbench/workspaces/workbench` 和 `workbench-issue-1`(另一条分支穿刺留下的,现在 repos 列表里没了)
- 还有 `05f79be4` → 只绑过 `workbench-issue-1`;`f504fc79` → `workbench-issue-1` 下面再套的 buddy-live-2
- ai-vault 解析缓存里 `builders-workbench` 出现 79 次——**会话文件 Orca 扫过**,缺的是仓登记 + 树可见,不是没对话

人 Add 时必须加 `D:\builders-workbench\workspaces\workbench`。如果加已经在表里的 `D:\2026\code\workbench`,什么都不会变。Add 之后对照本表 diff `orca-data.json` 的 `repos` 段,看多出来的 id / `externalWorktreeVisibility` / `importedExternalWorktreePaths`。

### Add 后(2026-08-28 15:27)

多了一条仓:

| id 前缀 | 路径 | 外部 worktree | worktreeBasePath |
|---|---|---|---|
| `6fa03e4b` | `D:/builders-workbench/workspaces/workbench` | **show** | (无,新树仍会落到 Orca 默认 `workspaceDir`) |

`projectHostSetupMethod=imported-existing-folder`。`projects` 仍是 2 条 remote 身份——这条和开发仓共用 `git:codehub-dg-g.huawei.com/z30026659/workbench`。当前会话已切到这条仓的主检出。

Orca 已把这些路径写进 `worktreeMeta`(侧栏按理能列):`workbench-issue-1/6/10/11/15/22/25`、`workbench-bw-ledger`、嵌套的 `issue-1/.bw/worktrees/.../buddy-live-2`、以及 Orca 自己目录里的 `workbench-issue-10/buddy-live`。磁盘上的 `workbench-issue-8` 没进 meta(多半不是活的 git worktree)。

**左边点树 ≠ 打开旧 Claude。** buddy 当初在自己的 PTY 里跑 `claude`,Orca 没在这些树上开过 agent 标签,所以点 worktree 只会新开 Terminal 1。旧对话在右侧「智能体会话历史」,要 Resume 才回到那棵树。

**499 条是「项目 / 全局」范围。** 被管仓和开发仓共用同一个 git remote(`z30026659/workbench`),范围选「项目」会把两边所有树、包括 `claude -p` 看图的临时会话都算进来。左边换树不会缩小这个列表。

找 buddy 那几条:

**不要先切「工作区」再在主仓上点分支。** 「工作区」=当前打开的那一棵树的目录,不是这个 git 仓的所有分支。主仓路径是 `D:\builders-workbench\workspaces\workbench`,对话在平级的 `workbench-issue-1`,Orca 用「cwd 是否在当前树里面」判断——`workbench-issue-1` 不是 `workbench\` 的子目录,所以主仓上选工作区一定是 0;再在主仓里切 git 分支,当前树路径不变,还是 0。

jsonl 里 cwd 已核对:`D:\builders-workbench\workspaces\workbench-issue-1`(session `6340093e-…`)。

正确顺序:

1. 左边在被管 workbench 下**打开**(选成当前工作区)标成 **`bw/issue-1`** 的那一行(路径才是 `workbench-issue-1`),等中间变成这棵树,再把范围改成工作区——应只剩约 1 条。
2. 更稳:范围留在 **项目**,搜 session id `6340093e` 或标题「私人会话」。**不要只搜 `path:workbench-issue-1`**——那是子串,会把 `issue-10/11/15` 一起捞出来。行上「工作树」写 `bw/issue-1`、cwd 是 `D:\builders-workbench\workspaces\workbench-issue-1` 才对,再 **在工作树中恢复**。

---

## 进展

| 何时 | 谁 | 事实 |
|---|---|---|
| 2026-08-28 | 窗口 | 从 master 开 `pierce/orca-session`。第 1 步未过。人已重装 Orca;APPDATA 用户数据未清空。 |
| 2026-08-28 | 窗口 | Add 前读了 `orca-data.json`:只登记了 `D:/2026/code/bridge` 和 `D:/2026/code/workbench`,外部树都 hide。被管仓 `D:\builders-workbench\workspaces\workbench` **未登记**。 |
| 2026-08-28 | 人 | 点了添加项目,路径是被管仓。 |
| 2026-08-28 | 窗口 | Add 后多出 repo `6fa03e4b`,path=`D:/builders-workbench/workspaces/workbench`,`externalWorktreeVisibility=show`(不是默认 hide)。`worktreeMeta` 已扫到 issue-1/6/10/11/15/22/25、账本、以及 `C:\Users\...\orca\workspaces\workbench-issue-10\buddy-live`。磁盘上还有 `workbench-issue-8`,meta 没扫到。未设 `worktreeBasePath`。与开发仓共享同一个 git remote(`z30026659/workbench`),侧栏会有两个都叫 workbench 的项目。 |
| 2026-08-28 | 人 | 左侧 Projects 能看见 issue 树,点开都是新 Terminal 1、没有 Claude。右侧智能体会话历史约 499 条,切左边树右边不跟着滤。范围改成工作区后变成 0,再点任何分支仍是 0。 |
| 2026-08-28 | 窗口 | 工作区=0 符合 Orca 规则:主仓 `...\workspaces\workbench` 自己 0 条 jsonl;对话 cwd=`D:\builders-workbench\workspaces\workbench-issue-1`,是平级目录,不算在主仓里面。在主仓上切分支不会改当前树路径。 |
| | | 第 1 步人眼结果:**仓和树可见。要先打开 issue-1 再选工作区,或项目范围搜 `path:workbench-issue-1` 再 Resume。** |
| 2026-08-28 | 人 | 侧栏看不到 `workbench-issue-1`,下面是 `bw/issue-1`。项目范围搜 `path:workbench-issue-1`,命中标题「更新指标 + 制定本周计划 2026-W35」,行上工作树是 `bw/issue-10`。上一窗口卡死。 |
| 2026-08-28 | 新窗口 | **不是不知道。** 磁盘、`git worktree`、`orca-data.json` 的 `worktreeMeta` 都有 `D:/builders-workbench/workspaces/workbench-issue-1`。Orca 侧栏写的是 **git 分支名**:`mergeWorktree` 在 `displayName` 空时用 `branchShort`(`bw/issue-1`),不用文件夹名。`path:` 是子串 `includes`,所以 `workbench-issue-1` 也会命中 `issue-10/11/15`。那条周计划对话 cwd 是 `workbench-issue-10`,分支 `bw/issue-10`。issue-1 自己的对话标题是「AI会话界面支持新增私人会话且不绑定issue」,session `6340093e-…`。搜 `6340093e` 或标题里的「私人会话」,不要只用 `path:workbench-issue-1`。 |
| 2026-08-28 | 人 | 「私人会话」和 `6340093e` 都搜不到。怀疑 issue-10 有特殊性、被绑过。 |
| 2026-08-28 | 新窗口 | **搜不到是因为人正站在 issue-10 上,不是 issue-1 丢了。** `orca-data.json` 的当前树=`D:/builders-workbench/workspaces/workbench-issue-10`。历史默认范围是「工作区」:只留 cwd 落在当前树里的会话,再在这份列表上搜。issue-1 的 jsonl 还在,标题/id 都对,52 条;工作区滤掉它,搜什么都是 0。`path:workbench-issue-1` 仍能命中,是因为 issue-10 的路径含子串 `workbench-issue-1`。issue-10 的特殊性:①当前打开的就是它;②Orca 自己在 `C:\Users\z30026659\orca\workspaces\workbench-issue-10\buddy-live` 建过一棵树(`nestWorkspaces`);③它的 jsonl 今天下午 15:21 还动过,全机 2671 条里只比它新 4 条,必进上限;issue-1 的 jsonl 14:20,比它新的有 647 条,默认 250/500 上限会把它挤掉。先左边点 `bw/issue-1`,范围改工作区(应只剩 1 条),或范围改**全局**并把条数调到 unlimited,再搜 `6340093e`。 |
| 2026-08-28 | 人 | 核心原因是 limit 500。Resume 通了。选 issue-1 右边仍是全部,怀疑 Orca 有 bug。判定历史不用另做兼容。问下一步:嵌进 buddy / 点会话跳 Orca 正确目录 / 先改 worktree 规范 / 还要不要再穿。 |
| 2026-08-28 | 人 | 规范/buddy UI 押后。安装版已开 web。给了 LAN `:6768/web-index.html#pairing=…` 链接。要一份新窗口 prompt:查最新 Orca 源码怎么打安装包、怎么起 web,便于以后砍重复入口只留 projects+会话。 |
| 2026-08-28 | 窗口 | **第 2 步第一刀=浏览器配对,不嵌 buddy。** 安装版 `serve` 出 `web-index.html`,hash 里是 `orca://pair?code=`(含 endpoint / deviceToken / 公钥,`scope=runtime`)。没有 hash 的裸页进不去桌面那份状态。token **不写进仓**。源码仓 `D:\2026\code\orca` 约 1.4.178-rc.2:`dev:web` 只起 Vite 前端,不带本机 runtime;安装包 `pnpm run build:win`(electron-builder + nsis)。**不要**同时跑源码桌面和安装版(两套 user-data 打架)。新窗口只读测绘打包/web/可砍面,不改 buddy、不改这台已在跑的安装版配置。 |
| 2026-08-28 | 人 | 浏览器打开 pairing URL,左边能看见 issue-1。右边栏整栏:`The right sidebar hit an error. Retry the sidebar or switch tabs to reload this surface.` 问能不能唤醒其他会话。 |
| 2026-08-28 | 窗口 | **配对过了;web 右栏挂了,Agents/Resume 从网页唤醒不了。** 整栏 `RightSidebar`(含活动条和 vault)包在一个 `RecoverableRenderErrorBoundary`(`AppWorkspaceShell.tsx`)。任一 tab(常见是 Explorer 懒加载块 / 旧 FileExplorer web 崩)一抛,图标条一起没了,文案说的「切 tab」点不到。Vault 没有快捷键。桌面安装版右栏不受影响,旧会话仍在那里 Resume。F12 控制台找 `[right-sidebar] render crash` 才是哪块炸的。不在 buddy 里修。 |
| 2026-08-28 | 人 | 判定是旧安装版。升到最新后网页能看见、能唤醒。又给了一条 `127.0.0.1:6768` pairing URL。问下一刀是不是:跳到某个会话 + 新建会话并注入提示词。 |
| 2026-08-28 | 窗口 | **是。URL 本身不能深链会话**(`#pairing=` 只鉴权)。跳转走 `terminal.ensureAgentSession`(kind=`explicit`, worktree + claude + providerSession.session_id)。新建走 `terminal.createAgentSession`(worktree + agent + 可选 `prompt`/`promptDelivery` + `agentArgs`)。铁律/系统提示词挂 `agentArgs` 的 `--append-system-prompt`,不是 `prompt`(`prompt` 是首条用户话)。同机烟测读 `%APPDATA%\orca\orca-runtime.json` 走本地 pipe,不要把 pairing token 写进仓。web 客户端 `presentation:focused` 会被改成 `background`。 |
| 2026-08-28 | 人 | 产品预期:buddy 点会话 = 直接落到那条 Orca 会话。问 web 是不是不支持直接跳。新建并灌词在现有 buddy 里就是▶跑一件事,用户无感知。 |
| 2026-08-28 | 窗口 | **web 地址栏不支持会话深链**(hash/query 只认 pairing)。buddy 点会话不是换 URL,是 iframe 已配对 + 调 `ensureAgentSession`,网页应跟到那棵树/那个 tab。这刀还没人眼验。新建+灌词对外仍是一件开工,对内两条字段(`prompt` 用户话,`agentArgs` 系统提示词)。 |
| 2026-08-28 | 人 | buddy 怎么点?是不是小脚本?RPC 网页跟不跟怎么验?可以写。后面会改 Orca,buddy 难写的放到 Orca。 |
| 2026-08-28 | 窗口 | 今天的「点」= `.scratch/orca-rpc-smoke.cjs`(本地 pipe,不进产品)。以后 buddy 会话卡片同一条 RPC。`status.get` 通(安装版 1.4.190,`agent-session.host-authority.v1`)。`jump` 打 `6340093e` / `path:…workbench-issue-1`。人眼:配对网页是否离开当前树、落到那条 Claude;桌面是否也切了。网页不跟 = Orca 缺「配对端跟随 host 选中」,不在 buddy 里用 URL/postMessage 绕。`create` 默认同树 draft;`--submit` 才真发给 Claude。 |
| 2026-08-28 | 人 | 浏览器停在 issue-22,桌面停在 issue-1。RPC 不该人跑,窗口打一次人看一次。 |
| 2026-08-28 | 窗口 | 第一次 jump 后两边已经岔开。第二次 jump 刚打,disposition=`adopted`(复用第一次那条 tab)。人只看网页会不会离开 22 回到 issue-1。 |
| 2026-08-28 | 人 | 第二次后网页还在 22。要把桌面和网页都先改成 22,再打一次。 |
| 2026-08-28 | 窗口 | 第三次 jump 已打,又是 `ok` / `adopted`,同一条 tab。人看:两边是不是一起离开 22、进 issue-1。 |
| 2026-08-28 | 人 | 桌面变成 issue-1。网页没变。 |
| 2026-08-28 | 窗口 | **跳转锁定:本地 pipe 的 `ensureAgentSession` 只推动桌面 host,已配对 web 不跟随。** 以后 buddy 若只发同一条 RPC,嵌进去的 iframe 也不会自己切树。不在 buddy 用 URL / iframe postMessage 绕。Orca 补「配对端跟随 host 当前树/tab」(网页 Resume 是 web 自己先选树再 ensure)。新建那刀另验,预期同一分叉。 |
| 2026-08-28 | 人 | Orca 任务界面有没有跳会话?网页人手点是怎么跳的?为什么脚本跳不了? |
| 2026-08-28 | 窗口 | **任务页不跳 Claude 会话。** Tasks 的 Resume/Open 是 `activateAndRevealWorktree`:打开绑在 Linear/GitHub issue 上的**工作区**,不是 jsonl session。网页人手点「在工作树中恢复」走 `createWebRuntimeSessionTerminal`:先在**本页** `setActiveWorktree`,再 `ensureAgentSession`(presentation=`background`,故意不抢桌面焦点)。脚本只打后半段 host RPC,网页自己的 `activeWorktreeId` 没人改,所以还停在 22。设计如此:「focus belongs to the paired client」。 |
| 2026-08-28 | 人 | 打 draft。 |
| 2026-08-28 | 人 | 是多了一个,输入先是那句 pierce smoke,忽然变成 are 并发出去,最后归在 issue-1 下新 Claude。 |
| 2026-08-28 | 窗口 | **新建通了;draft 被提交是脚本没给系统提示词加引号。** Orca 会把 `agentArgs` 按 shell 拆 token。`--append-system-prompt You are …` 里只有 `You` 进系统提示词,后面的 `are a buddy…` 被 Claude 当成用户话发出去,所以先看到 --prefill 的正确草稿,再变成 `are`。脚本已改成 `'You are …'`。create 人眼过(桌面新会话归 issue-1);draft 稳住要再打一次。`--submit` 还没打。 |
| 2026-08-28 | 人 | 不用再打 draft,打下一个要验的。 |
| 2026-08-28 | 窗口 | `create --submit` 已打,`ok` / `created`,`Terminal 5`,树=`workbench-issue-1`,系统提示词已加引号。人看桌面:是不是新 Claude;发出去的是不是整句 pierce smoke(不是 `are`);有没有回 `PIERCE_OK`;是否归 issue-1。网页预期不动。 |
| 2026-08-28 | 人 | 你说的都对。但怎么证明系统提示词打进去了? |
| 2026-08-28 | 人 | 系统提示词里写要求,用户输入用「你好」看回不回指定词。再打一条 Cursor。 |
| 2026-08-28 | 窗口 | Claude `Terminal 6`:`--append-system-prompt "Ignore… SYS_CLAUDE_OK…"` + 用户话「你好」。过=只回 `SYS_CLAUDE_OK`,打招呼=系统提示词没吃进去。Cursor `Terminal 7`:`cursor-agent --yolo` +「你好」。`cursor-agent --help` **没有** `--append-system-prompt`;系统提示词这条对 Cursor 灌不进去,只能验新建+用户话。`--mode ask` 没出现在进程上,Orca 给 Cursor 默认加了 `--yolo`。 |
| 2026-08-28 | 人 | OK 没问题。确认 Cursor 不支持灌系统提示词的话,是不是要把系统提示词拼进用户输入? |
| 2026-08-28 | 窗口 | **确认:cursor-agent 没有系统提示词开关。** `--help` / `agent --help` 只有 positional `prompt`,没有 `--append-system-prompt` / `--system`。Orca 对 Cursor 也不做这层映射。开工当下要把铁律拼进 `prompt`(用户话前面)。另一条是往树里写 `.cursor/rules`,那是仓文件不是启动参数,这刀不做。Claude 仍走 `agentArgs --append-system-prompt`。 |
| 2026-08-28 | 人 | 穿刺正式过。这边分支改造 buddy;另开窗改 Orca。Orca 不阻塞 buddy。 |
| 2026-08-28 | 窗口 | 模块 7 按穿刺锁定。另窗 brief:[`docs/orca-paired-follow-brief.md`](orca-paired-follow-brief.md)。本窗继续 `pierce/orca-session` 改会话屏,不等人家合跟随。 | |
| 2026-08-28 | 窗口 | 用户话发出去≠系统提示词进了(`PIERCE_OK` 两边都写了,回了也不能当证据)。证明看进程命令行。本机活着的 `claude.exe` 里有一条:`--append-system-prompt "You are a buddy pierce smoke… Do not use tools."` 后面跟用户话整句(submit,无 `--prefill`)。另有一条 draft 残留:`--append-system-prompt You are … --prefill "…"`(没加引号的那次)。 |
| 2026-08-28 | 窗口 | `createAgentSession` draft 已打,`ok` / `created`,tab 标题 `Terminal 4`,树=`workbench-issue-1`。人看桌面:是不是新 Claude;输入框是不是 `buddy pierce smoke: reply PIERCE_OK and stop. do not edit files.`;有没有自动发出去。网页预期不动。 |
| 2026-08-28 | 窗口 | **跳转锁定:本地 pipe 的 `ensureAgentSession` 只推动桌面 host,已配对 web 不跟随。** 以后 buddy 若只发同一条 RPC,嵌进去的 iframe 也不会自己切树。不在 buddy 用 URL / iframe postMessage 绕。Orca 补「配对端跟随 host 当前树/tab」(或 web 自己先 `selectWorktree` 再 ensure,那是网页 Resume 现在的做法)。新建那刀另验,预期同一分叉。 |
| 2026-08-28 | 窗口 | **代码已按模块 7 落地**(本仓 `pierce/orca-session`,未提交)。`workspace.rs`:`issue_worktree_path` 只写 `<仓根>/.bw/worktrees/issue-<n>` + `resolve_issue_worktree`(会话记下路径 → 新目录 → 旧平级兄弟),旧树不迁不删。新 `bw-engine/orca.rs`:`connect`/`ensure_session`/`create_session`/`web_embed_url` 四个函数接口定住;Claude 铁律加引号挂 `agentArgs`(`--append-system-prompt '<…>'`,Windows PowerShell / Unix sh 双写法),Cursor 拼进 prompt;token 不落盘不入 Event/jsonl/日志。`run_issue` 桌面分支改打 Orca(`run_issue_orca`),Orca 没开人话报错不静默 mock;`reopen_session` 有 id 才 ensure(无 id 空着等人开工,不编)。PTY 三文件挪 `bw-engine/legacy_pty/`(开工不调,`InteractiveExecutor`/`Mock`/`LaunchPlan` 再导出给 headless)。会话屏收成动作条 + Orca/OD 两组件(左列表/右文件树/终端页签/xterm 全删)。**web pairing buddy mint 不到**(Orca 只在桌面 IPC / `orca serve` 发配对码,没开本地 pipe RPC),人塞 `BW_ORCA_WEB_URL` 一次(抄 OD 的 `BW_OPEN_DESIGN_URL`)。门禁(fmt/clippy/guard-*/test --workspace)全绿。token 未入仓。 |
| 2026-08-29 | 窗口 | 人改口:会话屏只留 Orca/OD,动作条 + 灌词条删(灌词条对着「当前会话」会骗人 —— buddy 不知人在 Orca 里点了哪条)。清 briefing 残渣,树编过。同一张活再开工从本机 Claude jsonl 收 session id 接回(create 后 `wait_session_id_for_worktree` + `remember_session_id`,不编 id)。 |

(新窗口接手:只在这张表追加事实,不改上面的顺序和验收标准,除非人改口。)

---

## 明确不做(开发期仍守)

- 不碰 `worktree-orca-adapter`
- 不把 token、pairing offer、密钥写进仓
- 不 push
- 不并行试安装版和源码版(两套 user-data 会打架)
- 不做「旧会话迁到 `.bw/worktrees`」兼容层;新树走新路径,旧树就地 Resume
- 不在 buddy 里用 URL / iframe postMessage 冒充配对端跟随(那是 Orca 另窗)
- 不做 pairing 设置页、会话 URL、新 crate、Cursor 专模块、Orca 里代登记仓

---

## 第 1 步过了之后(当前)

人已判定:历史能 Resume,不必另做兼容。右边选树仍显示全部 = Orca「项目」范围按 git remote 合并两边 workbench,换左边树不缩列表;要缩必须范围=工作区且当前树就是那棵。不当作第 1 步失败,也不在这步修 Orca。

下一刀(当前):

1. **跳 / 新建 / 灌词**:**人眼过。** 网页跟随 = Orca 另窗,brief 在 [`docs/orca-paired-follow-brief.md`](orca-paired-follow-brief.md),不挡 buddy。
2. **buddy 本版**:会话屏只留 Orca / OD(动作条/灌词条删;系统提示词只在开工时灌一次);`orca` 模块接口一次定住;`run_issue`/`reopen_session` 改打 RPC;同一张活再开工从本机 jsonl 收 session id 接回(create 后 wait+remember,不编 id);PTY 封存 `legacy_pty/`;新 worktree 落 `.bw/worktrees`(忽略提交)。iframe 暂时可能停在错树上。
3. 不做:pairing 设置页、postMessage、会话 URL、新 crate、Cursor 专模块、Orca 里代登记仓、迁旧树。这些不是砍能力。

### 人怎么验跳转(现在就做)

前提:安装版 Orca 开着;浏览器已经用 pairing URL 进过 `127.0.0.1:6768/web-index.html`(不要新开裸页)。桌面和网页并排放着。

刚才已经打过一次 `jump`。先看一眼当前画面,再做对照:

1. **配对网页**左边是不是 `bw/issue-1`(路径应是 `workbench-issue-1`,不是 issue-10)。中间是不是一条 Claude,历史对得上「私人会话」/`6340093e`。
2. **桌面 Orca**是不是也停在同一棵树、同一条会话。
3. 如果网页**已经**在 issue-1:先在网页左边点开另一棵树(比如 `bw/issue-10` 或账本),确认中间不是那条私人会话。回来说「再打」,窗口再跑一次 `jump`。你只看网页有没有自己切回来。
4. 判定:
   - 网页自己切到 issue-1 且 Claude 在 → **跟过去了**
   - 只有桌面切了、网页还停在你点的那棵树 → **网页不跟**,记成 Orca 缺配对端跟随,buddy 不绕
   - 两边都没切、或中间是新 Terminal 不是那条 Claude → **跳失败**,把两边各自停在哪说一声

新建那刀先别做。跳转人眼过了再说。
