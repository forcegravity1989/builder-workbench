import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { WallProject } from './workbench-wall-projects'

/** Ensure the wall project is a ProjectGroup so a second repo can attach. */
export async function ensureWallProjectGroup(project: WallProject): Promise<string | null> {
  if (project.groupId) {
    return project.groupId
  }
  const store = useAppStore.getState()
  const primary = store.repos.find((r) => r.id === project.primaryRepoId)
  if (!primary) {
    toast.error('找不到主代码仓')
    return null
  }
  if (primary.projectGroupId) {
    return primary.projectGroupId
  }
  const group = await store.createProjectGroup(project.name || primary.displayName || '项目')
  if (!group) {
    toast.error('无法创建项目组')
    return null
  }
  const moved = await store.moveProjectToGroup(primary.id, group.id, 0)
  if (!moved) {
    toast.error('无法把现有仓放入项目组')
    return null
  }
  return group.id
}

export async function removeRepoFromWallProject(args: {
  project: WallProject
  repoId: string
}): Promise<boolean> {
  const { project, repoId } = args
  const store = useAppStore.getState()
  const slot = project.slots.find((s) => s.repoId === repoId || s.localRepoId === repoId)
  const label = slot?.name ?? '该代码仓'
  // G3:删除只解除本机注册;其他主机/其他代码仓的注册还在时,项目仍留在墙上。
  const othersRemain = project.repoIds.some((id) => id !== repoId)

  const ok = window.confirm(
    othersRemain
      ? `从本机解除代码仓「${label}」的注册？项目其余注册仍保留在墙上；不删除任何仓库文件。`
      : `「${label}」是项目里最后一个代码仓注册，删除后会从项目墙移除整个项目。确定？`
  )
  if (!ok) {
    return false
  }

  await store.removeProject(repoId, { errorFeedback: 'toast' })

  if (project.groupId) {
    const remaining = useAppStore
      .getState()
      .repos.filter((r) => r.projectGroupId === project.groupId)
    if (remaining.length === 0) {
      await store.deleteProjectGroup(project.groupId)
    }
  }
  return true
}
