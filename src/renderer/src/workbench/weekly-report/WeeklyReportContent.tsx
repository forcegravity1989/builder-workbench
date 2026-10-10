import type { WeeklyReportDocument } from '../../../../shared/workbench/weekly-report'
import {
  renderWeeklyReport,
  weeklyReportTheme
} from '../../../../shared/workbench/weekly-report-format'

export { exportWeeklyReportHtml } from '../../../../shared/workbench/weekly-report-format'
export function WeeklyReportContent({
  document,
  projectName
}: {
  document: WeeklyReportDocument | null
  projectName?: string
}) {
  return (
    <>
      <style>{weeklyReportTheme}</style>
      <article
        className="weekly-report"
        aria-label="项目周报"
        dangerouslySetInnerHTML={{ __html: renderWeeklyReport(document, projectName) }}
      />
    </>
  )
}
