import { useAppStore } from '@/store'

/** Native owner-routed prefetch; creation awaits the same refresh and owns errors. */
export function prefetchWorkspaceCreateBase(repoId: string): void {
  void useAppStore.getState().prefetchWorktreeCreateBase(repoId)
}
