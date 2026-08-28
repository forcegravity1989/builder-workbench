# 会话屏改嵌 Orca — 穿刺正本

> **30 秒导读**:这条分支只做一件事——把 buddy 会话屏从「自己嵌 Claude CLI + 左右栏」改成「两个全屏页签:Orca / Open Design」。**设计还没锁定**,architecture 模块 7 仍是旧口径。本文件是窗口挂了之后接手的**唯一进度正本**,聊天结论不写进来就不算数。另一条 `worktree-orca-adapter` 锁着,不在这里改、不合入。

- 分支:`pierce/orca-session`(从 master `60c0da3` 切)
- 旅程站:会话屏
- 状态:**第 1 步未过**——安装版 Orca 里还没亲手看见 `D:\builders-workbench\workspaces` 那批仓和会话
- 写代码:第 1 步人眼验收通过之前,**不改 buddy 产品代码**
- 更新日期:2026-08-28

---

## 人要的产品(未锁定,先记着)

1. 会话屏两个 tab:**Orca**、**Open Design**。buddy 自己的左右侧栏删掉(两边都自带)。
2. 不再自己嵌 Claude CLI / PTY 当会话正文,改嵌 **Orca web**。
3. 历史会话要在 Orca 里呈现正确;新活开工要能自动登记进 Orca。
4. worktree 规范:`<仓根>\.bw\worktrees\xxx`。今天产品代码仍建成平级兄弟 `<父目录>\<仓名>-issue-N`。

## 四步顺序(后一步吃前一步的证据)

| 步 | 做什么 | 什么叫过 | 现在 |
|---|---|---|---|
| **1** | 历史项目/会话在**安装版桌面 Orca**里看得见 | Projects 栏有 `workbench` 且能点开 `workbench-issue-*`;历史里能看到对应 Claude 对话;能 Resume 一条 | **当前步。未过。** |
| **2** | Orca web 嵌进 buddy 中栏,核心能用 | iframe 里能看到第 1 步同一批项目和会话 | 未开始 |
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

---

## 进展

| 何时 | 谁 | 事实 |
|---|---|---|
| 2026-08-28 | 窗口 | 从 master 开 `pierce/orca-session`。第 1 步未过。人已重装 Orca;APPDATA 用户数据未清空。 |
| 2026-08-28 | 窗口 | Add 前读了 `orca-data.json`:只登记了 `D:/2026/code/bridge` 和 `D:/2026/code/workbench`,外部树都 hide。被管仓 `D:\builders-workbench\workspaces\workbench` **未登记**。 |
| 2026-08-28 | 人 | 点了添加项目,路径是被管仓。 |
| 2026-08-28 | 窗口 | Add 后多出 repo `6fa03e4b`,path=`D:/builders-workbench/workspaces/workbench`,`externalWorktreeVisibility=show`(不是默认 hide)。`worktreeMeta` 已扫到 issue-1/6/10/11/15/22/25、账本、以及 `C:\Users\...\orca\workspaces\workbench-issue-10\buddy-live`。磁盘上还有 `workbench-issue-8`,meta 没扫到。未设 `worktreeBasePath`。与开发仓共享同一个 git remote(`z30026659/workbench`),侧栏会有两个都叫 workbench 的项目。 |
| | | 第 1 步人眼结果:**仓已登记。树和会话是否在界面看见,等人看。** |

(新窗口接手:只在这张表追加事实,不改上面的顺序和验收标准,除非人改口。)

---

## 明确不做(直到第 1 步过)

- 不改 buddy 会话屏 / PTY / worktree 路径代码
- 不改 `docs/architecture.md` 模块 7 的现行设计正文(只在「没建」留指路)
- 不碰 `worktree-orca-adapter`
- 不把 token、pairing offer、密钥写进仓
- 不 push
- 不并行试安装版和源码版(两套 user-data 会打架;先安装版)

---

## 第 1 步过了之后(还没到,先占位)

1. 用同一套 `repo.add` + `repo.update` 写一条可复现的本机步骤(脚本可以,先不进产品)。
2. 才开第 2 步:嵌安装版 serve 的 web,先证明 iframe 能看到同一批项目。
3. 那时再改 architecture 模块 7 / 9 和高保真——人点头设计,再动壳。
