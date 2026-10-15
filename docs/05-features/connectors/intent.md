# intent — 集成页三卡收敛（Connectors）

> **状态：草案，待人 gate。** 来源 [#323](https://github.com/forcegravity1989/builder-workbench/issues/323)（含 v0.6 自 #301 转入的安装引导遗留）。本篇只写为什么做与范围；目标行为见 [spec.md](spec.md)，链状态见 [STATUS.md](STATUS.md)，可点样张见 [prototype.html](prototype.html)。
>
> **维护约定**：给判断「BW 集成页该长什么样、三张卡从缺办到通值不值得做」的人读。集成页行为变化、CLI 依赖变化或待决项拍板时更新本篇；不抄实现清单，不记过程流水。

## 用户与问题

被管项目的 Builder 在内网环境工作，BW 真正依赖三个 CLI：`gh`（GitHub 任务与 PR）、`codehub-cli`（CodeHub 任务与 MR）、`welink-cli`（项目群通知）。他打开设置 → 集成想确认三者可用，看到的却是八张卡：六张（GitLab、Bitbucket、Azure DevOps、Gitea、Linear、Jira）与 BW 工作流无关，真正要用的 WeLink 反而没有卡。剩下两张也只报缺、不帮着办：

- GitHub 没装时只有跳官网的按钮；没登录时只把 `gh auth login` 这行字摆出来，要自己开终端敲。
- CodeHub 只区分「在 PATH 上」与「不在」，不探登录，也没有登录入口。

结果是「知道自己缺什么」要跨三个地方查，「把缺的补上」要离开应用。新 Builder 的第一轮环境准备在这里最容易卡住。

## 价值与依据

核心收益：**一个页面把三个 CLI 从「缺」办到「通」**。卡上直接给本平台的安装命令和登录命令，人按回车执行，命令结束自动复查，不再需要对照文档开外部终端。

依据：#323 由人提出并标注 Feature；v0.6 补充承接 #301 群反馈遗留的 codehub-cli / welink-cli 安装与配置引导收敛。三个 CLI 的命令口径已在本机实测核对（`gh auth status`、`codehub-cli auth status`、`welink-cli auth status` 均存在且可读，见 spec 命令表）。多 Builder 的真实使用读回还没有，价值效果仍是假设。

## 目标体验

设置 → 集成只剩三张卡，按「代码托管」（GitHub、CodeHub）与「项目群」（WeLink）分组，共用同一套模板与状态机。每张卡按检查中 / 未安装 / 未登录 / 已连接 / 不可用五种口径现查现报：

- 没装：点「安装」，本平台的安装命令填进卡片内终端，人按回车执行。
- 没登录：点「登录」，`auth login` 填进终端。
- 命令结束后自动重新检查，装好、登好即变已连接。
- 状态来自远端 Orca 服务器或 WSL 时，只报状态，不给安装、登录按钮。

## 范围与边界

- **做**：集成页收敛为三卡；统一卡片模板与状态机；安装 / 登录命令按平台预填卡片内终端；命令退出自动复查；WeLink 新卡与 welink-cli 登录探测；codehub-cli 从「只探 PATH」补齐登录探测。
- **范围外**：不在卡片内替人执行安装或登录（命令由人按回车执行）；不新增六张被收敛卡的替代入口；不改 Orca 原生对其他 provider 的能力与协议；不探 CLI 版本新旧。
- **相邻**：CodeHub 任务行为归 [codehub 特性](../codehub/intent.md)，本特性只管「codehub-cli 装好登好」这一站；安装引导（setup-guide）对 codehub-cli / welink-cli 的补齐按 #323 v0.6 补充与本卡状态机对齐，引导正文归其所属旅程。

## 成功判据与待决问题

**判据**：一台三 CLI 全缺的新机器上，Builder 只在集成页内操作就能把三张卡全部办到已连接；杀进程重开，三卡状态仍从真实探测读回，不出现假绿。六张被收敛的卡不再出现在 BW 集成页。

**待决（需 gate，共 5 项）**：

1. **被收敛六卡的代码去留**——只隐藏 UI，还是连带删除其探测与状态代码？删除缩小维护面但加大与 Orca 上游同步的冲突面；仅隐藏保留上游能力。草案倾向仅隐藏 UI、探测代码留给上游同步（待拍板）。
2. **卡片内终端的形态**——完整内嵌 PTY 终端（可多行交互、看全输出），还是预填命令的单行执行行（回车即跑、退出即复查）？完整终端复用 Orca 终端核成本高；单行轻但 `gh auth login` 的交互式提示可能显示不全。草案倾向内嵌 PTY 终端（待拍板）。
3. **codehub-cli 安装命令口径**——本机实测它是内网分发的独立二进制（非 npm 包），权威安装命令与说明链接待内网确认；welink-cli 走内网 npm 源（`npm install -g @welink/welink-cli`）。codehub-cli 的安装命令先占位还是等内网补齐再上？（公共 npm 的同名 `welink-cli` 是京东前端脚手架，已确认不可用。）
4. **welink-cli 的 EXPIRED 中间态**——`welink-cli auth status` 存在「Token EXPIRED、下一条命令自动刷新」的中间态（本机实测）。它算「已连接」还是「需重新登录」？草案倾向算已连接（自动刷新兜底），不让人为过期重登（待拍板）。
5. **分组命名**——「代码托管 / 项目群」还是沿用现有「Review providers / Task providers」改造？分组词影响设置页搜索与 i18n 词条（待拍板）。
