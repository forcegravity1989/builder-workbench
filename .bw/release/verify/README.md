# 交付验证入口

> **30 秒导读**：开发会话在当前工作树运行一次命令，门禁和已注册 E2E 按确定顺序执行，结果保存成可离线查看的 HTML、机器结果和证据清单。GitHub CI 调用同一入口。这里不开发周一屏，不决定 PR 合入，不出包、不发布版本。

## 工作会话怎么用

在 Windows 仓根执行（Node 22+、Rust、Git Bash、WebView2；Playwright 按锁文件准备）：

```powershell
node .bw/release/verify/verify.mjs --profile pr
```

`plan.json` 保存项目的命令、顺序和超时；`pr` 包括完整 Rust 门禁、构建真实壳和所有已注册 E2E。Linux 的 `--profile headless` 只验证内核、底座及结构门禁，不能代替桌面验证。macOS、CodeHub 调度和远端写入用例尚未接入；入口不依赖 `gh` 或 GitHub 环境变量。

一次执行一个 `.bw/release/out/verify/<时间-随机号>/`，不会覆盖历史结果。运行期间不要编辑源码。未提交改动可以本地验证，但报告明确标记；正式 PR 证据应在干净的最新提交上重跑。任何源码变化使本次结果失效。命令非零、超时、必跑用例失败/未跑、不完整结果或缺失证据均返回非零。修复后重新执行生成新记录。

| 交付件 | 用途 |
|---|---|
| `report.html` | 人读：结果、耗时、所验源码、逐项截图与留白；截图已内嵌，离线打开 |
| `result.json` | 程序读：执行编号、源码指纹、环境、每步退出码、用例与证据；状态不能从评论推断 |
| `manifest.json` | 本次所有交付文件的相对路径、大小和 SHA-256 |
| `review.md` | 原开发会话发布 PR 验证 Review 的基础摘要，仍须补本次验收判据及截图远端地址 |
| 每步目录 | 执行日志；E2E 的真壳截图、设置读回、被测二进制 SHA-256、清理回执 |

## 特性会话怎么增加专项用例

由开发该特性的会话在 `.bw/release/e2e/suites/` 增加一个 JSON 注册文件及确定性测试脚本；PR profile 自动发现全部注册文件，本地和 CI 一起跑。参照 `core.json`，给出稳定 id、人能理解的标题、`layer`（desktop/browser/remote/local）、参数数组 `command`、超时和完整 `expectedCases`。代码变更不自动证明专项覆盖充分；PR 人审必须检查“需求判据 → 用例 → 证据”是否相符。

命令在仓根执行，`{node}`、`{root}`、`{out}` 分别替换为 Node 绝对路径、仓根和本步骤全新输出目录，**不经过 shell 拼接**。脚本只在 `{out}` 写证据和如下 `result.json`：

```json
{"v":1,"cases":[{"id":"save-reopens","title":"保存后重新打开仍可读回","status":"passed","evidence":["screen.png","readback.json"]}]}
```

状态只能是 `passed` / `failed` / `not_run` / `not_applicable`。本批注册的是必跑用例，后三种都阻止 PR 验证通过；减少用例、悄悄跳过和仅打印成功都无效。证据必须是本步骤目录内非空的真实文件，不接受越界路径和文件链接。测试代码负责判据真实性，执行器检查结果完整性；不得把模拟接口的证据标作真实桌面或远端。

现有核心套件固定完成：真壳启动 → 修改工作区并读回文件 → 点击进入接入页 → 停止自己的壳、重启并核对界面及磁盘。Playwright 通过 CDP 连接真实 WebView2；每次新建隔离 Windows 桌面、数据/工作区/WebView 目录，只清理本次拥有的进程和目录。用条件读回等待，不用固定睡眠猜“写完了”。没有真实远端造数，不污染 WB 仓，也尚不能代表独立 E2E 仓的远端场景已建成。

## GitHub 上去哪看

PR 创建和更新时运行 Linux、Windows 两项检查；合入 main 后及手动触发也运行。分支 push 不另跑同一套 CI。PR **Checks → 对应任务 → Summary** 始终是结果摘要入口；**Actions run → Artifacts → verification-windows/linux** 下载完整证据包（14 天）。这是固定脚本写入，不依赖模型评论。

独立代码 Review 仍沿用仓库已有机制。默认交付 PR，用户说「只本地」时才停在本地；合入、关闭 Issue 和正式发布仍须已有明确授权。开发会话开好 PR 后，用下面的 GitHub 适配命令发布独立验证 Review（需要已登录的 `gh`、Git push 权限）：

```powershell
node .bw/release/verify/publish-review.mjs --pr <PR号> --run <本次结果目录>
```

命令校验干净工作树、最新 PR 提交和所有证据哈希，将证据推到永不合入的 `shots/<PR分支>`，以不可变 SHA 内嵌真壳截图，发布后再读回 Review，保存 `github-review.json` 回执。同一执行重复调用不重复发 Review；上传期间 PR 改变则拒发过时结果。它不动特性工作树或暂存区，不合并 PR、不关闭 Issue。测试判据和代码审查不能由这一机械摘要代替。

没有替人设置仓库的 required checks。强制合并闸口尚需另设，检查存在本身不等于已启用分支保护。

## 与后续出包的边界

第一批只落源码的交付验证。既有 `pack/pack.cmd`、`e2e/e2e.cmd` 仍是旧安装包入口，不得把本批源码 E2E 报告说成验包通过。后续候选包将接入同一结果和证据格式，再处理安装隔离、包与源码绑定及归档；正式发布需要明确授权。本周周一屏的用例、资产分发修复、功能 PR 仍由原开发会话提交。

## 关键技术来源

- [GitHub 托管运行机](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)：每个 Windows job 使用 GitHub 提供的新虚拟机；它不是连接开发者的电脑。环境差异与首次构建耗时以实际报告为准。
- [Playwright WebView2 官方说明](https://github.com/microsoft/playwright/blob/main/docs/src/webview2.md)：用 CDP 附着 WebView2，已有用例运行不调用模型；新增判据和失败诊断才需要模型参与。
