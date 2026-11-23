import type { UISlice, UISliceGet, UISliceSet } from './ui-slice-contract'
import { settleEvictedModalData } from '../modal-slot-dismissal'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import { normalizeExecutionHostId } from '../../../../../shared/execution-host'
import { findRepoForHost } from '../repo-host-identity'

export function createUiModalActions(set: UISliceSet, get: UISliceGet): Partial<UISlice> {
  return {
    activeModal: 'none',
    modalData: {},
    openModal: (modal, data = {}) => {
      if (modal === 'add-repo' || modal === 'create-worktree') {
        get().recordFeatureInteraction?.('workspace-creation')
      }
      if (
        modal === 'confirm-remove-folder' &&
        isWorkbenchShell() &&
        typeof data.repoId === 'string' &&
        !Object.hasOwn(data, 'projectRemovalRegistration')
      ) {
        const hostId = normalizeExecutionHostId(
          typeof data.hostId === 'string' ? data.hostId : null
        )
        const repo = hostId ? findRepoForHost(get().repos, data.repoId, { hostId }) : null
        data = { ...data, projectRemovalRegistration: repo }
      }
      const evicted = get().modalData
      set({
        activeModal: modal,
        modalData: data
      })
      settleEvictedModalData(evicted)
    },
    closeModal: () => {
      const evicted = get().modalData
      set({ activeModal: 'none', modalData: {} })
      settleEvictedModalData(evicted)
    }
  }
}
