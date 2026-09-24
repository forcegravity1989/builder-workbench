#!/usr/bin/env node
// Read-only knowledge scan. Collects evidence for the three knowledge principles
// (deletion test, drift-prone detail, missing trade-offs) plus Git hot spots.
// It proposes nothing: a person or model turns signals into candidates.
// Only signals.json / signals.md in an explicit outside-repository directory are written.
import { readFile, readdir, lstat, realpath, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { checkFiles } from './check-links.mjs'

const VERSION = '0.4.0'
const normalized = (value) => value.split(path.sep).join('/')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const within = (root, target) => {
  const rel = path.relative(root, target)
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`))
}
const blocked = new Set(['.git', 'node_modules', 'target', 'worktrees', '.worktrees'])

// Windows may spell the same directory with an 8.3 alias. Resolve the existing
// ancestor before comparing an output path whose final directories do not exist.
async function canonicalDestination(destination) {
  try {
    return await realpath(destination)
  } catch (error) {
    const parent = path.dirname(destination)
    if (error.code !== 'ENOENT' || parent === destination) {
      throw error
    }
    return path.join(await canonicalDestination(parent), path.basename(destination))
  }
}

// Includes cannot use a symbolic-link ancestor to escape the declared root.
async function safeSource(root, relative) {
  const absolute = path.resolve(root, relative)
  if (!within(root, absolute)) {
    throw new Error(`Profile includes path outside root: ${relative}`)
  }
  let current = root
  for (const segment of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    let info
    try {
      info = await lstat(current)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { missing: true }
      }
      throw error
    }
    if (info.isSymbolicLink()) {
      return { symlink: true }
    }
  }
  return { absolute }
}

// Fenced blocks are examples, not claims; inline code usually holds commands or
// protocol values, which are contracts rather than drift.
export function markdownShape(text) {
  let fence
  const lines = text.split(/\r?\n/).map((line) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/)
    if (marker) {
      if (!fence) {
        fence = marker[1]
      } else if (
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        fence = undefined
      }
      return ''
    }
    return fence ? '' : line
  })
  const headings = [],
    paragraphs = []
  let buffer = [],
    start = 0
  function flush() {
    if (!buffer.length) {
      return
    }
    const content = buffer.join(' ').replace(/\s+/g, ' ').trim()
    paragraphs.push({ line: start, chars: [...content].length, text: content })
    buffer = []
  }
  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (heading) {
      headings.push({ level: heading[1].length, title: heading[2], line: index + 1 })
    }
    if (!line.trim() || heading || /^\s*(?:[-*+] |\d+[.)] |\||>|---+$|===+$)/.test(line)) {
      flush()
    } else {
      if (!buffer.length) {
        start = index + 1
      }
      buffer.push(line.trim())
    }
  })
  flush()
  return { lines, prose: lines.map((line) => line.replace(/(`+).*?\1/g, '')), headings, paragraphs }
}

function gitHistory(root) {
  const git = (args) =>
    execFileSync('git', ['-c', 'core.quotepath=false', '-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    })
  try {
    const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true'
    // Git reports paths from the repository top; the scan root may be a subdirectory.
    const prefix = git(['rev-parse', '--show-prefix']).trim()
    const commits = git(['log', '--no-merges', '--name-only', '--format=%x00%cI'])
      .split('\0')
      .slice(1)
      .map((block) => {
        const [date, ...files] = block
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
        return {
          date,
          files: files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length))
        }
      })
    return { shallow, commits }
  } catch {
    return null
  }
}

export async function scanKnowledge({
  root: rootArg,
  profile: profilePath,
  days = 90,
  now = new Date()
}) {
  const root = await realpath(path.resolve(rootArg))
  if (!(await lstat(root)).isDirectory()) {
    throw new Error('Root must be a directory.')
  }
  const profileBytes = await readFile(profilePath)
  const profile = JSON.parse(profileBytes.toString('utf8'))
  if (!Array.isArray(profile.include) || !profile.include.length) {
    throw new Error('Profile requires a non-empty include array.')
  }
  const regex = (pattern, flags = 'i') => new RegExp(pattern, flags)
  const entryPoints = (profile.entryPoints ?? []).map((p) => regex(p))
  const tradeoffPaths = (profile.tradeoff?.paths ?? []).map((p) => regex(p))
  const tradeoffWords = regex(profile.tradeoff?.pattern ?? '取舍|trade-?off')
  const drift = (profile.drift ?? []).map((item) => ({
    label: item.label,
    matcher: regex(item.pattern, 'giu')
  }))
  const excludes = (profile.exclude ?? []).map((x) => x.replace(/\\/g, '/').replace(/\/$/, ''))
  const files = [],
    skipped = [],
    errors = [],
    seen = new Set()

  async function walk(absolute) {
    const relative = normalized(path.relative(root, absolute))
    if (seen.has(relative)) {
      return
    }
    seen.add(relative)
    if (
      relative.split('/').some((segment) => blocked.has(segment)) ||
      excludes.some((x) => relative === x || relative.startsWith(`${x}/`))
    ) {
      skipped.push({ file: relative, reason: 'excluded' })
      return
    }
    const info = await lstat(absolute)
    if (info.isSymbolicLink()) {
      skipped.push({ file: relative, reason: 'symbolic-link' })
      return
    }
    if (info.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) {
        await walk(path.join(absolute, entry))
      }
      return
    }
    if (!info.isFile() || path.extname(relative).toLowerCase() !== '.md') {
      return
    }
    const bytes = await readFile(absolute)
    const text = bytes.toString('utf8')
    const shape = markdownShape(text)
    const driftHits = drift
      .map(({ label, matcher }) => {
        const samples = []
        let count = 0
        shape.prose.forEach((line, index) => {
          const found = line.match(matcher)?.length ?? 0
          count += found
          if (found && samples.length < 3) {
            samples.push({ line: index + 1, text: line.trim().slice(0, 140) })
          }
        })
        return { label, count, samples }
      })
      .filter((item) => item.count)
    const tradeoffRequired = tradeoffPaths.some((p) => p.test(relative))
    files.push({
      file: relative,
      sha256: hash(bytes),
      chars: [...text].length,
      lines: shape.lines.length,
      title: shape.headings[0]?.title ?? path.basename(relative),
      paragraphs: shape.paragraphs,
      entryPoint: entryPoints.some((p) => p.test(relative)),
      drift: driftHits,
      tradeoff: tradeoffRequired
        ? { required: true, found: tradeoffWords.test(shape.prose.join('\n')) }
        : null,
      links: [],
      inbound: [],
      viaDirectory: [],
      churn: null
    })
  }
  for (const relative of profile.include) {
    const source = await safeSource(root, relative)
    if (source.missing || source.symlink) {
      skipped.push({
        file: relative,
        reason: source.missing ? 'selected-path-missing' : 'symbolic-link'
      })
      continue
    }
    try {
      await walk(source.absolute)
    } catch (error) {
      errors.push({ file: relative, message: error.message })
    }
  }
  files.sort((a, b) => a.file.localeCompare(b.file, 'en'))
  const byPath = new Map(files.map((file) => [file.file, file]))

  // A link to a directory reaches its README; without one, every Markdown file
  // directly inside is discoverable from that listing (weaker than a direct link).
  for (const file of files) {
    try {
      const checked = await checkFiles(root, [file.file])
      if (checked.files[0].sha256 !== file.sha256) {
        errors.push({
          file: file.file,
          message: 'File changed during scan; rerun for a consistent snapshot.'
        })
      }
      file.links = checked.files[0].links
      for (const link of file.links) {
        if (link.status !== 'exists' || link.resolved === file.file) {
          continue
        }
        const from = { file: file.file, line: link.line }
        if (byPath.has(link.resolved)) {
          byPath.get(link.resolved).inbound.push(from)
          continue
        }
        const readme = byPath.get(`${link.resolved}/README.md`)
        if (readme) {
          readme.inbound.push(from)
          continue
        }
        for (const child of files) {
          if (path.posix.dirname(child.file) === link.resolved) {
            child.viaDirectory.push(from)
          }
        }
      }
    } catch (error) {
      errors.push({ file: file.file, message: error.message })
    }
  }

  const paragraphIndex = new Map()
  for (const file of files) {
    for (const paragraph of file.paragraphs) {
      if (paragraph.chars < (profile.duplicateParagraphChars ?? 80)) {
        continue
      }
      const group = paragraphIndex.get(hash(paragraph.text)) ?? {
        text: paragraph.text.slice(0, 140),
        chars: paragraph.chars,
        occurrences: []
      }
      group.occurrences.push({ file: file.file, line: paragraph.line })
      paragraphIndex.set(hash(paragraph.text), group)
    }
  }

  const history = gitHistory(root)
  let git = null
  if (history) {
    const since = now.getTime() - days * 86400000
    const recent = history.commits.filter((c) => Date.parse(c.date) >= since)
    const scanned = new Set(files.map((f) => f.file))
    for (const file of files) {
      file.churn = {
        commits: recent.filter((c) => c.files.includes(file.file)).length,
        lastChanged: history.commits.find((c) => c.files.includes(file.file))?.date ?? null
      }
    }
    const depth = profile.codeAreaDepth ?? 4
    const areas = new Map()
    for (const commit of recent) {
      const touchedDocs = commit.files.some((f) => scanned.has(f))
      const touchedAreas = new Set(
        commit.files
          .filter(
            (f) =>
              (profile.codeRoots ?? []).some((r) => f === r || f.startsWith(`${r}/`)) &&
              !f.endsWith('.md')
          )
          .map((f) => path.posix.dirname(f).split('/').slice(0, depth).join('/'))
      )
      for (const area of touchedAreas) {
        const entry = areas.get(area) ?? { area, commits: 0, withDocs: 0 }
        entry.commits++
        if (touchedDocs) {
          entry.withDocs++
        }
        areas.set(area, entry)
      }
    }
    git = {
      shallow: history.shallow,
      days,
      commits: recent.length,
      codeAreas: [...areas.values()].sort(
        (a, b) => b.commits - a.commits || a.area.localeCompare(b.area, 'en')
      )
    }
  }

  const links = files.flatMap((file) => file.links.map((link) => ({ file: file.file, ...link })))
  const largeDocChars = profile.largeDocChars ?? 12000
  const signals = {
    orphans: files
      .filter((f) => !f.entryPoint && !f.inbound.length && !f.viaDirectory.length)
      .map((f) => f.file),
    duplicates: [...paragraphIndex.values()].filter((group) => group.occurrences.length > 1),
    large: files
      .filter((f) => f.chars > largeDocChars)
      .sort((a, b) => b.chars - a.chars)
      .map((f) => ({ file: f.file, chars: f.chars })),
    drift: files
      .filter((f) => f.drift.length)
      .map((f) => ({
        file: f.file,
        total: f.drift.reduce((s, d) => s + d.count, 0),
        hits: f.drift
      }))
      .sort((a, b) => b.total - a.total),
    missingTradeoffs: files.filter((f) => f.tradeoff && !f.tradeoff.found).map((f) => f.file),
    linkErrors: links
      .filter((link) => link.status === 'error')
      .map(({ file, line, target, reason }) => ({ file, line, target, reason }))
  }
  for (const file of files) {
    delete file.paragraphs
  }
  return {
    schemaVersion: 2,
    scannerVersion: VERSION,
    root,
    generatedAt: now.toISOString(),
    profile: {
      id: profile.id,
      version: profile.version,
      sha256: hash(profileBytes),
      include: profile.include,
      exclude: profile.exclude ?? []
    },
    thresholds: { largeDocChars, duplicateParagraphChars: profile.duplicateParagraphChars ?? 80 },
    summary: {
      markdown: files.length,
      references: links.length,
      linkErrors: signals.linkErrors.length,
      orphans: signals.orphans.length,
      duplicates: signals.duplicates.length,
      large: signals.large.length,
      driftFiles: signals.drift.length,
      missingTradeoffs: signals.missingTradeoffs.length,
      commits: git?.commits ?? null
    },
    git,
    signals,
    files,
    errors,
    skipped,
    limits: [
      '信号不是结论：候选、强弱与处置由人或模型按 project-knowledge 的扫描流程判断。',
      '只读 Markdown；HTML 指南、原型与源码注释不做内容检查。',
      '入链只算扫描范围内的 Markdown 链接；工具加载、HTML 链接与口头引用不在图中。',
      ...(git
        ? git.shallow
          ? ['Git 历史是浅克隆，热点与最后改动时间不完整。']
          : []
        : ['未读到 Git 历史，热点与改动时间缺失。'])
    ]
  }
}

const cell = (value) =>
  String(value ?? '')
    .replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')

export function renderMarkdown(result, top = 10) {
  const { signals, git, files } = result
  const byPath = new Map(files.map((f) => [f.file, f]))
  const out = [
    `# 知识库扫描信号 · ${result.generatedAt.slice(0, 10)}`,
    '',
    `范围：${result.summary.markdown} 篇 Markdown，映射 \`${cell(result.profile.id)}@${cell(result.profile.version)}\`；Git：${git ? `近 ${git.days} 天 ${git.commits} 次提交${git.shallow ? '（浅克隆，不完整）' : ''}` : '未读到'}。`,
    '',
    '> 信号不是结论。按 project-knowledge 的扫描流程读原文、判断候选强弱，再交人挑一项整改。',
    ''
  ]
  const table = (title, head, rows, empty = '无。') => {
    out.push(`## ${title}`, '')
    if (!rows.length) {
      out.push(empty, '')
      return
    }
    out.push(
      `| ${head.join(' | ')} |`,
      `|${head.map(() => '---').join('|')}|`,
      ...rows.slice(0, top).map((r) => `| ${r.map(cell).join(' | ')} |`)
    )
    if (rows.length > top) {
      out.push('', `另有 ${rows.length - top} 项见 signals.json。`)
    }
    out.push('')
  }
  const hotDocs = files
    .filter((f) => f.churn?.commits)
    .sort((a, b) => b.churn.commits - a.churn.commits || b.chars - a.chars)
  table(
    '文档改动热点',
    ['文档', '窗口内提交', '字符', '入链'],
    hotDocs.map((f) => [f.file, f.churn.commits, f.chars, f.inbound.length])
  )
  table(
    '代码改动热点与文档同步',
    ['代码区域', '窗口内提交', '同提交改了文档'],
    (git?.codeAreas ?? []).map((a) => [a.area, a.commits, a.withDocs])
  )
  table(
    '删除测试 · 没人链接',
    ['文档', '字符', '最后改动'],
    signals.orphans.map((f) => [
      f,
      byPath.get(f).chars,
      byPath.get(f).churn?.lastChanged?.slice(0, 10) ?? ''
    ])
  )
  table(
    '删除测试 · 超长文档',
    ['文档', '字符'],
    signals.large.map((f) => [f.file, f.chars])
  )
  table(
    '删除测试 · 重复段落',
    ['出现位置', '段落开头'],
    signals.duplicates.map((d) => [
      d.occurrences.map((o) => `${o.file}:${o.line}`).join(' / '),
      d.text.slice(0, 60)
    ])
  )
  table(
    '漂移细节（精确但易过期）',
    ['文档', '命中', '示例'],
    signals.drift.map((d) => [
      d.file,
      d.hits.map((h) => `${h.label} ${h.count}`).join('，'),
      d.hits[0].samples[0]
        ? `L${d.hits[0].samples[0].line} ${d.hits[0].samples[0].text.slice(0, 70)}`
        : ''
    ])
  )
  table(
    '缺取舍',
    ['文档'],
    signals.missingTradeoffs.map((f) => [f])
  )
  table(
    '机械错误 · 断链',
    ['位置', '目标', '原因'],
    signals.linkErrors.map((l) => [`${l.file}:${l.line}`, l.target, l.reason])
  )
  out.push('## 限制', '', ...result.limits.map((l) => `- ${l}`), '')
  return out.join('\n')
}

export async function writeSignals(result, outArg) {
  const requested = path.resolve(outArg)
  if (within(result.root, requested)) {
    throw new Error('Report output must be outside the scanned root.')
  }
  // Directory aliases (including macOS /tmp and Windows junctions/8.3 names)
  // are allowed only when their real destination is outside the scanned root.
  const out = await canonicalDestination(requested)
  if (within(result.root, out)) {
    throw new Error('Report output must be outside the scanned root.')
  }
  for (const name of ['signals.json', 'signals.md']) {
    try {
      const info = await lstat(path.join(out, name))
      if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) {
        throw new Error(`Unsafe report destination: ${name}`)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }
  await mkdir(out, { recursive: true })
  await writeFile(path.join(out, 'signals.json'), `${JSON.stringify(result, null, 2)}\n`)
  await writeFile(path.join(out, 'signals.md'), renderMarkdown(result))
}

async function main(args) {
  const options = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') {
      options.check = true
      continue
    }
    if (
      !['--root', '--profile', '--out', '--days'].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    ) {
      throw new Error(
        'Usage: scan-knowledge.mjs --root ROOT --profile JSON --out OUTSIDE_ROOT [--days N] [--check]'
      )
    }
    const key = args[i++].slice(2)
    if (options[key]) {
      throw new Error(`Duplicate --${key}`)
    }
    options[key] = args[i]
  }
  if (!options.root || !options.profile || !options.out) {
    throw new Error('--root, --profile and --out are required.')
  }
  if (options.days !== undefined && !(Number(options.days) > 0)) {
    throw new Error('--days must be a positive number.')
  }
  const result = await scanKnowledge({ ...options, days: Number(options.days ?? 90) })
  await writeSignals(result, options.out)
  console.log(
    JSON.stringify(
      {
        output: path.resolve(options.out),
        ...result.summary,
        readErrors: result.errors.length,
        skipped: result.skipped.length
      },
      null,
      2
    )
  )
  if (options.check && (result.errors.length || result.summary.linkErrors)) {
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exitCode = 2
  })
}
