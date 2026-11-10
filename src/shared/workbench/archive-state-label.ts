import type { ArchivePrStatusResult } from './archive-pr-status'

export function archiveStateLabel(status: ArchivePrStatusResult | null): string {
  switch (status?.state) {
    case 'merged':
      return '已合入'
    case 'open':
      return '待合入'
    case 'closed':
      return '已关闭'
    default:
      return '状态未知'
  }
}
