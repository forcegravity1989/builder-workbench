import type { ArchiveStatus } from '../version-cycle/ports'

/**
 * The archive label reports the real read-back state: a bad provider state
 * (closed / changes-requested / checks failed) is never flattened into
 * "waiting for review", and merged-but-unproven material stays visible as 待核.
 */
export function archiveStatusLabel(
  archive: ArchiveStatus,
  archived: boolean,
  archivePending: boolean
): string {
  if (archivePending) {
    return '正在读取归档状态…'
  }
  if (archive.kind === 'unknown') {
    return `状态未知：${archive.reason}`
  }
  if (archive.kind === 'not-created') {
    return '尚未创建归档 PR'
  }
  if (archived) {
    return '当前修订已合入'
  }
  if (archive.kind === 'merged') {
    return archive.proof.kind === 'unknown' ? '已合入，当前材料待核' : '有待归档变化'
  }
  if (archive.kind === 'closed') {
    return '归档 PR 已关闭'
  }
  const issues = [
    archive.review === 'changes-requested' ? '评审请求修改' : null,
    archive.checks === 'failed' ? '检查失败' : null
  ].filter((issue): issue is string => issue !== null)
  return issues.length > 0 ? `归档 PR ${issues.join('、')}` : '归档 PR 待评审'
}
