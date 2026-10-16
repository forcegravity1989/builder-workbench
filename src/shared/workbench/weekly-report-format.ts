import {
  weeklyReportPeriodLabel,
  weeklyReportTemplate,
  type WeeklyReportDocument
} from './weekly-report'

export const weeklyReportTheme = `
.weekly-report{border:1px solid #000;color:#000;background:#fff;font:14px/1.65 'Microsoft YaHei',sans-serif}
.weekly-report h1{margin:0;padding:20px 24px;background:#785ed8;color:#fff;text-align:center;font-size:28px;font-weight:700}
.weekly-report .report-meta{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 24px;padding:12px 18px;font-size:13px}
.weekly-report section{margin:0}.weekly-report h2{margin:0;padding:7px 14px;background:#785ed8;color:#fff;font-size:18px;font-weight:700}
.weekly-report table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}
.weekly-report th,.weekly-report td{padding:9px 12px;border:1px solid #000;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}
.weekly-report th{background:#eedeee;font-weight:700}.weekly-report th:first-child,.weekly-report td:first-child{border-left:0}
.weekly-report th:last-child,.weekly-report td:last-child{border-right:0}.weekly-report .section-summary{margin:0;padding:9px 12px;background:#fff;border-bottom:1px solid #000;font-size:13px}
.weekly-report .note-row td{background:#e7e6e6}.weekly-report .status-done{color:#00b050}.weekly-report .status-risk{color:#c00000}
@media(max-width:700px){.weekly-report h1{font-size:22px;padding:16px}.weekly-report table{font-size:12px}.weekly-report th,.weekly-report td{padding:7px 5px}.weekly-report h2{font-size:16px}}
@media print{.weekly-report h1,.weekly-report h2,.weekly-report th{print-color-adjust:exact;-webkit-print-color-adjust:exact}.weekly-report section{break-inside:avoid}}
`
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  )
const cell = (value: string) => {
  const className = ['已达成', '已完成'].includes(value)
    ? 'status-done'
    : ['未达成', '阻塞'].includes(value)
      ? 'status-risk'
      : ''
  return className ? `<span class="${className}">${escape(value)}</span>` : escape(value)
}
export function renderWeeklyReport(
  document: WeeklyReportDocument | null,
  projectName = ''
): string {
  const sections = weeklyReportTemplate
    .map((definition) => {
      const note = document?.manual[definition.key]
      const rows = document?.sections[definition.key] ?? []
      const noteRow = note
        ? `<tr class="note-row"><td colspan="${definition.columns.length}">${escape(note.text)}</td></tr>`
        : ''
      const body =
        note?.mode === 'correct'
          ? noteRow
          : (rows.length
              ? rows
                  .map(
                    (row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join('')}</tr>`
                  )
                  .join('')
              : `<tr>${definition.columns.map((_column, index) => `<td>${index === 0 && definition.key !== 'milestones' ? '未知' : '—'}</td>`).join('')}</tr>`) +
            noteRow
      const summary =
        definition.key === 'problems' && note?.mode !== 'correct' && document?.problemSummary
          ? `<p class="section-summary">${escape(document.problemSummary)}</p>`
          : ''
      return `<section><h2>${definition.title}</h2>${summary}<table><colgroup>${definition.widths.map((width) => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${definition.columns.map((column) => `<th scope="col">${column}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></section>`
    })
    .join('')
  const meta = document
    ? `<div class="report-meta"><span>${weeklyReportPeriodLabel(document.period)}</span><span>${escape(document.version ?? '版本未明确')}</span></div>`
    : ''
  return `<h1>${escape(document?.project.name ?? projectName)}项目周报</h1>${meta}${sections}`
}
export function exportWeeklyReportHtml(document: WeeklyReportDocument): string {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(document.project.name)}项目周报</title><style>body{margin:24px auto;max-width:1440px;padding:0 16px}${weeklyReportTheme}</style></head><body><article class="weekly-report">${renderWeeklyReport(document)}</article></body></html>`
}
