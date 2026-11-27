import { useAppStore } from '@/store'
import { buildWallHostFact } from './wall-host-facts'
import { useEffect, type ComponentProps } from 'react'
import { toast } from 'sonner'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host/execution-host'
import { ProjectWallCard } from './ProjectWallCard'
import { useWallReadings } from './use-wall-readings'
import type { useWallRefresh } from './wall-refresh'
import { openProjectOverviewSource, openVersionOverview } from './project-page-state'
import { openVersionTasks } from './version-nav-actions'
import { notifyWorkbenchError } from './error-feedback'

export type WallReadStatus = { refreshing: boolean; failed: boolean }

export function LiveProjectWallCard({
  refresh,
  leave,
  onReadStatus,
  ...props
}: Omit<ComponentProps<typeof ProjectWallCard>, 'onOverview' | 'onStage'> & {
  refresh: ReturnType<typeof useWallRefresh>
  leave(action: () => void): void
  onReadStatus(key: string, status: WallReadStatus | null): void
}) {
  const { source, versionSource, catalogReaders, readings, refreshing, failed } = useWallReadings(
    props.card.primaryRepo,
    refresh
  )
  const versionHostId = versionSource ? getRepoExecutionHostId(versionSource) : null
  const sourceLabel = useAppStore((state) =>
    versionHostId && versionHostId !== LOCAL_EXECUTION_HOST_ID
      ? buildWallHostFact(
          versionHostId,
          state.runtimeEnvironments,
          state.runtimeStatusByEnvironmentId,
          state.sshTargetLabels
        ).label
      : undefined
  )
  const projectKey = props.card.project.key
  useEffect(() => {
    onReadStatus(projectKey, { refreshing, failed })
  }, [onReadStatus, projectKey, refreshing, failed])
  useEffect(() => () => onReadStatus(projectKey, null), [onReadStatus, projectKey])
  return (
    <>
      {catalogReaders}
      <ProjectWallCard
        {...props}
        card={{
          ...props.card,
          readings: readings.kind === 'version' ? { ...readings, sourceLabel } : readings
        }}
        onOpen={(repo) => props.onOpen(repo ?? source ?? props.card.primaryRepo)}
        onOverview={() =>
          leave(() => {
            if (!source) {
              toast.error('项目来源尚未就绪')
              return
            }
            openProjectOverviewSource(source)
          })
        }
        onStage={(stage) =>
          leave(() => {
            if (!versionSource || readings.kind !== 'version') {
              return
            }
            const { catalog, version } = readings
            if (stage === 'tasks') {
              void openVersionTasks({
                catalog,
                version,
                entry: catalog.catalog?.entries.find((entry) => entry.version === version) ?? null
              }).catch((error) =>
                notifyWorkbenchError('无法打开版本任务', error, '检查项目连接后重试。')
              )
            } else {
              openVersionOverview({
                repoId: versionSource.id,
                hostId: getRepoExecutionHostId(versionSource),
                version,
                workflow: stage
              })
            }
          })
        }
      />
    </>
  )
}
