import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { AppState } from '@/store/types'
import { getProjectHostSetupProjectionFromState } from '@/store/project-host-setup-selector'

export const overviewExperimentEntries = [
  {
    key: 'sdlc',
    title: 'SDLC 实际过程统计',
    description: '开启后读取所选项目的阶段证据，在版本总览中显示特性历程与来源入口。',
    keywords: ['SDLC', '阶段', '特性', '版本总览统计', '项目统计', '按项目设置', '适用项目']
  },
  {
    key: 'ai',
    title: 'AI 生产力统计',
    description: '开启后读取所选项目任务关联 PR 中的报告，在版本总览中显示生产力读数。',
    keywords: ['AI', '生产力', '报告', '版本总览统计', '项目统计', '按项目设置', '适用项目']
  }
] as const

export function overviewProjectId(state: AppState, repoId: string) {
  const { projects } = getProjectHostSetupProjectionFromState(state)
  return projects.find((project) => project.sourceRepoIds.includes(repoId) || project.id === repoId)
    ?.id
}

export function overviewExperimentEnabled(
  settings: GlobalSettings | null,
  projectId: string | undefined,
  key: 'sdlc' | 'ai'
) {
  return Boolean(projectId && settings?.workbenchOverviewByProject?.[projectId]?.[key] === true)
}
