# Open Design 模块(本机网页内嵌类开工工具:探活 + 会话屏内嵌 + 产物入仓约定)

> 30 秒导读:buddy MVP 两类开工工具之一(另一类终端类 = Claude CLI/Cursor)。讲 OD 怎么探活、怎么内嵌进会话屏、产物怎么进仓;**不讲**通用工具注册与探活机制(那在 `远端与工具探活.md`,这里只讲 OD 这个特例)。作数。

## 这个模块是什么

Open Design(OD)是「本机网页内嵌类」开工工具(design §7.1/§7.3):不起 CLI、不 spawn agent,开工 = 在会话屏的内嵌标签里用本机已开的 OD 干。本模块覆盖探活、会话屏内嵌标签、产物入仓约定三件。

## 代码在哪几层

- `crates/v4-engine/src/open_design.rs:21-36` — `discover_web_url()`:探活唯一入口,返 `Option<String>`(探不到返 None,不 panic)。优先 `BW_OPEN_DESIGN_URL` env,否则 `spawn_blocking` 跑阻塞的管道握手、外面套 `tokio::time::timeout(400ms)`(常量 `:16-17`),不卡 async 运行时
- `crates/v4-engine/src/open_design.rs:1-5,47-73` — 模块顶部定调:**不进 Executor 体系,是本机资源发现**;候选路径 Windows 三条命名管道 / 非 Windows 三条 unix socket,逐个试第一个赢;`forbid(unsafe_code)`,Windows 走 `OpenOptions`+`share_mode`(`:84-96`)不走 unsafe
- `crates/v4-engine/src/open_design.rs:126-142` — `looks_loopback_http`:只放行 `http://127.0.0.1/localhost:<port>`,拒 userinfo(`@`)/缺端口/非 loopback
- `crates/app-shell/src/screens/session/mod.rs:184-191` — 原型类活(`tool=="open_design"`)多一个「Open Design」标签按钮
- `crates/app-shell/src/screens/session/mod.rs:416-453` — `OpenDesignView` 组件:`use_future` 调 `discover_web_url`,探到 → iframe 嵌 loopback 首页(`:440`);没探到 → 如实写「还没接到 Open Design…」不假装嵌(design §7.9 line 586:OD 没起不是空白页)
- `crates/bw-v4/src/app/issue.rs:62-89` — `run_issue` 的 open_design 分支:不开 CLI、不 spawn agent/PTY,只开 worktree + 建会话(`claude_session_id` 空)+ 设进行中;最远还是评审中 / 人点完成,同状态机没特殊待遇
- `crates/bw-v4/src/app/tools.rs:96-108,128-133` — `agent_for("open_design")` 直接拒(本机网页内嵌类不经终端,去会话屏 OD 标签);`probe` 调 `discover_web_url`,Found/Missing 如实
- `crates/v4-engine/examples/od_smoke.rs:1-21` — 读回手段 `cargo run -p v4-engine --example od_smoke`:OD 没起 exit 1,起了 exit 0 打印 loopback url;不碰 claude、不碰网关

## 数据落哪

**零持久化**。探活结果是一次性 loopback url,挂在 `OpenDesignView` 的 `use_signal` 里,不落库、不缓存。OD 本身的产物(设计稿/原型)不在 buddy 的库里——是 OD 导出后落进 issue 那棵 worktree 的文件(见下「产物入仓约定」)。

## 依赖什么

- **上游**:无,只碰本机命名管道/socket + env,不依赖任何远端或 Executor
- **下游**:会话屏 `OpenDesignView` 与 `bw-v4` 的 `probe`(`tools.rs:128`)都调 `discover_web_url`
- **平台**:Windows 命名管道(`\\.\pipe\open-design-*-web`,实测对齐本机 OD 0.16.1)+ macOS/Linux unix socket(`/tmp/open-design/ipc/*/web.sock`)

## 产出与验证

探活:`od_smoke` 读回(见上)。内嵌:深链到原型类活会话屏,stderr 无 panic + OD 标签出现 = 渲染证明;OD 起着 iframe 有内容、没起显示那句人话(design §7.9 line 586)。产物入仓见下。

## 没建什么

- **壳侧 `open_design` 适配模块未建**:`crates/app-shell/src/adapters/mod.rs:12,18-20` 把「Open Design 内嵌」列在「还没开的」,实际只有 `claude_cli`/`codegraph`/`terminal_xterm` 三个目录(design §12.2 line 951-952 列了它,以源码为准:没建)。OD 内嵌直接写进会话屏 `screens/session/mod.rs`,没单开适配模块——OD 不起子进程、没生命周期要管,只是一个 iframe + 一次探活,够不上一个适配模块的体量。
- **OD 导出产物 → MR 的约定(design §7.10 line 598 标「仍 defer」,这里补出)**:
  - **约定路径**:OD 导出产物落 issue worktree(`issue.rs:72` `worktree::provision` 开的那棵树)的 `design/` 目录。OD 不起 agent、不注入提示词,所以「提示词约束 agent 提交到约定路径」**对 OD 工具本身不成立**——靠人从 OD 导出时存进 `design/`。(提示词约束 agent 是终端类 Claude CLI 那半的事,系统提示词第四段 design §7.5 加一行,不归 OD 模块。)
  - **入仓检查(资产盘点)**:不新开盘点表,靠两道已有门,都是现算——①「提交并开 MR」的「0 提交如实弹回」(design §7.2 line 503,判据=树比主检出几个提交):产物没导进树就 0 提交、点它如实弹回、不留分支不留号;②右栏改动文件清单(design §7.1 line 489,`git status --porcelain` 现算):导进来了就在清单里看得见。这跟 §7.4 line 530「结构事实永远能从文件重新读出来,不需要另开一张表缓存」是同一条精神。
  - **仍 defer**:没加「OD 类活评审前 `design/` 非空」这类显式前置校验,今天完全靠 §7.2 那道 0 提交门兜底。要不要加,留 defer。
