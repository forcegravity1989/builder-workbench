# STATUS — 产物分享（Artifact Sharing）

> **维护约定**：记录本特性六环链现状与证据边界。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；行为读 [spec](spec.md)，价值读 [intent](intent.md)，可点原型见 [prototype/index.html](prototype/index.html)，服务端部署与运维见 [`services/bw-share/`](../../../services/bw-share/README.md)。更新触发：任一环状态、认可或证据边界变化时，随引发它的 PR 同批更新，不记流水。

**现状（2026-11-19，[PR #691](https://github.com/forcegravity1989/builder-workbench/pull/691) 检视返工已落地）**：客户端三条入口已在 PR #691 落地——浏览器标签工具栏与编辑器页头的「Share as artifact」弹层（复用既有按钮、Popover 与链接面板形态）、设置 → Artifacts 的「Files you've shared」清理列表、CLI `orca artifacts list/share/update/unshare/delete`；Orca 云端 artifacts 整条链路与设置页账号 / 发布开关已移除。分享服务地址与设备登记密钥编译内置，首次分享自动登记设备换令牌，用户零配置。**检视返工项已由主会话修复并带测试与真实服务复现证据（明细以 PR 记录为准）**：并发分享孤儿链接 → publish / remove 按来源键串行化；403（编辑令牌被拒）无出口 → 新增 `stale-record` 语义（分享自动丢弃本机记录并新建链接，用户看到正常分享成功；删除则移除本机记录并如实告知原链接可能仍存在、需运维在服务端删除）；本机记录损坏后静默空列表 → 主机隔离损坏文件并返回具体原因，设置页如实显示 + Try again，弹层按无记录处理可重新分享；远程来源文件标签破碎 → 识别 `["ssh",…]` / `["editor",…]` 元组键生成可读标签；CLI 与页面来源键不一致 → 作为显式取舍写入 spec（远程文件两条入口各自成链；CLI 单命令 800 KB 上限，人已决定不放宽）。本机记录与设备令牌文件改用仓内既有安全写入（临时文件 + ACL 收紧 + fsync + rename）。intent / spec 由本 PR 更新，按仓规**人工认可待人确认**（spec 头部已写明「整篇人工认可：待人确认」，尚无确认记录）；可点原型与本篇为本轮补齐的制品，原型已对齐返工后行为。本特性**未建立领先 / 滞后指标口径**（未知不造数；要挂指标须按指标协议写清口径并经人确认）。横切站 B 独立检视即本轮返工的来源，修正后的复检以 PR 记录为准；合入、Issue 关闭与人验收（收口站）待人决定。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md) 已存在并由 PR #691 按自管服务方案更新；无人工认可记录，待人确认 |
| 2 spec | ◐ | [spec.md](spec.md) 含承载与复用、配置与数据归属、分享流程、A01–A12 验收点与旅程定义，由 PR #691 更新；可点原型本轮补齐（[prototype](prototype/index.html)，演示假体，不构成运行证据）；无人工认可记录，待人确认；指标口径未建立 |
| 3 实现设计 | ◐ | 落地在 PR #691（head `e7d4353ed7a4` 及其后的检视返工修订）：渲染层 `src/renderer/src/components/artifacts/`（ArtifactPublishButton、ArtifactPublishedLinkPanel、artifact-publish-flow、share-server-client、markdown-share-html）与 `settings/ArtifactsSettingsPane.tsx`、`ArtifactsSharedLinksSection.tsx`；主机层 `src/main/artifacts/self-hosted-share-*`（config / records / client / service / runtime）经 RPC `workbench.share.publish/getLink/remove/list` 暴露，publish / remove 按来源键串行化；CLI `src/cli/handlers/artifacts.ts` 走同一主机链路（单命令 800 KB 上限，与页面 10 MiB 的差异为 spec 写明的显式取舍）；服务端 `services/bw-share/`。复用原生 Popover / Button / Tooltip / 确认对话框与既有链接面板，未造平行入口；承载与复用关系见 [spec](spec.md)。架构正本现状：[architecture](../../architecture.md) 与 [06-module](../../06-module/README.md) 都没有 RPC 方法族清单，也没有 artifacts / 分享的既有描述（已检索核实），所以本轮没有过期内容要清理；是否把自建分享的数据流写进 architecture §3 属新增取舍，待人决定 |
| 4 TDD | ◐ | 单测 / 协议测试随实现入库并随返工更新：`artifact-publish-flow.test.ts`、`ArtifactPublishButton.test.tsx`、`artifact-published-link-client.test.ts`、`ArtifactsSettingsPane.test.tsx`、`self-hosted-share-{client,config,records,service}.test.ts`、`src/cli/handlers/artifacts.test.ts`、`browser-artifact-upload.test.ts`、`markdown-artifact-upload.test.ts`。返工行为带测试与真实服务复现证据（以 PR 记录为准）；本轮门禁执行结果以 PR 当前提交记录为准，不推定通过 |
| 5 验收点 E2E | ○ | `tests/e2e/` 无任何 share / artifact-sharing 注册用例（已 grep 核实）。协议层与开发机 CLI+curl 证据见下方矩阵，但不构成注册 E2E。补齐条件：按 spec A01–A12 注册用例，覆盖弹层、设置页与主机端拒绝路径（返工已落地，可专项回补） |
| 6 用户旅程 E2E | ○ | spec「旅程」定义的端到端走查（真实分享 → 另一台机器 / 非 BW 浏览器打开 → 修改后更新同一链接 → 重启读回不重登记 → 移除后记录消失、再分享重建）未整体走通。补齐条件：可连通已部署 `services/bw-share` 的真实内网环境与第二台机器 |

## 验收点与旅程矩阵

口径：● = 检视机独立复现（本地起真实 `services/bw-share` 进程 + PR 未修改的真实客户端模块跑通，协议层）；◐ = 仅开发机 CLI + curl 对已部署服务验证（PR #691 主验证评论；检视机因网络不通不可独立复核）；○ = 未验。本轮返工落地的行为（stale-record 出口、并发串行化、安全写入、设置页失败重试与主机原因、远程来源标签）以主会话的测试与真实服务复现记录为据（PR 记录为准，检视机未独立复跑），行内注明「返工证据」。协议层证据不升级为界面级或真壳结论。

| 验收点 | 状态 | 证据 / 缺口 |
|---|---|---|
| A01 首次分享自动登记并取得链接 | ● | 协议层复现：自动登记成功，链接字节一致 |
| A02 再次分享复用令牌不重复登记 | ● | 协议层复现 |
| A03 令牌被拒后自动重登记并重试一次 | ● | 协议层复现：重登记一次后重试成功。服务端拒绝本机编辑令牌的出口已随返工落地为 `stale-record` 语义（分享自动新建链接、删除移除记录并如实告知；返工证据，界面级待真壳复验） |
| A04 分享 HTML，公开浏览器可打开 | ◐ | 开发机 CLI + curl 往返验证；真实内网他人机器 / 非 BW 浏览器打开未验 |
| A05 分享 Markdown 为渲染后的独立 HTML | ◐ | 开发机 CLI + curl 往返验证；链接内容在真实浏览器的可读性未验 |
| A06 同一文件重复分享覆盖同一链接 | ● | 协议层复现同 id 覆盖；开发机 CLI 往返一致。并发分享已串行化，两次并发 publish 只产生一条链接、第二次为 updated（返工证据） |
| A07 服务端删除后自动重建新链接 | ● | 协议层复现新 id 重建 |
| A08 超 10 MiB 与服务不可达如实报错 | ● | 协议层复现：超限在本地拒绝且零网络调用。界面 toast（含实际大小与上限文案）无真壳截图证据 |
| A09 重启后读回链接且令牌有效 | ◐ | 仅协议层证据：新服务实例 + 同一数据目录 → `getLink` 读回同一 url 且零网络请求。**真壳杀进程重开后弹层回显链接且未重新登记（四铁律场景）未验** |
| A10 删除链接 | ● | 协议层复现删除后链接 404；开发机 curl 读回一致。网络等失败保留链接；仅 `stale-record`（服务端拒绝本机编辑令牌）时移除记录并告知原链接可能仍存在，已随返工落地（返工证据） |
| A11 Web / 远程客户端拒绝并提示 | ○ | 主机端拒绝、设置页「在主机端打开」提示与弹层 web 客户端提示均已实现（`ArtifactsSettingsPane` / `ArtifactPublishButton` 按 `isWebClientLocation` 分支）；无真壳界面证据、无注册 E2E |
| A12 设置页清理已分享文件 | ◐ | `orca artifacts unshare/delete` + curl 对已部署服务验证等价往返。记录损坏后如实报失败（主机原因 + Try again，不再静默空列表）、远程来源元组标签、CLI 与页面来源键的显式取舍均已随返工落地（返工证据）；设置页清理列表界面（含删除二次确认、stale-record 删除出口）仍无真壳截图证据 |
| 旅程 端到端走查 | ○ | spec「旅程」未整体走通；真实内网、跨机打开、重启读回、删除后重建各段均待验 |

## 度量

未建立。本特性当前没有已确认的领先 / 滞后指标口径；按「未知不造数」不预填候选，指标定义与采集如要挂载，按 [02 §6.2](../../01-principles/02-working-backwards.md) 环 2 的指标协议经人确认后落地。

## 原型边界

[prototype/index.html](prototype/index.html) 为单文件、离线可开的演示假体：界面结构与文案逐字对齐检视返工后的现行实现（英文文案取 i18n 真实值，设置页读取失败的主机原因文案取 `self-hosted-share-service.ts` 真实字面量），覆盖弹层七态（未分享、已有链接、超限、不可达、stale-record、记录查询失败、Web 客户端提示）与设置页五态（列表含远程来源行与 stale-record 删除出口、空态、主机原因失败 + Try again、通用失败对照、Web 提示），但不发真实请求、数据与链接地址均为示意，不构成任何验收点的运行证据；真壳观感与行为以 PR 截图和实机验证为准。CLI 表面无界面，不在原型内表达，其操作契约见 [spec](spec.md)「承载与复用」与 `src/cli/specs/artifacts.ts`。
