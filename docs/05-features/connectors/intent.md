# intent — Connector（集成）卡片：GitHub、CodeHub、WeLink

> **状态：草案，待人 gate。** 2026-10-10 用户发起：「orca 的集成就是 connector，只保留 gh，新增 codehub-cli、welink-cli 两个，同时提供相应的添加能力」。本批只交设计（intent / spec / 原型 / STATUS），实现在内网完成；CodeHub、WeLink 的安装与登录细节由内网补。关联 #323。
>
> **维护约定**：给判断「Builder 怎样在 Workbench 里把三个外部 CLI 接好」的人读。行为与卡片契约见 [spec.md](spec.md)，可点样张见 [prototype.html](prototype.html)，链状态见 [STATUS.md](STATUS.md)。边界变化时改本篇，不把实现清单抄进正文。

## 用户与问题

被管项目的 Builder。Workbench 靠三个外部 CLI 连到项目的系统：`gh`（GitHub）、`codehub-cli`（CodeHub 的 Issue 与 MR）、`welink-cli`（项目群通知，配在项目名片 `.bw/project.toml` 的 `[chat]` 段）。在 Orca 里这些叫「集成」，在 BW 词表里叫 Connector。

今天设置 → 集成 页：

1. **摆了八张卡，六张与 BW 无关。** GitLab、Bitbucket、Azure DevOps、Gitea、Linear、Jira 都在，Builder 要从里面找自己用的。
2. **WeLink 没有卡。** `welink-cli` 装没装、能不能用，界面上看不到。
3. **卡片只报缺，不帮你办。** GitHub 没装时只有一个跳官网的按钮，没登录时把 `gh auth login` 这行字摆出来让人自己去开终端；CodeHub 只区分「`codehub-cli --version` 跑得通 / 跑不通」，不探登录，也没有登录入口。

## 价值与依据

核心收益：集成页只放 BW 用得到的三个 CLI，每张卡从「缺」办到「通」——装、登录、看状态都在卡片上原地完成，命令原样可见、由人按回车执行，完成后自动重新检查。

依据：Claude 与 Codex 的 connector 都把「挑一个 → 装上 → 登录 → 看状态」做成原地一条路；Orca 已有内嵌终端组件（`OnboardingInlineCommandTerminal`）与预检（preflight）两块现成能力，三张卡共用一套卡片模板即可。2026-10-10 在 Workbench 真壳里验证过 GitHub 卡片原地安装与登录的命令填入（已关闭的 PR #309）；价值效果尚无真实 Builder 读回，仍是假设。

## 目标体验

打开设置 → 集成，只有两节三张卡：「代码托管」里 GitHub、CodeHub，「项目群」里 WeLink。每张卡右上角一枚状态：检查中、未安装、未登录、已连接；CLI 不报登录状态时显示「已安装」，探测出错显示「不可用」。没装就点「安装」，安装命令填进卡片里的终端，按回车装完自动重新检查；没登录就点「登录」，按 CLI 提示授权，完成后卡片变已连接。三张卡长得一样、按钮在同样的位置。

## 范围与边界

- **做**：Workbench 壳的集成页只留 GitHub、CodeHub、WeLink 三张卡；三卡同一模板与状态机；安装、登录在卡片内终端由人执行；WeLink 新增安装与登录探测；CodeHub 补登录探测与账户范围行。
- **不做**：删 Orca 原生其他卡片的代码（Orca 壳照旧）；代填令牌或密码；代按回车；在 BW 里存凭据；`welink-cli` 发群消息的业务接入（项目名片 `[chat]` 的消费是另一件事）；执行工具的 MCP 服务（PR #309 的「外部服务」一节，已撤）；SSH 远端仓库上的安装。
- **相邻**：任务页的 CodeHub 来源（[codehub](../codehub/) 特性）读同一个 `codehub-cli`。任务来源页的 GitLab、Linear、Jira 三行会把人带到被隐藏的卡片（待决 5）。
- **内网补**：CodeHub、WeLink 的安装命令与说明链接；`welink-cli --version` 与 `codehub-cli --version` 是否退出 0（预检靠它判安装）；`welink-cli` 的登录与登录状态命令；两个 CLI 的 `auth status` 退出码含义与它查的是哪个站点。**公共 npm 上同名的 `welink-cli` 不是 WeLink 的 CLI**（是京东前端脚手架，命令名 `welink`），不得作为安装命令。

## 成功判据与待决问题

**判据**：Builder 不离开集成页、不手写命令，就能把三个 CLI 各自从未安装办到已连接；在终端里自己装好、登好的，回到集成页点重新检查即显示已连接；探测超时或出错显示不可用，不显示已连接，也不误报未登录。

**待决（需 gate）**：

1. 集成页只留三张卡：其余六张在 Workbench 壳隐藏、代码不删、Orca 壳不变。
2. 分两节：「代码托管」（GitHub、CodeHub）、「项目群」（WeLink）；节下与页头都不写说明小字。
3. 登录探测按 CLI 静态登记：`gh`、`codehub-cli` 用 `auth status` 的退出码（0 = 已登录；CodeHub 的退出码含义与站点由内网核实）；`welink-cli` 在内网核实前登记为「不报登录状态」，卡片显示「已安装」并给「查看登录状态」。
4. GitHub 卡也改成原地安装与登录（与另两张同模板），而不是保留现在的「跳官网 / 摆命令」。
5. 任务来源页在 Workbench 壳隐藏 GitLab、Linear、Jira 三行（它们的连接入口指向被隐藏的卡片）；已连上的来源不受影响。
