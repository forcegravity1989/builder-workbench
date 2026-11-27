import type { Editor } from '@tiptap/react'
import { toast } from 'sonner'
import { clipboardImageItem } from '@/lib/clipboard/images/clipboard-image-item'
import { blobToBase64, convertImageBlobToPng } from '@/lib/clipboard/images/image-blob-png'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { useAppStore } from '@/store/index'
import { requireRuntimeTargetForFileOwner } from '@/lib/files/access/file-owner-runtime-target'
import { extractIpcErrorMessage } from './rich-markdown-ipc-error-message'
import { insertRichMarkdownImageFromPath } from './rich-markdown-image-insert'
import { captureRichMarkdownImageInsertionTarget } from './rich-markdown-image-insertion-target'
import { showRichMarkdownImageInsertionCanceled } from './rich-markdown-image-insertion-feedback'
import { translate } from '@/i18n/i18n'

export type RichMarkdownImagePasteArgs = {
  editor: Editor | null
  event: ClipboardEvent
  filePath: string
  worktreeId: string | null
  runtimeEnvironmentId?: string | null
}

export function handleRichMarkdownImagePaste({
  editor,
  event,
  filePath,
  worktreeId,
  runtimeEnvironmentId
}: RichMarkdownImagePasteArgs): boolean {
  const image = clipboardImageItem(event.clipboardData)
  if (!editor || !image) {
    return false
  }

  event.preventDefault()
  const target = captureRichMarkdownImageInsertionTarget(editor)
  if (!target) {
    return true
  }

  void saveClipboardImageForMarkdownPaste(image.getAsFile(), worktreeId, runtimeEnvironmentId)
    .then((sourcePath) => {
      if (!target.getRange()) {
        showRichMarkdownImageInsertionCanceled()
        return
      }
      return insertRichMarkdownImageFromPath({
        editor,
        filePath,
        sourcePath,
        worktreeId,
        runtimeEnvironmentId,
        getInsertionRange: target.getRange
      })
    })
    .catch((err) => {
      toast.error(
        extractIpcErrorMessage(
          err,
          translate(
            'auto.components.editor.useLocalImagePick.175cb8b8ce',
            'Failed to insert image.'
          )
        )
      )
    })
    .finally(target.dispose)

  return true
}

async function saveClipboardImageForMarkdownPaste(
  file: File | null,
  worktreeId: string | null,
  runtimeEnvironmentId?: string | null
): Promise<string> {
  const hasRuntimeOwner =
    requireRuntimeTargetForFileOwner(useAppStore.getState(), worktreeId, runtimeEnvironmentId)
      .kind === 'environment'
  // Runtime clipboard imports belong on the runtime host; SSH temp saves would place them on the wrong machine.
  const connectionId = hasRuntimeOwner ? undefined : (getConnectionId(worktreeId) ?? undefined)

  const path = await window.api.ui.saveClipboardImageAsTempFile({ connectionId })
  if (path) {
    return path
  }
  if (!file) {
    throw new Error(
      translate('auto.components.editor.useLocalImagePick.175cb8b8ce', 'Failed to insert image.')
    )
  }
  const png = await convertImageBlobToPng(file, { downscaleToFit: true })
  return callRuntimeRpc<string>({ kind: 'local' }, 'clipboard.saveImageAsTempFile', {
    contentBase64: await blobToBase64(png),
    connectionId
  })
}
