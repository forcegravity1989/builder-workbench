# STATUS — 产物分享（Artifact Sharing）

> **维护约定**：记录本特性六环链现状与证据边界。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 格式」；行为读 [spec](spec.md)，价值读 [intent](intent.md)，可点原型见 [prototype/index.html](prototype/index.html)，服务端部署与运维见 [`services/bw-share/`](../../../services/bw-share/README.md)。更新触发：任一环状态、认可或证据边界变化时，随引发它的 PR 同批更新；只记当前边界，不记返工流水与遗留台账（那些进 PR 与原生 Issue）。

**现状（2026-11-24，PR #682 服务端 / PR #691 客户端已合入 main（2026-11-20）；分享页批注随本 PR 交付）**：三条入口已落地——浏览器标签工具栏与编辑器页头的「Share as artifact」弹层（复用既有按钮、Popover 与链接面板形态）、设置 → Artifacts 的「Files you've shared」清理列表、CLI `orca artifacts list/share/update/unshare/delete`。Orca 云端 artifacts 整条链路与设置页账号/发布开关已移除（该上游边界已由人确认，记录见 [ref/upstream](../../../ref/upstream.md)）。分享服务地址与设备登记密钥编译内置，首次分享自动登记设备换令牌，用户零配置；设备令牌与本机链接记录走仓内既有安全写入（临时文件 + ACL 收紧 + fsync + rename）。**分享页批注（元素级，阶段 2）已实现**：`/s/:id` 改为查看页（沙箱 iframe + 批注面板），`/s/:id/raw` 保持逐字节一致；本地 `node --test` 83 例（基线 58 + 批注新增 25）+ CDP 真浏览器探针（双独立浏览器 profile + 同浏览器双标签，42 项断言）覆盖 A13–A18、取消选择恢复内容交互、多标签删除令牌持久化复验通过，真实内网他人机器未验。**intent / spec / 原型的人工认可待确认**（spec 头部已写明）；本特性的领先/滞后指标口径**未建立**（未知不造数）。

| 环 | 状态 | 证据或缺口 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md) 已按自管服务方案更新；无人工认可记录，待人确认 |
| 2 spec | ◐ | [spec.md](spec.md) 含承载与复用、配置与数据归属、分享流程、A01–A12 与旅程定义；可点原型本轮补齐（[prototype](prototype/index.html)，演示假体，不构成运行证据）；无人工认可记录，待人确认 |
| 3 实现设计 | ● | 渲染层 `src/renderer/src/components/artifacts/` 与 `settings/ArtifactsSharedLinksSection.tsx`；主机层 `src/main/artifacts/self-hosted-share-*` 经 `workbench.share.{publish,getLink,remove,list}` 暴露（仅主机端），复用原生 Popover/Button/Tooltip/确认对话框、`secure-file-async` 安全写入、`cancelUnreadResponseBody`、既有 CLI 传输上限常量，未造平行入口；CLI `src/cli/handlers/artifacts.ts` 走同一主机链路；服务端 `services/bw-share/`，批注链路为 viewer 页（`viewer.html`）+ 沙箱内桥脚本（`bridge.js`，postMessage 协议）+ 批注存储（`annotations-store.mjs`，删除令牌只存哈希、随链接删除连带清理）。稳定设计已回写 [architecture](../../architecture.md)「Orca 执行核与 BW 叠层」的 RPC 方法族段落 |
| 4 TDD | ◐ | 协议与数据层用例随实现入库（`self-hosted-share-{client,config,records,service}.test.ts`、`workbench-share.test.ts`、`artifact-publish-flow.test.ts`、`ArtifactPublishButton.test.tsx`、`ArtifactsSettingsPane.test.tsx`、`cli/handlers/artifacts.test.ts`、服务端 `node --test` 83 例，批注新增 25 例（存储 11 + HTTP 集成 14，超过默认 5 例上限，理由与人确认见 PR））；这些是 `services/bw-share` 的 `node --test` 契约测试，由 CI 专用步骤「Test share service」执行（#682 起），不在 src Vitest 例数棘轮四目录与精选套件内，但 CI 每个 PR 都跑 |
| 5 验收点 E2E | ○ | `tests/e2e/` 无 share / artifact-sharing 注册用例。补齐条件：按 A01–A18 注册用例，覆盖弹层、设置页、主机端拒绝路径与分享页批注 |
| 6 用户旅程 E2E | ◐ | BW 壳内旅程未整体走通；分享页批注段已本地走通（真实服务进程 + CDP 真浏览器探针、双独立浏览器 profile + 同浏览器双标签：互见、高亮、stale 降级、删除、取消恢复交互、多标签令牌持久化）。补齐条件：可连通已部署 `services/bw-share` 的内网 + 第二台机器/非 BW 浏览器 |

## 验收点与旅程矩阵

口径：**● = 协议层已复现**（本地起真实 `services/bw-share` 进程 + PR 的真实客户端模块，或开发机 CLI + curl 对已部署服务往返；批注链路含本地真浏览器 DOM 断言，CDP 探针驱动）；**◐ = 仅静态/单测证据**；**○ = 未验**。
全局边界：**BW 壳内界面没有任何验收点具备真壳界面级证据**——弹层与设置页的实际呈现、A09 的杀进程重开读回（四铁律场景）都待开发机补真壳截图与实机验收。分享页批注（A13–A18）有本地真浏览器证据但全部为本机 headless 环境，真实内网他人机器与非 BW 浏览器打开未验。下表的 ● 只说明数据与协议行为成立，不代表该验收点已可勾掉。

| 验收点 | 状态 | 证据 / 缺口 |
|---|---|---|
| A01 首次分享自动登记并取得链接 | ● | 自动登记一次、链接字节一致；「用户无须填写地址或令牌」由设置页无该输入项静态成立 |
| A02 再次分享复用令牌不重复登记 | ● | 新服务实例 + 同一数据目录，登记接口零调用 |
| A03 令牌被拒后自动重登记并重试一次 | ● | 对不认识该令牌的实例：登记 1 次 + 创建 2 次（401 后重试） |
| A04 分享 HTML，公开浏览器可打开 | ● | curl 读回与上传内容一致；**真实浏览器/他人机器未验** |
| A05 分享 Markdown 为渲染后的独立 HTML | ● | 开发机 CLI + curl 读回为带标题与样式的独立文档；浏览器可读性未验 |
| A06 同一文件重复分享覆盖同一链接 | ● | 同 id 覆盖；并发分享已按来源键串行化，两次并发 publish 只产生一条链接 |
| A07 服务端删除后自动重建新链接 | ● | 新 id 重建，旧链接 404 |
| A08 超 10 MiB 与服务不可达如实报错 | ◐ | 超限在本地拒绝且零网络调用（协议层）；**界面 toast 的实际大小与上限文案无真壳证据** |
| A09 重启后读回链接且令牌有效 | ◐ | 仅协议层：新实例 + 同一数据目录 → 读回同一 url 且零网络请求；**真壳杀进程重开后弹层回显、未重新登记（四铁律场景）未验** |
| A10 删除链接 | ◐ | 协议层：删除后链接 404、记录移除；`stale-record` 出口有单测与协议层复现；**二次确认的界面行为无真壳证据** |
| A11 Web / 远程客户端拒绝并提示 | ◐ | 主机端拒绝有 RPC 单测；设置页与弹层的「在主机端打开」分支已实现；**界面无真壳证据、无注册 E2E** |
| A12 设置页清理已分享文件 | ◐ | 开发机以 `unshare`/`delete` + curl 等价验证；记录不可读时如实报错而非空列表、远程来源标签、10000 条上限均有单测；**清理列表界面（含二次确认）无真壳证据** |
| A13 打开分享链接 | ● | 本地真实服务 + 真浏览器探针：viewer 页沙箱 iframe 展示原始内容、`/s/:id/raw` 与上传内容逐字节一致（单测 + 探针双证）；**真实内网他人机器未验** |
| A14 任意查看者添加元素级批注 | ● | 真浏览器探针：无需账号，选择模式点击 iframe 内元素 → 提交 → 列表出现且点击高亮 iframe 内元素；无文本元素（图标按钮/图片/svg）摘要回退标签名、可空仍照常提交（存储 + HTTP 回归用例）；桥被内容 CSP 禁用时降级为页面级批注（无注册用例）；取消选择/关闭表单后内容恢复正常点击交互（不吞第一次正常点击），迟到选择不带入重开表单（探针验） |
| A15 批注对所有查看者可见 | ● | 真浏览器探针：第二独立浏览器 profile 看到已有批注并提交页面级批注，第一查看者刷新后看到 2 条；30 秒定时轮询已验（第一查看者不刷新，轮询周期内看到对方新批注）；**页面切后台暂停轮询未验** |
| A16 内容覆盖后批注保留 | ● | 真浏览器探针：PUT 覆盖内容后批注保留；刷新/加载即主动探测 selector，失效批注立即标注「元素已变化」且不再高亮（不必点击），文字保留（覆盖更新不触碰批注文件） |
| A17 批注删除 | ● | 真浏览器探针：作者凭本机令牌删除后列表立即消失，他人批注无删除按钮；无令牌/错令牌 403、分享者凭编辑令牌删任意批注均有集成测试；同浏览器多标签按批注独立持久化令牌、互不覆盖，刷新后作者仍可删，跨标签 storage 同步删除能力（探针验） |
| A18 批注写入治理 | ● | 集成测试：超 2000 字 `text_too_long`、500 条写满 `annotations_full`、IP 限流 429；viewer 文案映射已验 |
| 旅程 端到端走查 | ○ | 批注段已本地双浏览器上下文走通（见环 6）；真实内网、跨机打开、重启读回、删除后重建各段仍未整体走通 |

## 度量

未建立。本特性当前没有已确认的领先/滞后指标口径；按「未知不造数」不预填候选。要挂指标须按 [02 §6.2](../../01-principles/02-working-backwards.md) 环 2 的指标协议写清口径并经人确认。

## 原型边界

[prototype/index.html](prototype/index.html) 为单文件、离线可开的演示假体：界面结构与文案逐字对齐现行实现（文案取 i18n 真实值，含设置页读取失败的 `recordsUnreadableDescription`；主机端中文原因只进 console 与诊断，不上屏），覆盖分享弹层与设置页的各状态，但不发真实请求、数据与链接地址均为示意，**不构成任何验收点的运行证据**；真壳观感与行为以实机验证为准。CLI 表面无界面，不在原型内表达，其操作契约见 [spec](spec.md)「承载与复用」与 `src/cli/specs/artifacts.ts`。适用版本：与 PR #691 当前 head 对齐（提交号见 PR，原型不单独记 SHA）。
