export function clipboardImageItem(data: DataTransfer | null): DataTransferItem | undefined {
  return Array.from(data?.items ?? []).find(
    (item) => item.kind === 'file' && item.type.startsWith('image/')
  )
}
