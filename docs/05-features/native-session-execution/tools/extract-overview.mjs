/*
 * 把 docs/hifi/overview.html 的「内容层」原样抽成 V3 原型可复用的三份资产：
 *   hifi-overview.css        内容层样式，选择器统一加 #screen-overview 作用域
 *   hifi-overview.markup.js  内容层 DOM 字符串（file:// 下 fetch 被拦，所以走 JS 字符串）
 *   hifi-overview.boot.js    定稿自带脚本（图表/页签/toast），注入 DOM 之后再执行
 * 手抄会失真，所以定稿改了就重跑这个脚本，别去手改产物。
 *
 * 用法：node docs/05-features/native-session-execution/tools/extract-overview.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const featureDir = resolve(here, '..')
const src = resolve(featureDir, '../../hifi/overview.html')
const SCOPE = '#screen-overview'

const html = readFileSync(src, 'utf8')
const lines = html.split('\n')

/* ---------- 1. 样式：只要 .content 起的内容层，前面全是窗口/侧栏 chrome ---------- */
const styleStart = lines.findIndex((l) => l.trim() === '<style>')
const styleEnd = lines.findIndex((l, i) => i > styleStart && l.trim() === '</style>')
if (styleStart < 0 || styleEnd < 0) throw new Error('overview.html: <style> 块没找到')
const styleLines = lines.slice(styleStart + 1, styleEnd)
const contentCssAt = styleLines.findIndex((l) => /^\.content\s*\{/.test(l))
if (contentCssAt < 0) throw new Error('overview.html: 内容层样式起点 .content{ 没找到')
const rawCss = styleLines.slice(contentCssAt).join('\n')

// 顶层规则逐条加作用域；@media/@supports 递归进去，@keyframes 原样留。
function scopeCss(css, scope) {
  const out = []
  let i = 0
  while (i < css.length) {
    const braceAt = css.indexOf('{', i)
    if (braceAt < 0) {
      out.push(css.slice(i))
      break
    }
    const head = css.slice(i, braceAt)
    let depth = 0
    let j = braceAt
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const body = css.slice(braceAt + 1, j)
    const trimmedHead = head.trim()
    if (/^@(media|supports|layer)/.test(trimmedHead)) {
      out.push(head + '{' + scopeCss(body, scope) + '}')
    } else if (trimmedHead.startsWith('@')) {
      out.push(head + '{' + body + '}')
    } else {
      // 注释留在选择器前面，别被拼进选择器里
      const commentMatch = head.match(/^([\s\S]*?\*\/\s*)?([\s\S]*)$/)
      const lead = commentMatch[1] || ''
      const selectors = commentMatch[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (/^(html|body|:root)\b/.test(s) ? scope : scope + ' ' + s))
        .join(', ')
      out.push(lead + selectors + ' {' + body + '}')
    }
    i = j + 1
  }
  return out.join('')
}

const css =
  '/* 由 tools/extract-overview.mjs 从 docs/hifi/overview.html 生成，别手改 */\n' +
  scopeCss(rawCss, SCOPE)
    .replace(/\}\s*/g, '}\n')
    .trim() +
  '\n'

/* ---------- 2. 结构：<div class="content"> … </div> 整块 ---------- */
const markupStart = lines.findIndex((l) => l.trim() === '<div class="content">')
if (markupStart < 0) throw new Error('overview.html: .content 结构起点没找到')
let markupEnd = -1
for (let i = markupStart + 1; i < lines.length; i++) {
  if (lines[i] === '        </div>' && lines[i + 1] === '      </div>') {
    markupEnd = i
    break
  }
}
if (markupEnd < 0) throw new Error('overview.html: .content 结构终点没找到')
const markup = lines.slice(markupStart, markupEnd + 1).join('\n')

/* ---------- 3. 脚本：最后一个 <script> 块 ---------- */
const scriptStart = lines.lastIndexOf('<script>')
const scriptEnd = lines.lastIndexOf('</script>')
if (scriptStart < 0 || scriptEnd < 0) throw new Error('overview.html: <script> 块没找到')
const script = lines.slice(scriptStart + 1, scriptEnd).join('\n')

mkdirSync(featureDir, { recursive: true })
writeFileSync(resolve(featureDir, 'hifi-overview.css'), css)
writeFileSync(
  resolve(featureDir, 'hifi-overview.markup.js'),
  '/* 由 tools/extract-overview.mjs 生成，别手改 */\n' +
    'window.__BW_HIFI_OVERVIEW_HTML = ' +
    JSON.stringify(markup) +
    '\n'
)
writeFileSync(
  resolve(featureDir, 'hifi-overview.boot.js'),
  '/* 由 tools/extract-overview.mjs 生成，别手改：docs/hifi/overview.html 的定稿脚本 */\n' +
    script +
    '\n'
)

console.log(
  '[extract-overview] css %d 字 · markup %d 字 · script %d 字',
  css.length,
  markup.length,
  script.length
)
