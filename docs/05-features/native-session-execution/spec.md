# Spec · 原生会话执行（一体产品）

> **30 秒导读**：规格对齐 [ADR-0006](../../02-adr/0006-会话执行内嵌-废弃外部Orca嵌页.md)。执行面 = 原生终端 + **Orca 同序建树** + **Explorer / Source Control / Diff**；废弃 Orca iframe 与 `BW_ORCA_WEB_URL`。三份可点原型（浏览器直接开；按仓规不进 git）：[`prototype-v4.html`](prototype-v4.html) 是**现行一体原型**——**一条左栏**装下项目头、四屏导航（总览 · 计划 · 自动化 · 知识库）与始终展开的 Projects，**没有「会话」页签、也没有「配置」页签**（配置的两张表归了设置）；项目墙与设置是**顶层覆盖层**；从计划 ▶开工或点树进执行面，一直走到审变更、停止、接回；**整窗一套 token，皮肤开关一次管整窗**（见拍板 12）。[`prototype-v3.html`](prototype-v3.html) 是上一版，留着对照「三套配色」的问题长什么样。[`prototype.html`](prototype.html) 是**会话面本身**（纯 Orca 工作区，可单独打开当 1:1 参照），V3 / V4 与它同页共用同一份实现，不做第二份。

- 状态:**提议**（2026-09-11）
- 意图:[intent.md](intent.md)

## 设计拍板

1. **执行面主表面 = 本机终端 + 文件面**，不是外部 SPA。中栏页签：**Terminal** / **Claude Code** / **Open Design**（后者仍可 iframe 本机 OD）；不是壳上再套一层「会话 | Open Design」分段。
2. **建树链路对齐 Orca / 现行 `run_issue_orca`**：`provision`（`.bw/worktrees/issue-N`、分支 `bw/issue-N`）→ `refresh_worktrees` → `create_session`（无 sid）或跳过 → `activate/reveal`。人看得见进度，不是黑盒切屏。
3. **文件展示对齐 Orca 右栏**：当前 worktree 的 **Explorer**（树，根=该树路径）；**Source Control**（Staged / Changes / Untracked，相对 compare base）；点变更文件在中栏开 **Diff**。不做完整 IDE 编辑器。
4. **人看得见 Issue ↔ Workspace**：左侧 Projects 列表（高亮当前树）；顶条 Issue 标题、工具、分支、路径、运行态；停止 / 接回。
5. **1:1 的边界：执行工作区照抄 Orca，导航外壳归 Workbench**。**Create worktree** Dialog / WorktreeCreationPanel / Explorer / Source Control / Diff 按 Orca 实际外观复刻（含 **New workspace**）；但**外壳导航是产品自己的**——一条左栏自上而下装项目头、**四屏**导航（总览 · 计划 · 自动化 · 知识库）、**始终展开的 Projects**、帮助 / 设置。**没有「会话」页签**：进执行面靠点 Projects 里的树，或计划屏 ▶开工。左栏与执行顶条用设计系统；中栏+右栏仍 Orca 1:1。开工入口仍可由计划屏预填（拖进进行中或详情 ▶开工 → 打开字段已填 Issue/分支的同一个 Dialog）。
9. **项目墙与设置是顶层覆盖层，不是第五、第六屏**：做成屏就得回答「左栏此刻代表谁」；做成覆盖层不用回答——关掉回原地，上下文一点不丢，人在执行面时也开得出来。**没有「配置」屏**：开工工具映射与技能 / workflow 归设置的「能力」一节（跟真壳 `crates/app-shell/src/screens/settings/` 同一套分节：Connector · Skills · Category · Plugins · AI Assets）。
10. **计划屏默认是列表**（照 `../orca` 的 tasks），看板退到 `▦` 当第二视图 —— 一屏看完所有状态比四列并排更常用。**列表不按状态分组**：状态列的 tag 已经说了一遍，分组头再说一遍；八条活被切成六组，每组一两行，扫起来反而更费劲。改成按「要我管的在前」平铺（进行中 → 待评审 → 阻塞 → 已排期 → 未排期 → 完成 → 已取消）。
11. **定时任务的钟收回 Workbench 自己**（自动化屏，列与字段照 Orca Automations）。铁律不松：到点只负责开会话，自动开出来的活最多推到待评审，**完成永远由人点**。
12. **整窗一套 token —— 视觉正本只能有一个**（V4）。V3 的毛病不是「哪套配色更好看」，是一个窗口里同时活着三套：左栏被硬写了 Apple 冷色、Workbench 屏被钉成 claude 暖色、执行面走 Orca 自己的近黑冷灰。V4 把两套 token 名**恒久共存**（设计系统的 `--color-*` 挂全局 `:root`，Orca 的 `--background/--foreground/--border/--sidebar*` 仍是它自己的），再由 `html[data-skin]` 决定**谁翻译谁**——所以两个方向都能当场切、当场比：
    - `data-skin=ds`（默认）**设计系统赢**：执行面换皮跟着 Workbench 走，**布局 / 交互 / DOM 一律 1:1 Orca 不动**。理由是设计系统才是本仓视觉正本（`docs/04-design-system/`，壳编译期拼入），真壳默认也挂 `data-theme="claude"`。这一版把「1:1」收窄成**结构与交互 1:1，皮肤跟产品**。
    - `data-skin=orca` **Orca 赢**：Workbench 屏与左栏改读 Orca 的冷灰 + 近黑（连 accent 色阶都翻成中性阶——Orca 是单色系，凭空造个品牌色就不叫「Orca 赢」了），**执行面一个像素不动**。
    - 密度按 chrome_only 收：只统一**外壳**（中栏页签条 / 执行顶条 / 左栏导航），**终端与文件树保留 12px**。工具内部本该比阅读区更密，这不是「两个产品」的来源。
    - 语义色两个皮肤下都留着（进行中琥珀 / 完成绿 / 阻塞红），但取值跟着当前色板走——信号是要人看懂的，不是装饰。
13. **计划屏进第一条 issue 之前最多三层**（V4 减负）。原来叠了七层（目标白框 / 五色进度条 / 演示 tag / 预设条 / 筛选条 / 表头 / 分组头），第一条活被推到屏幕三分之一处；现在是标题条 / 筛选条 / 表头三层。四条做法：
    - **状态筹码条一件顶四件**：五色进度条（看这一版的构成）、「全部阶段」下拉（筛状态）、「按状态分组」下拉、「显示 N/M」合成一排可点筹码 —— 带计数就是概览，点一下就是筛选，再点同一颗退回默认。计数按「版本 + 谁的活」筛完的池子算，**不跟着搜索跳**（跳了就不是构成了）；计数为 0 的状态不出筹码。
    - **默认只看没收尾的活**：竖线前两颗是范围 —— **待完成**（默认亮着，藏掉完成 / 已取消，八条变五条）与**全部**；竖线后面按状态。收尾的活要点「完成」「已取消」或「全部」才露出来，默认一屏就是「还要我动手的」。真正筛未完成的开关因此落在筹码上，预设下拉第一项叫**所有人**、只管谁的活 —— 真壳里 `preset=open` 其实什么都没筛，是个空标签。
    - **低频动作收进 ⋯**：刷新 / 出包 / 发版本 / 创建版本 / 删除版本。顶栏只留切版本、新建 issue、⋯、视图切换；菜单内容跟着当前视图变（版本视图给出包 / 发版本，全部 issue 视图给建 / 删版本）。
    - **版本目标降级**：从带边框的 `.goal-box` 降成标题下一行小字，一行截断、点开看全文。它是背景信息，不该比第一条活更重。
    - **一行不说两遍**：行内第二行不再写 `by 谁` —— 负责人列已经有头像 + 名字。
6. **零外部 Orca（目标态）**：无配对 URL、无 `SetOrcaWebUrl`、无设置项「Orca 网页地址」、无 `BW_ORCA_WEB_URL`。
7. **停止是一等操作**：`StopRun` 杀本机 agent/PTY；接回 = activate/reveal 同一棵树，不 silent 第二棵。
8. **MVP 工具**：Claude Code、Cursor；自动化三条收回本机。

## 操作逻辑

**主路径**

1. 计划屏打开进行中 Issue → ▶开工。
2. 进入执行面，展示建树进度：provision → refresh → createAgentSession → activate/reveal；导航四格灭灯，Projects 高亮当前树。
3. 进度结束后：左栏高亮该 Workspace；中栏 Terminal / Claude Code 刷输出；右栏 Explorer 根指向该 worktree；agent 改文件后 Source Control 出现 Changes。
4. 人点 Changes / 树中文件 → 中栏 Diff 审结果 → 计划屏拖完成 / 合入（完成永远人点）。

**分支**

- 已有会话再点开工 / 接回 → 只 activate/reveal，跳过 create。
- 在总览/计划时点 Projects 某棵树 → 同样进入执行面（不经过「会话」页签）。
- 工具未装 / 探活失败 → toast 原话，不起假会话。
- 点停止 → 进程停；终端与变更列表仍在。

**出错**

- provision 失败（目录非空等）→ 人话提示，不覆盖未提交改动。
- refresh 扫不到新树 → 开工失败文案（对齐现行）。
- 接回找不到 worktree → 人话提示，不 `provision` 第二棵 silently。

## 原型

### 一体原型 · [`prototype-v4.html`](prototype-v4.html)

**一条左栏**：项目头（整块可点 = 开项目墙）→ 四屏导航 → **Projects（始终展开）** → 帮助 / 设置 → 皮肤开关。总览 / 计划 / 自动化 / 知识库占满中栏 + 右栏；点树或 ▶开工后露出执行面（顶条 + Orca 中栏/右栏）。在执行面时导航无高亮。

正本不复制第二份：会话面行为仍只有 `prototype.js` 一份（同页复用，不再 iframe，宿主指令沿用原来那套消息协议）；视觉取 `docs/04-design-system/styles.css` + `crates/app-shell/assets/shell.css`，由 `tools/scope-bw-css.mjs` 生成。总览是 `docs/hifi/overview.html` 定稿（`tools/extract-overview.mjs` 抽取，别手改产物），计划是 `docs/hifi/plan.html` 定稿版式。

**V4 的 CSS 分工**（拍板 12 的实现，改样式前先看这段，不然容易改错文件）：

| 产物 | 里面是什么 | 为什么这么切 |
|---|---|---|
| `bw-tokens.css` | 只有设计系统的 token（`:root` + `[data-theme="claude"]`），挂**全局** | token 一旦关进 `#bw-screen`，Orca 那半边就取不到，整窗一套皮无从谈起；`[data-theme]` 保持条件式，所以一个开关能管整窗 |
| `bw-scoped-v4.css` | 只有组件规则，作用域 `#bw-screen` / `#bw-top`，token 靠继承 | 两套 CSS 同页共存要靠前缀压住同名 class（`.btn` `.dialog` `.tab` …）；`#bw-top` 是覆盖层的弹窗根——人在执行面时 `#bw-screen` 整块 hidden，塞进去就开不出来 |
| `prototype-v4.css` | 胶水 + **两个方向的 token 桥** + 皮肤开关样式 | 必须最后加载才压得住前面所有；桥写在这里，两套正本文件都不用改 |

翻译时踩过的两个坑，都记在文件注释里：Orca 的 `--accent` 是**悬停底色**不是品牌色（翻成 `--color-accent` 会让整个执行面糊一层陶土橙）；`prototype.css` 里唯一一处硬色是「在跑」那颗 `#d4a300` 黄点，在 `skin=ds` 下覆写成设计系统的 warning，**不改 `prototype.css` 本身**——它同时是 `prototype.html` 的 1:1 参照，动了就有两份事实。

**项目墙给了两版长相，在墙自己的头上切**（弹窗 / 全窗），方便当场比：弹窗版（居中 1120px）留着后面的上下文，全窗版盖住左栏、更像「换项目是件大事」，横向能多摊卡、搜索找项目更顺手。两版共用同一份内容与同一个搜索框，只换外框。设置固定是居中大弹窗（左列分节 + 右边整页替换，跟真壳同形状）。

| 步 | 看见什么 |
|---|---|
| 1 计划屏 | 默认列表（不分组，按「要我管的在前」平铺，默认只摊没收尾的活）；一排状态筹码既报构成又当筛选；进行中 **#74 带 ▶开工**、**#70 带 接回**；`▦` 切看板；左栏 Projects 已展开 |
| 2 开工 | 进入执行面（导航灭灯），弹出 **Create worktree**，Name / Branch 已按 Issue 预填 |
| 3 建树中 | WorktreeCreationPanel 跑四步；顶条运行态显示**建树中** |
| 4 终端 | 运行态转**运行中**，顶条跟出分支 `bw/issue-74`、路径 `.bw/worktrees/issue-74`、变更 4 个文件；树上亮跑灯；中栏可切 Terminal / Claude Code / Open Design |
| 5 审变更 | 右栏 Source Control + 中栏行号 Diff（会话面自己的能力，不重做） |
| 6 停止 / 接回 | 停止后运行态 **已停止 · 树还在**，终端与变更列表留着；点 #70 接回只 activate/reveal，树仍是三棵，不建第二棵 |

自动化屏、设置弹窗、项目墙、知识库屏给了**最小真实版**：

| 屏 / 覆盖层 | 里面是什么 |
|---|---|
| 自动化 | 8 列表格（名字 / 计划 / 项目 / 下次运行 / 上次运行 / 状态 / Agent / ⋯）+ 行内菜单（立刻跑一次 · 编辑 · 暂停 · 删除）+ 新建/编辑弹窗（左提示词、右 Agent · 项目 · Workspace · 会话 · 计划 · 补跑宽限 · Precheck · setup）；按当前项目过滤 |
| 设置（覆盖层） | 本机（目录 / 外观）+ 能力（Connector · Skills · **Category** · Plugins · AI Assets）。**Category 就是原配置屏那张开工工具映射**：五个类别各挂执行器 + workflow，探不到的行红点，不悄悄退回 Claude |
| 项目墙（覆盖层） | 本机环境条 + 健康概览条（没数据是灰的，不是绿的）+ 项目卡网格 + 搜索框（名字 / 一句话 / 版本号，边打边筛不丢焦点）；点卡换项目，当前项目描边；头上可切弹窗 / 全窗两版 |
| 知识库 | 文档树（`.bw/` 名片与指标 + architecture / CONTEXT + `standard/` 提示词）与代码图（bw → bw-engine → app-shell） |

**跟真壳现状的偏差（实现时按原型改，别照现状抄）**：`crates/app-shell/src/screens/plan/` 现在还是七层那一版 —— `list_view.rs` 排序是未排期优先（`Backlog → … → Cancelled`）、筛选靠「全部阶段」下拉、预设是三颗分段按钮，`mod.rs` 顶栏五颗常显按钮 + `.goal-box` + `.week-progress`。原型里的筹码条 / ⋯ 菜单 / 目标小字都是**新样式**，`shell.css` 里还没有正本（暂时写在 `prototype-v4.css` 里）；落地时这几条要一起搬进 `shell.css` 与 `plan/`。

**这版没做（留白，别当已交付读）**：皮肤开关是**原型对比用的**，产品只会有一套皮——真要定哪套，是人拍完之后删掉开关、留一套；深色主题没做（设计系统那两张色板都是浅色，Orca 的 `.dark` 在 V4 里没接桥）；帮助小窗是独立窗口，点了如实提示；接入项目、刷新、重新检测、改映射一律只给提示，不写盘；项目墙换项目只换项目头与两屏数据，**Projects 里那棵树是会话面自己的演示数据，不跟着换**；拖卡换列没接；除 #74（建树）/ #70（接回）以外的 issue 点开工只给提示，不起假会话。

### 会话面 · [`prototype.html`](prototype.html)

五步（纯 Orca 工作区，不套 Workbench 外壳；留着当 1:1 对照，V3 / V4 复用的就是它的实现）：

| 步 | 看见什么 |
|---|---|
| 1 空闲 | 左栏 Workspaces + 中栏 Terminal + 右栏 Explorer（Find files / Names·Contents） |
| 2 创建 | **Create worktree** Dialog（Project / Name / Agent / Advanced / Create more） |
| 3 建树中 | **WorktreeCreationPanel** faux tab：`Preparing…` → `Fetching…` → `Creating…` → `Setting up…` |
| 4 终端 | 激活 `#74` worktree；终端流式输出；Explorer 显示 git 状态字母 M/A/U |
| 5 审变更 | 右栏 **Source Control**（Create PR、base↔head、Commit、Staged/Changes/Untracked/Committed on Branch）+ 中栏行号 Diff；可 Stage/Unstage |

## 客户会问

- **还要装 Orca 吗？** 目标态不用。
- **和 Orca 差在哪？** 会话表面（建树 Dialog / CreationPanel / Explorer / SC / Diff）按 Orca 1:1；产品入口可仍从计划 Issue 预填打开同一 Dialog。不做完整 IDE 编辑器、SSH/远程 run target、Checks/PR 全量。
- **Open Design 呢？** 照旧可嵌本机页；在中栏 tabstrip 与 Terminal / Claude Code 并列打开。

## 硬核挑战

- Dioxus 内嵌终端字节流必须走 broadcast，禁止进 ViewModel。
- Windows ConPTY / `.cmd` 启动参数沿用已踩坑，勿借机重设计。
- 成功指标：无外部 Orca 时，纳入 → 开工（见建树序）→ 终端 + Explorer/SC/Diff → 停止 → 接回 全链路可演示。
