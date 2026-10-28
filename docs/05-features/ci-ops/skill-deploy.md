# ci-ops skill 草案（部署模块）——CI 助手的工程能力与执行方式

> **本篇维护约定**
> - **读者与时机**：评审 CI 屏部署模块的人（本 PR gate）、后续把本 skill 落地到 `standard/skills/ci-ops/` 的开发者、以及被 ci-ops prompt 激活的 CI 助手会话本身。
> - **职责与边界**：只装 ci-ops skill 部署部分的正文草案——工程能力从哪来（勘察→复用→生成→读回→记录的方法）、递交 prompt 的真实文本、执行与记录协议、助手边界。**不装**：屏面行为（[spec](spec.md)）、价值论证（[intent](intent.md)）、样板间证据（[showcase-gtsllm-dfx](showcase-gtsllm-dfx.md)）。
> - **状态**：草案，随本 PR 交人 gate；gate 通过后正文迁入 `standard/skills/ci-ops/SKILL.md`（按 [SKILL-MD-SPEC](../../../../standard/skills/SKILL-MD-SPEC.md) 格式整理），本篇转为指针。
> - **更新触发**：prompt 文本、方法步骤、记录协议变化时更新；首批真实项目使用反馈驱动打磨。

## 这个 skill 解决什么

「生成部署脚本」不是让模型凭空写一段通用脚本。每个项目的构建方式、服务形态、健康口径、目标环境都不同，通用模板只会造出假绿灯。ci-ops skill 给 CI 助手一套**对每个项目先勘察、复用已有资产、缺失才生成、执行后独立读回**的方法——工程能力来自项目自己的代码与脚本，不来自模型的想象。

## 方法：助手接到生成请求后的四步

### 第一步 · 勘察（不勘察不生成）

读项目实际代码，回答四个问题，答案写进生成会话的回复里（人审 PR 时核对）：

| 问题 | 看什么 | gtsllm-dfx 样板间的答案 |
|---|---|---|
| 怎么构建出包 | build 脚本、流水线配置、打包产物形态 | `build/build.sh` → `dist/gtsllm-dfx-<版本>-<时间戳>.7z` |
| 服务长什么样 | 端口、探针、进程模型（前台/systemd/容器） | Node 零依赖服务，8025，`/healthz` 判 `"ok":true`、`/readyz` 判数据可写 |
| 已有哪些部署资产 | deploy/、scripts/、systemd unit、Dockerfile、监督脚本 | `deploy/install.sh`（Linux systemd 装机）、`restart.sh`、`watch-win.sh`（Windows 监督拉起）、`status.sh` |
| 部署到哪 | 目标环境、目标目录、运行用户、传输方式 | Linux 生产 `/opt/gtsllm-dfx`（systemd）；本机 Windows 验证环境 |

### 第二步 · 复用优先（不另造平行机制）

已有资产**编排**进固定路径 `.bw/ci/deploy.sh`，一条入口串起来：构建 → 传输/解包 → 起服务 → 独立读回 → 写记录。已有脚本原样被调用，deploy.sh 只补项目没有的那一段——通常是「编排 + 读回 + 记录」。样板间里 build/build.sh、watch-win.sh、install.sh、restart.sh 一行未改，deploy.sh 只是把它们按序串起来并补了读回与记录。

### 第三步 · 缺失才生成

勘察后确实没有的环节，按模板生成并写入 deploy.sh（同一份脚本里，生成段与编排段用注释分界）：

- **构建段**：调用项目构建入口出版本包；无构建脚本时按项目语言生成（原则：产物带版本号、可解压即部署）。
- **部署段**：传输到目标环境并落位；Linux 优先 systemd（装机一次，之后 restart），Windows/Git Bash 用监督脚本拉起。
- **读回段**：**必须独立读回**——不信任部署动作本身，另起探针确认服务状态、版本、耗时；探针口径用项目自己的（样板间用 `/healthz` 的 `"ok":true`，这是项目监督脚本同款判据）。
- **记录段**：结果追加写 `.bw/ci/records.jsonl`（协议见下节）；失败同样写记录，`ok:false` 带错误摘要与日志指针。

### 第四步 · 人审合入

生成的 deploy.sh 提项目仓 PR，**经人审合入 main**——板面不直接写脚本、不绕过评审。合入后板面 5 秒扫描主检出，扫到 `.bw/ci/deploy.sh` 灯灰→黄。

## 递交 prompt 真实文本

板面按钮经 Orca 原生发送弹窗把文本递交进 CI 助手会话；与会话里直接说同一句话等价。文本是评审对象，改文本等于改行为。

| 入口 | 递交文本 |
|---|---|
| 生成部署脚本（灰态板面按钮） | `按 ci-ops skill 为本项目生成 .bw/ci/deploy.sh：先勘察项目实际代码与已有部署资产（构建方式、服务形态、探针口径、目标环境），已有资产编排复用、缺失环节按模板生成；执行后必须独立读回服务状态与版本并写 .bw/ci/records.jsonl 记录，失败如实写 ok:false 与日志。完成后提 PR 经人审合入 main，不直接改 main。` |
| 部署（黄/绿/红态板面按钮） | `执行本项目的 .bw/ci/deploy.sh：构建版本包 → 部署到指定环境 → 独立读回服务状态与版本 → 写执行记录。按记录协议把结果追加进 .bw/ci/records.jsonl，失败如实写 ok:false 与日志，不重试到绿。` |
| 停止（会话直说；板面不设按钮，属脚本能力） | `执行 bash .bw/ci/deploy.sh --stop，停掉本机监督实例并确认端口释放；结果如实回报。` |

## 记录协议（板面灯的正本）

`.bw/ci/records.jsonl`，一行一个 JSON，追加写，存 bw/ci 固定树本地、默认不上仓：

```json
{"ts":1793184085077,"iso":"2026-10-28T10:41:25.077Z","module":"deploy","ok":true,"target":"local","pkg":"dist/gtsllm-dfx-1.0.0-20261028_1841.7z","version":"1.0.0","gitRev":"e62623f","healthz":200,"readyz":200,"elapsedMs":5348,"log":".bw/ci/logs/deploy-20261028T184114.log"}
{"ts":1793184227485,"iso":"2026-10-28T10:43:47.485Z","module":"deploy","ok":false,"error":"打包失败，看日志","log":".bw/ci/logs/deploy-20261028T184341.log"}
```

- 必备字段：`ts`/`iso`/`module`/`ok`；成功附 `version`、`elapsedMs` 与读回读数；失败附 `error` 摘要；两者都带 `log` 指向 `.bw/ci/logs/` 下的完整输出。
- 灯由记录推导：最近一条 `ok:true` 绿、`ok:false` 红、有脚本无记录黄、无脚本灰。**助手不得为「让灯变绿」重试刷记录或手改记录**——失败如实红，恢复靠下一次真实成功。

## 助手边界

- 不替人确认完成：部署成功只写记录与读回，不关 Issue、不宣布「发布完成」。
- 失败不降级：探针不通就是红，不写成「未知」或「应该没事」。
- 日志与记录只写 bw/ci 固定树本地，不提交进项目仓；deploy.sh 脚本资产本身进项目 main，代码与数据分离。
- 单次执行不自动重试；重复部署请求在会话里如实串行执行。
