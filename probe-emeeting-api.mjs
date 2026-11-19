#!/usr/bin/env node
/**
 * probe-emeeting-api.mjs — eMeeting API 取稿方案加固的事实探测（关联 #678 后续、见加固 Issue）
 *
 * 在有内网连通的开发机上运行（检视机无 w3 DNS，跑不了）。回答三个决定加固设计的事实问题：
 *   Q1 证书信任：node 默认信任库 / node --use-system-ca / Chromium（页面导航）/
 *      Playwright context.request 四条路径对 w3.huawei.com 的 TLS 校验结果
 *      → 决定 H2 修复形态（浏览器内 HTTP vs 仅恢复默认校验）。
 *   Q2 多录制完整性：recordSummary 整场导出对多录制场次会议（5DAB2173，2 场）返回
 *      合并全文、单场还是报错；详情 JSON 是否暴露录制清单结构（能否按场恢复 --recording）。
 *   Q3 内容结构：导出正文是否含 HH:MM 时间戳；B9FA20DB 与既有证据
 *      （9208 字符 / SHA-256 87b5f8f3…b0c1）比对。
 *
 * 用法（在本分析分支的工作树根部，node_modules 可解析 playwright-core）：
 *   node probe-emeeting-api.mjs --meetings <32hex>[,<32hex>...] [--headful-ok] [--profile <dir>] [--out <dir>] [--repo <worktree>]
 *
 *   --meetings  默认 B9FA20DB4AB676C5B25E55A71DA7E814。5DAB2173 的完整 32 位 ID 从开发机
 *               第一轮验证输出 .bw-tmp/meeting-transcript-5DAB2173*.json 的 meetingId 字段读回。
 *   --headful-ok 允许无界面 SSO 未完成时弹出可见 Chrome 窗口人工登录（默认不弹，直接中止并提示）。
 *   --profile   Chrome 专属配置目录。默认：设了 ORCA_USER_DATA_PATH 用其下 emeeting-chrome-profile
 *               （第三轮 E2E 的既有登录态，最快）；否则 ~/.emeeting-probe-profile（冷启动）。
 *   --out       输出目录，默认 ./probe-out。
 *
 * 输出：--out 下 results.json、<meeting>-detail.json、<meeting>.docx、<meeting>-transcript.txt；
 * 终端打印逐问题摘要。不打印、不落盘任何 Cookie 值。
 * 探测结束后专属 Chrome 会被关闭；冷启动 profile 会留在 --profile 目录（含登录态，属机制设计内）。
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const argv = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt
}
const flag = (name) => argv.includes(`--${name}`)

const W3 = 'https://w3.huawei.com'
const DETAIL_PATH = 'emeeting/server/api/weteam/meeting/v1'
const EXPORT_PATH = 'emeeting/server/api/weteam/meeting/export/recordSummary'
const detailUrl = (id) => `${W3}/${DETAIL_PATH}/${id}/detail`
const summaryUrl = (id) => `${W3}/emeeting/#/aiSummary/${id}/4`
const exportUrl = () => `${W3}/${EXPORT_PATH}`

const MEETINGS = String(opt('meetings', 'B9FA20DB4AB676C5B25E55A71DA7E814'))
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter((s) => /^[A-F0-9]{32}$/.test(s))
if (MEETINGS.length === 0) {
  console.error('--meetings 需要至少一个 32 位十六进制会议 ID')
  process.exit(2)
}
const OUT = resolve(String(opt('out', 'probe-out')))
const REPO = resolve(String(opt('repo', '.')))
const HEADFUL_OK = flag('headful-ok')
const PROFILE_DIR =
  String(opt('profile', '')) ||
  (process.env.ORCA_USER_DATA_PATH
    ? join(process.env.ORCA_USER_DATA_PATH, 'emeeting-chrome-profile')
    : join(homedir(), '.emeeting-probe-profile'))

// 既有证据（PR #689 第三轮主验证，B9FA20DB）：用于 Q3 比对
const KNOWN = {
  B9FA20DB4AB676C5B25E55A71DA7E814: {
    characters: 9208,
    sha256: '87b5f8f306babbd9c6ea901051dd75dc9cc17c57bb0f7abe9603fb62fa96b0c1'
  }
}

const log = (...a) => console.log(...a)
const results = {
  probe: 'probe-emeeting-api.mjs v1',
  at: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  profileDir: PROFILE_DIR,
  meetings: MEETINGS
}

// ---------- Q1a/Q1b：node 信任库 ----------
function nodeTlsProbe(extraArgs) {
  const code = [
    "require('https').get('https://w3.huawei.com/', { timeout: 15000 }, (res) => {",
    "  console.log(JSON.stringify({ ok: true, status: res.statusCode })); res.resume();",
    "}).on('error', (e) => {",
    "  console.log(JSON.stringify({ ok: false, code: String(e.code || ''), message: String(e.message).slice(0, 200) }));",
    '})'
  ].join('')
  const r = spawnSync(process.execPath, [...extraArgs, '-e', code], {
    encoding: 'utf8',
    timeout: 40_000
  })
  const line = (r.stdout || '').trim().split('\n').pop() || ''
  try {
    return JSON.parse(line)
  } catch {
    return {
      ok: false,
      code: 'probe-error',
      message: ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 300)
    }
  }
}

// ---------- 内联 DOCX 解析（与 src/cli/workbench-meeting/docx.ts 同逻辑的 plain JS 版） ----------
function readZipEntry(archive, wanted) {
  const END_MIN = 22
  const END_MAX_SEARCH = 66_000
  let end = -1
  for (
    let offset = archive.length - END_MIN;
    offset >= Math.max(0, archive.length - END_MAX_SEARCH);
    offset--
  ) {
    if (archive.readUInt32LE(offset) === 0x06054b50) {
      end = offset
      break
    }
  }
  if (end < 0) throw new Error('DOCX 缺少 ZIP 目录结构')
  const count = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  for (let i = 0; i < count; i++) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('DOCX ZIP 目录损坏')
    }
    const method = archive.readUInt16LE(offset + 10)
    const csize = archive.readUInt32LE(offset + 20)
    const nameLen = archive.readUInt16LE(offset + 28)
    const extraLen = archive.readUInt16LE(offset + 30)
    const commentLen = archive.readUInt16LE(offset + 32)
    const localOff = archive.readUInt32LE(offset + 42)
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLen)
    if (name === wanted) {
      if (localOff + 30 > archive.length || archive.readUInt32LE(localOff) !== 0x04034b50) {
        throw new Error('DOCX ZIP 条目损坏')
      }
      const dataOff = localOff + 30 + archive.readUInt16LE(localOff + 26) + archive.readUInt16LE(localOff + 28)
      if (dataOff + csize > archive.length) throw new Error('DOCX ZIP 条目被截断')
      const data = archive.subarray(dataOff, dataOff + csize)
      return method === 0 ? data : inflateRawSync(data)
    }
    offset += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`DOCX 缺少 ${wanted}`)
}

function docxXmlToText(xml) {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (_, n) =>
      ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[n]
    )
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 导出载荷（与 src/cli/workbench-meeting/api.ts 同逻辑）
const UTC8 = 8 * 3600 * 1000
const DAY = 24 * 3600 * 1000
function utc8DayRange(startTime) {
  const local = new Date(startTime + UTC8)
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - UTC8
  return { startTime: start, endTime: start + DAY - 1000 }
}
function exportPayload(id, detail) {
  const local = new Date(detail.startTime + UTC8)
  const date = `${local.getUTCFullYear()}${String(local.getUTCMonth() + 1).padStart(2, '0')}${String(local.getUTCDate()).padStart(2, '0')}`
  const range = utc8DayRange(detail.startTime)
  return {
    languageType: 'Original',
    meetingNum: id,
    startTime: range.startTime,
    endTime: range.endTime,
    subject: `${date}-${detail.subject}-语音转文字`,
    type: 'speakText'
  }
}

// 收集含 record/file/segment 的键路径（判断详情 JSON 是否暴露录制清单）
function recordingishKeys(value, prefix = '', depth = 0, acc = []) {
  if (depth > 6 || acc.length >= 40 || !value || typeof value !== 'object') return acc
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (/record|file|segment/i.test(k)) {
      acc.push({ path, type: Array.isArray(v) ? `array(${v.length})` : typeof v })
    }
    if (v && typeof v === 'object') recordingishKeys(v, path, depth + 1, acc)
  }
  return acc
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  mkdirSync(OUT, { recursive: true })
  log(`== eMeeting API 探测 == node ${process.version} @ ${process.platform}`)
  log(`profile: ${PROFILE_DIR}`)
  log(`out: ${OUT}`)

  // ---- S1: node 信任库探测（兼作内网连通性预检）----
  log('\n-- Q1a: node 默认信任库 GET https://w3.huawei.com/ --')
  results.nodeDefaultTls = nodeTlsProbe([])
  log(JSON.stringify(results.nodeDefaultTls))
  const dnsDead =
    !results.nodeDefaultTls.ok && /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(results.nodeDefaultTls.message || results.nodeDefaultTls.code || '')
  if (dnsDead) {
    log('!! 无法解析 w3.huawei.com —— 本机无内网连通，请在开发机运行本探测。中止。')
    results.abort = 'no-intranet-dns'
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
    process.exit(4)
  }
  log('-- Q1b: node --use-system-ca --')
  results.nodeSystemCaTls = nodeTlsProbe(['--use-system-ca'])
  log(JSON.stringify(results.nodeSystemCaTls))

  // ---- S2: Playwright 专属配置启动（真实 Chrome）----
  let chromium
  try {
    ;({ chromium } = createRequire(join(REPO, 'package.json'))('playwright-core'))
  } catch (error) {
    log(`!! 无法从 ${REPO} 解析 playwright-core：请在分析分支工作树根部运行或 --repo 指定。`)
    throw error
  }
  log(`\n-- S2: headless 启动系统 Chrome（channel:'chrome'）--`)
  let context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: true,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check']
  })
  results.chromiumLaunch = 'ok'

  const authedDetail = async (page, id, deadlineMs) => {
    while (Date.now() < deadlineMs) {
      if (!page.url().startsWith(W3)) {
        await sleep(1500)
        continue
      }
      try {
        const r = await page.evaluate(async (u) => {
          const res = await fetch(u, { credentials: 'include' })
          const text = await res.text()
          return { status: res.status, finalUrl: res.url, body: text.slice(0, 4_000_000) }
        }, detailUrl(id))
        if (r.status === 200 && !/login\.huawei\.com/i.test(r.finalUrl)) {
          try {
            const parsed = JSON.parse(r.body)
            if (parsed && (parsed.code === 200 || parsed.response || parsed.data)) return parsed
          } catch {
            /* 非 JSON：未认证或网关页，继续轮询 */
          }
        }
      } catch {
        /* 页面导航中 evaluate 可能失败，继续轮询 */
      }
      await sleep(1500)
    }
    return null
  }

  let page = context.pages()[0] || (await context.newPage())
  await page.goto(summaryUrl(MEETINGS[0]), { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})
  log('等待 SSO（headless，40s 预算）…')
  let detail0 = await authedDetail(page, MEETINGS[0], Date.now() + 40_000)
  results.silentSsoSeconds = null
  if (!detail0 && !HEADFUL_OK) {
    log('!! headless SSO 未完成且未允许弹窗。加 --headful-ok 重跑以人工登录，或检查 XGate。中止。')
    results.abort = 'sso-not-completed-headless'
    await context.close().catch(() => {})
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
    process.exit(3)
  }
  if (!detail0) {
    log('headless 未完成，转可见窗口人工登录（5 分钟预算）…')
    await context.close().catch(() => {})
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: null,
      args: ['--no-first-run', '--no-default-browser-check']
    })
    page = context.pages()[0] || (await context.newPage())
    await page.goto(summaryUrl(MEETINGS[0]), { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {})
    detail0 = await authedDetail(page, MEETINGS[0], Date.now() + 5 * 60_000)
    results.headfulLoginUsed = true
    if (!detail0) {
      results.abort = 'sso-not-completed-headful'
      await context.close().catch(() => {})
      writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
      process.exit(3)
    }
  }
  log('SSO 认证完成（详情接口可读）。')

  // ---- S3: context.request 的 TLS/cookie 行为（H2 备选实现路径）----
  log('\n-- Q1c: Playwright context.request（APIRequestContext）--')
  try {
    const resp = await context.request.get(detailUrl(MEETINGS[0]))
    const text = await resp.text()
    let parsed = null
    try { parsed = JSON.parse(text) } catch {}
    results.contextRequest = { ok: true, status: resp.status(), jsonCode: parsed?.code ?? null }
  } catch (error) {
    results.contextRequest = { ok: false, message: String(error.message || error).slice(0, 300) }
  }
  log(JSON.stringify(results.contextRequest))

  // ---- S4: 逐会议详情 + 导出 ----
  results.meetingResults = {}
  for (const id of MEETINGS) {
    log(`\n-- 会议 ${id} --`)
    const entry = {}
    let detail = id === MEETINGS[0] ? detail0 : null
    if (!detail) {
      detail = await authedDetail(page, id, Date.now() + 20_000)
    }
    if (!detail) {
      entry.error = 'detail-unavailable'
      results.meetingResults[id] = entry
      log('!! 详情不可读，跳过该会议')
      continue
    }
    writeFileSync(join(OUT, `${id}-detail.json`), JSON.stringify(detail, null, 2))
    const body = detail.response ?? detail.data ?? detail
    const meetingTime = body.meetingTime ?? {}
    const subject = String(body.subject ?? '')
    const startTime = Number(meetingTime.meetingStartTime ?? body.meetingStartTime ?? 0)
    entry.subject = subject
    entry.startTime = startTime
    entry.recordingishKeys = recordingishKeys(body)
    log(`主题「${subject}」 startTime=${startTime}`)
    log(`录制相关键: ${JSON.stringify(entry.recordingishKeys)}`)

    if (!startTime) {
      entry.error = 'no-startTime'
      results.meetingResults[id] = entry
      continue
    }
    const payload = exportPayload(id, { subject, startTime })
    entry.exportPayload = payload
    const dl = await page.evaluate(
      async ([u, p]) => {
        const res = await fetch(u, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        })
        const ct = res.headers.get('content-type') || ''
        const buf = await res.arrayBuffer()
        const bytes = new Uint8Array(buf)
        if (bytes.length > 64 * 1024 * 1024) return { status: res.status, contentType: ct, tooLarge: true }
        let bin = ''
        const CH = 0x8000
        for (let i = 0; i < bytes.length; i += CH) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
        }
        return { status: res.status, contentType: ct, byteLength: bytes.length, base64: btoa(bin) }
      },
      [exportUrl(), payload]
    )
    entry.exportStatus = dl.status
    entry.exportContentType = dl.contentType
    entry.exportBytes = dl.byteLength ?? null
    if (dl.status !== 200 || !dl.base64) {
      entry.error = `export-failed(${dl.status})`
      results.meetingResults[id] = entry
      log(`!! 导出失败：HTTP ${dl.status} ${dl.contentType}`)
      continue
    }
    const docx = Buffer.from(dl.base64, 'base64')
    writeFileSync(join(OUT, `${id}.docx`), docx)
    const isPk = docx.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    entry.docxMagic = isPk
    if (!isPk) {
      entry.error = 'not-docx'
      entry.bodyPreview = docx.toString('utf8').slice(0, 500)
      results.meetingResults[id] = entry
      log('!! 导出不是 DOCX（PK 魔数缺失），前 500 字节已记录')
      continue
    }
    let text
    try {
      text = docxXmlToText(readZipEntry(docx, 'word/document.xml').toString('utf8'))
    } catch (error) {
      entry.error = `docx-parse: ${error.message}`
      results.meetingResults[id] = entry
      log(`!! DOCX 解析失败：${error.message}`)
      continue
    }
    writeFileSync(join(OUT, `${id}-transcript.txt`), text, 'utf8')
    const timestamps = text.match(/\d{2}:\d{2}/g) || []
    entry.characters = text.length
    entry.lines = text.split('\n').length
    entry.sha256 = createHash('sha256').update(text).digest('hex')
    entry.timestampCount = timestamps.length
    entry.head = text.slice(0, 200)
    entry.tail = text.slice(-200)
    if (KNOWN[id]) {
      entry.knownEvidenceMatch = {
        characters: entry.characters === KNOWN[id].characters,
        sha256: entry.sha256 === KNOWN[id].sha256
      }
    }
    results.meetingResults[id] = entry
    log(`字符 ${entry.characters} / 行 ${entry.lines} / HH:MM 时间戳 ${entry.timestampCount} 处 / SHA ${entry.sha256.slice(0, 12)}…`)
    log(`开头: ${entry.head.replace(/\n/g, '⏎')}`)
    if (entry.knownEvidenceMatch) log(`与既有证据比对: ${JSON.stringify(entry.knownEvidenceMatch)}`)
  }

  await context.close().catch(() => {})
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))

  // ---- S5: 汇总 ----
  log('\n========== 摘要 ==========')
  log(`Q1 node默认信任: ${results.nodeDefaultTls.ok ? `OK(HTTP ${results.nodeDefaultTls.status})` : `FAIL(${results.nodeDefaultTls.code})`}`)
  log(`Q1 node --use-system-ca: ${results.nodeSystemCaTls.ok ? `OK(HTTP ${results.nodeSystemCaTls.status})` : `FAIL(${results.nodeSystemCaTls.code})`}`)
  log(`Q1 Chromium 页面导航: OK（登录页可打开即证书可信）`)
  log(`Q1 context.request: ${JSON.stringify(results.contextRequest)}`)
  for (const [id, e] of Object.entries(results.meetingResults)) {
    log(`Q2/Q3 ${id}: ${e.error ? `ERROR ${e.error}` : `${e.characters} 字符, 时间戳 ${e.timestampCount} 处, 录制相关键 ${e.recordingishKeys.length} 个`}`)
  }
  log(`\n全部产物在 ${OUT}（results.json / *-detail.json / *.docx / *-transcript.txt）`)
  log('把 results.json 与摘要贴回加固 Issue 即可。')
}

main().catch((error) => {
  console.error('探测异常：', error)
  try {
    results.fatal = String(error.message || error).slice(0, 500)
    writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  } catch {}
  process.exit(1)
})
