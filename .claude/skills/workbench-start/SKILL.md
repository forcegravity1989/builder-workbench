---
name: workbench-start
description: >-
  Use when starting or continuing Builder Workbench development in an external
  IDE: fix bugs, adjust existing features, develop new features, or validate a
  delivery, including feature migration with renewed product decisions.
  Route knowledge governance to project-knowledge; choose planning
  depth from intent and impact, synchronize affected knowledge, and verify
  results. Any user may adopt this repository-local pilot.
  Also use for reviewing real Issue sessions to improve this development workflow.
  Load historical week-screen context only when tracing its earlier decisions.
metadata:
  version: 0.4.13-pilot
---

# workbench-start — Workbench 开发与交付

> **读者与时机**：在仓外 IDE 开始或继续 BW 开发的模型与开发者。先确认目标仓与依据，再按任务分流，连续实施、检视和交付。
>
> **职责与维护**：本篇只编排读取与动作；项目约束归 AGENTS，特性决定和六环归原则 02，测试/检视/PR 规则归[开发规范](../../../docs/development.md)。按起手 → 分流 → 实施 → 交付 → 反哺组织；读取路径或工作步骤变化时更新。仓内试用不等于向 standard 分发，正文不保存任务流水。

## 1. 适用范围与入口

- 本 Skill 服务 BW 自身研发，不自动启动全仓资产治理，也不重新制定版本计划。BW 内项目执行沿产品提示与被管项目 AGENTS，不自动叠加本入口；BW 自身规则由本仓 AGENTS 直接引导读取，不依赖此 Skill 被调用。
- 沿当前会话已有授权执行；本 Skill 不新增 push、发消息、远端写入、合入、关闭 Issue 或发布授权。用户已明确的范围不重复请求开工批准。
- 修改本 Skill 前完整读取 [Skill 写作约定](../../../standard/skills/SKILL-MD-SPEC.md)。职责、格式或存量治理转 [project-knowledge](../project-knowledge/SKILL.md)；普通开发只同步受影响知识。
- 本目录只定位方法及 references；业务目标以会话工作目录和 Git 为准。借另一 worktree 的 Skill 时记录方法与目标仓版本，业务操作显式指定目标仓，不把方法所在树当目标。

## 2. 起手：读依据，再给短判断

1. 核对目标仓根、分支/worktree、HEAD、未提交改动、远端 URL、PR base、任务与授权。按 AGENTS 先查可复用 Issue，无则创建；使用当前任务的隔离工作树，不移动或删除他人的常驻树。更新用户指定目标分支，不默认只拉 main。
2. 完整读取目标 AGENTS 与 [BW 开发规范](../../../docs/development.md)，再按任务读取原则、architecture、CONTEXT、特性和实现入口。修改文档先读原文头部与原则 01。当前技术路线用目标树源码和构建入口核对，Orca 来源/边界读 ref/upstream.md，旧 Rust 只作按需历史依据。
3. 合并读取 Issue、当次补充、已认可制品及受影响调用链。区分认可的目标、当前实现、已验证结果与历史证据；源码说明现在怎样，不能独自决定应当怎样。追溯周一屏早期决定时才读 [历史参考](references/week-screen-v04.md)。
4. 简述**本次范围与依据、是否需要原型对齐、怎样验证、真正缺哪个决定**。信息充分就继续，用户只需补任务独有信息；能独立调查的先查，不要求人重述仓规或选择常规工程实现。

涉及 standard 的既有读写协议时读取其入口，避免破坏契约；不因资料已存在就忽略冲突或重问已确认决定。

## 3. 分流：按意图与影响

开始特性设计或制作原型前，读取并执行 [原则 02 §3.2](../../../docs/01-principles/02-working-backwards.md#32-spec-结构用户怎样完成怎样验收) 的设计依据与确认要求；做/改原型时按 [设计系统 guidelines「HTML 原型与文档页」](../../../docs/04-design-system/guidelines.md#html-原型与文档页) 呈现（原型注释、业界参考、阶段切换、复用标注、控件与文案）。

| 这次工作 | 执行路径 | 需要用户的时机 |
|---|---|---|
| 小 bug，恢复明确行为 | 核对设计 → 未修改基线复现 → 最小修复 → 测试 agent 按同一路径复验 | 调查后仍缺用户独有配置、环境或行为决定；未复现不假定有 bug |
| 已有特性调整 | 核对定义与行为增量 → 实现、同步知识 → 验收 | 必要定义尚未认可，或新增产品取舍 |
| 特性迁移 | 对照旧意图与当前实现 → 重审受影响旅程/边界/验收 → 从缺环接上 | 用户承诺、交互或边界改变且尚未决定 |
| 历史兼容使改动范围明显扩大 | 先执行 [原则 02 §3.2 的兼容取舍要求](../../../docs/01-principles/02-working-backwards.md#32-spec-结构用户怎样完成怎样验收)，再实施依赖改动 | 兼容范围与代价尚未获得认可；已明确的承诺和授权沿用 |
| 大特性 / 大需求 | 原则 02 的意图、规格与原型对齐 → 最终 AskUser → 仓外 plan → 连续执行至 PR 就绪 | 最终对齐及执行中真正新增的决定或阻塞 |
| 文档 / 模型指令治理 | 转 project-knowledge，先确认落点、职责、格式、引用关系，再改正文和存量 | 职责或格式仍有真实未决选择；已有授权直接复用 |
| 依据冲突或不足 | 定向调查，给具体差异、推荐与影响 | 仍无法确定目标；只暂停依赖动作 |

按 [原则 02](../../../docs/01-principles/02-working-backwards.md) 的规格确认条件执行大需求最终对齐：**原型对齐后、生成仓外 plan 前**，以实际代码、已认可 intent/spec/原型为依据，AskUser 收敛未决逻辑、范围和验收；把尚需决定的内容及推荐说清，不让人选择接口或协议实现。没有答复不算认可；已认可决定不重复讨论，拆小 Issue 不能绕过母需求的确认。

对齐后生成仓外 plan，将约定的实现、资产清理与验证列入执行范围，连续完成落地、subagent 检视、修正、验证和 PR 交付。过程不设例行人工介入；遇真正新增的产品决定、用户独有条件或阻塞才找人，并继续独立部分。特性原型按原则留在所属特性目录，不随仓外 plan 搬走。

小特性沿用[原则 02 §6](../../../docs/01-principles/02-working-backwards.md#6-与制品链gate-的衔接少而硬)的合并送审豁免。已有特性的小需求沿用既有布局、交互且依据齐备时，直接实现后展示真壳结果；新的布局、信息结构或重要交互尚未决定时先对齐相关高保真。必要制品和缺定义按原则 02 §6.3，不机械补六份文件；用户要求先看原型时遵从。可用已有澄清或实现方法补助，不整套安装更多框架或另造目录。

## 4. 实施与知识同步

- 从原则 02 六环接上受影响环节，按实际代码和 Orca 调用链选复用方案；不以目录存在、旧平台认可或聊天方向冒充当前制品认可。
- 修改前定位契约、消费者及验证入口；按 AGENTS 的复用顺序实施，范围变化回到第 3 节处理。
- 知识写回既有正本：行为变更回特性，架构取舍回 architecture/模块，必要协议回 ref；按文档头部与索引判断落点。采用规范同时处理覆盖存量和引用，被替代方案同交付清理。普通开发不因此启动全仓审计。
- 调查失败根因，针对性复验；同因反复失败更新诊断，不无限重试或换判据。仅真正依赖权限、外部条件或未决范围的动作暂停，其余继续。

## 5. 验证与交付

执行已经完整读取的 [交付细则](../../../docs/development.md)：登记执行清单 → 运行适用验收与门禁 → 提供版本与判据给独立 subagent → 修正并复核发现 → 提交、push、开 PR 及更新主验证评论。检视维度、测试取舍、独立测试 agent 和验证证据只在细则维护，不在此另立清单。

需要准备验证环境或发布截图时完整读取[验证执行参考](references/verification.md)，Windows Codex 再按其中入口读取宿主操作；纯文档报告相应检查，不强启真壳。沿当前授权完成交付，用户明确只本地时才停在本地；完成、合入与发布仍由人决定。

交付说明简述最终变化、产物入口、实际验证与证据、未验范围和必要剩余决定；不要将历史或模拟证据说成当前验收。依赖其他 PR 时核对真实基线，未合入不能称共享基线就绪。

## 6. 从真实开发反馈改方法

交付收尾完整读取 [真实任务反馈](references/workflow-feedback.md)，从原始会话提取、逐条标注，用脚本生成指标评论，再读回评论和 PR 标题前缀。Codex 按 [执行参考](references/codex.md#会话反哺) 运行脚本。人审或返工发生变化时重算并原位更新评论。反哺候选在当次任务按该规范对齐，经人确认后修回原件，每周观察实际效果。

修改方法沿第 1 节写作约定及上述反哺规范执行，按已确认的归属与范围写回原件。

## 7. 试用证据边界

YAML、链接与内容检查只说明文件可用，不能证明模型实际读到、遵守或方法改善。实际结果来自真实任务，留在原 Issue/PR 与会话证据；已有 [固定案例](../project-knowledge/evals/cases.md) 仅作边界参考，反哺不要求新建离线题库。无需先完成全仓特性台账或等待 CI 整改，使用现有可运行验证并如实标明缺口。
