# STATUS

> **30 秒导读**:桌面宠物(desktop-pet)的链状态正本。**in_review**——发起人 2026-09-10 于 #154 拍板选型,2026-09-24 按 clawd 1.1.0 协议重写制品并实现,spec + 原型 + 实现一并送评审(02 §6 小特性豁免)。格式按 [02 §6.2](../../01-principles/02-working-backwards.md)「STATUS 与矩阵」。

## 链状态(六环)

| 环 | 状态 | 证据 / 已知债 |
|---|---|---|
| 1 intent | ◐ | [intent.md](intent.md):#154 正文即发起人拍板 + 本次会话原话;**待意图 gate 正式认**(聊过 ≠ 过 gate) |
| 2 spec | ◐ | [spec.md](spec.md):拍板 7 条 / 操作逻辑 / 可点原型链接 / 验收 R1–R8;**待规格 gate**;指标不挂 |
| 3 实现设计 | ◐ | [ADR 0006](../../02-adr/0006-桌面宠物选型-clawd-on-desk.md) + spec 拍板 1 落点表;`06-module/桌面壳` 已补取舍一条;architecture §3 bw-engine 一句 |
| 4 TDD | ◐ | `bw-engine::clawd` 9 条(id 向量、运行时文件、prefs、状态行、裸 HTTP 桩、拒连不挂、Codex 包导出)、`bw::app::pet` 5 条(优先级、撤卡、代表活、不重发、报文);桥上 `kick_pet` 无单测(壳) |
| 5 验收点E2E | ○ | spec 定义 4 条用例与 suite 归属(`desktop-pet`);未注册、未实现 |
| 6 旅程E2E | ○ | spec 定义 `pet-journey`(真机,需 Clawd 已注册);未注册、未实现 |

## 记录

- 2026-09-10 · 发起人立 #154:选型 Clawd on Desk,三层薄适配;分支 `claude/bw-pet-setup-f3cf33` 7 个 commit 门禁全过但未 push;真壳验过探活、id 算法与 clawd 1.0.0 交叉一致、`/state` 连通;卡在人点 Register。截图留在 `shots/bw-pet-setup-f3cf33`。
- 2026-09-24 · 本会话第一稿误读为「Workbench 自建侧栏宠物」,已整体撤回(`docs/05-features/pet/` 删除);按 #154 重来:读 clawd 1.1.0 源码核对协议(runtime.json 含 `ownerPid`、端口 23333–23337、`/state` 四字段、prefs `customApplications`、Codex 包 `~/.codex/pets/` 同步),实现 `bw-engine::clawd` / `bw::app::pet` / 桥 `kick_pet` / Connector 行;单测与 clippy 过;**壳在云端未编译**(无 GTK),待 Windows CI 与本机真壳截图。
- 待人做:在 Clawd「设置 → Agents」注册 Workbench;真机走一遍旅程并回填截图四件套。
