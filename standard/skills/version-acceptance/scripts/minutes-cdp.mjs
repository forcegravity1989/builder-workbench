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
      if (!url) {
        throw new Error('new 需要 <url>')
      }
      const query = `/json/new?${encodeURIComponent(url)}`
      const target = await getJson(query, { method: 'PUT' })
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
      if (!targetId || !url) {
        throw new Error('navigate 需要 <targetId> <url>')
      }
      await cdp(targetId, 'Page.enable')
      console.log(JSON.stringify(await cdp(targetId, 'Page.navigate', { url })))
      break
    }
    case 'eval': {
      const [targetId, source] = rest
      if (!targetId || !source) {
        throw new Error('eval 需要 <targetId> <js 或 js 文件路径>')
      }
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
            result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
          }`
        )
      }
      console.log(JSON.stringify(result.result?.value ?? null))
      break
    }
    case 'close': {
      const [targetId] = rest
      if (!targetId) {
        throw new Error('close 需要 <targetId>')
      }
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
