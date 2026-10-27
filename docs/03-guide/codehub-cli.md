# codehub-cli 用法

> 给使用或维护 CodeHub 接入的人读取；本篇说明 CLI 调用、任务列表范围与已接能力，不承载开发规则。命令或用户操作变化时同步；参数以安装版本的 `--help` 为准。

命令行调用 CodeHub。可执行文件名是 `codehub-cli`，需要在 PATH 里。某个子命令的参数用 `codehub-cli <command> --help` 查看。

## 登录

```bash
codehub-cli auth login
codehub-cli auth status
```

也可以用环境变量 `CODEHUB_TOKEN`，或每次加 `-t <token>`。退出登录是 `codehub-cli auth logout`。

## 指定站点和项目

多数写操作都要知道站点和项目。

| 参数               | 含义                                                                                |
| ------------------ | ----------------------------------------------------------------------------------- |
| `-H` / `--host`    | 站点。可用别名 `green`、`open`、`yellow`，或完整主机名，例如 `codehub-g.huawei.com` |
| `-p` / `--project` | 项目。可以是 `组/子组/仓库`、项目 ID、克隆地址，或页面 URL                          |

优先级：`--host` > 环境变量 `CODEHUB_HOST` > 命令里的 URL > 当前 git remote > 默认配置。

在已经克隆好的仓库目录里执行时，可以省略 `-p` 和 `-H`，CLI 会从 git remote 识别。仓库路径有多层组时，`-p` 要保留完整路径，例如 `Org/Group/repo`。

```bash
codehub-cli issue view 12 -p Org/Group/repo -H green
```

## Issue

`<iid>` 是项目内编号，也就是页面上的 `#12`，不是全局 ID。

```bash
codehub-cli issue list -p Org/Group/repo -H green
codehub-cli issue view 12 -p Org/Group/repo -H green
codehub-cli issue create --title "标题" --description "正文" -p Org/Group/repo -H green
codehub-cli issue update 12 --title "新标题" -p Org/Group/repo -H green
codehub-cli issue update 12 --labels "bug,p1" -p Org/Group/repo -H green
```

`--labels` 是整组替换语义：发出的逗号分隔列表就是该议题的全部标签。清空全部标签不能用空字符串——CLI 把 `--labels ""` 当作没传该参数并报「至少要一个更新字段」，要传一个空格 `--labels " "`，服务端修剪后落成空集（2026-10-26 对 szv-open 实测）。填入项目里尚不存在的名字不会报错：保存时 CodeHub 自动把它创建为项目标签（默认蓝色 `#428BCA`，2026-10-26 实测）。

## 项目标签

```bash
codehub-cli project label list -p Org/Group/repo -H green
codehub-cli project label create "bug" --color "#FF0000" -p Org/Group/repo -H green
codehub-cli project label update "bug" --color "#00FF00" -p Org/Group/repo -H green
codehub-cli project label delete "bug" -y -p Org/Group/repo -H green
```

`list` 的 `--limit` 默认只有 10 且不翻页，要拿全量名单必须显式给足（Workbench 取 100）；删除要 `-y` 跳过终端确认。

标签分项目/组两级：`project label list` 只回项目自有标签，组级要用 `group label list` 取；项目标签接口的 `include_ancestor_groups` 参数服务端不认（2026-10-27 实测）。Workbench 标签下拉按用户裁定只取项目级名单，共享组池不进下拉；给议题打组级标签在输入框直接键入名字即可，与项目标签混用一次保存（2026-10-27 实测）。

```bash
codehub-cli group label list Org/Group -H green
```

`api` 子命令发原始请求时端点要自带 `/api/v4/` 前缀，不带会打到网页路由被登录页拦截（2026-10-27 实测）。

评论只有列表、新建、删除，没有修改正文：

```bash
codehub-cli issue comment list 12 -p Org/Group/repo -H green
codehub-cli issue comment create 12 --body "评论内容" -p Org/Group/repo -H green
codehub-cli issue comment delete 12 <comment-id> -p Org/Group/repo -H green
```

关闭和重新打开没有「完成 / 不计划 / 重复」这类原因参数。Workbench 在 CodeHub 上关单时，先写一条评论，再关闭：

```bash
codehub-cli issue comment create 12 --body "关闭原因: completed" -p Org/Group/repo -H green
codehub-cli issue close 12 -p Org/Group/repo -H green
codehub-cli issue reopen 12 -p Org/Group/repo -H green
```

三条关单评论分别是：

- `关闭原因: completed`
- `关闭原因: not planned`
- `关闭原因: duplicate of #42`

`issue close` 等价于 `issue update <iid> --state-event close`。评论失败时不要继续执行 close。

## Merge Request

```bash
codehub-cli mr list -p Org/Group/repo -H green
codehub-cli mr view 8 -p Org/Group/repo -H green
codehub-cli mr create --title "标题" --source-branch feature --target-branch main -p Org/Group/repo -H green
codehub-cli mr merge 8 -p Org/Group/repo -H green
codehub-cli mr close 8 -p Org/Group/repo -H green
```

MR 评论走 `mr review`。`mr review list` 返回 discussion 数组，评论嵌在各 discussion 的 `notes` 里；系统流水（如 changed this line）不是评论：

```bash
codehub-cli mr review list 8 -p Org/Group/repo -H green
codehub-cli mr review create 8 --body "评论内容" -p Org/Group/repo -H green
codehub-cli mr review create 8 --body "这行有边界问题" --path src/main.py --line 42 -p Org/Group/repo -H green
codehub-cli mr review create 8 --body "整段都要改" --path src/main.py --start-line 40 --line 45 -p Org/Group/repo -H green
codehub-cli mr review reply 8 <discussion-id> --body "回复内容" -p Org/Group/repo -H green
codehub-cli mr review delete 8 --note-id <note-id> -p Org/Group/repo -H green
codehub-cli mr review delete 8 --discussion-id <discussion-id> --note-id <note-id> -p Org/Group/repo -H green
```

不带 `--path` 是普通评论；带 `--path` 和 `--line` 是行级 DiffNote，`--start-line` 指多行范围的起始行（行号是新文件侧的真实行号）。DiffNote 需要的 diff_refs 由 CLI 从 MR 详情自动获取，不用额外传提交锚点。行级 DiffNote 走评审接口，服务器要求必填严重级别（`setting review-config` 的 `note_required_attributes.severity`），空值报 CH.00406030；Workbench 默认发最轻的 `suggestion`，界面上不提供级别选择。线程内回复用 `mr review reply`，discussion id 是第二个位置参数（不是 flag）。删除独立 note 只用 `--note-id`；discussion 内的 note 要加 `--discussion-id`。issue 评论没有 discussion 语义。

CodeHub 这边不使用草稿，也不使用 Mark ready。新建 MR 不要加草稿参数。

## 输出

```bash
codehub-cli issue view 12 -p Org/Group/repo -H green -f json
codehub-cli issue view 12 -p Org/Group/repo -H green --json iid,title,state
```

`-f` 可选 `text`、`json`、`yaml`、`tsv`、`quiet`。

## Workbench 任务列表

任务绑定 Orca 登记的 CodeHub 仓库身份。桌面、Web/配对使用同一服务，操作按仓库所属 runtime 路由；SSH 仓库路径不作本机工作目录，WSL 使用项目运行环境中的命令。

列表每个仓库读取最近 250 条，按更新时间从新到旧，界面不再逐次加载。版本入口将 bw:plan:<版本> 标签交给服务端筛选，CLI 自动翻页；多标签为 AND，标签数组为空时不传 --labels。service 多取一条推导 hasMore，超过上限会提示缩小筛选范围，不能把有界结果当全量。议题搜索在这批结果里按编号、标题、作者和标签筛选。合并请求搜索在回车后交给 `mr list --search`。作者和负责人筛选：议题作用于这批结果，合并请求交给命令行。部分仓库请求失败会显示错误，不能把当前列表当作完整项目任务或指标数据源。

### 列表与身份的协议边界

以下契约来自 codehub-cli v1.3.4 内机实测（[PR #455 探测记录](https://github.com/forcegravity1989/builder-workbench/pull/455#issuecomment-6437011738)），应用接线的真实内机旅程仍待复验：

- issue/mr list 的 --labels 在服务端匹配，逗号分隔表示交集；含逗号的标签名无法表达。省略 --state 读取全部状态，不能传字面 all。
- --limit 是条目数；CLI 内部按页自动读取。JSON 为纯数组，没有 total/游标；零匹配为 null、退出0，失败为非零并带错误，二者不能混同。
- list 的 HTTP 缓存默认10秒，保持原生行为。目标引用集合仍逐项完整读取，再做筛选与分页。
- 原生 mine 预设由服务端 scope 解析“我”。目标精确集合的 @me 使用 user view -H <仓库站点> --json id,username,name,state，沿仓库所属 runtime/WSL 执行；身份查询跳过 CLI 缓存，不读取 token。按任务实际 repo 分别比较用户名，不能把本机或另一个站点用户填给它。

## 这次对接里没有对应命令的能力

这些能力不要对 CodeHub 发请求：文件已读、评论表情、修改已有评论正文、草稿 MR、Mark ready、GitHub Projects 看板、加星。
