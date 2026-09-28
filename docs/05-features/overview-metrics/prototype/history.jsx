import { React, useState } from 'react'
import { historyData } from './snapshot.js'
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ExternalLink
} from 'lucide-react'

function VersionSummary({
  planMinutes,
  acceptanceDrafts,
  selection,
  setSelection,
  onPlan,
  onAcceptance
}) {
  const [expanded, setExpanded] = useState(false),
    { version, week } = selection
  const versions = [...new Set(historyData.map((r) => r.version))],
    records = historyData.filter((r) => r.version === version),
    weeks = [...new Set(records.map((r) => r.week))]
  const rows = records.filter((r) => r.week === week),
    plan = rows.find((r) => r.kind === '计划纪要'),
    archivedAcceptance = rows.find((r) => r.kind === '验收总结'),
    acceptance =
      acceptanceDrafts[version]?.week === week ? acceptanceDrafts[version] : archivedAcceptance,
    extras = rows.filter((r) => !['计划纪要', '验收总结'].includes(r.kind))
  const planText = version === 'v0.5' ? planMinutes : plan?.text || '',
    titles = planText.split('\n').filter((line) => /^\d+\. /.test(line))
  function select(version, week) {
    setSelection({
      version,
      week: week || historyData.find((r) => r.version === version).week
    })
    setExpanded(false)
  }
  return (
    <section className="ov8-version" aria-label="版本计划与验收">
      <header>
        <h2>版本计划与验收</h2>
        <nav className="tabs" role="tablist" aria-label="总览版本">
          {versions.map((v) => (
            <button
              className="tab"
              role="tab"
              aria-selected={v === version}
              key={v}
              onClick={() => select(v)}
            >
              {v}
            </button>
          ))}
        </nav>
        <div className="ov8-weeks">
          {weeks.map((w) =>
            weeks.length > 1 ? (
              <button key={w} aria-pressed={w === week} onClick={() => select(version, w)}>
                {w}
              </button>
            ) : (
              <span key={w}>{w}</span>
            )
          )}
        </div>
        <button
          className="btn btn-ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起全文' : '纪要全文'}
          <ChevronDown />
        </button>
      </header>
      <div className="ov8-summaries">
        <article aria-label="计划摘要">
          <div className="ov8-summary-heading">
            <CalendarRange />
            <h3>计划</h3>
            <span>{plan?.status || '暂无记录'}</span>
            {version === 'v0.5' && (
              <button className="btn btn-ghost" onClick={onPlan}>
                进入计划
                <ChevronRight />
              </button>
            )}
          </div>
          {plan ? (
            <ol>
              {titles.map((t, i) => (
                <li key={i}>{t.replace(/^\d+\. /, '')}</li>
              ))}
            </ol>
          ) : (
            <p className="ov8-empty">本周尚无计划纪要</p>
          )}
        </article>
        <article aria-label="验收摘要">
          <div className="ov8-summary-heading">
            <ClipboardCheck />
            <h3>验收</h3>
            <span>{acceptance?.status || '暂无记录'}</span>
            {['v0.4', 'v0.5'].includes(version) && (
              <button className="btn btn-ghost" onClick={() => onAcceptance(version, week)}>
                进入验收
                <ChevronRight />
              </button>
            )}
          </div>
          {acceptance ? (
            <p className="ov8-summary-text">{acceptance.summary}</p>
          ) : (
            <p className="ov8-empty">本周尚无验收纪要</p>
          )}
          {acceptance !== archivedAcceptance && archivedAcceptance?.source && (
            <a
              className="history-source"
              href={archivedAcceptance.source}
              target="_blank"
              rel="noreferrer"
            >
              历史原文
              <ExternalLink />
            </a>
          )}
          {extras.map((r) => (
            <p className="ov8-extra" key={r.id}>
              <span>{r.kind} · </span>
              {r.summary}
              <a href={r.source} target="_blank" rel="noreferrer">
                来源
                <ExternalLink />
              </a>
            </p>
          ))}
        </article>
      </div>
      {expanded && (
        <div className="ov8-full-records">
          {[
            [plan, '计划纪要', planText],
            [acceptance, '验收纪要', acceptance?.text]
          ].map(([record, label, text]) => (
            <article key={label}>
              <h3>{label}</h3>
              {record ? (
                <>
                  <pre>{text}</pre>
                  {record.source && (
                    <a href={record.source} target="_blank" rel="noreferrer">
                      原始材料
                      <ExternalLink />
                    </a>
                  )}
                </>
              ) : (
                <p>暂无记录</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
export { VersionSummary }
