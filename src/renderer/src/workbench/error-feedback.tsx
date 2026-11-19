import { toast } from 'sonner'
import { sanitizeCrashReportString } from '../../../shared/crash-report-redaction'
import { hasRuntimeRpcErrorCode } from '../runtime/runtime-rpc-client'

/**
 * The workspace a screen is bound to no longer resolves: version cleanup deleted its worktree
 * (or a paired owner runtime on an older build still answers with the bare native code instead
 * of the translated `workspace-gone`). Screens must stop polling and say what happened (#727);
 * a bare protocol code is not a user-readable verdict.
 */
export function isWorkspaceGoneError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return (
    code === 'workspace-gone' ||
    code === 'selector_not_found' ||
    hasRuntimeRpcErrorCode(error, 'workspace-gone') ||
    hasRuntimeRpcErrorCode(error, 'selector_not_found')
  )
}

export function workspaceGoneMessage(): string {
  return '工作区的工作树已删除；版本材料与目录已保留，可在版本总览回看，继续工作请重新准备工作区。'
}

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
  if (isWorkspaceGoneError(error)) {
    // The caller's title and retry-oriented description no longer fit: nothing at the old
    // scope can succeed, and the way forward is the version overview, not another attempt.
    toast.error('工作树已删除', {
      description: (
        <div>
          <div>{workspaceGoneMessage()}</div>
          <ErrorDetails detail={error} />
        </div>
      )
    })
    return
  }
  toast.error(title, {
    description: (
      <div>
        {description && <div>{description}</div>}
        {error != null && error !== '' && <ErrorDetails detail={error} />}
      </div>
    )
  })
}
