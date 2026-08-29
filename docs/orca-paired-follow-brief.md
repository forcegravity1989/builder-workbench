# 给另一窗:Orca 配对端跟随 host

> **30 秒**:buddy 嵌的是 Orca web(所属 wry 窗)。本机 pipe 打 `ensureAgentSession` / `createAgentSession` 只推动桌面,已配对网页不跟。这窗只改 **Orca 源码仓**,不改 buddy。不阻塞 buddy 先嵌 web、先打同一条 RPC。

把下面整段交给开在 `D:\2026\code\orca` 的窗口。

---

你在 Orca 源码仓干活(`D:\2026\code\orca`,约 1.4.178-rc.2 或更新)。本机同时有一份**安装版** Orca 在跑,user-data 在 `%APPDATA%\orca`。**不要**再起一份源码桌面抢同一份 user-data。改完用安装版或单独 user-data 验,二选一,不要并行两套。

## 要修什么

已配对的 web 客户端(`web-index.html`,scope=runtime)必须跟随 **host 因本地 RPC 发生的工作区/会话切换**。

对对照过三次(最干净一次:桌面+网页都先停在 `bw/issue-22`,再从本机 named-pipe 打):

```
terminal.ensureAgentSession
  kind: explicit
  worktree: path:D:\builders-workbench\workspaces\workbench-issue-1
  agent: claude
  providerSession: { key: session_id, id: 6340093e-ba66-40e8-8b09-26373b33354a }
  presentation: focused
```

结果:RPC `ok`,桌面到 issue-1,网页仍在 22。`createAgentSession` 同样只出在桌面。

## 根因(已对源码)

网页人手点「在工作树中恢复」能跳,因为它走 `createWebRuntimeSessionTerminal`:

1. 本页 `setActiveWorktree`(`web-runtime-session.ts` 的 `selectWebRuntimeSessionWorktree`)
2. 再 `ensureAgentSession`,且 `presentation: background`(故意不抢桌面焦点)

注释原话:focus belongs to the paired client; host 可以没 renderer。

本地 pipe / buddy 只打第 2 步。`clientKind` 为空,`focused` 不会被改成 `background`,所以桌面切了。网页自己的 `activeWorktreeId` 没人改。

Orca 任务页的 Resume/Open 是 `activateAndRevealWorktree`,打开的是工作区,不是 jsonl 会话,不要拿那条当参考实现。

`#pairing=` 只鉴权,不要做 `#session=` URL 深链来绕;buddy 不会拼会话 URL,也不会 iframe postMessage。

## 过线

桌面 Orca + 已配对浏览器并排。两边先对齐到**同一棵别的树**(例如 issue-22)。用 buddy 仓里的烟测(人不用跑命令,那边窗口会打):

`node D:\2026\code\workbench\.scratch\orca-rpc-smoke.cjs jump`

过:网页自己离开 22,左边 `bw/issue-1`,中间是那条 Claude(`6340093e` / 私人会话)。桌面仍应在同一棵树。

再验 `create`(default draft 或 `--submit`)同一分叉:网页应出现新 tab 或至少切到那棵树。

不要回归:网页自己点 Resume 仍先改本页再 background RPC;不要变成「网页点一下桌面也被强行抢走焦点」。trusted-local / named-pipe 的 `focused` 可以推配对端;`presentation: background` 的网页自发调用不要反向推桌面(保持现状)。

## 不要做

- 不改 `D:\2026\code\workbench`(buddy)。那边并行改会话屏。
- 不把 pairing token / `orca-runtime.json` 的 authToken 写进任何仓。
- 不修 buddy 的 worktree 路径、不搬旧树。
- 不把 Tasks 页改成跳 Claude 会话。
- 不 invent 一套 buddy 专用 RPC。用现有 `ensure` / `create` + 状态同步。

## 建议落点(你核对,不对就改那一份)

host 在 `ensureAgentSession` / `createAgentSession` 真正切了 worktree/tab 之后,给已配对 runtime 客户端一条「把 `activeWorktreeId` + 该 tab 设为当前」的推送;网页收到后走和人手选树同一条 `setActiveWorktree`。不要让网页再自己猜。

证据正本(只读):`D:\2026\code\workbench\docs\orca-session-puncture.md`。
