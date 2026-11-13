import React, { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'
import {
  getRepoExecutionHostId,
  getSshTargetIdForExecutionHost,
  isRuntimeOwnedSshTargetId,
  normalizeExecutionHostId,
  parseExecutionHostId
} from '../../../../shared/execution-host'

// Why: interpolated into the sentence so locales control where the name sits;
// U+0000 cannot appear in a real project name, so the split is unambiguous.
const NAME_TOKEN = '\u0000'

const RemoveFolderDialog = React.memo(function RemoveFolderDialog() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const removeProject = useAppStore((s) => s.removeProject)

  const isOpen = activeModal === 'confirm-remove-folder'
  const repoId = typeof modalData.repoId === 'string' ? modalData.repoId : ''
  const displayName = typeof modalData.displayName === 'string' ? modalData.displayName : ''
  const hostId = normalizeExecutionHostId(
    typeof modalData.hostId === 'string' ? modalData.hostId : null
  )
  const workbench = isWorkbenchShell()
  const selectedRepo = useAppStore((s) =>
    hostId ? findRepoForHost(s.repos, repoId, { hostId }) : null
  )
  const hostLabel = useAppStore((s) =>
    workbench && hostId ? selectExecutionHostDisplayLabel(s, hostId) : null
  )
  const targetUnavailable = workbench && !selectedRepo

  // Why: for an SSH project the files live on the remote host's disk, not the
  // user's — "still on your disk" would be misleading. Name the host (using the
  // removed-target label when it's a ghost) so the user knows where it remains
  // and that re-adding that host recovers it.
  const sshConnectionId = useAppStore(
    (s) =>
      (workbench && hostId ? getSshTargetIdForExecutionHost(hostId) : null) ??
      s.repos
        .find((repo) => repo.id === repoId && (!hostId || getRepoExecutionHostId(repo) === hostId))
        ?.connectionId?.trim() ??
      null
  )
  const sshHostLabel = useAppStore((s) => {
    if (!sshConnectionId) {
      return null
    }
    return (
      s.sshTargetLabels.get(sshConnectionId) ??
      s.removedSshTargetLabels.get(sshConnectionId) ??
      sshConnectionId
    )
  })

  // Why: fragment concatenation around the styled name cannot be reordered by
  // SOV locales (#9294). Translate one full sentence with the name as a
  // sentinel token, then split on it to re-apply the inline emphasis.
  const description =
    workbench && parseExecutionHostId(hostId)?.kind === 'runtime'
      ? translate(
          'auto.components.sidebar.RemoveFolderDialog.removeDescriptionRuntime',
          'Remove the registration for {{name}} on this host. Its files stay on that host.',
          { name: NAME_TOKEN }
        )
      : isRuntimeOwnedSshTargetId(sshConnectionId)
        ? translate(
            'auto.components.sidebar.RemoveFolderDialog.removeDescriptionVmRecipe',
            'This removes {{name}} from Orca. Its VM recipe determines whether the environment and its files are permanently deleted.',
            { name: NAME_TOKEN }
          )
        : sshHostLabel
          ? translate(
              'auto.components.sidebar.RemoveFolderDialog.removeDescriptionSsh',
              'This only removes {{name}} from Orca. Its files stay on {{host}} — re-add that SSH host to recover it.',
              { name: NAME_TOKEN, host: sshHostLabel }
            )
          : translate(
              'auto.components.sidebar.RemoveFolderDialog.removeDescriptionLocal',
              'This only removes {{name}} from Orca. It is still on your disk.',
              { name: NAME_TOKEN }
            )
  const [descriptionBeforeName, descriptionAfterName] = description.split(NAME_TOKEN)

  const handleConfirm = useCallback(() => {
    if (repoId && !targetUnavailable) {
      void removeProject(repoId, {
        ...(hostId ? { hostId } : {}),
        errorFeedback: 'toast'
      })
    }
    closeModal()
  }, [closeModal, hostId, removeProject, repoId, targetUnavailable])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.RemoveFolderDialog.b79b39d865', 'Remove Project')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {targetUnavailable ? (
              translate(
                'auto.components.sidebar.RemoveFolderDialog.registrationUnavailable',
                'This project registration is no longer available. Check the project list.'
              )
            ) : (
              <>
                {descriptionBeforeName}
                <span className="break-all font-medium text-foreground">{displayName}</span>
                {descriptionAfterName}
              </>
            )}
            {workbench && selectedRepo && hostLabel && (
              <span className="mt-2 block break-all font-medium text-foreground">
                {hostLabel} · {selectedRepo.path}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {translate('auto.components.sidebar.RemoveFolderDialog.d36883e046', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={targetUnavailable}>
            {translate('auto.components.sidebar.RemoveFolderDialog.4dc5b5065b', 'Remove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

export default RemoveFolderDialog
