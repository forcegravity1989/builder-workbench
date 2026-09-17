## 交付验证：通过

检查 15/15 通过 · 用例 4/4 通过 · 30 秒

- 源码：680329a3966fb0f459c2b2f89ac4ce82ab5eef19 · 干净检出 · 验证期间源码未变
- 执行范围：Windows 门禁 + 已注册 E2E
- 环境：win32 / x64 / Node v24.12.0
- 本次执行：2026-09-17T07-23-23-844Z-c216b976

| 检查 | 结果 | 秒 |
|---|---|---:|
| 验证交付入口的失败与证据判定 | 通过 | 3.8 |
| 知识扫描器的路径、证据与失败判定 | 通过 | 0.7 |
| 确认 WebView2 运行时及版本 | 通过 | 0.3 |
| Rust 格式 | 通过 | 1 |
| 完整 Clippy（含桌面壳） | 通过 | 1.3 |
| 构建本次源码的真实桌面壳 | 通过 | 1.2 |
| 完整 workspace 测试 | 通过 | 2.4 |
| 内核不依赖 UI | 通过 | 0.7 |
| GitHub / CodeHub 相互隔离 | 通过 | 0.2 |
| 屏之间不交叉导入 | 通过 | 0.8 |
| 组件 Hook 规范 | 通过 | 1.7 |
| 源码文件长度 | 通过 | 7.6 |
| CodeGraph 不进入特性提交 | 通过 | 0.1 |
| 按锁文件准备 Playwright | 通过 | 2.5 |
| 真实桌面核心 E2E（固定脚本） | 通过 | 5.5 |

| 用例 | 证据层次 | 结果 | 证据文件 |
|---|---|---|---|
| 真实桌面壳启动并渲染设置屏 (shell-launches) | 真实桌面 | 通过 | desktop-core/initial-shell.log, desktop-core/subject.json, desktop-core/initial-webview.json, desktop-core/shell-launches.png |
| 点击保存工作区目录，并从 settings.toml 读回 (settings-persist) | 真实桌面 | 通过 | desktop-core/settings-readback.toml, desktop-core/settings-persist.png |
| 通过真实按钮从设置进入项目墙和接入页 (onboard-navigation) | 真实桌面 | 通过 | desktop-core/onboard-navigation.png |
| 杀进程重启后，界面与磁盘上的目录一致 (restart-persists) | 真实桌面 | 通过 | desktop-core/restart-readback.toml, desktop-core/restart-shell.log, desktop-core/restart-persists.png |

证据包中的 report.html 可离线打开；result.json 是机器结果，manifest.json 列出文件 SHA-256。

### 人审查什么

- 此报告的源码是否就是 PR 最新提交；是否仍有未通过或未跑项。
- 修复或新增行为是否有对应专项用例；用例判据与证据是否证明了需求。
- 代码 Review 是否完成；未验范围是否可接受。此报告不代替合入决定。

- 仅证明表中实际执行的检查；专项覆盖是否充分及代码 Review 仍须审查。
- 源码验证不能证明安装包或正式发布；远端写入与 Orca 会话仅以明确列出的专项用例为准。核心桌面用例由固定脚本执行，不调用模型。

GitHub CI 将此摘要写入任务 Summary，完整文件放在本次 Actions Artifact。工作会话发布独立验证 Review 时，按 AGENTS.md 上传真壳截图到 shots 分支并内嵌；不要把本地图片相对路径直接粘到 PR。
