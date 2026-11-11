import React, { useState } from 'react'
import { ChevronRight, FilePenLine } from 'lucide-react'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import { CHARTER_LABELS, type ProjectCharter } from './project-charter'
import { EDITABLE_CHARTER_FIELDS } from '../../../shared/workbench/project-charter-edit'

export function ProjectCard({
  projectName,
  charter,
  version,
  notice,
  onEdit
}: {
  projectName: string
  charter: ProjectCharter | null
  version: string | null
  /** 名片 PR 状态行(待合入/已合入未更新/没读到);无状态时不渲染。 */
  notice?: React.ReactNode
  onEdit?: () => void
}) {
  // 名片字段平时不看,默认收起为一行;展开状态不跨页保存。
  const [open, setOpen] = useState(false)
  return (
    <section className="card" id="project-card">
      <div className="wb-overview-charter-heading">
        <button
          type="button"
          className="card-toggle"
          aria-expanded={open}
          title={open ? '收起项目名片' : '展开项目名片'}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight size={14} aria-hidden className={`card-chevron${open ? ' is-open' : ''}`} />
          <span className="card-title">{projectName}</span>
          {version && <span className="wb-tag wb-tag-outline wb-mono">{version}</span>}
        </button>
        {onEdit && <WorkbenchIconButton label="编辑项目信息" icon={FilePenLine} onClick={onEdit} />}
      </div>
      {notice}
      {open && (
        <div className="detail-grid">
          {EDITABLE_CHARTER_FIELDS.filter((field) => field !== 'name').map((field) => (
            <React.Fragment key={field}>
              <div className="detail-k">{CHARTER_LABELS[field]}</div>
              <div className="detail-v">{charter?.[field]?.trim() || '—'}</div>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  )
}
