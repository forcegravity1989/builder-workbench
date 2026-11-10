import React, { useState } from 'react'
import { ChevronRight, FilePenLine } from 'lucide-react'
import { WorkbenchIconButton } from './WorkbenchIconButton'
import type { ProjectCharter } from './project-charter'

function charterRows(
  remote: string | null,
  c: ProjectCharter | null
): { k: string; v: string; mono?: boolean }[] {
  return [
    { k: '项目负责人', v: c?.owner?.trim() || '—' },
    { k: '想做什么', v: c?.brief?.trim() || '(还没填)' },
    { k: '对标', v: c?.benchmark?.trim() || '(还没填)', mono: true },
    { k: '目标方向', v: c?.opportunity?.trim() || '(还没填)' },
    { k: '项目群', v: '（未配置）' },
    { k: '仓库', v: remote || '未识别远端', mono: true }
  ]
}

export function ProjectCard({
  projectName,
  charter,
  remote,
  version,
  notice,
  onEdit
}: {
  projectName: string
  charter: ProjectCharter | null
  remote: string | null
  version: string | null
  /** 名片 PR 状态行(待合入/已合入未更新/没读到);无状态时不渲染。 */
  notice?: React.ReactNode
  onEdit?: () => void
}) {
  // 名片字段平时不看,默认收起为一行;展开状态不跨页保存。
  const [open, setOpen] = useState(false)
  const rows = charterRows(remote, charter)
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
          <span className="status" title="健康信号未知">
            <span className="status-dot" />
            未知
          </span>
          {version && <span className="wb-tag wb-tag-outline wb-mono">{version}</span>}
        </button>
        {onEdit && <WorkbenchIconButton label="编辑项目信息" icon={FilePenLine} onClick={onEdit} />}
      </div>
      {notice}
      {open && (
        <div className="detail-grid">
          {rows.map((row) => (
            <React.Fragment key={row.k}>
              <div className="detail-k">{row.k}</div>
              <div className={`detail-v${row.mono ? ' mono' : ''}`}>{row.v}</div>
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  )
}
