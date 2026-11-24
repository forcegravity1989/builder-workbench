# STATUS — 任务管理

> **维护约定**：给交付、检视和验收者读取。本篇只维护任务管理当前六环状态、可追溯入口和未验证边界。行为见 [spec.md](spec.md)，用户结果见 [intent.md](intent.md)。运行命令、日志、截图和修复过程留在对应 PR 验证评论，不保存施工流水或遗留台账。

链接直达需求来源为 [#698](https://github.com/forcegravity1989/builder-workbench/issues/698)。原型 [prototype.html](prototype.html) 当前为待评审的 GitHub 全局任务屏样板，不作为生产证据，也不覆盖链接直达、版本范围和其他任务来源。完整规格与样板覆盖范围见 [spec.md](spec.md)。CodeHub 来源适配的独立状态见 [CodeHub STATUS](../codehub/STATUS.md)。

## 六环状态

| 环 | 状态 | 当前依据与边界 |
| --- | --- | --- |
| 1 intent | 已确认 | 用户结果、价值、范围和排除见 [intent.md](intent.md)。 |
| 2 spec | 部分确认 | 链接直达的匹配规则、失败边界和 TL01–TL06 沿既有认可；补充的完整任务屏描述及当前原型待人评审，不沿用链接直达的确认覆盖新增范围。 |
| 3 实现设计 | 部分 | 终端与会话复用链接动作菜单，解析与来源读取位于 `src/shared/task-item-link.ts`、`src/renderer/src/workbench/task-item-link-routing.ts`、`src/renderer/src/workbench/task-item-link-navigation.ts` 和 `src/main/codehub/service.ts`。真实 GitHub／CodeHub 详情链路仍待对应环境核验。 |
| 4 TDD | 部分 | 协议看护位于 `src/shared/task-item-link.test.ts` 与 `src/main/codehub/service.test.ts`，覆盖来源、类型、路径、编号、项目身份和 CodeHub 主机校验。它们不替代 Electron 旅程验收。 |
| 5 验收点 E2E | 待验 | 判据为 TL01–TL06。当前没有登记到 Workbench 白名单的特性 E2E 入口。执行项目目标为 `electron-headless`，需要真实 Electron、真实登记项目和本机 CLI。独立读回应核对详情来源／类型／编号、失败提示及返回后的原会话上下文。 |
| 6 用户旅程 E2E | 待验 | 主旅程为探索 BW 的 W03「构建交付」。TLJ01 是旧标识，映射到“任务链接 → 真实任务详情 → 返回原会话”片段。当前没有登记的 W03 用户旅程入口，不能以原型、CLI 单独点读或其他特性 E2E 记为通过。目标执行项目为 `electron-headless`，独立读回为任务详情与原工作区／会话上下文一致。 |

## W03 交叉索引

| W03 片段 | 任务管理承接 | 其他承接 |
| --- | --- | --- |
| 找到交付任务并查看结果 | 终端或会话链接按来源和完整身份打开既有任务详情 | 版本计划提供任务关联，CodeHub 提供来源适配 |
| 回到原工作区继续处理 | 关闭详情返回原视图并保持工作区／会话 | 版本会话管理承接工作区与会话生命周期 |
| 评审、合入和关闭任务 | 不产生写操作 | 通知、版本验收和托管平台原生动作承接 |

W03 是跨特性的唯一用户旅程目录。任务管理不因 TLJ01 或 TL01–TL06 另建第二条用户旅程。

## 验证边界

原型和协议测试只证明交互意图及解析、身份校验等稳定逻辑。真实 Electron 菜单、GitHub 与 CodeHub CLI 详情、未登记和权限失败提示、退出详情后的上下文恢复、跨主机身份核对均待对应环境验证。具体执行结果写入 PR 验证评论并在此只更新当前状态。
