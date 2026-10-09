import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const root = import.meta.dirname
const args = process.argv.slice(2)
const dependency = args.find((arg) => !arg.startsWith('--'))
const { Marked } = dependency
  ? await import(pathToFileURL(resolve(dependency)).href)
  : await import('marked')
const check = args.includes('--check')
const selected = args.find((arg) => arg.startsWith('--only='))?.slice(7)
const reports = [
  ['README', '总览与阅读地图'],
  ['anthropic-sdlc', 'Claude · AI-native SDLC'],
  ['workbuddy-codebuddy', 'WorkBuddy / CodeBuddy'],
  ['orca', 'Orca · 执行与协作'],
  ['openai-codex', 'OpenAI · 证据与反馈循环'],
  ['cursor-linear', 'Cursor / Linear · 工作组织'],
  ['spotify', 'Spotify · 从执行到用户反馈'],
  ['evidence-and-metrics', 'DORA / METR · 度量与实证']
]
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const outputName = (name) => (name === 'README' ? 'index.html' : `${name}.html`)
const names = readdirSync(root).filter((name) => name.endsWith('.md'))
let failed = false
for (const name of names) {
  const stem = name.slice(0, -3)
  if (selected && stem !== selected) {
    continue
  }
  const source = readFileSync(join(root, name), 'utf8').replaceAll('\r\n', '\n')
  const title = source.match(/^# (.+)$/m)?.[1] ?? stem
  const toc = []
  let headingIndex = 0
  const parser = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const label = this.parser.parseInline(tokens)
        const id = `section-${headingIndex++}`
        if (depth === 2) {
          toc.push({ id, label })
        }
        return `<h${depth} id="${id}">${label}</h${depth}>\n`
      }
    }
  })
  const content = parser.parse(source)
  const nav = reports
    .map(
      ([key, label]) =>
        `<a href="${outputName(key)}"${key === stem ? ' aria-current="page"' : ''}>${escape(
          label
        )}</a>`
    )
    .join('\n')
  const anchors = toc.map(({ id, label }) => `<a href="#${id}">${label}</a>`).join('\n')
  const hash = createHash('sha256').update(source).digest('hex')
  const html =
    `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<meta name="source-sha256" content="${hash}">\n` +
    `<title>${escape(
      title
    )} · BW 研究</title>\n<link rel="stylesheet" href="report.css">\n</head>\n<body>\n` +
    `<a class="skip" href="#content">跳到正文</a>\n` +
    `<header class="masthead"><a href="index.html" class="brand">BW / RESEARCH</a>` +
    `<span>AI Coding 之后，项目怎样走到真实交付</span>` +
    `<a class="source" href="${name}">阅读 Markdown 正源</a></header>\n` +
    `<div class="layout"><aside><nav aria-label="专题报告">${nav}</nav>` +
    `<details open class="toc"><summary>本篇目录</summary>${anchors}</details></aside>\n` +
    `<main id="content"><div class="eyebrow">2026.10.09 · 外部研究参考 · 待真实项目验证</div>` +
    `<article>${content}</article>` +
    `<footer>同内容 Markdown 为维护正源；HTML 为生成的阅读视图。外部能力、团队经验与 BW 已交付能力分别判断。</footer>` +
    `</main></div>\n</body>\n</html>\n`
  const target = join(root, outputName(stem))
  if (check) {
    let previous = ''
    try {
      previous = readFileSync(target, 'utf8').replaceAll('\r\n', '\n')
    } catch {
      /* A missing projection is stale. */
    }
    if (previous !== html) {
      process.stderr.write(`Stale projection: ${outputName(stem)}\n`)
      failed = true
    }
  } else {
    writeFileSync(target, html)
    process.stdout.write(`Rendered ${outputName(stem)}\n`)
  }
}
if (failed) {
  process.exitCode = 1
}
