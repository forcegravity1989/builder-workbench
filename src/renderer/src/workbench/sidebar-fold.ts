import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { HostSectionRow } from '@/components/sidebar/host-section-rows'
import { isWorkbenchShell } from './is-workbench-shell'

const SIDEBAR_FOLD_EVENT = 'workbench:sidebar-fold'

export function requestSidebarFold(expanded: boolean): void {
  window.dispatchEvent(new CustomEvent(SIDEBAR_FOLD_EVENT, { detail: expanded }))
}

export function useSidebarFoldActions(
  getExpandedRows: () => readonly HostSectionRow[],
  setOtherProjectsExpanded: (expanded: boolean) => void
): void {
  useEffect(() => {
    if (!isWorkbenchShell()) {
      return
    }
    const onFold = (event: Event) => {
      const expanded = (event as CustomEvent<boolean>).detail
      // Build with every ancestor open so nested and offscreen groups are included.
      const keys = new Set<string>()
      for (const row of getExpandedRows()) {
        if (row.type === 'header' || row.type === 'host-header') {
          keys.add(row.key)
        } else if (row.type === 'item' && row.lineageGroupKey) {
          keys.add(row.lineageGroupKey)
        }
      }
      const next = new Set(useAppStore.getState().collapsedGroups)
      for (const key of keys) {
        if (expanded) {
          next.delete(key)
        } else {
          next.add(key)
        }
      }
      useAppStore.setState({ collapsedGroups: next })
      void window.api.ui.set({ collapsedGroups: [...next] }).catch(console.error)
      setOtherProjectsExpanded(expanded)
    }
    window.addEventListener(SIDEBAR_FOLD_EVENT, onFold)
    return () => window.removeEventListener(SIDEBAR_FOLD_EVENT, onFold)
  }, [getExpandedRows, setOtherProjectsExpanded])
}
