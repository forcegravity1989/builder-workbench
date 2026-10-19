# #370 真实 Electron 验证

源码提交：bc533f4f1bff2665788dae0b9645be9ec8687f39，base e43528cae57424bb0973c99c6e3c03af075c1198。环境：Windows、Node 24.12.0、pnpm 12.0.0、Electron 43.7.0，Workbench e2e 模式构建。此目录是永不合入的截图/临时复现证据，不是新增产品测试入口。

## 方法与复现

1. 从源码提交安装锁定依赖，执行 `pnpm run ensure:electron-runtime`。
2. PowerShell 中设置 `$env:WORKBENCH_SHELL='1'; $env:VITE_WORKBENCH_SHELL='1'; $env:ORCA_PRODUCT_NAME='Workbench'`，运行 `pnpm exec electron-vite build --mode e2e`。
3. 将本目录的 `certificate.spec.ts`、`playwright.config.ts` 复制到源码工作树的 `test-results/issue370/`。
4. 在源码根目录生成仅用于测试的临时证书：`openssl req -x509 -newkey rsa:2048 -nodes -keyout test-results/issue370/key.pem -out test-results/issue370/cert.pem -days 2 -subj /CN=intranet.example -addext subjectAltName=DNS:intranet.example`。不要导入系统信任库；测试私钥不上传。
5. 运行 `pnpm exec playwright test --config test-results/issue370/playwright.config.ts`。最终结果：1 passed (1.1m)。

脚本把保留测试域名 intranet.example 映射到 127.0.0.1，使用 SAN 匹配但签发机构不受信任的真实 TLS 证书。Electron 主进程、原生浏览器 guest、证书回调、IPC 和按钮均使用产品实现，无证书/IPC mock。使用独立测试仓和隔离 home/profile，后台启动。store 只用于准备浏览器标签，验收读原生警告 UI、guest DOM 和服务端独立请求计数；用户选择由 Playwright click(force) 输入执行。网页截图来自 guest WebContents.capturePage，警告截图来自真实 Workbench 窗口。

本机原生依赖曾因 worktree 长路径触发 MSBuild 260 字符限制；在专用短目录编译同版本已打补丁依赖，再复制生成物并通过 ensure:electron-runtime。临时脚本早期的定位符错误、退出等待和重复关闭已修正，最终完整运行通过；没有因此修改产品代码或仓库测试 fixture。

## 用例、执行路径、期望与结果

| 用例 | 执行路径 | 期望与实测 | 截图 |
|---|---|---|---|
| 普通域名证书警告 | 新标签打开 HTTPS 测试域名 | 显示“连接不安全”及“仍然继续（不安全）”；点击前服务端文档请求数为 0 | 01-warning.png |
| 用户明确继续 | 点击现有按钮 | 原生 guest 加载页面、图片和 WebSocket；请求分别为 1/1/1；同标签刷新后为 2/2/2 | 02-approved-guest.png |
| 兄弟标签隔离 | 新标签访问相同 URL | 仍警告，文档请求保持 2 | 03-sibling-warning.png |
| 不同端口隔离 | 新标签访问同域名另一个端口 | 仍警告，第二服务文档/图片/WebSocket 均为 0 | 04-port-warning.png |
| 关闭后重开 | 关闭获准标签，再新建同 URL 标签 | 重新要求明确继续；再次点击后第一服务计数变为 3/3/3 | 05-reopened-warning.png |
| 同 profile 应用重启 | 关闭 Electron 后，以同一隔离 home/profile 启动并打开 URL | 再次警告；未点击时第一服务计数仍为 3/3/3 | 06-restart-warning.png |

机器读回见 result.json。截图与最终结果属于同一次通过运行。

## 门禁与评审

- 更新后的普通域名测试在旧实现 6 失败/5 通过；修复后 `pnpm exec vitest run --config config/vitest.config.ts src/main/browser/browser-certificate-trust-controller.test.ts src/renderer/src/components/browser-pane/navigate/browser-load-failure-overlay.test.tsx src/shared/browser-url.test.ts`：3 files / 46 tests passed。控制器仍为 11 个用例，没有新增 skip/todo 或测试数量。
- `pnpm run typecheck` 通过；`electron-vite build --mode e2e` 通过；提交的 Husky lint-staged（oxlint、react-doctor lint、oxfmt）通过；`git diff --check` / `git show --check` 通过。
- `pnpm run lint` 其余步骤通过，最后 localization coverage 失败：base 自带的 AppWorkspaceShell.tsx:310/311/315 有 6 处未本地化字符串。已确认 src/renderer 和相应检查配置相对 base 无差异。保留问题，不把完整 lint 报为通过。
- 独立 subagent 检视实际 diff、主进程→控制器/request guard→IPC→overlay 调用链，四维均未发现 P0–P3 问题。检视维度为顶层约定一致性、文档与老资产、实现与替代方案清理、测试资产配比。该评审未独立重跑测试。
- 原生差异记入 ref/upstream.md §2.3，符合现有头部“稳定差异/同步取舍”职责，无头部变化。未新增独立特性文件或改变总体架构。

## 未验证边界

未访问或登录 #370 反馈中的企业站点；这里证明同类证书错误的真实 Electron 流程。未验证 macOS/Linux、SSH/WSL/远程浏览器。证书过期、域名不匹配等其他错误码保持拒绝由本次单测及源码检视覆盖，未在真壳分别制造这些错误。未执行完整 build:desktop 发布链或无关计划/验收旅程。远端 CI 与召唤式评审以 PR 当前状态为准。
