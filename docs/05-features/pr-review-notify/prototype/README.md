# PR 评审通知高保真

> 给设计评审者看交互与布局。行为正本在 [spec](../spec.md)，本目录只是可点原型，不代表能力已交付。原型基底为版本工作区 G2 现行壳（2026-10-27），只叠加评审通知浮层与 PR 详情演示。

## 演示内容

- 右下角：本机评审通知入口，含「我发出的评审」与跨项目「待我评审」。
- 左侧：另一台主机（周工的 MacBook）的评审通知入口，用来演示请求送达与评审人视角。
- 页面顶部评审旅程条与「重置评审演示」只属原型工具，不是产品 UI。

## 运行

直接打开 `index.html`，或在本目录执行：

```bash
node build.cjs     # g2-workspace.jsx → g2-workspace.js
node verify.mjs    # Playwright DOM 断言 17 项，优先用本机 Edge
```

改交互改 `g2-workspace.jsx`（通知、PR 演示页）或 `g2-binding-demo.jsx`（工作树右键菜单「发送评审」），样式在 `a-todo.css`。`vendor.js` 是 React / Lucide 的本地打包依赖。

## 已知局限

- 两台主机是同一页面里的两个浮球，不连接真实主机；PR 数据为静态演示。
- PR 详情是简化页；正式实现复用原生 PR 详情。
- 视觉正确性以人工目视为准，自动化只断言 DOM 与无 console/page error。
