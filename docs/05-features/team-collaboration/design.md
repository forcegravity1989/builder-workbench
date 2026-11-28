# 团队多人协作实现设计

> 给实现与技术评审者读取。本文记录 G1 的实现落点、复用边界和持久化契约；用户结果见 [intent](intent.md)，交互与验收见 [spec](spec.md)，当前证据边界见 [STATUS](STATUS.md)。不记录施工流水；实现边界变化时更新。

## 入口与数据流

项目墙页头的团队设置图标复用现有项目墙工具栏。一台主机只绑定一个团队：本机没有绑定时，团队设置弹窗只要求按群名称选择 WeLink 群（#790），群 ID 与群空间 ID 由主进程经 OneBox 在已登录 W3 分区内自动获取，绑定后每次直接打开团队目录。读取时 `welink-cli im query-group-member --group-id` 返回成员账号、群主和当前身份，再用 `welink-cli contact detail` 批量补成员中文名和头像（读不到时界面退回账号与首字母占位）。群名称到两个 ID 的映射由 OneBox 内网接口完成：`teamSpaceList` 分页拉取群空间列表（无服务端名称过滤，本地匹配），选定后 `openGetTeamInfo` 解析群号；入口页是无 HTTP 跳转的 SPA 壳，SSO 与 `WAPCSRFTOKEN` 种植由页面 JS 完成，会话预热须在 W3 分区内的隐藏窗口进行。本机保存这一组绑定（`bw:team-group-id`、`bw:team-space-id`），之后从绑定和群空间文件读回。OneBox 读写在群空间的 `BW/team.json` 中完成。

团队目录是薄目录。它保存群绑定、成员/主机身份和仓库身份；不保存完全访问授权状态、日志、项目负责人或人工维护的来源名单；主机地址保存为 Orca 只读配对链接（含只读设备令牌，已确认的取舍，成员无需二次输入授权码）。登记项目时，`TeamSettingsDialog` 通过现有项目墙仓库身份写入团队项目，并把本机项目的 `projectVisibility` 设为 `team`。其他成员在自己的项目墙执行同一动作；项目墙按 `repoId` 读回各主机来源并聚合成一张现有项目卡。个人项目没有登记就继续留在个人范围。

```text
项目墙团队设置
  ├─ W3 分区 → OneBox 群列表/群 ID 解析（隐藏窗口预热 SSO）
  ├─ welink-cli 群成员/群主 ──┐
  ├─ OneBox BW/team.json       ├─ 团队目录读取/保存
  └─ 本机项目墙 repo identity ─┘

项目墙项目卡 ← 各主机项目墙来源按 repoId 聚合
左下角管理远程主机 → Orca 原生连接状态 → 团队项目来源
```

## Orca 复用与身份显示

- 远程主机入口复用 `SshStatusSegment` 的 `MonitorSmartphone` 图标、popover、连接/断开动作和「管理远程主机」设置入口。团队目录只提供地址和人类可读的成员信息，不另造连接协议。
- 连接和配对复用 `RuntimePairingUrlGenerator`、`RuntimeAccessGrantList`、`DeviceRegistry`、WebSocket RPC 和原生设备凭据。团队地址生成使用 `scope: runtime`、`accessMode: team-read` 和 `teamBinding`；已有 Orca 地址直接填入目录，缺少地址时从同一入口生成并填入。任何入口生成的链接如果没有显式命名，都由主进程用当前 WeLink 身份（已记住的团队成员，否则 `welink-cli` 现查姓名与头像）命名，只有 welink-cli 不可用时才退回「Runtime 日期」。共享列表固定分「成员 / 链接」两个页签，一侧为空时显示空态，不改变视图形状；每条链接行可复制完整地址（地址在生成时记录，旧链接需重新生成）。
- 共享访问列表按成员逐行展示（含完全访问与当前未连接的成员）。成员行内使用「只读 | 完全访问」ToggleGroup；成员姓名和头像来自 WeLink 目录，是主要识别。稳定 `deviceId` 仍作为权限和撤销键，放在辅助信息或诊断字段，不以姓名做权限键。
- 设备登记必须保留原始 `teamBinding`（或不可变的同等来源字段）。升级为 `full` 只改变有效访问级别，不能丢掉成员身份，否则重启后无法显示“哪位成员连接了本机”或审计授权对象。非团队 Orca 设备继续使用原生设备名。

## 权限边界

`team-read` 使用「默认放行 + 明确拒绝清单」。只在发送输入、读项目之外文件、写回外部系统、改项目文件和工作树四类动作的核心入口拒绝。判定原则、界面动作分类、日志规则、新增方法的登记步骤和已知差距统一维护在[团队共享访问策略](../../06-module/团队共享访问策略.md)，本文不重复。清单与测试同在 `runtime-rpc-team-read-policy.ts` 和对应测试。

成员身份由客户端在加密握手里自报（成员 ID、姓名、头像），宿主在同一条团队链接下为每位成员建一条设备记录（`parentDeviceId` 指向链接，每条链接最多 200 条）。授权级别只读宿主记录，客户端不能自报权限；但身份不防冒充，持链接的人冒用已被授予完全访问成员的 ID 会得到该成员的访问级别，这是团队内信任的已接受取舍。

整机完全访问沿原生设备登记。主机持有人在共享访问列表的成员行切换级别，经 `mobile:setRuntimeAccessMode` 逐设备写入 `full` 或 `team-read`（切到 `full` 要求该设备已连接）；其他成员、未连接设备和其他项目都不受影响。宿主在每个请求和每个终端流帧上重新读取设备登记，切换对已打开的终端立即生效。项目和工作树不再细分权限，团队项目统一只读。

## 宿主访问日志

日志继续由宿主 `RuntimeAccessAudit` 写入 `userData/logs/orca-shared-host/`，默认保留 14 天并自动清理，界面在同一 Orca 共享设置页提供动作、结果、时间和成员/设备筛选，以及清理按钮。

记录的是元数据：时间、成员、访问级别、动作分类、结果、错误码、耗时和请求 ID。记什么、不记什么和动作名用语见[团队共享访问策略](../../06-module/团队共享访问策略.md#日志规范)；请求参数、文件内容、模型输入、shell 正文、终端流和凭据永不进入日志。

## 关键代码落点

| 能力 | 现有落点 | G1 适配 |
| --- | --- | --- |
| 群发现 | `src/main/workbench/team-collaboration/onebox-group-space-client.ts`、`src/renderer/src/workbench/TeamGroupSpaceCombobox.tsx`、`use-team-group-picker.ts` | W3 分区隐藏窗口预热 SSO、分页列表本地匹配、选定后按需解析群 ID |
| 团队目录 | `src/main/workbench/team-collaboration/team-directory-client.ts`、`src/main/ipc/team-collaboration.ts`、`src/renderer/src/workbench/TeamSettingsDialog.tsx` | 群成员/群主读回、`BW/team.json` 读写、登记即标为团队项目、地址一键填入 |
| 项目聚合 | `ProjectWallPage`、项目来源与仓库身份读取 | 以 `repoId` 聚合团队来源，保留现有卡片和未连接状态 |
| Orca 连接 | `SshStatusSegment`、`RuntimePairingUrlGenerator`、`DeviceRegistry` | 默认 `team-read`，共享访问列表按成员显示，保留来源身份 |
| 只读路由 | `runtime-rpc-team-read-policy.ts`、WebSocket dispatch | 默认放行，只拒绝四类动作的核心入口 |
| 日志 | `runtime-access-audit.ts`、`RuntimeAccessAuditLog.tsx` | 14 天轮转、筛选/清理、抑制成功常规读取 |

原型 [prototype.html](prototype.html) 只表达上述入口、状态和旅程；不另造生产组件或协议。生产实现必须回查原生组件与本设计，不能把原型中的示例头像、地址或目录数据当作真实事实。
