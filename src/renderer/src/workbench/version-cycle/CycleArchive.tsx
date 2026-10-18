import type { Ref } from 'react'
import { GitPullRequest } from 'lucide-react'
import type { ArchivePrStatusResult } from '../../../../shared/workbench/archive-pr-status'
import type { WorkflowArchivePr } from '../../../../shared/workbench/version-workflow'

/**
 * One archive status row shared by both cycle screens: the recorded archive PR
 * and its provider-reported merge state. No action button — archiving is asked
 * of the model in the session, and the lamp lives on the journey rail.
 */
export function CycleArchive({
  archivePr,
  reachedArchive,
  status,
  loading,
  sectionRef
}: {
  archivePr: WorkflowArchivePr | undefined
  reachedArchive: boolean
  status: ArchivePrStatusResult | null
  loading: boolean
  sectionRef: Ref<HTMLElement>
}) {
  const url = (() => {
    if (status && 'url' in status && status.url) {
      return status.url
    }
    if (!archivePr || (archivePr.provider !== 'github' && archivePr.provider !== 'codehub')) {
      return null
    }
    // Recorded repository may carry its host ("github.com/o/r") or not ("o/r").
    const first = archivePr.repository.split('/')[0]
    if (archivePr.provider === 'github') {
      const host = first.includes('.') ? archivePr.repository : `github.com/${archivePr.repository}`
      return `https://${host}/pull/${archivePr.number}`
    }
    if (!first.includes('.') && !first.includes(':')) {
      return null
    }
    const project = archivePr.repository
      .split('/')
      .slice(1)
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join('/')
    return project ? `https://${first}/${project}/-/merge_requests/${archivePr.number}` : null
  })()
  const label = !archivePr
    ? reachedArchive
      ? '已归档；PR 链接未记录。'
      : '尚未进入归档；在会话中请模型核对材料并提交 PR。'
    : loading || !status
      ? '正在读取归档 PR 状态…'
      : status.state === 'merged'
        ? '归档 PR 已合入。'
        : status.state === 'open'
          ? '归档 PR 待人审核合入。'
          : status.state === 'closed'
            ? '归档 PR 已关闭，未合入。'
            : `归档 PR 状态暂不可读：${status.reason}`
  return (
    <section className="vp-archive-card" aria-label="归档" ref={sectionRef}>
      <GitPullRequest size={16} />
      <p title={status?.state === 'unknown' ? status.reason : undefined}>
        {label}
        {archivePr && (
          <>
            {' '}
            ·{' '}
            {url ? (
              <a href={url} target="_blank" rel="noreferrer">
                查看评审
              </a>
            ) : (
              <span>
                {archivePr.repository} #{archivePr.number}
              </span>
            )}
          </>
        )}
      </p>
    </section>
  )
}
