import { useAppStore } from '@/store'
import { isWorkbenchShell } from './is-workbench-shell'
import { useProjectPage } from './project-page-state'

/**
 * #475 A 定稿：第二列只服务对象上下文（版本工作区 / Orca 项目工作区）。
 * 项目总览、任务（未带版本）、自动化、知识库是整页入口，第二列收起、内容区占满。
 * 非 BW 壳始终保留原生侧栏。
 */
export function useWorkbenchObjectContext(): boolean {
  const activeView = useAppStore((s) => s.activeView)
  const taskScope = useAppStore((s) => s.taskPageData.workbenchTaskScope ?? null)
  const projectPage = useProjectPage()

  if (!isWorkbenchShell()) {
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
