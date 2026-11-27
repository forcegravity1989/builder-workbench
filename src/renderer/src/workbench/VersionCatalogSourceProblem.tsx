import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { useAppStore } from '@/store'
import type { ExecutionHostId } from '../../../shared/execution-host/execution-host'
import { ErrorDetails } from './error-feedback'

export function VersionCatalogSourceProblem({
  hostId,
  errors,
  loading,
  retry
}: {
  hostId: ExecutionHostId
  errors: readonly string[]
  loading: boolean
  retry: () => void
}) {
  const label = useAppStore((state) => selectExecutionHostDisplayLabel(state, hostId))
  return (
    <div className="px-2 py-1 text-[11px] text-muted-foreground">
      <ErrorDetails summary={`${label} 的版本暂未读全`} detail={errors.join('\n')} />
      <button
        type="button"
        className="underline disabled:opacity-50"
        disabled={loading}
        onClick={retry}
        aria-label={`重试读取 ${label} 的版本`}
      >
        重试
      </button>
    </div>
  )
}
