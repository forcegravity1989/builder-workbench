#!/usr/bin/env node
// Read-only, deliberately limited Markdown file-link checks. No network or traversal.
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

function within(root, file) {
  const relative = path.relative(root, file)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

function visibleLines(text) {
  let fence
  return text.split(/\r?\n/).map((line) => {
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
    if (fence) {
      return ''
    }
    return line.replace(/(`+).*?\1/g, '')
  })
}

function destination(value) {
  const raw = value.trim()
  const angle = raw.match(/^<([^>]+)>(?:\s+["'][^"']*["'])?$/)
  if (angle) {
    return angle[1]
  }
  const plain = raw.match(/^([^\s()]+)(?:\s+["'][^"']*["'])?$/)
  return plain ? plain[1] : null
}

export async function checkFiles(rootArg, fileArgs) {
  if (!rootArg || !fileArgs?.length) {
    throw new Error('Provide --root and at least one --file.')
  }
  const root = await realpath(path.resolve(rootArg))
  if (!(await stat(root)).isDirectory()) {
    throw new Error('Root must be a directory.')
  }
  const results = []
  const seen = new Set()
  for (const input of fileArgs) {
    const absolute = path.resolve(root, input)
    if (!within(root, absolute)) {
      throw new Error(`Selected file outside root: ${input}`)
    }
    const actual = await realpath(absolute)
    if (!within(root, actual)) {
      throw new Error(`Selected file symlink outside root: ${input}`)
    }
    if (path.extname(actual).toLowerCase() !== '.md') {
      throw new Error(`Only Markdown inputs are supported: ${input}`)
    }
    if (seen.has(actual)) {
      continue
    }
    seen.add(actual)
    const bytes = await readFile(actual)
    const lines = visibleLines(bytes.toString('utf8'))
    const references = new Map()
    const links = []
    const labelKey = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase()
    for (const line of lines) {
      const def = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(.+)$/)
      if (def) {
        references.set(labelKey(def[1]), destination(def[2]))
      }
    }
    async function inspect(target, line, kind) {
      const record = { line, kind, target, status: 'unchecked' }
      links.push(record)
      if (target === null) {
        record.reason = 'complex-markdown'
        return
      }
      if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
        record.reason = 'external-or-uri'
        return
      }
      if (target.startsWith('#')) {
        record.reason = 'heading-anchor'
        return
      }
      if (target.startsWith('/')) {
        record.reason = 'site-root-or-absolute-url-path'
        return
      }
      let local
      try {
        local = decodeURIComponent(target.split(/[?#]/, 1)[0])
      } catch {
        record.reason = 'invalid-url-encoding'
        record.status = 'error'
        return
      }
      if (!local) {
        record.reason = 'empty-path'
        return
      }
      const resolved = path.resolve(path.dirname(absolute), local.replace(/[\\/]/g, path.sep))
      if (!within(root, resolved)) {
        record.reason = 'outside-root'
        record.status = 'error'
        return
      }
      try {
        const actualTarget = await realpath(resolved)
        if (!within(root, actualTarget)) {
          record.reason = 'symlink-outside-root'
          record.status = 'error'
          return
        }
        record.status = 'exists'
        record.resolved = path.relative(root, actualTarget).split(path.sep).join('/')
        if (target.includes('#') || target.includes('?')) {
          record.uncheckedPart = 'anchor-or-query'
        }
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          record.reason = 'missing-path'
          record.status = 'error'
        } else {
          record.reason = `unreadable-path:${error.code ?? 'unknown'}`
        }
      }
    }
    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1
      const definition = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(.+)$/)
      if (definition) {
        await inspect(destination(definition[2]), lineNumber, 'reference-definition')
        continue
      }
      const importLine = line.match(/^\s*@([^\s]+)\s*$/)
      if (importLine) {
        await inspect(importLine[1], lineNumber, 'import')
      }
      for (const match of line.matchAll(/!?\[[^\]\n]*\]\((<[^>\n]*>|[^)\n]*)\)/g)) {
        await inspect(destination(match[1]), lineNumber, 'inline')
      }
      for (const match of line.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
        const key = labelKey(match[2] || match[1])
        if (!references.has(key)) {
          links.push({
            line: lineNumber,
            kind: 'reference',
            target: key,
            status: 'error',
            reason: 'missing-reference-definition'
          })
        }
      }
      if (/<(?:a|img)\b/i.test(line)) {
        links.push({
          line: lineNumber,
          kind: 'html',
          target: null,
          status: 'unchecked',
          reason: 'html-not-parsed'
        })
      }
    }
    results.push({
      file: path.relative(root, absolute).split(path.sep).join('/'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      links
    })
  }
  const links = results.flatMap((r) => r.links)
  return {
    schemaVersion: 1,
    root,
    generatedAt: new Date().toISOString(),
    files: results,
    summary: {
      files: results.length,
      references: links.length,
      errors: links.filter((x) => x.status === 'error').length,
      unchecked: links.filter((x) => x.status === 'unchecked' || x.uncheckedPart).length
    },
    limits: [
      'Only selected Markdown files; no inbound or whole-repository scan.',
      'Heading anchors, external URLs, HTML and complex Markdown are not validated.',
      'Existence is not semantic correctness, actual loading, test execution or feature value.'
    ]
  }
}

async function main(args) {
  let root
  const files = []
  for (let i = 0; i < args.length; i++) {
    if (!['--root', '--file'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Usage: node check-links.mjs --root ROOT --file FILE [--file FILE]')
    }
    const flag = args[i++]
    if (flag === '--root') {
      if (root) {
        throw new Error('Use --root once.')
      }
      root = args[i]
    } else {
      files.push(args[i])
    }
  }
  const result = await checkFiles(root, files)
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.summary.errors ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.log(
      JSON.stringify(
        { error: error.message, scope: 'No files modified; no requests sent.' },
        null,
        2
      )
    )
    process.exitCode = 2
  })
}
