# 团队多人协作实现设计

> 给实现与技术评审者读取。本文记录 G1 的实现落点、复用边界和持久化契约；用户结果见 [intent](intent.md)，交互与验收见 [spec](spec.md)，当前证据边界见 [STATUS](STATUS.md)。不记录施工流水；实现边界变化时更新。

## 入口与数据流

项目墙页头的团队设置图标复用现有项目墙工具栏。首次打开团队设置时先输入 WeLink 群 ID：`welink-cli im query-group-member --group-id` 返回成员、群主和当前身份；如果本机没有该群的空间绑定或找不到 `BW/team.json`，再在弹窗内补填群空间 ID。群号不能反查群空间 ID，因此空间 ID 只在首次定位或换群时需要；本机保存最近绑定，后续从绑定或群空间文件读回。OneBox 读写在群空间的 `BW/team.json` 中完成。

团队目录是薄目录。它保存群绑定、成员/主机身份和仓库身份；不保存共享令牌、设备凭据、日志、项目负责人或人工维护的来源名单。登记项目时，`TeamSettingsDialog` 通过现有项目墙仓库身份写入团队项目，并把本机项目的 `projectVisibility` 设为 `team`。其他成员在自己的项目墙执行同一动作；项目墙按 `repoId` 读回各主机来源并聚合成一张现有项目卡。个人项目没有登记就继续留在个人范围。

```text
项目墙团队设置
  ├─ welink-cli 群成员/群主 ──┐
  ├─ OneBox BW/team.json       ├─ 团队目录读取/保存
  └─ 本机项目墙 repo identity ─┘

项目墙项目卡 ← 各主机项目墙来源按 repoId 聚合
左下角管理远程主机 → Orca 原生连接状态 → 团队项目来源
```

## Orca 复用与身份显示

- 远程主机入口复用 `SshStatusSegment` 的 `MonitorSmartphone` 图标、popover、连接/断开动作和「管理远程主机」设置入口。团队目录只提供地址和人类可读的成员信息，不另造连接协议。
- 连接和配对复用 `RuntimePairingUrlGenerator`、`RuntimeAccessGrantList`、`DeviceRegistry`、WebSocket RPC 和原生设备凭据。团队地址生成使用 `scope: runtime`、`accessMode: team-read` 和 `teamBinding`；已有 Orca 地址直接填入目录，缺少地址时从同一入口生成并填入。
- 共享访问列表的授权操作区只展示已建立连接的 `team-read` 设备。行首使用无文字 Checkbox，Tooltip/aria-label 说明“选择该设备授予完全访问”；成员姓名和头像来自 WeLink 目录，是主要识别。稳定 `deviceId` 仍作为权限和撤销键，放在辅助信息或诊断字段，不以姓名做权限键。
- 设备登记必须保留原始 `teamBinding`（或不可变的同等来源字段）。升级为 `full` 只改变有效访问级别，不能丢掉成员身份，否则重启后无法显示“哪位成员连接了本机”或审计授权对象。非团队 Orca 设备继续使用原生设备名。

## 权限边界

`team-read` 使用默认拒绝、显式纯读 allowlist。现有读取 RPC 继续复用项目墙、工作树、文件、Git、会话、终端输出和评审收件箱；创建工作树、创建/发送会话、终端输入、浏览器/计算机控制、文件写入、Git 写入和其他状态变更保持拒绝。新 RPC 默认不可用，避免黑名单随功能增长而意外放权。

allowlist 必须覆盖实际项目墙和评审读取链（包括 `project.list`、`projectHostSetup.list`、工作树解析、文件路径搜索、评审评论/检查和 CodeHub/GitHub 的只读详情）。每次补充只读方法都要按调用链核对它不会创建、修改、执行或泄露宿主控制能力；不能用一个宽泛的“查询前缀”代替逐方法登记。

整机完全访问沿原生设备登记。主机持有人在共享访问列表的授权操作区多选已连接的只读设备，确认后逐设备写入 `full`；未选设备、未连接设备和其他项目都不受影响。项目和工作树不再细分权限，团队项目统一只读。

## 宿主访问日志

日志继续由宿主 `RuntimeAccessAudit` 写入 `userData/logs/orca-shared-host/`，默认保留 14 天并自动清理，界面在同一 Orca 共享设置页提供动作、结果、时间和成员/设备筛选，以及清理按钮。

记录连接建立/断开、授权/撤销、拒绝、错误和高价值写动作的元数据：时间、设备/成员、访问级别、方法分类、结果、耗时和请求 ID。成功的常规读取（无论 `team-read` 还是 `full`，包括项目墙、侧栏、工作树列表、会话列表和终端订阅的后台读取）不逐条落盘，避免正常协作刷屏；成功的写入或显式授权仍记录。请求参数、文件内容、模型输入、shell 正文、终端流和凭据永不进入日志。界面用友好中文动作名展示，原始 RPC 名只作诊断辅助。

## 关键代码落点

| 能力 | 现有落点 | G1 适配 |
| --- | --- | --- |
| 团队目录 | `src/main/team-directory-client.ts`、`src/main/ipc/team-collaboration.ts`、`src/renderer/src/workbench/TeamSettingsDialog.tsx` | 群成员/群主读回、`BW/team.json` 读写、登记即标为团队项目、地址一键填入 |
| 项目聚合 | `ProjectWallPage`、项目来源与仓库身份读取 | 以 `repoId` 聚合团队来源，保留现有卡片和未连接状态 |
| Orca 连接 | `SshStatusSegment`、`RuntimePairingUrlGenerator`、`DeviceRegistry` | 默认 `team-read`，共享访问列表按成员显示，保留来源身份 |
| 只读路由 | `runtime-rpc-team-read-policy.ts`、WebSocket dispatch | 默认拒绝、补齐实际纯读调用链、写/执行继续拒绝 |
| 日志 | `runtime-access-audit.ts`、`RuntimeAccessAuditLog.tsx` | 14 天轮转、筛选/清理、抑制成功常规读取 |

原型 [prototype.html](prototype.html) 只表达上述入口、状态和旅程；不另造生产组件或协议。生产实现必须回查原生组件与本设计，不能把原型中的示例头像、地址或目录数据当作真实事实。
