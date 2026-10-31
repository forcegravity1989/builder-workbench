# 纪要同步：写入会议纪要草稿

> 收到「同步会议纪要」请求、要把材料纪要写入预订会议的纪要草稿时读取。写入只发生在**用户自己的浏览器**里（本机 Chrome/Edge，经 CDP 驱动），**不用 Orca 内置浏览器**，也不依赖宿主已安装的任何外部技能——所需代码与步骤本 reference 自带。只写草稿，最终发送由人在会议系统手动完成。

## 前置：起一个用户浏览器的调试实例

- Node ≥ 22（`node -v` 核对；驱动脚本用原生 WebSocket 与 fetch）。缺 Node 或版本不够，如实请人安装或升级，不降级绕道。
- 找到用户本机的 Chrome 或 Edge 可执行文件；常见路径找不到就问人，不猜：
  - Windows：`C:\Program Files\Google\Chrome\Application\chrome.exe`、`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
  - macOS：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`、`/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`
  - Linux：`google-chrome`、`chromium`、`microsoft-edge`
- 启动一个**独立临时实例**（可见窗口，不用无头模式——人可能需要在窗口里完成登录，最终发送也在这窗口）：
  ```bash
  "<浏览器路径>" --remote-debugging-port=<端口> --user-data-dir="<临时目录>" --no-first-run --no-default-browser-check "about:blank" &
  ```
  端口自选（如 9333），被占用就换一个。**必须用独立临时 user-data-dir**：Chrome 136+ 禁止给日常默认 profile 开调试端口；内网机器上全新 profile 打开 w3 页面会透明走 SSO 自动登录（实测零手工输入），不需要日常 profile 的登录态。窗口保持打开，留给用户完成最终发送。
- 把下面的驱动脚本保存为临时文件（如 `<临时目录>/minutes-cdp.mjs`），先跑 `node minutes-cdp.mjs <端口> version` 验证连接；连不上就核对浏览器进程与端口，不猜。

## 驱动脚本（自包含，落盘即用）

```js
// minutes-cdp.mjs — 极简 CDP 驱动（纪要同步用）。Node ≥ 22（原生 WebSocket 与 fetch）。
// 用法:
//   node minutes-cdp.mjs <port> version
//   node minutes-cdp.mjs <port> new <url>
//   node minutes-cdp.mjs <port> list
//   node minutes-cdp.mjs <port> navigate <targetId> <url>
//   node minutes-cdp.mjs <port> eval <targetId> <js 或 js 文件路径>
//   node minutes-cdp.mjs <port> close <targetId>
// 成功输出 JSON；出错走 stderr 并以非零码退出，不吞错。
import { readFileSync } from 'node:fs'
import process from 'node:process'

const [port, command, ...rest] = process.argv.slice(2)
if (!port || !command) {
  console.error('usage: node minutes-cdp.mjs <port> <version|new|list|navigate|eval|close> [args]')
  process.exit(2)
}
const base = `http://127.0.0.1:${port}`

async function getJson(path, init) {
  const response = await fetch(base + path, init)
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> HTTP ${response.status}`)
  }
  return response.json()
}

async function cdp(targetId, method, params = {}) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${targetId}`)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener(
      'error',
      () => reject(new Error(`无法连接调试端口 ${port}（浏览器未启动或端口不对）`)),
      { once: true }
    )
  })
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} 30 秒无响应`)), 30_000)
      socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data)
        if (data.id === 1) {
          clearTimeout(timer)
          if (data.error) {
            reject(new Error(`${method}: ${data.error.message}`))
          } else {
            resolve(data.result)
          }
        }
      })
      socket.send(JSON.stringify({ id: 1, method, params }))
    })
  } finally {
    socket.close()
  }
}

try {
  switch (command) {
    case 'version': {
      console.log(JSON.stringify(await getJson('/json/version')))
      break
    }
    case 'new': {
      const [url] = rest
      if (!url) throw new Error('new 需要 <url>')
      const query = `/json/new?${new URLSearchParams({ url })}`
      // Chrome 111+ 的 /json/new 只接受 PUT，旧版只接受 GET，两者都试。
      const target = await getJson(query, { method: 'PUT' }).catch(() => getJson(query))
      console.log(JSON.stringify({ targetId: target.id }))
      break
    }
    case 'list': {
      const targets = await getJson('/json/list')
      console.log(
        JSON.stringify(
          targets.map((item) => ({ targetId: item.id, url: item.url, title: item.title }))
        )
      )
      break
    }
    case 'navigate': {
      const [targetId, url] = rest
      if (!targetId || !url) throw new Error('navigate 需要 <targetId> <url>')
      await cdp(targetId, 'Page.enable')
      console.log(JSON.stringify(await cdp(targetId, 'Page.navigate', { url })))
      break
    }
    case 'eval': {
      const [targetId, source] = rest
      if (!targetId || !source) throw new Error('eval 需要 <targetId> <js 或 js 文件路径>')
      // 参数是已存在的文件路径则读文件，否则按内联 JS 执行。
      let expression = source
      try {
        expression = readFileSync(source, 'utf8')
      } catch {
        // 不是文件路径，按内联 JS 用。
      }
      const result = await cdp(targetId, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      })
      if (result.exceptionDetails) {
        throw new Error(
          `页面脚本异常: ${
            result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text
          }`
        )
      }
      console.log(JSON.stringify(result.result?.value ?? null))
      break
    }
    case 'close': {
      const [targetId] = rest
      if (!targetId) throw new Error('close 需要 <targetId>')
      const response = await fetch(`${base}/json/close/${targetId}`)
      if (!response.ok) {
        throw new Error(`close ${targetId} -> HTTP ${response.status}`)
      }
      console.log(JSON.stringify({ closed: true }))
      break
    }
    default:
      throw new Error(`未知命令 ${command}`)
  }
} catch (error) {
  console.error(String(error?.message ?? error))
  process.exit(1)
}
```

命令面：`version` 验证连接；`new <url>` 开新标签页并回 `targetId`；`list` 列标签页（按 url/title 认页，忽略扩展后台页）；`navigate` 导航；`eval` 在页面里执行 JS 并回 JSON 结果（参数是已存在的文件路径则读文件，复杂脚本先落盘再 `eval`，避免 shell 引号问题）；`close` 关标签页。导航后页面是异步加载的：用 `eval` 轮询 `document.readyState` 与目标元素，就绪再操作。出错如实转告 stderr 内容，不吞错、不重试掩盖。

## 写入流程

1. **定位会议**：打开验收材料 `meeting.link`（`new` + `navigate`）；页面打不开或对不上本次会议（标题/时间与材料不符）时，用 `welink-cli meeting info --meeting-id <meeting.id>` 重新取一条链接再开；仍找不到就请人从 eMeeting 复制该会议的链接，不猜 URL。
2. **登录**：页面跳到登录页且几秒内没有自动跳回，就请人在刚打开的浏览器窗口里完成登录，完成后刷新页面继续；登录无需重启浏览器或调试端口。
3. **读当前状态**：用 `eval` 探索页面（先 `document.title`，再找会议详情与纪要入口），进入该会议的纪要草稿区，读出当前草稿内容。页面结构以实际 DOM 为准，不预设选择器；找不到纪要入口就如实描述页面结构请人指路，不乱点。
4. **完整预览**：向人呈现——目标会议（标题、时间、会议号，与页面对照）、将写入的草稿全文（按目标分节的固定样式）、当前草稿已有内容与处理方式（覆盖/追加/跳过）、执行动作（只写草稿，不发送）。**经人确认后才写入**；预览有变化原确认失效。
5. **写入**：把草稿内容写入纪要草稿区（复杂脚本先落盘再 `eval`）；只写纪要草稿，不点任何发送/发布类按钮，不动会议信息与其他会议。
6. **回读核对**：写入后重新读草稿区，确认与预览一致；把会议页面链接返回给用户，提醒**最终发送是人在这个窗口里手动完成**。
7. **幂等**：已写入且草稿未变化的重复请求直接跳过、不重复写入；草稿或目标会议有变化时不盲覆盖，先向人说明差异再按新预览确认。
8. **中断**：写入中断或状态不确定时，重新打开该会议页核对草稿是否已写入，不直接重试覆盖。

## 边界

- 只写**该会议的纪要草稿**；不代发、不改会议、不碰其他会议。
- 每次外部写入前都有完整预览与人的确认。
- 调试实例、临时 profile、端口都是本流程自己开的；结束后窗口留给用户完成发送，由用户关闭，不替人关。
- 会议系统页面结构可能变化：以实际 DOM 为准，探索失败如实报告，不虚构选择器。
