import type { ArchivePrStatusResult } from './archive-pr-status'

export function archiveStateLabel(status: ArchivePrStatusResult | null): string {
  switch (status?.state) {
    case 'merged':
      return '已合入'
    case 'open':
      return '待合入'
    case 'closed':
      return '已关闭'
    case 'unknown':
    case undefined:
      return '状态未知'
  }
}
