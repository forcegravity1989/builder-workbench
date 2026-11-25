# bw-share — 自建 HTML 分享服务

> **30 秒导读**：Workbench 把本地 HTML 报告传到这里，拿回一条不猜不中的链接发给同事浏览器直接打开。它是替代 Orca 云端 artifacts 的自管服务，零运行时依赖、纯 Node 标准库、文件落盘。看接口读「HTTP 接口」，装机读「部署」，调参读「配置」。

## 维护约定

- **读者与时机**：部署和维护这台服务的开发者；首次装机、排查、升级前读。
- **职责与边界**：只写接口契约、运行配置、部署步骤、数据与运维要点。Workbench 客户端怎么接入不在此篇。
- **更新触发**：接口形状、环境变量、部署方式或安全边界变化时更新；变更记录进 commit/PR。

## 它做什么

- 上传一份 HTML（`text/html`），返回一条分享链接和一个编辑令牌。链接里的 ID 是 128 位随机值，不可枚举。
- 任何人打开链接就能读到这份 HTML，不需要登录、不需要 Workbench 在线。`/s/:id` 打开的是查看页：原始内容在沙箱 iframe 里展示，旁边是批注面板；`/s/:id/raw` 仍是与上传内容逐字节一致的原始 HTML。
- 批注：任何打开查看页的人（无需账号）都能添加页面级或元素级批注，所有查看者可见；作者凭查看页发的删除令牌删自己的批注，分享者凭编辑令牌可删任意批注（见「HTTP 接口」的删除路由）。
- 持有编辑令牌的人可以覆盖内容或删除。令牌只在创建时返回一次，服务端只存它的 sha256。
- 新建分享要带 `x-upload-token`。Workbench 客户端首次分享时用内置的登记密钥换取本机专属令牌，之后一直复用；服务端只保存令牌的 sha256。改和删只认各自分享的编辑令牌，不受上传令牌影响。
- 例外：实例既没配置静态上传令牌、注册表里也没有任何设备令牌时，写入暂时开放（启动日志会给出警告）；第一个设备登记或配置静态令牌后即要求令牌。**吊销全部设备会回到这个状态**，见「数据与备份」。
- 这条例外只适用于「注册表文件不存在」。「注册表存在但不可信」——读不出来、损坏、截断、被改成别的形状、来自更新版本的写入，**或形状合法却一条可用令牌都不剩**（被清空、或所有 hash 都非法）——都不算全新实例：服务照常启动、继续提供链接查看，**已有分享的覆盖与删除也照常**（它们只认各自的编辑令牌，不依赖注册表），但**新建分享与设备登记**一律返回 503 `registry_unavailable`，日志会点名该文件。恢复方式：修好或删掉该文件后**重启服务**（判定只在启动时做一次，不自动重读）；删掉即主动接受上面那条开放姿态。注册表本身也走 fsync 落盘，断电不会留下零长文件把服务变成匿名可写。
- 到期自动清理，默认 30 天。

### 写入权限的真实边界

登记密钥编译在 Workbench 客户端里，也写在 `src/config.mjs` 的 `DEFAULT_ENROLL_KEY`，而本仓库是公开的。所以它能挡住的只是「不知道这套协议的无关网络客户端」，**挡不住任何能读到本仓库的人**：真实边界等于「网络可达即可登记、即可写入」。据此部署：

- 只把服务暴露在内网，或放在要求身份的前置代理后面；不要因为「有登记密钥」而暴露到公网。
- 想要一台不认公开密钥的实例，就把 `BW_SHARE_ENROLL_KEY` 设成自己的值——但已发布的 Workbench 客户端仍带内置密钥，会全部登记失败。目前没有「既锁死登记、又能用出货客户端」的配置，两者只能选一。
- 写入没有配额：单 IP 默认 30 次写/分钟 × 单份最大 10 MiB ≈ 300 MiB/分钟，约一小时就能写满一块 20 GB 盘，且默认保留 30 天才回收。把磁盘水位纳入运维告警，必要时调低 `BW_SHARE_RATE_LIMIT`、`BW_SHARE_MAX_BYTES` 或 `BW_SHARE_RETENTION_DAYS`。
- 打开链接不需要任何凭据，谁能读到内容同样由网络可达范围决定。`/s/:id` 查看页是服务端可信页面（批注面板与批注 API 同源）；被分享的内容在 `CSP: sandbox` 的不透明源 iframe 里运行，拿不到本服务的 origin、Cookie 或存储，但仍能执行脚本并向站外发请求——批注写入的 `application/json` 校验挡住它向自己链接灌批注（见「HTTP 接口」）。

单个 HTML 文件，不打包相对路径资源。与 Orca 现有 artifacts 的限制一致：带外链 `<img>`、`<link>` 的报告要么内联，要么改用绝对地址。

## HTTP 接口

| 方法与路径                                | 用途        | 请求头                             | 成功响应                              |
| ----------------------------------------- | ----------- | ---------------------------------- | ------------------------------------- |
| `GET /healthz`                            | 存活检查    | —                                  | `200 {"status":"ok","time":"..."}`    |
| `POST /api/client-tokens`                 | 登记设备    | `x-enroll-key`                     | `201 {token, createdAt}`              |
| `POST /api/shares`                        | 新建分享    | `x-upload-token`                   | `201 {id, url, editToken, expiresAt}` |
| `PUT /api/shares/:id`                     | 覆盖内容    | `x-edit-token`                     | `200 {id, url, expiresAt, updatedAt}` |
| `DELETE /api/shares/:id`                  | 删除        | `x-edit-token`                     | `204`                                 |
| `GET /s/:id`                              | 打开查看页  | —                                  | `200 text/html`                       |
| `GET /s/:id/raw`                          | 原始 HTML   | —                                  | `200 text/html`                       |
| `GET /s/:id/content`                      | 内容+批注桥 | —                                  | `200 text/html`                       |
| `GET /api/shares/:id/annotations`         | 批注列表    | —                                  | `200 {items:[...]}`                   |
| `POST /api/shares/:id/annotations`        | 添加批注    | `content-type: application/json`   | `201 {annotation, deleteToken}`       |
| `DELETE /api/shares/:id/annotations/:aid` | 删除批注    | `x-delete-token` 或 `x-edit-token` | `204`                                 |

创建与更新的请求体：

```json
{ "content": "<!doctype html>...", "fileName": "report.html", "title": "可选标题" }
```

- `contentType` 只接受 `text/html`，其他类型返回 `415`。Markdown 由客户端先渲染成 HTML 再上传。
- 请求体上限按 6 倍 JSON 转义冗余放宽（10 MiB 内容最多可占 61 MiB 传输体）；判定仍以解码后的内容字节数为准，超过 `BW_SHARE_MAX_BYTES` 返回 `413`。
- `title` 最长 200 字符，`fileName` 最长 255 字符且不能含控制字符。
- 分享页带 `Content-Security-Policy: sandbox allow-scripts ...`，报告里的脚本能跑，但拿不到本服务的 origin、Cookie 或存储。可加载的内容一律 `nosniff`、`no-store`、`no-referrer`。

批注接口的补充说明：

- `POST` 请求体：`{"author":"名字（可空，空则匿名）","text":"批注内容","target":{"selector":"#btn","text":"元素摘要","rect":{"x":0,"y":0,"width":0,"height":0}}}`；`target` 可省略（页面级批注）。文字上限 2000 字符、作者名 50、selector 500、元素摘要 200；元素摘要可为空字符串（图标、图片、svg 等无文本元素），但字段须为字符串。批注内容本身不可为空。单链接批注上限 500 条，写满返回 409 `annotations_full`。
- `POST` 必须带 `content-type: application/json`，否则 `415`。这不只是契约：沙箱里的被分享内容发不出这个类型的跨域请求（预检不被允许），`text/plain` 简单请求又被 `415` 挡下——被分享的 HTML 灌不了自己链接的批注。
- 删除批注双路径：作者用查看页发的 `x-delete-token`（服务端只存哈希）；**分享者/运维用编辑令牌直调** `curl -X DELETE .../annotations/<aid> -H 'x-edit-token: <编辑令牌>'` 可删任意批注——这是清理滥用批注的运维入口，BW CLI 本期不加命令。
- 批注随链接删除或过期一起消失；覆盖内容不影响批注（selector 失效的元素级批注在查看页加载/刷新时经桥主动探测并标注「元素已变化」，文字保留）。
- `GET /s/:id` 是查看页（批注面板 + 沙箱 iframe），`GET /s/:id/content` 在原始内容后追加批注桥脚本（content-length 覆盖两者），`GET /s/:id/raw` 与上传内容逐字节一致。

`POST /api/client-tokens` 用登记密钥换一枚随机上传令牌（256 位），返回明文一次，服务端只落 sha256；同一设备不应重复登记。登记密钥编译在 Workbench 客户端里，只用于挡住无关网络客户端自行发令牌，不是抵御能读仓库的人的机密（见「写入权限的真实边界」）。换 `BW_SHARE_ENROLL_KEY` 只阻止新登记，已签发的设备令牌继续可用；`BW_SHARE_ENROLL_KEY` 留空则回落到客户端内置的公开默认值，即登记无法关闭。要撤销全部已登记设备，停止服务、删除 `<dataDir>/client-tokens.json` 再启动（客户端下次分享会重新登记）——**删完注册表后实例又回到「无静态令牌且无设备令牌」的匿名可写状态**，要同时设 `BW_SHARE_UPLOAD_TOKEN` 才能一直保持要求令牌。注册表只增不减（无过期、无淘汰），满 5000 条后登记持续返回 503 `enrollment_full`，需运维清理文件才恢复。

错误统一为 `{"error":{"code":"...","message":"..."}}`。常见码：`bad_request`、`unauthorized`、`forbidden`、`not_found`、`too_large`、`unsupported_media_type`、`rate_limited`、`method_not_allowed`，以及三个 503：`busy`（在途上传占满 64 MiB 内存预算，或目标分享正被读取导致本次覆盖失败——两者重试即可）、`enrollment_full`（设备令牌注册表已满，重试无效，需运维清理文件）与 `registry_unavailable`（注册表读不出来：新建分享与登记被拒，改删已有分享不受影响；需运维修复或删除该文件后**重启**）。

## 本地试跑

Node.js ≥ 22.9，不需要 `pnpm install`。把 `.env.example` 复制成 `.env` 后直接启动，启动脚本会自动加载它：

```bash
cd services/bw-share
node --env-file-if-exists=.env src/main.mjs
```

```bash
curl -s localhost:8787/api/shares \
  -H 'content-type: application/json' \
  -d '{"content":"<h1>hi</h1>","fileName":"hi.html"}'
```

Windows 上不要用 `VAR=x cmd` 的 POSIX 前缀写法和 `pnpm exec`；前者在 cmd.exe 下不生效，后者会触发根仓 postinstall。

## 配置

全部通过环境变量，`.env.example` 可直接复制。数值越界、布尔值含糊或 `PUBLIC_BASE_URL` 不是 http(s) 绝对地址时启动即报错，不静默降级。

| 变量                       | 默认      | 含义                                                                                                                               |
| -------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `BW_SHARE_HOST`            | `0.0.0.0` | 监听地址                                                                                                                           |
| `BW_SHARE_PORT`            | `8787`    | 监听端口                                                                                                                           |
| `BW_SHARE_DATA_DIR`        | `./data`  | 数据目录，权限 0700；相对路径按工作目录解析                                                                                        |
| `BW_SHARE_ENROLL_KEY`      | 内置值    | 换发设备令牌的登记密钥；必须与客户端编译值一致，修改只影响后续登记，不撤销已签发令牌。留空即用客户端内置的公开默认值，登记无法关闭 |
| `BW_SHARE_UPLOAD_TOKEN`    | 空        | 额外的共享上传令牌（手工运维/脚本用）；设备登记令牌独立生效。**设了它，写入就一直要求令牌**，不会因为注册表被清空而回到匿名可写    |
| `BW_SHARE_PUBLIC_BASE_URL` | 空        | 生成链接用的外网地址，可带路径前缀（反代需去掉前缀，见 nginx 示例）；为空时按请求 Host 推导                                        |
| `BW_SHARE_MAX_BYTES`       | 10 MiB    | 单份内容上限                                                                                                                       |
| `BW_SHARE_RETENTION_DAYS`  | 30        | 保留天数，`0` 表示不过期                                                                                                           |
| `BW_SHARE_RATE_LIMIT`      | 30        | 每 IP 每分钟写请求数，`0` 关闭                                                                                                     |
| `BW_SHARE_TRUST_PROXY`     | `false`   | 反代后面部打开，才信任 `X-Forwarded-For/Proto/Host`                                                                                |

## 部署

Node 22.9+ 自带 `fetch`、`node:test` 和 `--env-file-if-exists`，服务无依赖，部署就是把 `services/bw-share` 拷过去。

1. 建服务账号：`useradd --system --no-create-home bwshare`。
2. 拷贝代码到 `/opt/bw-share`，把环境变量写到 `/etc/bw-share.env`（权限 0600），务必设 `BW_SHARE_PUBLIC_BASE_URL`；`BW_SHARE_ENROLL_KEY` 留空即用客户端内置值。不要设 `BW_SHARE_DATA_DIR`：unit 里默认 `/var/lib/bw-share`，由 systemd 的 `StateDirectory` 建好并授权。
3. 安装 [`deploy/bw-share.service`](deploy/bw-share.service) 到 `/etc/systemd/system/`，`systemctl enable --now bw-share`。
4. 前面挂 Nginx：参考 [`deploy/nginx.conf.example`](deploy/nginx.conf.example)，`BW_SHARE_TRUST_PROXY=true`，`client_max_body_size` 至少 64 MB（10 MiB 内容经 JSON 转义后传输体可达 60 MiB，反代低于这个值会先于服务返回自己的 413 页面）。服务把 `X-Forwarded-For` 的**最右一项**当作限流键，即受信任代理实际看到的对端：单层代理下用 `$remote_addr` 覆盖或用 `$proxy_add_x_forwarded_for` 追加都安全；多层代理则每层追加、只信任最后一跳，否则所有用户会共用最内层代理这一个限流键。
5. 验证：`curl -f localhost:8787/healthz`；再真实上传一份、在另一台机器打开链接。

容器部署同样可行：单进程、无依赖、数据目录挂卷即可。

### 数据与备份

`<dataDir>/<id>.html` 存内容，`<id>.json` 存元数据和令牌哈希，`<id>.annotations.json` 存该链接的批注（含删除令牌哈希，随链接删除或过期一起被清理任务回收），`<dataDir>/client-tokens.json` 存已登记设备令牌的哈希（上限 5000 条，只增不减，满后登记持续返回 503 `enrollment_full`，需运维处理）。**要清空注册表请删除整个文件**，删前先设 `BW_SHARE_UPLOAD_TOKEN`，否则删除会让写入回到匿名可写；**不要改成空的 `tokens` 数组**——文件存在却没有任何可用令牌会被判为不可信，新建与登记一律拒绝，直到删掉它或恢复内容并重启。写入走临时文件 + fsync + rename，断电不会留半份文件，注册表与分享文件用的是同一套写入。备份直接打包数据目录；恢复后链接和编辑令牌继续有效（令牌哈希随文件走）。到期文件由每小时一次的清理任务删除，服务重启时也清理一次，但**没有总量配额**：写入速度由限流和单份上限决定，磁盘水位要自己告警。

不要手工编辑 `<id>.json`：元数据一旦不能描述一个可用分享（缺令牌哈希、过期时间无法解析等），该链接按不存在处理（读取与改删都返回 404，客户端据此重建链接），文件也会被清理任务回收。内容以 `<id>.html` 为准，服务时长度与字节取自同一个打开的文件描述。早期版本会把损坏的注册表改名为 `client-tokens.json.corrupt-<时间戳>` 留档，现行版本改为原地保留并拒绝新建与登记；清理任务不回收这些历史留档文件，重新部署后可手工删除。

## 资源预估

单进程 Node，空闲常驻内存约 50–70 MB。打开分享是流式直出，不把整份报告读进内存。上传峰值取决于 JSON 体积：普通 HTML 约为原文件的两倍，转义字符极多时最高 6 倍；同时在途的上传总内存限制在 64 MiB，超出时新上传收到 `busy` 而不是拖垮进程。文件大小随报告体积走，一份 HTML 通常 0.2–5 MB。请求超时 120 秒（头部 15 秒），为 60 MiB 量级的传输体留足时间；客户端自己的超时可能更短，慢链路上以先到者为准。

| 场景                           | CPU  | 内存 | 磁盘  |
| ------------------------------ | ---- | ---- | ----- |
| 十几人小团队（每月几百次分享） | 1 核 | 1 GB | 20 GB |
| 几十人、偶尔并发上传大报告     | 2 核 | 2 GB | 20 GB |

网络只按响应体积计费；打开分享是静态文件直出，基本不消耗 CPU。磁盘按 `份数 × 平均体积 × 保留天数内新增` 估，配合默认 30 天清理无需扩容。

## 测试

```bash
cd services/bw-share && node --test "test/*.test.mjs"
```

用 `*.test.mjs` glob 与 CI 一致：`test/helpers.mjs` 是共享夹具，不是用例，裸 `node --test` 会把它当作一个 0 例文件计入总数。

覆盖配置解析、载荷校验、存储（令牌哈希、过期清理、并发写、临时文件回收、元数据不可用按缺失处理并可被清理回收、长度与实际流出的字节同源、读取未结束时更新不产生文件系统错误、读完与中途中止都释放句柄）、设备登记（拒错密钥、只落哈希、重载后仍生效、注册表损坏/截断/形状不对/未知版本时拒绝新建与登记而非退回匿名、损坏时仍可读链接且静态令牌仍可用、无注册表的全新实例仍开放写入、注册表满返回 `enrollment_full`）、HTTP 全链路（鉴权、限流与伪造 `X-Forwarded-For` 前缀、413/415/405、CSP、HEAD、公网地址推导、trustProxy、过期 404、并发读写不出现 500 与长度不一致）、批注（存储层：字段校验与上限、空元素摘要（图标/图片/svg）接受、删除令牌哈希比对、随链接删除连带清理、损坏文件读空写治愈；HTTP 层：列表/写入/删除往返、作者与分享者双删除权限、content-type 校验（大小写不敏感）、空摘要元素批注、限流共享（含删除）、过期分享 404、清理任务回收孤儿批注文件、HEAD 查看页/内容/原始、查看页转义与桥注入、viewer `frame-ancestors 'none'` 禁框）。CI 在 PR 上跑同一套（`node --test "services/bw-share/test/*.test.mjs"`）。接口改动先改测试。
