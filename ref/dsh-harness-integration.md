# DeepSeek Harness CLI 接入

> **维护约定**：给维护 DSH 接入和在内部机器验收的人读取；只写 CLI 身份、原生接入契约、宿主前提与验收路径，不介绍其他 DeepSeek 产品，不承载上游完整发布记录。CLI 或接入契约变化时更新。BW 执行层边界见[会话与执行](../docs/06-module/会话与执行.md)，本篇的实现说明不代表实机已通过。

## CLI 与执行宿主前提

这里接入独立 DeepSeek Harness（DSH），官方引擎为 `@deepseek-ai/dsh`，交互入口为社区 `@deepseek-harness-tui/dsh-tui` 的 `dsh-tui`（别名 `dst`）。它们须安装在**工作区的执行宿主**并处于该宿主的 PATH；仅配置其他智能体使用 DeepSeek 模型不满足此条件。DSH Console、DeepSeek Build 不在本次范围。

本地、WSL、SSH 和同事共享宿主分别拥有自己的 CLI、目录、DSH 配置与账号。先在目标工作树所在主机确认 `dsh --version`、`dsh-tui --version`，并按对应 CLI 的说明完成账号、模型访问及网络配置。自定义 `DSH_HOME` 时，DSH 与 hooks 安装进程须使用同一值；SSH 的 SFTP 安装沿原生入口使用远端默认 `~/.dsh`，自定义远端 home 不在自动发现范围。

DSH 的 hook bridge 还需要每个已初始化 profile 的 `node_modules` 中存在 `@deepseek-ai/dsh-hooks-claude-code` 与 `@deepseek-ai/dsh-hook-protocol`，版本须匹配该 profile 的 DSH。集成只写托管配置，不自动安装这些包；本地缺包会报告 `partial` 并列出目录。父目录中的包不能替代 profile 自己的依赖。远端安装返回值只说明托管文件写入成功，须实际收到 SessionStart 才能证明 bridge 可用。

上游 #24589 的真实启动证据覆盖 DSH `0.2.0-rc.2` + dsh-tui `0.12.0`，#27949 的后端选择修复针对 `0.14+`。这些是上游证据，本次未在 Windows 或内部机器运行，不能当成本分支支持版本的实测认证。

## 发现、启动与续接契约

- 发现需要 `dsh-tui`（或 `dst`）和 `dsh`。默认启动 `dsh-tui . --backend=dsh`，使用原生工作区 cwd，避免首次裸启动进入会话浏览页，也避免沿用 launcher 记住的其他 backend。用户自定义命令仍由用户选择；profile 中显式的 `backend:` 配置可能高于 CLI 选项，验收须确认实际 backend。
- 首条输入沿原生 `stdin-after-start` 投递；等待 alternate screen 内的 `❯` composer 标记，保留既有 bracketed-paste quiet fallback。DSH 持续重绘鲸鱼开场，不能只依赖静默。草稿仍由用户发送，普通启动任务沿既有提交路径。
- 识别区分官方 `dsh` 的 profile 和社区 launcher 的工作区参数；`web`、`headless`、`sdk`、`sdk-minimal`、`acp`、`desktop` 与 plugin 管理不当成交互 agent。launcher 后的 `web`、`plugin` 可以是普通目录名。
- 状态使用 DSH 自己的 Claude Code hook bridge，托管块写在 `$DSH_HOME/cordis.patch.yml`，保留用户行。DSH 会过滤变量名含 KEY/TOKEN 的环境项，因此本地、daemon、relay 生成身份别名，WSL 透传别名，hook 再恢复原生 pane/launch 身份；别名不携带账号凭据。
- 只有 bridge 报告的合法 `session_id` 能进入原生睡眠/恢复流程；续接命令固定 `--backend=dsh --resume <id>`，避免上次选择的其他 backend 接收 DSH id。仍须同一执行宿主和原工作目录，旧宿主通过 `agent-session.dsh-resume.v1` 能力门控降级；不新增 BW 会话库或跨主机迁移。
- `ask_user_question` 的工具事件可以报告等待用户；权限批准没有独立 hook，不能保证显示 waiting。压缩 transcript 不加入会话历史扫描，没有 hook session ID 就不承诺自动续接。

新版 dsh-tui `0.17` 的 launchpad 可能已能粘贴但尚不接受回车，首次引导也可能盖住输入页。上游 #33316 / #33499 借助后续会话系统的 held-draft 重试处理；本次不移植该系统、不盲目重复回车。首次引导须先完成；若首条任务留在输入框，等会话就绪后手动回车并记录 CLI 版本，不能记为自动首条提交通过。

本次不扩展编排 worker 的 `tui-idle` 规则。当前 BW 的 idle 等待读 OSC 状态，DSH 的 HTTP hook 状态不会直接进入该字段；上游 #22468 的 DSH done 判断在当前结构下没有有效输入，因此不保留这条未接通的路径。后续 [#26481](https://github.com/stablyai/orca/pull/26481) 依赖新版状态规则引擎，不随本次 CLI 接入移植。hook 状态与 session ID 仍由现有 hook store 处理，不把它说成 worker 自动等待已支持。

## 内部人工验收

在内部机器从本 PR 的提交出包，两端使用同一版本。各项记录提交、CLI 版本、宿主、工作树绝对路径和“通过 / 失败 / 未验”，失败附实际输出及截图。

1. 在自己的测试工作树写入唯一 sentinel；在同事的同仓工作树写不同 sentinel。分别在真实宿主终端记录 `hostname`、当前目录和 CLI 版本，勿用客户端机器结果替代。
2. 从 BW 原生智能体菜单选择 DeepSeek Harness，在自己的树启动，首条要求“报告主机名、当前目录并只读取 sentinel”。应直接出现 composer，回答对应自己的宿主、目录和内容；记录首次引导或手动回车情况。
3. 进入同事共享宿主的树重复；应由同事主机执行并读回同事的 sentinel。检查访问双方显示的会话身份一致，启动/输入不落到自己的同名仓库。
4. 完成一轮后按原生休眠/恢复路径重新打开同一会话，再问上一轮 sentinel；应续接原 session，仍在原宿主与目录，不能悄悄另开或切 backend。若没有收到 session ID，记录未满足前提；不要用重新启动成功充当续接成功。
5. 检查缺 CLI、缺 profile hook 包和模型账号不可用时的真实失败；缺 CLI 不应报为已发现，缺 hook 包不应承诺续接，账号错误由 CLI 显示。WSL/SSH 需单独执行以上路径；未执行写未验。

本机限制：不安装项目依赖，不运行构建、测试、lint、typecheck、CI 或 Electron；静态阅读、差异检查与独立代码检视不替代以上实机证据。远端 CI 检查算法与协议，不能证明账号、配对宿主或模型交互可用。

## 上游来源

| 来源 | 本次采用 |
|---|---|
| [Orca #22468](https://github.com/stablyai/orca/pull/22468)，`45f3512a336201988289bdb6dba36a5d3f29ccd7` | 定向适配 agent 注册、发现、hooks、状态、首条输入与续接；不带入其他智能体、Mobile、SCM 文本生成 |
| [Orca #24589](https://github.com/stablyai/orca/pull/24589)，`cd8d03bc06398b856f6db734aef11df4e2afe15a` | `.` 工作区启动、0.2 positional profile，复用现有 interpreter parser |
| [Orca #27949](https://github.com/stablyai/orca/pull/27949)，`280dee2477496a662d8fc162854056d42b133c85` | 续接固定 `--backend=dsh` |
| [Orca #31205](https://github.com/stablyai/orca/pull/31205)，`672ee2c53e68d2e3a512efae03d74f7ba70ea9a1` | WSL 透传身份别名 |
| [Orca #37446](https://github.com/stablyai/orca/pull/37446)，`f4d89b94c92ff8aa9461c723bf2f183325782de0` | profile 缺 hook 包的 partial 诊断，不扩展其他 agent 的 CLI 输出 |

旧整版实验 [BW #549](https://github.com/forcegravity1989/builder-workbench/pull/549) 仅作对照，不是本 PR 的基线或验证来源。
