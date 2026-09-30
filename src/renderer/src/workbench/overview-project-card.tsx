import React from 'react'
import type { ProjectCharter } from './project-charter'

function charterRows(
  remote: string | null,
  c: ProjectCharter | null
): { k: string; v: string; mono?: boolean }[] {
  return [
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
  notice
}: {
  projectName: string
  charter: ProjectCharter | null
  remote: string | null
  version: string | null
  /** 名片 PR 状态行(待合入/已合入未更新/没读到);无状态时不渲染。 */
  notice?: React.ReactNode
}) {
  const rows = charterRows(remote, charter)
  return (
    <section className="card" id="project-card">
      <div className="row-between">
        <div className="row-start">
          <span className="card-title">{projectName}</span>
          <span className="status" title="健康信号未知">
            <span className="status-dot" />
            未知
          </span>
          {version && <span className="wb-tag wb-tag-outline wb-mono">{version}</span>}
        </div>
      </div>
      {notice}
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
