# WeLink CLI 预研

> 给实现团队目录的人读。记录 2026-11-18 在本机 `welink-cli 1.0.18` 上用 `--help` 和仓内现有调用核对过的命令。不是规格，不表示这些命令已经接到 BW，也不表示对神盾局群跑通了读写。命令或缺口变化时更新。

## 已经能用的

身份沿用设置里的 WeLink 登录，不另做 BW 账号。

| 要做什么 | 命令 | 依据 |
|---|---|---|
| 是否已登录、当前 UID | `welink-cli auth status` | 本机 help；未登录时提示 `welink-cli auth login` |
| 登录 | `welink-cli auth login` | 设置集成卡已粘贴这条命令 |
| 已知群号的成员 | `welink-cli im query-group-member --group-id "<群号>"` | 验收订会已用。成员类型含 `TYPE_OWNER` / `TYPE_ADMIN` / `TYPE_NORMAL`；机器人类型要排除 |
| 按关键字搜群 | `welink-cli search group --text "<关键字>"` | help。这是搜索，不是「我加入的全部群」 |
| 当前用户的个人云空间 ID | `welink-cli onebox user-info` | help 写明 `cloudUserId` 是个人空间 ID |
| 列空间里的文件夹和文件 | `welink-cli onebox folder-list --space-id <空间> --folder-id 0` | 上报客户端已分页调用，`--limit` 最大 20 |
| 建文件夹 | `welink-cli onebox folder-new --space-id <空间> --parent <父文件夹> --name "<名>"` | 上报客户端已用来确保报告目录 |
| 上传文件 | `welink-cli onebox file-upload --space-id <空间> --parent <文件夹> <本地路径>` | 成功输出里有 `File ID:` |
| 按文件名找 | `welink-cli onebox node-search --space-id <空间> --name "team.json" --exact-search --file-type file` | help。可加 `--with-path` |
| 下载 | `welink-cli onebox file-download --space-id <空间> --file-id <文件> --output <目录>` | help |
| 文件信息 | `welink-cli onebox file-info --space-id <空间> --file-id <文件>` | help |
| 成员中文名和头像 | `welink-cli contact detail <工号> [<工号> ...]` | 本机 1.0.18 实测：`users[].personAccount` 对应群成员账号，`chineseName` 是姓名，`avatar.custom` 是 120px 头像地址；群成员接口本身不含姓名。头像地址为 `http`，经 301 跳转后返回 `image/jpeg`，`https` 直连在本机因证书主机名不符失败，该探测结果不代表渲染端直接使用原地址；当前实现对匹配地址转换为 w3 face 直连。取证见 [#479 评论](https://github.com/forcegravity1989/builder-workbench/issues/479) |

上报现用的空间是代码里的固定 `WELINK_REPORT_SPACE_ID`，不是团队群空间。落地团队目录时不要复用那个空间。

## 落地团队目录时建议先跑的顺序

群号已知（例如人填入，或本机已经记住）时：

1. `welink-cli auth status`
2. `welink-cli im query-group-member --group-id "<群号>"`，确认当前 UID 在成员里，并用 `TYPE_OWNER` 标群主
3. 拿到该群的 OneBox 空间 ID（见下节缺口）
4. `onebox folder-list` / `node-search` 找 `BW/team.json`
5. 没有则 `folder-new` 建 `BW`，再 `file-upload`；有则 `file-download` 读回，改完再上传

保存前要再列一次或再取文件信息，避免盖掉别人刚写的版本。OneBox 有没有稳定文件版本号，这次 help 没给出。

## 这次没找到的命令

| 产品需要 | 现状 |
|---|---|
| 不给群号，列出当前用户加入的全部分组 | `search group` 要关键字。`im query-recent-conversation` 只是最近会话。没有「我的群列表」 |
| 群号换成群空间 ID | `onebox` 的命令都要 `--space-id`。`user-info` 只给个人空间。help 里没有「由群号取群空间」 |
| 群名随群号一次读回 | 成员命令给成员；群资料命令未在 help 里见到。成员姓名和头像用 `contact detail` 补 |
| 同一文件的并发版本 | 现有上传按 File ID 识别；冲突检测要用内部接口再对一次 |

因此：本机尚未绑定团队时，不能从 CLI 登录态猜该看哪个群。人指定一次群号并记住之后，才能按上表读目录。多个群都有目录时要列出来让人选。
