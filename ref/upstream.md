# Upstream Orca — 当前快照与同步记录

> **本篇维护约定**
>
> - **读者与时机**：处理 Orca/BW 边界、核对上游版本、或实际合并/rebase Orca 时读取；仓外会话从 [AGENTS.md](../AGENTS.md) 的任务表进入。
> - **职责与边界**：只记录与 BW 边界有关的 Orca 当前快照、稳定差异、旧 main 迁移来源和同步取舍；不承载 BW 产品设计、日常开发规则、完整 Orca release notes、完整源码树或未解决事项清单。
> - **记录方式**：当前快照覆盖同一组字段，不追加月报。每次核对更新版本/日期/范围；历史由 Git 追溯。无法核对的字段写 `Unknown`，不能用旧基线冒充当前版本。
> - **更新触发**：上游基线或公开版本变化、BW 增删影响同步的钩子、稳定目录边界变化、或同步取舍改变时更新；普通 BW 功能开发不更新本篇。
>
> 本篇的“当前”只表示最近一次有来源的核对，不代表仓库已经跟随该版本。BW 当前产品行为读 [architecture](../docs/architecture.md)，叠层运行入口读 [SYNC](../src/renderer/src/workbench/SYNC.md)。

## 0. 30 秒快照

### 0.1 上游版本锚点

| 项                   | 本次核对结果                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Orca 仓库            | [stablyai/orca](https://github.com/stablyai/orca)                                                      |
| 最近公开稳定版       | [v1.4.245](https://github.com/stablyai/orca/releases/tag/v1.4.245)，2026-10-30 发布                    |
| 公开版本核对日期     | 2026-11-02，官方 latest 仍指向 v1.4.245                                                                |
| 本分支采用的上游基线 | `1c6ac8c3c4d2c3dec2cb5966d225ca2a0e0471d3`（v1.4.245）                                                 |
| 原始 fork 锚点       | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`，2026-09-15；仅供历史追溯                                   |
| 同步方式             | 固定版本完整源码快照，逐项保留 BW 差异；squash 后不引入 Orca 的整段提交历史                            |
| 差异正本             | [orca-differences.json](orca-differences.json)：用例、分类、保留原因、退役条件、验证入口及精确文件快照 |

采用的源码基线不等于已发布版本或旅程验收结论。实际验证与未验证范围写入升级 PR；公开 latest 后续变化不自动改变本分支基线。

### 0.2 与 BW 边界直接相关的能力

当前公开版本的变化重点涉及 agent/orchestration workers、workspaces/worktrees、terminal 与远程运行、native chat（实验能力）、编辑器/Markdown/search、provider/account 与 Windows/WSL。BW 只复用其中与自身旅程有关的 Orca 执行核；具体 BW 产品行为不在这里重复。

BW 依赖的稳定 Orca 原生能力是：TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、provider 与 `src/main` runtime。BW 不为这些能力另建平行实现。

### 0.3 上游目录定位

下面只列同步时需要定位的稳定目录层级，不是完整源码清单：

| 层级         | 上游目录                                                                           | 用途                                                               |
| ------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 产品与执行   | `src/`、`native/`、`cloud/`、`mobile/`                                             | 桌面/原生/远程/移动产品与执行代码；合并时按实际文件和调用链判断    |
| 资源与 Skill | `resources/`、`skills/`、`skill-guides/`、`skill-stubs/`                           | 原生资源与能力分发；Workbench 自有 Skill 以本仓 `standard/` 为正源 |
| 工程与验证   | `config/`、`tests/`、`docs/`、`.github/`、`.husky/`、`Casks/`、`examples/plugins/` | 构建、测试、参考和发布辅助；不因此把上游工程文档变成 BW 产品正本   |

## 1. 上游身份与 fork 基线

| 项               | 值                                                                       |
| ---------------- | ------------------------------------------------------------------------ |
| Orca GitHub      | `https://github.com/stablyai/orca`                                       |
| BW 仓远程        | `origin` = `https://github.com/forcegravity1989/builder-workbench.git`   |
| BW `origin/main` | 产品主干（原 `bw-orca`）；旧 Rust 路线归档为 `archive/main-pre-orca`     |
| Orca 本地远程    | 建议名 `orca-upstream`；使用前必须核对 URL，不能把 `origin` 当 Orca 上游 |
| fork baseline    | `caa465d1da886b2697c85c18bf36f79f2d3b9e68`（2026-09-15）                 |

实际升级先取得明确授权，在独立工作树核对 BW 主干和两个固定的 Orca 发布对象。后续同步以登记中的上次上游 SHA 为显式三方 base：

```bash
# 先从官方仓库取得登记的旧 SHA 与本次选定的新 SHA，再审查三方合并结果。
git merge-tree --write-tree --merge-base=<上次上游SHA> <当前BW提交> <新上游SHA>
```

上述命令输出合并树及冲突信息，不自动安装结果。发生冲突时逐项处理当前 BW 用例，完成构建、受影响旅程和独立审查后才提交。squash 不会把上游 SHA 变成 BW 的祖先；不能重新以 `git merge-base BW upstream` 推断下一次同步起点，也不能直接重复合并最新 upstream/main。旧基线对象在合并与退役审查结束前必须保留，新基线和差异登记在同一交付中更新。日常 BW 开发无需查询上游。

## 2. BW 相对 Orca 的稳定边界记录

### 2.1 已删除或迁移的上游内容

- **Orca Mobile 产品已删除**：`mobile/` Expo 客户端、桌面 Mobile 产品页、Mobile 导航和对应 CI 不应在同步时恢复。
- **配对协议能力仍保留**：`src/shared/mobile-relay-*`、`mobile-e2ee-*`、`DeviceScope`、session 镜像、emulator、relay/pairing 等活体协议不等同于 Mobile 产品，不因删除产品页一起删除。
- **产品文档正本已替换**：仓根 `AGENTS.md`、`README.md`、`CONTEXT.md`、`CLAUDE.md` 与 `docs/` 是 BW 正本；上游工程参考进入 `ref/`，不覆盖 BW 产品文档。
- **上游对外文档站不作为 BW 产品站**：`docs/site/`、README 多语言/营销素材和专项工程笔记不自动恢复；需要时从 Git 历史追溯来源。

### 2.2 目录和挂载边界

| 层级              | BW 落点                                                                             | 同步取舍                                                                           |
| ----------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Orca 原生执行核   | TaskPage、Automations、terminal/PTY、worktree、Explorer/SC/Diff、`src/main` runtime | 原生优先；不大段改写，不复制会话、任务、工作树、连接或调度内核                     |
| BW UI 叠层        | `src/renderer/src/workbench/`                                                       | 保留 BW 导航和业务板；与原生界面冲突时人工处理                                     |
| BW 业务契约与事务 | `src/shared/workbench/`、`src/main/workbench/`                                      | 业务落在 BW 自有模块，不塞进 Orca 工作树、连接和调度类                             |
| 宿主适配          | 原生 RPC/CLI 注册入口与 BW owner runtime 模块                                       | 本机或配对的 BW orcad 执行；旧 SSH 先走原生 managed server 迁移，不恢复 relay 实现 |
| 产品分发规范      | `standard/`                                                                         | 是给被管项目的规范正源，不与 `.claude/skills/` 或 Orca 根级 Skill 目录合并         |

实现位置和运行入口的细节见 [SYNC](../src/renderer/src/workbench/SYNC.md)；当前产品能力见 [architecture](../docs/architecture.md)。

### 2.3 需要在同步时保留的稳定扩点

文件级范围与用例的唯一登记在 [orca-differences.json](orca-differences.json)。这里保留选择方案时需要知道的边界：

- **业务挂载**：BW UI 复用原生槽位、TaskPage、原生创建器、会话发送菜单与侧栏层级算法；版本/目标范围、完整任务引用、返回上下文和版本总览属于 BW。`reserveClosedExplorerToggleSpace` 默认保留原生行为，BW 双栏显式关闭额外占位。
- **版本归属**：`workbenchVersionBinding` 是原生 WorktreeMeta 的附属字段，undefined 保留、null 清除，RPC/IPC/列表投影保持一致。写入和清除均检查 capability，按 owner 与 instanceId 围栏定位，读回确认；创建成功但绑定失败保留树并允许重试绑定。`workbench.versionWorkspace.prepare` 在归属宿主预检、去重创建、绑定和初始化材料；固定工作区复用与缺失分支恢复统一由 `workbench.fixedWorkspace.ensure` 执行，不在访问者本机另建树。
- **任务来源身份**：同一 repoId 可存在于多台主机。查询、列表、详情缓存和 Start/Open 都需带宿主；CodeHub 还区分服务地址与项目。远端持久化使用 owner-local 来源，客户端读回映射到该连接的 runtime 身份。迁移仅转换来源宿主和仓库均能证明的身份；跨主机的客户端 local 来源无法可靠表达时明确拒绝，不猜旧 runtime ID。
- **自动化与发送**：`automation.runNow.oneShotPrompt` 只影响本次 renderer/headless 派发，不改保存的提示。自动化编辑请求保持显式 target/draft；BW 对象动作复用原生发送与 QuickLaunch，不另建会话系统。
- **业务 RPC**：材料、指标、历史、版本绑定/准备、归档与发布状态注册在原生 RPC/CLI，事务和执行落在 BW 模块。SSH 要先转换为运行 BW 构建的 managed server；headless orcad 不提供嵌套 SSH。WSL 开关与可用性沿原生，不因代码存在宣称全部迁移入口已开放。
- **产品身份**：Workbench 图标、profile、launcher、更新仓库与内置推广策略保持 BW 身份。原生检查/安装行为保留；Windows GitHub 整包断点恢复、未签名产品版本通道见 [客户端更新](../docs/06-module/客户端更新.md)。
- **浏览器与 Markdown**：HTTPS 显式继续沿会话级端点/证书指纹授权；换证书拒绝、重启清除。知识库 Markdown 的安全 HTML 兼容与编辑回写是独立用例，不能用静态编译代替焦点/保存旅程。
- **Skill 分发**：BW 的四项 Skill 登记进入原生 manifest、`skill-stubs/` 与 `skill-guides/`；三个周期指南正源在 `standard/`，知识治理指南正源在 `skill-guides/bw-knowledge-docs.md`；发现 Stub 从 `skill-stubs/` 生成至 `skills/<name>/SKILL.md`。按生成脚本更新，不手改投影；包内 CLI 必须能读取完整指南和 references。
- **共享主机**：导入沿原生配对 API；公开链接引用只恢复原 DeviceRegistry 授权，校验磁盘撤销和主机身份，不新发 token。项目墙按当前配对目录和稳定项目身份过滤；不把连接环境 ID 当永久主机身份。

原生已覆盖的修复直接采用该基线源码，移除相应文件登记；退役理由和实际验证留在 PR，不把已消失的补丁常驻登记为待办。内容哈希通过仅证明审查快照一致，不能证明用户旅程通过。

### 2.4 CodeHub 边界

CodeHub 是独立的 `TaskProvider`，不塞回 GitHub 的 `listWorkItems`，也不通过 `gh`/`glab` 降级处理。CodeHub service、`codehub:*` RPC、任务来源和 GitHub 更新路径保持分离；详细行为见 [CodeHub 特性](../docs/05-features/codehub/STATUS.md) 与 [CodeHub 指南](../docs/03-guide/codehub-cli.md)。

### 2.5 从旧 Rust main 吸收的内容

- `standard/` 的系统提示词、references、skills 和模板已作为内容目录合入；旧 Rust `crates/bw` 的集中注入器和旧周一屏脚本不复刻。
- reviewer-agent 召唤制 CI 已迁入默认主干；其现行状态见 [reviewer-agent STATUS](../docs/05-features/reviewer-agent/STATUS.md)。
- 旧 Rust 旅程、ADR、release/出包入口和历史绿灯不作为当前 Electron 行为证据。

### 2.6 CI / E2E 边界

- Workbench PR 门禁以 `.github/workflows/pr.yml` 为准：边界登记、lint、typecheck、BW 与仓库集成测试、desktop 构建和 Electron 冒烟；评审仍沿仓内召唤制 workflow。Orca 专属发布及运营 workflow 保留已隔离的触发策略，不随上游升级恢复自动执行。
- 完整 Orca 的 `check:test-file-runners` 假设 Mobile/docs-site 与全部上游 runner 都存在，不纳入 BW lint；新差异守门测试由 PR 单独执行。保留的 Orca 测试和工程工具不等于全部属于 BW CI；删除的 Mobile 产品检查不再进入其出包闭包。原生协议、安全与 daemon 检查仍按实际消费者保留。
- `tests/playwright.config.ts` 发现 BW 冒烟，`tests/e2e/global-setup.ts` 为 Electron 构建注入 BW 开关。fixture 使用自己的临时仓库、profile 和进程清理，只终止其创建的进程。原生 helper 与 BW fixture 的共同部分升级时同时复核。
- `config/vitest.config.ts` 运行 src 测试；叠层执行例数继续受 ratchet 限制。差异检查同时覆盖原生测试、工程配置、root 工具配置与 hooks；产品文档正本、standard、仓内方法和四个 workbench 叠层目录不逐文件登记为原生补丁。Mobile 目录出现仍独立拒绝。

## 3. 同步取舍

1. **产品文档冲突**：`docs/`、`AGENTS.md`、`CONTEXT.md`、`README.md`、`CLAUDE.md` 以 BW 正本为准；上游工程说明只进入 `ref/`。
2. **上游参考文档**：`ref/` 可以按实际需要吸收 upstream `docs/reference/**` 或 `STYLEGUIDE.md`；不得把 `ref/` 再拷回 `docs/`。
3. **叠层外源码冲突**：BW 自有 `workbench/` 模块以外，默认优先保留 Orca；只有本篇登记的稳定契约、RPC/CLI 注册和已确认的去重边界需要人工合并。
4. **叠层内冲突**：`workbench/**` 与挂载钩子按 BW 现行实现人工合并，不能用上游整段覆盖。
5. **生成物与本机状态**：`.omc/**`、本机 profile、`dist/`、`out/` 不进入产品提交；生成的 Skill/指南按各自正源更新。
6. **CodeHub**：保留独立 provider 和 service；GitHub.com 继续走 Orca 原生 GitHub 路径，不把 CodeHub 收成 GitHub Enterprise 或 GitLab。

合并后按 [SYNC](../src/renderer/src/workbench/SYNC.md) 的 Electron 入口做受影响冒烟；源码存在不等于真实 Electron、远端或模型旅程已验证。

### 差异的分类、看护与退役

每项差异关联一个或多个用户用例，分类为原生修复、原生增强、业务挂载、BW 自有能力、数据与宿主、产品身份、产品范围或工具链。用例必须说明为何仍需保留、什么条件下可删除、已有测试或验收依据在哪里；文件快照使用 Git 内容哈希及模式，删除也是差异。

`pnpm run check:orca-boundary` 拒绝未登记文件、内容变更、失效引用和已收敛但未退役的登记。`--report` 只输出当前差异供审查，不更新登记。新增/修改先复核用例和调用链，再记录审查后的快照；禁止为让门禁变绿批量自动接受新哈希。格式调整也需确认语义与归属。上游已覆盖时先移除补丁、验证同一路径，再删文件/用例登记；历史放在 PR/Git。

## 4. 关联正本

- [AGENTS.md](../AGENTS.md)：本仓开发规范、任务读取路径和验证/交付规则。
- [docs/architecture.md](../docs/architecture.md)：BW 当前产品旅程、能力归属和 Electron 数据流。
- [SYNC.md](../src/renderer/src/workbench/SYNC.md)：叠层代码边界、运行入口和调试方式。
- [docs/05-features/](../docs/05-features/README.md)：特性定义、状态和验证证据。
