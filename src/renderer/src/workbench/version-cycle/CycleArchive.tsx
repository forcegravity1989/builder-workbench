import type { Ref } from 'react'
import { GitPullRequest } from 'lucide-react'
import type { ArchiveStatus } from './ports'
export function CycleArchive({
  status,
  archived,
  disabled,
  sectionRef,
  onArchive
}: {
  status: ArchiveStatus
  archived: boolean
  disabled: boolean
  sectionRef: Ref<HTMLElement>
  onArchive(): void
}) {
  const label = archived
    ? '当前材料已归档'
    : status.kind === 'changed'
      ? '当前材料待归档'
      : status.kind === 'open'
        ? '归档评审进行中'
        : status.kind === 'unknown'
          ? '归档状态待核对'
          : '提交当前材料，发起 PR 供评审。'
  return (
    <section className="vp-archive-card" aria-label="归档" ref={sectionRef}>
      <GitPullRequest size={16} />
      <p title={status.kind === 'unknown' ? status.reason : undefined}>
        {label}
        {'url' in status && (
          <>
            {' '}
            ·{' '}
            <a href={status.url} target="_blank" rel="noreferrer">
              查看评审
            </a>
          </>
        )}
      </p>
      <button className="wb-btn wb-btn-sm" disabled={disabled || archived} onClick={onArchive}>
        归档
      </button>
    </section>
  )
}
