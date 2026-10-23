/**
 * 离线报告投影：供研究维护者在八篇 Markdown 或共享样式变化后运行。
 * Markdown 是内容正源；本脚本只维护汇编、链接和阅读行为，不维护研究正文。
 * Usage: node bundle-report.mjs [path/to/marked.esm.js] [--check]
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, posix, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = import.meta.dirname
const repositoryDirectory = 'docs/10-reference/ai-native-delivery-2026'
const evidenceRevision = 'ed5a0930b70dd68b7cf588d45d42173b135e7c48'
const repository = 'https://github.com/forcegravity1989/builder-workbench'
const args = process.argv.slice(2)
const dependency = args.find((arg) => !arg.startsWith('--'))
const check = args.includes('--check')
if (args.some((arg) => arg.startsWith('--') && arg !== '--check')) {
  throw new Error('Supported arguments: [path/to/marked.esm.js] [--check]')
}
const { Marked } = dependency
  ? await import(pathToFileURL(resolve(dependency)).href)
  : await import('marked')
const normalize = (text) => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
const escape = (text) =>
  String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
const digest = (text) => createHash('sha256').update(text).digest('hex')
const plainText = (html) => html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, '')
const slug = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
const entries = [
  ['README', 'overview', '总览与结论'],
  ['anthropic-sdlc', 'anthropic-sdlc', 'Anthropic / Claude'],
  ['workbuddy-codebuddy', 'workbuddy-codebuddy', 'WorkBuddy / CodeBuddy'],
  ['orca', 'orca', 'Orca'],
  ['openai-codex', 'openai-codex', 'OpenAI / Codex'],
  ['cursor-linear', 'cursor-linear', 'Cursor / Linear'],
  ['spotify', 'spotify', 'Spotify'],
  ['evidence-and-metrics', 'evidence-and-metrics', 'DORA / METR']
].map(([stem, id, label]) => {
  const source = normalize(readFileSync(join(directory, `${stem}.md`), 'utf8'))
  const headings = []
  const fragments = new Map()
  const counts = new Map()
  const parser = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const title = plainText(this.parser.parseInline(tokens))
        const index = headings.length
        const headingId = `${id}-heading-${index}`
        const base = slug(title)
        const count = counts.get(base) ?? 0
        counts.set(base, count + 1)
        const uniqueSlug = base + (count ? '-' + count : '')
        headings.push({ title, depth, id: headingId })
        fragments.set(uniqueSlug, headingId)
        fragments.set(`section-${index}`, headingId)
        fragments.set(headingId, headingId)
        return ''
      }
    }
  })
  parser.parse(source)
  return {
    stem,
    id,
    label,
    source,
    hash: digest(source),
    headings,
    fragments,
    title: headings.find((heading) => heading.depth === 1)?.title ?? label
  }
})
const reportByPath = new Map()
for (const entry of entries) {
  for (const extension of ['.md', '.html']) {
    reportByPath.set(posix.join(repositoryDirectory, entry.stem + extension), entry)
  }
}
reportByPath.set(`${repositoryDirectory}/index.html`, entries[0])
reportByPath.set(`${repositoryDirectory}/report.html`, entries[0])
const repositoryEvidence = new Set()

function resolveLink(href, current) {
  if (/^(https?:|mailto:)/i.test(href)) {
    return { href }
  }
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href) || href.includes('\\')) {
    throw new Error(`Unsupported or machine-local link in ${current.stem}.md`)
  }
  const url = new URL(href, `https://repository.invalid/${repositoryDirectory}/${current.stem}.md`)
  const path = decodeURIComponent(url.pathname).slice(1)
  const target = reportByPath.get(path)
  if (target) {
    const fragment = decodeURIComponent(url.hash.slice(1))
    const anchor = fragment
      ? (target.fragments.get(fragment) ?? (fragment === target.id ? target.id : undefined))
      : target.id
    if (!anchor) {
      throw new Error(`Unknown report anchor: ${href}`)
    }
    return { href: `#${anchor}`, internal: true }
  }
  if (path === 'docs/05-features/overview-metrics/ai-native-delivery-proposal/prototype.html') {
    return { separate: true }
  }
  repositoryEvidence.add(path)
  return {
    href: `${repository}/blob/${evidenceRevision}/${path.split('/').map(encodeURIComponent).join('/')}${url.search}${url.hash}`,
    evidence: true
  }
}

function renderArticle(entry) {
  let headingIndex = 0
  const parser = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const heading = entry.headings[headingIndex++]
        return `<h${depth} id="${heading.id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      link({ href, title, tokens }) {
        const resolved = resolveLink(href, entry)
        const content = this.parser.parseInline(tokens)
        if (resolved.separate) {
          return `<span>${
            content
          } <small class="separate-delivery">（独立交付：prototype.html）</small></span>`
        }
        const label = resolved.internal && content === '正源' ? '本篇全文' : content
        const hint = resolved.evidence ? ' <small class="online">（联网查看）</small>' : ''
        return `<a href="${escape(resolved.href)}"${
          title ? ` title="${escape(title)}"` : ''
        }${resolved.internal ? '' : ' rel="noreferrer"'}>${label}${hint}</a>`
      },
      image({ href, text }) {
        const resolved = resolveLink(href, entry)
        return `<a href="${escape(resolved.href)}">图片：${escape(text)}（联网查看）</a>`
      },
      html({ text }) {
        return escape(text)
      }
    }
  })
  let maintenance = ''
  const content = parser
    .parse(entry.source)
    .replace(
      /^(<h1\b[^>]*>[\s\S]*?<\/h1>\s*)<blockquote>\s*([\s\S]*?)<\/blockquote>/,
      (_match, title, header) => {
        if (entry.stem === 'README') {
          const note = header.match(/<p><strong>维护约定<\/strong>[\s\S]*?<\/p>/)?.[0]
          if (!note) {
            throw new Error('Overview maintenance paragraph could not be identified')
          }
          maintenance = note
          return `${title}<blockquote>${header.replace(note, '')}</blockquote>`
        }
        maintenance = header
        return title
      }
    )
  const source = `<p class="source-note">内容正源：<code>${entry.stem}.md</code>；完整版本校验见页底。</p>`
  const sourceDetails =
    entry.stem === 'README'
      ? ''
      : `<details class="source-info"><summary>来源与维护说明</summary>${source}${maintenance}</details>`
  const contents = entry.headings
    .filter((heading) => heading.depth === 2)
    .map((heading) => `<a href="#${heading.id}">${escape(heading.title)}</a>`)
    .join('')
  const chapterNavigation = `<details class="chapter-nav"><summary>本篇章节</summary><nav class="article-contents" aria-label="${escape(entry.label)}章节">${contents}</nav></details>`
  return {
    html: `<article>${content.replace('</h1>', `</h1>${sourceDetails}${chapterNavigation}`)}</article>`,
    sourceInfo: `${source}${maintenance}`
  }
}

const overview = renderArticle(entries[0])
const topics = entries
  .slice(1)
  .map(
    (entry, index) =>
      `<details class="topic" id="${entry.id}" open><summary><span class="topic-number">${String(
        index + 1
      ).padStart(2, '0')}</span><span>${escape(
        entry.title
      )}</span><small>专题全文</small></summary>${renderArticle(entry).html}</details>`
  )
  .join('\n')
const sharedStyle = normalize(readFileSync(join(directory, 'report.css'), 'utf8'))
if (/@import|url\s*\(/i.test(sharedStyle)) {
  throw new Error('Shared CSS must not depend on external resources')
}
const navigation = entries
  .map((entry) => `<a href="#${entry.id}">${escape(entry.label)}</a>`)
  .join('')
const sourceRows = entries
  .map((entry) => `<tr><td>${entry.stem}.md</td><td><code>${entry.hash}</code></td></tr>`)
  .join('')
const bundleStyle = `
.masthead { flex-wrap: wrap; gap: 10px 22px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
button { font: inherit; font-size: 13px; color: var(--accent); background: var(--soft); border: 1px solid var(--line); border-radius: 6px; padding: 7px 12px; cursor: pointer; }
button:hover { background: #dcecea; }
button:focus-visible { outline: 3px solid #bf790b; outline-offset: 3px; }
.toolbar[hidden] { display: none; }
.offline-note { font-size: 13px; margin: 12px 0; padding: 10px 14px; background: var(--soft); border-radius: 8px; }
.offline-note summary, .source-info summary { cursor: pointer; color: var(--muted); font-size: 13px; }
.source-info { font-size: 13px; color: var(--muted); }
.source-note { color: var(--muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.source-note code { background: transparent; padding: 0; }
.article-contents { display: flex; flex-wrap: wrap; gap: 5px; margin: 16px 0 26px; }
.article-contents a { font-size: 12px; border: 1px solid var(--line); padding: 5px 9px; }
.topic { margin-top: 24px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; scroll-margin-top: 110px; }
.topic > summary { cursor: pointer; padding: 18px 20px; font-weight: 650; font-size: 17px; line-height: 1.5; background: var(--soft); border-radius: 10px; overflow-wrap: anywhere; }
.topic > summary small { display: block; padding-left: 35px; font-size: 11px; color: var(--muted); font-weight: 400; }
.topic-number { color: var(--accent); margin-right: 12px; font-size: 13px; }
.topic > article { padding: 18px 24px 28px; min-width: 0; }
.topic h1 { font-size: 26px; }
.topic h2 { font-size: 21px; }
.topic[open] > summary { border-bottom: 1px solid var(--line); border-radius: 10px 10px 0 0; }
.online, .separate-delivery { color: var(--muted); font-size: .85em; }
.bundle-manifest { border-top: 1px solid var(--line); padding-top: 18px; margin-top: 42px; }
.bundle-manifest summary { cursor: pointer; font-size: 14px; font-weight: 600; }
.bundle-manifest td { min-width: 0; }
.bundle-manifest code { overflow-wrap: anywhere; }
#reading-status { font-size: 12px; color: var(--muted); }
@media (max-width: 720px) {
  .toolbar { width: 100%; margin: 0; }
  .layout { padding: 10px; }
  main { padding: 18px 12px; }
  .topic > article { padding: 12px; }
  .topic > summary { padding: 15px 12px; font-size: 16px; }
  .topic h1 { font-size: 23px; }
  .article-contents { display: block; }
  .article-contents a { margin: 5px 0; }
  .bundle-manifest table { table-layout: fixed; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
@media print {
  .toolbar, .chapter-nav, .article-contents, #reading-status, .skip { display: none !important; }
  .topic { break-before: page; border: none; }
  .topic > summary { background: none; border: none !important; padding: 0; }
  .topic > article { padding: 0; }
  details::details-content { display: block !important; content-visibility: visible !important; height: auto !important; }
  details > :not(summary) { display: block !important; }
  th, td { min-width: 0; padding: 6px; overflow-wrap: anywhere; }
  pre { white-space: pre-wrap; }
  .source-note { font-size: 8pt; }
  .bundle-manifest table { display: table !important; table-layout: fixed; }
}
`
const browserCode = String.raw`
const topics = [...document.querySelectorAll('details.topic')];
const status = document.getElementById('reading-status');
const updateStatus = () => {
  status.textContent = topics.filter((topic) => topic.open).length + ' / 7 篇专题已展开';
};
const setTopics = (open) => {
  topics.forEach((topic) => { topic.open = open; });
  updateStatus();
};
function revealHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  let ancestor = target;
  while (ancestor) {
    if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  updateStatus();
}
setTopics(false);
document.querySelector('.toolbar').hidden = false;
document.getElementById('expand-all').addEventListener('click', () => setTopics(true));
document.getElementById('collapse-all').addEventListener('click', () => setTopics(false));
document.getElementById('print-report').addEventListener('click', () => window.print());
topics.forEach((topic) => topic.addEventListener('toggle', updateStatus));
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  event.preventDefault();
  history.pushState(null, '', link.getAttribute('href'));
  revealHash();
});
window.addEventListener('hashchange', revealHash);
window.addEventListener('popstate', revealHash);
let printState;
window.addEventListener('beforeprint', () => {
  if (printState) return;
  printState = [...document.querySelectorAll('details')].map((element) => [element, element.open]);
  printState.forEach(([element]) => { element.open = true; });
});
window.addEventListener('afterprint', () => {
  printState?.forEach(([element, open]) => { element.open = open; });
  printState = undefined;
  updateStatus();
});
revealHash();
`
const metadata = entries
  .map((entry) => `<meta name="source-sha256-${entry.stem}" content="${entry.hash}">`)
  .join('\n')
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="evidence-revision" content="${evidenceRevision}">
${metadata}
<title>${escape(entries[0].title)} · 完整离线报告</title>
<style>${sharedStyle}\n${bundleStyle}</style>
</head>
<body>
<a class="skip" href="#overview">跳到总览正文</a>
<header class="masthead"><a class="brand" href="#overview">BW / RESEARCH</a><span>完整报告 · 2026.10.09</span>
<div class="toolbar" hidden><button id="expand-all" type="button">展开全部专题</button><button id="collapse-all" type="button">折叠全部专题</button><button id="print-report" type="button">打印完整报告</button></div></header>
<div class="layout"><aside><nav aria-label="报告导航">${navigation}</nav><p id="reading-status" aria-live="polite"></p></aside>
<main><div class="eyebrow">8 篇完整内容 · 可离线阅读 · 外部研究参考</div>
<details class="offline-note"><summary>离线阅读与来源说明</summary><p>本文件包含总览及七篇专题全文。正文与样式可离线阅读；外部引文、仓库证据需要联网。仓库证据固定于 <code>ed5a0930b</code>。Markdown 仍为唯一内容正源，以下全文由其生成；独立原型为另一份交付。</p>${overview.sourceInfo}</details>
<section id="overview">${overview.html}</section>
<section aria-label="七篇专题全文">${topics}</section>
<details class="bundle-manifest"><summary>内容正源与版本校验</summary><p>下列 SHA-256 以统一换行后的 Markdown 计算；它标识本文件包含的版本，不证明研究结论永远有效。修改正源后运行 <code>bundle-report.mjs</code> 重新生成；<code>--check</code> 可检查投影是否过期。独立专题 HTML 继续由 <code>render.mjs</code> 生成。</p><table><thead><tr><th>Markdown 正源</th><th>SHA-256</th></tr></thead><tbody>${sourceRows}</tbody></table></details>
<footer>生成投影，不在 HTML 手工维护正文。事实、厂商主张、研究推断与 BW 已交付能力分别判断。</footer>
</main></div>
<script>${browserCode}</script>
</body>
</html>
`
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1])
const idSet = new Set(ids)
if (ids.length !== idSet.size) {
  throw new Error('Duplicate HTML IDs')
}
for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  if (!idSet.has(match[1])) {
    throw new Error(`Missing internal target: ${match[1]}`)
  }
}
if (/<(?:script|link|img|iframe|source|audio|video)\b[^>]*(?:src|href)=/i.test(html)) {
  throw new Error('Offline report must not load external resources')
}
if (/(?:^|[\s"'(>])(?:file:\/\/|[a-z]:[\\/])/im.test(html)) {
  throw new Error('Machine-local path leaked into report')
}
const target = join(directory, 'report.html')
if (check) {
  let previous = ''
  try {
    previous = normalize(readFileSync(target, 'utf8'))
  } catch {
    /* Missing output is stale. */
  }
  if (previous !== html) {
    process.stderr.write('Stale projection: report.html\n')
    process.exitCode = 1
  } else {
    process.stdout.write(
      'Current: report.html; 8 sources, all anchors valid, no external resources\n'
    )
  }
} else {
  writeFileSync(target, html, 'utf8')
  process.stdout.write(
    `Rendered report.html; 8 sources; ${repositoryEvidence.size} pinned repository evidence paths\n`
  )
}
