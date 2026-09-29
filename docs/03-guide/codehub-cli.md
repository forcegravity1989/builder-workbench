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

| 参数 | 含义 |
| --- | --- |
| `-H` / `--host` | 站点。可用别名 `green`、`open`、`yellow`，或完整主机名，例如 `codehub-g.huawei.com` |
| `-p` / `--project` | 项目。可以是 `组/子组/仓库`、项目 ID、克隆地址，或页面 URL |

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
```

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

CodeHub 这边不使用草稿，也不使用 Mark ready。新建 MR 不要加草稿参数。

## 输出

```bash
codehub-cli issue view 12 -p Org/Group/repo -H green -f json
codehub-cli issue view 12 -p Org/Group/repo -H green --json iid,title,state
```

`-f` 可选 `text`、`json`、`yaml`、`tsv`、`quiet`。

## Workbench 任务列表

任务绑定 Orca 登记的 CodeHub 仓库身份。桌面、Web/配对使用同一服务，操作按仓库所属 runtime 路由；SSH 仓库路径不作本机工作目录，WSL 使用项目运行环境中的命令。

列表每个仓库读取最近 250 条，按更新时间从新到旧，界面不再逐次加载。议题搜索在这批结果里按编号、标题、作者和标签筛选。合并请求搜索在回车后交给 `mr list --search`。作者和负责人筛选：议题作用于这批结果，合并请求交给命令行。部分仓库请求失败会显示错误，不能把当前列表当作完整项目任务或指标数据源。

## 这次对接里没有对应命令的能力

这些能力不要对 CodeHub 发请求：文件已读、评论表情、修改已有评论正文、草稿 MR、Mark ready、GitHub Projects 看板、加星。
