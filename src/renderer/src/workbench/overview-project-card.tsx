import React from 'react'
import type { ProjectCharter } from './project-charter'

function charterRows(
  projectName: string,
  c: ProjectCharter | null
): { k: string; v: string; mono?: boolean }[] {
  return [
    { k: '想做什么', v: c?.brief?.trim() || '(还没填)' },
    { k: '对标', v: c?.benchmark?.trim() || '(还没填)', mono: true },
    { k: '目标方向', v: c?.opportunity?.trim() || '(还没填)' },
    { k: '项目群', v: '（未配置）' },
    { k: '项目名', v: c?.name?.trim() || projectName, mono: true }
  ]
}

/**
 * Project identity card. The health dot only reflects whether a north star read
 * exists — a missing reading stays Unknown, never green.
 */
export function ProjectCard({
  projectName,
  charter,
  hasReading,
  version
}: {
  projectName: string
  charter: ProjectCharter | null
  hasReading: boolean
  version: string | null
}) {
  const rows = charterRows(projectName, charter)
  return (
    <section className="card" id="project-card">
      <div className="row-between">
        <div className="row-start">
          <span className="card-title">{projectName}</span>
          <span className="status" title="健康信号只从北极星读数推导；无读数保持未知">
            <span className="status-dot" />
            {hasReading ? '有读数' : '未知'}
          </span>
          {version && <span className="wb-tag wb-tag-outline wb-mono">{version}</span>}
        </div>
      </div>
      <div className="detail-grid">
        {rows.map((row) => (
          <React.Fragment key={row.k}>
            <div className="detail-k">{row.k}</div>
            <div className={`detail-v${row.mono ? ' mono' : ''}`}>{row.v}</div>
          </React.Fragment>
        ))}
      </div>
    </section>
  )
}
