# 样板间：给 gtsllm-dfx 搭 CI 屏部署入口（真实执行证据）

> **本篇维护约定**
> - **读者与时机**：评审 CI 屏部署模块的人（本 PR gate）——回答「这套东西到底能不能落地、落了什么样」。方法见 [skill-deploy](skill-deploy.md)，行为见 [spec](spec.md)。
> - **职责与边界**：只装样板间事实——拿什么东西、给什么项目、搭了什么、结果是什么、哪些路径没走到。**不装**：方法论述（skill-deploy）、价值论证（intent）。证据是一次性实跑记录，不随本篇更新；后续真实使用证据进 [STATUS](STATUS.md)。
> - **样板间身份**：gtsllm-dfx 是首个按 ci-ops 方法接入部署入口的真实项目，本篇即「拿什么→给谁→搭了什么→结果」的完整交代。

## 拿什么东西

CI 屏部署模块的方法与资产草案（本 PR 交付）：ci-ops skill 部署草案（勘察→复用→生成→读回→记录四步方法 + 递交 prompt 文本 + 记录协议，[skill-deploy](skill-deploy.md)），以及固定路径约定 `.bw/ci/deploy.sh`（脚本资产，进项目 main 经人审）与 `.bw/ci/records.jsonl`（执行记录，bw/ci 树本地不上仓）。

## 给什么项目

[gtsllm-dfx](https://codehub-dg-g.huawei.com/y00652259/gtsllm-dfx.git)（本机 `D:/2026/10/dfx/gtsllm-dfx`，git `e62623f`）——DFX 能力规划看护台，纯 Node 局域网服务（端口 8025，零 npm 依赖）。选它做样板间因为它**已有真实部署资产**，正好检验「复用优先」是不是空话：

| 项目已有资产 | 职责 |
|---|---|
| `build/build.sh` | 打版本包 `dist/gtsllm-dfx-<版本>-<时间戳>.7z`（解压即部署目录内容） |
| `deploy/install.sh` | Linux 首次装机：建 `gtsllm` 用户、写 systemd unit、enable --now、探 `/healthz` |
| `deploy/restart.sh` | 更新重启：`node --check` → `systemctl restart` → 轮询探针，失败给诊断 |
| `deploy/watch-win.sh` | Windows(Git Bash) 监督拉起：探活、连败杀掉重拉、记 startMs/downMs 事件 |
| `server.js` 探针 | `/healthz`（进程活着即 200）、`/readyz`（数据可写+JSON 可解析，坏则 503 点名） |

## 搭了什么

一个部署编排入口 `.bw/ci/deploy.sh`（约 170 行 bash，已落在项目工作树待人审）：`构建 → 部署 → 独立读回 → 写记录` 一条命令，外加 `--stop` 干净停止。**项目已有脚本一行未改**，deploy.sh 只做编排并补上项目原本没有的三样：独立读回、执行记录、失败路径。

- 本机路径（已实走）：`build/build.sh` 打包（`SZ=` 透传 7z 路径）→ 解包到 `dist/deploy-local`（**运行的是发出去的包，不是源码树**）→ `deploy/watch-win.sh` 监督拉起 → 轮询 `/healthz` → `/readyz` + 部署目录版本读回 → 写 `records.jsonl`。
- 远端路径（已构建、**未实走**，无真实目标机）：scp 包 → 远端解到 `/opt/gtsllm-dfx` → 首次走 `install.sh`（systemd 装机）/已装走 `restart.sh` → 探针读回。参数化 `DEPLOY_HOST`/`DEPLOY_USER`/`APP_DIR`/`RUN_USER`。
- 配套：项目 `.gitignore` 补三条（`records*.jsonl`、`logs/`、`supervisor.pid` 不入库；deploy.sh 本身作为资产入库）。

## 结果是什么（2026-10-28 本机实跑）

**部署成功**：`bash .bw/ci/deploy.sh` 一次通过——

- 新鲜版本包 `dist/gtsllm-dfx-1.0.0-20261028_1841.7z`（git `e62623f`，非历史旧包）
- 独立读回：`/healthz` 200 `{"ok":true,"port":8025,...}`、`/readyz` 200、部署目录版本 `1.0.0`、全程 5348ms
- 记录落盘：`records.jsonl` 追加 `ok:true` 条目（pkg/version/gitRev/healthz/readyz/elapsedMs/log 齐全）

**部署后有人看护**（复用项目自己的监督脚本，非新造）：强杀服务进程（`taskkill //F`）→ 监督 12 秒内检出 `down`、自动重拉、`/healthz` 重新 200（新 PID）；监督事件流水完整计量：`started → spawn → up(startMs 200ms) → down → spawn → up(startMs 5277ms, downMs 19726ms) → stopped`。

**失败路径如实红**：故意用坏 `SZ` 跑一次 → 前置检查/打包失败 → `records.jsonl` 写 `ok:false` + `error` + 日志指针，不降级不装绿。

**干净停止**：`--stop` 触发监督脚本 trap（关子进程、记 `stopped` 事件），端口释放，一条命令可重启。

## 没走到什么

- 远端 Linux 路径（install.sh/restart.sh 编排段）无真实目标机，**未实走**；首次真实远端部署时按结果回填证据。
- CI 屏板面本身仍是原型（[prototype.html](prototype.html)），本样板间证明的是「部署入口 + 记录协议 + skill 方法」在真实项目上成立，不等于屏面已交付。
- gtsllm-dfx 仓内的 deploy.sh 与 .gitignore 改动留在其工作树，由该项目经自己的评审流（CodeHub MR）合入，本仓不代提。
