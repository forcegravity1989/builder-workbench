import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'

/**
 * BW establishes the project-local worktree base once per project when unset, so fixed
 * trees land inside the project instead of the global Orca workspace root. The outcome
 * is announced through the given notice channel; the setting stays user-editable.
 * Returns whether the base decision has settled; callers gate worktree setup on it so
 * a mid-flight settings write cannot race the first fixed-tree create.
 */
export function useAutoWorktreeBase(
  activeRepoId: string | null,
  configuredBase: string | null,
  onNotice: (message: string) => void
): boolean {
  const tried = useRef<string | null>(null)
  const [settledRepo, setSettledRepo] = useState<string | null>(null)
  useEffect(() => {
    if (!activeRepoId) {
      return
    }
    if (configuredBase) {
      return
    }
    if (tried.current === activeRepoId) {
      return
    }
    tried.current = activeRepoId
    void useAppStore
      .getState()
      .updateRepo(activeRepoId, { worktreeBasePath: '.bw/worktrees' })
      .then(() => {
        setSettledRepo(activeRepoId)
        onNotice(
          '已为本项目设单仓工作树基址 `.bw/worktrees`（工作树落项目目录内），可在 设置 > Repository worktree defaults 修改或清空'
        )
      })
      .catch(() => {
        setSettledRepo(activeRepoId)
        onNotice(
          '单仓工作树基址设置失败，固定树仍按 Orca 全局默认；可在 设置 > Repository worktree defaults 手动设置'
        )
      })
  }, [activeRepoId, configuredBase, onNotice])
  return !activeRepoId || Boolean(configuredBase) || settledRepo === activeRepoId
}
