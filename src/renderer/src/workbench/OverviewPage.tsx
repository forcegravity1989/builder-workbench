import React, { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { OVERVIEW_DEMO } from './overview-demo-data'
import { openProjectOnboard } from './project-onboard-state'
import { readProjectCharter, type ProjectCharter } from './project-charter'
import './workbench-overview.css'

function ProgressBar(props: {
  todo: number
  doing: number
  review: number
  done: number
  blocked: number
}): React.JSX.Element {
  const total = props.todo + props.doing + props.review + props.done + props.blocked || 1
  const pct = (n: number) => `${(n / total) * 100}%`
  return (
    <div className="stack">
      <div className="prog" aria-hidden>
        <span className="prog-done" style={{ width: pct(props.done) }} />
        <span className="prog-review" style={{ width: pct(props.review) }} />
        <span className="prog-doing" style={{ width: pct(props.doing) }} />
        <span className="prog-todo" style={{ width: pct(props.todo) }} />
        <span
          className="prog-doing"
          style={{ width: pct(props.blocked), background: 'var(--color-danger)' }}
        />
      </div>
      <div className="counts">
        <span>
          待办 <b>{props.todo}</b>
        </span>
        <span>
          进行中 <b>{props.doing}</b>
        </span>
        <span>
          待评审 <b>{props.review}</b>
        </span>
        <span>
          完成 <b>{props.done}</b>
        </span>
        <span>
          阻塞 <b>{props.blocked}</b>
        </span>
      </div>
    </div>
  )
}

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

/** Scoreboard: charter from `.bw/project.toml` when present; versions still demo. */
export function OverviewPage(): React.JSX.Element {
  const openArtifactsPage = useAppStore((s) => s.openArtifactsPage)
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const activeRepo = repos.find((r) => r.id === activeRepoId) ?? repos[0]
  const [charter, setCharter] = useState<ProjectCharter | null>(null)
  const [verId, setVerId] = useState<(typeof OVERVIEW_DEMO.versions)[number]['id']>(
    OVERVIEW_DEMO.versions[0].id
  )
  const version = OVERVIEW_DEMO.versions.find((v) => v.id === verId) ?? OVERVIEW_DEMO.versions[0]

  useEffect(() => {
    if (!activeRepo?.path) {
      setCharter(null)
      return
    }
    let cancelled = false
    void readProjectCharter(activeRepo.path).then((r) => {
      if (!cancelled) {
        setCharter(r.charter)
      }
    })
    return () => {
      cancelled = true
    }
  }, [activeRepo?.path])

  if (!activeRepo) {
    return (
      <div className="wb-ov">
        <header className="page-head">
          <h1>总览</h1>
        </header>
        <div className="content">
          <section className="card" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14 }}>还没有接入项目。</p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, opacity: 0.65 }}>
              点左上角项目名打开项目墙，再「+ 接入项目」。
            </p>
            <button
              type="button"
              className="wb-btn wb-btn-primary"
              onClick={() => openProjectOnboard()}
            >
              + 接入项目
            </button>
          </section>
        </div>
      </div>
    )
  }

  const projectName = charter?.name?.trim() || activeRepo.displayName || OVERVIEW_DEMO.projectName
  const rows = charterRows(projectName, charter)

  return (
    <div className="wb-ov">
      <header className="page-head">
        <h1>总览</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="wb-btn wb-btn-secondary wb-btn-sm">
            刷新
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-primary wb-btn-sm"
            onClick={() => openArtifactsPage()}
          >
            去计划屏
          </button>
        </div>
      </header>

      <div className="content">
        <div className="row-2">
          <section className="card" id="project-card">
            <div className="row-between">
              <div className="row-start">
                <span className="card-title">{projectName}</span>
                <span className="status" title="北极星指标无读数，健康信号保持未知">
                  <span className="status-dot" />
                  {OVERVIEW_DEMO.healthLabel}
                </span>
                <span className="wb-tag wb-tag-outline wb-mono">{OVERVIEW_DEMO.versionChip}</span>
              </div>
              <button type="button" className="wb-btn wb-btn-ghost wb-btn-sm">
                编辑
              </button>
            </div>
            <div className="detail-grid">
              {rows.map((row) => (
                <React.Fragment key={row.k}>
                  <div className="detail-k">{row.k}</div>
                  <div className={`detail-v${'mono' in row && row.mono ? ' mono' : ''}`}>
                    {row.v}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </section>

          <section className="card">
            <span className="card-kicker">北极星指标</span>
            <span className="card-title">
              {charter?.opportunity?.trim() ||
                (charter ? '（还没填目标方向）' : OVERVIEW_DEMO.northStar.name)}
            </span>
            <div className="row-start">
              <h2 className="metric-value">{OVERVIEW_DEMO.northStar.value}</h2>
              <span className="metric-target">{OVERVIEW_DEMO.northStar.target}</span>
              <span className="wb-tag wb-tag-neutral">{OVERVIEW_DEMO.northStar.status}</span>
            </div>
          </section>
        </div>

        <section className="card" id="version-card">
          <div className="card-head">
            <div className="row-between">
              <h6>版本计划与进展</h6>
              <span
                className={`wb-tag ${version.state === '进行中' ? 'wb-tag-warning' : 'wb-tag-success'}`}
              >
                {version.state}
              </span>
            </div>
            <div className="tabs" role="tablist" aria-label="版本">
              {OVERVIEW_DEMO.versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="tab"
                  role="tab"
                  aria-selected={v.id === verId}
                  onClick={() => setVerId(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="goal-week">
            <div>
              <span className="card-kicker">版本目标</span>
              <div className="text-box">{version.goal}</div>
            </div>
            <div>
              <span className="card-kicker">每周进展</span>
              <div className="text-box">{version.weekNote}</div>
            </div>
          </div>
          <ProgressBar {...version.counts} />
        </section>
      </div>
    </div>
  )
}
