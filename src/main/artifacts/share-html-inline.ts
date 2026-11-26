import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, isAbsolute, resolve } from 'node:path'

const MAX_RESOURCE_BYTES = 2 * 1024 * 1024
const MAX_IMPORT_DEPTH = 8

const ASSET_MIME: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon'
}

// The share service stores one HTML string, so relative stylesheets, their @import chain and
// url() assets would 404 on the share origin. Inline them for local source keys only; remote
// tuples (["ssh", …] / ["editor", …]) name files this process cannot reach.
export async function inlineLocalHtmlAssets(content: string, sourceKey: string): Promise<string> {
  const baseDir = localBaseDir(sourceKey)
  if (!baseDir || !/<(?:link|style)\b/i.test(content)) {
    return content
  }
  try {
    return await inlineHtml(content, baseDir)
  } catch (error) {
    console.error('Workbench share asset inlining failed; uploading original content:', error)
    return content
  }
}

function localBaseDir(sourceKey: string): string | null {
  try {
    if (Array.isArray(JSON.parse(sourceKey))) {
      return null
    }
  } catch {
    // A plain filesystem path is not JSON.
  }
  return isAbsolute(sourceKey) ? dirname(sourceKey) : null
}

type Edit = { start: number; end: number; text: string }

const HTML_SCAN =
  /(?<comment><!--[\s\S]*?-->)|(?<script><script\b[\s\S]*?<\/script\s*>)|(?<link><link\b[^>]*>)|(?<styleOpen><style\b[^>]*>)(?<styleBody>[\s\S]*?)<\/style\s*>/gi

async function inlineHtml(content: string, baseDir: string): Promise<string> {
  const edits: Edit[] = []
  for (const match of content.matchAll(HTML_SCAN)) {
    const start = match.index ?? 0
    const link = match.groups?.link
    const styleOpen = match.groups?.styleOpen
    if (link !== undefined) {
      const replacement = await inlineLinkTag(link, baseDir)
      if (replacement !== null) {
        edits.push({ start, end: start + match[0].length, text: replacement })
      }
    } else if (styleOpen !== undefined) {
      const body = match.groups?.styleBody ?? ''
      const processed = await inlineCss(body, baseDir, 0, new Set())
      if (processed !== body) {
        edits.push({
          start,
          end: start + match[0].length,
          text: `${styleOpen}${escapeStyleText(processed)}</style>`
        })
      }
    }
  }
  return applyEdits(content, edits)
}

const ATTR = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi

async function inlineLinkTag(tag: string, baseDir: string): Promise<string | null> {
  const attrs = new Map<string, string>()
  for (const match of tag.matchAll(ATTR)) {
    attrs.set((match[1] ?? '').toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '')
  }
  if ((attrs.get('rel') ?? '').trim().toLowerCase() !== 'stylesheet') {
    return null
  }
  const href = relativeLocalPath(attrs.get('href') ?? '')
  if (!href || extname(href).toLowerCase() !== '.css') {
    return null
  }
  const path = resolve(baseDir, href)
  const css = await readResourceText(path)
  if (css === null) {
    return null
  }
  const processed = await inlineCss(css, dirname(path), 0, new Set([path]))
  const media = attrs.get('media')
  return `<style${media ? ` media="${escapeAttr(media)}"` : ''}>${escapeStyleText(processed)}</style>`
}

// Only relative references are read from disk; schemes, drive letters and leading slashes stay.
function relativeLocalPath(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return null
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null
  }
  if (trimmed.startsWith('//') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    return null
  }
  const pathPart = trimmed.split(/[?#]/)[0]
  if (!pathPart) {
    return null
  }
  try {
    return decodeURIComponent(pathPart)
  } catch {
    return pathPart
  }
}

const CSS_SCAN =
  /\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|(?<imp>@import\s+(?<impBody>[^;]+);)|url\(\s*(?:"(?<dq>[^"]*)"|'(?<sq>[^']*)'|(?<uq>[^)]*?))\s*\)/gi

async function inlineCss(
  css: string,
  cssDir: string,
  depth: number,
  seen: Set<string>
): Promise<string> {
  const edits: Edit[] = []
  for (const match of css.matchAll(CSS_SCAN)) {
    const start = match.index ?? 0
    const impBody = match.groups?.impBody
    if (impBody !== undefined) {
      const replacement = await inlineImport(impBody, cssDir, depth, seen)
      if (replacement !== null) {
        edits.push({ start, end: start + match[0].length, text: replacement })
      }
      continue
    }
    const dq = match.groups?.dq
    const sq = match.groups?.sq
    const uq = match.groups?.uq
    if (dq === undefined && sq === undefined && uq === undefined) {
      continue
    }
    const replacement = await inlineUrlAsset(dq ?? sq ?? uq ?? '', cssDir)
    if (replacement !== null) {
      const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : ''
      edits.push({
        start,
        end: start + match[0].length,
        text: `url(${quote}${replacement}${quote})`
      })
    }
  }
  return applyEdits(css, edits)
}

async function inlineImport(
  body: string,
  cssDir: string,
  depth: number,
  seen: Set<string>
): Promise<string | null> {
  if (depth >= MAX_IMPORT_DEPTH) {
    return null
  }
  const reference =
    /^\s*(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)|"([^"]*)"|'([^']*)')/i.exec(body)
  if (!reference) {
    return null
  }
  const href = reference[1] ?? reference[2] ?? reference[3] ?? reference[4] ?? reference[5]
  const rel = relativeLocalPath(href ?? '')
  if (!rel || extname(rel).toLowerCase() !== '.css') {
    return null
  }
  const path = resolve(cssDir, rel)
  if (seen.has(path)) {
    return null
  }
  const css = await readResourceText(path)
  if (css === null) {
    return null
  }
  seen.add(path)
  const processed = await inlineCss(css, dirname(path), depth + 1, seen)
  // A file imported through two branches (diamond) must inline in both; only cycles are skipped.
  seen.delete(path)
  // Preserve import ordering and layer/supports/media grammar; only the resource URL changes.
  const data = Buffer.from(processed).toString('base64')
  return `@import url("data:text/css;base64,${data}")${body.slice(reference[0].length)};`
}

async function inlineUrlAsset(raw: string, cssDir: string): Promise<string | null> {
  const rel = relativeLocalPath(raw)
  if (!rel) {
    return null
  }
  const mime = ASSET_MIME[extname(rel).toLowerCase()]
  if (!mime) {
    return null
  }
  const bytes = await readResource(resolve(cssDir, rel))
  if (bytes === null) {
    return null
  }
  const fragment = raw.trim().includes('#') ? raw.trim().slice(raw.trim().indexOf('#')) : ''
  return `data:${mime};base64,${bytes.toString('base64')}${fragment}`
}

async function readResourceText(path: string): Promise<string | null> {
  const bytes = await readResource(path)
  return bytes === null ? null : bytes.toString('utf8')
}

async function readResource(path: string): Promise<Buffer | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > MAX_RESOURCE_BYTES) {
      console.error('Workbench share inline skipped (not a file or too large):', path)
      return null
    }
    return await readFile(path)
  } catch (error) {
    console.error('Workbench share inline skipped (unreadable):', path, error)
    return null
  }
}

function applyEdits(content: string, edits: Edit[]): string {
  if (edits.length === 0) {
    return content
  }
  let out = ''
  let cursor = 0
  for (const edit of edits) {
    out += content.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return out + content.slice(cursor)
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function escapeStyleText(css: string): string {
  // HTML raw-text parsing recognizes end tags even inside CSS strings and comments.
  return css.replace(/<\/style/gi, (match) => `\\3c ${match.slice(1)}`)
}
