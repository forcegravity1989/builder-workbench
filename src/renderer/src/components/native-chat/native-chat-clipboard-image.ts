/** Accept native pane clipboard events and React synthetic events. */
export type ClipboardEventLike = {
  clipboardData: DataTransfer | null
  preventDefault: () => void
  defaultPrevented: boolean
}

export function clipboardEventImageFile(event: ClipboardEventLike): File | null {
  const data = event.clipboardData
  if (!data) {
    return null
  }
  const item = Array.from(data.items).find((candidate) => candidate.type.startsWith('image/'))
  return item?.getAsFile() ?? null
}
