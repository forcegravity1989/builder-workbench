import { toast } from 'sonner'
import { sanitizeCrashReportString } from '../../../shared/crash-report-redaction'

function diagnosticText(error: unknown): string {
  const text = error instanceof Error ? (error.stack ?? error.message) : String(error ?? '')
  return sanitizeCrashReportString(text, 12_000)
}

export function ErrorDetails({
  summary = '查看详情',
  detail,
  className
}: {
  summary?: string
  detail: unknown
  className?: string
}) {
  return (
    <details className={className}>
      <summary className="cursor-pointer">{summary}</summary>
      <div className="scrollbar-sleek mt-1 max-h-48 max-w-full overflow-auto whitespace-pre-wrap break-all text-xs">
        {diagnosticText(detail)}
      </div>
    </details>
  )
}

export function logWorkbenchError(title: string, error: unknown): void {
  console.error(`[Workbench] ${title}`, diagnosticText(error))
}

export function notifyWorkbenchError(title: string, error: unknown, description?: string): void {
  logWorkbenchError(title, error)
  toast.error(title, {
    description: (
      <div>
        {description && <div>{description}</div>}
        {error != null && error !== '' && <ErrorDetails detail={error} />}
      </div>
    )
  })
}
