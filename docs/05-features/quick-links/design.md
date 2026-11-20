# design — 项目级常用链接

> **状态：设计建议草案，待人 gate。** 本篇记录现有能力复用、代码落点和持久化边界。用户结果见 [intent.md](intent.md)，当前行为见 [spec.md](spec.md)，证据边界见 [STATUS.md](STATUS.md)。
>
> **维护约定**：实现落点或复用边界变化时更新，不记录讨论过程和逐次施工日志。

## 能力复用

| 能力 | 复用落点 | 约束 |
| --- | --- | --- |
| 状态栏入口和可见性 | `StatusBarSurface`、状态栏控制器、`StatusBarVisibilityMenu` | 仅增加 Monica 自有入口并登记可见项 |
| 面板和行结构 | `PortsStatusSegment` 及其 popover 行组件 | 沿用入口、popover、计数和行内动作范式 |
| 浏览器打开 | `createBrowserTab` 和端口打开链 | 普通点击走内置浏览器，修饰键走系统浏览器 |
| 文件读写 | 既有 `window.api.fs` 桥 | 不新增主进程 IPC 或业务数据库 |

端口扫描和服务状态不接入常用链接。链接不是服务，不能由端口探测推导健康信号。

## 当前落点

- Monica 自有组件位于 `src/renderer/src/monica/quick-links/`，包括状态栏段、popover 和存储逻辑。
- 现有状态栏挂载点只增加常用链接入口，`StatusBarItem`、RPC 参数和可见性菜单增加对应枚举项。
- 纯函数校验位于 `src/shared/monica/quick-links.ts`，负责 schema、URL 归一化和重复检查。
- 真实代码当前已有实现，但仍需 gate 和真壳证据确认是否作为产品能力交付。

## 数据与持久化

项目根目录使用 `.bw/quick-links.json`，结构保持最小化：

```json
{
  "schemaVersion": 1,
  "links": [
    { "id": "ql_xxx", "name": "内部设计规范", "url": "https://design.internal/docs" }
  ]
}
```

按当前激活仓库的路径和 `connectionId` 决定文件归属。工作区切换时切换读写目标。坏文件或版本不匹配按空列表处理，同时保留原文件不覆盖。写入失败保留内存状态并反馈失败。

## 约束与待决

- 不新增端口扫描、服务识别、状态灯、分类树、标签、导入导出或跨项目聚合。
- `.bw/quick-links.json` 的字段和激活仓库口径待 gate 确认。
- gate 后再决定是否登记单条验收点 E2E 和单条用户旅程 E2E。当前不添加业务 E2E。

## 原型关系

[prototype.html](prototype.html) 是纯前端演示假体，数据在内存中，刷新后重置。「打开」只显示提示。它用于确认布局和交互，不替代真实实现或验收证据。
