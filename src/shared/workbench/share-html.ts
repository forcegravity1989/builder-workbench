const SHARE_DOCUMENT_STYLES = `
  :root { color-scheme: light dark; }
  body { margin: 0 auto; max-width: 52rem; padding: 2.5rem 1.5rem 4rem; font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2328; background: #fff; }
  h1, h2, h3, h4 { line-height: 1.3; margin: 2rem 0 0.75rem; }
  h1 { font-size: 2rem; border-bottom: 1px solid #d0d7de; padding-bottom: 0.5rem; }
  h2 { font-size: 1.5rem; border-bottom: 1px solid #d0d7de; padding-bottom: 0.35rem; }
  p, ul, ol, blockquote, pre, table { margin: 0 0 1rem; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; background: #f6f8fa; border-radius: 4px; padding: 0.1em 0.35em; }
  pre { background: #f6f8fa; border-radius: 8px; padding: 1rem; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 3px solid #d0d7de; color: #59636e; margin-left: 0; padding-left: 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d0d7de; padding: 0.45rem 0.75rem; text-align: left; }
  th { background: #f6f8fa; }
  img { max-width: 100%; }
  a { color: #0969da; }
  @media (prefers-color-scheme: dark) {
    body { color: #e6edf3; background: #0d1117; }
    h1, h2 { border-color: #3d444d; }
    code, pre, th { background: #161b22; }
    th, td { border-color: #3d444d; }
    blockquote { border-color: #3d444d; color: #9198a1; }
    a { color: #4493f8; }
  }
`

/**
 * The share service stores one HTML document, so every Markdown body is wrapped here before
 * upload. Callers render (and where a DOM exists, sanitize) the body first; this only frames it.
 */
export function wrapShareDocument(bodyHtml: string, title?: string): string {
  const safeTitle = escapeHtml(title ?? 'Shared document')
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>${SHARE_DOCUMENT_STYLES}</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
