import { ModelSessionIcon } from '../../version-planning/prototype/shared.jsx'
import { React, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { facts } from './snapshot.js'

function MetricDetails({ detail, onPrepare, setDetail }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => previous?.focus()
  }, [])
  const titles = { commits: '提交', prs: '合入 PR', issues: '开放 Issue', source: '数据来源' }
  return (
    <dialog
      ref={dialog}
      className="dialog ov-details"
      aria-label={detail.metric?.name || titles[detail.kind]}
      onCancel={() => setDetail(null)}
      onClick={(event) => {
        if (event.target === dialog.current) {
          setDetail(null)
        }
      }}
    >
      <header>
        <h2>{detail.metric?.name || titles[detail.kind]}</h2>
        <button
          autoFocus
          className="btn btn-ghost btn-icon"
          aria-label="关闭详情"
          onClick={() => setDetail(null)}
        >
          <X />
        </button>
      </header>
      {detail.metric ? (
        <>
          <dl>
            <dt>定义</dt>
            <dd>{detail.metric.definition}</dd>
            <dt>归属</dt>
            <dd>
              {detail.metric.feature || '主要'} ·{' '}
              {detail.metric.type === 'leading' ? '引领指标' : '滞后指标'}
            </dd>
            {detail.metric.leads && (
              <>
                <dt>引领对象</dt>
                <dd>{detail.metric.leads}</dd>
              </>
            )}
            <dt>长期目标</dt>
            <dd>{detail.metric.target || '未设置'}</dd>
            <dt>最近读数</dt>
            <dd>
              {detail.metric.latest
                ? `${detail.metric.latest.value} · ${detail.metric.latest.day}`
                : '未采集'}
            </dd>
            <dt>采集脚本</dt>
            <dd>
              <code>{detail.metric.script || '未设置'}</code>
            </dd>
          </dl>
          <button
            className="btn btn-secondary"
            onClick={() => {
              const metric = detail.metric
              setDetail(null)
              onPrepare(metric)
            }}
          >
            <ModelSessionIcon /> 配置指标
          </button>
        </>
      ) : (
        <div className="ov-source-detail">
          {(detail.kind === 'commits' || detail.kind === 'source') && (
            <p>
              <b>提交</b>　bw-orca 可达历史，按提交时间统计，包含合并提交。
            </p>
          )}
          {(detail.kind === 'prs' || detail.kind === 'source') && (
            <p>
              <b>合入 PR</b>　GitHub 全仓已合入 PR，按真实合入时间统计。
            </p>
          )}
          {(detail.kind === 'issues' || detail.kind === 'source') && (
            <p>
              <b>开放 Issue</b>　排除 PR。此快照只有当前数量，历史点留空。
            </p>
          )}
          {detail.kind === 'source' && (
            <p>
              <b>业务指标</b>　沿用原评审包的定义，暂无实测读数。北极星待定义。
            </p>
          )}
          <p>UTC · {facts.readAt.slice(0, 16).replace('T', ' ')} · 本期截至采集时刻。</p>
          <p>原型使用历史快照；实时采集在产品实施后验证。</p>
        </div>
      )}
    </dialog>
  )
}
export { MetricDetails }
