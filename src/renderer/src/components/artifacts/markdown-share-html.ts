import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { wrapShareDocument } from '../../../../shared/workbench/share-html'

/** The service stores one HTML file, so Markdown is rendered and sanitized before upload. */
export function markdownToShareHtml(markdown: string, title?: string): string {
  const rendered = marked.parse(markdown, { async: false })
  const safeBody = DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } })
  return wrapShareDocument(safeBody, title)
}
