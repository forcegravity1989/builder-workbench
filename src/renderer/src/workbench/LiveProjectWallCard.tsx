import { useEffect, type ComponentProps } from 'react'
import { toast } from 'sonner'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
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
  const { source, readings, refreshing, failed } = useWallReadings(props.card.primaryRepo, refresh)
  const projectKey = props.card.project.key
  useEffect(() => {
    onReadStatus(projectKey, { refreshing, failed })
  }, [onReadStatus, projectKey, refreshing, failed])
  useEffect(() => () => onReadStatus(projectKey, null), [onReadStatus, projectKey])
  return (
    <ProjectWallCard
      {...props}
      card={{ ...props.card, readings }}
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
          if (!source || readings.kind !== 'version') {
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
              repoId: source.id,
              hostId: getRepoExecutionHostId(source),
              version,
              workflow: stage
            })
          }
        })
      }
    />
  )
}
