# docs/v3-prototype/ · V3 设计导读

> **30 秒导读**:V3 的设计与使用修复入口。**V3 已冻结:当前节奏是一心 V4(见 [`../README.md`](../README.md)「现在的节奏」),V3 不再投入、连 bug 也不修,与 V4 并存等删**(删除判据见 [`../v4-prototype/design.md`](../v4-prototype/design.md) §12.6)。出包与版本号见 [`../releases.md`](../releases.md)。2026-08-20 做过一次归档整理:已落地的 `onboard-list-and-claude-resolve.md`(V3-use-fix)搬去了归档;两篇未落地的设计(V3-cursor-cli / V3-cowelink-sidecar)留在本目录存档——**不排期、不进遗留清单,随 V3 一起等删**。

看不懂的词查 [`../../CONTEXT.md`](../../CONTEXT.md);代号查 [`../code-schemes.md`](../code-schemes.md)。

## 现在作数(留在本目录)

| 文件 | 是什么 | 状态 |
|---|---|---|
| 本 README | V3 范围入口 | 作数 |
| [cursor-agent-executor.md](cursor-agent-executor.md) | **V3-cursor-cli**:Issue 调度接 Cursor Agent CLI;配置面 + 最小代价接法 | 设计已记,未落地;**不排期,随 V3 等删**(V4 里 Cursor 是开工工具之一,见 design.md 第 7 章) |
| [cowelink-web-sidecar.md](cowelink-web-sidecar.md) | **V3-cowelink-sidecar**:cowelink 长出本机网页旁路,buddy iframe 内嵌(不弹窗) | 设计已记,未落地;**不排期,随 V3 等删** |

穿刺事实源(Open Design,已落地到原型进度,已归档):[`../archive/v2-prototype/open-design-embed-spike.md`](../archive/v2-prototype/open-design-embed-spike.md)

本轮已见行为:项目里点阶段轴「原型」、停在「进度」→ 中间是本机 Open Design 首页。总览和其它阶段进度不动。Open Design 没开着就显示空态。完成清单收到底栏。

未落地两篇不在 [`../LEFTOVERS.md`](../LEFTOVERS.md) 里——那份清单只记 V4 的 MVP 欠账,V3 的一律不记。

## 已归档(2026-08-20,纯历史 · 本轮已落地)

- `onboard-list-and-claude-resolve.md`(V3-use-fix)—— 创建流列仓 + Claude 探测。安装器/探测认 `claude.cmd`、创建流拉 999/可搜索下拉、程序图标等已本轮落地,搬去了 [`../archive/v3-prototype/onboard-list-and-claude-resolve.md`](../archive/v3-prototype/onboard-list-and-claude-resolve.md)。设计事实源今后按该归档路径找;版本改动记录见 [`../releases.md`](../releases.md)。

## 未落地两篇怎么读

- 想知道「Issue 用 Cursor 还是 Claude、今天在哪配」→ [cursor-agent-executor.md](cursor-agent-executor.md) §1–§2。今天没地方配;落地时是设置里的本机默认 + 智能体卡「执行引擎」。
- 想知道「WeLink 为什么不弹窗、怎么嵌」→ [cowelink-web-sidecar.md](cowelink-web-sidecar.md)。第一张穿刺打在 cowelink 仓,buddy 等有 URL 再嵌。
- orca 整窗内嵌:**不做**。多会话已在 Issue 终端里。
