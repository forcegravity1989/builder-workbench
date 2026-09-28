import { React } from 'react'
import { ReactMarkdown } from 'react-markdown'
import { remarkGfm } from 'remark-gfm'
import { historyData } from './snapshot.js'

function VersionSummary({ planMinutes, acceptanceDrafts, selection, setSelection }) {
  const { version, week } = selection
  const versions = [...new Set(historyData.map((record) => record.version))]
  const records = historyData.filter((record) => record.version === version)
  const weeks = [...new Set(records.map((record) => record.week))]
  const rows = records.filter((record) => record.week === week)
  const plan = rows.find((record) => record.kind === '计划纪要')
  const archivedAcceptance = rows.find((record) => record.kind === '验收总结')
  const acceptance =
    acceptanceDrafts[version]?.week === week ? acceptanceDrafts[version] : archivedAcceptance
  const extras = rows.filter((record) => !['计划纪要', '验收总结'].includes(record.kind))
  const planText = version === 'v0.5' && plan ? planMinutes : plan?.text || ''
  function select(nextVersion, nextWeek) {
    setSelection({
      version: nextVersion,
      week: nextWeek || historyData.find((record) => record.version === nextVersion).week
    })
  }
  return (
    <section className="ov-section ov-version" aria-label="版本计划与验收">
      <header className="ov-section-head">
        <h2>版本计划与验收</h2>
        <nav className="tabs" role="tablist" aria-label="总览版本">
          {versions.map((item) => (
            <button
              className="tab"
              role="tab"
              aria-selected={item === version}
              key={item}
              onClick={() => select(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="ov-tools">
          {weeks.length > 1 ? (
            <select
              className="input ov-week"
              aria-label="纪要轮次"
              value={week}
              onChange={(event) => select(version, event.target.value)}
            >
              {weeks.map((item) => (
                <option key={item} value={item}>
                  第 {Number(item.slice(1))} 周
                </option>
              ))}
            </select>
          ) : (
            <span className="ov-period">第 {Number(week.slice(1))} 周</span>
          )}
        </div>
      </header>
      <div className="ov-minutes-grid">
        {[
          [plan, '计划', planText, version === 'v0.5' ? '草稿' : plan?.status],
          [
            acceptance,
            '验收',
            acceptance?.text,
            acceptance === archivedAcceptance ? acceptance?.status : '草稿'
          ]
        ].map(([record, title, content, status]) => (
          <article key={`${version}-${week}-${title}`} aria-label={`${title}纪要`}>
            <div className="ov-minutes-heading">
              <h3>{title}</h3>
              {record && <span className="tag tag-outline">{status}</span>}
            </div>
            <div
              className="ov-minutes-body"
              role="region"
              aria-label={`${title}纪要全文`}
              tabIndex={0}
            >
              {record ? (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
                  {record.source && (
                    <a href={record.source} target="_blank" rel="noreferrer">
                      原始记录
                    </a>
                  )}
                </>
              ) : (
                <p className="ov-empty">暂无{title}纪要</p>
              )}
            </div>
          </article>
        ))}
      </div>
      {extras.length > 0 && (
        <details className="ov-related-records">
          <summary>相关记录 · {extras.length}</summary>
          {extras.map((record) => (
            <p key={record.id}>
              <b>{record.kind}</b>　{record.summary}　
              <a href={record.source} target="_blank" rel="noreferrer">
                原文
              </a>
            </p>
          ))}
        </details>
      )}
    </section>
  )
}
export { VersionSummary }
