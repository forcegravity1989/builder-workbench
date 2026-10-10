import type { EditorExternalWatchTarget } from '@/hooks/editor-external-watch-targets'
import { useAppStore } from '@/store'
import { isWorkbenchShell } from '../is-workbench-shell'
import { useProjectPage } from '../project-page-state'
import { weeklyReportFileContext } from './native-weekly-report-session'
import { useWeeklyReportWorkspace } from './use-weekly-report-workspace'

export function useWeeklyReportWatchTargets(): EditorExternalWatchTarget[] {
  const page = useProjectPage()
  const activeView = useAppStore((state) => state.activeView)
  const { workspace } = useWeeklyReportWorkspace()
  const tree = workspace.tree
  if (!isWorkbenchShell() || activeView !== 'activity' || page?.kind !== 'weekly-report' || !tree) {
    return []
  }
  try {
    const context = weeklyReportFileContext(tree)
    return [
      {
        worktreeId: tree.id,
        worktreePath: tree.path,
        connectionId: context.connectionId,
        runtimeEnvironmentId: context.settings?.activeRuntimeEnvironmentId ?? null
      }
    ]
  } catch {
    return []
  }
}
