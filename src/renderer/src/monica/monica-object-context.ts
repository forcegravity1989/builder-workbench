import { useAppStore } from '@/store'
import { isMonicaShell } from './is-monica-shell'
import { useProjectPage } from './project-page-state'

/** Global pages use the full canvas; workspace and version pages retain the object sidebar. */
export function useMonicaObjectContext(): boolean {
  const activeView = useAppStore((s) => s.activeView)
  const taskScope = useAppStore((s) => s.taskPageData.monicaTaskScope ?? null)
  const projectPage = useProjectPage()

  if (!isMonicaShell()) {
    return true
  }
  if (activeView === 'terminal' || activeView === 'artifacts') {
    return true
  }
  if (activeView === 'activity') {
    // 版本总览挂在 activity 槽位，仍属版本对象上下文；项目墙/接入/项目总览不是。
    return projectPage?.kind === 'version-overview'
  }
  if (activeView === 'tasks') {
    return !!taskScope?.version
  }
  return false
}
