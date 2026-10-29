import { prState, archivePull } from './overview-data.js'
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies
const hour = 3600000
// Simulation only; production derives these points from explicit source records.
const origin = Date.parse('2026-10-26T09:00:00+08:00')
const duration = 272
const at = (hours) => origin + hours * hour
const stamp = (value) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(value)
const position = (value) => `${(value / duration) * 100}%`

function sample(unregistered) {
  const phases = [
    {
      id: 'intent',
      start: 0,
      end: 32,
      short: '意图收敛',
      title: '周期起点 → 计划 PR 合入确认意图'
    },
    { id: 'design', start: 32, end: 56, short: '设计评审', title: '意图确认 → 设计 PR 合入定稿' },
    {
      id: 'build',
      start: 56,
      end: 80,
      short: '开发',
      title: '设计定稿 → 开发 PR 合入交付；无可识别开发 PR 时以特性 Issue 关闭兜底'
    },
    {
      id: 'verify',
      start: 80,
      end: unregistered ? duration : 104,
      short: '测试准备',
      title: unregistered
        ? 'Pre 未记录；这一段仅计至模拟观察时点，不代表测试已结束'
        : '开发交付 → 首次交付；含测试、出包与等待'
    },
    ...(!unregistered
      ? [
          {
            id: 'trial',
            start: 104,
            end: duration,
            short: '试用完善',
            title: 'Pre → 后续版本验收 PR 合入，按目标达成推导 Release'
          }
        ]
      : [])
  ]
  return {
    phases,
    releases: unregistered
      ? [
          {
            at: 104,
            version: 'v1.0',
            delivery: '本特性未交付',
            id: 'verify',
            hint: '模拟：本版验收 PR 已合入，但目标未达成；没有后续补发登记，不生成 Pre／Release。'
          }
        ]
      : [
          {
            at: 104,
            version: 'v1.0',
            delivery: 'Pre',
            id: 'verify',
            hint: '模拟：正式计划关联本特性，目标达成，验收 PR 在此时合入；推导首次交付。'
          },
          {
            at: duration,
            version: 'v1.1',
            delivery: 'Release',
            id: 'trial',
            hint: '模拟：再次计划关联且目标达成，后续验收 PR 在此时合入；推导第二次交付。'
          }
        ]
  }
}

function EvidenceSources({ feature, selected }) {
  const version = feature.historical ? 'v0.7' : 'v0.8'
  // View references can later come from an Issue or Release reader without changing this row.
  const sources =
    feature.sources ??
    [
      { phase: 'intent', label: '计划 PR', item: archivePull(version, 'plan') },
      { phase: 'design', label: '设计 PR', item: feature.designPR },
      { phase: 'build', label: '开发 PR', item: feature.developmentPR },
      { phase: 'verify', label: 'Pre 验收 PR', item: feature.prePR },
      { phase: 'trial', label: 'Release 验收 PR', item: feature.releasePR }
    ].map(({ phase, label, item }) => ({
      phase,
      label: item ? `${label} #${item.number}` : `${label} · 未记录`,
      href: item?.url,
      state: item?.state ? prState(item) : null
    }))
  return (
    <div className="ov-artifact-links" aria-label="采集来源">
      <span className="muted">采集来源</span>
      {sources.map((source) => (
        <span
          className={`ov-artifact-chip ${source.phase === selected ? 'active' : ''}`}
          key={source.phase}
        >
          {source.href ? (
            <a href={source.href} target="_blank" rel="noreferrer">
              <strong>{source.label}</strong>
              {source.state && <span>{source.state}</span>}
              <span>↗</span>
            </a>
          ) : (
            <span className="ov-source-unknown" title="尚未读取到对应来源，不补造链接">
              {source.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

export function FeatureTimeline({ feature }) {
  const [unregistered, setUnregistered] = useState(false)
  const [selected, setSelected] = useState('design')
  const { phases, releases } = sample(unregistered)
  const markers = [
    { id: 'intent', h: 0, label: '周期起点' },
    { id: 'intent', h: 32, label: '意图确认' },
    { id: 'design', h: 56, label: '设计定稿' },
    { id: 'build', h: 80, label: '开发交付' }
  ]
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>特性历程与版本交付</strong>
      </div>
      <p className="ov-demo-warning">
        原型注释:
        轴上时刻与版本均为模拟，下方来源行保留真实记录。未登记的临时出包无法自动感知；只有明确的版本计划、特性关联、目标达成和验收
        PR 合入，才生成交付节点。
      </p>
      <div className="ov-time-legend">
        <label>
          原型注释: 示例路径{' '}
          <select
            aria-label="模拟交付路径"
            value={unregistered ? 'unregistered' : 'planned'}
            onChange={(event) => {
              setUnregistered(event.target.value === 'unregistered')
              setSelected('design')
            }}
          >
            <option value="planned">按计划随版</option>
            <option value="unregistered">错过目标版，补发未登记</option>
          </select>
        </label>
        <span>北京时间 UTC+08:00 · 日历历时</span>
      </div>
      <div className="ov-journey-scroll" tabIndex={0} aria-label="特性时间轴，可横向滚动">
        <div className="ov-journey-canvas">
          <div className="ov-journey-scale">
            {releases.map((item, index) => (
              <button
                key={item.version}
                className={`ov-project-release ${!unregistered && index === releases.length - 1 ? 'last' : ''}`}
                style={{ left: position(item.at) }}
                aria-pressed={selected === item.id}
                title={item.hint}
                onClick={() => setSelected(item.id)}
              >
                <strong>
                  {item.version} · {item.delivery}
                </strong>
                <time>{stamp(at(item.at))}</time>
              </button>
            ))}
            {markers.map((marker, index) => (
              <button
                key={marker.label}
                className={`ov-merge-point ${index === 0 ? 'first' : ''} ${index % 2 ? 'lower' : ''}`}
                style={{ left: position(marker.h) }}
                title={`${marker.label} · ${stamp(at(marker.h))}`}
                onClick={() => setSelected(marker.id)}
              >
                <strong>{marker.label}</strong>
                <time>{stamp(at(marker.h))}</time>
              </button>
            ))}
            <div className="ov-range-track">
              {phases.map((item) => (
                <button
                  key={item.id}
                  className="ov-phase-range"
                  style={{ left: position(item.start), width: position(item.end - item.start) }}
                  aria-label={`${item.title}，${stamp(at(item.start))} 至 ${stamp(at(item.end))}，${item.end - item.start} 小时`}
                  aria-pressed={selected === item.id}
                  title={`${item.title} · ${item.end - item.start} 小时（含等待）`}
                  onClick={() => setSelected(item.id)}
                >
                  <strong>{item.short}</strong>
                  <span>{item.end - item.start} 小时</span>
                </button>
              ))}
            </div>
            <div className="ov-hour-ticks">
              {[0, 48, 96, 144, 192, 240, duration].map((h, index) => (
                <time
                  key={h}
                  className={index === 0 ? 'first' : index === 6 ? 'last' : ''}
                  style={{ left: position(h) }}
                >
                  {stamp(at(h))
                    .split(' ')
                    .map((part, i) => (
                      <span key={i}>{part}</span>
                    ))}
                </time>
              ))}
            </div>
          </div>
        </div>
      </div>
      {unregistered && (
        <p className="muted" role="status">
          Pre／Release 未记录：尚无可核对的补发版本关联与验收 PR。
        </p>
      )}
      <EvidenceSources feature={feature} selected={selected} />
    </div>
  )
}
